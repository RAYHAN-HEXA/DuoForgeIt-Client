import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SERVICE_MARKETPLACE_ENABLED } from '@/lib/feature-flags';
import { Skeleton } from '@/components/ui/skeleton';
import { RequestFormContent } from './request-form';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `Request — ${slug.replaceAll('-', ' ')}`,
    // A request form is an action page, not a landing page.
    robots: { index: false },
  };
}

export default async function ServiceRequestPage({ params }: Params) {
  // Flag off ⇒ the route doesn't exist — a real 404 instead of a 200 shell.
  if (!SERVICE_MARKETPLACE_ENABLED) notFound();

  const { slug } = await params;
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <RequestFormContent slug={slug} />
      </Suspense>
    </div>
  );
}
