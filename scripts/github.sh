#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if command -v gh >/dev/null 2>&1; then
  exec gh "$@"
fi
for cli in .tools/github-cli/*/bin/gh; do
  if [ -x "$cli" ]; then
    exec "$cli" "$@"
  fi
done
echo 'GitHub CLI não encontrado. Instale-o pelo site oficial https://cli.github.com/ e execute gh auth login.' >&2
exit 1
