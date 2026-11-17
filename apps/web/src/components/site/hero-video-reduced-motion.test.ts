import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('hero video reduced-motion safeguard', () => {
  it('hides the video by CSS until the visitor explicitly opts in', () => {
    // CSS applies before hydration, so no frame of motion is shown to
    // reduced-motion visitors while React effects are still reconciling.
    const css = readFileSync('src/app/globals.css', 'utf8');
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(css).toMatch(/\.hero-video-media:not\(\[data-user-opted-in='true'\]\)/);
  });
});
