/*
 * اختبار واجهة شامل في متصفح حقيقي (Chromium عبر Playwright) — بلا Firebase حقيقي.
 * التشغيل:  npm run test:ui
 * يُستبدل Firebase بقاعدة بيانات في الذاكرة، ثم يفحص:
 *   ١) فتح كل الصفحات والأدوات بالعربية والإنجليزية وبالأوضاع الثلاثة بلا أي خطأ JavaScript
 *   ٢) وظائف الريشو الأساسية: الخطة التلقائية، التوليفات، مراجعة البدائل، الرولات، الطباعة، ملفات Excel
 *   ٣) الواجهة الإنجليزية خالية من النصوص العربية الظاهرة (عدا زر «ع» للعودة للعربية)
 *   ٤) النسخ السحابي: إنشاء، عدم تكرار نفس الموعد، التنظيف إلى ٣٠ نسخة
 *   ٥) مقياس حجم مستند المساحة مطابق لحساب Firestore الرسمي
 * يعيد رمز خروج 1 عند أي فشل.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// Firebase بديل في الذاكرة (يدعم المجموعات الفرعية و orderBy/limit) — يُحقن قبل سكربتات Firebase الأصلية
const stub = `<script>
(function(){
  const store=new Map();window.__store=store;
  const snapOf=p=>({id:p.split('/').pop(),exists:store.has(p),data:()=>store.get(p),ref:docRef(p)});
  function docRef(p){return {id:p.split('/').pop(),path:p,get:()=>Promise.resolve(snapOf(p)),
    set:d=>{store.set(p,JSON.parse(JSON.stringify(d)));return Promise.resolve();},
    update:d=>{store.set(p,Object.assign({},store.get(p)||{},JSON.parse(JSON.stringify(d))));return Promise.resolve();},
    delete:()=>{store.delete(p);return Promise.resolve();},onSnapshot:cb=>{try{cb(snapOf(p))}catch(e){};return()=>{}},collection:c=>colRef(p+'/'+c)};}
  function colRef(p,ord,lim){const self={doc:id=>docRef(p+'/'+(id||Math.random().toString(36).slice(2))),where:()=>self,
    orderBy:(f,dir)=>colRef(p,[f,dir],lim),limit:n=>colRef(p,ord,n),
    get:()=>{let docs=[...store.keys()].filter(k=>k.startsWith(p+'/')&&k.slice(p.length+1).indexOf('/')<0).map(snapOf);
      if(ord)docs.sort((a,b)=>{const x=a.data()[ord[0]],y=b.data()[ord[0]];return (x<y?-1:x>y?1:0)*(ord[1]==='desc'?-1:1);});
      if(lim)docs=docs.slice(0,lim);return Promise.resolve({docs,forEach:f=>docs.forEach(f),empty:!docs.length,size:docs.length});},
    onSnapshot:cb=>{try{cb({docs:[],forEach:()=>{}})}catch(e){};return()=>{}},add:d=>{const r=self.doc();return r.set(d).then(()=>r);}};return self;}
  const db={collection:c=>colRef(c)};const fsf=function(){return db;};
  fsf.FieldValue={serverTimestamp:()=>new Date().toISOString(),increment:()=>0,arrayUnion:()=>[],arrayRemove:()=>[]};fsf.Timestamp={now:()=>({toDate:()=>new Date()})};
  const auth=function(){return {onAuthStateChanged:cb=>{try{cb(null)}catch(e){};return()=>{}},currentUser:{uid:'u1'},signInWithEmailAndPassword:()=>Promise.resolve({}),signOut:()=>Promise.resolve()};};
  auth.EmailAuthProvider={credential:()=>({})};
  window.firebase={initializeApp:()=>({}),apps:[],app:()=>({firestore:fsf}),auth,firestore:fsf};
})();
<\/script>`;
html = html.replace('<script src="https://www.gstatic.com/firebasejs', stub + '\n<script src="https://www.gstatic.com/firebasejs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-ui-'));
const page_path = path.join(tmp, 'index.html');
fs.writeFileSync(page_path, html);

let pass = 0, fail = 0;
const chk = (name, ok, info) => { if (ok) pass++; else { fail++; console.log('  ✗ FAIL:', name, info !== undefined ? '— ' + JSON.stringify(info).slice(0, 400) : ''); } };

const launchOpts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
await page.route('**/*', r => { const u = r.request().url(); return /gstatic|googleapis|firebaseio/.test(u) ? r.abort() : r.continue(); });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e).split('\n')[0]));
const downloads = [];
page.on('download', d => downloads.push(d.suggestedFilename()));
await page.goto('file://' + page_path, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(400);
chk('page loads without JS errors', pageErrors.length === 0, pageErrors);

// ── إعداد: مالك مسجّل، أوردر بست مقاسات ──
await page.evaluate(() => {
  window.print = () => {}; window.confirm = () => true; window.alert = () => {}; window.prompt = () => '148';
  window.__toasts = []; window.toast = m => window.__toasts.push(m);
  MEMBER = { role: 'owner', wsId: 'ws1', wsName: 'WS', name: 'tester', uid: 'u1', perms: { _v: 2, marker: 3, insp: 3, orders: 3, fact: 3, ref: 3, dash: 3, tools: 3 } };
  __store.set('qc_workspaces/ws1', { ownerUid: 'u1' });
  $('s-auth').classList.add('hide'); $('s-app').classList.remove('hide');
});

// ١) كل الصفحات بكل لغة وكل وضع
const steps = await page.evaluate(() => {
  const log = []; const step = (n, f) => { try { f(); } catch (e) { log.push(n + ': ' + (e && e.message)); } };
  for (const lang of ['ar', 'en']) for (const th of ['light', 'grey', 'dark']) {
    LANG = lang; step('applyI18n ' + lang, () => applyI18n()); step('theme ' + th, () => applyTheme(th));
    for (const tb of ['fact', 'orders', 'insp', 'dash', 'tools', 'marker', 'ref']) step(`go ${tb} ${lang}/${th}`, () => go(tb, null));
    for (const tl of ['fp', 'sh', 'aq', 'all']) step('tool ' + tl, () => goTool(tl, null));
    for (const sub of ['seq', 'def', 'chk', 'gloss']) step('ref ' + sub, () => goRef(sub, null));
  }
  LANG = 'ar'; applyI18n(); applyTheme('light'); return log;
});
chk('all pages × languages × themes render', steps.length === 0, steps);

// ٢) وظائف الريشو
const rs = await page.evaluate(async () => {
  const log = []; const step = (n, f) => { try { f(); } catch (e) { log.push(n + ': ' + (e && e.message)); } };
  go('marker', null);
  step('qty', () => { $('rs-qty-rows').innerHTML = '';
    [['S-56', 10, 2.25], ['S-57', 20, 2.33], ['M-57', 84, 2.52], ['M-58', 87, 2.57], ['L-59', 99, 2.75], ['XL-58', 69, 2.75]].forEach(([s, q, c]) => rsAddQtyRow({ size: s, qty: q, cons: c })); rsCalc(); });
  for (const k of ['rsc', 'rsq', 'rsm', 'rscb', 'rsr', 'rss', 'rso']) step('collapse ' + k, () => { rsCollapse(k); rsCollapse(k); });
  step('rsAutoPlan', () => rsAutoPlan());
  const nMk = document.querySelectorAll('.rs-mrow1').length;
  step('rsComboSuggest', () => rsComboSuggest()); step('rsReviewHeavy', () => rsReviewHeavy());
  step('rsHeavyToCombos', () => rsHeavyToCombos()); step('rsHeavyApply', () => rsHeavyApply());
  step('rsReducePlies', () => rsReducePlies()); step('rsSortByPerPiece', () => rsSortByPerPiece()); step('rsSortMarkers', () => rsSortMarkers());
  step('rsRollPlan', () => { if ($('rs-rolllen')) $('rs-rolllen').value = 100; rsRollPlan(); });
  window.setTimeout = ((st) => (f, ms) => (ms === 500 ? 0 : st(f, ms)))(window.setTimeout); // لا تمسح منطقة الطباعة بعد الطباعة
  step('printRsPlan', () => printRsPlan()); step('printRsRolls', () => printRsRolls());
  step('printRsSpread', () => printRsSpread());
  const spreadRows = $('print-area').querySelectorAll('tbody tr').length;
  step('exportRsExcel', () => exportRsExcel()); step('exportRsSpreadExcel', () => exportRsSpreadExcel()); step('exportRsRollsExcel', () => exportRsRollsExcel());
  step('rsMeasQ', () => { rsMkCalc(); if (RS_MEASQ.length) { rsMeasQToCombos(); rsMeasQPrint(); } });
  step('rsNewPlan', () => rsResetPlan(false));
  const after = document.querySelectorAll('.rs-mrow1').length;
  return { log, nMk, spreadRows, after };
});
chk('risho functions run without errors', rs.log.length === 0, rs.log);
chk('auto plan creates markers', rs.nMk > 0, rs.nMk);
chk('spread form prints a row per marker (+ blank rows + total)', rs.spreadRows >= rs.nMk + 1, rs);
chk('new plan clears markers', rs.after === 0, rs.after);
await page.waitForTimeout(300);
chk('Excel exports download 3 .xlsx files', downloads.filter(f => f.endsWith('.xlsx')).length >= 3, downloads);

// ٣) الواجهة الإنجليزية بلا عربي ظاهر
const leftover = await page.evaluate(async () => {
  LANG = 'en'; applyI18n();
  const AR = /[؀-ۿ]/, out = new Set(), allow = new Set(['ع']);
  const vis = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; };
  const scan = where => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { const tx = n.nodeValue.trim(); const p = n.parentElement;
      if (!tx || !AR.test(tx) || allow.has(tx) || !p || !vis(p) || p.closest('script,style,#print-area')) continue; out.add(where + ': ' + tx.slice(0, 60)); }
    document.querySelectorAll('[title]').forEach(e => { if (vis(e) && AR.test(e.title)) out.add(where + ' title: ' + e.title.slice(0, 50)); });
    document.querySelectorAll('select').forEach(e => { if (vis(e)) [...e.options].forEach(o => { if (AR.test(o.text)) out.add(where + ' option: ' + o.text); }); });
  };
  go('marker', null);
  $('rs-qty-rows').innerHTML = ''; [['S-56', 30, 2.25], ['M-57', 84, 2.52], ['L-59', 99, 2.75]].forEach(([s, q, c]) => rsAddQtyRow({ size: s, qty: q, cons: c })); rsCalc();
  rsAddMarker({ pairs: [{ size: 'M-57', cnt: 1 }, { size: 'L-59', cnt: 1 }], plies: 84 }); rsMkCalc();
  ['rsc', 'rsq', 'rsm', 'rscb', 'rsr', 'rss', 'rso'].forEach(k => { if (RS_COL[k]) rsCollapse(k); });
  rsComboSuggest(); rsReviewHeavy(); applyI18n(); scan('marker');
  for (const tb of ['fact', 'orders', 'insp', 'dash']) { go(tb, null); scan(tb); }
  go('tools', null); for (const tl of ['fp', 'sh', 'aq', 'all']) { goTool(tl, null); scan('tools/' + tl); }
  for (const sub of ['seq', 'def', 'chk', 'gloss']) { go('ref', null); goRef(sub, null); scan('ref/' + sub); }
  LANG = 'ar'; applyI18n(); return [...out];
});
chk('English UI has no visible Arabic text', leftover.length === 0, leftover);

