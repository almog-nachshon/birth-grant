// חילוץ שדות ממסמך שהמשתמש העלה (שומת מס, תלוש, אישור מעסיק, חשבונית מלונית).
// המודל קורא את המסמך ומחזיר שדות מובנים — הוא לא מסיק מהם זכאות.
// הערכים חוזרים לטופס כהצעה שהמשתמש מאשר, לא נשמרים ישירות.

import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { anthropic, MODEL } from './client.ts';

export const ExtractedFields = z.object({
  document_type: z
    .enum(['tax_assessment', 'payslip', 'employer_letter', 'hotel_invoice', 'bl_letter', 'other'])
    .describe('סוג המסמך שזוהה'),
  /** null כשהשדה לא מופיע במסמך — לא לנחש */
  annual_income: z.number().nullable().describe('הכנסה שנתית בשקלים, אם מופיעה'),
  monthly_gross: z.number().nullable().describe('שכר ברוטו חודשי בשקלים, אם מופיע'),
  tax_year: z.number().nullable().describe('שנת המס'),
  employer_name: z.string().nullable(),
  issue_date: z.string().nullable().describe('תאריך הנפקה בפורמט YYYY-MM-DD'),
  amount: z.number().nullable().describe('סכום כולל, לחשבוניות'),
  /** מה שהמודל לא הצליח לקרוא — מוצג למשתמש כדי שישלים ידנית */
  unreadable_fields: z.array(z.string()),
  confidence_note: z.string().describe('משפט אחד על איכות הקריאה ומה כדאי לאמת ידנית'),
});

export type ExtractedFields = z.infer<typeof ExtractedFields>;

const SYSTEM = `את/ה מחלץ/ת שדות ממסמכים ישראליים רשמיים.

חוקים:
- החזר/י אך ורק ערכים שמופיעים **במפורש** במסמך. שדה שלא מופיע = null. אל תסיק/י, אל תחשב/י, אל תשלים/י מהקשר.
- אם מספר מטושטש או חלקי — null, והשדה נכנס ל-unreadable_fields.
- סכומים כמספר נקי בלי סימן מטבע ובלי פסיקים.
- תאריכים ב-YYYY-MM-DD בלבד.`;

export async function extractDocumentFields(
  file: { base64: string; mime: string },
): Promise<ExtractedFields | null> {
  const isPdf = file.mime === 'application/pdf';

  const response = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          isPdf
            ? {
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: file.base64 },
              }
            : {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: file.mime as 'image/jpeg' | 'image/png' | 'image/webp',
                  data: file.base64,
                },
              },
          { type: 'text', text: 'חלץ/י את השדות מהמסמך הזה.' },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(ExtractedFields) },
  });

  return response.parsed_output ?? null;
}
