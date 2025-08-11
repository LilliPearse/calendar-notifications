#!/bin/bash
set -euo pipefail

echo "📦 Installing Node deps…"
npm install

echo "🧹 Preparing runtime files…"
[ -f .alerted.json ] || echo "{}" > .alerted.json
touch .snooze

echo "🖼️ Ensuring SwiftDialog is installed…"
if ! command -v dialog >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    brew install --cask swift-dialog
  else
    echo "⚠️ Homebrew not found. Install from brew.sh or install swiftDialog manually."
  fi
fi

echo "✅ Done. Now add credentials.json and run an auth:"
echo "   npx ts-node src/calendar-notification.ts"
