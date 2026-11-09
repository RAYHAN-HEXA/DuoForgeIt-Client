/**
 * Customer walkthrough video. Loads only the poster until the visitor presses
 * play (`preload="none"`), so the homepage stays fast on mobile data.
 */
export function GuideVideo({
  src = '/guides/order-to-delivery.mp4',
  poster = '/guides/order-to-delivery-poster.jpg',
  title = 'How ordering works — from purchase to delivery',
  className,
}: {
  src?: string;
  poster?: string;
  title?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="group relative overflow-hidden rounded-2xl border border-primary/20 bg-black shadow-glow ring-1 ring-foreground/10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-px z-10 rounded-2xl bg-gradient-to-r from-primary/25 via-transparent to-brand-fuchsia/25 opacity-60 [mask:linear-gradient(#000,#000)_content-box,linear-gradient(#000,#000)] [mask-composite:exclude] [padding:1px]"
        />
        <video
          className="aspect-video w-full"
          controls
          playsInline
          preload="none"
          poster={poster}
          aria-label={title}
        >
          <source src={src} type="video/mp4" />
          Your browser does not support the video tag. <a href={src}>Download the walkthrough</a>.
        </video>
      </div>
    </div>
  );
}
