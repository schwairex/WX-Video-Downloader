# Changelog

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
