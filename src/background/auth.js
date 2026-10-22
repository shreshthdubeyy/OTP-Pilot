import { FIREFOX_DESKTOP_CLIENT_ID } from '../shared/firefox-oauth-config.js';

const SESSION_KEY = 'firefoxAccessToken';
const FIREFOX_SECRET_KEY = 'firefoxOAuthClientSecret';
const FIREFOX_AUTH_KEY = 'firefoxRememberedAuthorization';
const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';

function usesChromeIdentityTokenCache() {
  return typeof chrome.identity.getAuthToken === 'function';
}

function randomBase64Url(byteLength = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function createPkceChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  let binary = '';
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function firefoxRedirectUri() {
  const browserRedirect = new URL(chrome.identity.getRedirectURL());
  const extensionSubdomain = browserRedirect.hostname.split('.')[0];
  if (!extensionSubdomain) throw new Error('Firefox OAuth redirect is unavailable.');
  return `http://127.0.0.1/mozoauth2/${extensionSubdomain}`;
}

function validateOAuthRedirect(redirectedUrl, expectedRedirect, expectedState) {
  let returned;
  try { returned = new URL(redirectedUrl); } catch { throw new Error('Google authorization returned an invalid redirect.'); }
  const expected = new URL(expectedRedirect);
  if (returned.origin !== expected.origin || returned.pathname !== expected.pathname || returned.searchParams.get('state') !== expectedState) {
    throw new Error('Google authorization state did not match. Try connecting again.');
  }
  const oauthError = returned.searchParams.get('error');
  if (oauthError) throw new Error('Google authorization was cancelled or denied.');
  const code = returned.searchParams.get('code');
  if (!code || code.length > 4096) throw new Error('Google authorization did not return a code.');
  return code;
}

async function authorizeFirefox() {
  if (FIREFOX_DESKTOP_CLIENT_ID.startsWith('YOUR_')) {
    throw new Error('Set your Firefox Desktop OAuth client ID in src/shared/firefox-oauth-config.js first.');
  }
  const redirectUri = firefoxRedirectUri();
  const state = randomBase64Url(32);
  const verifier = randomBase64Url(48);
  const challenge = await createPkceChallenge(verifier);
  const authorization = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorization.search = new URLSearchParams({
    client_id: FIREFOX_DESKTOP_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent select_account'
  }).toString();

  const redirectedUrl = await chrome.identity.launchWebAuthFlow({ url: authorization.toString(), interactive: true });
  const code = validateOAuthRedirect(redirectedUrl, redirectUri, state);
  const [{ [FIREFOX_SECRET_KEY]: sessionSecret }, { [FIREFOX_SECRET_KEY]: savedSecret, [FIREFOX_AUTH_KEY]: savedAuthorization }] = await Promise.all([
    chrome.storage.session.get(FIREFOX_SECRET_KEY),
    chrome.storage.local.get([FIREFOX_SECRET_KEY, FIREFOX_AUTH_KEY])
  ]);
  const clientSecret = savedSecret ?? sessionSecret;
  if (typeof clientSecret !== 'string' || clientSecret.length < 8 || clientSecret.length > 512) {
    throw new Error('Open Settings and enter the client_secret from your Google Desktop app credentials file.');
  }
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: FIREFOX_DESKTOP_CLIENT_ID,
      client_secret: clientSecret,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    }),
    cache: 'no-store'
  });
  if (!response.ok) throw new Error('Could not exchange the Google authorization code. Check the Firefox OAuth client setup.');
  const tokenResult = await response.json();
  if (typeof tokenResult.access_token !== 'string' || !Number.isFinite(tokenResult.expires_in)) {
    throw new Error('Google did not return a usable access token.');
  }
  const session = {
    accessToken: tokenResult.access_token,
    expiresAt: Date.now() + Math.max(60, tokenResult.expires_in) * 1000
  };
  const refreshToken = tokenResult.refresh_token ?? savedAuthorization?.refreshToken;
  if (typeof refreshToken !== 'string' || refreshToken.length < 20 || refreshToken.length > 4096) {
    throw new Error('Google did not return a persistent sign-in. Disconnect OtpPilot in your Google Account, then connect again.');
  }
  // Refresh token and public Desktop-app client secret stay in this Firefox profile so
  // sign-in survives browser restarts. Access tokens remain memory-only.
  await chrome.storage.local.set({
    [FIREFOX_SECRET_KEY]: clientSecret,
    [FIREFOX_AUTH_KEY]: { refreshToken }
  });
  await chrome.storage.session.set({ [SESSION_KEY]: session });
  await chrome.storage.session.remove(FIREFOX_SECRET_KEY);
  return session.accessToken;
}

