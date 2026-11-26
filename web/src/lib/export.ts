import type { Note } from './types';

/** The note as Markdown: title as a heading, checklist items as task list items. */
export function toMarkdown(note: Note): string {
  const body =
    note.type === 'checklist' ? note.items.map((i) => `- [${i.done ? 'x' : ' '}] ${i.text}`).join('\n') : note.content;
  return (note.title ? `# ${note.title}\n\n${body}` : body).trimEnd() + '\n';
}

/** A safe file name from the note's title. */
export function fileName(note: Note, ext: string): string {
  const base = (note.title || note.content.split('\n')[0] || 'nota')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
    .toLowerCase();
  return `${base || 'nota'}.${ext}`;
}

export function download(name: string, text: string, type = 'text/markdown') {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function escape(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** Prints only the note, on a plain white page, from a hidden frame. */
export function printNote(note: Note) {
  const body =
    note.type === 'checklist'
      ? `<ul>${note.items.map((i) => `<li class="${i.done ? 'done' : ''}">${i.done ? '☑' : '☐'} ${escape(i.text)}</li>`).join('')}</ul>`
      : `<div class="text">${escape(note.content)}</div>`;
  const html = `<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><title>${escape(note.title || 'Nota')}</title>
<style>
  body { font: 12pt/1.5 system-ui, sans-serif; color: #000; margin: 2cm; }
  h1 { font-size: 18pt; margin: 0 0 12pt; }
  .text { white-space: pre-wrap; overflow-wrap: anywhere; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { padding: 2pt 0; }
  li.done { color: #666; text-decoration: line-through; }
</style></head><body>${note.title ? `<h1>${escape(note.title)}</h1>` : ''}${body}</body></html>`;
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
  frame.srcdoc = html;
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1000);
  };
  document.body.appendChild(frame);
}
