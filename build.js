// Generates the inline <script> block in index.html from app.js.
// Run with: node build.js
//
// app.js  = ES module (source of truth for tests)
// index.html = self-contained production file (no external JS deps, works on file://)
//
// The only differences between the two:
//   1. export keywords removed
//   2. `export async function boot(){...}` + guard → original IIFE `(async function(){...})()`
//   3. `resetDB` (test helper) stripped out

import { readFileSync, writeFileSync } from 'fs';

const src  = readFileSync(new URL('./app.js',    import.meta.url), 'utf8');
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

let js = src;

// ── 1. Convert named boot function + guard back to IIFE ─────────────────────
// Must run before stripping exports so the pattern still matches.
js = js.replace(
  /export async function boot\(\)\{([\s\S]*?)\n\}\n\n\/\/ Auto-start in browser only[^\n]*\n[^\n]*\n  boot\(\);\n\}/,
  '(async function(){$1\n})();'
);

// ── 2. Remove resetDB (test-only helper) ────────────────────────────────────
js = js.replace(/\nexport function resetDB\(\) \{[\s\S]*?\n\}\n?$/, '\n');

// ── 3. Strip remaining export keywords ──────────────────────────────────────
js = js.replace(/^export ((?:async )?function|const|let|class) /gm, '$1 ');

// ── 4. Sanity checks ─────────────────────────────────────────────────────────
// Only flag `export` used as a JS declaration keyword (at line start), not
// the word inside strings/HTML (e.g. "Export progress" button labels).
const leakedExports = js.split('\n').filter(l => /^export /.test(l.trimStart()) && !/['"<]/.test(l));
if (leakedExports.length) {
  console.error('ERROR: leftover export keywords:\n', leakedExports.slice(0, 5).join('\n'));
  process.exit(1);
}
if (/\bresetDB\b/.test(js)) {
  console.error('ERROR: resetDB still present in output');
  process.exit(1);
}
if (!/\(async function\(\)\{/.test(js)) {
  console.error('ERROR: boot IIFE not found in output — regex may have missed');
  process.exit(1);
}

// ── 5. Inject into index.html ───────────────────────────────────────────────
// Match the last <script …> … </script> block in the file regardless of
// whether it's the module import stub or a previous inline build.
const NEW_BLOCK = `<script>\n"use strict";\n${js}</script>`;
const updated = html.replace(/<script[\s\S]*?<\/script>(\s*<\/body>)/, `${NEW_BLOCK}$1`);

if (updated === html) {
  console.error('ERROR: could not find a <script> block to replace in index.html');
  process.exit(1);
}

writeFileSync(new URL('./index.html', import.meta.url), updated);
console.log('index.html rebuilt — JS inlined from app.js');
