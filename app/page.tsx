import AccountButton from './AccountButton';
import s from './page.module.css';
import { catalogVersion, lastChanged, formatDate } from '@/lib/changelog';

export default function Landing() {
  return (
    <>
      <nav className={s.nav}>
        <div className={s.navInner}>
          <a href="/" className={s.logo}>
            <LogoMark />
            מענקי לידה
          </a>
          <div className={s.navLinks}>
            <a href="#how" className={s.navLink}>איך זה עובד</a>
            <a href="#what" className={s.navLink}>מה מקבלים</a>
            <a href="#privacy" className={s.navLink}>פרטיות</a>
            <AccountButton />
          </div>
        </div>
      </nav>

      <main id="main">
        {/* ── גיבור ── */}
        <section className={s.hero}>
          <div className={s.heroInner}>
            <div>
              <p className="eyebrow">חינם · לזוגות בישראל</p>
              <h1 className={s.heroTitle}>
                כל מה שמגיע לכם אחרי הלידה — <em>בלי לפספס כלום</em>
              </h1>
              <p className={s.heroLede}>
                דמי לידה, מענק, ימי היעדרות, החזרי מלונית, זכויות נכות. עונים על כמה שאלות,
                ומקבלים רשימה מותאמת בדיוק אליכם: מה מגיע, כמה זה שווה, איזה טופס, ועד מתי.
              </p>
              <div className={s.heroCta}>
                <a href="/onboarding" className="btn btn-primary">
                  להתחלת השאלון
                </a>
                <a href="/calculator" className="btn btn-ghost">
                  בדיקה מהירה בלי הרשמה
                </a>
              </div>
              <p className={s.heroNote}>
                שני בני הזוג נכנסים לאותו תיק ורואים את אותה התקדמות.
              </p>
            </div>
            <div className={s.artWrap}>
              <HeroArt />
            </div>
          </div>
        </section>

        {/* ── רצועת מספרים ── */}
        <div className={s.strip}>
          <div className={s.stripInner}>
            <Stat num="15" lbl="שבועות דמי לידה — מכסה משותפת" />
            <Stat num="9" lbl="שבועות שאפשר להעביר לבן/בת הזוג" />
            <Stat num="12" lbl="חודשים להגשת טופס 360, ואז זה נסגר" />
            <Stat num="37" lbl="זכויות ומשימות במאגר" />
          </div>
        </div>

        {/* ── איך זה עובד ── */}
        <section className={s.section} id="how">
          <div className="wrap">
            <div className={s.sectionHead}>
              <p className="eyebrow">שלושה שלבים</p>
              <h2 className={s.sectionTitle}>מרשימה כללית לתוכנית אישית</h2>
              <p className="lede">
                רוב המידע ברשת נכון לכולם ולכן לא נכון לאף אחד. כאן הכול נגזר מהמצב הספציפי שלכם.
              </p>
            </div>
            <div className={s.steps}>
              <Step
                n="1"
                title="מספרים לנו מי אתם"
                body="שכיר או עצמאי, מי יולדת ומי מחליף, תאריך משוער, קופת חולים, ואם יש נכות מוכרת. שאלון קצר, בלי תעודות זהות."
              />
              <Step
                n="2"
                title="מקבלים רשימה מותאמת"
                body="רק הזכויות שרלוונטיות לכם, עם תאריך יעד לכל אחת — מחושב מתאריך הלידה. כולל אזהרות על מה שקל לפספס ועולה כסף."
              />
              <Step
                n="3"
                title="מסמנים ומעלים מסמכים"
                body="כל טופס, אישור וחשבונית נשמרים בתיק המשותף. כששניכם עובדים על זה, שניכם רואים מה כבר נעשה."
              />
            </div>
          </div>
        </section>

        {/* ── מה מקבלים ── */}
        <section className={`${s.section} ${s.sectionAlt}`} id="what">
          <div className="wrap">
            <div className={s.sectionHead}>
              <p className="eyebrow">מה יש בפנים</p>
              <h2 className={s.sectionTitle}>לא עוד מאמר. כלי עבודה.</h2>
            </div>
            <div className={s.features}>
              <Feature
                icon={<IconCalc />}
                title="חישוב סכומים"
                body="כמה דמי לידה, מענק, ושווי ימי ההיעדרות — עם פירוט שקוף של איך חושב כל מספר, ומה עוד חסר כדי לדייק אותו."
              />
              <Feature
                icon={<IconCalendar />}
                title="תאריכים שזזים לבד"
                body="הכול מחושב מתאריך הלידה. משנים אותו לתאריך בפועל — וכל לוח הזמנים והתזכורות מתעדכנים."
              />
              <Feature
                icon={<IconDoc />}
                title="מסמכים במקום אחד"
                body="שומת מס, אישור מעסיק, חשבונית מלונית. מוצפנים, פרטיים לתיק שלכם, ונגישים כשצריך להגיש."
              />
              <Feature
                icon={<IconUsers />}
                title="תיק לשניים"
                body="מזמינים את בן/בת הזוג בקישור. אותה רשימה, אותה התקדמות, בלי לשלוח צילומי מסך בוואטסאפ."
              />
              <Feature
                icon={<IconShield />}
                title="גם זכויות נכות"
                body="נכות כללית מביטוח לאומי ונכי צה״ל באגף השיקום — כולל זכויות שלא ניתנות אוטומטית ורוב האנשים לא יודעים לבקש."
              />
              <Feature
                icon={<IconSpark />}
                title="עוזר שמסביר"
                body="שואלים בשפה חופשית ומקבלים תשובה על התיק שלכם. המספרים מגיעים ממנוע חישוב, לא מניחוש של מודל."
              />
            </div>
          </div>
        </section>

        {/* ── פרטיות ── */}
        <section className={s.section} id="privacy">
          <div className="wrap">
            <div className={s.trust}>
              <div>
                <p className="eyebrow">פרטיות</p>
                <h2 className={s.sectionTitle}>המידע הזה רגיש. מתייחסים אליו ככה.</h2>
                <p className="lede">
                  שומות מס, אישורי ביטוח לאומי, מסמכים רפואיים. זה לא מידע שסתם מאחסנים —
                  וזו הסיבה שהאתר בנוי כך שגם אנחנו לא נזדקק לו.
                </p>
              </div>
              <ul className={s.trustList}>
                <TrustItem text="המסמכים שלכם פרטיים לתיק ונגישים רק לכם ולבן/בת הזוג — לא לאף משתמש אחר." />
                <TrustItem text="שרתים באיחוד האירופי, הצפנה במנוחה, וקישורי הורדה שפגים תוך דקות." />
                <TrustItem text="אין פרסומות ואין סקריפטים של מעקב בשום דף שמכיל מידע אישי. פרסום מופיע רק בדפים הציבוריים." />
                <TrustItem text="כפתור מחיקה שמוחק באמת — גם את הקבצים עצמם, לא רק את השורה בבסיס הנתונים." />
                <TrustItem text="לא מבקשים תעודת זהות ולא פרטי חשבון בנק. אין סיבה שיהיו לנו." />
              </ul>
            </div>
          </div>
        </section>

        {/* ── שאלות ── */}
        <section className={`${s.section} ${s.sectionAlt}`}>
          <div className="wrap">
            <div className={s.sectionHead}>
              <h2 className={s.sectionTitle}>שאלות שחוזרות</h2>
            </div>
            <div className={s.faq}>
              <Faq
                q="זה באמת חינם?"
                a="כן. האתר ממומן מפרסום בדפים הציבוריים ובמדריכים. הכלי עצמו, מאחורי ההתחברות, נקי מפרסומות — כי לא נכון להריץ סקריפטים של רשתות פרסום על דף שמכיל את שומת המס שלכם."
              />
              <Faq
                q="אני עצמאי/ת. זה מתאים?"
                a="כן, וזו בדיוק הנקודה. הכללים לעצמאים שונים מהותית — החישוב לפי שומה, החובה שאין חוב פתוח, אישור פעילות התחזוקה. ברוב המקומות מסבירים רק את המסלול של שכירים."
              />
              <Faq
                q="אפשר לסמוך על הסכומים?"
                a="הם חישוב, לא הבטחה. כל סכום מוצג עם הנוסחה שהוליד אותו ועם רמת ודאות, ומה שלא ניתן לחשב באמינות מסומן ככזה במקום לקבל מספר שנראה בטוח. הקובע תמיד ביטוח לאומי."
              />
              <Faq
                q="מה אם עוד לא ילדנו?"
                a="עדיף להתחיל לפני. חלק מהמשימות חייבות להיעשות בהריון — אישור פעילות לעצמאית, בקשות מ-HR, בירור מול קופת החולים. הכלי עובד מהתאריך המשוער ומתעדכן כשמזינים את התאריך בפועל."
              />
              <Faq
                q="יש לי נכות מוכרת. זה רלוונטי?"
                a="מאוד. יש זכויות שלא ניתנות אוטומטית ודורשות בקשה יזומה — למשל תגמול באגף השיקום ל-3 חודשי ההריון האחרונים ו-6 חודשים אחרי הלידה. יש גם שאלות שאין עליהן תשובה רשמית פומבית, ובמקום לנחש אנחנו אומרים לכם בדיוק מה לשאול ואת מי."
              />
            </div>
          </div>
        </section>

        {/* ── סיום ── */}
        <section className={`${s.section} ${s.cta}`}>
          <div className="wrap">
            <h2 className={s.ctaTitle}>הבירוקרטיה לא תיעלם. לפחות שתהיה מסודרת.</h2>
            <p className="lede" style={{ margin: '0 auto 28px' }}>
              עשר דקות עכשיו חוסכות טפסים שחוזרים, מועדים שנסגרים וכסף שלא הוגש.
            </p>
            <a href="/onboarding" className="btn btn-primary">
              להתחלת השאלון
            </a>
          </div>
        </section>
      </main>

      <footer className={s.footer}>
        <div className="wrap">
          <div className={s.footerGrid}>
            <div>
              <div className={s.logo} style={{ marginBottom: 8 }}>
                <LogoMark />
                מענקי לידה
              </div>
              <p style={{ fontSize: 14 }}>מימוש זכויות הורות בישראל</p>
            </div>
            <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <a href="/changelog" className={s.navLink} style={{ padding: 0 }}>מה חדש</a>
              <a href="/privacy" className={s.navLink} style={{ padding: 0 }}>מדיניות פרטיות</a>
              <a href="/terms" className={s.navLink} style={{ padding: 0 }}>תנאי שימוש</a>
              <a href="/guides" className={s.navLink} style={{ padding: 0 }}>מדריכים</a>
              <a href="/contact" className={s.navLink} style={{ padding: 0 }}>יצירת קשר</a>
            </div>
          </div>
          <p className={s.version}>
            קטלוג הזכויות גרסה {catalogVersion} · עודכן ב-{formatDate(lastChanged)} ·{' '}
            <a href="/changelog">מה השתנה</a>
          </p>
          <p className={s.disclaimer}>
            האתר הוא כלי מידע וארגון, ואינו מהווה ייעוץ משפטי, פיננסי או מס. הסכומים והכללים
            מבוססים על מקורות פומביים ומתעדכנים מעת לעת, ועשויים להשתנות או לא לחול על מקרה מסוים.
            הגורם הקובע לעניין זכאות הוא המוסד לביטוח לאומי, ובעניין נכי צה״ל — אגף השיקום במשרד
            הביטחון. בכל מקרה של ספק יש לפנות אליהם ישירות.
          </p>
        </div>
      </footer>
    </>
  );
}

