import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { SERVICE_MARKETPLACE_ENABLED } from '@/lib/feature-flags';
import { MarketplaceContent } from '@/components/marketplace/marketplace-content';
import { ServicesContent } from './services-content';

export const metadata = {
  title: 'Services',
  description:
    'Browse the TechService Hub service marketplace — web development, programming projects, academic documents, hardware builds, PC repair and IT consultation.',
};

/** Flag off ⇒ legacy catalog page renders exactly as before. */
export default function ServicesPage() {
  if (!SERVICE_MARKETPLACE_ENABLED) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <Suspense fallback={<div className="space-y-8"><Skeleton className="h-10 w-72" /><Skeleton className="h-40 w-full" /></div>}>
          <ServicesContent />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <Suspense
        fallback={
          <div className="space-y-8">
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-10 w-full max-w-md" />
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-80 rounded-xl" />
              ))}
            </div>
          </div>
        }
      >
        <MarketplaceContent />
      </Suspense>
    </div>
  );
}
