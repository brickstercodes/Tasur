/**
 * WHY: Root layout — wraps every page in Tasur's shared font and HTML shell.
 *
 * Next.js App Router requires a root layout.tsx in the app/ directory. This one
 * sets the shared Geist font variables and the page title/description metadata
 * that appear in browser tabs and search engine previews.
 */

import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
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
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
