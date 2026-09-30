export const isTouch = () =>
  typeof window !== 'undefined' && window.matchMedia('(hover: none), (pointer: coarse)').matches;

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function guessLowQuality(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (nav.connection?.saveData) return true;
  if ((nav.deviceMemory ?? 8) <= 4) return true;
  return (nav.hardwareConcurrency ?? 8) <= 4;
}

export function setFavicon(href: string) {
  const link = document.getElementById('icon') as HTMLLinkElement | null;
  if (link && !link.href.endsWith(href)) link.href = href;
}
