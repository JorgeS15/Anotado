<script lang="ts">
  import { t, tn } from '../lib/i18n';
  import type { SvelteSet } from 'svelte/reactivity';
  import { now } from '../lib/clock';
  import { store } from '../lib/store.svelte';
  import type { Color, Note, View } from '../lib/types';
  import ColorPicker from './ColorPicker.svelte';
  import Icon from './Icon.svelte';
  import Popover from './Popover.svelte';

  let {
    view,
    selected,
    visible,
    onclear,
    notify,
  }: {
    view: View;
    selected: SvelteSet<string>;
    /** The notes on screen, for "Selecionar todas". */
    visible: Note[];
    onclear: () => void;
    notify: (message: string, undo?: () => void) => void;
  } = $props();

  let colorOpen = $state(false);

  const selectedNotes = $derived([...selected].map((id) => store.notes[id]).filter(Boolean));
  const allPinned = $derived(selectedNotes.length > 0 && selectedNotes.every((n) => n.pinned));

  /** `message` is a singular and a plural form, with `{n}` for the number of notes. */
  function bulk(patch: (n: Note) => Partial<Note>, message: [string, string], undoable = true) {
    const notes = selectedNotes;
    const before = notes.map(
      (n) => [n.id, { pinned: n.pinned, archived: n.archived, deleted_at: n.deleted_at, color: n.color }] as const,
    );
    for (const n of notes) store.update(n.id, patch(n));
    onclear();
    notify(
      tn(notes.length, ...message),
      undoable ? () => before.forEach(([id, old]) => store.update(id, old)) : undefined,
    );
  }

  function bulkColor(color: Color) {
    colorOpen = false;
    bulk(() => ({ color }), ['Cor alterada em {n} nota', 'Cor alterada em {n} notas']);
  }

  function deleteForever() {
    const ids = [...selected];
    if (!ids.length || !confirm(tn(ids.length, 'Apagar {n} nota para sempre?', 'Apagar {n} notas para sempre?'))) return;
    for (const id of ids) store.purge(id);
    onclear();
    notify(t('Notas apagadas'));
  }
</script>

<header class="top selectbar">
  <button class="icon-btn" onclick={onclear} aria-label={t('Cancelar seleção')}><Icon name="close" /></button>
  <h1>{tn(selected.size, '{n} selecionada', '{n} selecionadas')}</h1>
  <button class="icon-btn" title={t('Selecionar todas')} onclick={() => visible.forEach((n) => selected.add(n.id))}>
    <Icon name="select" />
  </button>
  {#if view === 'trash'}
    <button
      class="icon-btn"
      title={t('Restaurar')}
      disabled={!selected.size}
      onclick={() => bulk(() => ({ deleted_at: null }), ['{n} nota restaurada', '{n} notas restauradas'], false)}><Icon name="restore" /></button>
    <button class="icon-btn" title={t('Apagar para sempre')} disabled={!selected.size} onclick={deleteForever}>
      <Icon name="trash" />
    </button>
  {:else}
    <button
      class="icon-btn"
      title={allPinned ? t('Desafixar') : t('Fixar')}
      class:active={allPinned}
      disabled={!selected.size}
      onclick={() => bulk(
          () => ({ pinned: !allPinned }),
          allPinned ? ['{n} nota desafixada', '{n} notas desafixadas'] : ['{n} nota fixada', '{n} notas fixadas'],
        )}>
      <Icon name="pin" />
    </button>
    <Popover bind:open={colorOpen}>
      {#snippet trigger(toggle)}
        <button class="icon-btn" title={t('Cor')} disabled={!selected.size} onclick={toggle}><Icon name="palette" /></button>
      {/snippet}
      {#snippet children()}
        <div class="picker"><ColorPicker value={null} onpick={bulkColor} /></div>
      {/snippet}
    </Popover>
    <button
      class="icon-btn"
      title={view === 'archive' ? t('Desarquivar') : t('Arquivar')}
      disabled={!selected.size}
      onclick={() =>
        bulk(
          () => ({ archived: view !== 'archive' }),
          view === 'archive' ? ['{n} nota desarquivada', '{n} notas desarquivadas'] : ['{n} nota arquivada', '{n} notas arquivadas'],
        )}>
      <Icon name={view === 'archive' ? 'unarchive' : 'archive'} />
    </button>
    <button
      class="icon-btn"
      title={t('Mover para o lixo')}
      disabled={!selected.size}
      onclick={() => bulk(() => ({ deleted_at: now() }), ['{n} nota movida para o lixo', '{n} notas movidas para o lixo'])}>
      <Icon name="trash" />
    </button>
  {/if}
</header>

<style>
  .selectbar {
    gap: 0;
    padding-left: 6px;
    padding-right: 6px;
  }

  @media (max-width: 380px) {
    .selectbar :global(.icon-btn) {
      width: 36px;
    }
  }

  .selectbar h1 {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: 1.05rem;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .picker {
    padding: 8px;
  }
</style>
