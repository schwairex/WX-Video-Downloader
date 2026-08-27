#!/usr/bin/env bash
set -euo pipefail
npm install --omit=dev
mkdir -p vendor
cp node_modules/@breezystack/lamejs/dist/lamejs.iife.js vendor/lamejs.iife.js
cp node_modules/@breezystack/lamejs/LICENSE vendor/LAMEJS-LICENSE.txt
echo 'MP3 encoder installed locally. Reload the extension.'