/* ── רכיבי עזר ─────────────────────────────────── */

function Stat({ num, lbl }: { num: string; lbl: string }) {
  return (
    <div className={s.stat}>
      <div className={s.statNum}>{num}</div>
      <div className={s.statLbl}>{lbl}</div>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className={s.step}>
      <div className={s.stepNum}>{n}</div>
      <h3 className={s.stepTitle}>{title}</h3>
      <p className={s.stepBody}>{body}</p>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className={`card ${s.feature}`}>
      <div className={s.featureIcon}>{icon}</div>
      <h3 className={s.featureTitle}>{title}</h3>
      <p className={s.featureBody}>{body}</p>
    </div>
  );
}

function TrustItem({ text }: { text: string }) {
  return (
    <li className={s.trustItem}>
      <svg className={s.check} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{text}</span>
    </li>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className={s.faqItem}>
      <summary className={s.faqQ}>{q}</summary>
      <p className={s.faqA}>{a}</p>
    </details>
  );
}

/* ── איורים ────────────────────────────────────── */

function LogoMark() {
  return (
    <svg className={s.logoMark} viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="15" stroke="var(--warm)" strokeWidth="1.5" />
      <path
        d="M9 18.5c0-4.5 3.2-7.5 7-7.5s7 3 7 7.5"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="16" cy="8.5" r="2.4" fill="var(--warm)" />
    </svg>
  );
}

