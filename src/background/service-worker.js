import { connectGmail, disconnectGmail, getRecentOtp, gmailStatus } from './gmail.js';
import { isAllowedPageUrl } from '../shared/allowlist.js';
import { validateRequest } from '../shared/messages.js';

const AUTO_HELPER_SCRIPT_ID = 'otp-helper-allowlisted-sites';
const validHostname = (value) => typeof value === 'string' && value.length <= 253 &&
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(value);

async function syncAutoHelper() {
  const { rules = {} } = await chrome.storage.local.get('rules');
  const hosts = [...new Set((Array.isArray(rules.websites) ? rules.websites : [])
    .map((host) => typeof host === 'string' ? host.trim().toLowerCase() : '')
    .filter(validHostname))];
  const permitted = [];
  for (const host of hosts) {
    const match = `https://${host}/*`;
    if (await chrome.permissions.contains({ origins: [match] })) permitted.push(match);
  }

  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [AUTO_HELPER_SCRIPT_ID] });
  if (registered.length) await chrome.scripting.unregisterContentScripts({ ids: [AUTO_HELPER_SCRIPT_ID] });
  if (permitted.length) {
    await chrome.scripting.registerContentScripts([{
      id: AUTO_HELPER_SCRIPT_ID,
      matches: permitted,
      js: ['src/content/inline-helper.js'],
      runAt: 'document_idle',
      allFrames: false
    }]);
    // Apply the newly enabled helper to matching tabs that are already open.
    const tabs = await chrome.tabs.query({ url: permitted });
    await Promise.all(tabs.filter((tab) => Number.isInteger(tab.id)).map((tab) =>
      chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, files: ['src/content/inline-helper.js'] }).catch(() => {})
    ));
  }
  return { enabledHosts: permitted.length };
}

const ACTIONS = {
  GET_STATUS: async () => gmailStatus(),
  CONNECT: async () => connectGmail(),
  GET_OTP: async () => ({ result: await getRecentOtp() }),
  DISCONNECT: async () => disconnectGmail(),
  SYNC_AUTO_HELPER: async () => syncAutoHelper(),
  GET_INLINE_OTP: async () => ({ result: await getRecentOtp() })
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const valid = validateRequest(message);
  const fromExtensionUi = sender.id === chrome.runtime.id && !sender.tab && valid &&
    ['GET_STATUS', 'CONNECT', 'GET_OTP', 'DISCONNECT', 'SYNC_AUTO_HELPER'].includes(message.type);
  const fromAllowedContent = sender.id === chrome.runtime.id && valid && ['GET_INLINE_OTP', 'GET_INLINE_EMAIL'].includes(message.type) &&
    sender.frameId === 0 && sender.tab?.id !== undefined;
  if (!fromExtensionUi && !fromAllowedContent) {
    sendResponse({ ok: false, error: 'Invalid request.' });
    return false;
  }

  if (fromAllowedContent) {
    chrome.storage.local.get('rules')
      .then(({ rules = {} }) => {
        const safe = isAllowedPageUrl(sender.url, rules.websites) && isAllowedPageUrl(sender.tab.url, rules.websites);
        if (!safe) throw new Error('This website is not allowlisted.');
        if (message.type === 'GET_INLINE_EMAIL') {
          const expectedAccount = typeof rules.expectedAccount === 'string' ? rules.expectedAccount.trim().toLowerCase() : '';
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(expectedAccount)) throw new Error('Set the dedicated Gmail account in Settings first.');
          return { email: expectedAccount };
        }
        return getRecentOtp();
      })
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error?.message ?? 'Could not find a fresh code.' }));
    return true;
  }

  const action = ACTIONS[message.type];
  if (!action) {
    sendResponse({ ok: false, error: 'Unsupported request.' });
    return false;
  }

  action(message, sender)
    .then((data) => sendResponse({ ok: true, ...data }))
    .catch((error) => {
      // Keep provider response bodies, tokens, and email content out of UI messages/logs.
      const known = typeof error?.message === 'string' && error.message.length < 180
        ? error.message
        : 'The request could not be completed. Check your connection and settings.';
      sendResponse({ ok: false, error: known });
    });
  return true;
});

chrome.runtime.onInstalled.addListener(() => { syncAutoHelper().catch(() => {}); });
chrome.runtime.onStartup.addListener(() => { syncAutoHelper().catch(() => {}); });
chrome.permissions.onAdded.addListener(() => { syncAutoHelper().catch(() => {}); });
chrome.permissions.onRemoved.addListener(() => { syncAutoHelper().catch(() => {}); });
