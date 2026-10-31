<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { autogrow } from '../lib/autogrow';
  import { now } from '../lib/clock';
  import { store } from '../lib/store.svelte';
  import type { Color, Note } from '../lib/types';
  import { findLinks, formatFull, isEmpty, itemsToText, textToItems, uid } from '../lib/util';
  import Checklist from './Checklist.svelte';
  import History from './History.svelte';
  import ColorPicker from './ColorPicker.svelte';
  import Icon from './Icon.svelte';
  import Popover from './Popover.svelte';

  let {
    id,
    draft,
    onclose,
    onopen,
    notify,
  }: {
    id: string;
    draft?: Note;
    onclose: () => void;
    /** Opens another note in place of this one. */
    onopen: (id: string) => void;
    notify: (message: string, undo?: () => void) => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  let local = $state<Note | undefined>(draft);
  const note = $derived(store.notes[id] ?? local);
  const trashed = $derived(note?.deleted_at != null);
  const links = $derived(note?.type === 'text' ? findLinks(note.content) : []);

  let contentEl = $state<HTMLTextAreaElement>();
  let colorOpen = $state(false);
  let moreOpen = $state(false);
  let historyOpen = $state(false);

  onMount(async () => {
    if (!draft) return;
    await tick();
    if (draft.type === 'text') contentEl?.focus();
    else document.querySelector<HTMLTextAreaElement>(`[data-item="${draft.items[0]?.id}"]`)?.focus();
  });

  function changed() {
    if (!note) return;
    // Don't create anything on the server until the new note has content.
    if (!store.notes[id] && isEmpty(note)) return;
    store.put(note);
  }

  /** Cleans up the note when the editor closes. Called by the parent. */
  export function finish() {
    if (!note || trashed) return;
    if (isEmpty(note)) {
      if (store.notes[id]) store.discard(id);
      return;
    }
    const filled = note.items.filter((i) => i.text.trim());
    const cleaned = filled.length !== note.items.length;
    if (cleaned) note.items = filled;
    // A note created with content (e.g. shared from another app) is saved even if untouched.
    if (cleaned || !store.notes[id]) changed();
    store.persistNow();
  }

  function setColor(color: Color) {
    if (!note) return;
    note.color = color;
    changed();
    colorOpen = false;
  }

  function togglePin() {
    if (!note) return;
    note.pinned = !note.pinned;
    changed();
  }

  function convert() {
    if (!note) return;
    if (note.type === 'text') {
      note.items = textToItems(note.content);
      note.content = '';
      note.type = 'checklist';
    } else {
      note.content = itemsToText(note.items);
      note.items = [];
      note.type = 'text';
    }
    changed();
  }

  function toggleArchive() {
    if (!note || isEmpty(note)) return;
    // Capture the id: props are gone once the editor is closed.
    const noteId = id;
    const archived = !note.archived;
    note.archived = archived;
    changed();
    onclose();
    notify(archived ? 'Nota arquivada' : 'Nota desarquivada', () => store.update(noteId, { archived: !archived }));
  }

  function moveToTrash() {
    if (!note) return;
    if (isEmpty(note)) {
      onclose();
      return;
    }
    const noteId = id;
    note.deleted_at = now();
    changed();
    onclose();
    notify('Nota movida para o lixo', () => store.update(noteId, { deleted_at: null }));
  }

  function restore() {
    if (!note) return;
    note.deleted_at = null;
    changed();
    onclose();
    notify('Nota restaurada');
  }

  function deleteForever() {
    if (!confirm('Apagar esta nota para sempre?')) return;
    const noteId = id;
    store.purge(noteId);
    onclose();
    notify('Nota apagada');
  }

  function asText(n: Note) {
    const body =
      n.type === 'checklist' ? n.items.map((i) => `${i.done ? '☑' : '☐'} ${i.text}`).join('\n') : n.content;
    return n.title ? `${n.title}\n\n${body}` : body;
  }

  async function share() {
    if (!note) return;
    const text = asText(note);
    if (navigator.share) {
      try {
        await navigator.share({ title: note.title || undefined, text });
        return;
      } catch (err) {
        if ((err as DOMException).name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      notify('Nota copiada para a área de transferência');
    } catch {
      notify('Não foi possível partilhar a nota');
    }
  }

  function duplicate() {
    if (!note || isEmpty(note)) return;
    const copy = $state.snapshot(note) as Note;
    const time = now();
    const dup: Note = {
      ...copy,
      id: uid(),
      items: copy.items.map((i) => ({ ...i, id: uid() })),
      pinned: false,
      created_at: time,
      updated_at: time,
      synced: undefined,
    };
    store.put(dup, false);
    onopen(dup.id);
    notify('Nota duplicada');
  }

  function hostname(url: string) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }
</script>

{#if note}
  <div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
    <div class="editor scroll" style:--note="var(--note-{note.color})" role="dialog" aria-label="Editar nota">
      <header>
        <button class="icon-btn" onclick={onclose} aria-label="Voltar"><Icon name="back" /></button>
        <span class="spacer"></span>
        {#if trashed}
          <button class="icon-btn" onclick={restore} title="Restaurar"><Icon name="restore" /></button>
          <button class="icon-btn" onclick={deleteForever} title="Apagar para sempre"><Icon name="trash" /></button>
        {:else}
          <button class="icon-btn" class:active={note.pinned} onclick={togglePin} title={note.pinned ? 'Desafixar' : 'Fixar'}>
            <Icon name="pin" />
          </button>
          <Popover bind:open={colorOpen}>
            {#snippet trigger(toggle)}
              <button class="icon-btn" onclick={toggle} title="Cor"><Icon name="palette" /></button>
            {/snippet}
            {#snippet children()}
              <div class="picker"><ColorPicker value={note.color} onpick={setColor} /></div>
            {/snippet}
          </Popover>
          <Popover bind:open={moreOpen}>
            {#snippet trigger(toggle)}
              <button class="icon-btn" onclick={toggle} title="Mais opções"><Icon name="more" /></button>
            {/snippet}
            {#snippet children(close)}
              <button class="item" onclick={() => (close(), convert())}>
                <Icon name={note.type === 'text' ? 'checklist' : 'text'} />
                {note.type === 'text' ? 'Converter em checklist' : 'Converter em texto'}
              </button>
              <button class="item" onclick={() => (close(), share())}><Icon name="share" /> Partilhar</button>
              <button class="item" onclick={() => (close(), duplicate())}><Icon name="copy" /> Duplicar</button>
              <button class="item" onclick={() => (close(), (historyOpen = true))}>
                <Icon name="history" /> Histórico
              </button>
              <button class="item" onclick={() => (close(), toggleArchive())}>
                <Icon name={note.archived ? 'unarchive' : 'archive'} />
                {note.archived ? 'Desarquivar' : 'Arquivar'}
              </button>
              <button class="item danger" onclick={() => (close(), moveToTrash())}>
                <Icon name="trash" /> Mover para o lixo
              </button>
            {/snippet}
          </Popover>
        {/if}
      </header>

      <div class="body">
        {#if trashed}
          <p class="banner">Esta nota está no lixo. Restaura-a para a editar.</p>
        {/if}
        <input
          class="title"
          placeholder="Título"
          bind:value={note.title}
          oninput={changed}
          readonly={trashed}
          onkeydown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (note.type === 'text') contentEl?.focus();
            }
          }} />

        {#if note.type === 'text'}
          <textarea
            class="content"
            placeholder="Escreve aqui…"
            bind:this={contentEl}
            bind:value={note.content}
            use:autogrow={note.content}
            oninput={changed}
            readonly={trashed}></textarea>
          {#if links.length}
            <div class="links">
              {#each links as url (url)}
                <a href={url} target="_blank" rel="noopener noreferrer"><Icon name="link" size={16} />{hostname(url)}</a>
              {/each}
            </div>
          {/if}
        {:else}
          <Checklist items={note.items} readonly={trashed} onchange={changed} />
        {/if}
      </div>

      <footer>
        Editada {formatFull(note.updated_at)} · Criada {formatFull(note.created_at)}
      </footer>
    </div>
  </div>
  {#if historyOpen}
    <History
      {id}
      onclose={() => (historyOpen = false)}
      onrestored={() => {
        historyOpen = false;
        notify('Versão restaurada');
      }} />
  {/if}
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 30;
    background: rgba(0, 0, 0, 0.35);
    display: flex;
    justify-content: center;
    align-items: center;
    animation: fade 0.12s ease;
  }

  .editor {
    position: relative;
    display: flex;
    flex-direction: column;
    width: min(760px, 100%);
    height: min(86dvh, 100%);
    background: var(--note);
    border-radius: 18px;
    box-shadow: var(--shadow-lg);
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  @media (max-width: 720px) {
    .backdrop {
      background: var(--bg);
    }

    .editor {
      height: 100dvh;
      border-radius: 0;
      box-shadow: none;
    }
  }

  header {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: max(8px, env(safe-area-inset-top)) 8px 4px;
    background: var(--note);
  }

  .spacer {
    flex: 1;
  }

  .picker {
    padding: 8px;
  }

  .body {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 0 20px 16px;
  }

  .banner {
    margin: 0 0 12px;
    padding: 10px 12px;
    border-radius: 10px;
    background: color-mix(in srgb, currentColor 8%, transparent);
    font-size: 0.9rem;
  }

  .title {
    border: none;
    background: transparent;
    outline: none;
    font-size: 1.35rem;
    font-weight: 650;
    padding: 4px 0 10px;
  }

  .content {
    flex: 1;
    min-height: 40vh;
    border: none;
    background: transparent;
    outline: none;
    resize: none;
    overflow: hidden;
    line-height: 1.55;
    padding: 0;
  }

  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding-top: 12px;
  }

  .links a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 999px;
    background: color-mix(in srgb, currentColor 8%, transparent);
    color: inherit;
    font-size: 0.88rem;
    text-decoration: none;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  footer {
    padding: 10px 20px max(14px, env(safe-area-inset-bottom));
    font-size: 0.78rem;
    opacity: 0.55;
  }

  @keyframes fade {
    from {
      opacity: 0;
    }
  }
</style>
