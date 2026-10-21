import type { Metadata } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';
import Aurora from '@/components/Aurora';
import Nav from '@/components/Nav';
import { AuthProvider } from '@/lib/auth-context';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'VenueFlow — Live Ticketing, Dynamic Pricing',
  description:
    'Multi-venue ticketing with seat-level booking, demand-driven dynamic pricing and automated waitlist fulfilment.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="min-h-screen antialiased">
        <AuthProvider>
          <Aurora />
          <Nav />
          <main className="mx-auto max-w-7xl px-5 py-10">{children}</main>
          <footer className="mt-20 border-t border-white/5 py-8 text-center text-xs text-slate-500">
            VenueFlow · PostgreSQL + MongoDB + Next.js · DBMS Level 3 Project
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
