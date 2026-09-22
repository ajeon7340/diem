import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});

const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
});

// Left describing a media kit for creators, and the demographics and purchase
// intent that came with their own analytics, long after none of that existed.
// This is the first thing a browser tab, a bookmark and a shared link show, so
// a stale title is not cosmetic: it promises a product we removed, and names
// two figures we now refuse to report at all.
export const metadata: Metadata = {
  title: {
    default: 'adfit — Evaluate YouTube creators before reaching out',
    template: '%s · adfit',
  },
  description:
    'Analyse any public YouTube channel against your campaign: recent content, public performance and sponsorship evidence, with sources and unknowns in view. Creators do not need to register, approve access or connect an account.',
};

/**
 * THE NAV WIDTH IS DECIDED BEFORE THE FIRST PAINT.
 *
 * It was React state, read from localStorage in an effect — so every load
 * rendered the rail expanded, then snapped it to collapsed a frame later. On
 * the Discover page, where the default IS collapsed, that made every
 * navigation look like the menu opening and closing itself.
 *
 * This runs before the body paints and writes the answer onto <html>, which is
 * what the grid template reads. React state still mirrors it for the toggle's
 * icon and labels, but the LAYOUT never waits for hydration. Wrapped in
 * try/catch because a blocked storage API must not stop the page rendering.
 */
const NAV_WIDTH_SCRIPT = `try{
  var s=localStorage.getItem('adfit:nav-collapsed');
  var c=s===null?location.pathname.indexOf('/discover')===0:s==='1';
  document.documentElement.dataset.navCollapsed=c?'true':'false';
}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: NAV_WIDTH_SCRIPT }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
