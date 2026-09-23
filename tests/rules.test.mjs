/*
 * اختبارات قواعد أمان Firestore (firestore-full.rules) على محاكي Firestore.
 * التشغيل:  npm run test:rules     (يشغّل المحاكي تلقائياً ثم هذا الملف)
 * يفحص: الصلاحيات المفصّلة لكل قسم، منع تصعيد الصلاحيات الذاتي، حفظ مكتبة التوليفات،
 *        وتقييد إعدادات المرجع — ويعيد رمز خروج 1 عند أي فشل.
 */
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { setDoc, getDoc, updateDoc, deleteDoc, doc, setLogLevel } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

setLogLevel('error');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RULES = fs.readFileSync(path.join(__dirname, '..', 'firestore-full.rules'), 'utf8');
const PORT = Number(process.env.FIRESTORE_PORT || 8998);
const ADMIN = 'I2Stgz5hPVM6qeG19NCmgj4GCck1';
const WS = 'ws1';

const env = await initializeTestEnvironment({
  projectId: 'demo-qc',
  firestore: { rules: RULES, host: '127.0.0.1', port: PORT },
});

let pass = 0, fail = 0;
const chk = async (name, p) => { try { await p; pass++; } catch (e) { fail++; console.log('  ✗ FAIL:', name, '—', e.message); } };

// ── بذور: أعضاء وبيانات (بتجاوز القواعد) ──
await env.withSecurityRulesDisabled(async ctx => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'qc_members', 'ownerU'), { wsId: WS, role: 'owner', name: 'O' });
  // مفتّش بصلاحيات مفصّلة
  await setDoc(doc(db, 'qc_members', 'inspU'), { wsId: WS, role: 'inspector', name: 'I',
    perms: { _v: 2, fact: 0, orders: 2, insp: 3, dash: 1, tools: 0, marker: 2, ref: 1 } });
  // مفتّش قديم (النظام القديم fact/del)
  await setDoc(doc(db, 'qc_members', 'legU'), { wsId: WS, role: 'inspector', name: 'L', perms: { fact: true, del: false } });
  // محرّر مراجع / مشاهد مراجع / مقيّد بالكامل / خارج المساحة
  await setDoc(doc(db, 'qc_members', 'refEdU'), { wsId: WS, role: 'inspector', perms: { _v: 2, fact: 0, orders: 1, insp: 1, dash: 1, tools: 0, marker: 2, ref: 2 } });
  await setDoc(doc(db, 'qc_members', 'refViewU'), { wsId: WS, role: 'inspector', perms: { _v: 2, fact: 0, orders: 1, insp: 1, dash: 1, tools: 0, marker: 1, ref: 1 } });
  await setDoc(doc(db, 'qc_members', 'rstU'), { wsId: WS, role: 'inspector', perms: { _v: 2, fact: 0, orders: 0, insp: 0, dash: 0, tools: 0, marker: 0, ref: 0 } });
  await setDoc(doc(db, 'qc_members', 'outU'), { wsId: 'ws2', role: 'inspector', name: 'X' });
  await setDoc(doc(db, 'qc_orders', 'o1'), { wsId: WS, po: 'PO1' });
  await setDoc(doc(db, 'qc_orders', 'o2'), { wsId: WS, po: 'PO2' });
  await setDoc(doc(db, 'qc_factories', 'f1'), { wsId: WS, name: 'F' });
  await setDoc(doc(db, 'qc_inspections', 'i1'), { wsId: WS });
  await setDoc(doc(db, 'qc_workspaces', WS), { name: 'W', code: 'AB12', ownerUid: 'ownerU', comboLib: {}, sizeLists: [{ name: 'ثوب' }] });
  await setDoc(doc(db, 'qc_seqcfg', WS), { list: [] });
  await setDoc(doc(db, 'qc_chkcfg', WS), { lists: [] });
  await setDoc(doc(db, 'qc_defects', 'd1'), { wsId: WS, name: 'x' });
});

const as = uid => env.authenticatedContext(uid).firestore();
const owner = as('ownerU'), insp = as('inspU'), leg = as('legU');
const refEd = as('refEdU'), refView = as('refViewU'), restrict = as('rstU'), admin = as(ADMIN);

// ── القسم أ: الصلاحيات المفصّلة ──
await chk('owner deletes order', assertSucceeds(deleteDoc(doc(owner, 'qc_orders', 'o1'))));
await chk('owner creates factory', assertSucceeds(setDoc(doc(owner, 'qc_factories', 'f2'), { wsId: WS, name: 'F2' })));
await chk('admin deletes factory', assertSucceeds(deleteDoc(doc(admin, 'qc_factories', 'f1'))));

await chk('insp updates order (orders=2)', assertSucceeds(updateDoc(doc(insp, 'qc_orders', 'o2'), { po: 'X' })));
await chk('insp delete order DENIED (orders=2)', assertFails(deleteDoc(doc(insp, 'qc_orders', 'o2'))));
await chk('insp deletes inspection (insp=3)', assertSucceeds(deleteDoc(doc(insp, 'qc_inspections', 'i1'))));
await chk('insp create factory DENIED (fact=0)', assertFails(setDoc(doc(insp, 'qc_factories', 'f3'), { wsId: WS, name: 'N' })));