/**
 * איור הגיבור. צורות אורגניות רכות שרומזות על עטיפה, שחר וצמיחה —
 * במקום קליפ-ארט של תינוקות. משתמש בטוקנים של הערכה כדי לעבוד בשני המצבים.
 */
function HeroArt() {
  return (
    <svg className={s.art} viewBox="0 0 420 380" fill="none" role="img" aria-label="איור מופשט של הורות">
      <defs>
        <linearGradient id="dawn" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="var(--warm)" stopOpacity=".28" />
          <stop offset="100%" stopColor="var(--warm)" stopOpacity=".05" />
        </linearGradient>
        <linearGradient id="calm" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity=".22" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity=".04" />
        </linearGradient>
      </defs>

      {/* שמש/שחר */}
      <circle cx="286" cy="104" r="62" fill="url(#dawn)" />
      <circle cx="286" cy="104" r="62" stroke="var(--warm)" strokeOpacity=".3" strokeWidth="1" />

      {/* הזרוע החובקת הגדולה */}
      <path
        d="M60 330c0-92 60-158 142-158 62 0 106 34 124 82"
        stroke="var(--accent)"
        strokeOpacity=".45"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M60 330c0-92 60-158 142-158 62 0 106 34 124 82L326 330z"
        fill="url(#calm)"
      />

      {/* חיבוק פנימי */}
      <path
        d="M118 330c0-52 36-90 84-90s84 38 84 90"
        stroke="var(--warm)"
        strokeOpacity=".55"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* הצורה המרכזית הקטנה */}
      <circle cx="202" cy="286" r="26" fill="var(--paper)" stroke="var(--warm)" strokeWidth="2" />
      <circle cx="202" cy="286" r="9" fill="var(--warm)" fillOpacity=".5" />

      {/* עלים / צמיחה */}
      <path
        d="M348 330c0-30 14-52 34-58M348 330c0-22-10-40-26-48"
        stroke="var(--done)"
        strokeOpacity=".5"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* קו הקרקע */}
      <path d="M28 330h364" stroke="var(--line)" strokeWidth="1.5" strokeLinecap="round" />

      {/* נקודות מרחפות */}
      <circle cx="96" cy="128" r="4" fill="var(--warm)" fillOpacity=".45" />
      <circle cx="142" cy="86" r="2.5" fill="var(--accent)" fillOpacity=".4" />
      <circle cx="368" cy="196" r="3" fill="var(--warm)" fillOpacity=".35" />
    </svg>
  );
}


const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  width: '100%',
  height: '100%',
};

function IconCalc() {
  return (
    <svg {...iconProps}>
      <rect x="4" y="2" width="16" height="20" rx="2.5" />
      <path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15v4M8 19h4" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4M12 15l2 2 3-4" />
    </svg>
  );
}
function IconDoc() {
  return (
    <svg {...iconProps}>
      <path d="M14 2H7a2 2 0 00-2 2v16a2 2 0 002 2h10a2 2 0 002-2V7z" />
      <path d="M14 2v5h5M9 13h6M9 17h4" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg {...iconProps}>
      <path d="M16 20v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="3.5" />
      <path d="M22 20v-2a4 4 0 00-3-3.9M16.5 3.6a4 4 0 010 7.8" />
    </svg>
  );
}
function IconShield() {
  return (
    <svg {...iconProps}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}
function IconSpark() {
  return (
    <svg {...iconProps}>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      <path d="M18 16l.9 2.1L21 19l-2.1.9L18 22l-.9-2.1L15 19l2.1-.9z" />
    </svg>
  );
}
