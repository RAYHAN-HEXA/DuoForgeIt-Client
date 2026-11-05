import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { SERVICE_MARKETPLACE_ENABLED } from '@/lib/feature-flags';
import { RequestFormContent } from './request-form';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  return { title: `Request — ${slug.replaceAll('-', ' ')}` };
}

export default function ServiceRequestPage({ params }: Params) {
  if (!SERVICE_MARKETPLACE_ENABLED) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <p className="text-muted-foreground">Service requests are not open yet.</p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <RequestFormLoader params={params} />
      </Suspense>
    </div>
  );
}

async function RequestFormLoader({ params }: Params) {
  const { slug } = await params;
  return <RequestFormContent slug={slug} />;
}
