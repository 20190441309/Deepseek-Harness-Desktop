#!/usr/bin/env bash
# Cloud-agent / fresh-VM setup. Node pinning has a single source: .nvmrc
# (engines ^22.19.0 || >=24). The default VM node can lag behind (e.g.
# 22.14), which breaks the vendor build (tsdown requires a matching engine),
# so align via nvm before installing dependencies.
set -euo pipefail
cd "$(dirname "$0")/.."

want="$(tr -d '[:space:]' < .nvmrc)"
have="$(node --version 2>/dev/null || echo none)"
if [ "$have" != "v$want" ]; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # nvm.sh is not set -u clean.
    set +u
    . "$NVM_DIR/nvm.sh"
    nvm install "$want"
    nvm alias default "$want"
    nvm use "$want"
    set -u
  else
    echo "warning: node $have != v$want and nvm is unavailable; install Node $want manually" >&2
  fi
fi
node --version

npm ci
node node_modules/pnpm/bin/pnpm.cjs --dir vendor/deepseek-harness install --frozen-lockfile
