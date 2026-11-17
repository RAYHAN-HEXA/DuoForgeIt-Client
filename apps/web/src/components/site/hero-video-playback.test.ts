import { describe, expect, it } from 'vitest';
import { heroVideoControlLabel, shouldPlayHeroVideo, type HeroVideoPlaybackInput } from './hero-video-playback';

const ALLOWED: HeroVideoPlaybackInput = {
  prefersReducedMotion: false,
  explicitPlay: false,
  manuallyPaused: false,
  inView: true,
  tabVisible: true,
  videoFailed: false,
};

describe('shouldPlayHeroVideo', () => {
  it('allows playback when the hero is visible and nothing blocks it', () => {
    expect(shouldPlayHeroVideo(ALLOWED)).toBe(true);
  });

  it('blocks automatic playback when reduced motion is preferred', () => {
    expect(shouldPlayHeroVideo({ ...ALLOWED, prefersReducedMotion: true })).toBe(false);
  });

  it('allows playback under reduced motion after an explicit opt-in', () => {
    expect(shouldPlayHeroVideo({ ...ALLOWED, prefersReducedMotion: true, explicitPlay: true })).toBe(true);
  });

  it('keeps a manual pause through otherwise-perfect conditions', () => {
    expect(shouldPlayHeroVideo({ ...ALLOWED, manuallyPaused: true })).toBe(false);
  });

  it('blocks playback while the hero is outside the viewport', () => {
    expect(shouldPlayHeroVideo({ ...ALLOWED, inView: false })).toBe(false);
  });

  it('blocks playback while the browser tab is hidden', () => {
    expect(shouldPlayHeroVideo({ ...ALLOWED, tabVisible: false })).toBe(false);
  });

  it('blocks playback permanently after the video fails to load', () => {
    expect(shouldPlayHeroVideo({ ...ALLOWED, videoFailed: true })).toBe(false);
  });
});

describe('heroVideoControlLabel', () => {
  it('offers Pause while the video is playing', () => {
    expect(heroVideoControlLabel(true)).toBe('Pause background video');
  });

  it('offers Play while the video is paused', () => {
    expect(heroVideoControlLabel(false)).toBe('Play background video');
  });
});
