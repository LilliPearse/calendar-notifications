import { google } from "googleapis";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { spawn, spawnSync } from "child_process";
import * as http from "http";

// ESM-safe __dirname and __filename
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LEAD_MINUTES = parseInt(process.env.LEAD_MINUTES || "2", 10);
const ALERT_DURATION_SEC = parseInt(
  process.env.ALERT_DURATION_SEC || "120",
  10
);
const CALENDAR_ID = process.env.CALENDAR_ID || "primary";

const ROOT = path.resolve(__dirname, "..");
const CRED_PATH = path.join(ROOT, "credentials.json");
const TOKEN_PATH = path.join(ROOT, "token.json");
const CACHE_PATH = path.join(ROOT, ".alerted.json");

type AlertCache = { [cacheKey: string]: number };
const cacheKeyOf = (id: string, startIso: string) => `${id}@@${startIso}`;

function readJSON<T>(p: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJSON<T>(p: string, data: T) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

async function getAuth() {
  // Try existing token first
  try {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
    const { installed } = JSON.parse(fs.readFileSync(CRED_PATH, "utf8"));
    const oAuth2Client = new google.auth.OAuth2(
      installed.client_id,
      installed.client_secret,
      token.redirect_uri || installed.redirect_uris?.[0] || "http://localhost"
    );
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  } catch {
    /* fall through to interactive auth */
  }

  // Interactive auth with loopback listener
  const { installed } = JSON.parse(fs.readFileSync(CRED_PATH, "utf8"));

  // Pick a free localhost port and set it as the redirect URI
  const PORT = 53682; // any free port is fine
  const REDIRECT_URI = `http://localhost:${PORT}/`;

  const oAuth2Client = new google.auth.OAuth2(
    installed.client_id,
    installed.client_secret,
    REDIRECT_URI
  );

  // Start a tiny HTTP server to receive ?code=...
  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url || "/", REDIRECT_URI);
        const codeParam = url.searchParams.get("code");
        if (!codeParam) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Missing code.");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h2>Auth complete ✅ You can close this window.</h2>");
        server.close();
        resolve(codeParam);
      } catch (e) {
        reject(e);
      }
    });
    server.listen(PORT, () => {
      // Open the consent URL in the default browser
      const authUrl = oAuth2Client.generateAuthUrl({
        access_type: "offline",
        scope: ["https://www.googleapis.com/auth/calendar.readonly"],
        prompt: "consent",
      });
      const opener =
        process.platform === "darwin"
          ? "open"
          : process.platform === "linux"
          ? "xdg-open"
          : null;
      if (opener) spawn(opener, [authUrl], { stdio: "ignore", detached: true });
      else console.log("Authorize this app by visiting:", authUrl);
    });
    // Safety timeout (optional)
    setTimeout(() => reject(new Error("Auth timed out.")), 5 * 60 * 1000);
  });

  // Exchange code for tokens and save
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  fs.writeFileSync(
    TOKEN_PATH,
    JSON.stringify({ ...tokens, redirect_uri: REDIRECT_URI }, null, 2)
  );
  return oAuth2Client;
}

function msUntil(dateIso: string) {
  return new Date(dateIso).getTime() - Date.now();
}

function platform(): "mac" | "linux" | "other" {
  if (process.platform === "darwin") return "mac";
  if (process.platform === "linux") return "linux";
  return "other";
}

