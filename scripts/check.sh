#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ -x .tools/node/bin/node ]; then
  PATH="$PWD/.tools/node/bin:$PATH"
  export PATH
fi
command -v node >/dev/null 2>&1 || { echo 'Node.js ausente. Execute: sh scripts/bootstrap.sh' >&2; exit 1; }
export npm_config_cache="$PWD/.tools/npm-cache"
exec npm run check
