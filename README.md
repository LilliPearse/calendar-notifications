# Calendar Notifications (SwiftDialog + Google Calendar)

A tiny Node/TypeScript tool that checks your Google Calendar and pops a SwiftDialog alert shortly before meetings, with big, fun, interruptive UI and a one-click “Open link”.

## Features

- Runs every minute via `launchd` (user LaunchAgent).
- Alerts only within `LEAD_MINUTES` of start (default 2).
- Reschedule-aware (alerts again if a meeting’s start time changes).
- Snooze for 5 minutes; optional work-hours filter.
- SwiftDialog blur overlay + custom icon + markdown formatting.

## Prereqs

- macOS
- Node.js (v18+ recommended). If you use `nvm`, make sure `node` works in a fresh terminal.
- SwiftDialog (`brew install --cask swift-dialog`) or install from its releases page.

## Setup (first time on any Mac)

### 1. Clone the repo

### 2. Install deps and ensure SwiftDialog

```
./install.sh
```

### 3. Add your Google OAuth client

- In Google Cloud Console, create an OAuth client ID of type Desktop.
- Download the JSON as credentials.json and place it in the repo root:

```
~/Code/calendar-notifications/credentials.json
```

- Authenticale once:

```
npx ts-node src/calendar-notification.ts
```

A browser window opens; approve access. A token.json is saved locally.

### 4. Run automatically with launchd

```
./setup-launchagent.sh
```

This writes a user LaunchAgent to `~/Library/LaunchAgents/com.<your-user>.calendar-notifications.plist` and loads it to run every minute.

### 5. Unload/reload

```
launchctl unload ~/Library/LaunchAgents/com.$USER.calendar-notifications.plist
launchctl load -w ~/Library/LaunchAgents/com.$USER.calendar-notifications.plist
```

(Note: when making changes, you'll need to unload and reload)

## Customisation

- Lead time: set LEAD_MINUTES:

```
launchctl setenv LEAD_MINUTES 3
```

- Work-hours filter (Mon–Fri, 09–18):

```
launchctl setenv WORK_HOURS 1
```

Remove with launchctl unsetenv WORK_HOURS.

## Uninstall

```
launchctl unload ~/Library/LaunchAgents/com.$USER.calendar-notifications.plist
rm ~/Library/LaunchAgents/com.$USER.calendar-notifications.plist
```
