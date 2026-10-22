# Manual end-to-end checklist

These checks need a Chrome or Firefox profile and a Gmail test account you control. Use dummy messages and dummy codes; never paste a real code, password, token, or client secret into chat or a log.

## Local extension setup

- [ ] `npm test` passes before loading the extension.
- [ ] Build both targets with `npm run build`.
- [ ] Load `dist/chrome` through `chrome://extensions` → **Developer mode** → **Load unpacked**.
- [ ] Load `dist/firefox/manifest.json` through `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…**.
- [ ] Check each browser shows no manifest or background errors.
- [ ] Complete the Google Cloud OAuth setup in `README.md`, reload the extension, and use an account listed as a consent-screen test user.
- [ ] In Settings, configure the test account, a sender you control, an exact subject phrase, code length, freshness window, and a test hostname.
- [ ] Connect from the popup and confirm the displayed Gmail address exactly matches Settings.
- [ ] Try a different Google account and confirm it is rejected and its extension token cache is cleared.
- [ ] In Firefox, confirm authorization uses a Google Desktop OAuth client, PKCE succeeds, and an access token is refreshed after Firefox restarts without another consent prompt.
- [ ] On an allowlisted test page, focus a blank email-type field and confirm only the configured account is filled; confirm a nonblank value is never overwritten.
- [ ] Click **Get code & fill** for the OTP input, confirm the site's Angular form recognizes the filled value when Verify is clicked, and confirm the extension never submits the form itself.

## Gmail matching

- [ ] Send a synthetic recent message from the configured sender with the configured subject and a contextual dummy OTP.
- [ ] Fetch from the popup and verify the code starts hidden, Reveal toggles visibility, Copy copies it, and the popup does not persist it after closing.
- [ ] Confirm a wrong sender, wrong subject, too-old message, future-dated message, wrong-length number, and unrelated order/account number do not produce a result.
- [ ] Confirm the search is limited to at most five messages and only recent candidates are fetched.
- [ ] Revoke access from the Google Account's third-party access page; verify the popup shows disconnected and reconnect is required.
- [ ] Disconnect in the popup and confirm further retrieval requires reconnecting.

## Optional inline helper

- [ ] Add a test hostname to the allowlist and save it. Confirm the browser asks for access only to that HTTPS origin.
- [ ] Approve the prompt, load the exact host, and confirm the helper appears beside a recognized OTP field without opening the popup.
- [ ] On a hostname not in the allowlist, an HTTP page, a subdomain, and a restricted browser page, confirm it does not inject.
- [ ] Focus a recognizable OTP input and click **Get code & fill**. Confirm the field receives the code only after this click.
- [ ] Confirm the helper never displays the code, dispatches no custom events or OTP in `event.data`, and never submits the form. Confirm ordinary input/change notifications let the framework update its own field model.
- [ ] Click the close control and confirm the helper is removed for that page. Reopen the page and confirm it appears again while the site remains allowlisted.
- [ ] Remove the hostname from Settings and save. Confirm the helper stops appearing there.
- [ ] Confirm a normal password field is not eligible for insertion.

## Disconnect and expiry

- [ ] Configure a short freshness window and confirm codes outside it are rejected.
- [ ] Wait until a popup result expires; confirm it is cleared and cannot be copied/revealed.
- [ ] Disconnect, close and reopen the popup, and confirm no OTP or connected account is shown.
- [ ] Confirm Disconnect also removes Firefox's saved refresh token and client secret; after reconnecting, check that a new authorization is required.