await chk('legacy updates factory (fact=true)', assertSucceeds(updateDoc(doc(leg, 'qc_factories', 'f2'), { name: 'F2b' })));
await chk('legacy delete factory DENIED (needs 3)', assertFails(deleteDoc(doc(leg, 'qc_factories', 'f2'))));
await chk('legacy creates order', assertSucceeds(setDoc(doc(leg, 'qc_orders', 'o3'), { wsId: WS, po: 'L' })));

await chk('outsider reads ws1 order DENIED', assertFails(getDoc(doc(as('outU'), 'qc_orders', 'o2'))));

// ── القسم ب: منع تصعيد الصلاحيات الذاتي ──
await chk('insp self-promote to owner DENIED', assertFails(updateDoc(doc(insp, 'qc_members', 'inspU'), { role: 'owner' })));
await chk('insp self-grant perms DENIED', assertFails(updateDoc(doc(insp, 'qc_members', 'inspU'), { perms: { _v: 2, orders: 3 } })));
await chk('insp self name change OK', assertSucceeds(updateDoc(doc(insp, 'qc_members', 'inspU'), { name: 'newname' })));
await chk('owner sets insp perms OK', assertSucceeds(updateDoc(doc(owner, 'qc_members', 'inspU'), { perms: { _v: 2, fact: 1, orders: 1, insp: 1, dash: 1, tools: 1, marker: 1, ref: 1 } })));
await chk('self-create inspector no perms OK', assertSucceeds(setDoc(doc(as('newU'), 'qc_members', 'newU'), { wsId: WS, role: 'inspector', name: 'New' })));
await chk('self-create as owner DENIED', assertFails(setDoc(doc(as('newU2'), 'qc_members', 'newU2'), { wsId: WS, role: 'owner', name: 'H' })));
await chk('self-create with perms DENIED', assertFails(setDoc(doc(as('newU3'), 'qc_members', 'newU3'), { wsId: WS, role: 'inspector', perms: { _v: 2, orders: 3 }, name: 'H' })));
await chk('restricted self-delete DENIED (no reset loophole)', assertFails(deleteDoc(doc(restrict, 'qc_members', 'rstU'))));

// ── القسم ج: مكتبة التوليفات (comboLib) لمحرّري الريشو ──
// (نستخدم refEd صاحب marker=2 لأنه لم تُعدَّل صلاحياته في القسم ب)
await chk('marker-editor writes comboLib only', assertSucceeds(updateDoc(doc(refEd, 'qc_workspaces', WS), { comboLib: { 'ثوب': [{ sig: 'M2', w: '148', actLenM: 5, sizes: [] }] } })));
await chk('marker-editor writes sizeLists DENIED', assertFails(updateDoc(doc(refEd, 'qc_workspaces', WS), { sizeLists: [{ name: 'hack' }] })));
await chk('marker-editor changes ownerUid DENIED', assertFails(updateDoc(doc(refEd, 'qc_workspaces', WS), { ownerUid: 'refEdU' })));
await chk('marker-editor comboLib+extra field DENIED', assertFails(updateDoc(doc(refEd, 'qc_workspaces', WS), { comboLib: {}, code: 'ZZZZ' })));
await chk('marker-viewer writes comboLib DENIED', assertFails(updateDoc(doc(refView, 'qc_workspaces', WS), { comboLib: { x: 1 } })));
await chk('owner updates sizeLists OK', assertSucceeds(updateDoc(doc(owner, 'qc_workspaces', WS), { sizeLists: [{ name: 'ok' }] })));

// ── القسم د: إعدادات المرجع (seqcfg/chkcfg/defects) ──
await chk('ref-editor writes seqcfg', assertSucceeds(setDoc(doc(refEd, 'qc_seqcfg', WS), { list: [{ op: 'x' }] })));
await chk('ref-editor writes chkcfg', assertSucceeds(setDoc(doc(refEd, 'qc_chkcfg', WS), { lists: [{ title: 'a', items: [] }] })));
await chk('ref-editor creates defect', assertSucceeds(setDoc(doc(refEd, 'qc_defects', 'd2'), { wsId: WS, name: 'new' })));
await chk('ref-viewer writes seqcfg DENIED', assertFails(setDoc(doc(refView, 'qc_seqcfg', WS), { list: [{ op: 'h' }] })));
await chk('ref-viewer writes chkcfg DENIED', assertFails(setDoc(doc(refView, 'qc_chkcfg', WS), { lists: [{ title: 'h' }] })));
await chk('ref-viewer creates defect DENIED', assertFails(setDoc(doc(refView, 'qc_defects', 'd3'), { wsId: WS, name: 'h' })));

console.log(`\nRules tests: ${pass} passed, ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);
