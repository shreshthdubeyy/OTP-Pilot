import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlEmailToText, parseOtpMessage } from '../src/shared/otp-parser.js';
import { DEFAULT_RULES, migrateRules } from '../src/shared/defaults.js';
import { distractorNumbers, FIXED_NOW, matchingHtmlOnly, matchingPlainText, rules } from './fixtures/email-fixtures.js';

test('extracts the code associated with the configured verification context', () => {
  assert.deepEqual(parseOtpMessage(matchingPlainText, rules, FIXED_NOW), {
    code: '482913',
    receivedAt: FIXED_NOW - 30_000,
    expiresAt: FIXED_NOW - 30_000 + 900_000
  });
});

test('extracts from HTML after removing hidden script and head content', () => {
  assert.equal(parseOtpMessage(matchingHtmlOnly, rules, FIXED_NOW)?.code, '731604');
});

test('accepts an OTP label with its parenthetical expansion', () => {
  assert.equal(parseOtpMessage(matchingPlainText, rules, FIXED_NOW)?.code, '482913');
});

test('upgrades shipped default rules while preserving customized patterns', () => {
  const oldDefaults = {
    validityMinutes: 10,
    websites: ['login.example.com'],
    otpPatterns: [
      String.raw`\b(?:verification|security|one[- ]time|login|sign[- ]in)?\s*(?:code|otp)\s*(?:is|:|-)?\s*([0-9]{6})\b`,
      String.raw`\b([0-9]{6})\s+is\s+your\s+(?:verification|security|one[- ]time|login)\s*(?:code|otp)\b`
    ]
  };
  const migrated = migrateRules(oldDefaults);
  assert.equal(migrated.validityMinutes, 15);
  assert.deepEqual(migrated.websites, []);
  assert.deepEqual(migrated.otpPatterns, DEFAULT_RULES.otpPatterns);
  const customized = migrateRules({ ...oldDefaults, otpPatterns: ['\\bOTP: ([0-9]{6})\\b'] });
  assert.deepEqual(customized.otpPatterns, ['\\bOTP: ([0-9]{6})\\b']);
});

test('ignores unrelated numbers and extracts only contextual OTPs', () => {
  assert.equal(parseOtpMessage(distractorNumbers, rules, FIXED_NOW)?.code, '284701');
  assert.equal(parseOtpMessage({ ...distractorNumbers, textBody: 'Order 991122; account 4550.' }, rules, FIXED_NOW), null);
});

test('rejects a sender mismatch, including a spoofed display name', () => {
  assert.equal(parseOtpMessage({ ...matchingPlainText, from: 'no-reply@example.net' }, rules, FIXED_NOW), null);
  assert.equal(parseOtpMessage({ ...matchingPlainText, from: 'no-reply@example.com <no-reply@example.net>' }, rules, FIXED_NOW), null);
});

test('rejects subject mismatch and messages outside the freshness window', () => {
  assert.equal(parseOtpMessage({ ...matchingPlainText, subject: 'Receipt' }, rules, FIXED_NOW), null);
  assert.equal(parseOtpMessage({ ...matchingPlainText, internalDate: FIXED_NOW - 900_001 }, rules, FIXED_NOW), null);
  assert.equal(parseOtpMessage({ ...matchingPlainText, internalDate: FIXED_NOW + 120_001 }, rules, FIXED_NOW), null);
});

test('enforces configured OTP length and rejects malformed rules', () => {
  assert.equal(parseOtpMessage(matchingPlainText, { ...rules, otpLength: 8 }, FIXED_NOW), null);
  assert.equal(parseOtpMessage(matchingPlainText, { ...rules, otpLength: 0 }, FIXED_NOW), null);
  assert.equal(parseOtpMessage(matchingPlainText, { ...rules, otpPatterns: ['('] }, FIXED_NOW), null);
});

test('decodes HTML entities to text without exposing markup', () => {
  assert.equal(htmlEmailToText('<p>Code&nbsp;is &#52;&#56;&#50;&#57;&#49;&#51;</p><style>hidden</style>'), 'Code is 482913');
});
