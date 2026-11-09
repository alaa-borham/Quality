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
  ...['rsCombos', 'rsBestCombo', 'rsSolve', 'rsPlanSolve', 'rsComboSig', 'rsLibComp', 'rsLibOk', 'rsBakSlot', 'rsBakSlotId', 'xlCrc', 'consCheck', 'rsTrimSurplus', 'rsColorPlan', 'rsColorBeam', 'rsColorAlloc'].map(grabFn),
].join('\n');
// rsSolve يقرأ الهدف/الفائض من الواجهة عند غياب الخيارات — نعيد قيمة فارغة فيُستعمل الافتراضي («أقل ماركرات»، فائض 0)
const ctx = { $: () => ({ value: '' }), Date, Math, Object, Set, Map, Array, String, Number, Uint32Array, Int32Array, Float64Array, TextEncoder, console };
vm.createContext(ctx);
vm.runInContext(code + '\n;globalThis.__x={rsCombos,rsSolve,rsPlanSolve,rsComboSig,rsLibComp,rsLibOk,rsBakSlot,rsBakSlotId,xlCrc,consCheck,rsTrimSurplus,rsColorPlan,rsColorBeam,rsColorAlloc};', ctx);
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

// ── الأطوال المقيسة في الحلّال ──
{ const cons = { A: 5, B: 5, C: 4.6 }, q = { A: 10, B: 10, C: 0 };
  const free = X.rsSolve({ ...q }, cons, 9.5, 6, 5, { mode: 'markers', sur: 0 });
  chk('meas: without measurement A+B (10 > 9.5) cannot pair', free.length === 2 && free.every(m => m.combo.length === 1), free);
  const withM = X.rsSolve({ ...q }, cons, 9.5, 6, 5, { mode: 'markers', sur: 0, meas: [{ pairs: [{ size: 'A', cnt: 1 }, { size: 'B', cnt: 1 }], len: 9.4 }] });
  chk('meas: measured 9.4 ≤ 9.5 → one marker A+B ×10', withM.length === 1 && withM[0].combo.length === 2 && withM[0].plies === 10, withM);
  chk('meas: marker length = measured length', withM.length && Math.abs(withM[0].len - 9.4) < 1e-9, withM);
  const tooLong = X.rsSolve({ ...q }, cons, 9.5, 6, 5, { mode: 'markers', sur: 0, meas: [{ pairs: [{ size: 'A', cnt: 1 }, { size: 'B', cnt: 1 }], len: 9.8 }] });
  chk('meas: measured 9.8 > 9.5 still rejected', tooLong.every(m => m.combo.length === 1), tooLong);
  // سرّ الترجيح: بين توليفتين متكافئتين يُفضَّل الأوفر بالقياس
  const c2 = { A: 3, B: 3, C: 3 }, q2 = { A: 6, B: 6, C: 6 };
  const pick = X.rsSolve({ ...q2 }, c2, 6.5, 2, 2, { mode: 'markers', sur: 0, meas: [{ pairs: [{ size: 'B', cnt: 1 }, { size: 'C', cnt: 1 }], len: 5.6 }] });
  chk('meas: equal options → prefers better measured nesting', pick.some(m => m.combo.map(p => p.size).sort().join('') === 'BC'), pick);
  // مسار المرشّحين (مكتبة): يقبل المقيس ضمن الحد
  const lib = X.rsSolve({ ...q }, cons, 9.5, 6, 5, { mode: 'markers', sur: 0, cands: [[{ size: 'A', cnt: 1 }, { size: 'B', cnt: 1 }]], meas: [{ pairs: [{ size: 'A', cnt: 1 }, { size: 'B', cnt: 1 }], len: 9.4 }] });
  chk('meas: library candidate accepted by measured length', lib.length === 1 && lib[0].plies === 10, lib); }

