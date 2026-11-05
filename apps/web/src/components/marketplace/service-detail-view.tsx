'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  Check,
  ChevronRight,
  Clock,
  FileText,
  Info,
  Package,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import type { MarketplaceServiceCardDto, MarketplaceServiceDetailDto } from '@tsh/shared';
import { formatBdtRange, formatPriceLabel } from '@tsh/shared';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { CategoryIcon } from './category-icon';
import { ServiceCard, cardVariants, gridVariants } from './service-card';

function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.section
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: reduced ? 0.15 : 0.35 }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

export function ServiceDetailView({
  service,
  related,
}: {
  service: MarketplaceServiceDetailDto;
  related: MarketplaceServiceCardDto[];
}) {
  const reduced = useReducedMotion();
  const image = service.thumbnail ?? service.imageUrl;
  const showDelivery = Boolean(service.deliveryEstimateText); // R6: admin-set only
  const priceLabel = formatPriceLabel(service);

  return (
    <div className="space-y-10">
      {/* Banner + title */}
      <motion.div
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduced ? 0.15 : 0.35 }}
      >
        <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-sm text-muted-foreground">
          <Link href="/services" className="hover:text-foreground">
            Services
          </Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{service.category.name}</span>
        </nav>

        <div className="overflow-hidden rounded-2xl border">
          <div className={`relative h-44 sm:h-56 ${image ? '' : 'bg-primary/5'}`}>
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center">
                <CategoryIcon iconKey={service.category.iconKey} className="h-14 w-14 text-primary/50" />
              </div>
            )}
            <div className="absolute left-4 top-4 flex gap-1.5">
              {service.isPopular && (
                <Badge className="border-0 bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300">Popular</Badge>
              )}
              {service.isFeatured && (
                <Badge className="border-0 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">Featured</Badge>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <CategoryIcon iconKey={service.category.iconKey} className="h-4 w-4" aria-hidden="true" />
                {service.category.name}
              </p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{service.name}</h1>
              {service.tagline && <p className="mt-2 text-lg text-muted-foreground">{service.tagline}</p>}
              {showDelivery && (
                <p className="mt-3 flex items-center gap-1.5 text-sm font-medium">
                  <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
                  {service.deliveryEstimateText}
                </p>
              )}
            </div>

            {/* Order box */}
            <Card className="w-full shrink-0 lg:w-80">
              <CardContent className="space-y-3 p-5">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {service.pricingModel === 'CUSTOM_QUOTE' ? 'Pricing' : 'Price'}
                  </p>
                  <p className="text-2xl font-bold text-primary">{priceLabel}</p>
                  {service.priceNote && <p className="mt-1 text-xs text-muted-foreground">{service.priceNote}</p>}
                </div>
                <Button className="w-full" asChild>
                  <Link href={`/services/${service.slug}/request`}>Order now</Link>
                </Button>
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Submit your requirements — you&apos;ll receive a quotation before any payment.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </motion.div>

      {/* Description + features */}
      <div className="grid gap-8 lg:grid-cols-5">
        <Reveal className="lg:col-span-3">
          <h2 className="text-xl font-semibold">About this service</h2>
          <p className="mt-3 whitespace-pre-line leading-relaxed text-muted-foreground">{service.description}</p>

          {service.features.length > 0 && (
            <>
              <h3 className="mt-8 text-lg font-semibold">What&apos;s included</h3>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {service.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                    {f}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Reveal>

        <Reveal className="lg:col-span-2">
          <Card>
            <CardContent className="space-y-5 p-5">
              <div className="flex items-start gap-3">
                <Package className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <h3 className="font-semibold">Deliverables</h3>
                  <ul className="mt-1.5 space-y-1 text-sm text-muted-foreground">
                    {service.deliverables.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <Separator />
              <div className="flex items-start gap-3">
                <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <h3 className="font-semibold">Revision policy</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{service.revisionPolicy ?? 'Agreed per quotation.'}</p>
                </div>
              </div>
              <Separator />
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <h3 className="font-semibold">Requirements</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{service.requirementsText ?? 'Submitted via the order form.'}</p>
                  {service.acceptedFileTypes.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {service.acceptedFileTypes.map((t) => (
                        <Badge key={t} variant="secondary" className="text-[11px] uppercase">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </Reveal>
      </div>

      {/* Pricing breakdown */}
      {(service.packages.length > 0 || service.addOns.length > 0) && (
        <Reveal>
          <h2 className="text-xl font-semibold">Pricing &amp; packages</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {service.packages.map((p) => (
              <Card key={p.id} className="border-primary/30">
                <CardContent className="space-y-2 p-5">
                  <p className="font-semibold">{p.label}</p>
                  {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
                  <p className="text-lg font-bold text-primary">{formatBdtRange(p.priceFrom, p.priceTo)}</p>
                </CardContent>
              </Card>
            ))}
            {service.addOns.map((a) => (
              <Card key={a.id}>
                <CardContent className="space-y-2 p-5">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Add-on</Badge>
                    <p className="font-semibold">{a.label}</p>
                  </div>
                  {a.description && <p className="text-sm text-muted-foreground">{a.description}</p>}
                  <p className="text-lg font-bold text-primary">{formatBdtRange(a.priceFrom, a.priceTo)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </Reveal>
      )}

      {/* Disclaimer (PRD §5) */}
      <Reveal>
        <div className="flex items-start gap-3 rounded-xl border border-amber-300/60 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <p className="text-sm text-amber-900 dark:text-amber-200">
            Prices shown are starting prices; the final quotation depends on complexity, scope, deadline
            and extra requirements. You approve the quotation before any payment.
          </p>
        </div>
      </Reveal>

      {/* FAQs */}
      {service.faqs.length > 0 && (
        <Reveal>
          <h2 className="text-xl font-semibold">Frequently asked questions</h2>
          <Accordion type="single" collapsible className="mt-4">
            {service.faqs.map((faq, i) => (
              <AccordionItem key={faq.q} value={`faq-${i}`}>
                <AccordionTrigger>{faq.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{faq.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      )}

      {/* Related services (FR-13) */}
      {related.length > 0 && (
        <Reveal>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Related services</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/services?category=${service.category.slug}`}>
                All in {service.category.name} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
          <motion.div
            variants={reduced ? { hidden: {}, show: {} } : gridVariants}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-40px' }}
            className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
          >
            {related.map((s) => (
              <motion.div key={s.id} variants={cardVariants(Boolean(reduced))}>
                <ServiceCard service={s} />
              </motion.div>
            ))}
          </motion.div>
        </Reveal>
      )}

      {/* Bottom CTA */}
      <Reveal>
        <div className="flex flex-col items-start gap-4 rounded-xl border border-primary/30 bg-primary/5 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <FileText className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <h2 className="text-lg font-semibold">Ready to start?</h2>
              <p className="text-sm text-muted-foreground">
                Submit the service-specific form — no payment is taken until you accept a quotation.
              </p>
            </div>
          </div>
          <Button size="lg" asChild>
            <Link href={`/services/${service.slug}/request`}>Order now</Link>
          </Button>
        </div>
      </Reveal>
    </div>
  );
}
