import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Crime News Draft Tool',
  description: 'Generate Facebook post drafts from crime news',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        style={{ backgroundColor: '#0a0a0a', color: '#ffffff' }}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
