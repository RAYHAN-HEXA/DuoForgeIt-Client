'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { heroVideoControlLabel, heroVideoMuteLabel, shouldPlayHeroVideo } from './hero-video-playback';

const VIDEO_SRC = '/videos/hero-background.mp4';
const POSTER_SRC = '/videos/hero-poster.webp';

/**
 * Cinematic, decorative background video for the homepage hero.
 *
 * The poster + navy gradient live beneath the video, so the hero is never
 * blank: before the first frame, when autoplay is blocked, when the visitor
 * prefers reduced motion, and if the source fails to load.
 */
export function HeroVideo({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [explicitPlay, setExplicitPlay] = useState(false);
  const [manuallyPaused, setManuallyPaused] = useState(false);
  const [inView, setInView] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);
  const [videoFailed, setVideoFailed] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  // Autoplay must start muted (browser policy); visitors unmute via the button.
  const [soundOn, setSoundOn] = useState(false);

  // All browser reads happen in effects, so server and first client render agree.
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setPrefersReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const update = () => setTabVisible(!document.hidden);
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.15,
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const syncPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const shouldPlay = shouldPlayHeroVideo({
      prefersReducedMotion,
      explicitPlay,
      manuallyPaused,
      inView,
      tabVisible,
      videoFailed,
    });

    if (!shouldPlay) {
      if (!video.paused) video.pause();
      return;
    }

    if (!video.paused) return;
    // Muting must happen before play() for autoplay policies to allow it.
    video.muted = !soundOn;
    const attempt = video.play();
    // Autoplay can still be rejected by the browser; the poster remains and
    // the play/pause button reflects the real state via onPlay/onPause.
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch(() => undefined);
    }
  }, [prefersReducedMotion, explicitPlay, manuallyPaused, inView, tabVisible, videoFailed, soundOn]);

  useEffect(() => {
    syncPlayback();
  }, [syncPlayback]);

  const togglePlayback = () => {
    if (videoFailed) return;
    const video = videoRef.current;
    if (!video) return;

    if (!video.paused) {
      setManuallyPaused(true);
      setExplicitPlay(false);
      video.pause();
      return;
    }

    setManuallyPaused(false);
    setExplicitPlay(true);
    video.muted = !soundOn;
    const attempt = video.play();
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch(() => undefined);
    }
  };

  // Unmuting inside the click gesture is what browser autoplay policies allow.
  const toggleSound = () => {
    const video = videoRef.current;
    if (!video) return;
    const next = !soundOn;
    setSoundOn(next);
    video.muted = !next;
  };

  const showVideo = !videoFailed && (!prefersReducedMotion || explicitPlay);

  return (
    <>
      <div ref={containerRef} aria-hidden="true" className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
        {/* Static fallback: present before the first frame and whenever motion is off. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-space-deep bg-cover bg-center"
          style={{ backgroundImage: `url(${POSTER_SRC})` }}
        />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-space-deep/55 via-space-deep/25 to-[#030B14]/75" />

        {!videoFailed && (
          <video
            ref={videoRef}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster={POSTER_SRC}
            tabIndex={-1}
            disablePictureInPicture
            data-user-opted-in={explicitPlay ? 'true' : 'false'}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onError={() => setVideoFailed(true)}
            className={cn(
              'hero-video-media absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-500',
              showVideo ? 'opacity-100' : 'opacity-0',
            )}
          >
            <source src={VIDEO_SRC} type="video/mp4" onError={() => setVideoFailed(true)} />
          </video>
        )}
      </div>

      {!videoFailed && (
        <>
          <button
            type="button"
            onClick={toggleSound}
            aria-label={heroVideoMuteLabel(soundOn)}
            className="absolute bottom-6 right-[4.25rem] z-20 flex h-11 w-11 items-center justify-center rounded-full border border-soft-blue/25 bg-panel/85 text-foreground shadow-soft backdrop-blur transition-colors hover:bg-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-space-deep sm:bottom-8 sm:right-[4.75rem]"
          >
            {soundOn ? <Volume2 className="h-4 w-4" aria-hidden="true" /> : <VolumeX className="h-4 w-4" aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={togglePlayback}
            aria-label={heroVideoControlLabel(isPlaying)}
            className="absolute bottom-6 right-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-soft-blue/25 bg-panel/85 text-foreground shadow-soft backdrop-blur transition-colors hover:bg-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-space-deep sm:bottom-8 sm:right-6"
          >
            {isPlaying ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
          </button>
        </>
      )}
    </>
  );
}
