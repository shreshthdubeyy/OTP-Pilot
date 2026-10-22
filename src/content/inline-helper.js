// Registered only for exact HTTPS hosts that the user allowlists and grants.
// The OTP is requested and filled only after the user clicks the in-page button.
if (!globalThis.__secureGmailOtpHelperInstalled) {
  globalThis.__secureGmailOtpHelperInstalled = true;

  const host = document.createElement('div');
  host.setAttribute('aria-label', 'OTP fill helper');
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;display:none;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    .card { box-sizing: border-box; width: 260px; padding: 12px; border: 1px solid #dfe5ef; border-radius: 14px; background: #fff; color: #172333; box-shadow: 0 12px 34px #14223c29; font: 13px/1.4 Inter,system-ui,-apple-system,"Segoe UI",sans-serif; }
    .top { display: flex; align-items: center; gap: 8px; }
    .brand { display: block; width: 27px; height: 27px; flex: none; border-radius: 7px; }
    .title { min-width: 0; flex: 1; margin: 0; font-size: 12px; font-weight: 750; }
    .close { width: 26px; height: 26px; border: 0; border-radius: 8px; background: transparent; color: #77849a; font: 18px/1 system-ui,sans-serif; cursor: pointer; }
    .close:hover { background: #f0f3f8; color: #273449; }
    .hint { margin: 8px 0 10px; color: #66758b; font-size: 11px; }
    .fill { width: 100%; padding: 9px 10px; border: 0; border-radius: 9px; background: #315fe8; color: #fff; font: inherit; font-size: 12px; font-weight: 700; line-height: 1.2; cursor: pointer; }
    .fill:hover { background: #254bc1; }
    .fill:disabled { opacity: .58; cursor: wait; }
    [role=status] { min-height: 15px; margin: 7px 1px 0; color: #596a81; font-size: 10px; }
  `;
  const card = document.createElement('section');
  card.className = 'card';
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'OTP helper');
  const top = document.createElement('div');
  top.className = 'top';
  const brand = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  // SVGElement.className is an SVGAnimatedString in Firefox; setting it like an
  // HTML className can silently fail and leave the SVG at its 300x150 default.
  brand.setAttribute('class', 'brand');
  brand.setAttribute('width', '27');
  brand.setAttribute('height', '27');
  brand.setAttribute('aria-hidden', 'true');
  brand.setAttribute('viewBox', '0 0 64 64');
  const tile = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  tile.setAttribute('width', '64'); tile.setAttribute('height', '64'); tile.setAttribute('rx', '14'); tile.setAttribute('fill', '#090a0c');
  const terminal = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  terminal.setAttribute('x', '13'); terminal.setAttribute('y', '14'); terminal.setAttribute('width', '38'); terminal.setAttribute('height', '36'); terminal.setAttribute('rx', '6'); terminal.setAttribute('fill', 'none'); terminal.setAttribute('stroke', '#f5f5f6'); terminal.setAttribute('stroke-width', '4');
  const prompt = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  prompt.setAttribute('d', 'm23 26 7 6-7 6M34 38h9'); prompt.setAttribute('fill', 'none'); prompt.setAttribute('stroke', '#f5f5f6'); prompt.setAttribute('stroke-width', '4'); prompt.setAttribute('stroke-linecap', 'round'); prompt.setAttribute('stroke-linejoin', 'round');
  brand.append(tile, terminal, prompt);
  const title = document.createElement('p');
  title.className = 'title';
  title.textContent = 'OtpPilot';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'close';
  close.setAttribute('aria-label', 'Dismiss helper');
  close.textContent = '×';
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'Fill the code into this field. You review and submit the form.';
  const fill = document.createElement('button');
  fill.type = 'button';
  fill.className = 'fill';
  fill.textContent = 'Get code & fill';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  top.append(brand, title, close);
  card.append(top, hint, fill, status);
  shadow.append(style, card);
  document.documentElement.append(host);

  const matchesOtpField = (element) => {
    if (!(element instanceof HTMLInputElement) || element.disabled || element.readOnly) return false;
    if (!['text', 'tel', 'number', 'password'].includes(element.type)) return false;
    const metadata = [element.autocomplete, element.name, element.id, element.getAttribute('aria-label'), element.placeholder]
      .filter(Boolean).join(' ').toLowerCase();
    if (element.autocomplete === 'current-password' || element.autocomplete === 'new-password') return false;
    return element.autocomplete === 'one-time-code' || /one.?time|otp|verification.?code|security.?code|auth.?code/.test(metadata);
  };

  const matchesAccountEmailField = (element) => element instanceof HTMLInputElement &&
    !element.disabled && !element.readOnly && element.type === 'email';

  const setFrameworkInputValue = (element, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
    // Notify the site's own form model (for example Angular) that the user
    // initiated a fill. The OTP is not placed in event.data or a custom event.
    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  };

  const isVisible = (element) => {
    if (!element?.isConnected || element.getClientRects().length === 0) return false;
    const computed = getComputedStyle(element);
    return computed.visibility !== 'hidden' && computed.display !== 'none' && Number(computed.opacity) !== 0;
  };

  let targetField = null;
  let dismissed = false;
  const positionNear = (field) => {
    const rect = field.getBoundingClientRect();
    const width = Math.min(260, Math.max(200, window.innerWidth - 16));
    host.style.width = `${width}px`;
    host.style.display = 'block';
    // Measure the real card and choose a nearby position that does not cover
    // visible form controls (especially the site's Send OTP button).
    const height = Math.ceil(host.getBoundingClientRect().height);
    const gap = 8;
    const candidates = [
      { left: rect.right + gap, top: rect.top },
      { left: rect.left - width - gap, top: rect.top },
      { left: rect.left, top: rect.bottom + gap },
      { left: rect.left, top: rect.top - height - gap }
    ].map((point) => ({
      left: Math.min(Math.max(8, point.left), window.innerWidth - width - 8),
      top: Math.min(Math.max(8, point.top), window.innerHeight - height - 8)
    }));
    const controls = [...document.querySelectorAll('button, input, select, textarea, [role="button"]')]
      .filter((element) => element !== field && isVisible(element))
      .map((element) => element.getBoundingClientRect());
    const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const scored = candidates.map((point) => {
      const box = { left: point.left, top: point.top, right: point.left + width, bottom: point.top + height };
      const distance = Math.hypot(point.left - rect.left, point.top - rect.top);
      const obstructionCount = controls.filter((control) => overlaps(box, control)).length;
      return { ...point, score: obstructionCount * 100000 + distance };
    }).sort((a, b) => a.score - b.score);
    host.style.left = `${scored[0].left}px`;
    host.style.top = `${scored[0].top}px`;
  };

  const scanForField = () => {
    if (dismissed) return;
    const focused = matchesOtpField(document.activeElement) && isVisible(document.activeElement)
      ? document.activeElement
      : null;
    const found = focused ?? [...document.querySelectorAll('input')].find((input) => matchesOtpField(input) && isVisible(input)) ?? null;
    if (!found) {
      targetField = null;
      host.style.display = 'none';
      return;
    }
    targetField = found;
    positionNear(found);
  };

  const onFocus = (event) => {
    if (matchesAccountEmailField(event.target) && !event.target.value.trim()) {
      const emailField = event.target;
      chrome.runtime.sendMessage({ type: 'GET_INLINE_EMAIL' }, (response) => {
        const email = response?.result?.email;
        if (chrome.runtime.lastError || !response?.ok || typeof email !== 'string' ||
            !matchesAccountEmailField(emailField) || !isVisible(emailField) ||
            document.activeElement !== emailField || emailField.value.trim()) return;
        setFrameworkInputValue(emailField, email);
      });
    }
    if (matchesOtpField(event.target)) {
      dismissed = false;
      scanForField();
    }
  };
  document.addEventListener('focusin', onFocus, true);
  window.addEventListener('resize', scanForField, { passive: true });
  window.addEventListener('scroll', scanForField, { passive: true, capture: true });
  const observer = new MutationObserver((records) => {
    if (records.some(({ target }) => target !== host && !host.contains(target))) scanForField();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['type', 'name', 'id', 'autocomplete', 'placeholder', 'aria-label', 'hidden', 'style', 'class'] });
  scanForField();

  fill.addEventListener('click', () => {
    if (!matchesOtpField(targetField) || !isVisible(targetField)) {
      status.textContent = 'Select the verification-code field, then try again.';
      return;
    }
    fill.disabled = true;
    status.textContent = 'Looking for a fresh code…';
    chrome.runtime.sendMessage({ type: 'GET_INLINE_OTP' }, (response) => {
      fill.disabled = false;
      if (chrome.runtime.lastError || !response?.ok || !response.result) {
        status.textContent = response?.error ?? 'No fresh matching code was found.';
        return;
      }
      const { code, expiresAt } = response.result;
      if (typeof code !== 'string' || !/^\d{4,10}$/.test(code) || Date.now() >= expiresAt ||
          !matchesOtpField(targetField) || !isVisible(targetField)) {
        status.textContent = 'The code expired or the field changed. Try again.';
        return;
      }
      if (targetField.maxLength > 0 && targetField.maxLength < code.length) {
        status.textContent = 'This site uses separate code boxes. Enter the code from the extension popup.';
        return;
      }
      setFrameworkInputValue(targetField, code);
      status.textContent = 'Code filled. Review the field, then submit the page yourself.';
    });
  });

  close.addEventListener('click', () => {
    dismissed = true;
    host.style.display = 'none';
  });
}
