#!/bin/bash
# Installs the Outreach Drafter helper so it starts automatically when you log in.
set -e
LABEL="com.outreach-drafter.helper"
DEST="$HOME/Library/Application Support/OutreachDrafter"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

mkdir -p "$DEST" "$HOME/Library/LaunchAgents"
cp "$(dirname "$0")/outreach_helper.py" "$DEST/outreach_helper.py"

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/python3</string>
    <string>$DEST/outreach_helper.py</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>
PLIST

# Remove the earlier install name, if present, so two copies don't fight over the port.
launchctl bootout "gui/$(id -u)/com.v7.outreach-helper" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/com.v7.outreach-helper.plist"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -s http://127.0.0.1:8787/health | grep -q ok; then
    echo "✅ Outreach helper is running and will start by itself whenever you log in."
    echo "You can close this window."
    exit 0
  fi
  sleep 1
done
echo "⚠️  The helper didn't start. Try restarting your Mac, then run this again."
exit 1