// ٤) النسخ السحابي
const bak = await page.evaluate(async () => {
  const W = ms => new Promise(r => setTimeout(r, ms));
  localStorage.clear();
  COMBOLIB = { 'P': [{ sig: 'A×1|B×1', w: '148', actLenM: 5.1, sizes: [{ size: 'A', cnt: 1 }, { size: 'B', cnt: 1 }] }] }; SIZELS = [{ name: 'P', sizes: [] }];
  const keys = () => [...__store.keys()].filter(k => k.includes('/backups/'));
  rsAutoBackupCheck(); await W(150); const first = keys().length;
  localStorage.clear(); rsAutoBackupCheck(); await W(150); const second = keys().length;
  for (let k = 0; k < 35; k++) __store.set('qc_workspaces/ws1/backups/2026-01-' + String(k).padStart(2, '0') + '_01', { slot: '2026-01-' + String(k).padStart(2, '0') + '_01', data: '{}' });
  rsCloudPrune(); await W(150);
  return { first, second, pruned: keys().length };
});
chk('cloud backup created once per slot', bak.first === 1 && bak.second === 1, bak);
chk('cloud backups pruned to 30', bak.pruned === 30, bak);

// ٤ب) مكتبة التوليفات لكل منتج: ترحيل من الحقل القديم، حفظ المنتج المتغيّر فقط، والمسح لا يعيد بيانات قديمة
const lib = await page.evaluate(async () => {
  const W = ms => new Promise(r => setTimeout(r, ms)), docs = () => [...__store.keys()].filter(k => k.includes('/combolib/'));
  const r = (s, L) => ({ sig: s, w: '148', actLenM: L, sizes: [] });
  LIB_MIGRATED.clear(); LIB_DENIED = false; LIB_SPLIT = {}; LIB_SPLIT_N = 0; LIB_SPLIT_READY = true; LIB_WS_READY = true;
  LIB_LEGACY = { P: [r('A×1', 2)], Q: [r('B×1', 3)] }; libAssemble(); await W(100);
  const migrated = docs().length;
  // تحاكي لقطة الخادم بعد الترحيل
  LIB_SPLIT = {}; docs().forEach(k => { const d = __store.get(k); LIB_SPLIT[d.prod] = d.recs; }); LIB_SPLIT_N = docs().length; libAssemble();
  const before = JSON.stringify(__store.get(docs().find(k => __store.get(k).prod === 'Q')));
  const nl = JSON.parse(JSON.stringify(COMBOLIB)); nl.P.push(r('C×1', 4)); await libSave(nl);
  const pDoc = __store.get(docs().find(k => __store.get(k).prod === 'P')), qSame = JSON.stringify(__store.get(docs().find(k => __store.get(k).prod === 'Q'))) === before;
  LIB_SPLIT = {}; docs().forEach(k => { const d = __store.get(k); LIB_SPLIT[d.prod] = d.recs; }); libAssemble();
  const nl2 = JSON.parse(JSON.stringify(COMBOLIB)); nl2.P = []; await libSave(nl2);
  LIB_SPLIT = {}; docs().forEach(k => { const d = __store.get(k); LIB_SPLIT[d.prod] = d.recs; }); libAssemble();
  return { migrated, pAfterSave: pDoc.recs.length, qUntouched: qSame, pAfterClear: (COMBOLIB.P || []).length, docsAfterClear: docs().length };
});
chk('library migrates per product', lib.migrated === 2, lib);
chk('library save writes only the changed product', lib.pAfterSave === 2 && lib.qUntouched, lib);
chk('cleared product stays empty (no legacy resurrection)', lib.pAfterClear === 0 && lib.docsAfterClear === 2, lib);

// ٥) مقياس حجم المستند = مثال Firestore الرسمي (147 بايت)
const size = await page.evaluate(() => fsBytes('users') + fsBytes('jeff') + fsBytes('tasks') + fsBytes('my_task_id') + 16
  + fsBytes({ type: 'Personal', done: false, priority: 1, description: 'Learn Cloud Firestore' }) + 32);
chk('Firestore document size formula', size === 147, size);
const warn = await page.evaluate(() => { go('marker', null); const el = $('ws-size-warn'), st = f => { WS_SIZE = f * WS_DOC_LIMIT; wsSizeUpdate(); return el.style.display === 'none' ? 'hidden' : (el.style.background.includes('bad') ? 'danger' : 'warn'); };
  const r = [st(0.13), st(0.75), st(0.95)]; WS_SIZE = 0; wsSizeUpdate(); return r; });
chk('size banner: hidden <70% · warning ≥70% · danger ≥90%', warn.join() === 'hidden,warn,danger', warn);

chk('no JS errors during the whole run', pageErrors.length === 0, pageErrors);
await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\nUI tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
