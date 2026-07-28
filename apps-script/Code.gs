/* ============================================================
   MedCall leaderboard — Apps Script backend  (hardened)
   ============================================================
   WHAT CHANGED vs the original, and why:

   1. ?reports=1 now requires a token.
      Reports contain students' free-text notes. The web app is deployed
      ANYONE_ANONYMOUS and its URL ships publicly in manifest.json, so
      previously anyone could dump every report. Now only a caller holding
      ADMIN_TOKEN can read them.
      ?edits=1 stays PUBLIC on purpose — every device fetches it on boot to
      receive question corrections. It carries app content, not private data.

   2. doPost input is validated and capped.
      Leaderboard entries are whitelisted field-by-field with sane bounds, so
      nobody can inject arbitrary objects, absurd XP, or megabyte payloads.
      Entry ids must look like real ids.

   3. The board can't be used to exhaust storage.
      Script Properties is limited (~500 KB total, 9 KB per property). The
      board is trimmed to the most recently active MAX_BOARD entries.

   SETUP (once):
     Project Settings -> Script Properties -> Add:
        ADMIN_TOKEN = <a long random string you invent>
     Then paste that same string into the app:
        Settings -> Maintainer tools -> Reports token
     Deploy -> Manage deployments -> edit -> Version: New version -> Deploy.
   ============================================================ */

var SHEET_ID = '1Br0PPan9VCSc_MvNmdNdcdqEo84ww9E8RZxtyAcviZU';

var MAX_STR   = 200;      // cap for short fields
var MAX_TEXT  = 2000;     // cap for notes / stems / patches
var MAX_BOARD = 400;      // max leaderboard entries retained
var ID_RE     = /^[A-Za-z0-9_-]{4,40}$/;

/* ---------- helpers ---------- */

function s_(v, max){
  if (v === null || v === undefined) return '';
  return String(v).slice(0, max || MAX_STR);
}

function n_(v, min, max){
  var x = Number(v);
  if (!isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.round(x)));
}

// Fail CLOSED: if no ADMIN_TOKEN is configured, privileged reads are refused.
function adminOk_(e){
  var want = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  if (!want) return false;
  var got = (e && e.parameter && e.parameter.token) ? String(e.parameter.token) : '';
  return got === want;
}

// Whitelist exactly the fields the app's myEntry() sends. Anything else is dropped.
function cleanEntry_(d){
  return {
    id:              s_(d.id, 40),
    name:            s_(d.name, 40),
    level:           n_(d.level, 0, 999),
    streak:          n_(d.streak, 0, 3650),
    subject:         s_(d.subject, 60),
    week:            n_(d.week, 0, 7),
    xpDay:           n_(d.xpDay, 0, 1000000),
    xpMonth:         n_(d.xpMonth, 0, 50000000),
    xpYear:          n_(d.xpYear, 0, 500000000),
    xpAll:           n_(d.xpAll, 0, 1000000000),
    timeDay:         n_(d.timeDay, 0, 86400),
    timeWeek:        n_(d.timeWeek, 0, 604800),
    studyingNow:     !!d.studyingNow,
    studyingSubject: s_(d.studyingSubject, 60),
    day:             s_(d.day, 10),
    month:           s_(d.month, 7),
    year:            s_(d.year, 4)
  };
}

// Keep the board bounded — most recently active entries win.
function trimBoard_(board){
  var keys = Object.keys(board);
  if (keys.length <= MAX_BOARD) return board;
  keys.sort(function(a, b){
    return String(board[b] && board[b].day || '').localeCompare(String(board[a] && board[a].day || ''));
  });
  var out = {};
  keys.slice(0, MAX_BOARD).forEach(function(k){ out[k] = board[k]; });
  return out;
}

function readBoard_(p){
  try { return JSON.parse(p.getProperty('board') || '{}') || {}; }
  catch (err) { return {}; }
}

/* ---------- endpoints ---------- */

