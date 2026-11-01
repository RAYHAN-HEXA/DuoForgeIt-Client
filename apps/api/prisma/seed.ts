/**
 * Idempotent seed: safe to run repeatedly (upserts by unique keys).
 *
 * Founder User rows are pre-created with `firebaseUid: null` and role ADMIN.
 * The first time the real founder logs in with a matching *verified* Firebase
 * email, the auth sync service claims the row (links the uid) inside a
 * transaction — no duplicate users, no self-service role escalation.
 *
 * Replace placeholder founder names/bios/skills with the real ones before
 * launch (or edit via admin SiteContent/founder management later).
 */
import { PrismaClient, FounderDiscipline } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient();

const founderAEmail = process.env.SEED_FOUNDER_A_EMAIL ?? 'founder.a@techservicehub.test';
const founderBEmail = process.env.SEED_FOUNDER_B_EMAIL ?? 'founder.b@techservicehub.test';

type OptionSeed = {
  groupKey: string;
  label: string;
  priceDelta: string;
  daysDelta: number;
  isDefault?: boolean;
};

type ServiceSeed = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  basePrice: string;
  deliveryDays: number;
  founderDiscipline: FounderDiscipline;
  isFeatured?: boolean;
  options: OptionSeed[];
};

type CategorySeed = {
  slug: string;
  name: string;
  description: string;
  iconKey: string;
  services: ServiceSeed[];
};

