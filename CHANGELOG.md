# Changelog

## [1.5.0] - 2026-08-27

### Fixed — Instagram Download Stability
- Fixed intermittent Instagram downloads failing with **“Could not establish connection. Receiving end does not exist.”**
- Fixed cases where selecting an Instagram quality could silently do nothing.
- Fixed cases where the browser's native save/download flow appeared much later than it did on X / Twitter.
- Reworked the Instagram critical download path so media validation no longer blocks the initial `downloads.download()` call.
- The exact variant selected in the quality menu is now sent directly to the background context together with its resolution/source metadata.
- Removed extension-storage hydration from the critical path of a selected download.
- Browser download initiation now happens immediately from the already-selected signed media URL.
- Instagram media validation now runs **in parallel** after the browser download request has started.
- Only definitive non-media file-signature failures can cancel a started Instagram download.
- Temporary network, validation, CORS or CDN-check failures no longer cancel otherwise valid downloads.
- Added safe same-media-family fallback candidates when a selected source is rejected by the browser.
- Prevented Instagram feed fallbacks from accidentally selecting media from a different post when a shortcode is unavailable.

### Fixed — Extension Messaging
- Added a reconnectable long-lived runtime Port for page → background communication.
- Added automatic reconnection when the background port disconnects.
- Added request IDs and response correlation for Port messages.
- Added one automatic Port retry for transient Manifest V3 service-worker wake-up races.
- Added `runtime.sendMessage()` fallback for compatibility.
- Added a second one-shot retry for transient **receiving end** / connection errors.
- Added a lightweight `PING` request path for connection diagnostics.
- Added controlled recovery for stale extension contexts after an unpacked-extension update.
- Download/audio requests use a long timeout so a native save dialog being open is not treated as a failed extension request.

### Performance / Reliability
- Kept X / Twitter's already-working download path behavior intact.
- Instagram no longer waits on a synchronous preflight fetch before the save flow begins.
- Download validation remains available without sitting in front of the user's browser dialog.
- Failed browser download initialization can fall back to another variant from the same media/post family.
- Kept caches bounded and local.

### UI / UX
- Redesigned the floating **İndir** button with a simpler neutral dark appearance.
- Reduced heavy gradients, glow and visual effects.
- Reduced button height and padding.
- Simplified the quality-menu surface.
- Reduced menu width and visual density.
- Simplified typography and secondary labels.
- Reduced icon sizes and badge prominence.
- Simplified hover states.
- Simplified the bottom source-status note.
- Simplified toast notifications.
- Preserved responsive/mobile behavior.

### Preserved
- X / Twitter quality downloads.
- Instagram Feed, Post and Reels downloads.
- Instagram Story video downloads.
- Instagram Story image downloads.
- Audio-only AAC/WAV export.
- Instagram source canonicalization.
- Invalid-media protection.
- Already-authorized private-profile support.
- Clipboard URL detection.
- Native download notifications.
- Tracker-free / analytics-free architecture.
- Cross-browser WebExtensions architecture.

### Notes
v1.5.0 is primarily a **stability release** for Instagram.

The most important behavioral change is that Instagram's native browser download
flow is now started first, while integrity validation happens independently in
parallel. This makes the user interaction much closer to the already-stable
X / Twitter download experience.

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
