import type { HomepageDto, Paginated, ServiceDto } from '@tsh/shared';
import { prisma } from '../config/prisma.js';
import { toServiceDto } from '../utils/mappers.js';

const serviceInclude = {
  category: true,
  options: { orderBy: { displayOrder: 'asc' as const } },
};

export async function getHomepage(): Promise<HomepageDto> {
  const [categories, featured, founders, testimonials, portfolio, contentRows] =
    await Promise.all([
      prisma.serviceCategory.findMany({
        where: { isActive: true },
        orderBy: { displayOrder: 'asc' },
        select: { id: true, slug: true, name: true, description: true },
      }),
      prisma.service.findMany({
        where: { isActive: true, isFeatured: true },
        orderBy: { displayOrder: 'asc' },
        include: serviceInclude,
      }),
      prisma.founderProfile.findMany({
        where: { isSelectable: true },
        orderBy: { displayOrder: 'asc' },
      }),
      prisma.testimonial.findMany({
        where: { isPublic: true },
        orderBy: { displayOrder: 'asc' },
      }),
      prisma.portfolioProject.findMany({
        where: { isPublic: true },
        orderBy: { displayOrder: 'asc' },
      }),
      prisma.siteContent.findMany(),
    ]);

  const content: Record<string, unknown> = {};
  for (const row of contentRows) content[row.key] = row.value;

  return {
    categories,
    featuredServices: featured.map((s) => toServiceDto(s)),
    founders: founders.map((f) => ({
      id: f.id,
      displayName: f.displayName,
      title: f.title,
      bio: f.bio,
      photoUrl: f.photoUrl,
      skills: f.skills,
      discipline: f.discipline,
      isSelectable: f.isSelectable,
    })),
    testimonials: testimonials.map((t) => ({
      id: t.id,
      authorName: t.authorName,
      authorTitle: t.authorTitle,
      quote: t.quote,
      avatarUrl: t.avatarUrl,
      rating: t.rating,
    })),
    portfolio: portfolio.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      imageUrl: p.imageUrl,
      projectUrl: p.projectUrl,
    })),
    content,
  };
}

export type ServiceListParams = {
  search?: string;
  categorySlug?: string;
  sort?: 'popular' | 'price_asc' | 'price_desc' | 'newest';
  page: number;
  pageSize: number;
};

export async function listServices(params: ServiceListParams): Promise<Paginated<ServiceDto>> {
  const where = {
    isActive: true,
    ...(params.categorySlug ? { category: { slug: params.categorySlug, isActive: true } } : {}),
    ...(params.search
      ? {
          OR: [
            { name: { contains: params.search, mode: 'insensitive' as const } },
            { tagline: { contains: params.search, mode: 'insensitive' as const } },
            { description: { contains: params.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const orderBy = {
    popular: [{ isFeatured: 'desc' as const }, { displayOrder: 'asc' as const }],
    price_asc: [{ basePrice: 'asc' as const }],
    price_desc: [{ basePrice: 'desc' as const }],
    newest: [{ createdAt: 'desc' as const }],
  }[params.sort ?? 'popular']!;

  const [total, rows] = await Promise.all([
    prisma.service.count({ where }),
    prisma.service.findMany({
      where,
      orderBy,
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: serviceInclude,
    }),
  ]);

  return {
    items: rows.map(toServiceDto),
    page: params.page,
    pageSize: params.pageSize,
    total,
  };
}

export async function findServiceBySlug(slug: string): Promise<ServiceDto | null> {
  const service = await prisma.service.findFirst({
    where: { slug, isActive: true },
    include: serviceInclude,
  });
  return service ? toServiceDto(service) : null;
}

export async function listActiveCategories() {
  return prisma.serviceCategory.findMany({
    where: { isActive: true },
    orderBy: { displayOrder: 'asc' },
    select: { id: true, slug: true, name: true, description: true },
  });
}
