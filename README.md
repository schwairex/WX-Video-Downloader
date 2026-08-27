# Personal X & Instagram Video Downloader

> **Personal / experimental browser-extension project.**  
> This repository is a small project I built for my own browser workflow and for learning WebExtension development. It is not an official X, Twitter, Meta, or Instagram product.

A lightweight WebExtension that adds an **İndir / Download** button to videos on X and Instagram and, when possible, lets you choose from the detected video quality variants.

## v1.3.1

v1.3.1 is a focused hotfix for the download regression introduced in v1.3.0.

- Fixed X / Twitter downloads not starting after selecting a quality.
- Fixed Instagram downloads not starting after selecting a quality.
- Fixed an internal JavaScript variable-name collision in `background.js`.
- Separated the WebExtensions API object (`browserApi`) from the downloaded file extension (`fileExtension`).
- Added an explicit downloads-API availability check.
- Added clearer background download error logging for easier debugging.
- Kept all v1.3.0 Instagram click fixes, quality selection, and cross-browser support.


## Features

### X / Twitter

- Floating video download button.
- Quality-selection menu before download.
- Detected MP4/WebM variants.
- Highest detected variant marked as **EN İYİ / BEST**.
- Downloads saved under `Downloads/X-Videos/`.

### Instagram

- Instagram Home/feed video support.
- Instagram video post support.
- Instagram Reels support.
- Quality picker when multiple variants are detected.
- Independent overlay portal so Instagram profile/reel click layers do not steal the download-button click.
- Downloads saved under `Downloads/Instagram-Videos/`.

## Browser support

The project now targets the common WebExtensions ecosystem rather than Brave only.

| Browser | Status | Local development installation |
| --- | --- | --- |
| Google Chrome | Supported | `chrome://extensions` → Developer mode → Load unpacked |
| Brave | Supported | `brave://extensions` → Developer mode → Load unpacked |
| Microsoft Edge | Supported | `edge://extensions` → Developer mode → Load unpacked |
| Opera | Supported | Extensions page → Developer mode → Load unpacked |
| Vivaldi | Supported | `vivaldi://extensions` → Developer mode → Load unpacked |
| Firefox | Supported source/API path | `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → select `manifest.json` |
| Safari | WebExtension-compatible source | Safari requires its own Web Extension packaging/distribution step |

The same JavaScript/CSS source is used across these browsers. Browser stores and Safari use their own signing/package/distribution processes.

## Why an overlay portal?

Instagram places multiple clickable layers over media. On Home and Reels, a button inserted directly into the Instagram post/video DOM can visually appear above the video while the platform's own profile/post link still receives the click.

Starting with v1.3.0, the extension:

1. Detects each visible `<video>`.
2. Creates the extension control under the page's top-level document instead of inside Instagram's link hierarchy.
3. Positions that control over the video's top-right corner.
4. Repositions it on scrolling, resizing, DOM virtualization, and Reels transitions.
5. Captures the download interaction independently from Instagram's delegated click handlers.

This keeps the same visual placement while separating the extension's click target from Instagram's own interactive layers.

## Privacy approach

- No custom download server.
- No third-party video-download API.
- No analytics.
- No tracking code.
- Detected media URLs are held temporarily in extension memory.
- Downloads are started through the browser's WebExtensions downloads API.

## Installation

### Chromium browsers

This covers Chrome, Brave, Edge, Opera, Vivaldi, and most Chromium-based desktop browsers.

1. Download or clone this repository.
2. Open your browser's extensions page.
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select the repository folder containing `manifest.json`.
6. Reload open X and Instagram tabs.

### Firefox

For development/testing:

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on**.
3. Select `manifest.json`.
4. Reload X or Instagram.

A permanently distributed Firefox extension normally goes through Firefox's signing/distribution process.

### Safari

The source is structured as a WebExtension-compatible project, but Safari does not use Chromium's normal “Load unpacked” workflow. Package/import the WebExtension using Apple's Safari Web Extension tooling for the Safari version you target.

## Project structure

```text
personal-social-video-downloader/
├── manifest.json
├── background.js
├── page-hook.js
├── content.js
├── content.css
├── README.md
├── CHANGELOG.md
└── .gitignore
```

### `page-hook.js`

Runs in the webpage's main JavaScript world and observes media-related page/network data exposed to the browser.

### `content.js`

Detects videos, creates the independent overlay portals, renders the quality picker, and communicates with the extension background context.

### `background.js`

Stores detected media variants temporarily per tab and starts the selected download.

## Limitations

This is a best-effort personal project. X and Instagram can change their frontend, media endpoints, or playback system at any time, so future site changes may require updates.

The project is not intended for:

- DRM bypassing,
- access-control bypassing,
- private-content circumvention,
- mass/profile scraping,
- bulk archival systems.

## Responsible use

Use the extension only for content you are allowed to download, store, or use. Being able to view a video on a platform does not automatically grant permission to redistribute it.

## Trademark / affiliation notice

This project is not affiliated with, endorsed by, or sponsored by X Corp., Meta Platforms, Inc., or Instagram. Product and brand names belong to their respective owners.

---

Built for my own browser workflow and learning.
