// העוזר/ת בצ'אט. מקבל/ת את פלט מנוע החישוב כעובדות מוזרקות ומסביר/ה אותו.
//
// למה הזרקה ולא כלי (tool) שהמודל קורא לו: אם המודל בוחר מתי לחשב, הוא גם
// בוחר מתי לא — ואז הוא עונה מהזיכרון. הזרקה מראש מבטיחה שהמספרים תמיד שם.

import { anthropic, BASE_SYSTEM, MODEL } from './client.ts';
import type { EntitlementResult, ScheduleEntry, TaskLink } from '../engine/types.ts';

export interface AssistantContext {
  entitlements: EntitlementResult;
  schedule: ScheduleEntry[];
  openTasks: { title: string; dueAt: string | null; critical: boolean; links: TaskLink[] }[];
  /** נושאים שהמחקר סימן כלא-מאומתים — המודל חייב להצהיר עליהם */
  unresolvedTopics: string[];
}

const ils = (n: number) => n.toLocaleString('he-IL', { maximumFractionDigits: 0 });

const LINK_KIND: Record<TaskLink['kind'], string> = {
  online: 'מילוי מקוון',
  form: 'טופס PDF',
  info: 'דף הסבר',
};

/** בונה את בלוק העובדות. זה המקור היחיד למספרים שהמודל רשאי לצטט. */
export function buildFactsBlock(ctx: AssistantContext): string {
  const money = ctx.entitlements.lines
    .map((l) => {
      const amount = l.amount == null ? 'לא חושב' : `${ils(l.amount)} ₪`;
      const notes = l.notes?.length ? `\n    הערות: ${l.notes.join(' | ')}` : '';
      return `  - ${l.label}: ${amount} [ודאות: ${l.confidence}]\n    חישוב: ${l.formula}${notes}`;
    })
    .join('\n');

  const dates = ctx.schedule.map((e) => `  - ${e.label}: ${e.date}`).join('\n');

  // הקישורים מגיעים מהקטלוג דרך שורת המשימה — לא מהמודל. זו רשימת
  // ההיתר היחידה שלו, ולכן היא נכתבת כאן במפורש ולא נרמזת.
  const tasks = ctx.openTasks
    .map((t) => {
      const head = `  - ${t.title}${t.dueAt ? ` (עד ${t.dueAt})` : ''}${t.critical ? ' [קריטי]' : ''}`;
      const links = t.links
        .map((l) => `\n      · ${LINK_KIND[l.kind]} — ${l.label}: ${l.url}`)
        .join('');
      return head + links;
    })
    .join('\n');

  return `<facts>
# סכומים מחושבים
${money || '  (טרם חושבו)'}

סך הכל שחושב: ${ils(ctx.entitlements.total)} ₪ (ברוטו)
נתונים חסרים לחישוב מלא: ${ctx.entitlements.missingInputs.join(', ') || 'אין'}

# לוח זמנים
${dates || '  (טרם נקבע)'}

# משימות פתוחות
${tasks || '  אין'}

# נושאים שטרם אומתו — חובה להצהיר עליהם אם עולים בשיחה
${ctx.unresolvedTopics.map((t) => `  - ${t}`).join('\n') || '  אין'}
</facts>

כל מספר בתשובתך חייב להופיע בבלוק למעלה. אין מספר מתאים — אמור/י שהוא לא חושב ומה חסר.
כך גם לקישורים: מותר לצטט רק כתובת שמופיעה בבלוק למעלה, מילה במילה. אין כתובת מתאימה — הפנה/י לביטוח לאומי (*6050) או לאתר הרשות הרלוונטית בלי להמציא כתובת.`;
}

export function streamAssistantReply(
  ctx: AssistantContext,
  history: { role: 'user' | 'assistant'; content: string }[],
) {
  return anthropic.messages.stream({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    system: [
      // תחילית יציבה — נשמרת ב-cache בין הודעות
      { type: 'text', text: BASE_SYSTEM, cache_control: { type: 'ephemeral' } },
      // העובדות משתנות עם התיק ולכן אחרי נקודת ה-cache
      { type: 'text', text: buildFactsBlock(ctx) },
    ],
    messages: history,
  });
}
