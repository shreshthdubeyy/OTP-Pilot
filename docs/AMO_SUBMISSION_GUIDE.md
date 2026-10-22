# Submit a Firefox build to Mozilla Add-ons

This guide is for a maintainer who wants Mozilla to sign an OtpPilot build. An unsigned temporary add-on is removed when Firefox closes; a signed `.xpi` can be installed normally.

## Before uploading

1. Give your Firefox build a unique ID in `manifests/manifest.firefox.json` (`browser_specific_settings.gecko.id`). The sample `@example.invalid` ID is only a placeholder and must not be submitted as-is.
2. Set your own Google Desktop app client ID in `src/shared/firefox-oauth-config.js`.
3. Change the manifest version for each new release.
4. Run `npm run package:firefox` from the project folder.

The script writes `dist/releases/OtpPilot-AMO-upload.zip` and `OtpPilot-source-code.zip`.

## Submit for signing

1. Sign in to the [AMO Developer Hub](https://addons.mozilla.org/developers/).
2. For a first submission, choose **Submit a New Add-on**. For an existing add-on, use **New Version** on that listing and preserve its assigned Gecko ID.
3. Upload `dist/releases/OtpPilot-AMO-upload.zip`.
4. Complete the requested listing, privacy and source-code information. Describe Gmail read-only access and local message parsing accurately.
5. If asked whether generated or processed source is included, select **Yes** and provide `OtpPilot-source-code.zip`.
6. After Mozilla validation and review, download the signed `.xpi` from the Developer Hub.

## Google OAuth notes

Firefox uses a Google **Desktop app** OAuth client. The add-on generates and passes its Firefox loopback callback automatically; do not paste that URL into a Google Cloud redirect field. If Google asks for a client secret during code exchange, the user enters the Desktop app `client_secret` value in Firefox Settings. Do not include a downloaded credentials JSON file in the source archive.

Add users as OAuth test users while the project remains in Testing. Google's Gmail scope is restricted, and broader distribution can require Google verification. In Testing, Gmail refresh tokens can expire after seven days.

## Package contents

The AMO ZIP contains the Firefox manifest, extension source and icons. It does not contain `dist`, credentials JSON, a client secret, Gmail password, access token, refresh token or email contents. The source ZIP contains unminified code and build instructions for Mozilla's review.