// ── خطة الألوان: كل لون يغطّي كمياته بالضبط، والماركرات مشتركة ──
{ const SZ = ['S-53', 'S-54', 'S-55', 'S-56', 'S-57', 'M-53', 'M-54', 'M-55', 'M-56', 'L-55', 'L-56', 'L-57'];
  const cons = {}; SZ.forEach((s, i) => cons[s] = 2.1 + i * 0.05);
  let x = 5; const rnd = () => (x = (x * 16807) % 2147483647) / 2147483647;
  const mkQ = f => { const Q = { G: {}, B: {}, E: {} }; SZ.forEach(s => { const v = f(); Q.G[s] = v[0]; Q.B[s] = v[1]; Q.E[s] = v[2]; }); return Q; };
  const check = (Q, plan) => { let bad = 0; Object.keys(Q).forEach(c => { const made = {}; plan.forEach(m => m.combo.forEach(p => made[p.size] = (made[p.size] || 0) + p.cnt * (m.sp[c] || 0)));
    SZ.forEach(s => { if ((made[s] || 0) !== (Q[c][s] || 0)) bad++; }); }); return bad; };
  const Qr = mkQ(() => [15 + Math.floor(rnd() * 20), 15 + Math.floor(rnd() * 20), 15 + Math.floor(rnd() * 20)]);
  const pr = X.rsColorPlan(Qr, cons, 9, 6, 100, { sur: 0 });
  chk('colors: random quantities → every color exact', check(Qr, pr) === 0, check(Qr, pr));
  // نسب متطابقة تماماً: لا ماركرات زائدة عن خطة الإجمالي
  const Qp = mkQ(() => { const b = 8 + Math.floor(rnd() * 10); return [b * 3, b * 3, b * 4]; });
  const tot = {}; SZ.forEach(s => tot[s] = Qp.G[s] + Qp.B[s] + Qp.E[s]);
  const pp = X.rsColorPlan(Qp, cons, 9, 6, 100, { sur: 0 }), plain = X.rsSolve({ ...tot }, cons, 9, 6, 100, { mode: 'markers', sur: 0 }).length;
  chk('colors: proportional colors → exact and no more markers than the total plan', check(Qp, pp) === 0 && pp.length <= plain, { colors: pp.length, plain });
  // يعيد استعمال الماركرات الحالية (seed) أولاً
  const seed = pr.slice(0, 3).map(m => m.combo), ps = X.rsColorPlan(Qr, cons, 9, 6, 100, { sur: 0, seed });
  chk('colors: seed combos reused, still exact', check(Qr, ps) === 0 && seed.every(c => ps.some(m => X.rsComboSig(m.combo) === X.rsComboSig(c))), ps.length);
  // الفائض المسموح يقلّل الماركرات ولا يتجاوز حدّه لكل لون/مقاس
  const p2 = X.rsColorPlan(Qr, cons, 9, 6, 100, { sur: 2 }); let maxOver = 0, short = 0;
  Object.keys(Qr).forEach(c => { const made = {}; p2.forEach(m => m.combo.forEach(p => made[p.size] = (made[p.size] || 0) + p.cnt * (m.sp[c] || 0)));
    SZ.forEach(s => { const d = (made[s] || 0) - Qr[c][s]; if (d < 0) short -= d; else maxOver = Math.max(maxOver, d); }); });
  chk('colors: surplus 2 → no shortage, ≤2 over per size/color, fewer or equal markers', short === 0 && maxOver <= 2 && p2.length <= pr.length, { n2: p2.length, n0: pr.length, maxOver, short }); }

