import type { PlayDiv } from './types';

export const slug = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
export const uniq = <T,>(arr: T[]) => Array.from(new Set(arr));
export const clampN = (n: number, min: number) => isFinite(n) ? Math.max(min, Math.floor(n)) : min;

export const shuffle = <T,>(arr: T[], seed?: number) => {
  const a = arr.slice();
  let r = seed ?? Math.floor(Math.random() * 1e9);
  const rand = () => (r = (r * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const UPPER_COURTS = [1, 2, 3, 4, 5];
export const LOWER_COURTS = [6, 7, 8, 9, 10];

export const courtFor = (division: PlayDiv, round: number, slot: number) => {
  const pool = division === 'UPPER' ? UPPER_COURTS : LOWER_COURTS;
  return pool[(slot - 1) % pool.length];
};

export function parseScore(text?: string): [number, number] | null {
  if (!text) return null;
  const m = String(text).trim().match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (!m) return null;
  const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
  if (!isFinite(a) || !isFinite(b)) return null;
  return [a, b];
}

export function isValidDoublesScore(a: number, b: number) {
  const diff = Math.abs(a - b);
  const max = Math.max(a, b);
  return max >= 21 && diff >= 2;
}

export function isValidQuadsScore(a: number, b: number) {
  const diff = Math.abs(a - b);
  const max = Math.max(a, b);
  return max >= 21 && max <= 25 && diff >= 2;
}

export function isValidTriplesScore(a: number, b: number) {
  const diff = Math.abs(a - b);
  const max = Math.max(a, b);
  return max >= 21 && diff >= 2;
}

export function nextPow2(n: number) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}
