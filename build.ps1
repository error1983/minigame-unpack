$ErrorActionPreference = "Stop"

if (-not (Test-Path dist)) {
    New-Item -ItemType Directory -Path dist | Out-Null
}

Write-Host ">>> Step 0: Restoring npm dependencies..." -ForegroundColor Cyan
if (Test-Path package-lock.json) {
    npm ci
} else {
    npm install
}
if ($LASTEXITCODE -ne 0) { throw "npm dependency restore failed (exit code $LASTEXITCODE)" }

Write-Host ">>> Step 1: Bundling with esbuild..." -ForegroundColor Cyan
npx esbuild main.js `
    --bundle `
    --platform=node `
    --outfile=app.bundled.js `
    --format=cjs `
    --external:zlib --external:fs --external:path --external:stream `
    --external:buffer --external:util --external:crypto --external:net `
    --external:http --external:https --external:url --external:events `
    --external:child_process --external:os

Write-Host ">>> Step 2: Generating SEA blob..." -ForegroundColor Cyan
node --experimental-sea-config sea-config.json

Write-Host ">>> Step 3: Copying node binary..." -ForegroundColor Cyan
Copy-Item (Get-Command node).Source -Destination dist/bmu.exe -Force

Write-Host ">>> Step 4: Injecting blob into executable..." -ForegroundColor Cyan
npx postject dist/bmu.exe NODE_SEA_BLOB sea-prep.blob `
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 `
    --overwrite

Write-Host ">>> Done! Output: .\dist\bmu.exe" -ForegroundColor Green
Write-Host ("    Size: {0:N2} MB" -f ((Get-Item dist/bmu.exe).Length / 1MB))