// ── البحث الشعاعي المشترك للألوان: دقيق ١٠٠٪، يحترم القيود، وأقل ماركرات بوضوح من الحلّال التتابعي ──
{ const mkInst = (n, seed) => { let x = seed; const rnd = () => (x = (x * 16807) % 2147483647) / 2147483647;
    const SZ = Array.from({ length: n }, (_, i) => 'Z' + String(i).padStart(2, '0')), cons = {}; SZ.forEach((s, i) => cons[s] = +(2.1 + i * (1.0 / n)).toFixed(3));
    const Q = { G: {}, B: {}, E: {} }; SZ.forEach(s => { const b = 10 + Math.floor(rnd() * 120); Q.G[s] = Math.round(b * (0.8 + rnd() * 0.4)); Q.B[s] = rnd() < 0.15 ? 0 : Math.round(b * (0.6 + rnd() * 0.5)); Q.E[s] = Math.round(b * (0.8 + rnd() * 0.4)); });
    return { SZ, cons, Q }; };
  const bad = (Q, plan) => { let b = 0; Object.keys(Q).forEach(c => { const md = {}; plan.forEach(m => m.combo.forEach(p => md[p.size] = (md[p.size] || 0) + p.cnt * (m.sp[c] || 0)));
    Object.keys(Q[c]).forEach(s => { if ((md[s] || 0) !== (Q[c][s] || 0)) b++; }); Object.keys(md).forEach(s => { if (!(s in Q[c]) && md[s]) b++; }); }); return b; };
  const { cons, Q } = mkInst(20, 3);
  const seq = X.rsColorPlan(Q, cons, 9, 6, 5, { sur: 0, noBeam: true }), bm = X.rsColorBeam(Q, cons, 9, 6, 5, {});
  chk('beam: every color × size exact (no surplus, no shortage)', bm && bad(Q, bm) === 0, bm && bad(Q, bm));
  chk('beam: limits respected (length ≤ 9, ≤ 6 sizes, ≤ 5 pieces)', bm.every(m => m.combo.reduce((a, p) => a + p.cnt * cons[p.size], 0) <= 9 + 1e-9 && m.combo.length <= 6 && m.combo.reduce((a, p) => a + p.cnt, 0) <= 5));
  chk('beam: clearly fewer markers than the sequential planner (20 sizes: ≤ 22 vs 26)', bm.length <= 22 && bm.length < seq.length, { beam: bm.length, seq: seq.length });
  const pl = X.rsColorPlan(Q, cons, 9, 6, 5, { sur: 0 });
  chk('colors plan: picks the beam when it has fewer markers, still exact', pl.length <= bm.length && bad(Q, pl) === 0, { plan: pl.length, beam: bm.length });
  // توليفات الخطة الحالية (seed) تُستعمل مجاناً — والنتيجة دقيقة
  const seedC = bm.slice(0, 6).map(m => m.combo), bs = X.rsColorBeam(Q, cons, 9, 6, 5, { seed: seedC });
  chk('beam: seed combos reused for free, still exact', bad(Q, bs) === 0 && seedC.some(c => bs.some(m => X.rsComboSig(m.combo) === X.rsComboSig(c))), bs.length);
  // الطول المقيس: توليفة محسوبها فوق الحد ومقيسها ضمنه تُقبل، والعكس يُستبعد
  const c2 = { A: 4.6, B: 4.6, C: 3.0 }, q2 = { G: { A: 10, B: 10, C: 6 }, B: { A: 4, B: 4, C: 2 } };
  const mA = X.rsColorBeam(q2, c2, 9, 6, 5, { meas: [{ pairs: [{ size: 'A', cnt: 1 }, { size: 'B', cnt: 1 }], len: 8.8 }] });
  chk('beam: measured length within the limit allows the combo', bad(q2, mA) === 0 && mA.some(m => X.rsComboSig(m.combo) === X.rsComboSig([{ size: 'A', cnt: 1 }, { size: 'B', cnt: 1 }])), mA);
  const mB = X.rsColorBeam(q2, { A: 2.9, B: 2.9, C: 3.0 }, 9, 6, 5, { meas: [{ pairs: [{ size: 'A', cnt: 1 }, { size: 'B', cnt: 1 }, { size: 'C', cnt: 1 }], len: 9.6 }] });
  chk('beam: measured length over the limit excludes the combo', bad(q2, mB) === 0 && !mB.some(m => m.combo.length === 3), mB);
  // لون واحد، ولون كمياته صفر، وحالة فارغة
  const one = X.rsColorBeam({ G: Q.G }, cons, 9, 6, 5, {});
  chk('beam: single color exact', bad({ G: Q.G }, one) === 0);
  chk('beam: no quantities → empty plan', X.rsColorBeam({ G: { A: 0 } }, { A: 2 }, 9, 6, 5, {}).length === 0); }

