'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { ArrowRight, Archive, Clock, Flame, Loader2, Pencil, Star, Trash2 } from 'lucide-react';
import { useSWRConfig } from 'swr';import { toast } from 'sonner';
import type { MarketplaceServiceCardDto } from '@tsh/shared';
import { formatPriceLabel } from '@tsh/shared';
import { api, ApiClientError, errorMessage } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CategoryIcon } from './category-icon';

/** Shared stagger choreography — transforms are dropped under reduced motion. */
export const gridVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

export function cardVariants(reduced: boolean): Variants {
  return {
    hidden: reduced ? { opacity: 0 } : { opacity: 0, y: 18 },
    show: { opacity: 1, y: 0, transition: { duration: reduced ? 0.15 : 0.35, ease: 'easeOut' } },
  };
}

export function ServiceCard({ service }: { service: MarketplaceServiceCardDto }) {
  const reduced = useReducedMotion();
  const { isAdmin } = useAuth();
  const { mutate: globalMutate } = useSWRConfig();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const image = service.thumbnail ?? service.imageUrl;
  const showDelivery = Boolean(service.deliveryEstimateText); // R6: only when admin-set

  /** Refresh every marketplace/admin list that shows this service. */
  async function revalidateCatalog() {
    await globalMutate(
      (key) =>
        typeof key === 'string' &&
        (key.startsWith('/marketplace/') ||
          key.startsWith('home:marketplace') ||
          key.startsWith('/admin/services')),
      undefined,
      { revalidate: true },
    );
  }

  async function archiveService() {
    if (busy) return;
    setBusy(true);
    try {
      await api.patch(`/admin/services/${service.id}/status`, { status: 'ARCHIVED' });
      toast.success('Service archived', { description: 'It is hidden from the public catalog.' });
      await revalidateCatalog();
    } catch (err) {
      toast.error('Could not archive service', { description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function deleteService() {
    if (busy) return;
    setBusy(true);
    try {
      await api.delete(`/admin/services/${service.id}`);
      toast.success('Service deleted');
      setConfirmDelete(false);
      await revalidateCatalog();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'SERVICE_IN_USE') {
        toast.error('This service is in use', {
          description: 'Orders, carts or requests reference it. Archive it instead to keep that history intact.',
        });
      } else {
        toast.error('Could not delete service', { description: errorMessage(err) });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div variants={cardVariants(Boolean(reduced))} className="h-full">
      <article className="group flex h-full flex-col overflow-hidden rounded-xl border bg-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10 focus-within:border-primary/50 focus-within:shadow-lg">
        {/* Thumbnail strip (image zoom on hover; icon fallback keeps heights stable → no CLS) */}
        <div className="relative h-32 overflow-hidden bg-primary/5">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt=""
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center transition-transform duration-500 group-hover:scale-105">
              <CategoryIcon iconKey={service.category.iconKey} className="h-10 w-10 text-primary/60" />
            </div>
          )}
          <div className="absolute left-3 top-3 flex gap-1.5">
            {service.isPopular && (
              <Badge className="gap-1 border-0 bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                <Flame className="h-3 w-3" aria-hidden="true" /> Popular
              </Badge>
            )}
            {service.isFeatured && (
              <Badge className="gap-1 border-0 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                <Star className="h-3 w-3 fill-current" aria-hidden="true" /> Featured
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3 p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CategoryIcon iconKey={service.category.iconKey} className="h-3.5 w-3.5" />
            <span>{service.category.name}</span>
          </div>

          <h3 className="text-base font-semibold leading-snug">
            <Link
              href={`/services/${service.slug}`}
              className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {service.name}
            </Link>
          </h3>

          <p className="line-clamp-2 text-sm text-muted-foreground">{service.tagline ?? service.description}</p>

          <div className="mt-auto space-y-2 pt-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="sr-only">Price</p>
                <p className="text-lg font-bold text-primary" data-testid="price-label">
                  {formatPriceLabel(service)}
                </p>
                {showDelivery && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    {service.deliveryEstimateText}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/services/${service.slug}`}>
                  View details <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button size="sm" asChild>
                {/* Straight to the service-specific request form */}
                <Link href={`/services/${service.slug}/request`}>Order now</Link>
              </Button>
            </div>

            {isAdmin && (
              <div className="flex flex-wrap items-center gap-1 rounded-md border border-dashed border-primary/40 bg-primary/5 px-1.5 py-1">
                <span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  Admin
                </span>
                <Button variant="ghost" size="xs" asChild>
                  <Link href={`/admin/services/${service.id}/edit`}>
                    <Pencil className="h-3 w-3" /> Edit
                  </Link>
                </Button>
                <Button variant="ghost" size="xs" onClick={() => void archiveService()} disabled={busy}>
                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Archive className="h-3 w-3" />}
                  Archive
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                  disabled={busy}
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </Button>
              </div>
            )}
          </div>
        </div>
      </article>

      <AlertDialog open={confirmDelete} onOpenChange={(open) => !busy && setConfirmDelete(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{service.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the service and its packages, add-ons and request-form fields. If any order,
              cart or request references it, deletion is blocked and you can archive it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy} onClick={() => void deleteService()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
