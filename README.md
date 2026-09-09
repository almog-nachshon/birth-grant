# סדר בבלגן — מימוש זכויות הורות בישראל

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
lib/engine/      מנוע חישוב דטרמיניסטי — תאריכים, זכאויות, סכומים. 20 בדיקות.
lib/ai/          שכבת Claude — עוזר בצ'אט וחילוץ שדות ממסמכים
supabase/        מיגרציות SQL: סכמה, RLS, אחסון
app/             Next.js App Router
docs/            מאגר הידע והמחקר, כולל רמות ודאות ומקורות
private/         הגרסה האישית המקורית. לא נכנס ל-git.
```

## הפעלה

```bash
npm install
cp .env.example .env.local     # ואז למלא
npm run check                  # ולידציית תוכן + בדיקות מנוע
npm run dev
```

## הקמה — מה שרק אתה יכול לעשות

### 1. פרויקט Supabase
- ליצור פרויקט ב-[supabase.com](https://supabase.com), **אזור פרנקפורט** (`eu-central-1`) —
  המידע כאן רגיש ותחת חוק הגנת הפרטיות הישראלי.
- להריץ את המיגרציות לפי הסדר, ב-SQL Editor:
  `supabase/migrations/001_schema.sql` → `002_rls.sql` → `003_storage.sql`
- להעתיק ל-`.env.local`: `Project URL` ו-`anon key`. את `service_role` **רק** כמשתנה שרת.

### 2. התחברות Google
- ב-Google Cloud Console: OAuth 2.0 Client ID (סוג Web application).
- Authorized redirect URI: `https://<PROJECT-REF>.supabase.co/auth/v1/callback`
- ב-Supabase → Authentication → Providers → Google: להדביק Client ID ו-Secret.
- ב-Authentication → URL Configuration: להוסיף את `NEXT_PUBLIC_SITE_URL` ל-Redirect URLs.

### 3. Claude
- מפתח מ-[console.anthropic.com](https://console.anthropic.com) → `ANTHROPIC_API_KEY`.
- שרת בלבד. אף פעם לא בקוד לקוח.

### 4. Seed לקטלוג
לטעון את `content/catalog.json` ו-`content/rates.json` לטבלאות, ולסמן `published_at`
בגרסת הקטלוג — בלי זה ה-RLS לא יחשוף אותה לקריאה.

## פקודות

| פקודה | מה עושה |
|---|---|
| `npm run dev` | שרת פיתוח |
| `npm run build` | בנייה לייצור |
| `npm test` | בדיקות מנוע החישוב |
| `npm run validate:content` | ולידציית קטלוג — מפתחות, תאריכים, והצבות `{{rate}}` |
| `npm run check` | שניהם |

## סטטוס

**מוכן**: מודל התוכן, מנוע החישוב + בדיקות, סכמת בסיס הנתונים עם RLS ואחסון,
שכבת ה-AI, מחקר זכויות הנכות, עמוד הבית.

**נותר**: זרימת ההתחברות בפועל (`/login`, callback, middleware), שאלון הפרופיל,
מסך התיק, העלאת מסמכים ב-UI, ה-seed לבסיס הנתונים, ותזכורות במייל.

## הסתייגות

כלי מידע וארגון. לא ייעוץ משפטי, פיננסי או מס. הגורם הקובע הוא המוסד לביטוח לאומי,
ולעניין נכי צה״ל — אגף השיקום במשרד הביטחון. פירוט רמות הוודאות של כל ממצא:
[docs/research-disability.md](docs/research-disability.md).