function doPost(e){
  var data = {};
  try { data = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) {}
  if (!data || typeof data !== 'object') return out_({ok:false, err:'bad payload'});

  if (data.type === 'report') {
    reportSheet_().appendRow([new Date(), s_(data.who), s_(data.subject), s_(data.topic),
                              s_(data.qid), s_(data.issue), s_(data.note, MAX_TEXT), s_(data.stem, MAX_TEXT)]);
    return out_({ok:true});
  }

  if (data.type === 'edit') {
    var patch = '';
    try { patch = s_(JSON.stringify(data.patch || null), MAX_TEXT); } catch (err) { patch = ''; }
    editSheet_().appendRow([new Date(), s_(data.qid), patch, s_(data.by), s_(data.uid), s_(data.editId)]);
    return out_({ok:true});
  }

  // Maintainer publishes / removes a "what's new" notice from inside the app.
  if (data.type === 'announce') {
    if (!data.token || data.token !== PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN'))
      return out_({ok:false, err:'unauthorized'});
    var pa = PropertiesService.getScriptProperties();
    var list = [];
    try { list = JSON.parse(pa.getProperty('announcements') || '[]') || []; } catch (err) { list = []; }
    if (data.remove) {
      var rid = String(data.remove);
      list = list.filter(function(x){ return x && x.id !== rid; });
    } else {
      var item = {
        id:    s_(data.annId || ('a' + Date.now()), 40),
        date:  s_(data.date, 10),
        title: s_(data.title, 120),
        body:  s_(data.body, 600)
      };
      if (!item.title) return out_({ok:false, err:'title required'});
      if (data.actionLabel && data.actionScreen) {
        item.action = { label: s_(data.actionLabel, 40), screen: s_(data.actionScreen, 30) };
      }
      list = list.filter(function(x){ return x && x.id !== item.id; });
      list.push(item);
      if (list.length > 20) list = list.slice(-20);   // keep the store bounded
    }
    pa.setProperty('announcements', JSON.stringify(list));
    return out_({ok:true, count:list.length});
  }

  if (data.id) {
    if (!ID_RE.test(String(data.id))) return out_({ok:false, err:'bad id'});
    var p = PropertiesService.getScriptProperties();
    var board = readBoard_(p);
    board[String(data.id)] = cleanEntry_(data);
    board = trimBoard_(board);
    p.setProperty('board', JSON.stringify(board));
  }
  return out_({ok:true});
}

function doGet(e){
  // Private: students' free-text notes live here.
  if (e && e.parameter && e.parameter.reports) {
    if (!adminOk_(e)) return out_({error:'unauthorized'});
    return out_(reportSheet_().getDataRange().getValues());
  }

  // Public: "what's new" notices are meant for every user.
  if (e && e.parameter && e.parameter.announce) {
    var pg = PropertiesService.getScriptProperties();
    var al = [];
    try { al = JSON.parse(pg.getProperty('announcements') || '[]') || []; } catch (err) { al = []; }
    return out_(al);
  }

  // Public by design: every device pulls question corrections on boot.
  if (e && e.parameter && e.parameter.edits) {
    return out_(editSheet_().getDataRange().getValues());
  }

  // Public leaderboard.
  var p = PropertiesService.getScriptProperties();
  var board = readBoard_(p);
  return out_(Object.keys(board).map(function(k){ return board[k]; }));
}

/* ---------- sheets ---------- */

function reportSheet_(){
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName('Reports') || ss.insertSheet('Reports');
  if (sh.getLastRow() === 0)
    sh.appendRow(['When','Who','Subject','Topic','Question ID','Issue','Note','Stem']);
  return sh;
}

function editSheet_(){
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName('Edits') || ss.insertSheet('Edits');
  if (sh.getLastRow() === 0)
    sh.appendRow(['when','qid','patch','by','uid','editId']);
  return sh;
}

function out_(o){
  return ContentService.createTextOutput(JSON.stringify(o))
                       .setMimeType(ContentService.MimeType.JSON);
}
