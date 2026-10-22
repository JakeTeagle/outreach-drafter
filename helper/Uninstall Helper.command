#!/bin/bash
# Stops the Outreach Drafter helper and removes it from login items.
for LABEL in com.outreach-drafter.helper com.v7.outreach-helper; do
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
done
rm -rf "$HOME/Library/Application Support/OutreachDrafter"
echo "Outreach helper removed. You can close this window."
