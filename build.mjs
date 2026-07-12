/* ============================================================
   build.mjs — generate the self-contained, offline-capable index.html
   ============================================================
   WHY THIS EXISTS
   - app.js is the single source of truth for the app engine. The Vitest
     test suite imports it as an ES module (import { dueCount } from './app.js').
   - But ES-module imports are BLOCKED by browsers when a page is opened from
     file:// (e.g. a teammate downloads index.html and double-clicks it).
   - So for distribution we inline app.js INTO index.html as a classic <script>.
     A self-contained index.html works both on GitHub Pages (https://) and as a
     downloaded file (file://).

   WORKFLOW
   - Edit app.js (and run the tests: npm test).
   - Run: npm run build   ->  regenerates the inlined <script> inside index.html.
   - Never hand-edit the code between <!-- APP:START --> and <!-- APP:END -->.
   ============================================================ */
import { readFileSync, writeFileSync } from 'node:fs';

const START = '<!-- APP:START -->';
const END   = '<!-- APP:END -->';

const appSrc = readFileSync(new URL('./app.js', import.meta.url), 'utf8');

// 1) Strip ES-module `export ` keywords -> plain top-level declarations.
//    (Every export in app.js is a top-level `export function/const/let/async`.)
// 2) Force strict mode (ES modules are always strict; classic scripts are not).
// 3) Defensively neutralise any literal "</script>" so it can't close the tag.
const inlined = '"use strict";\n'
  + appSrc.replace(/^export\s+/gm, '').replace(/<\/script>/gi, '<\\/script>');

const block =
  `${START}\n` +
  `<script>\n` +
  `/* AUTO-GENERATED from app.js by build.mjs — DO NOT EDIT HERE.\n` +
  `   Edit app.js, then run: npm run build */\n` +
  `${inlined}\n` +
  `</script>\n` +
  `${END}`;

let html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

// Replacer FUNCTIONS, not strings: app.js content may legitimately contain
// $$, $&, $` or $' which String.replace would expand as replacement patterns,
// silently corrupting the generated script.
let injected = false;
const inject = () => { injected = true; return block; };
if (html.includes(START) && html.includes(END)) {
  // Re-build: replace the existing generated block.
  html = html.replace(new RegExp(`${START}[\\s\\S]*?${END}`), inject);
} else {
  // First build: replace the failing module loader with the inlined block.
  html = html.replace(/<script type="module">[\s\S]*?<\/script>/, inject);
}
if (!injected) {
  console.error('build.mjs: FAILED — no injection point found in index.html (missing APP markers and module loader).');
  process.exit(1);
}

writeFileSync(new URL('./index.html', import.meta.url), html);
console.log(`build.mjs: inlined ${inlined.length} chars from app.js into index.html ✓`);
