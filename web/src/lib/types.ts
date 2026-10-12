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
}

export type View = 'notes' | 'archive' | 'trash';
export type SortMode = 'updated' | 'created' | 'color' | 'title';
export type Layout = 'grid' | 'list';
export type Theme = 'auto' | 'light' | 'dark';
