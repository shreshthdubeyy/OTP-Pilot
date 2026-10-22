import { parseOtpMessage } from '../shared/otp-parser.js';
import { migrateRules } from '../shared/defaults.js';
import { clearAuthTokens, getAccessToken, invalidateAccessToken, revokeAccessToken } from './auth.js';

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const MAX_MESSAGES = 5;

function decodeBase64Url(value) {
  if (typeof value !== 'string' || value.length > 300_000) return '';
  try {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return '';
  }
}

function collectBodies(part, result) {
  if (!part || typeof part !== 'object') return;
  if (part.mimeType === 'text/plain' && part.body?.data && !result.textBody) {
    result.textBody = decodeBase64Url(part.body.data);
  } else if (part.mimeType === 'text/html' && part.body?.data && !result.htmlBody) {
    result.htmlBody = decodeBase64Url(part.body.data);
  }
  if (Array.isArray(part.parts)) {
    for (const child of part.parts) collectBodies(child, result);
  }
}

function header(message, name) {
  const headers = message?.payload?.headers;
  if (!Array.isArray(headers)) return '';
  const found = headers.find((item) => item?.name?.toLowerCase() === name.toLowerCase());
  return typeof found?.value === 'string' ? found.value.slice(0, 1000) : '';
}

function buildQuery(rules) {
  const safeSender = rules.expectedSender.toLowerCase();
  // Gmail search syntax accepts only mailbox + subject words; never interpolate raw regex/config.
  const subjectWords = rules.subjectPattern.match(/[a-z0-9]+/gi)?.slice(0, 8) ?? [];
  const days = Math.max(1, Math.min(30, Math.ceil(rules.validityMinutes / 1440)));
  return [`from:${safeSender}`, ...subjectWords.map((word) => `subject:${word}`), `newer_than:${days}d`].join(' ');
}

async function apiFetch(token, path) {
  return fetch(`${API}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store'
  });
}

async function readProfile(token) {
  const response = await apiFetch(token, 'profile');
  if (!response.ok) {
    if (response.status === 401) await invalidateAccessToken(token);
    throw new Error(response.status === 401 ? 'Google authorization expired. Reconnect and try again.' : 'Could not verify the Gmail account.');
  }
  return response.json();
}

function currentRules() {
  return chrome.storage.local.get('rules').then(({ rules }) => migrateRules(rules));
}

export async function connectGmail() {
  const rules = await currentRules();
  const expectedAccount = rules.expectedAccount?.trim().toLowerCase();
  if (!expectedAccount || !expectedAccount.includes('@')) throw new Error('Set the dedicated Gmail account in Settings first.');
  const token = await getAccessToken({ interactive: true });
  const profile = await readProfile(token);
  if (profile.emailAddress?.toLowerCase() !== expectedAccount) {
    await revokeAccessToken(token).catch(() => {});
    await clearAuthTokens();
    throw new Error('The connected Gmail account does not match the dedicated account in Settings.');
  }
  return { connected: true, account: profile.emailAddress };
}

export async function getRecentOtp() {
  const rules = await currentRules();
  const expectedAccount = rules.expectedAccount?.trim().toLowerCase();
  if (!expectedAccount || !expectedAccount.includes('@')) throw new Error('Set the dedicated Gmail account in Settings first.');
  const token = await getAccessToken({ interactive: false });
  const profile = await readProfile(token);
  if (profile.emailAddress?.toLowerCase() !== expectedAccount) {
    await revokeAccessToken(token).catch(() => {});
    await clearAuthTokens();
    throw new Error('The connected Gmail account does not match Settings.');
  }

  const query = new URLSearchParams({ q: buildQuery(rules), maxResults: String(MAX_MESSAGES), includeSpamTrash: 'false' });
  const listResponse = await apiFetch(token, `messages?${query}`);
  if (!listResponse.ok) {
    if (listResponse.status === 401) await invalidateAccessToken(token);
    throw new Error(listResponse.status === 401 ? 'Google authorization expired. Reconnect and try again.' : 'Gmail could not search recent messages.');
  }
  const list = await listResponse.json();
  const messages = Array.isArray(list.messages) ? list.messages.slice(0, MAX_MESSAGES) : [];

  for (const item of messages) {
    if (typeof item?.id !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(item.id)) continue;
    const response = await apiFetch(token, `messages/${encodeURIComponent(item.id)}?format=full`);
    if (!response.ok) {
      if (response.status === 401) {
        await invalidateAccessToken(token);
        throw new Error('Google authorization expired. Reconnect and try again.');
      }
      continue;
    }
    const raw = await response.json();
    const bodies = {};
    collectBodies(raw.payload, bodies);
    const parsed = parseOtpMessage({
      from: header(raw, 'From'),
      subject: header(raw, 'Subject'),
      internalDate: Number(raw.internalDate),
      ...bodies
    }, rules);
    if (parsed) return { code: parsed.code, expiresAt: parsed.expiresAt };
  }
  return null;
}

export async function gmailStatus() {
  try {
    const token = await getAccessToken({ interactive: false });
    const profile = await readProfile(token);
    const rules = await currentRules();
    const expected = rules.expectedAccount?.trim().toLowerCase();
    return { connected: Boolean(expected && profile.emailAddress?.toLowerCase() === expected), account: expected === profile.emailAddress?.toLowerCase() ? profile.emailAddress : null };
  } catch {
    return { connected: false, account: null };
  }
}

export async function disconnectGmail() {
  try {
    const token = await getAccessToken({ interactive: false });
    await revokeAccessToken(token);
  } catch {
    // No cached token is already disconnected locally; clear the extension identity cache below.
  }
  await clearAuthTokens();
  await chrome.storage.local.remove('otpCache');
  return { disconnected: true };
}
