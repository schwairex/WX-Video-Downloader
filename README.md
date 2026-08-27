# Personal X & Instagram Video Downloader

> **Personal / experimental browser-extension project.**  
> This repository is a small WebExtension I built for my own browser workflow and for learning browser-extension development. It is not an official X, Twitter, Meta, or Instagram product.

A privacy-focused browser extension for downloading accessible media from X and Instagram without sending media to a third-party downloader service.

## v1.3.3

v1.3.3 focuses on **Instagram download integrity**, a cleaner UI, and Story image support.

### Main fixes

- Instagram player byte-range URLs are now normalized before download.
- `bytestart`, `byteend`, and similar partial-range query parameters are removed before a source is treated as a full downloadable file.
- Instagram media is validated before the browser is allowed to save it as `.mp4` or an image.
- The extension checks the response MIME type and the beginning of the file for common MP4/WebM/image signatures.
- HTML/session/error responses are rejected instead of being saved as corrupted `.mp4` files.
- Instagram API/Relay `video_versions` sources are prioritized over raw observed player requests.
- DASH-init/audio-only MP4 URLs are filtered out of the normal video quality list.
- Duplicate unknown “Orijinal” entries were reduced.

### Instagram Stories

- Story videos continue to use the normal video downloader.
- Large Story images now receive their own **Görseli İndir** control.
- `image_versions2.candidates` Story image sources are detected when available.
- Visible Story image URLs can also be used as a direct source.
- Story images are saved under:

```text
Downloads/Instagram-Stories/Images/
```

Story videos are saved under:

```text
Downloads/Instagram-Stories/Videos/
```

## Modern UI

The in-page UI was redesigned again for v1.3.3:

- cleaner floating button,
- compact glass/dark appearance,
- SVG icons instead of text-only symbols,
- clearer hierarchy,
- platform badge,
- separate video/image menu states,
- more polished loading state,
- improved error state,
- compact quality cards,
- cleaner MP3 action,
- more subtle success/error toast notifications.

## Why the Instagram download pipeline changed

Instagram can request only a portion of a media file during playback. These URLs may contain parameters such as:

```text
bytestart=...
byteend=...
```

Saving one of those partial requests directly as `something.mp4` can create a truncated file that Windows cannot open.

v1.3.3 therefore:

1. prefers progressive media URLs exposed by Instagram's page/API data,
2. canonicalizes Instagram CDN URLs,
3. removes playback-only byte-range query parameters,
4. rejects DASH initialization/audio-only sources from normal video downloads,
5. performs a small pre-download validation request,
6. only starts the final browser download when the source looks like real video/image data.

## Browser support

The project continues to target the WebExtensions ecosystem:

- Google Chrome
- Brave
- Microsoft Edge
- Opera
- Vivaldi
- Firefox
- Safari WebExtension source compatibility

Browser stores and Safari still use their own signing/package/distribution workflows.

## Features

### X / Twitter

- Floating download button.
- Quality menu.
- MP4/WebM variants.
- Local MP3 extraction option.
- Native download notifications.

### Instagram

- Feed video support.
- Video post support.
- Reels support.
- Story video support.
- **Story image support.**
- Private-profile media that the active browser session is already authorized to view.
- Clean source download: the extension does not add a platform/UI watermark.
- Local MP3 extraction for videos.
- Pre-download media validation.
- Instagram CDN request context improvements.

## Privacy

- No analytics.
- No tracker.
- No remote downloader service.
- No remote MP3 conversion API.
- No account credentials are exported.
- No private-profile access-control bypass.
- No continuous clipboard polling.
- Temporary media cache is local to the browser extension.
- MP3 processing is local and starts only after explicit user action.

## Installation

### Chromium browsers

1. Download or clone the project.
2. Open the browser extension page.
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select the folder that contains `manifest.json`.
6. Reload any open X / Instagram tabs.

Examples:

- Chrome: `chrome://extensions`
- Brave: `brave://extensions`
- Edge: `edge://extensions`
- Vivaldi: `vivaldi://extensions`

### Firefox

For temporary development/testing:

1. Open `about:debugging#/runtime/this-firefox`.
2. Select **Load Temporary Add-on**.
3. Select `manifest.json`.
4. Reload X / Instagram.

## Optional MP3 setup

The extension includes optional local MP3 extraction support.

Windows:

```powershell
.\setup-mp3.ps1
```

macOS / Linux:

```bash
./setup-mp3.sh
```

Then reload the extension.

## Project structure

```text
personal-social-video-downloader/
├── manifest.json
├── rules.json
├── background.js
├── page-hook.js
├── content.js
├── content.css
├── popup.html
├── popup.css
├── popup.js
├── audio.html
├── audio.js
├── README.md
├── CHANGELOG.md
├── THIRD_PARTY_NOTICES.md
├── setup-mp3.ps1
├── setup-mp3.sh
└── icons/
```

## Responsible use

Use this project only for content you are permitted to download, store, or use. The extension does not bypass access controls; private-account support only applies to media that the current logged-in browser session can already view.

## Trademark / affiliation notice

This project is not affiliated with, endorsed by, or sponsored by X Corp., Meta Platforms, Inc., or Instagram. Product and brand names belong to their respective owners.

---

Built for my own browser workflow and learning.
