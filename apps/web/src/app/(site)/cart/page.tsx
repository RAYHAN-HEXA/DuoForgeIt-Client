'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowRight, Loader2, Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { formatBDT } from '@tsh/shared';
import { errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { Reveal } from '@/components/motion/reveal';
import { AuthPrompt } from '@/components/guards';
import { useAuth } from '@/hooks/use-auth';
import { useCart } from '@/hooks/use-cart';

export default function CartPage() {
  const { user, loading } = useAuth();
  const { cart, loading: cartLoading, updateItem, removeItem } = useCart();
  const router = useRouter();
  const [busyItem, setBusyItem] = useState<string | null>(null);

  if (loading) return <div className="flex-1" />;
  if (!user) return <AuthPrompt message="Sign in to see your cart — it follows you across devices." />;

  async function withBusy(id: string, fn: () => Promise<unknown>) {
    setBusyItem(id);
    try {
      await fn();
    } catch (err) {
      toast.error('Cart update failed', { description: errorMessage(err) });
    } finally {
      setBusyItem(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <Reveal>
        <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">Your cart</h1>
        <p className="mt-1 text-muted-foreground">Review your services before checkout.</p>
      </Reveal>

      {cartLoading && !cart ? (
        <div className="mt-8 space-y-4">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      ) : cart && cart.items.length > 0 ? (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            {cart.items.map((item) => (
              <Card key={item.id} className="card-lift hover:shadow-md">
                <CardContent className="p-5">
                  <div className="flex flex-col gap-4 sm:flex-row">
                    <div className="flex-1 space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">{item.service.deliveryDays}d base</Badge>
                          </div>
                          <h3 className="mt-1.5 font-semibold">{item.service.name}</h3>
                          <p className="text-sm text-muted-foreground">
                            {formatBDT(item.service.basePrice)} base
                            {item.options.length > 0 && ` · ${item.options.length} option${item.options.length > 1 ? 's' : ''}`}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => void withBusy(item.id, () => removeItem(item.id))}
                          aria-label={`Remove ${item.service.name}`}
                        >
                          {busyItem === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
                      </div>

                      {item.options.length > 0 && (
                        <ul className="space-y-1">
                          {item.options.map((o) => (
                            <li key={o.id} className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">{o.label}</span>
                              <span className="font-medium">
                                {Number(o.priceDelta) >= 0 ? '+' : ''}
                                {formatBDT(o.priceDelta)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}

                      <div className="space-y-2">
                        <textarea
                          value={item.requirements ?? ''}
                          placeholder="Requirements for this item (optional)…"
                          rows={2}
                          className="w-full resize-y rounded-lg border border-border/70 bg-transparent px-3 py-2 text-sm transition-shadow placeholder:text-muted-foreground focus-visible:border-primary/40 focus-visible:shadow-[0_0_0_4px_color-mix(in_oklch,var(--primary)_10%,transparent)] focus-visible:outline-none"
                          onBlur={(e) => {
                            if ((item.requirements ?? '') !== e.target.value) {
                              void withBusy(item.id, () => updateItem(item.id, { requirements: e.target.value || null }));
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-row items-center justify-between gap-4 border-t pt-3 sm:w-44 sm:flex-col sm:items-end sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon-sm"
                          disabled={item.quantity <= 1 || busyItem === item.id}
                          onClick={() => void withBusy(item.id, () => updateItem(item.id, { quantity: item.quantity - 1 }))}
                          aria-label="Decrease quantity"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <span key={item.quantity} className="animate-badge-pop w-8 text-center text-sm font-semibold">{item.quantity}</span>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          disabled={item.quantity >= 10 || busyItem === item.id}
                          onClick={() => void withBusy(item.id, () => updateItem(item.id, { quantity: item.quantity + 1 }))}
                          aria-label="Increase quantity"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">{formatBDT(item.unitPrice)} × {item.quantity}</p>
                        <p className="text-lg font-bold">{formatBDT(item.lineTotal)}</p>
                        <p className="text-xs text-muted-foreground">~{item.estimatedDays} days</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <Card className="card-lift border-primary/20 shadow-glow">
              <CardContent className="space-y-4 p-6">
                <h2 className="font-heading font-semibold">Order summary</h2>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal ({cart.items.length} item{cart.items.length > 1 ? 's' : ''})</span>
                    <span>{formatBDT(cart.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Additional charges</span>
                    <span>—</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-semibold">
                    <span>Total</span>
                    <span className="font-heading text-lg">{formatBDT(cart.total)}</span>
                  </div>
                </div>
                <Button size="lg" className="w-full" onClick={() => router.push('/checkout')}>
                  Proceed to checkout <ArrowRight className="h-4 w-4" />
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Payment happens after submission — pay via bKash/Nagad/bank and submit the transaction ID.
                </p>
              </CardContent>
            </Card>
          </aside>
        </div>
      ) : (
        <div className="mt-8">
          <EmptyState
            icon={ShoppingCart}
            title="Your cart is empty"
            description="Browse the marketplace and configure a service to get started."
            action={
              <Button asChild>
                <Link href="/services">Explore services</Link>
              </Button>
            }
          />
        </div>
      )}
    </div>
  );
}
