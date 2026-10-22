# Security and permission audit

## Data flow

1. The popup asks the privileged background context to connect or fetch. The options page stores only matching rules and exact website hostnames in `storage.local`.
2. Chrome uses `chrome.identity.getAuthToken`. Firefox uses `identity.launchWebAuthFlow` with state validation and PKCE, requesting offline access. Firefox's short-lived access token remains in `storage.session`; the refresh token and Desktop OAuth client secret are kept in `storage.local` in the user's Firefox profile so sign-in survives restarts. They are sent only to Google's HTTPS token endpoints and removed by Disconnect. Firefox extension storage is not an encrypted vault; anyone with access to the profile or control of Firefox may be able to use the saved authorization. Neither value is stored in source files, the DOM, or logs.
3. The background context checks Gmail's profile address against the one configured dedicated account before searching.
4. Gmail API requests search by sender, subject words, and recent age, list at most five messages, and fetch each candidate one at a time. The background decodes message text, validates it locally, and returns only a code plus expiry to the popup or an allowlisted content script.
5. The popup holds the code in memory and clears it at expiry or disconnect. The content helper holds it only long enough to fill a recognized field after the user clicks its button. It never renders the code in its UI.
6. Disconnect requests Google's token revocation endpoint when an access token is available and clears Chrome's cached identity token or Firefox's session token, refresh token, and saved Desktop app client secret. There is no persistent OTP cache; disconnect also removes a reserved cache key defensively.

No email body, code, OAuth token, or account data is sent to an AI model, analytics service, or extraction service. No email body or OTP is intentionally persisted. Gmail search and parsing are performed in the privileged extension background context (a service worker in Chrome and a background script in Firefox).

## Permissions

| Permission | Why it is present |
| --- | --- |
| `identity` | Browser-supported OAuth flow: Chrome token management or Firefox authorization-code/PKCE. |
| `storage` | Save matching rules and allowlist; keep Firefox access tokens in session storage and its refresh token/client secret in profile storage to persist sign-in. |
| `clipboardWrite` | Copy a code only after the user clicks Copy in the popup. |
| `scripting` | Dynamically register the helper only for exact allowlisted HTTPS hostnames with a matching browser-granted optional host permission. |
| Optional `https://host/*` origins | Requested at runtime for the exact HTTPS hostnames the user enters in Settings; removed when those hostnames are removed from the allowlist. |
| `https://gmail.googleapis.com/*` | Call the Gmail API. |
| `https://oauth2.googleapis.com/*` | Firefox code exchange and token revocation on disconnect. |
| OAuth `gmail.readonly` | Read matching Gmail messages; no modify, send, delete, or broad `mail.google.com` scope is requested. Google classifies this scope as restricted. |

Firefox's AMO manifest declares `authenticationInfo`, `personalCommunications`, and `personallyIdentifyingInfo` as required data categories. This reflects the OAuth authorization used to call Gmail, the email content read from the connected inbox, and the Gmail account address checked by the extension. The extension processes candidate email content locally and does not send OTPs or email bodies to the extension developer, analytics, or an extraction service.

There are no install-time site host grants, static content-script matches, `tabs`, `webNavigation`, `webRequest`, or externally connectable origins. The manifests declare `https://*/*` only as an optional permission template; the extension requests the exact hostnames the user allowlists. A dynamic content script is registered only after the user approves a browser permission request for that exact HTTPS origin. It runs in top-level frames only. Removing a hostname unregisters the script and removes the matching optional origin permission.

## Input and message checks

- Worker messages have a fixed type and strict payload shape. Auto-helper OTP requests are accepted only from the extension's own injected top frame; the worker rechecks both sender URL and tab URL against the saved allowlist.
- Content-script OTP requests are accepted only from the extension's injected top frame, and the worker rechecks both sender URL and tab URL against the exact allowlist.
- Hostname matching is exact; HTTP, credentials in the URL, explicit ports, sibling domains and subdomains do not pass.
- The parser checks the actual From mailbox, subject substring, internal timestamp, freshness, code length and contextual regex capture. Configurable regexes are bounded and reject broad wildcards, backreferences and repeated groups. HTML script/style/head content and tags are stripped before extraction.
- Email bodies are bounded in size, patterns are bounded in length/count, message list size is capped, and IDs are validated before fetch.

## Inline fill behavior and limits

The helper uses a closed Shadow DOM for controls and never displays the OTP. On an allowlisted website, a blank email-type input receives the configured account when focused. The OTP is written only after the user clicks the helper. For Angular and other controlled forms, the helper dispatches ordinary `input` and `change` events so the page's form model updates; those event handlers can read the filled field value. This is inherent in submitting a code to that allowlisted site's form. The helper never submits the form, and the OTP is not put in `event.data` or a custom event.

The popup can reveal or copy a code after retrieval. Anyone with access to the signed-in Chrome profile can use the extension; use a dedicated account and lock the device.

## Production limitations

- Live Gmail access is not verified in this repository because it requires a Google Cloud OAuth client and user consent.
- `gmail.readonly` is a restricted Google scope. Google's verification, audience, and policy requirements apply before public distribution.
- OAuth client ID is a public identifier. Firefox's Desktop OAuth client secret is entered by the user at runtime and stored with the refresh token in local extension storage; it is not included in source. Desktop app clients are public clients, so this value is not a strong secret against someone who controls the browser profile. Users who share a Firefox profile should use Disconnect and avoid saving sign-in.
- Settings are user-editable local extension data and are not protected against a person who controls the Chrome profile.
