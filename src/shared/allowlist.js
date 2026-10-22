export function isAllowedPageUrl(value, websites) {
  if (typeof value !== 'string' || !Array.isArray(websites)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && websites.includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}
