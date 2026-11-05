'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BookOpen,
  Code2,
  FileText,
  Globe,
  GraduationCap,
  Loader2,
  Palette,
  Presentation,
  Send,
  ShieldCheck,
  ShoppingCart,
  Star,
  UserCheck,
  Waypoints,
  Wrench,
} from 'lucide-react';
import type { HomepageDto } from '@tsh/shared';
import { formatBDT } from '@tsh/shared';
import { api, errorMessage } from '@/lib/api';
import { SERVICE_MARKETPLACE_ENABLED } from '@/lib/feature-flags';
import { MarketplaceHomeSections } from '@/components/marketplace/home-sections';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SectionHeading } from '@/components/empty-state';
import { toast } from 'sonner';

/** Fallback content mirrors the seed — the page renders even before the API is up. */
const FALLBACK: HomepageDto = {
  categories: [],
  featuredServices: [],
  founders: [],
  testimonials: [],
  portfolio: [],
  content: {
    hero: {
      headline: 'Your Ideas. Our Expertise. One Digital Solution.',
      subheadline:
        'From academic projects to professional software development, we turn your ideas into meaningful digital solutions.',
      primaryCta: { label: 'Explore Services', href: '/services' },
      secondaryCta: { label: 'Start Your Project', href: '/register' },
    },
    why_us: {
      items: [
        { title: 'Direct access to the experts', body: 'No account managers — you work directly with the founder leading your project.' },
        { title: 'Choose your project lead', body: 'Pick the founder whose expertise matches your project, or let us auto-assign.' },
        { title: 'Transparent milestone tracking', body: 'Follow your project through a clear seven-stage pipeline, submission to delivery.' },
        { title: 'Secure file handling', body: 'Requirements and deliverables stay private, shared through expiring secure links.' },
      ],
    },
    how_it_works: {
      steps: [
        { title: 'Pick a service', body: 'Browse the marketplace and configure exactly what you need.' },
        { title: 'Choose your lead', body: 'Select the co-founder you want driving the project — or let us assign.' },
        { title: 'Share requirements', body: 'Upload briefs and references, set your deadline, and submit.' },
        { title: 'Pay & track', body: 'Pay via bKash/Nagad/bank, then follow every stage until delivery.' },
      ],
    },
    faq: {
      items: [
        { q: 'How do payments work?', a: 'Place your order first, then pay via bKash, Nagad, Rocket, or bank transfer and submit the transaction ID. A founder verifies it before work begins.' },
        { q: 'Can I choose who works on my project?', a: 'Yes — pick a co-founder as your project lead during checkout, or choose auto-assignment.' },
        { q: 'How do revisions work?', a: 'Once your project is in progress you can request revisions from your order page; every request gets a response with a plan.' },
      ],
    },
  },
};

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Globe,
  Presentation,
  FileText,
  Code2,
  Wrench,
  Palette,
  ShoppingCart,
  BookOpen,
  GraduationCap,
};

type HeroContent = { headline: string; subheadline: string; primaryCta?: { label: string; href: string }; secondaryCta?: { label: string; href: string } };
type WhyUsContent = { items: Array<{ title: string; body: string }> };
type HowContent = { steps: Array<{ title: string; body: string }> };
type FaqContent = { items: Array<{ q: string; a: string }> };

/** Typed views of the fallback content blocks. */
const FALLBACK_WHY_US = (FALLBACK.content.why_us ?? {}) as Partial<WhyUsContent>;
const FALLBACK_HOW = (FALLBACK.content.how_it_works ?? {}) as Partial<HowContent>;
const FALLBACK_FAQ = (FALLBACK.content.faq ?? {}) as Partial<FaqContent>;

