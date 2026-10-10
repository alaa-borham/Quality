/*
 * اختبارات الحلّال التلقائي للريشو والدوال النقية المساندة — بلا متصفح ولا Firebase.
 * التشغيل:  npm run test:solver
 * تُستخرج الدوال كما هي من index.html (نفس الكود الذي يعمل في التطبيق) وتُشغَّل في سياق node:vm.
 * يفحص: تغطية الأوردر بلا نقص ولا زيادة، احترام القيود، عدد الماركرات (منع رجوع «٢٦ مقاس ← ٢٩ ماركر»)،
 *        اختيار المكتبة/الحرّ، حارس المكتبة، توقيع التوليفة، مواعيد النسخ الاحتياطي، CRC لملفات Excel، وفحص منطق الاستهلاك.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// استخراج دالة باسمها بموازنة الأقواس (يتخطّى النصوص والقوالب كي لا تُربكه الأقواس داخلها)
function grabFn(name) {
  const m = new RegExp('function ' + name + '\\s*\\(').exec(src);
  if (!m) throw new Error('function not found: ' + name);
  let j = src.indexOf('{', m.index), depth = 0;
  for (; j < src.length; j++) {
    const ch = src[j];
    if (ch === "'" || ch === '"' || ch === '`') { const q = ch; j++; while (j < src.length && src[j] !== q) { if (src[j] === '\\') j++; j++; } continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { j++; break; } }
  }
  return src.slice(m.index, j);
}
// استخراج تعريف ثابت في سطر واحد: const NAME=...;
function grabConst(name) {
  const m = new RegExp('const ' + name + '\\s*=[^\\n]*?;(?=\\s*(?:\\n|//|let |const |function ))').exec(src);
  if (!m) throw new Error('const not found: ' + name);
  return m[0];
}

const code = [
  grabConst('RS_LIB_TOL'), grabConst('XL_CRC'), grabConst('rsP2'), grabConst('SIZE_ORDER'), grabConst('CV_HI'),
  ...['rsCombos', 'rsSolve', 'rsPlanSolve', 'rsComboSig', 'rsLibComp', 'rsLibOk', 'rsBakSlot', 'rsBakSlotId', 'xlCrc', 'consCheck'].map(grabFn),
].join('\n');
// rsSolve يقرأ الهدف/الفائض من الواجهة عند غياب الخيارات — نعيد قيمة فارغة فيُستعمل الافتراضي («أقل ماركرات»، فائض 0)
const ctx = { $: () => ({ value: '' }), Date, Math, Object, Set, Array, String, Number, Uint32Array, TextEncoder, console };
vm.createContext(ctx);
vm.runInContext(code + '\n;globalThis.__x={rsCombos,rsSolve,rsPlanSolve,rsComboSig,rsLibComp,rsLibOk,rsBakSlot,rsBakSlotId,xlCrc,consCheck};', ctx);
const X = ctx.__x;

let pass = 0, fail = 0;
const chk = (name, ok, info) => { if (ok) pass++; else { fail++; console.log('  ✗ FAIL:', name, info !== undefined ? '— ' + JSON.stringify(info) : ''); } };

// ── سيناريو واقعي: ٢٦ مقاساً بكميات متفاوتة ──
const SIZES = ['S-52', 'S-53', 'S-54', 'S-55', 'S-56', 'S-57', 'S-58', 'S-59', 'S-60', 'S-61', 'S-62', 'S-63',
  'M-53', 'M-54', 'M-57', 'M-58', 'M-59', 'M-60', 'M-61', 'M-62', 'L-59', 'L-60', 'XL-59', '2XL-59', '2XL-62', '3XL-59'];
const Q = [23, 22, 31, 17, 30, 24, 16, 20, 54, 13, 12, 18, 17, 66, 54, 35, 109, 31, 63, 13, 40, 24, 22, 23, 23, 22];
const QTY = {}, CONS = {};
SIZES.forEach((s, i) => { QTY[s] = Q[i]; CONS[s] = 2.0 + (i % 7) * 0.08; });
const MAXLEN = 9.8;

function made(markers) { const o = {}; markers.forEach(m => m.combo.forEach(p => o[p.size] = (o[p.size] || 0) + p.cnt * m.plies)); return o; }
function diff(markers) { const mk = made(markers); let short = 0, over = 0, maxOver = 0;
  SIZES.forEach(s => { const d = (mk[s] || 0) - QTY[s]; if (d < 0) short -= d; else { over += d; maxOver = Math.max(maxOver, d); } }); return { short, over, maxOver }; }
function constraintsOk(markers, maxsizes, maxpcs) {
  return markers.every(m => { const pcs = m.combo.reduce((a, p) => a + p.cnt, 0), len = m.combo.reduce((a, p) => a + p.cnt * CONS[p.size], 0);
    return m.combo.length <= maxsizes && pcs <= maxpcs && len <= MAXLEN + 1e-9 && new Set(m.combo.map(p => p.size)).size === m.combo.length && m.plies >= 1 && Number.isInteger(m.plies); }); }
const solve = (mode, maxsizes, maxpcs, sur) => X.rsSolve({ ...QTY }, CONS, MAXLEN, maxsizes, maxpcs, { mode, sur, budget: 4000 });

// ١) تغطية تامة واحترام القيود بأوضاع مختلفة
for (const [mode, ms, mp] of [['markers', 6, 5], ['plies', 6, 5], ['markers', 6, 12], ['markers', 3, 4], ['plies', 2, 3]]) {
  const out = solve(mode, ms, mp, 0), d = diff(out);
  chk(`exact coverage ${mode} ms=${ms} mp=${mp}`, d.short === 0 && d.over === 0, d);
  chk(`constraints ${mode} ms=${ms} mp=${mp}`, constraintsOk(out, ms, mp));
}
// ٢) عدد الماركرات معقول: لا يتجاوز عدد المقاسات أبداً، و«أقل ماركرات» يبقى قريباً من أفضل نتيجة معروفة (١٢)
{ const n = solve('markers', 6, 5, 0).length;
  chk('markers ≤ sizes (26)', n <= SIZES.length, n);
  chk('markers mode ≤ 14 for 26 sizes', n <= 14, n);
  chk('markers mode ≤ plies mode', n <= solve('plies', 6, 5, 0).length); }
// ٣) الفائض المسموح لا يتجاوز حدّه لكل مقاس، ولا نقص
{ const d = diff(solve('markers', 6, 12, 2));
  chk('surplus ≤ 2 per size and no shortage', d.short === 0 && d.maxOver <= 2, d); }

// ٤) المكتبة أولاً: توليفات صغيرة (ثنائية/فردية) كانت تفتّت الخطة — يجب أن يختار الحلّال الحرّ الأقل
{ const pairLib = [];
  for (let i = 0; i < SIZES.length; i += 2) if (SIZES[i + 1]) pairLib.push([{ size: SIZES[i], cnt: 1 }, { size: SIZES[i + 1], cnt: 1 }]);
  SIZES.forEach(s => pairLib.push([{ size: s, cnt: 1 }]));
  const free = solve('markers', 6, 12, 0).length;
  const r = X.rsPlanSolve({ ...QTY }, CONS, MAXLEN, 6, 12, pairLib, { mode: 'markers', sur: 0, budget: 4000 });
  chk('fragmenting library replaced by free plan', r.added.length <= free && r.libN === 0, { got: r.added.length, free, libN: r.libN });
  chk('library-first result still covers exactly', (d => d.short === 0 && d.over === 0)(diff(r.added))); }
// ٥) مكتبة جيدة (نفس توليفات الحلّ الحرّ) تُستعمل ولا تُستبدل
{ const good = solve('markers', 6, 12, 0).map(m => m.combo);
  const r = X.rsPlanSolve({ ...QTY }, CONS, MAXLEN, 6, 12, good, { mode: 'markers', sur: 0, budget: 4000 });
  chk('good library kept (libN > 0)', r.libN > 0, r.libN);
  chk('good library covers exactly', (d => d.short === 0 && d.over === 0)(diff(r.added))); }
// ٦) لا يعدّل الكميات المُمرَّرة إليه
{ const rem = { ...QTY }; X.rsPlanSolve(rem, CONS, MAXLEN, 6, 5, [], { mode: 'markers', sur: 0 });
  chk('rsPlanSolve does not mutate input', SIZES.every(s => rem[s] === QTY[s])); }

// ── توقيع التوليفة مستقل عن الترتيب ──
chk('rsComboSig order-independent', X.rsComboSig([{ size: 'L', cnt: 1 }, { size: 'S', cnt: 2 }]) === X.rsComboSig([{ size: 'S', cnt: 2 }, { size: 'L', cnt: 1 }]));
chk('rsComboSig distinguishes counts', X.rsComboSig([{ size: 'S', cnt: 1 }]) !== X.rsComboSig([{ size: 'S', cnt: 2 }]));

// ── حارس المكتبة: طول محفوظ أطول من المحسوب بأكثر من ٥٪ يُتجاهل ──
{ const cons = { A: 2, B: 3 }, x = l => ({ sizes: [{ size: 'A', cnt: 1 }, { size: 'B', cnt: 1 }], actLenM: l });
  chk('lib guard: shorter (nesting) ok', X.rsLibOk(x(4.6), cons));
  chk('lib guard: +4% ok', X.rsLibOk(x(5.2), cons));
  chk('lib guard: +6% rejected', !X.rsLibOk(x(5.3), cons));
  chk('lib guard: unknown size → not judged', X.rsLibOk({ sizes: [{ size: 'Z', cnt: 1 }], actLenM: 99 }, cons));
  chk('rsLibComp sums cnt×cons', Math.abs(X.rsLibComp({ sizes: [{ size: 'A', cnt: 2 }, { size: 'B', cnt: 1 }] }, cons) - 7) < 1e-9); }

// ── مواعيد النسخ الاحتياطي (٥ مساءً و١ صباحاً، بتوقيت الجهاز) ──
{ const at = (d, h, m) => new Date(2026, 9, d, h, m).getTime(), id = t => X.rsBakSlotId(X.rsBakSlot(t));
  chk('slot 16:59 → same day 01', id(at(5, 16, 59)) === '2026-10-05_01', id(at(5, 16, 59)));
  chk('slot 17:00 → same day 17', id(at(5, 17, 0)) === '2026-10-05_17', id(at(5, 17, 0)));
  chk('slot 00:30 → previous day 17', id(at(6, 0, 30)) === '2026-10-05_17', id(at(6, 0, 30)));
  chk('slot 01:00 → same day 01', id(at(6, 1, 0)) === '2026-10-06_01', id(at(6, 1, 0))); }

// ── CRC32 لكاتب ملفات Excel (القيمة المرجعية القياسية) ──
chk('xlCrc("123456789") = CBF43926', X.xlCrc(new TextEncoder().encode('123456789')) === 0xCBF43926);

// ── فحص منطق الاستهلاك ──
{ const base = [['S-53', 2.1], ['S-54', 2.15], ['S-55', 2.18], ['S-56', 2.21], ['S-57', 2.31], ['M-56', 2.3], ['L-56', 2.4]];
  const mk = over => base.map(([size, cons]) => ({ size, cons: over && over[size] != null ? over[size] : cons }));
  const lv = (R, s) => R[s] ? R[s][0].lvl + ':' + R[s][0].code : '';
  chk('cv: clean list has no issues', Object.keys(X.consCheck(mk())).length === 0, X.consCheck(mk()));
  { const R = X.consCheck(mk({ 'S-56': 41.0526 }));
    chk('cv: 41.05 among ~2.2 is bad outlier', lv(R, 'S-56') === 'bad:cvOut', R);
    chk('cv: outlier not used as neighbour reference', !R['S-55'] && !R['S-57'] && !R['M-56'], R); }
  chk('cv: 0.221 typo is bad outlier', lv(X.consCheck(mk({ 'S-56': 0.221 })), 'S-56') === 'bad:cvOut');
  { const R = X.consCheck(mk({ 'S-56': 2.0 }));
    chk('cv: longer size lower → warn both sides', lv(R, 'S-56') === 'warn:cvLtPrev' && lv(R, 'S-55') === 'warn:cvGtNext', R); }
  chk('cv: small dip within 3% tolerated', !X.consCheck(mk({ 'S-56': 2.16 }))['S-56']);
  { const R = X.consCheck(mk({ 'S-57': 2.6 }));
    chk('cv: +18% for one step → jump warn', lv(R, 'S-57') === 'warn:cvJump', R); }
  { const R = X.consCheck(mk({ 'L-56': 2.1 }));
    chk('cv: wider letter lower → warn', lv(R, 'L-56') === 'warn:cvLtLetter' && lv(R, 'M-56') === 'warn:cvGtLetter', R); }
  { const R = X.consCheck(mk({ 'S-56': 41 }), new Set(['S-53']));
    chk('cv: "only" limits reported sizes', Object.keys(R).length === 0, R); }
  chk('cv: XXL ranks like 2XL (no false letter warn)', !Object.keys(X.consCheck([{ size: 'XL-59', cons: 2.5 }, { size: 'XXL-59', cons: 2.6 }, { size: '3XL-59', cons: 2.7 }])).length);
  { const R = X.consCheck(mk({ 'S-56': 2.0 })); chk('cv: no jump warn right after a dip', !R['S-57'], R); }
  chk('cv: < 4 values → no outlier judgement', !X.consCheck([{ size: 'A', cons: 1 }, { size: 'B', cons: 9 }]).A); }

console.log(`\nSolver tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
