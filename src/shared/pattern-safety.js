const MAX_PATTERN_LENGTH = 200;

/** Small, bounded OTP-pattern subset to reduce unsafe regex backtracking on email text. */
export function isSafeOtpPattern(source, otpLength) {
  if (typeof source !== 'string' || source.length === 0 || source.length > MAX_PATTERN_LENGTH) return false;
  if (!Number.isInteger(otpLength) || otpLength < 4 || otpLength > 10) return false;
  if (/\\[1-9]|\.\*/.test(source)) return false;
  try { new RegExp(source, 'i'); } catch { return false; }

  let captures = 0;
  let quantifiedGroups = 0;
  let repeatCount = 0;
  let inClass = false;
  let escaped = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (escaped) { escaped = false; continue; }
    if (char === '\\') { escaped = true; continue; }
    if (inClass) {
      if (char === ']') inClass = false;
      continue;
    }
    if (char === '[') { inClass = true; continue; }
    if (char === '.') return false;
    if (char === '(' && source[i + 1] !== '?') captures += 1;
    if (char === ')' && ['*', '+', '{'].includes(source[i + 1])) quantifiedGroups += 1;
    if ((char === '*' || char === '+') && source.slice(Math.max(0, i - 2), i) !== '\\s') return false;
    if (char === '{') {
      const quantifier = source.slice(i).match(/^\{(\d+)\}/);
      if (!quantifier || Number(quantifier[1]) < 4 || Number(quantifier[1]) > 10) return false;
      i += quantifier[0].length - 1;
      repeatCount += 1;
      continue;
    }
    if (char === '?' && source[i - 1] === ')') repeatCount += 1;
    if (char === '*' || char === '+') repeatCount += 1;
  }

  const hasExactDigitCapture = source.includes(`([0-9]{${otpLength}})`) || source.includes(`(\\d{${otpLength}})`);
  return captures === 1 && hasExactDigitCapture && quantifiedGroups === 0 && repeatCount <= 16 &&
    (source.match(/\(\?:/g)?.length ?? 0) <= 12;
}
