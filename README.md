# Personal X & Instagram Video Downloader

> Personal / experimental project for my own browser workflow. No analytics, no remote download API, no tracking.

## v1.3.2

This release rebuilds the interaction and media-cache path after the v1.3.x download regression. The download UI now handles clicks at the window capture layer, opens the quality panel immediately, re-scans page media on demand, and keeps a small short-lived per-tab media cache so Manifest V3 service-worker suspension does not erase all detected variants.

### Highlights
- X / Twitter video downloads restored.
- Instagram video/Reels downloads restored.
- Instagram Story video support for stories already visible to the logged-in user.
- Active-session support for private profiles the user can already view. The extension does not bypass access controls or request private content the account cannot access.
- Raw/original media download: the extension does not add a platform watermark or UI overlay. Watermarks already embedded by the creator remain part of the source file.
- Modern dark popup UI.
- Clipboard URL detection when the popup is opened.
- OS download-complete / interrupted notifications.
- Tracker-free short-lived media cache.
- Optional local MP3 audio extraction.

## Important: MP3 setup
True MP3 encoding is not provided natively by all major browsers. To keep the extension private and avoid uploading media to an external conversion service, MP3 encoding is performed locally with `@breezystack/lamejs`.

On Windows run once:
```powershell
.\setup-mp3.ps1
```
Then reload the extension. The script installs the encoder into `vendor/`; the extension never downloads executable code at runtime. The encoder is LGPL-3.0 and its license file is copied alongside it.

## Browser support
The main code follows the WebExtensions API model. Chromium browsers use the MV3 service worker. Firefox/Safari may require manifest packaging adjustments for store distribution; local/source compatibility remains best-effort.

## Instagram Stories and private profiles
The extension only works with media the current browser session has already been authorized to view and load. It does not discover, unlock, or bypass private content. For Stories, open the Story normally; when its video is visible, the same floating download control appears.

## Clipboard behavior
The popup reads the clipboard only when the extension popup is opened and only treats X/Twitter/Instagram media URLs as relevant. Unrelated clipboard text is ignored and is not uploaded anywhere.

## Privacy / performance
- no analytics
- no remote downloader API
- no background clipboard polling
- no cookie export
- no private-profile bypass
- short-lived tab media cache (12 minutes, capped)
- media/audio processing only starts after user action

## Files
```text
manifest.json
background.js
page-hook.js
content.js
content.css
popup.html
popup.js
popup.css
audio.html
audio.js
icons/
vendor/
setup-mp3.ps1
setup-mp3.sh
CHANGELOG.md
```

## Responsible use
Only download media you have permission to save or use. Access to a post does not automatically grant redistribution rights.

This project is not affiliated with X Corp., Meta Platforms, Inc., or Instagram.
