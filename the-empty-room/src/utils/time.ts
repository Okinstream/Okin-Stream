export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const pad = (n: number) => String(n).padStart(2, '0');

export function hhmm(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ddmm(d: Date): string {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

export function frenchDay(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Vrai si l'heure réelle locale est l'une des deux heures. */
export function isMirrorMinute(d = new Date()): boolean {
  const h = d.getHours();
  const m = d.getMinutes();
  return (h === 3 && m === 17) || (h === 17 && m === 3);
}
