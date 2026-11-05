import { BookOpen, Code2, Cpu, Globe, Laptop, Lightbulb, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Maps a ServiceCategory.iconKey (seeded with the lucide name) to its icon.
 * Unknown keys fall back to Wrench so admin-created categories never crash.
 */
const ICONS: Record<string, LucideIcon> = {
  Globe,
  Code2,
  BookOpen,
  Cpu,
  Laptop,
  Lightbulb,
  Wrench,
};

export function CategoryIcon({ iconKey, className }: { iconKey: string | null | undefined; className?: string }) {
  const Icon = (iconKey && ICONS[iconKey]) || Wrench;
  return <Icon className={className} aria-hidden="true" />;
}
