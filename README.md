<div align="center">

# Personal X & Instagram Video Downloader

**A lightweight, privacy-focused WebExtension built for my own browser workflow.**

![Version](https://img.shields.io/badge/version-1.5.0-45A8FF?style=for-the-badge)
![Manifest](https://img.shields.io/badge/Manifest-MV3-5C6CF1?style=for-the-badge&logo=googlechrome&logoColor=white)
![Privacy](https://img.shields.io/badge/Privacy-Tracker--Free-28C889?style=for-the-badge&logo=proton&logoColor=white)
![Project](https://img.shields.io/badge/Project-Personal-8B5CF6?style=for-the-badge)

![X](https://img.shields.io/badge/X%20%2F%20Twitter-Supported-111111?style=flat-square&logo=x&logoColor=white)
![Instagram](https://img.shields.io/badge/Instagram-Supported-E4405F?style=flat-square&logo=instagram&logoColor=white)
![Stories](https://img.shields.io/badge/Stories-Video%20%2B%20Images-F77737?style=flat-square&logo=instagram&logoColor=white)
![Audio](https://img.shields.io/badge/Audio-AAC%20%2F%20WAV-7C3AED?style=flat-square&logo=musicbrainz&logoColor=white)
![No Remote API](https://img.shields.io/badge/Remote%20Downloader-None-16A34A?style=flat-square)
![Analytics](https://img.shields.io/badge/Analytics-None-16A34A?style=flat-square)

</div>

> [!IMPORTANT]
> This is a **personal and experimental project**. It is not affiliated with,
> endorsed by, or sponsored by X Corp., Meta Platforms, Inc., Instagram, or any
> browser vendor.

## Overview

Personal X & Instagram Video Downloader is a browser extension that adds a
compact download control directly over supported media on X and Instagram.

The project is designed around four principles:

- **Fast interaction** — quality choices are preloaded before the user clicks.
- **Local-first processing** — downloads and audio conversion stay in the browser.
- **Privacy** — no analytics, tracking SDK, remote downloader, or account export.
- **Simple installation** — load the extension and use it; no npm/setup script is
  required for normal use.

## What's new in v1.5.0?

### Instagram download stability

v1.5.0 separates Instagram's download path from slow pre-download validation.

When a quality is selected:

1. the exact selected media variant is sent to the background context,
2. the browser's `downloads.download()` call is started immediately,
3. Instagram media validation runs in parallel instead of blocking the native save flow,
4. only a definitive non-media signature can cancel an invalid download,
5. transient validation/network failures no longer prevent a valid download from starting.

This removes the delay that could occur before the browser's native save dialog
appeared.

### Resilient extension messaging

Instagram is a single-page application and aggressively replaces/recycles DOM
content while navigating Feed, Reels and Stories.

v1.5.0 adds a reconnectable runtime Port between the in-page controls and the
extension background context. If that channel is interrupted:

- the extension reconnects automatically,
- the request is retried,
- a normal one-shot runtime message is used as a compatibility fallback,
- stale extension contexts after an update trigger one controlled page reload.

This specifically targets intermittent errors such as:

```text
Could not establish connection. Receiving end does not exist.
```

### Cleaner UI

The floating button and quality menu were simplified:

- neutral dark surface,
- reduced gradients and glow,
- smaller typography,
- tighter spacing,
- softer borders,
- simpler hover states,
- less visual noise.


## Features

### X / Twitter

- Floating **İndir** button on video tweets.
- Instant quality-selection menu.
- Multiple progressive MP4/WebM variants when available.
- Highest detected quality marked as **EN İYİ**.
- Audio-only local export.
- Automatic filenames.
- Native completion/error notifications.
- Works with media already accessible through the current X session.

### Instagram

- Feed video support.
- Standard video-post support.
- Reels support.
- Story video support.
- Story image support with a separate **Görseli İndir** action.
- Instant quality menu after media has been detected.
- Instagram CDN/media-source validation before saving files.
- Filtering of known partial/DASH-init media sources.
- Support for private-profile content **only when the current logged-in browser
  session already has permission to view it**.
- Audio-only local export.
- No extra platform UI watermark is added by the extension.

### User experience

- Modern dark/glass floating interface.
- Preloaded media choices.
- Retry state only when the website has genuinely not loaded a source yet.
- Native operating-system/browser notifications.
- Extension popup with:
  - current-tab status,
  - quick “open download menu” action,
  - clipboard URL detection,
  - notification toggle,
  - clipboard toggle.
- Escape/outside-click menu dismissal.
- Responsive controls for smaller browser windows.

### Privacy & performance

- No analytics.
- No tracker.
- No remote download API.
- No remote audio conversion service.
- No continuous clipboard polling.
- No exported Instagram/X cookies.
- No credential collection.
- No background media transcoding unless the user explicitly selects
  **Sadece Ses**.
- Bounded, short-lived media caches.
- Manifest V3 service-worker architecture on Chromium browsers.

## Supported content

| Platform | Content | Status |
| --- | --- | --- |
| X / Twitter | Video tweets | ✅ Supported |
| X / Twitter | Audio-only export | ✅ Supported |
| Instagram | Feed videos | ✅ Supported |
| Instagram | Video posts | ✅ Supported |
| Instagram | Reels | ✅ Supported |
| Instagram | Story videos | ✅ Supported |
| Instagram | Story images | ✅ Supported |
| Instagram | Already-authorized private-profile media | ✅ Supported |
| Instagram | Access-control bypass | ❌ Not supported |
| DRM-protected media | Protected content | ❌ Not supported |

## Browser support

![Chrome](https://img.shields.io/badge/Chrome-Supported-4285F4?style=flat-square&logo=googlechrome&logoColor=white)
![Brave](https://img.shields.io/badge/Brave-Supported-FB542B?style=flat-square&logo=brave&logoColor=white)
![Edge](https://img.shields.io/badge/Edge-Supported-0A84FF?style=flat-square&logo=microsoftedge&logoColor=white)
![Opera](https://img.shields.io/badge/Opera-Supported-FF1B2D?style=flat-square&logo=opera&logoColor=white)
![Vivaldi](https://img.shields.io/badge/Vivaldi-Supported-EF3939?style=flat-square&logo=vivaldi&logoColor=white)
![Firefox](https://img.shields.io/badge/Firefox-WebExtension-FF7139?style=flat-square&logo=firefoxbrowser&logoColor=white)
![Safari](https://img.shields.io/badge/Safari-WebExtension-006CFF?style=flat-square&logo=safari&logoColor=white)

| Browser | Development installation |
| --- | --- |
| Google Chrome | `chrome://extensions` → Developer mode → Load unpacked |
| Brave | `brave://extensions` → Developer mode → Load unpacked |
| Microsoft Edge | `edge://extensions` → Developer mode → Load unpacked |
| Opera | Extensions → Developer mode → Load unpacked |
| Vivaldi | `vivaldi://extensions` → Developer mode → Load unpacked |
| Firefox | `about:debugging#/runtime/this-firefox` → Load Temporary Add-on |
| Safari | Package/import using Apple's Safari Web Extension tooling |

> [!NOTE]
> Safari and browser stores have their own signing and packaging workflows.
> “Load unpacked” instructions apply primarily to Chromium development builds.

## Installation

### Chrome / Brave / Edge / Opera / Vivaldi

1. Download the project ZIP or clone the repository.
2. Extract the project to a permanent folder.
3. Open your browser's extensions page.
4. Enable **Developer mode**.
5. Select **Load unpacked**.
6. Choose the folder containing `manifest.json`.
7. Reload any X or Instagram tabs that were already open.

For Brave:

```text
brave://extensions
```

For Chrome:

```text
chrome://extensions
```

For Edge:

```text
edge://extensions
```

### Firefox

For temporary development/testing:

1. Open:

```text
about:debugging#/runtime/this-firefox
```

2. Select **Load Temporary Add-on**.
3. Select the project's `manifest.json`.
4. Reload X or Instagram.

Permanent Firefox distribution normally requires Mozilla's extension signing
workflow.

### Safari

The codebase follows the WebExtensions model, but Safari uses its own packaging
workflow. Import/package the extension using Apple's Safari Web Extension tools
for the Safari version you target.

## Usage

### Download a video

1. Open X or Instagram.
2. Scroll to a supported video.
3. Wait only for the website itself to display/load the video.
4. Click the extension's **İndir** button.
5. Quality choices appear immediately when they have already been detected.
6. Select the desired source.

Downloads are grouped into folders such as:

```text
Downloads/
├── X-Videos/
├── Instagram-Videos/
└── Instagram-Stories/
    ├── Images/
    └── Videos/
```

### Download an Instagram Story image

1. Open an image-based Instagram Story.
2. Use **Görseli İndir** on the displayed Story media.
3. The original accessible image source is saved under:

```text
Instagram-Stories/Images/
```

### Export only the audio

1. Open the download menu for a video.
2. Select **Sadece Ses**.
3. The extension decodes the media locally.
4. It chooses the best built-in export path:
   - AAC when supported,
   - WAV otherwise.
5. The audio file is saved under:

```text
Downloads/Audio/
```

No additional encoder installation is required.

## Why audio is AAC/WAV instead of requiring an MP3 setup

Browser WebCodecs implementations broadly support AAC/Opus encoding, but MP3
encoding is not generally provided as a native WebCodecs encoder. Rather than
requiring every user to install a third-party encoder after installing the
extension, v1.4.0 uses a zero-setup native/local pipeline.

This keeps the extension:

- easier to install,
- fully local,
- free from runtime CDN code,
- free from remote conversion APIs.

## Clipboard detection

The popup can check the clipboard **when the popup is opened**.

Supported links include:

```text
https://x.com/.../status/...
https://twitter.com/.../status/...
https://www.instagram.com/reel/...
https://www.instagram.com/p/...
https://www.instagram.com/stories/...
```

The extension does not continuously poll the clipboard in the background.

## Private Instagram profiles

Private-profile support does **not** mean bypassing Instagram privacy controls.

The extension can reuse media that the active logged-in browser session has
already been authorized to receive — for example, a private account you already
follow and can normally view in Instagram.

It does not:

- discover inaccessible private posts,
- bypass follow approval,
- export passwords,
- export cookies,
- circumvent authentication.

## Clean / no added watermark behavior

The extension saves the media source delivered to the browser. It does not
render the Instagram/X web interface into the downloaded file and it does not
add its own logo or watermark.

If the content creator uploaded a video that already contains a visible
watermark, logo, caption, or other baked-in graphic, that remains part of the
source media.

## Permissions

The project requests only permissions used by its features.

| Permission | Purpose |
| --- | --- |
| `downloads` | Start and observe browser downloads |
| `webRequest` | Detect media requests already made by supported sites |
| `storage` | Small temporary cache and user settings |
| `notifications` | Optional download status notifications |
| `tabs` | Popup/current-tab integration |
| `clipboardRead` | Clipboard URL detection when enabled |
| `offscreen` | Local audio decoding/export in Chromium MV3 |
| `declarativeNetRequest` | Preserve appropriate Instagram CDN request context |

Host access is limited to X/Twitter, Instagram, and their relevant media CDN
domains.

## Architecture

```text
Page / X / Instagram
        │
        ▼
page-hook.js
        │  detects media/API variants
        ▼
content.js
        │  local instant cache + UI + prewarming
        ▼
background.js
        │  bounded tab cache + validation + downloads
        ├──────────────► Browser Downloads API
        │
        └──────────────► audio.html / audio.js
                         local AAC or WAV export
```

### `page-hook.js`

Runs in the page's main JavaScript world and observes media-related data already
being delivered to the browser.

### `content.js`

Handles:

- media overlays,
- instant local variant cache,
- prewarming,
- quality UI,
- Story image UI,
- clipboard event support,
- communication with the background context.

### `background.js`

Handles:

- bounded tab-level media cache,
- source selection,
- Instagram media validation,
- filenames/folders,
- actual browser downloads,
- audio-export orchestration,
- native notifications.

### `audio.js`

Runs locally in the extension context. It:

1. fetches the selected accessible media,
2. decodes its audio track,
3. tries native AAC/ADTS encoding,
4. falls back to WAV if needed,
5. returns a local blob URL for download.

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
├── icons/
├── README.md
├── CHANGELOG.md
├── THIRD_PARTY_NOTICES.md
├── package.json
└── .gitignore
```

## Development checks

No dependency installation is required for the extension itself.

If Node.js is installed, JavaScript syntax can be checked with:

```bash
npm run check
```

or directly:

```bash
node --check background.js
node --check page-hook.js
node --check content.js
node --check popup.js
node --check audio.js
```

## Troubleshooting

### The download button is visible but no quality is listed

The extension no longer intentionally waits before opening the menu. If there
are genuinely no choices yet, the website itself has not exposed a downloadable
source.

Try:

1. Make sure the actual video is visible.
2. Start playback briefly if the site has not loaded the media yet.
3. Use **Tekrar Dene**.
4. Reload the X/Instagram tab after upgrading the extension.

### Instagram downloaded an invalid file

v1.3.3+ validates Instagram media before saving it. If Instagram returns an
HTML/session/error response instead of real media, the extension should show an
error instead of creating a fake `.mp4`.

### Audio export produces WAV

This means the current browser/platform does not expose compatible native AAC
encoding. WAV is the built-in zero-setup fallback and contains uncompressed
audio.

### The extension was updated but old behavior remains

After replacing an unpacked extension build:

1. Reload the extension from the extensions page.
2. Hard-refresh existing X/Instagram tabs.
3. If necessary, close and reopen the affected tab.

Content scripts from an older build can remain in tabs that were never reloaded.

## Privacy model

The extension does not collect or transmit usage telemetry.

No remote server receives:

- video URLs for conversion,
- account credentials,
- browsing history,
- clipboard history,
- downloaded media,
- audio PCM data.

All processing is performed inside the browser using the active user's normal
session permissions.

## Responsible use

Use this extension only for media you are permitted to download, store, or use.

Being able to view content does not automatically grant the right to republish,
redistribute, monetize, or otherwise reuse it. Respect content owners' rights
and the applicable platform terms.

## Project status

![Status](https://img.shields.io/badge/status-Experimental-F59E0B?style=flat-square)
![Runtime dependencies](https://img.shields.io/badge/runtime%20dependencies-0-22C55E?style=flat-square)
![Remote conversion](https://img.shields.io/badge/remote%20conversion-none-22C55E?style=flat-square)

This repository is maintained as a personal learning/workflow project. X and
Instagram can change their frontend or media-delivery implementation at any
time, so site compatibility may require future updates.

## Changelog

See [`CHANGELOG.md`](CHANGELOG.md) for release history.

## Acknowledgements

README badges are rendered using
[Shields.io](https://github.com/badges/shields). Shields.io is used only by the
GitHub README and is not part of the installed extension runtime.

## Trademark / affiliation notice

X, Twitter, Instagram, Meta, Chrome, Brave, Firefox, Edge, Safari, Opera and
Vivaldi names/logos belong to their respective owners.

This personal project is not affiliated with or endorsed by those companies.

---

<div align="center">

**Built for my own browser workflow, privacy, and learning.**

![Local First](https://img.shields.io/badge/Local--First-Yes-28C889?style=for-the-badge)
![Telemetry](https://img.shields.io/badge/Telemetry-None-28C889?style=for-the-badge)

</div>
