#!/bin/sh
# Instala Node.js apenas neste projeto, sem sudo ou alterações no perfil do shell.
set -eu
cd "$(dirname "$0")/.."
case "$(uname -s)" in
  Darwin) platform=darwin ;;
  Linux) platform=linux ;;
  *) echo 'Instale Node.js 24 e execute npm run setup.' >&2; exit 1 ;;
esac
case "$(uname -m)" in
  arm64|aarch64) arch=arm64 ;;
  x86_64) arch=x64 ;;
  *) echo 'Arquitetura não suportada por este script.' >&2; exit 1 ;;
esac
version=v24.21.0
archive="node-$version-$platform-$arch.tar.gz"
mkdir -p .tools/downloads
if [ ! -x .tools/node/bin/node ] || [ "$(.tools/node/bin/node --version)" != "$version" ]; then
  curl --fail --show-error --location "https://nodejs.org/dist/$version/$archive" -o ".tools/downloads/$archive"
  curl --fail --show-error --location "https://nodejs.org/dist/$version/SHASUMS256.txt" -o .tools/downloads/SHASUMS256.txt
  (
    cd .tools/downloads
    awk -v file="$archive" '$2 == file { print; found=1 } END { if (!found) exit 1 }' SHASUMS256.txt > selected.sha256
    shasum -a 256 -c selected.sha256
  )
  mkdir -p .tools/node
  tar -xzf ".tools/downloads/$archive" -C .tools/node --strip-components=1
fi
PATH="$PWD/.tools/node/bin:$PATH"
export PATH
export npm_config_cache="$PWD/.tools/npm-cache"
node --version
npm run check
if git rev-parse --git-dir >/dev/null 2>&1; then
  npm run setup
else
  echo 'Testes prontos. Após inicializar o Git, execute este script novamente para ativar os hooks.'
fi
