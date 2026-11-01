import type { Note } from '../src/notes.ts';

export function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'n1',
    type: 'text',
    title: 'Título',
    content: 'Conteúdo',
    items: [],
    color: 'yellow',
    pinned: false,
    archived: false,
    deleted_at: null,
    created_at: 1000,
    updated_at: 1000,
    ...overrides,
  };
}
