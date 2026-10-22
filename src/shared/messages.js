export const REQUEST_TYPES = new Set(['GET_STATUS', 'CONNECT', 'GET_OTP', 'DISCONNECT', 'SYNC_AUTO_HELPER', 'GET_INLINE_OTP', 'GET_INLINE_EMAIL']);

export function validateRequest(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    REQUEST_TYPES.has(value.type) &&
    Object.keys(value).every((key) => key === 'type')
  );
}