export default function HomePage() {
  const { data } = useSWR<HomepageDto>('/public/homepage', () => api.get<HomepageDto>('/public/homepage'), {
    fallbackData: FALLBACK,
    revalidateOnFocus: false,
  });
  const hero = (data!.content.hero ?? {}) as Partial<HeroContent>;
  const whyUs = (data!.content.why_us ?? {}) as Partial<WhyUsContent>;
  const howItWorks = (data!.content.how_it_works ?? {}) as Partial<HowContent>;
  const faq = (data!.content.faq ?? {}) as Partial<FaqContent>;

  return (
    <>
      <Hero hero={hero} />
      {SERVICE_MARKETPLACE_ENABLED ? (
        // Marketplace-v2 catalogue (PRD v2.0) — replaces the legacy sections
        <MarketplaceHomeSections />
      ) : (
        <>
          <Categories categories={data!.categories} />
          <FeaturedServices services={data!.featuredServices} />
        </>
      )}
      <WhyUs items={whyUs.items ?? FALLBACK_WHY_US.items ?? []} />
      <HowItWorks steps={howItWorks.steps ?? FALLBACK_HOW.steps ?? []} />
      <Founders founders={data!.founders} />
      <Portfolio projects={data!.portfolio} />
      <Testimonials testimonials={data!.testimonials} />
      <Faq items={faq.items ?? FALLBACK_FAQ.items ?? []} />
      <ContactSection />
    </>
  );
}

// ─── Hero ────────────────────────────────────────────────────

