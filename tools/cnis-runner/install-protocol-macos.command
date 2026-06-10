#!/bin/sh
set -eu

SOURCE_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
INSTALL_ROOT="${HOME}/Library/Application Support/Wizzy CNIS Runner"
APP_ROOT="${HOME}/Applications"
APP_PATH="${APP_ROOT}/Wizzy CNIS Runner.app"
MACOS_DIR="${APP_PATH}/Contents/MacOS"
PLIST="${APP_PATH}/Contents/Info.plist"
LAUNCHER="${MACOS_DIR}/Wizzy CNIS Runner"

mkdir -p "$INSTALL_ROOT" "$APP_ROOT" "$MACOS_DIR"

if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    --exclude ".cnis-chromium-profile" \
    --exclude "cnis-runner.out.log" \
    --exclude "cnis-runner.err.log" \
    "$SOURCE_ROOT"/ "$INSTALL_ROOT"/
else
  rm -rf "$INSTALL_ROOT"
  mkdir -p "$INSTALL_ROOT"
  cp -R "$SOURCE_ROOT"/. "$INSTALL_ROOT"/
fi

chmod +x "$INSTALL_ROOT/launch-protocol-macos.sh" 2>/dev/null || true

cat > "$LAUNCHER" <<EOF
#!/bin/sh
exec "$INSTALL_ROOT/launch-protocol-macos.sh" "\${1:-}"
EOF
chmod +x "$LAUNCHER"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>Wizzy CNIS Runner</string>
  <key>CFBundleDisplayName</key>
  <string>Wizzy CNIS Runner</string>
  <key>CFBundleIdentifier</key>
  <string>com.wizzy.cnis-runner</string>
  <key>CFBundleVersion</key>
  <string>1.0.0</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleExecutable</key>
  <string>Wizzy CNIS Runner</string>
  <key>LSUIElement</key>
  <true/>
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLName</key>
      <string>Wizzy CNIS Runner</string>
      <key>CFBundleURLSchemes</key>
      <array>
        <string>wizzy-cnis-runner</string>
      </array>
    </dict>
  </array>
</dict>
</plist>
EOF

LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
if [ -x "$LSREGISTER" ]; then
  "$LSREGISTER" -f "$APP_PATH" >/dev/null 2>&1 || true
fi

open "$APP_PATH" >/dev/null 2>&1 || true

echo "Wizzy CNIS Runner instalado neste Mac."
echo "Agora o botao Login certificado da Wizzy pode abrir o runner pelo navegador."
