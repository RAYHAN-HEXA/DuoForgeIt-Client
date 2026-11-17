/** Pure playback policy for the homepage hero background video. */

export type HeroVideoPlaybackInput = {
  /** Visitor prefers reduced motion — no automatic motion without opt-in. */
  prefersReducedMotion: boolean;
  /** Visitor explicitly pressed Play (also used to opt in under reduced motion). */
  explicitPlay: boolean;
  /** Visitor pressed Pause; this wins over viewport/tab transitions. */
  manuallyPaused: boolean;
  /** Hero intersects the viewport. */
  inView: boolean;
  /** Browser tab is active. */
  tabVisible: boolean;
  /** Source failed to load — keep the static fallback. */
  videoFailed: boolean;
};

export function shouldPlayHeroVideo(input: HeroVideoPlaybackInput): boolean {
  if (input.videoFailed || input.manuallyPaused || !input.inView || !input.tabVisible) {
    return false;
  }
  if (input.prefersReducedMotion && !input.explicitPlay) {
    return false;
  }
  return true;
}

export function heroVideoControlLabel(isPlaying: boolean): string {
  return isPlaying ? 'Pause background video' : 'Play background video';
}
