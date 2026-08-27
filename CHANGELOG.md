# Changelog

## [1.4.0] - 2026-08-27

### Fixed — Instant Quality Menu
- Removed the intentional `150 ms` and `500 ms` waits from the download-menu flow.
- Fixed X / Twitter downloads showing **Kaynak hazırlanıyor** before the quality list.
- Fixed Instagram downloads showing the same unnecessary preparation state.
- Added a content-script-side media variant cache so detected quality options do not require a background/storage round trip when the user clicks **İndir**.
- Added automatic prewarming for visible media controls.
- Visible X and Instagram media now request/cache quality data before user interaction.
- Changed background `GET_VARIANTS` handling to use the in-memory cache first and storage hydration only as a fallback.
- The menu now paints immediately.
- When the website genuinely has not loaded any media source yet, the menu shows an immediate retry/error state instead of an indefinite loading screen.
- Background refreshes can update an already-open menu without blocking its first render.

### Changed — Zero-Setup Audio Export
- Removed the post-install `setup-mp3.ps1` / `setup-mp3.sh` requirement.
- Removed the placeholder/optional MP3 encoder dependency from the distributed extension.
- Removed the **“MP3 encoder modülü kurulu değil”** runtime error.
- Audio-only export now works directly after installing the extension.
- Added browser-native **AAC/ADTS 192 kbps** export through WebCodecs when supported.
- Added a built-in **lossless WAV** fallback when native AAC encoding is unavailable.
- Audio processing remains local to the browser.
- No remote audio conversion API is used.
- No npm install is required for end users.
- Updated the in-page audio option from a hard-coded MP3 promise to a browser-compatible **AUDIO** action.

### Performance
- Added a bounded local quality cache inside `content.js`.
- Quality variants are associated with visible media before the download menu is opened.
- Preserved the existing short-lived background cache while making it secondary to the instant content-side path.
- Kept all caching local and bounded to avoid continuous RAM growth.
- No new polling-heavy background process was introduced.

### README / GitHub
- Completely redesigned `README.md`.
- Added Shields.io badges for:
  - version,
  - Manifest V3,
  - privacy/tracker-free status,
  - supported social platforms,
  - browser compatibility,
  - audio export,
  - project status,
  - runtime dependency status.
- Added a detailed feature overview.
- Added full installation instructions for Chromium browsers, Firefox, and Safari WebExtension packaging.
- Added usage guides for:
  - video downloads,
  - Instagram Story images,
  - audio-only export,
  - clipboard detection.
- Added a browser-support table.
- Added a supported-content table.
- Added a permissions explanation.
- Added architecture documentation.
- Added project-file documentation.
- Added troubleshooting guidance.
- Expanded privacy, responsible-use, private-profile, and watermark behavior documentation.

### Removed
- Removed `setup-mp3.ps1`.
- Removed `setup-mp3.sh`.
- Removed the optional `vendor/lamejs.iife.js` placeholder/runtime setup workflow.
- Removed the npm runtime dependency on `@breezystack/lamejs`.
- Removed the requirement for users to install anything after loading the extension.

### Preserved
- X / Twitter video downloads.
- Instagram feed/video-post/Reels downloads.
- Instagram Story video downloads.
- Instagram Story image downloads.
- Instagram media-integrity validation.
- Already-authorized private-profile media support.
- Clipboard URL detection.
- Native download notifications.
- Modern dark UI.
- Tracker-free / analytics-free architecture.
- Cross-browser WebExtensions codebase.

### Notes
v1.4.0 is a usability and performance release. The main goal is that a user can
load the extension and immediately use both the quality menu and audio-only
export without an additional setup step.

Audio-only files are exported as AAC where native browser support is available,
with WAV as the automatic compatibility fallback.

## [1.3.3] - 2026-08-27

### Fixed — Instagram Download Integrity
- Fixed Instagram downloads producing an `instagram_video.mp4` file that Windows could not open.
- Fixed cases that resulted in Windows media errors such as `0xC00D36C4` and `0xC00D36E5`.
- Instagram playback URLs containing `bytestart`, `byteend`, or similar partial-range parameters are now normalized before download.
- Added pre-download media validation for Instagram sources.
- The extension now checks the HTTP response type and initial file bytes before saving an Instagram source as `.mp4`.
- Invalid HTML/session/error responses are rejected instead of being saved with a video file extension.
- Prioritized Instagram `video_versions` / progressive API media over lower-confidence observed player requests.
- Filtered DASH initialization MP4s and audio-only DASH media from the standard Instagram video quality list.
- Reduced duplicate unknown **Orijinal** quality entries.
- Improved fallback filenames when Instagram post/story metadata is not immediately available.

### Added — Instagram Story Images
- Added download support for **image-based Instagram Stories**.
- Large visible Story images now receive a dedicated **Görseli İndir** button.
- Added support for Story image variants exposed through `image_versions2.candidates`.
- Story image downloads are stored separately under:
  - `Instagram-Stories/Images/`
- Story video downloads remain under:
  - `Instagram-Stories/Videos/`
- Added basic image-source validation before saving Story images.

### Improved — Instagram CDN Handling
- Added Instagram CDN request-header rules to preserve an Instagram referer context for extension-initiated CDN requests.
- Canonicalized Instagram CDN URLs before media caching and downloading.
- Added source-priority metadata so API/Relay progressive sources outrank raw network observations.
- Added content-type and file-signature checks for MP4, WebM, JPEG, PNG, and WebP.

### UI / UX
- Redesigned the floating **İndir** button with a cleaner compact glass/dark appearance.
- Replaced text-only download symbols with SVG icons.
- Redesigned the download menu with:
  - clearer spacing,
  - stronger typography hierarchy,
  - platform badge,
  - modern media icons,
  - improved quality cards,
  - cleaner **EN İYİ / BEST** badge,
  - improved MP3 presentation,
  - dedicated image-download menu state,
  - improved loading animation,
  - improved error/retry state.
- Refined success/error toast notifications.

### Preserved
- X / Twitter download support.
- Instagram feed/video post/Reels support.
- Instagram Story video support.
- Private-profile support through the user's already-authorized active browser session.
- Local MP3 extraction.
- Clipboard detection.
- Native download notifications.
- Tracker-free / analytics-free architecture.
- Cross-browser WebExtensions support.

### Notes
v1.3.3 specifically addresses corrupted or non-media Instagram downloads. The extension now refuses to save a response as `.mp4` when it cannot verify that the response is actual video media.

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
