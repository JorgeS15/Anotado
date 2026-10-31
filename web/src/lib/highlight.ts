import { normalize } from './util';

export interface Segment {
  text: string;
  match: boolean;
}

/** Splits `text` into matching / non-matching parts for `query`, ignoring case and accents. */
export function highlight(text: string, query: string): Segment[] {
  const q = normalize(query.trim());
  if (!q || !text) return [{ text, match: false }];

  // Normalise character by character, remembering where each normalised char came from.
  const chars = [...text];
  let norm = '';
  const origin: number[] = []; // index into `chars` for every UTF-16 unit of `norm`
  chars.forEach((ch, i) => {
    for (const unit of normalize(ch)) {
      norm += unit;
      origin.push(i);
    }
  });

  const segments: Segment[] = [];
  let cursor = 0; // in `chars`
  let from = norm.indexOf(q);
  while (from !== -1) {
    const start = origin[from];
    const end = origin[from + q.length - 1] + 1;
    if (start > cursor) segments.push({ text: chars.slice(cursor, start).join(''), match: false });
    segments.push({ text: chars.slice(start, end).join(''), match: true });
    cursor = end;
    from = norm.indexOf(q, from + q.length);
  }
  if (cursor < chars.length) segments.push({ text: chars.slice(cursor).join(''), match: false });
  return segments;
}
