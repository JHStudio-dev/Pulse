import type { Metadata, Viewport } from 'next';
import { ServiceWorker } from './service-worker';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pulse',
  description: 'Sistema academico multiuniversidad',
  applicationName: 'Pulse',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Pulse',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#101013' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-dvh antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
