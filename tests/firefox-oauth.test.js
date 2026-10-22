import test from 'node:test';
import assert from 'node:assert/strict';
import { firefoxOAuthTestHooks } from '../src/background/auth.js';

test('PKCE SHA-256 challenge uses URL-safe encoding', async () => {
  const challenge = await firefoxOAuthTestHooks.createPkceChallenge('test-verifier-value');
  assert.match(challenge, /^[A-Za-z0-9_-]{43}$/);
});

test('Firefox loopback redirect uses the stable add-on subdomain', () => {
  const previousChrome = globalThis.chrome;
  globalThis.chrome = { identity: { getRedirectURL: () => 'https://stable-addon.extensions.allizom.org/' } };
  try {
    assert.equal(firefoxOAuthTestHooks.firefoxRedirectUri(), 'http://127.0.0.1/mozoauth2/stable-addon');
  } finally {
    if (previousChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = previousChrome;
  }
});

test('Firefox OAuth callback must match redirect and state', () => {
  assert.equal(
    firefoxOAuthTestHooks.validateOAuthRedirect(
      'http://127.0.0.1/mozoauth2/addon-id?code=sample-code&state=expected',
      'http://127.0.0.1/mozoauth2/addon-id',
      'expected'
    ),
    'sample-code'
  );
  assert.throws(() => firefoxOAuthTestHooks.validateOAuthRedirect(
    'http://127.0.0.1/mozoauth2/addon-id?code=sample-code&state=wrong',
    'http://127.0.0.1/mozoauth2/addon-id', 'expected'
  ), /state did not match/);
  assert.throws(() => firefoxOAuthTestHooks.validateOAuthRedirect(
    'https://attacker.invalid/mozoauth2/addon-id?code=sample-code&state=expected',
    'http://127.0.0.1/mozoauth2/addon-id', 'expected'
  ), /state did not match/);
  assert.throws(() => firefoxOAuthTestHooks.validateOAuthRedirect(
    'http://127.0.0.1/mozoauth2/addon-id?error=access_denied&state=expected',
    'http://127.0.0.1/mozoauth2/addon-id', 'expected'
  ), /cancelled or denied/);
});
