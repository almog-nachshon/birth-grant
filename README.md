# סדר בבלגן — מימוש זכויות הורות בישראל

**חי בכתובת: https://birth-grant.vercel.app**

אתר ציבורי שעוזר לזוגות בישראל לממש את מלוא זכויותיהם אחרי לידה: דמי לידה, מענק,
ימי היעדרות, החזרי מלונית וזכויות נכות — מותאם לשכירים, עצמאים, ולבעלי נכות מוכרת
בביטוח לאומי או באגף השיקום.

## עקרונות שמנחים את הקוד

1. **המנוע מחשב, ה-AI מסביר.** אף סכום לא מגיע ממודל שפה. `lib/engine/` מחשב, ומודל
   ה-AI מקבל את התוצאה כעובדות ואסור לו לייצר מספר משלו. זה נאכף בהנחיה ובארכיטקטורה.
2. **מה שלא ידוע נאמר בפה מלא.** ערך שלא ניתן לחשב מקבל `null` ורמת ודאות מפורשת,
   ולא מספר שנראה בטוח. כלל חוקי שאין לו מקור מוסמך הופך למשימת בירור.
3. **פרסומות רק בדפים הציבוריים.** שום סקריפט מעקב לא רץ על דף שמכיל שומת מס.
4. **סכומים חיים בטבלה, לא בקוד.** עדכון שנתי = עריכת `content/rates.json`.

## מבנה

```
content/         קטלוג הזכויות (catalog.json) + טבלת שיעורים (rates.json) + ולידציה
lib/engine/      מנוע חישוב דטרמיניסטי — תאריכים, זכאויות, גזירת משימות. 33 בדיקות.
lib/ai/          שכבת Claude — עוזר בצ'אט וחילוץ שדות ממסמכים
lib/supabase/    לקוחות שרת ודפדפן, ושומר הגדרות
supabase/        מיגרציות SQL: סכמה, RLS, אחסון
app/             Next.js App Router — עמוד בית, מחשבון, התחברות, שאלון, תיק
scripts/         seed לקטלוג, אבחון מפתחות
docs/            מאגר הידע והמחקר, כולל רמות ודאות ומקורות
private/         הגרסה האישית המקורית. לא נכנס ל-git.
```

## הפעלה מקומית

```bash
npm install
cp .env.example .env.local     # ואז למלא — ראה "הקמה" למטה
npm run check                  # ולידציית תוכן + 33 בדיקות
npm run dev                    # http://localhost:3000
```

עמוד הבית והמחשבון עובדים מיד, בלי שום מפתח. ההתחברות תציג שהיא לא מוגדרת.

## הקמה — מה שרק אתה יכול לעשות

### 1. פרויקט Supabase

