export const COLORS = ['yellow', 'orange', 'red', 'pink', 'purple', 'blue', 'green', 'gray', 'white'] as const;
export type Color = (typeof COLORS)[number];

export const COLOR_LABELS: Record<Color, string> = {
  yellow: 'Amarelo',
  orange: 'Laranja',
  red: 'Vermelho',
  pink: 'Rosa',
  purple: 'Roxo',
  blue: 'Azul',
  green: 'Verde',
  gray: 'Cinzento',
  white: 'Branco',
};

export type NoteType = 'text' | 'checklist';

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Note {
  id: string;
  type: NoteType;
  title: string;
  content: string;
  items: ChecklistItem[];
  color: Color;
  pinned: boolean;
  archived: boolean;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
  /** Local only: the server `updated_at` this device last saw for the note. */
  synced?: number;
}

export interface NoteVersion {
  id: number;
  saved_at: number;
  note: Note;
}

export interface ColorNoteRecord {
  source_id: string;
  title: string;
  type: NoteType;
  content: string;
  items: ChecklistItem[];
  color_index: number;
  archived: boolean;
  created_at: number;
  updated_at: number;
}

export interface ColorNotePreview {
  records: ColorNoteRecord[];
  colors: { index: number; count: number; samples: string[]; suggested: Color }[];
}

export type View = 'notes' | 'archive' | 'trash';
export type SortMode = 'updated' | 'created' | 'color' | 'title';
export type Layout = 'grid' | 'list';
export type Theme = 'auto' | 'light' | 'dark';

export interface Template {
  id: string;
  name: string;
  type: NoteType;
  title: string;
  content: string;
  items: string[];
  color: Color;
}

export interface Settings {
  /** A name for each colour, e.g. green = "Compras". */
  color_names: Partial<Record<Color, string>>;
  templates: Template[];
}

export interface BackupInfo {
  name: string;
  size: number;
  created_at: number;
}

export interface UpdateInfo {
  version: string;
  url: string;
}

export interface ServerStatus {
  version: string;
  update: UpdateInfo | null;
  notes: number;
  archived: number;
  trashed: number;
  db_size: number;
  trash_days: number;
  api_token: boolean;
  backups: BackupInfo[];
}

export type FontSize = 'small' | 'normal' | 'large';
