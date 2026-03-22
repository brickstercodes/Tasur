/**
 * WHY: Root layout — wraps every page in Tasur's shared font and HTML shell.
 *
 * Next.js App Router requires a root layout.tsx in the app/ directory. This one
 * sets the shared Geist font variables and the page title/description metadata
 * that appear in browser tabs and search engine previews.
 */

import type { Metadata } from 'next';
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';
import './globals.css';
import { CustomCursor } from '@/components/ui/CustomCursor';
import { ClickRipple } from '@/components/ui/ClickRipple';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const instrumentSerif = Instrument_Serif({
  variable: '--font-instrument-serif',
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
});

export const metadata: Metadata = {
  title: 'Tasur',
  description: 'AI-powered study platform for college students',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} antialiased`}>
        <CustomCursor />
        <ClickRipple />
        {children}
      </body>
    </html>
  );
}
