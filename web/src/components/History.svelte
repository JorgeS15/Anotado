<script lang="ts">
  import { onMount } from 'svelte';
  import { store } from '../lib/store.svelte';
  import type { Note, NoteVersion } from '../lib/types';
  import { formatFull } from '../lib/util';
  import Icon from './Icon.svelte';

  let {
    id,
    onclose,
    onrestored,
  }: { id: string; onclose: () => void; onrestored: () => void } = $props();

  let versions = $state<NoteVersion[] | null>(null);
  let error = $state('');
  let open = $state<number | null>(null);
  let busy = $state(false);

  $effect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onclose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  });

  onMount(async () => {
    try {
      versions = await store.noteVersions(id);
    } catch {
      error = 'O histórico precisa de ligação ao servidor.';
    }
  });

  function body(note: Note) {
    if (note.type === 'checklist') return note.items.map((i) => `${i.done ? '☑' : '☐'} ${i.text}`).join('\n');
    return note.content;
  }

  async function restore(version: NoteVersion) {
    busy = true;
    try {
      await store.restoreVersion(id, version.id);
      onrestored();
    } catch {
      error = 'Não foi possível restaurar (sem ligação?).';
    }
    busy = false;
  }
</script>

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="sheet" role="dialog" aria-label="Histórico da nota">
    <header>
      <h2>Histórico</h2>
      <button class="icon-btn" onclick={onclose} aria-label="Fechar"><Icon name="close" /></button>
    </header>
    <div class="list">
      {#if error}
        <p class="info">{error}</p>
      {:else if versions === null}
        <p class="info">A carregar…</p>
      {:else if !versions.length}
        <p class="info">Ainda não há versões anteriores desta nota. São guardadas automaticamente enquanto a editas.</p>
      {:else}
        {#each versions as version (version.id)}
          <div class="version" class:open={open === version.id}>
            <button class="row" onclick={() => (open = open === version.id ? null : version.id)}>
              <strong>{formatFull(version.saved_at)}</strong>
              <span class="preview">{version.note.title || body(version.note).slice(0, 80) || 'Nota vazia'}</span>
            </button>
            {#if open === version.id}
              <div class="detail">
                {#if version.note.title}<h3>{version.note.title}</h3>{/if}
                <pre>{body(version.note)}</pre>
                <button class="btn" disabled={busy} onclick={() => restore(version)}>
                  <Icon name="restore" size={18} /> Restaurar esta versão
                </button>
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 16px;
  }

  .sheet {
    width: min(560px, 100%);
    max-height: min(80dvh, 100%);
    display: flex;
    flex-direction: column;
    background: var(--surface);
    color: var(--text);
    border-radius: 18px;
    box-shadow: var(--shadow-lg);
    overflow: hidden;
  }

  header {
    display: flex;
    align-items: center;
    padding: 8px 8px 8px 20px;
    border-bottom: 1px solid var(--border);
  }

  h2 {
    flex: 1;
    margin: 0;
    font-size: 1.1rem;
  }

  .list {
    overflow-y: auto;
    padding: 8px;
  }

  .info {
    margin: 16px 12px;
    color: var(--text-2);
  }

  .row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    padding: 10px 12px;
    border-radius: 10px;
    text-align: left;
  }

  .row:hover,
  .open .row {
    background: var(--surface-2);
  }

  .preview {
    color: var(--text-2);
    font-size: 0.9rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .detail {
    padding: 4px 12px 14px;
  }

  h3 {
    margin: 8px 0 4px;
    font-size: 1rem;
  }

  pre {
    margin: 0 0 12px;
    font: inherit;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    max-height: 40vh;
    overflow-y: auto;
  }
</style>