const CATALOG: CategorySeed[] = [
  {
    slug: 'web-development',
    name: 'Custom Website Development',
    description: 'Fast, modern, responsive websites for businesses that need to look sharp and load fast.',
    iconKey: 'Globe',
    services: [
      {
        slug: 'business-website',
        name: 'Business Website',
        tagline: 'A polished multi-page site that turns visitors into customers.',
        description:
          'A complete custom website built with modern technology: responsive design, fast load times, SEO-friendly structure, and a simple admin experience. Ideal for companies, agencies, and personal brands that need a professional web presence.',
        basePrice: '25000.00',
        deliveryDays: 14,
        founderDiscipline: FounderDiscipline.WEB_SOFTWARE_ECOMMERCE,
        isFeatured: true,
        options: [
          { groupKey: 'scope', label: 'Up to 5 pages', priceDelta: '-5000.00', daysDelta: 0, isDefault: true },
          { groupKey: 'scope', label: '6–10 pages', priceDelta: '0.00', daysDelta: 0 },
          { groupKey: 'scope', label: '11–20 pages', priceDelta: '12000.00', daysDelta: 7 },
          { groupKey: 'urgency', label: 'Standard timeline', priceDelta: '0.00', daysDelta: 0, isDefault: true },
          { groupKey: 'urgency', label: 'Express (−7 days)', priceDelta: '8000.00', daysDelta: -7 },
          { groupKey: 'extras', label: 'SEO setup', priceDelta: '3000.00', daysDelta: 0 },
          { groupKey: 'extras', label: 'Analytics & tracking', priceDelta: '1500.00', daysDelta: 0 },
          { groupKey: 'extras', label: '1 month maintenance', priceDelta: '4000.00', daysDelta: 0 },
        ],
      },
    ],
  },
  {
    slug: 'presentation-design',
    name: 'Presentation & Slide Design',
    description: 'Pitch decks, investor decks, and corporate presentations that actually persuade.',
    iconKey: 'Presentation',
    services: [
      {
        slug: 'pitch-deck-design',
        name: 'Pitch / Corporate Deck Design',
        tagline: 'Slides with a clear story, clean layout, and premium visuals.',
        description:
          'Professional slide design for business presentations: investor pitch decks, sales decks, conference talks, and internal strategy presentations. You get a structured narrative, custom graphics, and fully editable source files.',
        basePrice: '6000.00',
        deliveryDays: 4,
        founderDiscipline: FounderDiscipline.DESIGN_DOCS_UX,
        isFeatured: true,
        options: [
          { groupKey: 'scope', label: 'Up to 15 slides', priceDelta: '0.00', daysDelta: 0, isDefault: true },
          { groupKey: 'scope', label: '16–30 slides', priceDelta: '3000.00', daysDelta: 2 },
          { groupKey: 'scope', label: '31–50 slides', priceDelta: '7000.00', daysDelta: 4 },
          { groupKey: 'urgency', label: 'Standard timeline', priceDelta: '0.00', daysDelta: 0, isDefault: true },
          { groupKey: 'urgency', label: 'Express (48h)', priceDelta: '2500.00', daysDelta: -2 },
          { groupKey: 'extras', label: 'Custom illustrations & icons', priceDelta: '2000.00', daysDelta: 0 },
          { groupKey: 'extras', label: 'Speaker notes', priceDelta: '1500.00', daysDelta: 0 },
          { groupKey: 'extras', label: 'Editable source files (PPTX + Keynote)', priceDelta: '1000.00', daysDelta: 0 },
        ],
      },
    ],
  },
  {
    slug: 'technical-documentation',
    name: 'Technical Documentation & User Guides',
    description: 'API references, user manuals, and process docs your team and customers will actually read.',
    iconKey: 'FileText',
    services: [
      {
        slug: 'product-documentation',
        name: 'Product / API Documentation',
        tagline: 'Clear, structured docs for your product, API, or internal process.',
        description:
          'Well-organized technical documentation: user guides, API references, SOPs, and onboarding manuals. Includes clear structure, diagrams where useful, and delivery in the formats you need (PDF, web-ready Markdown, DOCX).',
        basePrice: '8000.00',
        deliveryDays: 7,
        founderDiscipline: FounderDiscipline.DESIGN_DOCS_UX,
        options: [
          { groupKey: 'scope', label: 'Up to 20 pages', priceDelta: '0.00', daysDelta: 0, isDefault: true },
          { groupKey: 'scope', label: '21–50 pages', priceDelta: '6000.00', daysDelta: 5 },
          { groupKey: 'scope', label: '50+ pages', priceDelta: '14000.00', daysDelta: 10 },
          { groupKey: 'extras', label: 'Technical diagrams & flowcharts', priceDelta: '3500.00', daysDelta: 1 },
          { groupKey: 'extras', label: 'API reference section', priceDelta: '5000.00', daysDelta: 2 },
          { groupKey: 'extras', label: 'PDF + web versions', priceDelta: '2500.00', daysDelta: 0 },
        ],
      },
    ],
  },
  {
    slug: 'software-projects',
    name: 'Complete Software Projects',
    description: 'Full-cycle custom software: scoping, build, deploy, and handover.',
    iconKey: 'Code2',
    services: [
      {
        slug: 'custom-software-project',
        name: 'Custom Software Project',
        tagline: 'Web applications and internal tools built end-to-end.',
        description:
          'A complete software build: requirements workshops, architecture, iterative development with demos, testing, deployment, and documentation handover. Suitable for SaaS products, internal tools, portals, and integrations.',
        basePrice: '60000.00',
        deliveryDays: 45,
        founderDiscipline: FounderDiscipline.WEB_SOFTWARE_ECOMMERCE,
        isFeatured: true,
        options: [
          { groupKey: 'scope', label: 'MVP (core features)', priceDelta: '0.00', daysDelta: 0, isDefault: true },
          { groupKey: 'scope', label: 'Full product (extended scope)', priceDelta: '45000.00', daysDelta: 20 },
          { groupKey: 'urgency', label: 'Standard timeline', priceDelta: '0.00', daysDelta: 0, isDefault: true },
          { groupKey: 'urgency', label: 'Fast-track (−15 days)', priceDelta: '20000.00', daysDelta: -15 },
          { groupKey: 'extras', label: 'Admin dashboard', priceDelta: '15000.00', daysDelta: 5 },
          { groupKey: 'extras', label: 'Automated test suite', priceDelta: '12000.00', daysDelta: 4 },
          { groupKey: 'extras', label: 'Deployment & DevOps setup', priceDelta: '8000.00', daysDelta: 2 },
        ],
      },
    ],
  },
  {
    slug: 'ui-ux-design',
    name: 'UI/UX Design',
    description: 'Interfaces designed around real users — wireframes to polished, dev-ready designs.',
    iconKey: 'Palette',
    services: [
      {
        slug: 'product-ui-ux-design',
        name: 'Product UI/UX Design',
        tagline: 'From wireframes to a dev-ready design system.',
        description:
          'User-centered interface design for apps and websites: user flows, wireframes, high-fidelity screens, and an interactive prototype. Delivered as developer-ready files with a consistent design system.',
        basePrice: '12000.00',
        deliveryDays: 10,
        founderDiscipline: FounderDiscipline.DESIGN_DOCS_UX,
        isFeatured: true,
        options: [
          { groupKey: 'scope', label: 'Up to 8 screens', priceDelta: '0.00', daysDelta: 0, isDefault: true },
          { groupKey: 'scope', label: '9–20 screens', priceDelta: '8000.00', daysDelta: 5 },
          { groupKey: 'scope', label: 'Full product (20+ screens)', priceDelta: '25000.00', daysDelta: 12 },
          { groupKey: 'extras', label: 'Design system & component library', priceDelta: '10000.00', daysDelta: 4 },
          { groupKey: 'extras', label: 'Interactive prototype', priceDelta: '6000.00', daysDelta: 2 },
          { groupKey: 'extras', label: 'Usability review report', priceDelta: '4000.00', daysDelta: 1 },
        ],
      },
    ],
  },
  {
    slug: 'ecommerce-solutions',
    name: 'E-commerce Solutions',
    description: 'Online stores that are fast, secure, and built to convert — payments and delivery included.',
    iconKey: 'ShoppingCart',
    services: [
      {
        slug: 'online-store',
        name: 'Online Store Build',
        tagline: 'A complete store with local payments and courier integration.',
        description:
          'End-to-end e-commerce setup: product catalog, cart and checkout, local payment gateway (bKash/Nagad/cards), courier integration, and order management. Built to be fast on mobile, where most of your buyers are.',
        basePrice: '45000.00',
        deliveryDays: 30,
        founderDiscipline: FounderDiscipline.WEB_SOFTWARE_ECOMMERCE,
        options: [
          { groupKey: 'scope', label: 'Up to 50 products', priceDelta: '0.00', daysDelta: 0, isDefault: true },
          { groupKey: 'scope', label: 'Unlimited products', priceDelta: '15000.00', daysDelta: 5 },
          { groupKey: 'platform', label: 'WooCommerce', priceDelta: '0.00', daysDelta: 0, isDefault: true },
          { groupKey: 'platform', label: 'Shopify', priceDelta: '20000.00', daysDelta: 0 },
          { groupKey: 'platform', label: 'Fully custom build', priceDelta: '35000.00', daysDelta: 15 },
          { groupKey: 'extras', label: 'Local payment gateway integration', priceDelta: '12000.00', daysDelta: 3 },
          { groupKey: 'extras', label: 'Inventory module', priceDelta: '10000.00', daysDelta: 3 },
          { groupKey: 'extras', label: 'Courier service integration', priceDelta: '8000.00', daysDelta: 2 },
        ],
      },
    ],
  },
  {
    slug: 'custom-it-solutions',
    name: 'Custom IT Solutions',
    description: 'Automation, cloud, security reviews, and everything that doesn’t fit a box.',
    iconKey: 'Wrench',
    services: [
      {
        slug: 'it-consulting-sprint',
        name: 'IT Consulting & Implementation',
        tagline: 'Focused expertise for a specific technical problem.',
        description:
          'A scoped engagement with a founder directly: discovery, a concrete technical plan, and hands-on implementation. Typical projects: workflow automation, cloud migration, security reviews, and system integrations.',
        basePrice: '15000.00',
        deliveryDays: 14,
        founderDiscipline: FounderDiscipline.BOTH,
        options: [
          { groupKey: 'scope', label: 'Discovery sprint (1 week)', priceDelta: '-10000.00', daysDelta: -7 },
          { groupKey: 'scope', label: 'Discovery + implementation', priceDelta: '0.00', daysDelta: 0, isDefault: true },
          { groupKey: 'extras', label: 'Cloud migration support', priceDelta: '18000.00', daysDelta: 7 },
          { groupKey: 'extras', label: 'Workflow automation scripts', priceDelta: '9000.00', daysDelta: 3 },
          { groupKey: 'extras', label: 'Security review & hardening', priceDelta: '12000.00', daysDelta: 4 },
        ],
      },
    ],
  },
];

