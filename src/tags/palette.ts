import { makeHexColor } from '../domain/factories';
import { unwrap } from '../domain/result';
import type { HexColor } from '../domain/types';

export interface PaletteColor {
  readonly name: string;
  readonly color: HexColor;
}

function color(hex: string): HexColor {
  return unwrap(makeHexColor(hex));
}

/**
 * 16 pastel colors offered when creating a tag, hue-ordered, checked against `--tag-ink`
 * (`#1d1b18`) for a contrast ratio of at least 4.5:1. The file format accepts any `#rrggbb`, so a
 * hand edit can use a color outside this list; the app keeps it as-is.
 */
export const TAG_PALETTE: readonly PaletteColor[] = [
  { name: 'red', color: color('#f4b8b0') },
  { name: 'orange', color: color('#f6c9a4') },
  { name: 'amber', color: color('#f5d89a') },
  { name: 'yellow', color: color('#efe39a') },
  { name: 'lime', color: color('#d5e3a0') },
  { name: 'green', color: color('#b9dcb8') },
  { name: 'brown', color: color('#d9c3ad') },
  { name: 'gray', color: color('#cfcac2') },
  { name: 'teal', color: color('#a9dccf') },
  { name: 'cyan', color: color('#a6d8e6') },
  { name: 'sky', color: color('#aacbee') },
  { name: 'blue', color: color('#b3bdee') },
  { name: 'indigo', color: color('#c4b8ea') },
  { name: 'violet', color: color('#d8b8e6') },
  { name: 'pink', color: color('#f0b8d6') },
  { name: 'rose', color: color('#f2bcc4') },
];
