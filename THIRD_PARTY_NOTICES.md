# Third-party notices

## Runtime dependencies

v1.4.0 does **not** require an external runtime downloader, analytics library,
MP3 encoder package, remote conversion API, or setup-time npm dependency.

The previous optional `@breezystack/lamejs` setup has been removed from the
distributed extension. Audio-only export now uses browser-native WebCodecs AAC
when available and a built-in PCM WAV encoder as the compatibility fallback.

## README badges

The GitHub README uses badge images served by **Shields.io** for presentation
only. Shields.io is not loaded or contacted by the installed browser extension.

Shields.io project: `https://github.com/badges/shields`
