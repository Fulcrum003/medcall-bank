/* validate.mjs — sanity-check every pack before publishing.
   Run: npm run validate   (or: node validate.mjs)
   Exits non-zero if any ERROR is found, so it can gate a release. */
import { readFileSync } from 'node:fs';
const url = p => new URL('./' + p, import.meta.url);
const man = JSON.parse(readFileSync(url('manifest.json'), 'utf8'));
const errors = [], warns = [], ids = new Set();
let total = 0;
for (const e of man.packs) {
  let pack;
  try { pack = JSON.parse(readFileSync(url(e.url), 'utf8')); }
  catch (err) { errors.push(`[${e.packId}] cannot read ${e.url}: ${err.message}`); continue; }
  const qs = pack.questions || [];
  total += qs.length;
  if (qs.length !== e.questionCount) errors.push(`[${e.packId}] manifest questionCount ${e.questionCount} != actual ${qs.length}`);
  if (pack.questionCount !== qs.length) warns.push(`[${e.packId}] pack.questionCount ${pack.questionCount} != actual ${qs.length}`);
  qs.forEach((q, i) => {
    const tag = `[${e.packId} #${i + 1} ${q.id || '?'}]`;
    if (!q.id) errors.push(`${tag} missing id`);
    else if (ids.has(q.id)) errors.push(`${tag} DUPLICATE id`);
    else ids.add(q.id);
    if (!q.stem || !String(q.stem).trim()) errors.push(`${tag} empty stem`);
    if (!q.system) warns.push(`${tag} missing system`);
    const ch = q.choices || [];
    if (ch.length < 2) (q.flag ? warns : errors).push(`${tag} <2 choices (${ch.length})`);
    const nc = ch.filter(c => c.correct).length;
    if (nc !== 1) (q.flag ? warns : errors).push(`${tag} ${nc} correct (expected 1)`);
    ch.forEach((c, j) => { if (!c.text || !String(c.text).trim()) errors.push(`${tag} option ${j + 1} empty text`); });
    const labs = ch.map(c => c.label);
    if (new Set(labs).size !== labs.length) errors.push(`${tag} duplicate option labels: ${labs}`);
    if (q.flag && (!q.flag.severity || !q.flag.note)) warns.push(`${tag} flag missing severity/note`);
  });
  console.log(`  ${e.packId.padEnd(28)} ${String(qs.length).padStart(4)} Q`);
}
console.log(`\n  TOTAL ${total} questions across ${man.packs.length} packs · ${ids.size} unique ids`);
console.log(`\nERRORS: ${errors.length}`);
errors.slice(0, 50).forEach(x => console.log('  X ' + x));
console.log(`WARNINGS: ${warns.length}` + (warns.length ? ' (flagged/source-deficient items — expected)' : ''));
warns.slice(0, 12).forEach(x => console.log('  ! ' + x));
process.exit(errors.length ? 1 : 0);
