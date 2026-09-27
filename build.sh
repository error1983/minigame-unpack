#!/usr/bin/env bash
set -euo pipefail

# 颜色定义
CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

info()  { echo -e "${CYAN}>>> $1${NC}"; }
ok()    { echo -e "${GREEN}>>> $1${NC}"; }
die()   { echo -e "${RED}ERROR: $1${NC}" >&2; exit 1; }

# 前置检查
command -v node   >/dev/null 2>&1 || die "node not found in PATH"
command -v npx    >/dev/null 2>&1 || die "npx not found in PATH"
command -v npm    >/dev/null 2>&1 || die "npm not found in PATH"
command -v chmod  >/dev/null 2>&1 || die "chmod not found"

NODE_BIN="$(command -v node)"
OUTPUT="dist/bmu"

mkdir -p dist

# ─── Step 0: Restore npm dependencies ─────────────────────────────────
info "Step 0: Restoring npm dependencies..."
if [ -f package-lock.json ]; then
    npm ci || die "npm dependency restore failed"
else
    npm install || die "npm dependency install failed"
fi

# ─── Step 1: Bundle with esbuild ──────────────────────────────────────
info "Step 1: Bundling with esbuild..."
npx esbuild main.js \
    --bundle \
    --platform=node \
    --outfile=app.bundled.js \
    --format=cjs \
    --external:zlib --external:fs --external:path --external:stream \
    --external:buffer --external:util --external:crypto --external:net \
    --external:http --external:https --external:url --external:events \
    --external:child_process --external:os

# ─── Step 2: Generate SEA blob ────────────────────────────────────────
info "Step 2: Generating SEA blob..."
node --experimental-sea-config sea-config.json

# ─── Step 3: Copy node binary ─────────────────────────────────────────
info "Step 3: Copying node binary..."
cp "$NODE_BIN" "$OUTPUT"
chmod 755 "$OUTPUT"

# ─── Step 4: Inject blob into executable ──────────────────────────────
info "Step 4: Injecting blob into executable..."
npx postject "$OUTPUT" NODE_SEA_BLOB sea-prep.blob \
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
    --overwrite

# ─── Done ─────────────────────────────────────────────────────────────
SIZE=$(du -h "$OUTPUT" | cut -f1)
ok "Done! Output: ./$OUTPUT"
echo -e "${GREEN}    Size: $SIZE${NC}"