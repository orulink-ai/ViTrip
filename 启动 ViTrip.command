#!/bin/zsh
set -e
vitrip_root="$(cd "$(dirname "$0")" && pwd)"
if [[ -d "$vitrip_root/ViTrip.app" ]]; then
  open "$vitrip_root/ViTrip.app"
  exit 0
fi
if ! command -v node >/dev/null 2>&1; then
  for vitrip_node in "$HOME"/.nvm/versions/node/*/bin; do
    [[ -x "$vitrip_node/node" ]] && export PATH="$vitrip_node:$PATH"
  done
fi
cd "$vitrip_root"
if [[ ! -d node_modules ]]; then npm ci; fi
npm start
