// Supabase Storage דוחה מפתח שיש בו תו שאינו ASCII — ההעלאה נכשלת עם
// "Invalid key", ושם קובץ בעברית מפיל אותה. לכן המפתח נעשה ASCII, והשם
// המקורי נשמר בנפרד בעמודת filename: מה שהמשתמש רואה לא חייב להיות
// מה שה-Storage מוכן לקבל.
//
// אחד ויחיד בשני מסכי ההעלאה — טאב המסמכים ורשימת המשימות — כי שתי
// גרסאות של אותו ניקוי הן שתי הזדמנויות שאחת מהן תישאר שבורה.

/** שם קובץ בטוח למפתח אחסון. תמיד לא ריק, תמיד ASCII. */
export function storageName(original: string): string {
  const dot = original.lastIndexOf('.');
  const rawExt = dot > 0 ? original.slice(dot + 1) : '';
  const ext = /^[A-Za-z0-9]{1,8}$/.test(rawExt) ? `.${rawExt.toLowerCase()}` : '';

  const base = (dot > 0 ? original.slice(0, dot) : original)
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
    .slice(0, 60);

  return (base || 'file') + ext;
}

/** השם שמוצג למשתמש — המקורי, חתוך לאורך העמודה. */
export function displayName(original: string): string {
  return original.trim().slice(-200) || 'קובץ';
}