async function refreshFirefoxAccessToken(authorization) {
  const [{ [FIREFOX_SECRET_KEY]: clientSecret }] = await Promise.all([
    chrome.storage.local.get(FIREFOX_SECRET_KEY)
  ]);
  if (typeof authorization?.refreshToken !== 'string' || typeof clientSecret !== 'string') return null;
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: FIREFOX_DESKTOP_CLIENT_ID,
      client_secret: clientSecret,
      refresh_token: authorization.refreshToken,
      grant_type: 'refresh_token'
    }),
    cache: 'no-store'
  });
  const tokenResult = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (tokenResult.error === 'invalid_grant') {
      await chrome.storage.local.remove(FIREFOX_AUTH_KEY);
      return null;
    }
    throw new Error('Could not renew Google sign-in. Check your connection and try again.');
  }
  if (typeof tokenResult.access_token !== 'string' || !Number.isFinite(tokenResult.expires_in)) {
    throw new Error('Google did not return a usable access token.');
  }
  const session = {
    accessToken: tokenResult.access_token,
    expiresAt: Date.now() + Math.max(60, tokenResult.expires_in) * 1000
  };
  await chrome.storage.session.set({ [SESSION_KEY]: session });
  return session.accessToken;
}

export async function getAccessToken({ interactive = false } = {}) {
  if (usesChromeIdentityTokenCache()) {
    const result = await chrome.identity.getAuthToken({ interactive });
    if (!result?.token) throw new Error('Google authorization did not return an access token.');
    return result.token;
  }

  const { [SESSION_KEY]: session } = await chrome.storage.session.get(SESSION_KEY);
  if (session?.accessToken && session.expiresAt > Date.now() + 60_000) return session.accessToken;
  await chrome.storage.session.remove(SESSION_KEY);
  const { [FIREFOX_AUTH_KEY]: authorization } = await chrome.storage.local.get(FIREFOX_AUTH_KEY);
  if (authorization?.refreshToken) {
    const token = await refreshFirefoxAccessToken(authorization);
    if (token) return token;
  }
  if (!interactive) throw new Error('Google authorization expired. Click Connect Gmail to sign in again.');
  return authorizeFirefox();
}

export async function invalidateAccessToken(token) {
  if (usesChromeIdentityTokenCache()) {
    await chrome.identity.removeCachedAuthToken({ token }).catch(() => {});
  } else {
    await chrome.storage.session.remove(SESSION_KEY);
  }
}

export async function clearAuthTokens() {
  if (usesChromeIdentityTokenCache()) await chrome.identity.clearAllCachedAuthTokens();
  else {
    await chrome.storage.session.remove([SESSION_KEY, FIREFOX_SECRET_KEY]);
    await chrome.storage.local.remove([FIREFOX_SECRET_KEY, FIREFOX_AUTH_KEY]);
  }
}

export async function revokeAccessToken(token) {
  try {
    await fetch(REVOKE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
      cache: 'no-store'
    });
  } finally {
    await invalidateAccessToken(token);
  }
}

export const firefoxOAuthTestHooks = Object.freeze({
  createPkceChallenge,
  firefoxRedirectUri,
  validateOAuthRedirect
});
