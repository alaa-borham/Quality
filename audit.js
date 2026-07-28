#!/usr/bin/env node
/*
 * audit.js — تدقيق ثابت لنظام متابعة الجودة (index.html) بلا أي اعتمادات خارجية.
 * الاستخدام:  node audit.js
 * يفحص: صياغة JavaScript، مفاتيح الترجمة (مفقودة/مكرّرة/تطابق ع-إ)، والمعالِجات غير المعرّفة.
 * يعيد رمز خروج 1 عند وجود أي خطأ (صالح لبوابة ما قبل الدفع)، و0 إن كان نظيفاً.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const FILE = process.argv[2] || path.join(__dirname, 'index.html');
const html = fs.readFileSync(FILE, 'utf8');
const problems = [];
const warn = [];

/* 1) صياغة كل كتل <script> */
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
scripts.forEach((s, i) => {
  try { new Function(s[1]); } catch (e) { problems.push(`صياغة: كتلة script رقم ${i}: ${e.message}`); }
});

/* أداة: إزالة محتوى النصوص للحصول على الهيكل فقط (آمن ضد الفواصل/النقطتين داخل القيم) */
function stripStrings(block) {
  let out = '', str = false, q = '', esc = false;
  for (let i = 0; i < block.length; i++) {
    const c = block[i];
    if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === q) str = false; continue; }
    if (c === "'" || c === '"' || c === '`') { str = true; q = c; continue; }
    out += c;
  }
  return out;
}
/* استخراج مفاتيح كائن الترجمة (word: بعد { أو ,) */
function keysOf(block) {
  return [...stripStrings(block).matchAll(/[{,]\s*([a-zA-Z_$][\w$]*)\s*:/g)]
    .map(m => m[1]).filter(k => k !== 'ar' && k !== 'en');
}

/* 2) عزل كتلتي L.ar و L.en بالأسطر */
const lines = html.split('\n');
let arStart = -1, enLine = -1, enEnd = -1;
for (let i = 0; i < lines.length; i++) {
  if (arStart < 0 && lines[i].includes('const L={ar:{')) arStart = i;
  if (arStart >= 0 && enLine < 0 && lines[i].trim().startsWith('},en:{')) enLine = i;
  if (enLine >= 0 && enEnd < 0 && i > enLine && lines[i].trim() === '}};') enEnd = i;
}
if (arStart < 0 || enLine < 0 || enEnd < 0) {
  problems.push('تعذّر تحديد كائن الترجمة L (تغيّر هيكله؟)');
}
const arKeys = arStart >= 0 ? keysOf(lines.slice(arStart, enLine + 1).join('\n')) : [];
const enKeys = enLine >= 0 ? keysOf(lines.slice(enLine, enEnd + 1).join('\n')) : [];
const arSet = new Set(arKeys), enSet = new Set(enKeys);

function dupsOf(keys) { const seen = {}, d = new Set(); keys.forEach(k => { if (seen[k]) d.add(k); seen[k] = 1; }); return [...d]; }
const arDup = dupsOf(arKeys), enDup = dupsOf(enKeys);
if (arDup.length) problems.push('مفاتيح مكرّرة في L.ar: ' + arDup.join(', '));
if (enDup.length) problems.push('مفاتيح مكرّرة في L.en: ' + enDup.join(', '));

/* تطابق ع/إ */
const arOnly = arKeys.filter(k => !enSet.has(k));
const enOnly = enKeys.filter(k => !arSet.has(k));
if (arOnly.length) warn.push('مفاتيح في L.ar غير موجودة في L.en (سترجع للعربية): ' + arOnly.slice(0, 20).join(', ') + (arOnly.length > 20 ? ' …' : ''));
if (enOnly.length) problems.push('مفاتيح في L.en غير موجودة في L.ar: ' + enOnly.join(', '));

/* 3) المفاتيح المستعملة (data-i18n / t() / tf()) موجودة في L.ar (الاحتياطي) */
const usedKeys = new Set([
  ...[...html.matchAll(/data-i18n="([^"]+)"/g)].map(m => m[1]),
  ...[...html.matchAll(/\bt\('([^']+)'\)/g)].map(m => m[1]),
  ...[...html.matchAll(/\btf\('([^']+)'/g)].map(m => m[1]),
]);
const missing = [...usedKeys].filter(k => !arSet.has(k));
if (missing.length) problems.push('مفاتيح ترجمة مستعملة لكنها مفقودة (ستظهر كنصّ خام): ' + missing.join(', '));

/* 4) معالِجات الأحداث المشار إليها في on*="fn(" يجب أن تكون معرّفة */
const KW = new Set(['if', 'for', 'while', 'return', 'typeof', 'switch', 'function', 'var', 'let', 'const',
  'new', 'do', 'else', 'try', 'catch', 'throw', 'void', 'delete', 'in', 'of', 'instanceof', 'this',
  'true', 'false', 'null', 'undefined', 'event', 'await', 'yield', 'super']);
const handlers = [...new Set([...html.matchAll(/on[a-z]+="([a-zA-Z_$][\w$]*)\(/g)].map(m => m[1]))].filter(h => !KW.has(h));
const defined = new Set();
[...html.matchAll(/function\s+([a-zA-Z_$][\w$]*)\s*\(/g)].forEach(m => defined.add(m[1]));
[...html.matchAll(/(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=/g)].forEach(m => defined.add(m[1]));
[...html.matchAll(/\bwindow\.([a-zA-Z_$][\w$]*)\s*=/g)].forEach(m => defined.add(m[1]));
const undef = handlers.filter(h => !defined.has(h));
if (undef.length) problems.push('معالِجات أحداث غير معرّفة: ' + undef.join(', '));

/* التقرير */
console.log(`تدقيق ${path.basename(FILE)} — كتل script: ${scripts.length} · مفاتيح L.ar: ${arKeys.length} · L.en: ${enKeys.length} · معالِجات: ${handlers.length}`);
warn.forEach(w => console.log('تنبيه: ' + w));
if (problems.length) {
  console.log('\n❌ فشل التدقيق (' + problems.length + '):');
  problems.forEach(p => console.log('  - ' + p));
  process.exit(1);
}
console.log('✅ التدقيق نظيف — لا أخطاء.');
process.exit(0);
