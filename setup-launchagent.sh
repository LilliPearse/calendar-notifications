#!/bin/zsh
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST="$HOME/Library/LaunchAgents/com.$USER.calendar-notifications.plist"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple Computer//DTD PLIST 1.0//EN"
 "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.$USER.calendar-notifications</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><false/>
  <key>StartInterval</key><integer>60</integer>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>$DIR/run.sh</string>
  </array>

  <key>WorkingDirectory</key><string>$DIR</string>
  <key>StandardOutPath</key><string>$DIR/launchd.out.log</string>
  <key>StandardErrorPath</key><string>$DIR/launchd.err.log</string>
</dict></plist>
EOF

echo "🔁 (Re)loading LaunchAgent: $PLIST"
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load -w "$PLIST"

echo "✅ Loaded. To view logs:"
echo "  tail -f $DIR/launchd.out.log"
echo "  tail -f $DIR/launchd.err.log"
