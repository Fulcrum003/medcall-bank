# Apps Script backend — hardening

`Code.gs` here is the hardened replacement for the "MedCall leaderboard" Apps Script.

## What was wrong

The web app is deployed `ANYONE_ANONYMOUS`, and its URL ships in `manifest.json`, which the app
fetches publicly — so the endpoint is discoverable by design. With the original code that meant
anyone who found the URL could:

| Issue | Impact |
|---|---|
| `?reports=1` returned the whole Reports sheet with no auth | **Anyone could read every student's free-text report notes** |
| `board[data.id] = data` accepted any id and any object | Anyone could overwrite or fake any leaderboard entry |
| No length caps on any field | Sheets could be spammed; the board could exhaust the ~500 KB Script Properties quota and break the leaderboard |

## What the hardened version changes

1. **`?reports=1` now requires a token** (`ADMIN_TOKEN` in Script Properties). Fails closed — if no
   token is configured, the feed is refused rather than served.
2. **`?edits=1` stays public — deliberately.** Every device pulls it on boot to receive question
   corrections. It carries app content, not private data.
3. **`doPost` validates and caps everything.** Leaderboard entries are whitelisted field-by-field
   with sane bounds; ids must match `^[A-Za-z0-9_-]{4,40}$`; notes and stems are truncated.
4. **The board is bounded** to the 400 most recently active entries.

## Deploy it

1. Open the script → **Editor** → replace all of `Code.gs` with the file in this folder.
2. **Project Settings → Script Properties → Add script property**
   - Property: `ADMIN_TOKEN`
   - Value: a long random string you invent (treat it like a password)
3. **Deploy → Manage deployments → ✏️ edit → Version: *New version* → Deploy.**
   The URL stays the same, so `manifest.json` needs no change.
4. In the app: **Settings → Maintainer tools → Add reports token**, paste the same string.

Until step 4, the reports inbox will show a message telling you the token is missing. The
leaderboard, question corrections and report *submission* keep working throughout — only *reading*
the reports feed is gated.

## About the "Google Docs" security warning

Keep it — don't remove access. The script calls `SpreadsheetApp.openById(SHEET_ID)` to log reports
and edits, which requires the Sheets scope, and Google's Security Checkup labels Sheets under its
"Google Docs" family. The access is genuine and proportionate.

Google marks it "unverified" because verification is a review process for apps published to
strangers; a script you wrote for your own account never goes through it. The warning will keep
appearing and can be safely ignored.

Optionally pin the scope in `appsscript.json` so it can't widen silently later:

```json
"oauthScopes": [
  "https://www.googleapis.com/auth/spreadsheets"
]
```

That matches exactly what this code needs — `SpreadsheetApp` for the sheets; `PropertiesService`
and `ContentService` require no scope at all.

The only change that would genuinely *reduce* access is making the script container-bound to that
one spreadsheet and using `getActiveSpreadsheet()` with `spreadsheets.currentonly`, so it can reach
that sheet and nothing else in your Drive. Bigger restructure; worth it only if you want the
tightest possible footprint.