const SITE_CONTENT: Record<string, unknown> = {
  hero: {
    headline: 'Your Ideas. Our Expertise. One Digital Solution.',
    subheadline:
      'From presentation design to full-scale software development, we turn your ideas into meaningful digital solutions.',
    primaryCta: { label: 'Explore Services', href: '/services' },
    secondaryCta: { label: 'Start Your Project', href: '/register' },
  },
  why_us: {
    items: [
      { title: 'Direct access to the experts', body: 'No account managers, no game of telephone — you work directly with the founder who leads your project.' },
      { title: 'Choose your project lead', body: 'Pick the founder whose expertise matches your project, or let us auto-assign the best fit.' },
      { title: 'Transparent milestone tracking', body: 'Follow your project through a clear seven-stage pipeline, from submission to delivery.' },
      { title: 'Secure file handling', body: 'Requirements and deliverables are stored privately and shared through expiring secure links.' },
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
      { q: 'How do payments work?', a: 'You place your order first, then pay via bKash, Nagad, Rocket, or bank transfer and submit the transaction ID. A founder verifies the payment against our records before work begins.' },
      { q: 'Can I choose who works on my project?', a: 'Yes. During checkout you can pick one of our two co-founders as your project lead, or choose auto-assignment. If needed we may reassign internally — you will always be notified.' },
      { q: 'How do revisions work?', a: 'Once your project is in progress you can request revisions from your order page. We respond to every request with a plan and a timeline.' },
      { q: 'What files do I get at the end?', a: 'Deliverables vary by service: source files, PDFs, deployed URLs, and documentation. Everything is delivered through your dashboard as secure downloads.' },
      { q: 'What if I miss my own deadline inputs?', a: 'Deadlines are agreed at checkout. If your requirements arrive late, the timeline shifts by the same amount — we will always flag this early.' },
      { q: 'Do you sign NDAs?', a: 'Yes, for business clients we are happy to sign a mutual NDA before you share sensitive material.' },
    ],
  },
};

