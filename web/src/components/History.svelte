<script lang="ts">
  import { t } from '../lib/i18n';
  import { onMount } from 'svelte';
  import { store } from '../lib/store.svelte';
  import type { Note, NoteVersion } from '../lib/types';
  import { formatFull } from '../lib/util';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';

  let {
    id,
    onclose,
    onrestored,
  }: { id: string; onclose: () => void; onrestored: () => void } = $props();

  let versions = $state<NoteVersion[] | null>(null);
  let error = $state('');
  let open = $state<number | null>(null);
  let busy = $state(false);


  onMount(async () => {
    try {
      versions = await store.noteVersions(id);
    } catch {
      error = t('O histórico precisa de ligação ao servidor.');
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
      error = t('Não foi possível restaurar (sem ligação?).');
    }
    busy = false;
  }
</script>

<Sheet title={t('Histórico')} {onclose}>
  <div class="list">
    {#if error}
      <p class="info">{error}</p>
    {:else if versions === null}
      <p class="info">{t('A carregar…')}</p>
    {:else if !versions.length}
      <p class="info">{t('Ainda não há versões anteriores desta nota. São guardadas automaticamente enquanto a editas.')}</p>
    {:else}
      {#each versions as version (version.id)}
        <div class="version" class:open={open === version.id}>
          <button class="row" onclick={() => (open = open === version.id ? null : version.id)}>
            <strong>{formatFull(version.saved_at)}</strong>
            <span class="preview">{version.note.title || body(version.note).slice(0, 80) || t('Nota vazia')}</span>
          </button>
          {#if open === version.id}
            <div class="detail">
              {#if version.note.title}<h3>{version.note.title}</h3>{/if}
              <pre>{body(version.note)}</pre>
              <button class="btn" disabled={busy} onclick={() => restore(version)}>
                <Icon name="restore" size={18} /> {t('Restaurar esta versão')}
              </button>
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</Sheet>

<style>




  .list {
    margin: -8px -12px;
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
