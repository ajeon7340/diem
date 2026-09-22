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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
