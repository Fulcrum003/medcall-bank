# MedCall — Maintainer setup (reports + live question edits)

The maintainer tools (report inbox, report alerts, and the in‑app question editor that
auto‑shares fixes) all talk to the **same Google Apps Script** you already use for the
group leaderboard. You need to add a few branches to that script and redeploy **once**.

`SHEET_ID` below is the ID of your Google Sheet (the long string in its URL). Use the same
sheet you use for the leaderboard/reports.

---

## 1. `doPost(e)` — accept reports **and** question edits

Inside your existing `doPost(e)`, after you parse the body
(`var data = JSON.parse(e.postData.contents);`), add these two branches:

```javascript
// --- question reports (from the "⚑ Report an issue" button) ---
if (data.type === 'report') {
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Reports')
        || SpreadsheetApp.openById(SHEET_ID).insertSheet('Reports');
  if (sh.getLastRow() === 0) sh.appendRow(['When','Who','Subject','Topic','QID','Issue','Note','Stem']);
  sh.appendRow([new Date(), data.who||'', data.subject||'', data.topic||'',
                data.qid||'', data.issue||'', data.note||'', data.stem||'']);
  return ContentService.createTextOutput(JSON.stringify({ok:true}))
                       .setMimeType(ContentService.MimeType.JSON);
}

// --- maintainer question edits (from the in‑app editor; auto‑shared to everyone) ---
if (data.type === 'edit') {
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Edits')
        || SpreadsheetApp.openById(SHEET_ID).insertSheet('Edits');
  if (sh.getLastRow() === 0) sh.appendRow(['when','qid','patch','by','uid','editId']);
  sh.appendRow([new Date(), data.qid, JSON.stringify(data.patch),
                data.by||'', data.uid||'', data.editId||'']);
  return ContentService.createTextOutput(JSON.stringify({ok:true}))
                       .setMimeType(ContentService.MimeType.JSON);
}
```

Keep your existing leaderboard `doPost` logic below these (the leaderboard payload has no
`type` field, so it falls through to your current code).

---

## 2. `doGet(e)` — serve reports and edits

Add these two branches at the **top** of your `doGet(e)`:

```javascript
if (e.parameter.reports) {
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Reports');
  var rows = sh ? sh.getDataRange().getValues() : [];
  return ContentService.createTextOutput(JSON.stringify(rows))
                       .setMimeType(ContentService.MimeType.JSON);
}
if (e.parameter.edits) {
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Edits');
  var rows = sh ? sh.getDataRange().getValues() : [];
  return ContentService.createTextOutput(JSON.stringify(rows))
                       .setMimeType(ContentService.MimeType.JSON);
}
```

Your existing leaderboard `doGet` (returning the board array) stays below.

---

## 3. Redeploy

Apps Script editor → **Deploy → Manage deployments → (edit / pencil) → Version: New version → Deploy.**
Keep **Execute as: Me** and **Who has access: Anyone**. The `/exec` URL stays the same, so no
app change is needed.

---

## How it works in the app

- **Reports:** any user's "⚑ Report an issue" POSTs a `report` row. Maintainer devices pull
  `?reports=1`, show them in **Settings → Reports inbox**, and (if enabled) fire a
  notification + a home badge when new ones arrive.
- **Tap a report → question editor.** Fix the stem, options, correct answer, key point, or flag.
- **Save** stores the fix locally (applies immediately on your device) **and** POSTs an `edit`
  row. Every device fetches `?edits=1` on open and applies edits over the GitHub‑synced bank —
  so your fix reaches everyone on their next open, no GitHub push required.
- **Copy corrected JSON** gives you the fixed question in source format to paste into the pack
  on GitHub, making the fix permanent (after which the live‑edit override is just a no‑op).

Only maintainer devices expose the editor. Edits are keyed by question id; the newest edit for a
question wins. To roll one back, open the question and tap **Revert my edit** (local), and delete
its row from the **Edits** sheet (for everyone).

---

## Troubleshooting — edits showing up in the Reports inbox?

If your saved question fixes appear as rows in **Settings → Reports inbox**, your deployed
Apps Script is missing the `data.type === 'edit'` branch (or it sits BELOW a generic
"append everything" line), so `edit` posts fall through into the **Reports** sheet.

**Fix (once):**
1. Open your Apps Script and make sure the two `doPost` branches from section 1 are at the
   **top** of `doPost(e)`, right after `JSON.parse` — the `edit` branch must run before any
   other append.
2. Redeploy: **Deploy → Manage deployments → ✏️ → Version: New version → Deploy.**
3. Clean the sheet: delete any old edit rows from the **Reports** sheet (they contain a
   `patch` JSON instead of an issue/note). Your real edits live in the **Edits** sheet.

**The app now guards this too (v2.1):**
- The Reports inbox **filters out** anything that looks like an edit row, so even a
  misconfigured Script can't clutter it (and edit rows no longer count toward the
  "new reports" badge or notifications).
- Your fixes have their own screen: **Settings → maintainer → Edited questions** — every
  edited question with what changed, when, and whether it's shared to the group or only on
  this device. Tap one to reopen it in the editor.
