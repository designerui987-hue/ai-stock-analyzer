import type { Metadata } from 'next';
import './globals.css';
import ClientLayout from '@/components/ClientLayout';

export const metadata: Metadata = {
  title: 'AI Stock Platform - Smart Indian Market Analysis',
  description: 'AI-powered stock market analysis platform for Indian investors. Get BUY/HOLD/SELL signals, portfolio insights, and AI recommendations.',
  keywords: 'stock market, AI, analysis, Indian stocks, NIFTY, trading, investment',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="text-white antialiased" style={{ background: '#080b10' }}>
        <ClientLayout>
          {children}
        </ClientLayout>
      </body>
    </html>
  );
}
