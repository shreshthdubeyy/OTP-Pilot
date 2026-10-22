import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedPageUrl } from '../src/shared/allowlist.js';
import { validateRequest } from '../src/shared/messages.js';

const sites = ['login.example.com'];

test('allows only the exact HTTPS hostname', () => {
  assert.equal(isAllowedPageUrl('https://login.example.com/sign-in', sites), true);
  assert.equal(isAllowedPageUrl('https://LOGIN.example.com/', sites), true);
  assert.equal(isAllowedPageUrl('https://sub.login.example.com/', sites), false);
  assert.equal(isAllowedPageUrl('https://example.com/', sites), false);
});

test('rejects non-HTTPS pages and unusual authorities', () => {
  assert.equal(isAllowedPageUrl('http://login.example.com/', sites), false);
  assert.equal(isAllowedPageUrl('https://user@login.example.com/', sites), false);
  assert.equal(isAllowedPageUrl('https://login.example.com:8443/', sites), false);
  assert.equal(isAllowedPageUrl('not a URL', sites), false);
});

test('accepts known no-payload extension requests only', () => {
  assert.equal(validateRequest({ type: 'GET_STATUS' }), true);
  assert.equal(validateRequest({ type: 'GET_INLINE_OTP' }), true);
  assert.equal(validateRequest({ type: 'GET_OTP', code: '123456' }), false);
});

test('accepts only the no-payload auto-helper sync request', () => {
  assert.equal(validateRequest({ type: 'SYNC_AUTO_HELPER' }), true);
  assert.equal(validateRequest({ type: 'SYNC_AUTO_HELPER', websites: ['https://evil.example'] }), false);
});
