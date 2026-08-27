# Changelog

## [1.3.2] - 2026-08-27

### Fixed
- Fixed the core click regression that caused the **İndir** button to appear but do nothing on both X / Twitter and Instagram.
- Removed the v1.3.0/v1.3.1 document-level capture behavior that stopped the click event before the extension's own button handler could receive it.
- Rebuilt extension interactions around a **window-capture action router**, so the extension handles its own button and quality-menu clicks before X/Instagram page handlers can steal them.
- The quality panel now opens **immediately** on click and displays a loading state instead of failing silently.
- Added an on-demand media re-scan and automatic retry before reporting that a source was not found.
- Added short-lived storage-backed media caching so Manifest V3 background service-worker suspension no longer wipes all detected media variants.

### Added
- **Instagram Story video support** for stories visible to the authenticated browser session.
- **Accessible private-profile support**: videos already authorized and visible through the current logged-in session can use the normal download path; no access-control bypass is performed.
- **Clean/original source downloads**: the extension downloads the raw media resource without adding Instagram/X UI or a platform watermark. Creator-embedded marks are not removed.
- **Audio-only mode** with local MP3 encoding support.
- Added `setup-mp3.ps1` / `setup-mp3.sh` for installing the local LGPL-3.0 MP3 encoder without remote runtime code.
- Added a modern extension popup with a dark visual system, consistent typography, current-tab status and privacy indicators.
- Added supported-link clipboard detection when the popup is opened.
- Added system notifications for completed and interrupted downloads.

### Privacy & Performance
- Added a 12-minute capped per-tab media cache instead of an unbounded long-lived memory store.
- No continuous clipboard polling.
- No analytics, trackers, remote conversion API or user-data collection.
- MP3 conversion runs locally and only after the user explicitly chooses **Sadece Ses**.
- Private-profile handling relies only on the user's existing authorized session and visible media.

### UI/UX
- Redesigned the quality menu with a loading state, retry state, BEST-quality badge, audio-only action and clean-source notice.
- Added a dark-mode extension popup and clearer download status feedback.

### Notes
v1.3.2 is primarily a reliability release. The most important change is the complete repair of the interaction path that prevented the download/quality UI from responding in v1.3.0 and v1.3.1.
