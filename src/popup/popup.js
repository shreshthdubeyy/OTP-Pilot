const status = document.querySelector('#status');
const account = document.querySelector('#account');
const message = document.querySelector('#message');
const connect = document.querySelector('#connect');
const disconnect = document.querySelector('#disconnect');
const refresh = document.querySelector('#refresh');
const statusDot = document.querySelector('#status-dot');
const result = document.querySelector('#result');
const code = document.querySelector('#code');
const reveal = document.querySelector('#reveal');
const copy = document.querySelector('#copy');
const expiry = document.querySelector('#expiry');
let secret = '';
let expiresAt = 0;

function setMessage(text) {
  message.textContent = text;
  message.hidden = !text;
}

function clearResult() {
  secret = '';
  expiresAt = 0;
  code.textContent = '';
  result.hidden = true;
}

function request(type, extra = {}) {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type, ...extra }, (response) => {
    if (chrome.runtime.lastError) resolve({ ok: false, error: 'Extension service unavailable. Reload it at chrome://extensions.' });
    else resolve(response ?? { ok: false, error: 'No response from the extension.' });
  }));
}

async function updateStatus() {
  const response = await request('GET_STATUS');
  const connected = Boolean(response?.ok && response.connected);
  statusDot.classList.toggle('connected', connected);
  status.textContent = connected ? 'Connected' : 'Not connected';
  account.textContent = connected ? response.account : '';
  connect.hidden = connected;
  disconnect.hidden = !connected;
  refresh.disabled = !connected;
  if (!connected) clearResult();
  return connected;
}

connect.addEventListener('click', async () => {
  connect.disabled = true;
  setMessage('Opening Google authorization…');
  const response = await request('CONNECT');
  connect.disabled = false;
  if (!response?.ok) setMessage(response?.error ?? 'Could not connect Gmail.');
  else setMessage('Dedicated Gmail account connected.');
  await updateStatus();
});

disconnect.addEventListener('click', async () => {
  disconnect.disabled = true;
  clearResult();
  const response = await request('DISCONNECT');
  disconnect.disabled = false;
  setMessage(response?.ok ? 'Disconnected. Cached authorization was cleared.' : response?.error ?? 'Could not disconnect.');
  await updateStatus();
});

refresh.addEventListener('click', async () => {
  refresh.disabled = true;
  clearResult();
  setMessage('Checking up to five recent messages…');
  const response = await request('GET_OTP');
  refresh.disabled = false;
  if (!response?.ok) {
    setMessage(response?.error ?? 'Could not check Gmail.');
  } else if (!response.result) {
    setMessage('No fresh matching code was found.');
  } else if (!/^\d{4,10}$/.test(response.result.code) || response.result.expiresAt <= Date.now()) {
    setMessage('The matching code has expired. Request a new one from the service.');
  } else {
    secret = response.result.code;
    expiresAt = response.result.expiresAt;
    result.hidden = false;
    code.textContent = '••••••';
    reveal.textContent = 'Reveal code';
    expiry.textContent = `Expires ${new Date(expiresAt).toLocaleTimeString()}`;
    setMessage('A fresh matching code is ready.');
    window.setTimeout(() => {
      if (Date.now() >= expiresAt) {
        clearResult();
        setMessage('The code expired. Request a new one from the service.');
      }
    }, Math.max(0, expiresAt - Date.now()));
  }
  await updateStatus();
});

reveal.addEventListener('click', () => {
  if (!secret || Date.now() >= expiresAt) return;
  const isRevealed = code.textContent === secret;
  code.textContent = isRevealed ? '••••••' : secret;
  reveal.textContent = isRevealed ? 'Reveal code' : 'Hide code';
});

copy.addEventListener('click', async () => {
  if (!secret || Date.now() >= expiresAt) return;
  try {
    await navigator.clipboard.writeText(secret);
    setMessage('Code copied to clipboard.');
  } catch {
    setMessage('Clipboard access failed. Reveal the code to copy it manually.');
  }
});

updateStatus();
