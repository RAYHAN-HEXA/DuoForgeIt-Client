import type { Metadata } from 'next';
import { HomeContent } from './home-content';

export const metadata: Metadata = {
  // The client component (home-content.tsx) renders the page.
  alternates: { canonical: '/' },
};

export default function HomePage() {
  return <HomeContent />;
}