function Hero({ hero }: { hero: Partial<HeroContent> }) {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-grid" aria-hidden="true" />
      <div className="absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
      <div className="relative mx-auto flex max-w-7xl flex-col items-center gap-14 px-4 pb-24 pt-20 text-center sm:px-6 sm:pt-28">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="max-w-3xl space-y-6"
        >
          <Badge variant="outline" className="bg-background/70 px-3 py-1 text-foreground">
            <span className="mr-2 flex h-2 w-2 rounded-full bg-primary" />
            Two founders. Direct access. Zero layers.
          </Badge>
          <h1 className="text-balance text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-6xl">
            {hero.headline?.split('.').slice(0, 2).join('.')}.
            <br />
            <span className="text-gradient">{hero.headline?.split('.').slice(2).join('.').trim() || 'One Digital Solution.'}</span>
          </h1>
          <p className="mx-auto max-w-2xl text-pretty text-lg text-muted-foreground">
            {hero.subheadline}
          </p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" className="h-12 px-7 text-base" asChild>
              <Link href={hero.primaryCta?.href ?? '/services'}>
                {hero.primaryCta?.label ?? 'Explore Services'}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="h-12 bg-background/70 px-7 text-base backdrop-blur" asChild>
              <Link href={hero.secondaryCta?.href ?? '/register'}>
                {hero.secondaryCta?.label ?? 'Start Your Project'}
              </Link>
            </Button>
          </div>
        </motion.div>

        {/* Founder peek cards */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.25, ease: 'easeOut' }}
          className="grid w-full max-w-4xl gap-4 sm:grid-cols-3"
        >
          {[
            { icon: UserCheck, title: 'Choose your lead', body: 'Hand-pick the founder who drives your project.' },
            { icon: Waypoints, title: '7-stage pipeline', body: 'Track progress from submission to delivery.' },
            { icon: ShieldCheck, title: 'Secure delivery', body: 'Files shared via expiring secure links.' },
          ].map((c) => (
            <Card key={c.title} className="bg-background/70 backdrop-blur">
              <CardContent className="flex items-start gap-3 p-5 text-left">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <c.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{c.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{c.body}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ─── Categories ──────────────────────────────────────────────

function Categories({ categories }: { categories: HomepageDto['categories'] }) {
  if (!categories.length) return null;
  return (
    <section className="border-y bg-muted/30 py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-center gap-3">
          {categories.map((c) => {
            const Icon = CATEGORY_ICONS[c.slug] ?? Wrench;
            return (
              <Link
                key={c.id}
                href={`/services?category=${c.slug}`}
                className="group flex items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm font-medium transition-all hover:border-primary/40 hover:shadow-sm"
              >
                <Icon className="h-4 w-4 text-primary" />
                {c.name}
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── Featured services ───────────────────────────────────────

function FeaturedServices({ services }: { services: HomepageDto['featuredServices'] }) {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Services"
          title="Popular services, ready to start"
          description="Transparent scope and pricing — configure options at checkout."
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <Card key={s.id} className="group flex flex-col transition-all hover:-translate-y-1 hover:shadow-lg">
              <CardContent className="flex flex-1 flex-col gap-3 p-6">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary">{s.category.name}</Badge>
                  {s.isFeatured && <Star className="h-4 w-4 fill-amber-400 text-amber-400" />}
                </div>
                <h3 className="text-lg font-semibold leading-snug">{s.name}</h3>
                <p className="line-clamp-2 text-sm text-muted-foreground">{s.tagline ?? s.description}</p>
                <div className="mt-auto flex items-center justify-between pt-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Starting at</p>
                    <p className="font-bold text-primary">{formatBDT(s.basePrice)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Delivery</p>
                    <p className="text-sm font-medium">{s.deliveryDays} days</p>
                  </div>
                </div>
                <Button variant="outline" className="mt-2 w-full group-hover:bg-primary group-hover:text-primary-foreground" asChild>
                  <Link href={`/services/${s.slug}`}>View details</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
          <Card className="flex items-center justify-center border-dashed">
            <CardContent className="p-6 text-center">
              <p className="font-medium">Need something custom?</p>
              <p className="mt-1 text-sm text-muted-foreground">We scope bespoke builds together.</p>
              <Button variant="link" className="mt-2" asChild>
                <Link href="/#contact">
                  Talk to us <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

// ─── Why us ──────────────────────────────────────────────────

function WhyUs({ items }: { items: Array<{ title: string; body: string }> }) {
  return (
    <section className="border-y bg-muted/30 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading eyebrow="Why us" title="Built differently, on purpose" />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
            >
              <Card className="h-full">
                <CardContent className="p-6">
                  <span className="text-3xl font-extrabold text-primary/20">{String(i + 1).padStart(2, '0')}</span>
                  <h3 className="mt-2 font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── How it works ────────────────────────────────────────────

function HowItWorks({ steps }: { steps: Array<{ title: string; body: string }> }) {
  return (
    <section id="how-it-works" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading eyebrow="Process" title="How it works" description="Four steps between your idea and your finished project." />
        <div className="relative mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="absolute left-0 right-0 top-6 hidden h-0.5 bg-gradient-to-r from-primary/40 via-primary/20 to-primary/40 lg:block" aria-hidden="true" />
          {steps.map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="relative text-center"
            >
              <span className="relative z-10 mx-auto flex h-12 w-12 items-center justify-center rounded-full border-2 border-primary bg-background text-lg font-bold text-primary">
                {i + 1}
              </span>
              <h3 className="mt-4 font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Founders ────────────────────────────────────────────────

function Founders({ founders }: { founders: HomepageDto['founders'] }) {
  return (
    <section id="founders" className="scroll-mt-20 border-y bg-muted/30 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="The team"
          title="Meet our co-founders"
          description="Small team, senior people. Pick who leads your project — or let us assign the best fit."
        />
        <div className="mx-auto mt-12 grid max-w-4xl gap-6 md:grid-cols-2">
          {founders.map((f, i) => (
            <motion.div
              key={f.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.55, delay: i * 0.12 }}
            >
              <Card className="h-full transition-all hover:-translate-y-1 hover:shadow-lg">
                <CardContent className="flex h-full flex-col gap-4 p-6">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16 border-2 border-primary/20">
                      <AvatarImage src={f.photoUrl ?? undefined} alt={f.displayName} />
                      <AvatarFallback className="bg-primary/10 text-lg font-bold text-primary">
                        {f.displayName.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-semibold">{f.displayName}</h3>
                      <p className="text-sm text-primary">{f.title}</p>
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">{f.bio}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {f.skills.map((skill) => (
                      <Badge key={skill} variant="secondary" className="font-normal">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                  {f.portfolioUrl && (
                    <a
                      href={f.portfolioUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group/port mt-auto block overflow-hidden rounded-lg border transition-all hover:shadow-md"
                    >
                      {f.portfolioImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={f.portfolioImageUrl}
                          alt={`${f.displayName} — personal portfolio`}
                          className="h-32 w-full object-cover object-top transition-transform group-hover/port:scale-105"
                        />
                      ) : (
                        <div className="flex h-32 items-center justify-center bg-gradient-to-br from-primary/15 to-fuchsia-500/10">
                          <Code2 className="h-8 w-8 text-primary/40" />
                        </div>
                      )}
                      <div className="flex items-center justify-between px-3 py-2 text-sm font-medium text-primary">
                        Personal portfolio
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/port:translate-x-0.5" />
                      </div>
                    </a>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Portfolio ───────────────────────────────────────────────

function Portfolio({ projects }: { projects: HomepageDto['portfolio'] }) {
  if (!projects.length) return null;
  return (
    <section id="portfolio" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading eyebrow="Portfolio" title="Featured projects" />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Card key={p.id} className="group overflow-hidden transition-all hover:-translate-y-1 hover:shadow-lg">
              <CardContent className="flex h-full flex-col p-0">
                <div className="flex h-40 items-center justify-center bg-gradient-to-br from-primary/15 to-fuchsia-500/10">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt={p.title} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                  ) : (
                    <Code2 className="h-10 w-10 text-primary/40" />
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2 p-5">
                  <h3 className="font-semibold">{p.title}</h3>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
                  {p.projectUrl && (
                    <a
                      href={p.projectUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                    >
                      Visit project <ArrowRight className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Testimonials ────────────────────────────────────────────

function Testimonials({ testimonials }: { testimonials: HomepageDto['testimonials'] }) {
  if (!testimonials.length) return null;
  return (
    <section className="border-y bg-muted/30 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading eyebrow="Testimonials" title="What clients say" />
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {testimonials.map((t) => (
            <Card key={t.id} className="flex h-full flex-col">
              <CardContent className="flex flex-1 flex-col gap-4 p-6">
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-4 w-4 ${i < t.rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`}
                    />
                  ))}
                </div>
                <p className="flex-1 text-sm leading-relaxed">“{t.quote}”</p>
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={t.avatarUrl ?? undefined} alt="" />
                    <AvatarFallback className="text-xs font-semibold">
                      {t.authorName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{t.authorName}</p>
                    {t.authorTitle && <p className="text-xs text-muted-foreground">{t.authorTitle}</p>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── FAQ ─────────────────────────────────────────────────────

function Faq({ items }: { items: Array<{ q: string; a: string }> }) {
  return (
    <section id="faq" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <SectionHeading eyebrow="FAQ" title="Frequently asked questions" />
        <Accordion type="single" collapsible className="mt-10">
          {items.map((item, i) => (
            <AccordionItem key={i} value={`faq-${i}`}>
              <AccordionTrigger className="text-left font-medium">{item.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{item.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

// ─── Contact ─────────────────────────────────────────────────

function ContactSection() {
  const [sending, setSending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setSending(true);
    try {
      await api.post('/contact', {
        name: fd.get('name'),
        email: fd.get('email'),
        subject: fd.get('subject') || undefined,
        message: fd.get('message'),
        website: fd.get('website') || undefined, // honeypot
      });
      toast.success('Message sent', { description: "We'll get back to you within one business day." });
      form.reset();
    } catch (err) {
      toast.error('Could not send message', { description: errorMessage(err) });
    } finally {
      setSending(false);
    }
  }

  return (
    <section id="contact" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2">
        <div className="flex flex-col justify-center gap-4">
          <SectionHeading align="left" eyebrow="Contact" title="Tell us about your project" />
          <p className="text-muted-foreground">
            Describe what you need — a deadline, a rough scope, or just a question. Either
            founder reads every message and replies within one business day.
          </p>
          <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <Send className="h-4 w-4 text-primary" /> Replies within one business day
            </li>
            <li className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" /> NDAs welcome for business clients
            </li>
          </ul>
        </div>
        <Card>
          <CardContent className="p-6 sm:p-8">
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="contact-name">Name</Label>
                  <Input id="contact-name" name="name" required minLength={2} maxLength={120} placeholder="Your name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact-email">Email</Label>
                  <Input id="contact-email" name="email" type="email" required placeholder="you@example.com" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-subject">Subject (optional)</Label>
                <Input id="contact-subject" name="subject" maxLength={200} placeholder="E.g. E-commerce site for my store" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-message">Message</Label>
                <Textarea id="contact-message" name="message" required minLength={10} maxLength={5000} rows={5} placeholder="What are you building?" />
              </div>
              {/* honeypot — invisible to humans */}
              <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
              <Button type="submit" className="w-full" disabled={sending}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sending ? 'Sending…' : 'Send message'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