function hasSwiftDialog(): boolean {
  try {
    spawnSync("which", ["dialog"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function showDialogSwiftDialog(
  title: string,
  body: string,
  url?: string,
  timeoutSec = ALERT_DURATION_SEC
): Promise<"dismiss" | "open" | "snooze" | "timeout"> {
  const dialogPath =
    spawnSync("which", ["dialog"]).stdout.toString().trim() ||
    "/opt/homebrew/bin/dialog";

  // body is split here so we can apply formatting
  const [meetingName, startTime] = body.split("\nStarts: ");
  const formattedBody =
    `## 📅 ${meetingName}\n` +
    (startTime ? `_Starts: ${startTime}_\n\n` : "") +
    "🏃Go to the meeting!!";

  const args = [
    "--title",
    `${title}`,
    "--message",
    formattedBody,
    "--ontop",
    "--blurscreen",
    "--timer",
    String(timeoutSec),
    "--quitkey",
    "ESC",
    "--icon",
    "/Users/lillip/Code/calendar-notifications/hand-drawn-doodle-style-cartoon-exclamation-mark-free-vector.jpg",
    "--button1text",
    "🚀 I’m joining",
    "--button2text",
    "😴 Snooze 5 min",
  ];
  if (url) {
    args.push("--button3text", "🔗 Open link");
  }

  const res = spawnSync(dialogPath, args, { encoding: "utf8" });
  const out = res.stdout || "";
  if (out.includes("button1")) return Promise.resolve("dismiss");
  if (out.includes("button2")) return Promise.resolve("snooze");
  if (out.includes("button3")) return Promise.resolve("open");
  return Promise.resolve("timeout");
}

function showDialogMac(
  title: string,
  text: string,
  url?: string
): Promise<"dismiss" | "open" | "snooze" | "timeout"> {
  // Split out the meeting name + start time
  const [meetingName, startTime] = text.split("\nStarts: ");
  const formattedText =
    `**${meetingName}**` + (startTime ? `\nStarts: ${startTime}` : "");

  const buttons = url
    ? 'buttons {"Snooze 5 min","Open link","I joined the meeting, shut up"} default button 3'
    : 'buttons {"Snooze 5 min","I joined the meeting, shut up"} default button 2';
  const script = `
    set theTitle to "${title.replace(/"/g, '\\"')}"
    set theText to "${formattedText.replace(/"/g, '\\"')}"
    display dialog theText with title theTitle with icon caution ${buttons} giving up after ${ALERT_DURATION_SEC}
    if gave up of the result then
      return "timeout"
    else
      set btn to button returned of the result
      if btn is "Open link" then return "open"
      if btn is "Snooze 5 min" then return "snooze"
      return "dismiss"
    end if
  `;
  return new Promise((resolve) => {
    const p = spawn("osascript", ["-e", script]);
    let out = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.on("close", () => resolve((out.trim() as any) || "dismiss"));
  });
}

async function alertUser(
  summary: string,
  startIso: string,
  hangoutsLink?: string
) {
  const mins = Math.max(0, Math.round(msUntil(startIso) / 60000));
  const title = `You have a meeting!`;
  const body = `${summary}\nStarts: ${new Date(startIso).toLocaleTimeString()}`;

  let action: "dismiss" | "open" | "snooze" | "timeout" = "dismiss";
  if (platform() === "mac" && hasSwiftDialog()) {
    action = await showDialogSwiftDialog(title, body, hangoutsLink);
  } else if (platform() === "mac") {
    action = await showDialogMac(title, body, hangoutsLink);
  } else {
    console.log(
      title + "\n" + body + (hangoutsLink ? `\nLink: ${hangoutsLink}` : "")
    );
    await new Promise((r) => setTimeout(r, ALERT_DURATION_SEC * 1000));
    action = "timeout";
  }

  if (action === "open" && hangoutsLink) {
    spawn("open", [hangoutsLink]);
  }
  if (action === "snooze") {
    const snoozeUntil = Date.now() + 5 * 60 * 1000;
    fs.writeFileSync(path.join(ROOT, ".snooze"), String(snoozeUntil));
  }
}

async function main() {
  try {
    const snoozeUntil = parseInt(
      fs.readFileSync(path.join(ROOT, ".snooze"), "utf8"),
      10
    );
    if (!isNaN(snoozeUntil) && Date.now() < snoozeUntil) return;
  } catch {
    // no snooze file, carry on
  }

  const auth = await getAuth();
  const calendar = google.calendar({ version: "v3", auth });

  const now = new Date();
  const max = new Date(Date.now() + (LEAD_MINUTES + 3) * 60 * 1000);
  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: now.toISOString(),
    timeMax: max.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 10,
  });

  const items = res.data.items || [];

  console.log(`[debug] Checking ${items.length} upcoming events:`);
  for (const ev of items) {
    const startIso =
      ev.start?.dateTime ||
      (ev.start?.date ? ev.start.date + "T00:00:00Z" : "");
    const ms = startIso ? new Date(startIso).getTime() - Date.now() : NaN;
    console.log(
      `[debug] ${ev.summary || "(No title)"} - starts in ${Math.round(
        ms / 60000
      )} min`
    );
  }

  // Load and prune cache
  const cache: AlertCache = readJSON(CACHE_PATH, {});
  const cutoff = Date.now() - 6 * 60 * 60 * 1000;
  for (const [k, v] of Object.entries(cache)) {
    if (v < cutoff) delete cache[k];
  }

  // Alert loop
  for (const ev of items) {
    const id = ev.id!;
    const startIso =
      ev.start?.dateTime ||
      (ev.start?.date ? ev.start.date + "T00:00:00Z" : "");
    if (!startIso) continue;

    // Skip cancelled or all-day
    if (ev.status === "cancelled") continue;
    if (ev.start?.date && !ev.start?.dateTime) continue;

    const ms = msUntil(startIso);
    const withinLead = ms >= 0 && ms <= LEAD_MINUTES * 60 * 1000;
    if (!withinLead) continue;

    const key = cacheKeyOf(id, startIso);
    if (cache[key]) continue; // already alerted for this start time

    const link = (ev.hangoutLink ||
      ev.conferenceData?.entryPoints?.find((p) => p.uri)?.uri) as
      | string
      | undefined;

    await alertUser(ev.summary || "(No title)", startIso, link);

    // Mark only after alert actually ran
    cache[key] = Date.now();
  }

  writeJSON(CACHE_PATH, cache);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
