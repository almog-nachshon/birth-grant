import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'סדר בבלגן — מימוש זכויות הורות בישראל',
  description:
    'כלי חינמי שמראה לכל זוג בדיוק אילו זכויות מגיעות לו אחרי לידה, כמה כסף זה שווה, ומה צריך להגיש ומתי. מותאם לשכירים, עצמאים ולבעלי נכות.',
  openGraph: {
    title: 'סדר בבלגן — מימוש זכויות הורות',
    description: 'כל מה שמגיע לכם אחרי הלידה, במקום אחד, מותאם אליכם.',
    locale: 'he_IL',
    type: 'website',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>
        <a href="#main" className="skip-link">
          דילוג לתוכן הראשי
        </a>
        {children}
      </body>
    </html>
  );
}
