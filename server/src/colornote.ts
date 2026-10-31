import { createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { COLORS, type ChecklistItem, type Color } from './notes.ts';

/**
 * Reader for ColorNote ("Notepad Notes" for Android) backup files.
 *
 * The format is undocumented. What is known from community reverse
 * engineering (olejorgenb/ColorNote-backup-decryptor and derivatives):
 * - AES-128-CBC, key and IV derived OpenSSL-style (EVP_BytesToKey, MD5, one
 *   round) from the backup password (default "0000") and the salt
 *   "ColorNote Fixed Salt".
 * - Newer backups have a 28-byte header before the ciphertext; older ones none.
 * - The plaintext is a stream of JSON note records with some binary framing
 *   in between, so records are located by scanning for JSON objects.
 */

const SALT = Buffer.from('ColorNote Fixed Salt');
const OFFSETS = [28, 0];

/** ColorNote's palette order. Users can remap colours in the import dialog. */
export const DEFAULT_COLOR_MAP: Record<number, Color> = {
  0: 'yellow',
  1: 'red',
  2: 'orange',
  3: 'yellow',
  4: 'green',
  5: 'blue',
  6: 'purple',
  7: 'gray',
  8: 'gray',
  9: 'white',
};

export class ColorNoteError extends Error {}

export interface ColorNoteRecord {
  source_id: string;
  title: string;
  type: 'text' | 'checklist';
  content: string;
  items: ChecklistItem[];
  color_index: number;
  archived: boolean;
  created_at: number;
  updated_at: number;
}

function deriveKey(password: string): { key: Buffer; iv: Buffer } {
  const pass = Buffer.from(password, 'utf8');
  const key = createHash('md5').update(pass).update(SALT).digest();
  const iv = createHash('md5').update(key).update(pass).update(SALT).digest();
  return { key, iv };
}

function decrypt(data: Buffer, password: string, offset: number): Buffer | null {
  const body = data.subarray(offset);
  if (body.length === 0 || body.length % 16 !== 0) return null;
  const { key, iv } = deriveKey(password);
  try {
    const decipher = createDecipheriv('aes-128-cbc', key, iv);
    return Buffer.concat([decipher.update(body), decipher.final()]);
  } catch {
    return null;
  }
}

/** Builds a backup in the same format. Only used by tests. */
export function encryptForTest(plain: Buffer, password = '0000', header = Buffer.alloc(28)): Buffer {
  const { key, iv } = deriveKey(password);
  const cipher = createCipheriv('aes-128-cbc', key, iv);
  return Buffer.concat([header, cipher.update(plain), cipher.final()]);
}

/** Finds every top-level JSON object in a string that may contain binary noise. */
function scanJsonObjects(text: string): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  let i = text.indexOf('{');
  while (i !== -1) {
    let depth = 0;
    let inString = false;
    let end = -1;
    for (let j = i; j < text.length; j++) {
      const ch = text[j];
      if (inString) {
        if (ch === '\\') j++;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) {
        end = j;
        break;
      }
    }
    if (end === -1) break;
    try {
      const value = JSON.parse(text.slice(i, end + 1));
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        found.push(value);
        i = text.indexOf('{', end + 1);
        continue;
      }
    } catch {
      /* not a record: try the next brace */
    }
    i = text.indexOf('{', i + 1);
  }
  return found;
}

const CHECK_RE = /^\[( |V|v|x|X)\]\s?(.*)$/;

function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

function toRecord(raw: Record<string, unknown>, index: number): ColorNoteRecord | null {
  const title = typeof raw.title === 'string' ? raw.title : '';
  const body = typeof raw.note === 'string' ? raw.note : '';
  if (!('note' in raw) && !('title' in raw)) return null;
  if (!title.trim() && !body.trim()) return null;

  const lines = body.split(/\r?\n/);
  const nonEmpty = lines.filter((l) => l.trim());
  const looksLikeChecklist = nonEmpty.length > 0 && nonEmpty.every((l) => CHECK_RE.test(l));
  const isChecklist = num(raw.type) === 16 || looksLikeChecklist;

  const items: ChecklistItem[] = [];
  if (isChecklist) {
    nonEmpty.forEach((line, i) => {
      const match = CHECK_RE.exec(line);
      items.push({
        id: `cn${index}i${i}`,
        text: match ? match[2] : line,
        done: match ? match[1] !== ' ' : false,
      });
    });
  }

  const created = num(raw.created_date, Date.now());
  const modified = num(raw.modified_date, created);
  const rawId = String(raw.uuid ?? raw._id ?? `${created}-${index}`);
  return {
    source_id: rawId,
    title,
    type: isChecklist ? 'checklist' : 'text',
    content: isChecklist ? '' : body,
    items,
    color_index: num(raw.color_index),
    archived: num(raw.space) === 16,
    created_at: created,
    updated_at: Math.max(modified, num(raw.minor_modified_date, 0)),
  };
}

/** Decrypts and parses a ColorNote backup. Also accepts an already decrypted JSON export. */
export function parseColorNote(data: Buffer, password = '0000'): ColorNoteRecord[] {
  const candidates: Buffer[] = [];
  const asText = data.toString('utf8');
  if (/^\s*[[{]/.test(asText)) candidates.push(data);
  for (const offset of OFFSETS) {
    const plain = decrypt(data, password, offset);
    if (plain) candidates.push(plain);
  }

  for (const plain of candidates) {
    const raws = scanJsonObjects(plain.toString('utf8'));
    // Keep the newest copy of each note.
    const byId = new Map<string, ColorNoteRecord>();
    raws.forEach((raw, i) => {
      const record = toRecord(raw, i);
      if (!record) return;
      const previous = byId.get(record.source_id);
      if (!previous || previous.updated_at <= record.updated_at) byId.set(record.source_id, record);
    });
    if (byId.size) return [...byId.values()];
  }
  throw new ColorNoteError(
    'Não foi possível ler o backup. Confirma a password (por omissão é 0000) e que o ficheiro é um backup do ColorNote.',
  );
}

export function colorFor(index: number, map: Partial<Record<number, string>> = {}): Color {
  const chosen = map[index];
  if (chosen && (COLORS as readonly string[]).includes(chosen)) return chosen as Color;
  return DEFAULT_COLOR_MAP[index] ?? 'yellow';
}

/** Turns a ColorNote id into an id this app accepts, stable across re-imports. */
export function noteIdFor(sourceId: string): string {
  const clean = sourceId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 56);
  return `cn-${clean || createHash('sha1').update(sourceId).digest('hex').slice(0, 20)}`;
}
