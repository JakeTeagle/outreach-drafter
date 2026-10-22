#!/bin/bash
# Double-click to run the Outreach Drafter helper. Keep this window open while you use the extension.
cd "$(dirname "$0")"
if curl -s http://127.0.0.1:8787/health | grep -q ok; then
  echo "✅ The Outreach helper is already running. You can close this window."
  exit 0
fi
echo "✅ Outreach helper is running."
echo "Leave this window open (you can minimise it) while you use the extension."
echo "Close it when you're done."
exec /usr/bin/python3 outreach_helper.py
