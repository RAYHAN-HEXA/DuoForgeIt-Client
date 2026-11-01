import { Suspense } from 'react';
import { ServiceDetailContent } from './service-detail';

export default function ServiceDetailPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-7xl space-y-6 px-4 py-12 sm:px-6"><div className="h-96 animate-pulse rounded-xl bg-muted" /></div>}>
      <ServiceDetailContent />
    </Suspense>
  );
}
