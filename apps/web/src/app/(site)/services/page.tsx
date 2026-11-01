import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { ServicesContent } from './services-content';

export const metadata = { title: 'Services' };

export default function ServicesPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <Suspense fallback={<div className="space-y-8"><Skeleton className="h-10 w-72" /><Skeleton className="h-40 w-full" /></div>}>
        <ServicesContent />
      </Suspense>
    </div>
  );
}
