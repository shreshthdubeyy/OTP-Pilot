import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_RULES } from '../src/shared/defaults.js';
import { isSafeOtpPattern } from '../src/shared/pattern-safety.js';

test('accepts the shipped bounded contextual patterns', () => {
  assert.equal(DEFAULT_RULES.otpPatterns.every((pattern) => isSafeOtpPattern(pattern, 6)), true);
});

test('requires a single exact digit capture for the selected code length', () => {
  assert.equal(isSafeOtpPattern(String.raw`code ([0-9]{8})`, 8), true);
  assert.equal(isSafeOtpPattern(String.raw`code ([0-9]{6})`, 8), false);
  assert.equal(isSafeOtpPattern(String.raw`code ([0-9]{6}) or ([0-9]{6})`, 6), false);
});

test('rejects broad wildcards, backreferences and repeated groups', () => {
  assert.equal(isSafeOtpPattern(String.raw`.*([0-9]{6})`, 6), false);
  assert.equal(isSafeOtpPattern(String.raw`code (\d{6})\1`, 6), false);
  assert.equal(isSafeOtpPattern(String.raw`(?:[0-9]|[0-9][0-9])+([0-9]{6})`, 6), false);
});