ב-[supabase.com](https://supabase.com) → New project. **אזור פרנקפורט** (`eu-central-1`) —
המידע כאן רגיש ותחת חוק הגנת הפרטיות הישראלי.

ב-**Settings → API Keys** נמצאים שלושה ערכים שנכנסים ל-`.env.local`:

| בדשבורד | משתנה | מי רואה |
|---|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` | כולם |
| anon / publishable | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | כולם — RLS מגן |
| service_role / secret | `SUPABASE_SERVICE_ROLE_KEY` | **השרת בלבד** |

`service_role` עוקף את כל ה-RLS. מי שמשיג אותו קורא את כל המסמכים של כל המשתמשים.

### 2. מיגרציות

ב-**SQL Editor**, שלוש הרצות נפרדות **בסדר הזה** — 002 מסתמך על 001, ו-003 על 002:

1. `supabase/migrations/001_schema.sql`
2. `supabase/migrations/002_rls.sql`
3. `supabase/migrations/003_storage.sql`

### 3. התחברות Google

אפשר לדחות — כניסה במייל עובדת בלעדיו.

1. Google Cloud Console → OAuth consent screen → External
2. Credentials → OAuth client ID → Web application
3. Authorized redirect URI: `https://<PROJECT-REF>.supabase.co/auth/v1/callback`
4. Supabase → Authentication → Providers → Google: להדביק Client ID ו-Secret
5. Authentication → URL Configuration: להוסיף `http://localhost:3000/**`

### 4. Claude

מפתח מ-[console.anthropic.com](https://console.anthropic.com) → `ANTHROPIC_API_KEY`.
שרת בלבד. בלעדיו הכול עובד חוץ מהעוזר.

### 5. אימות וטעינת תוכן

```bash
npm run check:env            # בודק פורמט, מתחבר בפועל, מוודא שהמיגרציות רצו
npm run seed -- --publish    # טוען את הקטלוג ומפרסם אותו
```

בלי `--publish` הקטלוג נשאר טיוטה, ה-RLS לא יחשוף אותו, והאתר יעלה עם אפס משימות
ובלי שום שגיאה. זו נקודת המעידה הסבירה ביותר בתהליך.

**כל שינוי ב-`.env.local` דורש הפעלה מחדש של שרת הפיתוח.**

## פריסה ל-Vercel

הפריסה מ-GitHub: כל push ל-`main` בונה ומעלה אוטומטית.

1. [vercel.com](https://vercel.com) → התחברות עם GitHub → **Add New → Project**
2. לבחור את `birth-grant`. Vercel מזהה Next.js לבד — אין מה לשנות בהגדרות הבנייה.
3. **Environment Variables** — אותם ערכים מ-`.env.local`. את `NEXT_PUBLIC_SITE_URL`
   להגדיר לכתובת שוורסל נותנת.
4. **Deploy**.

הבנייה עוברת גם בלי אף משתנה סביבה, כך שהפריסה הראשונה לא תיכשל — הדפים הציבוריים
יעלו וההתחברות תציג שהיא לא מוגדרת. אפשר לפרוס קודם ולמלא מפתחות אחר כך.

### אחרי שיש כתובת

שני דברים חייבים להתעדכן, אחרת ההתחברות תישבר בייצור בלי שגיאה ברורה:

- **Google Cloud → Credentials**: להוסיף `https://<הכתובת>/auth/callback` ל-redirect URIs
- **Supabase → Authentication → URL Configuration**: להוסיף `https://<הכתובת>/**`
  ל-Redirect URLs, ולעדכן את Site URL

## פקודות

| פקודה | מה עושה |
|---|---|
| `npm run dev` | שרת פיתוח |
| `npm run build` | בנייה לייצור |
| `npm test` | 33 בדיקות מנוע החישוב וגזירת המשימות |
| `npm run validate:content` | ולידציית קטלוג — מפתחות, כללי תאריך, הצבות `{{rate}}` |
| `npm run check` | ולידציה + בדיקות |
| `npm run check:env` | אבחון מפתחות — פורמט, חיבור, מיגרציות, seed |
| `npm run seed -- --publish` | טעינת הקטלוג לבסיס הנתונים ופרסומו |

## סטטוס

**עובד**: מודל התוכן והקטלוג, מנוע החישוב, גזירת משימות לפי פרופיל, התחברות
(Google ומייל), שאלון, מסך התיק, העלאת מסמכים, מחשבון ציבורי, עמוד בית, שכבת AI.

**נותר**: הזמנת בן/בת זוג בקישור (ה-RPC `redeem_invite` קיים, חסר UI),
תזכורות במייל, ועורך קטלוג לניהול התוכן.

**לפני עלייה לאוויר**: דפי [privacy](app/privacy/page.tsx) ו-[terms](app/terms/page.tsx)
הם טיוטה שמתארת נכונה את מה שהמערכת עושה, אבל דורשת בדיקה משפטית — במיוחד לאור
תיקון 13 לחוק הגנת הפרטיות והמידע הרגיש שהאתר יאגור.

## הסתייגות

כלי מידע וארגון. לא ייעוץ משפטי, פיננסי או מס. הגורם הקובע הוא המוסד לביטוח לאומי,
ולעניין נכי צה״ל — אגף השיקום במשרד הביטחון. פירוט רמות הוודאות של כל ממצא:
[docs/research-disability.md](docs/research-disability.md).
