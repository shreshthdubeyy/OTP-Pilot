import { DEFAULT_RULES, migrateRules } from '../shared/defaults.js';
import { isSafeOtpPattern } from '../shared/pattern-safety.js';

const fields = ['expectedAccount', 'expectedSender', 'subjectPattern', 'otpLength', 'validityMinutes', 'otpPatterns', 'websites'];
const status = document.querySelector('#status');
const form = document.querySelector('#settings');
const firefoxSecretSection = document.querySelector('#firefox-oauth-settings');
const firefoxSecretInput = document.querySelector('#firefoxClientSecret');
const isFirefox = typeof chrome.identity.getAuthToken !== 'function';
if (isFirefox) {
  firefoxSecretSection.hidden = false;
  const redirect = new URL(chrome.identity.getRedirectURL());
  const extensionSubdomain = redirect.hostname.split('.')[0];
  document.querySelector('#firefoxRedirectUrl').value = `http://127.0.0.1/mozoauth2/${extensionSubdomain}`;
}

function fill(rules) {
  for (const key of fields) {
    const input = document.querySelector(`#${key}`);
    const value = rules[key] ?? DEFAULT_RULES[key];
    input.value = Array.isArray(value) ? value.join('\n') : value;
  }
}

function safePatterns(value, otpLength) {
  const patterns = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (patterns.length < 1 || patterns.length > 8) throw new Error('Enter between 1 and 8 OTP patterns.');
  for (const pattern of patterns) {
    if (!isSafeOtpPattern(pattern, otpLength)) throw new Error(`Each pattern needs one exact ${otpLength}-digit capture, with short bounded matching syntax. Avoid wildcard and repeated-group patterns.`);
  }
  return patterns;
}

function validHost(value) {
  return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value);
}

let previousLength = DEFAULT_RULES.otpLength;
chrome.storage.local.get('rules').then(({ rules }) => {
  fill(migrateRules(rules));
  previousLength = Number(document.querySelector('#otpLength').value) || DEFAULT_RULES.otpLength;
});
document.querySelector('#otpLength').addEventListener('change', (event) => {
  const nextLength = Number(event.target.value);
  if (Number.isInteger(nextLength) && nextLength >= 4 && nextLength <= 10) {
    const patternField = document.querySelector('#otpPatterns');
    patternField.value = patternField.value.replaceAll(`{${previousLength}}`, `{${nextLength}}`);
    previousLength = nextLength;
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  status.textContent = '';
  try {
    const expectedAccount = document.querySelector('#expectedAccount').value.trim().toLowerCase();
    const expectedSender = document.querySelector('#expectedSender').value.trim().toLowerCase();
    const subjectPattern = document.querySelector('#subjectPattern').value.trim();
    const otpLength = Number(document.querySelector('#otpLength').value);
    const validityMinutes = Number(document.querySelector('#validityMinutes').value);
    const websites = [...new Set(document.querySelector('#websites').value.split(/\r?\n/).map((host) => host.trim().toLowerCase()).filter(Boolean))];

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(expectedAccount)) throw new Error('Enter a valid dedicated Gmail account address.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(expectedSender)) throw new Error('Enter a valid expected sender email address.');
    if (!subjectPattern || subjectPattern.length > 160) throw new Error('Subject text must be 1–160 characters.');
    if (!Number.isInteger(otpLength) || otpLength < 4 || otpLength > 10) throw new Error('Code length must be 4–10 digits.');
    if (!Number.isInteger(validityMinutes) || validityMinutes < 1 || validityMinutes > 1440) throw new Error('Freshness must be 1–1440 minutes.');
    if (websites.length > 20 || websites.some((host) => !validHost(host))) throw new Error('Use up to 20 exact hostnames, such as login.example.com.');
    const otpPatterns = safePatterns(document.querySelector('#otpPatterns').value, otpLength);

    // Request only the exact HTTPS hosts listed by the user. This call runs directly
    // from the Save button gesture and is backed by optional_host_permissions.
    const origins = websites.map((host) => `https://${host}/*`);
    const autoPermissionGranted = origins.length === 0 || await chrome.permissions.request({ origins });
    const { rules: previousRules } = await chrome.storage.local.get('rules');
    const previousOrigins = [...new Set((Array.isArray(previousRules?.websites) ? previousRules.websites : [])
      .filter(validHost).map((host) => `https://${host.toLowerCase()}/*`))];
    const removedOrigins = previousOrigins.filter((origin) => !origins.includes(origin));
    if (removedOrigins.length) await chrome.permissions.remove({ origins: removedOrigins }).catch(() => false);

    const nextRules = { expectedAccount, expectedSender, subjectPattern, otpLength, validityMinutes, otpPatterns, websites };
    await chrome.storage.local.set({ rules: nextRules });
    if (isFirefox && firefoxSecretInput.value.trim()) {
      await chrome.storage.local.set({ firefoxOAuthClientSecret: firefoxSecretInput.value.trim() });
      firefoxSecretInput.value = '';
    }
    await chrome.storage.local.remove('otpCache');
    const syncResult = await chrome.runtime.sendMessage({ type: 'SYNC_AUTO_HELPER' }).catch(() => null);
    status.textContent = isFirefox
      ? autoPermissionGranted
        ? `Settings saved. Auto helper enabled on ${syncResult?.enabledHosts ?? 0} allowed site(s). Firefox will remember Gmail sign-in in this profile.`
        : 'Settings saved, but site access was not granted. Auto helper is off for those sites.'
      : autoPermissionGranted
        ? `Settings saved. Auto helper enabled on ${syncResult?.enabledHosts ?? 0} allowed site(s).`
        : 'Settings saved, but site access was not granted. Auto helper is off for those sites.';
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Could not save settings.';
  }
});

document.querySelector('#clearFirefoxSecret').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'DISCONNECT' }).catch(() => null);
  await chrome.storage.local.remove(['firefoxOAuthClientSecret', 'firefoxRememberedAuthorization']);
  await chrome.storage.session.remove(['firefoxAccessToken', 'firefoxOAuthClientSecret']);
  firefoxSecretInput.value = '';
  status.textContent = 'Saved Gmail sign-in cleared from this Firefox profile.';
});

document.querySelector('#reset').addEventListener('click', () => {
  fill(DEFAULT_RULES);
  previousLength = DEFAULT_RULES.otpLength;
  status.textContent = 'Example values restored. Save settings to apply them.';
});
