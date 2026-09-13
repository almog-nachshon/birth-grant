// סנכרון משימות התיק מול הקטלוג, אחרי כל שינוי בפרופיל.
//
// המשימות מאוחסנות (materialized) ולא מחושבות בכל טעינה, כדי שסטטוס והערה
// ישרדו. לכן שינוי בפרופיל לא יכול פשוט למחוק ולבנות מחדש:
//   · משימה חדשה שהפכה רלוונטית — נוספת
//   · משימה קיימת — התאריך מתעדכן, הסטטוס וההערה נשמרים
//   · משימה שכבר לא רלוונטית — נמחקת רק אם איש לא נגע בה

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveTasks, type CatalogTask } from '@/lib/engine/resolve-tasks';
import { ratesAt, interpolate } from '@/lib/rates';
import catalog from '@/content/catalog.json';
import type { CaseProfile, ParentRole } from '@/lib/engine/types';

export interface SyncResult {
  added: number;
  updated: number;
  removed: number;
}

/** שם להצגה לכל הורה, לשיוך משימות שמופיעות לשניהם. */
function labeller(profile: CaseProfile, names: Partial<Record<ParentRole, string | null>>) {
  return (role: ParentRole) =>
    names[role]?.trim() || (role === 'birthing_parent' ? 'היולדת' : 'בן/בת הזוג');
}

export async function syncCaseTasks(
  supabase: SupabaseClient,
  caseId: string,
  profile: CaseProfile,
  names: Partial<Record<ParentRole, string | null>> = {},
): Promise<SyncResult> {
  const rates = ratesAt();
  const resolved = resolveTasks(catalog.tasks as CatalogTask[], profile, rates);
  const labelFor = labeller(profile, names);

  const desired = new Map(
    resolved.map((t, i) => {
      const key = t.assignedRole && t.role === 'any' ? `${t.key}:${t.assignedRole}` : t.key;
      return [
        key,
        {
          case_id: caseId,
          catalog_key: key,
          title:
            t.role === 'any' && t.assignedRole ? `${t.title} — ${labelFor(t.assignedRole)}` : t.title,
          body: t.body ? interpolate(t.body, rates) : null,
          requires_doc: t.requires_doc ?? false,
          due_at: t.dueAt,
          due_kind: t.date_rule?.kind ?? null,
          sort: i,
        },
      ];
    }),
  );

  const { data: existingRows } = await supabase
    .from('case_tasks')
    .select('id, catalog_key, status, note, is_custom, title, body, requires_doc, due_at, due_kind, sort')
    .eq('case_id', caseId);

  const existing = existingRows ?? [];
  const existingKeys = new Set(existing.map((r) => r.catalog_key).filter(Boolean) as string[]);

  // ── חדשות ──
  const toInsert = [...desired.entries()]
    .filter(([key]) => !existingKeys.has(key))
    .map(([, row]) => row);

  if (toInsert.length) {
    const { error } = await supabase.from('case_tasks').insert(toInsert);
    if (error) throw new Error(error.message);
  }

  // ── קיימות: תאריך וכותרת בלבד. סטטוס והערה שייכים למשתמש ──
  // שמירה אוטומטית רצה על כל הפסקת הקלדה, ולכן שורה שלא השתנתה
  // לא נכתבת מחדש. ברוב השמירות הלולאה הזו לא שולחת ולו שאילתה אחת.
  let updated = 0;
  for (const row of existing) {
    if (!row.catalog_key) continue;
    const want = desired.get(row.catalog_key);
    if (!want) continue;

    const same =
      row.title === want.title &&
      row.body === want.body &&
      row.requires_doc === want.requires_doc &&
      row.due_at === want.due_at &&
      row.due_kind === want.due_kind &&
      row.sort === want.sort;
    if (same) continue;

    const { error } = await supabase
      .from('case_tasks')
      .update({
        title: want.title,
        body: want.body,
        requires_doc: want.requires_doc,
        due_at: want.due_at,
        due_kind: want.due_kind,
        sort: want.sort,
      })
      .eq('id', row.id);
    if (!error) updated++;
  }

  // ── כבר לא רלוונטיות: רק אם נקיות לגמרי ──
  const stale = existing.filter(
    (r) =>
      r.catalog_key &&
      !r.is_custom &&
      !desired.has(r.catalog_key) &&
      r.status === 'todo' &&
      !r.note,
  );

  let removed = 0;
  if (stale.length) {
    // משימה עם מסמך מצורף נשארת גם אם הפכה לא רלוונטית — המסמך הוא ראיה
    const { data: withDocs } = await supabase
      .from('case_documents')
      .select('case_task_id')
      .in('case_task_id', stale.map((r) => r.id));

    const protectedIds = new Set((withDocs ?? []).map((d) => d.case_task_id));
    const ids = stale.map((r) => r.id).filter((id) => !protectedIds.has(id));

    if (ids.length) {
      const { error } = await supabase.from('case_tasks').delete().in('id', ids);
      if (!error) removed = ids.length;
    }
  }

  return { added: toInsert.length, updated, removed };
}
