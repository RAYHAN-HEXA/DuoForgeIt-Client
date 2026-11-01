#!/usr/bin/env bash
# Vendor the compiled @tsh/shared output into an app so the app is fully
# self-contained on deploy hosts that only receive the app directory
# (e.g. Vercel CLI uploads with Root Directory flattening).
#
# Resolution happens via tsconfig `paths` ("@tsh/shared" → ./src/vendor-shared),
# so no node_modules workspace symlink is involved at build or bundle time.
#
# Usage: npm run sync:shared   (from apps/web or apps/api — npm sets PWD to the app dir)
set -euo pipefail

APP_DIR="$(pwd -P)"

# On deploy sandboxes the monorepo root isn't present — the committed vendor
# copy is used as-is.
if [ ! -d "$APP_DIR/../../packages/shared/dist" ]; then
  if [ -d "$APP_DIR/src/vendor-shared" ]; then
    echo "[sync:shared] monorepo root not found — using committed vendor copy"
    exit 0
  fi
  echo "[sync:shared] FATAL: no monorepo root and no vendor copy" >&2
  exit 1
fi

echo "[sync:shared] rebuilding @tsh/shared…"
npm run build --prefix "$APP_DIR/../../packages/shared" >/dev/null

echo "[sync:shared] vendoring into src/vendor-shared…"
rm -rf "$APP_DIR/src/vendor-shared"
mkdir -p "$APP_DIR/src/vendor-shared"
cp -R "$APP_DIR/../../packages/shared/dist/." "$APP_DIR/src/vendor-shared/"
# Compiled output is ESM — pin module type so the nearest package.json
# (the app's, which is CJS-default) doesn't flip these files to CJS.
printf '{"name":"@tsh/shared","version":"0.1.0","type":"module","main":"./index.js","types":"./index.d.ts","sideEffects":false}\n' > "$APP_DIR/src/vendor-shared/package.json"
printf '# Vendored from packages/shared/dist — regenerate with `npm run sync:shared`.\n# Do not edit.\n' > "$APP_DIR/src/vendor-shared/VENDORED.md"
if [ -d "$APP_DIR/node_modules/@tsh/shared" ]; then
  rm -rf "$APP_DIR/node_modules/@tsh/shared"
  cp -R "$APP_DIR/src/vendor-shared/." "$APP_DIR/node_modules/@tsh/shared/"
  echo "[sync:shared] refreshed node_modules/@tsh/shared copy"
fi
echo "[sync:shared] done"
