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
      <div className="group relative overflow-hidden rounded-2xl border bg-black shadow-lg ring-1 ring-foreground/10">
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