async function main() {
  console.log('Seeding TechService Hub…');

  // ── Founders (placeholder identity; real names/photos before launch) ──
  const founderA = await prisma.user.upsert({
    where: { email: founderAEmail },
    update: {},
    create: {
      email: founderAEmail,
      fullName: 'Founder A (placeholder)',
      role: 'ADMIN',
      founderProfile: {
        create: {
          displayName: 'Founder A',
          title: 'Full-Stack Engineer & E-commerce Specialist',
          bio: 'Leads web development, software engineering, and e-commerce projects. Turns rough requirements into shipped products with clean architecture and honest timelines.',
          discipline: FounderDiscipline.WEB_SOFTWARE_ECOMMERCE,
          skills: ['Next.js', 'Node.js', 'PostgreSQL', 'E-commerce', 'Cloud Deployment'],
          displayOrder: 1,
        },
      },
    },
  });

  const founderB = await prisma.user.upsert({
    where: { email: founderBEmail },
    update: {},
    create: {
      email: founderBEmail,
      fullName: 'Founder B (placeholder)',
      role: 'ADMIN',
      founderProfile: {
        create: {
          displayName: 'Founder B',
          title: 'Presentation Design, Documentation & UX Lead',
          bio: 'Leads presentation design, technical documentation, and UI/UX projects. Makes complex ideas look clear — in slides, in docs, and in product interfaces.',
          discipline: FounderDiscipline.DESIGN_DOCS_UX,
          skills: ['Presentation Design', 'Technical Writing', 'Figma', 'UI/UX', 'Brand Systems'],
          displayOrder: 2,
        },
      },
    },
  });
  void founderA;
  void founderB;

  // ── Catalog ──
  for (const [ci, category] of CATALOG.entries()) {
    const cat = await prisma.serviceCategory.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        description: category.description,
        iconKey: category.iconKey,
        displayOrder: ci + 1,
      },
      create: {
        slug: category.slug,
        name: category.name,
        description: category.description,
        iconKey: category.iconKey,
        displayOrder: ci + 1,
      },
    });

    for (const [si, svc] of category.services.entries()) {
      const service = await prisma.service.upsert({
        where: { slug: svc.slug },
        update: {
          name: svc.name,
          tagline: svc.tagline,
          description: svc.description,
          basePrice: svc.basePrice,
          deliveryDays: svc.deliveryDays,
          founderDiscipline: svc.founderDiscipline,
          isFeatured: svc.isFeatured ?? false,
          displayOrder: si + 1,
          categoryId: cat.id,
        },
        create: {
          slug: svc.slug,
          name: svc.name,
          tagline: svc.tagline,
          description: svc.description,
          basePrice: svc.basePrice,
          deliveryDays: svc.deliveryDays,
          founderDiscipline: svc.founderDiscipline,
          isFeatured: svc.isFeatured ?? false,
          displayOrder: si + 1,
          categoryId: cat.id,
        },
      });

      for (const [oi, opt] of svc.options.entries()) {
        const existing = await prisma.serviceOption.findFirst({
          where: { serviceId: service.id, groupKey: opt.groupKey, label: opt.label },
        });
        const payload = {
          groupKey: opt.groupKey,
          label: opt.label,
          priceDelta: opt.priceDelta,
          daysDelta: opt.daysDelta,
          isDefault: opt.isDefault ?? false,
          displayOrder: oi + 1,
        };
        if (existing) {
          await prisma.serviceOption.update({ where: { id: existing.id }, data: payload });
        } else {
          await prisma.serviceOption.create({ data: { ...payload, serviceId: service.id } });
        }
      }
    }
  }

  // ── Testimonials (placeholder launch content) ──
  const testimonials = [
    { authorName: 'Rashed M.', authorTitle: 'CEO, Dhaka retail chain', quote: 'They rebuilt our online store end to end. Mobile sales doubled within two months of launch.', rating: 5 },
    { authorName: 'Farhana K.', authorTitle: 'Founder, fintech startup', quote: 'The investor deck they designed carried our whole pre-seed raise. Clear story, beautiful slides.', rating: 5 },
    { authorName: 'Imran H.', authorTitle: 'Operations lead, logistics company', quote: 'Their automation scripts saved our team about ten hours a week. Direct, no-nonsense, delivered on time.', rating: 5 },
    { authorName: 'Nusrat J.', authorTitle: 'Product manager', quote: 'Picking the founder who actually matched our project made a huge difference. Communication was excellent throughout.', rating: 4 },
  ];
  for (const [i, t] of testimonials.entries()) {
    const existing = await prisma.testimonial.findFirst({ where: { authorName: t.authorName } });
    if (!existing) {
      await prisma.testimonial.create({ data: { ...t, displayOrder: i + 1 } });
    }
  }

  // ── Portfolio (placeholder launch content) ──
  const portfolio = [
    { title: 'CityMart — E-commerce rebuild', description: 'Full WooCommerce → custom storefront migration with bKash payments and courier integration for a Dhaka retailer.', categorySlug: 'ecommerce-solutions' },
    { title: 'PayLift — Pre-seed pitch deck', description: '18-slide investor deck with custom data visuals that helped close a pre-seed round.', categorySlug: 'presentation-design' },
    { title: 'GridOps — Internal ops dashboard', description: 'Custom software project: fleet-tracking dashboard with role-based access and automated reporting.', categorySlug: 'software-projects' },
  ];
  for (const [i, p] of portfolio.entries()) {
    const existing = await prisma.portfolioProject.findFirst({ where: { title: p.title } });
    if (existing) continue;
    const cat = await prisma.serviceCategory.findUnique({ where: { slug: p.categorySlug } });
    await prisma.portfolioProject.create({
      data: {
        title: p.title,
        description: p.description,
        serviceCategoryId: cat?.id,
        displayOrder: i + 1,
      },
    });
  }

  // ── Homepage content blocks ──
  for (const [key, value] of Object.entries(SITE_CONTENT)) {
    await prisma.siteContent.upsert({
      where: { key },
      update: { value: value as object },
      create: { key, value: value as object },
    });
  }

  const counts = {
    users: await prisma.user.count(),
    categories: await prisma.serviceCategory.count(),
    services: await prisma.service.count(),
    options: await prisma.serviceOption.count(),
  };
  console.log('Seed complete:', counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
