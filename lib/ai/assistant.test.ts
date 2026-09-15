// בלוק העובדות הוא מנגנון הריסון של המודל. הבדיקות כאן שומרות על
// התכונה שבגללה הוא קיים: מה שלא נמצא בו — אסור לצטט.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { AssistantContext } from './assistant.ts';

// ה-SDK נבנה ברמת המודול ודורש מפתח. הבדיקה לא פונה לרשת.
process.env.ANTHROPIC_API_KEY ??= 'test-key-not-used';
const { buildFactsBlock } = await import('./assistant.ts');

const ctx = (over: Partial<AssistantContext> = {}): AssistantContext => ({
  entitlements: { lines: [], total: 0, missingInputs: [], disclaimer: '' },
  schedule: [],
  openTasks: [],
  unresolvedTopics: [],
  ...over,
});

test('קישורי המשימה נכנסים לבלוק העובדות עם הכתובת המלאה', () => {
  const block = buildFactsBlock(
    ctx({
      openTasks: [
        {
          title: 'מילוי טופס 355',
          dueAt: '2026-07-01',
          critical: true,
          links: [
            { label: 'מילוי טופס 355 מקוון', url: 'https://govforms.gov.il/mw/forms/t355@btl.gov.il', kind: 'online' },
          ],
        },
      ],
    }),
  );
  assert.match(block, /מילוי טופס 355/);
  assert.match(block, /https:\/\/govforms\.gov\.il\/mw\/forms\/t355@btl\.gov\.il/);
  assert.match(block, /מילוי מקוון/, 'סוג הקישור מסומן כדי שהמודל ידע מה להבטיח');
});

test('הבלוק אוסר במפורש על כתובת שאינה מופיעה בו', () => {
  const block = buildFactsBlock(ctx());
  assert.match(block, /רק כתובת שמופיעה בבלוק למעלה/);
});

test('משימה בלי קישורים לא מייצרת שורת קישור ריקה', () => {
  const block = buildFactsBlock(
    ctx({ openTasks: [{ title: 'לעדכן תאריך לידה', dueAt: null, critical: false, links: [] }] }),
  );
  assert.match(block, /- לעדכן תאריך לידה\n/);
  assert.ok(!block.includes('·'), 'אין תבליט קישור בלי קישור');
});