// ── إعادة توزيع طبقات خطة قائمة على الألوان: بلا زيادة أبداً، ونقص أقل ──
{ const need = { A: { X: 30, Y: 30 }, B: { X: 10, Y: 20 } };
  const mk = [{ vp: [{ size: 'X', cnt: 1 }, { size: 'Y', cnt: 1 }], sp: { A: 20, B: 20 }, fixed: false }, { vp: [{ size: 'Y', cnt: 1 }], sp: { A: 5, B: 5 }, fixed: false }];
  X.rsColorAlloc(mk, need, ['A', 'B']);
  const made = c => { const o = {}; mk.forEach(m => m.vp.forEach(q => o[q.size] = (o[q.size] || 0) + q.cnt * (m.sp[c] || 0))); return o; };
  let over = 0, short = 0; ['A', 'B'].forEach(c => { const md = made(c); Object.keys(need[c]).forEach(s => { const d = (md[s] || 0) - need[c][s]; if (d > 0) over += d; else short -= d; }); });
  chk('alloc: no surplus after re-allocation', over === 0, { mk, over });
  chk('alloc: this case becomes exact (X+Y×30/10, Y×0/10)', short === 0, { mk, short });
  const fx = [{ vp: [{ size: 'X', cnt: 1 }], sp: { A: 99 }, fixed: true }]; X.rsColorAlloc(fx, { A: { X: 1 } }, ['A']);
  chk('alloc: fixed (exact) markers are not touched', fx[0].sp.A === 99); }

// ── إزالة الإنتاج الزائد ──
{ const mk = (pairs, plies) => ({ pairs: pairs.map(([size, cnt]) => ({ size, cnt })), plies });
  const prod = (ms, pl) => { const o = {}; ms.forEach((m, i) => m.pairs.forEach(p => o[p.size] = (o[p.size] || 0) + p.cnt * pl[i])); return o; };
  // حالة المستخدم: ماركر صار صالحاً (٤ قياسات × ٣ طبقات) فزاد كل قياس ٣ — يُحذف كاملاً
  { const ms = [mk([['M-54', 1], ['S-56', 1], ['S-57', 1], ['S-53', 1]], 3), mk([['M-54', 1], ['M-53', 2]], 21), mk([['S-56', 1], ['S-57', 1], ['S-53', 1]], 3)];
    const r = X.rsTrimSurplus(ms, { 'M-54': 3, 'S-56': 3, 'S-57': 3, 'S-53': 3 });
    chk('trim: whole surplus marker removed', r.plies[0] === 0 && r.plies[1] === 21 && r.plies[2] === 3, r.plies);
    chk('trim: no surplus left', Object.values(r.over).every(v => v <= 0), r.over); }
  // زيادة جزئية: يُخفَّض أولاً دون نقص (٤ طبقات)، ثم يُزال باقي زائد B فينتج نقص A=2 يكمله الحلّال
  { const ms = [mk([['A', 1], ['B', 1]], 10)]; const r = X.rsTrimSurplus(ms, { A: 4, B: 6 });
    chk('trim: partial reduction, then remaining surplus removed (shortage filled later)', r.plies[0] === 4 && r.over.A === -2 && r.over.B === 0, r); }
  // الزائد في قياس واحد فقط: يُزال كله (أي نقص ناتج يكمله الحلّال) ويُختار الماركر الأقل ضرراً
  { const ms = [mk([['A', 1], ['B', 1], ['C', 1]], 5), mk([['A', 1], ['D', 1]], 5)]; const r = X.rsTrimSurplus(ms, { A: 2, D: 2 });
    chk('trim: picks least-harm marker', r.plies[1] === 3 && r.plies[0] === 5 && r.over.A === 0 && r.over.D === 0, r); }
  { const ms = [mk([['A', 2]], 4)]; const r = X.rsTrimSurplus(ms, { A: 3 });
    chk('trim: odd surplus with cnt 2 → no surplus left (1 short, filled later)', r.plies[0] === 2 && r.over.A === -1, r); }
  { const ms = [mk([['A', 1]], 5)]; const before = JSON.stringify(ms); X.rsTrimSurplus(ms, { A: 2 });
    chk('trim: does not mutate input', JSON.stringify(ms) === before); } }

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
