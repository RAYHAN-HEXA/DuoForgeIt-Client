'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Shuffle, Wand2 } from 'lucide-react';
import type { FounderDto } from '@tsh/shared';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

/**
 * Dual-founder selection (PRD §7 — the platform's differentiator).
 * Click a card OR drag the central knob onto a card; AUTO_ASSIGN sits above.
 * The choice is a *preference* — admins can still reassign (enforced server-side).
 */
export type FounderChoice = 'FOUNDER_A' | 'FOUNDER_B' | 'AUTO_ASSIGN';

export function FounderPicker({
  founders,
  value,
  onChange,
}: {
  founders: FounderDto[];
  value: FounderChoice;
  onChange: (choice: FounderChoice) => void;
}) {
  const reduceMotion = useReducedMotion();

  const a = founders.find((f) => f.discipline === 'WEB_SOFTWARE_ECOMMERCE') ?? founders[0];
  const b = founders.find((f) => f.discipline === 'DESIGN_DOCS_UX' && f.id !== a?.id) ?? founders[1];

  if (!a || !b) return null;

  const isSelected = (f: FounderDto) => (f === a ? value === 'FOUNDER_A' : value === 'FOUNDER_B');

  const cardFor = (f: FounderDto, lead: string) => {
    const selected = isSelected(f);
    return (
      <button
        type="button"
        onClick={() => onChange(f === a ? 'FOUNDER_A' : 'FOUNDER_B')}
        aria-pressed={selected}
        className={cn(
          'relative flex-1 rounded-xl border p-5 text-left transition-all',
          selected
            ? 'border-primary bg-primary/5 shadow-md ring-2 ring-primary/20'
            : 'bg-card hover:border-primary/40 hover:shadow-sm',
        )}
      >
        {selected && <Badge className="absolute -top-2.5 right-4">Your lead</Badge>}
        <div className="flex items-center gap-3">
          <Avatar className={cn('h-14 w-14 border-2', selected ? 'border-primary' : 'border-border')}>
            <AvatarImage src={f.photoUrl ?? undefined} alt="" />
            <AvatarFallback className="bg-primary/10 font-bold text-primary">
              {f.displayName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold">{f.displayName}</p>
            <p className="text-xs text-primary">{f.title}</p>
          </div>
        </div>
        <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{f.bio}</p>
        <div className="mt-3 flex flex-wrap gap-1">
          {f.skills.slice(0, 4).map((s) => (
            <Badge key={s} variant="secondary" className="text-[11px] font-normal">
              {s}
            </Badge>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{lead}</p>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {/* Auto-assign */}
      <button
        type="button"
        onClick={() => onChange('AUTO_ASSIGN')}
        aria-pressed={value === 'AUTO_ASSIGN'}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-all',
          value === 'AUTO_ASSIGN'
            ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
            : 'bg-card hover:border-primary/40',
        )}
      >
        <span
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg',
            value === 'AUTO_ASSIGN' ? 'bg-primary text-primary-foreground' : 'bg-muted',
          )}
        >
          <Wand2 className="h-5 w-5" />
        </span>
        <span>
          <span className="block text-sm font-semibold">Let us pick the best fit</span>
          <span className="block text-xs text-muted-foreground">
            We assign automatically based on your project type — you can request a change later.
          </span>
        </span>
        {value === 'AUTO_ASSIGN' && <Badge className="ml-auto">Selected</Badge>}
      </button>

      {/* Two cards + draggable knob */}
      <div className="relative">
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-10">
          {cardFor(a, 'Specializes in web, software & e-commerce projects')}
          {cardFor(b, 'Specializes in presentations, docs & academic projects')}
        </div>

        {/* Draggable selector (sm+): fling it toward the founder you want */}
        <div className="pointer-events-none absolute inset-y-3 left-1/2 hidden w-0.5 -translate-x-1/2 sm:block" aria-hidden="true">
          <motion.button
            type="button"
            drag="x"
            dragSnapToOrigin
            dragElastic={0.25}
            onDragEnd={(_, info) => {
              if (Math.abs(info.offset.x) < 12) return; // treat as tap → no-op
              onChange(info.offset.x > 0 ? 'FOUNDER_B' : 'FOUNDER_A');
            }}
            whileDrag={reduceMotion ? undefined : { scale: 1.15 }}
            whileHover={reduceMotion ? undefined : { scale: 1.08 }}
            className="pointer-events-auto absolute -top-2 left-1/2 flex h-11 w-11 -translate-x-1/2 cursor-grab items-center justify-center rounded-full border-2 bg-background text-primary shadow-lg active:cursor-grabbing"
            aria-label="Drag toward the founder you want, or tap a card"
          >
            <Shuffle className="h-4 w-4" />
          </motion.button>
        </div>
      </div>
    </div>
  );
}
