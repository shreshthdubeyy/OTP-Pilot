import { isSafeOtpPattern } from './pattern-safety.js';

const MAX_BODY_LENGTH = 100_000;
const FUTURE_TOLERANCE_MS = 2 * 60 * 1000;

function normalizeEmail(value) {
  if (typeof value !== 'string' || value.length > 320) return null;
  const match = value.match(/^\s*(?:[^<>]*<\s*([^<>\s]+@[^<>\s]+)\s*>|([^\s<>]+@[^\s<>]+))\s*$/);
  return (match?.[1] ?? match?.[2])?.toLowerCase() ?? null;
}

function htmlToText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|head|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<\s*br\s*\/?>|<\/(?:p|div|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[\da-f]{1,6}|#\d{1,7}|amp|lt|gt|quot|apos|nbsp);/gi, (entity, name) => {
      const key = name.toLowerCase();
      if (key === 'amp') return '&';
      if (key === 'lt') return '<';
      if (key === 'gt') return '>';
      if (key === 'quot') return '"';
      if (key === 'apos') return "'";
      if (key === 'nbsp') return ' ';
      const point = key.startsWith('#x') ? Number.parseInt(key.slice(2), 16) : Number.parseInt(key.slice(1), 10);
      return Number.isInteger(point) && point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point)
        : ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function messageText(message) {
  const text = typeof message.textBody === 'string' ? message.textBody.slice(0, MAX_BODY_LENGTH) : '';
  const html = typeof message.htmlBody === 'string' ? htmlToText(message.htmlBody.slice(0, MAX_BODY_LENGTH)) : '';
  return `${text}\n${html}`.slice(0, MAX_BODY_LENGTH);
}

function validRules(rules) {
  return rules &&
    Number.isInteger(rules.otpLength) && rules.otpLength >= 4 && rules.otpLength <= 10 &&
    Number.isFinite(rules.validityMinutes) && rules.validityMinutes > 0 && rules.validityMinutes <= 1440 &&
    typeof rules.expectedSender === 'string' && normalizeEmail(rules.expectedSender) &&
    typeof rules.subjectPattern === 'string' && rules.subjectPattern.trim().length > 0 &&
    Array.isArray(rules.otpPatterns) && rules.otpPatterns.length > 0 && rules.otpPatterns.length <= 8 &&
    rules.otpPatterns.every((pattern) => isSafeOtpPattern(pattern, rules.otpLength));
}

/** Return the freshest matching code or null. Input is normalized metadata/body text, never trusted HTML. */
export function parseOtpMessage(message, rules, now = Date.now()) {
  if (!validRules(rules) || !message || typeof message !== 'object') return null;
  const sender = normalizeEmail(message.from);
  const expectedSender = normalizeEmail(rules.expectedSender);
  if (!sender || sender !== expectedSender) return null;
  if (typeof message.subject !== 'string' || !message.subject.toLowerCase().includes(rules.subjectPattern.trim().toLowerCase())) return null;

  const timestamp = typeof message.internalDate === 'number'
    ? message.internalDate
    : Date.parse(message.internalDate);
  if (!Number.isFinite(timestamp) || timestamp > now + FUTURE_TOLERANCE_MS || now - timestamp > rules.validityMinutes * 60_000) return null;

  const body = messageText(message);
  for (const source of rules.otpPatterns) {
    let pattern;
    try {
      pattern = new RegExp(source, 'gi');
    } catch {
      continue;
    }
    // Exactly one capture group keeps extraction explicit and predictable.
    const captures = [...source.matchAll(/(?<!\\)\((?!\?)/g)];
    if (captures.length !== 1) continue;
    const match = pattern.exec(body);
    const code = match?.[1];
    if (typeof code === 'string' && new RegExp(`^[0-9]{${rules.otpLength}}$`).test(code)) {
      return { code, receivedAt: timestamp, expiresAt: timestamp + rules.validityMinutes * 60_000 };
    }
  }
  return null;
}

export function htmlEmailToText(html) {
  return typeof html === 'string' ? htmlToText(html.slice(0, MAX_BODY_LENGTH)) : '';
}
