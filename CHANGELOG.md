# Changelog

## [1.3.1] - 2026-08-27

### Fixed
- Fixed a regression where videos could no longer be downloaded from **X / Twitter** after selecting a quality.
- Fixed the same download regression on **Instagram** video posts and Reels.
- Fixed an internal JavaScript variable-name collision in `background.js`.
- The browser WebExtensions API object and the downloaded file extension were both using the name `ext` in v1.3.0. Inside the download function, `"mp4"` / `"webm"` overwrote access to the extension API, causing the final download call to fail.
- Renamed the browser API object to `browserApi`.
- Renamed the media file-extension value to `fileExtension`.

### Improved
- Added an explicit check that the browser `downloads` API is available before starting a download.
- Added clearer background error logging when a browser download request fails.
- Added a small messaging helper in the content script so communication with the background context fails with a clearer error message when unavailable.
- Reduced the chance of similar API-variable collisions in future versions by using more descriptive variable names.

### Compatibility
- Preserves the v1.3.0 cross-browser WebExtensions architecture.
- Preserves support targets for Chrome, Brave, Edge, Opera, Vivaldi, Firefox, and Safari WebExtension packaging.
- No changes were made to the Instagram overlay-portal click fix introduced in v1.3.0.

### Notes
v1.3.1 is a **hotfix release** focused specifically on restoring video downloads on both supported platforms after the v1.3.0 regression.

## [1.3.0] - 2026-08-27

### Fixed
- Fixed the Instagram Reels issue where the **İndir** button was visible on `instagram.com/reels` but could not be clicked.
- Fixed Instagram Home/feed posts where Instagram's profile/post interaction layer could intercept the extension's download-button click.
- Fixed download-button interaction conflicts caused by nested Instagram links and delegated click handlers.
- Improved handling of Instagram's virtualized/recycled video elements while scrolling through Reels.

### Changed
- Reworked the video-button UI into an independent **top-level overlay portal** that visually follows the video without being inserted into Instagram's clickable DOM.
- Added automatic overlay repositioning on scroll, resize, Reels transitions, and dynamic page updates.
- Added extra pointer/click isolation so platform UI layers cannot steal normal extension interactions.
- Replaced Brave-specific wording and assumptions with a cross-browser WebExtensions architecture.
- Added a `browser` / `chrome` API compatibility layer.

### Browser Support
- Added support for Chromium-based browsers, including:
  - Google Chrome
  - Brave
  - Microsoft Edge
  - Opera
  - Vivaldi
- Added Firefox-compatible Manifest V3 background handling.
- Prepared the same source code for Safari WebExtension packaging.
- Added cross-browser background fallback using both Manifest V3 service-worker and background-script declarations.

### Documentation
- Updated `README.md` with cross-browser installation instructions.
- Added separate setup notes for Chromium browsers, Firefox, and Safari.
- Documented the new Instagram overlay-portal architecture and why it fixes the click-conflict issue.

### Notes
- Safari uses its own WebExtension packaging/distribution workflow; the source is prepared for that workflow rather than being installed with Chromium's **Load unpacked** button.
- This remains a personal, experimental project and may require updates when X or Instagram changes its web interface.
