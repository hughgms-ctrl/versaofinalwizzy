#!/bin/sh
set -eu

RUNNER_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$RUNNER_ROOT/../.." && pwd)"
OUTPUT="${1:-$RUNNER_ROOT/dist/wizzy-cnis-runner-macos}"

case "$OUTPUT" in
  "$RUNNER_ROOT"/dist/*) ;;
  *) echo "Output precisa ficar dentro de $RUNNER_ROOT/dist" >&2; exit 1 ;;
esac

cd "$RUNNER_ROOT"

if [ ! -d node_modules ]; then
  npm install
fi

PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium

rm -rf "$OUTPUT"
mkdir -p "$OUTPUT/runtime" "$OUTPUT/Wizzy Cnis Leitura"

cp -R src node_modules package.json package-lock.json README.md "$OUTPUT"/
cp install-protocol-macos.command launch-protocol-macos.sh "$OUTPUT"/
cp -R "$REPO_ROOT/Wizzy Cnis Leitura/cnis-checker" "$OUTPUT/Wizzy Cnis Leitura"/

NODE_PATH="$(command -v node)"
cp "$NODE_PATH" "$OUTPUT/runtime/node"
chmod +x "$OUTPUT/runtime/node" "$OUTPUT/install-protocol-macos.command" "$OUTPUT/launch-protocol-macos.sh"

echo "Pacote macOS criado em:"
echo "$OUTPUT"
echo "No cliente, execute install-protocol-macos.command uma vez. Nao precisa Node/npm instalado."
