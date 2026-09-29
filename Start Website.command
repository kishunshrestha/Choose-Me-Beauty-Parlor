#!/bin/zsh
set -e
cd "$(dirname "$0")"
# Prefer an installed Node.js. Use this Mac's bundled runtime if needed.
if ! command -v node >/dev/null 2>&1; then
  export PATH="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH"
fi
if ! command -v node >/dev/null 2>&1; then
  echo 'Please install Node.js 24 or later, then open this file again.'
  read 'reply?Press Return to close.'
  exit 1
fi
if [[ ! -d node_modules ]]; then
  if command -v pnpm >/dev/null 2>&1; then pnpm install --frozen-lockfile; else npm install; fi
fi
if [[ ! -f dist/index.html ]]; then
  if command -v pnpm >/dev/null 2>&1; then pnpm build; else npm run build; fi
fi
echo 'Choose Me website: http://localhost:3000'
echo 'Admin panel: http://localhost:3000/admin'
echo 'Read ADMIN-ACCESS.txt for your private login.'
echo 'Keep this window open. Press Control-C to stop the website.'
exec node --env-file-if-exists=.env backend/index.mjs
