import { DEFAULT_RULES } from '../../src/shared/defaults.js';

export const FIXED_NOW = Date.parse('2026-10-22T12:00:00.000Z');

export const matchingPlainText = {
  from: 'Example Service <no-reply@example.com>',
  subject: 'Your sign-in verification code',
  internalDate: FIXED_NOW - 30_000,
  textBody: 'This is your Example Service login OTP (One Time Password):\n\n482913\nThe OTP will expire in 15 minutes.'
};

export const matchingHtmlOnly = {
  from: 'no-reply@example.com',
  subject: 'Your sign-in verification code',
  internalDate: FIXED_NOW - 45_000,
  htmlBody: '<html><head>123456</head><body><p>Your Example Service verification code is <strong>731604</strong>.</p><script>999111</script></body></html>'
};

export const distractorNumbers = {
  ...matchingPlainText,
  textBody: 'Order 991122. Account ending 4550. Your sign-in verification code is 284701.'
};

export const rules = { ...DEFAULT_RULES, otpPatterns: [...DEFAULT_RULES.otpPatterns] };
