// הבאג שהוליד את הקובץ: שם קובץ בעברית הפיל את ההעלאה ב-Supabase
// Storage עם "Invalid key". הבדיקות כאן שומרות על שתי התכונות שמנעו
// את החזרה שלו — המפתח תמיד ASCII, והשם שהמשתמש רואה נשאר שלו.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { displayName, storageName } from './storage-key.ts';

const ASCII_ONLY = /^[A-Za-z0-9._-]+$/;

test('שם בעברית הופך למפתח ASCII תקין', () => {
  const key = storageName('אישור בעלות חשבון.pdf');
  assert.match(key, ASCII_ONLY);
  assert.ok(key.endsWith('.pdf'), 'הסיומת נשמרת');
});

test('שם שכולו לא-ASCII עדיין מניב מפתח לא ריק', () => {
  assert.equal(storageName('תלוש.PDF'), 'file.pdf');
  assert.equal(storageName('קובץ'), 'file');
});

test('שם לטיני נשאר קריא', () => {
  assert.equal(storageName('Bank_Statement-2026.pdf'), 'Bank_Statement-2026.pdf');
});

test('סיומת חשודה לא נגררת למפתח', () => {
  const key = storageName('doc.תלוש');
  assert.match(key, ASCII_ONLY);
  assert.ok(!key.includes('.ת'));
});

test('שם התצוגה נשאר המקורי', () => {
  assert.equal(displayName('אישור בעלות חשבון.pdf'), 'אישור בעלות חשבון.pdf');
  assert.equal(displayName('   '), 'קובץ');
});
