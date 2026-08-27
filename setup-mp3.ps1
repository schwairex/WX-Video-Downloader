$ErrorActionPreference = 'Stop'
npm install --omit=dev
New-Item -ItemType Directory -Force -Path vendor | Out-Null
Copy-Item 'node_modules/@breezystack/lamejs/dist/lamejs.iife.js' 'vendor/lamejs.iife.js' -Force
Copy-Item 'node_modules/@breezystack/lamejs/LICENSE' 'vendor/LAMEJS-LICENSE.txt' -Force
Write-Host 'MP3 encoder installed locally. Reload the extension.' -ForegroundColor Green
