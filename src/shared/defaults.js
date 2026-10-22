export const DEFAULT_RULES = Object.freeze({
  expectedAccount: 'you@example.com',
  expectedSender: 'no-reply@example.com',
  subjectPattern: 'Your sign-in verification code',
  otpLength: 6,
  validityMinutes: 15,
  // Each expression must have exactly one capture group containing the code.
  otpPatterns: [
    String.raw`\b(?:verification|security|one[- ]time|login|sign[- ]in)?\s*(?:code|otp)\s*(?:\(\s*one[- ]time\s+password\s*\))?\s*(?:is|:|-)?\s*([0-9]{6})\b`,
    String.raw`\b([0-9]{6})\s+is\s+your\s+(?:verification|security|one[- ]time|login)\s*(?:code|otp)\b`
  ],
  websites: []
});

const PREVIOUS_DEFAULT_OTP_PATTERNS = [
  String.raw`\b(?:verification|security|one[- ]time|login|sign[- ]in)?\s*(?:code|otp)\s*(?:is|:|-)?\s*([0-9]{6})\b`,
  String.raw`\b([0-9]{6})\s+is\s+your\s+(?:verification|security|one[- ]time|login)\s*(?:code|otp)\b`
];

// Upgrade only the shipped default patterns; preserve any patterns the user customized.
export function migrateRules(saved) {
  const rules = { ...DEFAULT_RULES, ...(saved ?? {}) };
  const oldDefaultPatterns = Array.isArray(saved?.otpPatterns) &&
    saved.otpPatterns.length === PREVIOUS_DEFAULT_OTP_PATTERNS.length &&
    saved.otpPatterns.every((pattern, index) => pattern === PREVIOUS_DEFAULT_OTP_PATTERNS[index]);
  if (oldDefaultPatterns) {
    rules.otpPatterns = [...DEFAULT_RULES.otpPatterns];
    if (saved.validityMinutes === 10) rules.validityMinutes = DEFAULT_RULES.validityMinutes;
    if (Array.isArray(saved.websites) && saved.websites.length === 1 && saved.websites[0] === 'login.example.com') {
      rules.websites = [];
    }
  }
  return rules;
}
