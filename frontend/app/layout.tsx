import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'gamja docs · 문서 기반 질의응답',
  description: '문서를 업로드하고 질문하세요.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-white text-ink antialiased">{children}</body>
    </html>
  );
}
