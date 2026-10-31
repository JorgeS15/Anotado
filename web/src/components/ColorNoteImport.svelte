<script lang="ts">
  import { HttpError, store } from '../lib/store.svelte';
  import { COLORS, COLOR_LABELS, type Color, type ColorNotePreview } from '../lib/types';
  import Icon from './Icon.svelte';

  let { onclose, notify }: { onclose: () => void; notify: (message: string) => void } = $props();

  let file = $state<File | null>(null);
  let password = $state('0000');
  let preview = $state<ColorNotePreview | null>(null);
  let colors = $state<Record<number, Color>>({});
  let error = $state('');
  let busy = $state(false);

  const archived = $derived(preview?.records.filter((r) => r.archived).length ?? 0);
  const checklists = $derived(preview?.records.filter((r) => r.type === 'checklist').length ?? 0);

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

  async function read(e: SubmitEvent) {
    e.preventDefault();
    if (!file || busy) return;
    busy = true;
    error = '';
    try {
      preview = await store.previewColorNote(file, password);
      colors = Object.fromEntries(preview.colors.map((c) => [c.index, c.suggested]));
    } catch (err) {
      error =
        err instanceof HttpError && err.status === 400
          ? err.message
          : 'Não foi possível ler o ficheiro (sem ligação ao servidor?).';
    }
    busy = false;
  }

  async function importNow() {
    if (!preview || busy) return;
    busy = true;
    try {
      notify(await store.importColorNote(preview, colors));
      onclose();
    } catch {
      error = 'Não foi possível importar (sem ligação ao servidor?).';
    }
    busy = false;
  }
</script>

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="sheet" role="dialog" aria-label="Importar do ColorNote">
    <header>
      <h2>Importar do ColorNote</h2>
      <button class="icon-btn" onclick={onclose} aria-label="Fechar"><Icon name="close" /></button>
    </header>

    <div class="content">
      {#if !preview}
        <form onsubmit={read}>
          <p class="help">
            No ColorNote, abre <strong>Definições → Backup → Fazer backup</strong> e copia o ficheiro (por exemplo
            <code>.doc</code> ou <code>.dat</code>) da pasta <code>data/colornote/backup</code> para aqui.
          </p>
          <label>
            Ficheiro de backup
            <input type="file" onchange={(e) => (file = e.currentTarget.files?.[0] ?? null)} />
          </label>
          <label>
            Password do backup
            <input type="text" bind:value={password} autocomplete="off" />
            <small>Por omissão é 0000, a não ser que tenhas definido outra no ColorNote.</small>
          </label>
          {#if error}<p class="error" role="alert">{error}</p>{/if}
          <button class="btn" type="submit" disabled={!file || busy}>{busy ? 'A ler…' : 'Ler backup'}</button>
        </form>
      {:else}
        <p>
          Encontrei <strong>{preview.records.length}</strong> notas ({checklists} checklists, {archived} arquivadas).
          Notas já importadas antes são atualizadas, não duplicadas.
        </p>
        <h3>Cores</h3>
        <p class="help">Escolhe a cor do Anotado para cada cor do ColorNote. Os exemplos ajudam a reconhecê-las.</p>
        <ul class="colors">
          {#each preview.colors as c (c.index)}
            <li>
              <div class="info">
                <strong>Cor {c.index}</strong> · {c.count} {c.count === 1 ? 'nota' : 'notas'}
                {#if c.samples.length}<small>{c.samples.join(' · ')}</small>{/if}
              </div>
              <div class="dots" role="radiogroup" aria-label="Cor para {c.index}">
                {#each COLORS as color (color)}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={colors[c.index] === color}
                    aria-label={COLOR_LABELS[color]}
                    title={COLOR_LABELS[color]}
                    class:selected={colors[c.index] === color}
                    style:--dot="var(--dot-{color})"
                    onclick={() => (colors[c.index] = color)}></button>
                {/each}
              </div>
            </li>
          {/each}
        </ul>
        {#if error}<p class="error" role="alert">{error}</p>{/if}
        <div class="actions">
          <button class="btn ghost" onclick={() => (preview = null)}>Voltar</button>
          <button class="btn" onclick={importNow} disabled={busy}>
            {busy ? 'A importar…' : `Importar ${preview.records.length} notas`}
          </button>
        </div>
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
    width: min(600px, 100%);
    max-height: min(88dvh, 100%);
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

  h3 {
    margin: 16px 0 4px;
    font-size: 1rem;
  }

  .content {
    overflow-y: auto;
    padding: 16px 20px 20px;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-weight: 600;
  }

  label small,
  .help,
  .info small {
    font-weight: normal;
    color: var(--text-2);
    font-size: 0.88rem;
  }

  .help {
    margin: 0;
  }

  input[type='text'] {
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg);
  }

  code {
    font-size: 0.85em;
    background: var(--surface-2);
    padding: 1px 4px;
    border-radius: 4px;
  }

  .error {
    color: var(--danger);
    margin: 8px 0;
  }

  .colors {
    list-style: none;
    margin: 12px 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .info {
    display: flex;
    flex-direction: column;
    margin-bottom: 6px;
  }

  .info small {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dots {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .dots button {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--dot);
    border: 1px solid rgba(0, 0, 0, 0.15);
  }

  .dots button.selected {
    box-shadow:
      0 0 0 2px var(--surface),
      0 0 0 4px var(--text);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 16px;
  }
</style>
