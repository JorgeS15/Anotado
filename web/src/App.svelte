<script lang="ts">
  import { onMount } from 'svelte';
  import Editor from './components/Editor.svelte';
  import Icon from './components/Icon.svelte';
  import Login from './components/Login.svelte';
  import NoteCard from './components/NoteCard.svelte';
  import Popover from './components/Popover.svelte';
  import { store } from './lib/store.svelte';
  import {
    COLORS,
    COLOR_LABELS,
    type Color,
    type Layout,
    type Note,
    type NoteType,
    type SortMode,
    type Theme,
    type View,
  } from './lib/types';
  import { normalize, readPref, searchText, uid, writePref } from './lib/util';

  const SORTS: { value: SortMode; label: string }[] = [
    { value: 'updated', label: 'Data de alteração' },
    { value: 'created', label: 'Data de criação' },
    { value: 'color', label: 'Cor' },
    { value: 'title', label: 'Título' },
  ];
  const THEMES: { value: Theme; label: string }[] = [
    { value: 'auto', label: 'Automático' },
    { value: 'light', label: 'Claro' },
    { value: 'dark', label: 'Escuro' },
  ];
  const VIEW_TITLES: Record<View, string> = { notes: 'Anotado', archive: 'Arquivo', trash: 'Lixo' };

  let view = $state<View>('notes');
  let query = $state('');
  let colorFilter = $state<Color | null>(null);
  let layout = $state<Layout>(readPref('layout', ['grid', 'list'], 'grid'));
  let sort = $state<SortMode>(readPref('sort', ['updated', 'created', 'color', 'title'], 'updated'));
  let theme = $state<Theme>(readPref('theme', ['auto', 'light', 'dark'], 'auto'));

  let editing = $state<{ id: string; draft?: Note } | null>(null);
  let editor = $state<ReturnType<typeof Editor>>();
  let toast = $state<{ message: string; undo?: () => void; key: number } | null>(null);
  let menuOpen = $state(false);
  let sortOpen = $state(false);
  let fabOpen = $state(false);
  let searchEl = $state<HTMLInputElement>();
  let importEl = $state<HTMLInputElement>();

  onMount(() => {
    if (history.state?.editor || history.state?.view) history.replaceState(null, '');
    store.init();
  });

  // --- Derived lists ---------------------------------------------------------

  const all = $derived(Object.values(store.notes));
  const counts = $derived({
    archive: all.filter((n) => n.archived && n.deleted_at == null).length,
    trash: all.filter((n) => n.deleted_at != null).length,
  });

  const visible = $derived.by(() => {
    const q = normalize(query.trim());
    const list = all.filter((n) => {
      if (view === 'trash' ? n.deleted_at == null : n.deleted_at != null) return false;
      if (view === 'notes' && n.archived) return false;
      if (view === 'archive' && !n.archived) return false;
      if (colorFilter && n.color !== colorFilter) return false;
      if (q && !searchText(n).includes(q)) return false;
      return true;
    });
    const label = (n: Note) => (n.title || n.content || n.items[0]?.text || '').trim();
    const compare: Record<SortMode, (a: Note, b: Note) => number> = {
      updated: (a, b) => b.updated_at - a.updated_at,
      created: (a, b) => b.created_at - a.created_at,
      color: (a, b) => COLORS.indexOf(a.color) - COLORS.indexOf(b.color) || b.updated_at - a.updated_at,
      title: (a, b) => label(a).localeCompare(label(b), 'pt', { sensitivity: 'base' }),
    };
    if (view === 'trash') return list.sort((a, b) => (b.deleted_at ?? 0) - (a.deleted_at ?? 0));
    return list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || compare[sort](a, b));
  });
  const pinned = $derived(view === 'trash' ? [] : visible.filter((n) => n.pinned));
  const others = $derived(view === 'trash' ? visible : visible.filter((n) => !n.pinned));

  // --- Preferences -------------------------------------------------------------

  $effect(() => {
    if (theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    writePref('theme', theme);
  });
  $effect(() => writePref('layout', layout));
  $effect(() => writePref('sort', sort));
  $effect(() => {
    document.body.classList.toggle('lock', editing !== null);
  });

  // --- Navigation (the back button closes the editor / leaves a view) -------

  function goTo(next: View) {
    if (next === view) return;
    if (next === 'notes') {
      if (history.state?.view) history.back();
    } else if (view === 'notes') history.pushState({ view: next }, '');
    else history.replaceState({ view: next }, '');
    view = next;
    colorFilter = null;
    window.scrollTo(0, 0);
  }

  function openNote(id: string) {
    editing = { id };
    history.pushState({ editor: true, view }, '');
  }

  function newNote(type: NoteType) {
    if (view === 'trash') goTo('notes');
    const now = Date.now();
    const draft: Note = {
      id: uid(),
      type,
      title: '',
      content: '',
      items: type === 'checklist' ? [{ id: uid(), text: '', done: false }] : [],
      color: colorFilter ?? 'yellow',
      pinned: false,
      archived: view === 'archive',
      deleted_at: null,
      created_at: now,
      updated_at: now,
    };
    editing = { id: draft.id, draft };
    history.pushState({ editor: true, view }, '');
  }

  function closeEditor() {
    if (history.state?.editor) history.back();
    else finishEditing();
  }

  function finishEditing() {
    editor?.finish();
    editing = null;
  }

  function onpopstate(e: PopStateEvent) {
    if (editing && !e.state?.editor) finishEditing();
    view = e.state?.view ?? 'notes';
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.defaultPrevented || store.auth !== 'yes') return;
    if (editing) {
      if (e.key === 'Escape') closeEditor();
      return;
    }
    const target = e.target as HTMLElement;
    const typing = target.closest('input, textarea, select, [contenteditable]');
    if (e.key === 'Escape' && target === searchEl) {
      query = '';
      searchEl?.blur();
    }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'n') {
      e.preventDefault();
      newNote('text');
    } else if (e.key === 'l') {
      e.preventDefault();
      newNote('checklist');
    } else if (e.key === '/') {
      e.preventDefault();
      searchEl?.focus();
    }
  }

  // --- Actions -----------------------------------------------------------------

  let toastTimer: ReturnType<typeof setTimeout>;
  function notify(message: string, undo?: () => void) {
    clearTimeout(toastTimer);
    toast = { message, undo, key: Date.now() };
    toastTimer = setTimeout(() => (toast = null), 5000);
  }

  function emptyTrash() {
    const ids = all.filter((n) => n.deleted_at != null).map((n) => n.id);
    if (!ids.length || !confirm(`Apagar ${ids.length} ${ids.length === 1 ? 'nota' : 'notas'} para sempre?`)) return;
    for (const id of ids) store.purge(id);
    notify('Lixo esvaziado');
  }

  function exportBackup() {
    const data = { app: 'anotado', version: 1, exported_at: Date.now(), notes: all.map((n) => $state.snapshot(n)) };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `anotado-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function importBackup(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) notify(await store.importBackup(file));
  }

  function logout() {
    if (store.pending && !confirm('Há alterações por sincronizar que se vão perder. Terminar sessão mesmo assim?'))
      return;
    store.logout();
  }
</script>

<svelte:window {onpopstate} {onkeydown} />

{#if !store.loaded || store.auth === 'unknown'}
  <div class="splash"></div>
{:else if store.auth === 'no'}
  <Login />
{:else}
  <header class="top">
    {#if view === 'notes'}
      <img class="logo" src="/favicon.svg" alt="" width="30" height="30" />
      <h1 class="brand">Anotado</h1>
    {:else}
      <button class="icon-btn" onclick={() => goTo('notes')} aria-label="Voltar às notas"><Icon name="back" /></button>
      <h1>{VIEW_TITLES[view]}</h1>
    {/if}

    <label class="search">
      <Icon name="search" size={18} />
      <span class="sr-only">Pesquisar</span>
      <input type="search" placeholder="Pesquisar" bind:value={query} bind:this={searchEl} />
    </label>

    {#if !store.online}
      <span class="status" title="Sem ligação. As alterações são enviadas quando a ligação voltar.">
        <Icon name="cloudOff" size={20} />
        {#if store.pending}<small>{store.pending}</small>{/if}
      </span>
    {:else if store.pending}
      <span class="status syncing" title="A sincronizar…"><Icon name="sync" size={18} /></span>
    {/if}

    <Popover bind:open={menuOpen}>
      {#snippet trigger(toggle)}
        <button class="icon-btn" onclick={toggle} aria-label="Menu"><Icon name="more" /></button>
      {/snippet}
      {#snippet children(close)}
        <button class="item" class:selected={view === 'notes'} onclick={() => (close(), goTo('notes'))}>
          <Icon name="notes" /> Notas
        </button>
        <button class="item" class:selected={view === 'archive'} onclick={() => (close(), goTo('archive'))}>
          <Icon name="archive" /> Arquivo {#if counts.archive}<span class="count">{counts.archive}</span>{/if}
        </button>
        <button class="item" class:selected={view === 'trash'} onclick={() => (close(), goTo('trash'))}>
          <Icon name="trash" /> Lixo {#if counts.trash}<span class="count">{counts.trash}</span>{/if}
        </button>
        <hr />
        <div class="label">Tema</div>
        {#each THEMES as t (t.value)}
          <button class="item" class:selected={theme === t.value} onclick={() => (theme = t.value)}>
            <Icon name={theme === t.value ? 'check' : 'theme'} />
            {t.label}
          </button>
        {/each}
        <hr />
        <button class="item" onclick={() => (close(), exportBackup())}><Icon name="download" /> Exportar backup</button>
        <button class="item" onclick={() => (close(), importEl?.click())}><Icon name="upload" /> Importar backup</button>
        <hr />
        <button class="item" onclick={() => (close(), logout())}><Icon name="logout" /> Terminar sessão</button>
      {/snippet}
    </Popover>
    <input type="file" accept="application/json,.json" hidden bind:this={importEl} onchange={importBackup} />
  </header>

  <div class="toolbar">
    <div class="filters" role="group" aria-label="Filtrar por cor">
      {#each COLORS as color (color)}
        <button
          class="dot"
          class:selected={colorFilter === color}
          style:--dot="var(--dot-{color})"
          title={COLOR_LABELS[color]}
          aria-label="Filtrar: {COLOR_LABELS[color]}"
          aria-pressed={colorFilter === color}
          onclick={() => (colorFilter = colorFilter === color ? null : color)}></button>
      {/each}
    </div>
    {#if view !== 'trash'}
      <Popover bind:open={sortOpen}>
        {#snippet trigger(toggle)}
          <button class="icon-btn" onclick={toggle} title="Ordenar"><Icon name="sort" size={20} /></button>
        {/snippet}
        {#snippet children(close)}
          <div class="label">Ordenar por</div>
          {#each SORTS as s (s.value)}
            <button class="item" class:selected={sort === s.value} onclick={() => ((sort = s.value), close())}>
              {s.label}
            </button>
          {/each}
        {/snippet}
      </Popover>
    {/if}
    <button
      class="icon-btn"
      onclick={() => (layout = layout === 'grid' ? 'list' : 'grid')}
      title={layout === 'grid' ? 'Ver em lista' : 'Ver em grelha'}>
      <Icon name={layout === 'grid' ? 'list' : 'grid'} size={20} />
    </button>
  </div>

  <main>
    {#if view === 'trash' && counts.trash}
      <div class="trash-bar">
        <span>As notas no lixo são apagadas ao fim de 30 dias.</span>
        <button class="btn ghost" onclick={emptyTrash}>Esvaziar lixo</button>
      </div>
    {/if}

    {#if !visible.length}
      <p class="empty">
        {#if query || colorFilter}
          Sem resultados.
        {:else if view === 'archive'}
          Nada arquivado.
        {:else if view === 'trash'}
          O lixo está vazio.
        {:else}
          Ainda não tens notas.<br />Toca em <strong>+</strong> para criar a primeira.
        {/if}
      </p>
    {/if}

    {#if pinned.length}
      <h2>Fixadas</h2>
      <div class="notes {layout}">
        {#each pinned as note (note.id)}
          <NoteCard {note} compact={layout === 'list'} onopen={() => openNote(note.id)} />
        {/each}
      </div>
      {#if others.length}<h2>Outras</h2>{/if}
    {/if}
    <div class="notes {layout}">
      {#each others as note (note.id)}
        <NoteCard {note} compact={layout === 'list'} onopen={() => openNote(note.id)} />
      {/each}
    </div>
  </main>

  {#if view !== 'trash'}
    <div class="fab">
      <Popover bind:open={fabOpen} up>
        {#snippet trigger(toggle)}
          <button class="fab-btn" class:open={fabOpen} onclick={toggle} aria-label="Nova nota">
            <Icon name="plus" size={28} />
          </button>
        {/snippet}
        {#snippet children(close)}
          <button class="item" onclick={() => (close(), newNote('text'))}><Icon name="text" /> Texto</button>
          <button class="item" onclick={() => (close(), newNote('checklist'))}>
            <Icon name="checklist" /> Checklist
          </button>
        {/snippet}
      </Popover>
    </div>
  {/if}

  {#if editing}
    {#key editing.id}
      <Editor bind:this={editor} id={editing.id} draft={editing.draft} onclose={closeEditor} {notify} />
    {/key}
  {/if}

  {#if toast}
    {#key toast.key}
      <div class="toast" role="status">
        <span>{toast.message}</span>
        {#if toast.undo}
          <button
            onclick={() => {
              toast?.undo?.();
              toast = null;
            }}>Anular</button>
        {/if}
      </div>
    {/key}
  {/if}
{/if}

<style>
  .splash {
    min-height: 100dvh;
  }

  .top {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: max(10px, env(safe-area-inset-top)) 12px 6px 16px;
    background: var(--bg);
  }

  .top h1 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
    white-space: nowrap;
  }

  .logo {
    flex: none;
  }

  @media (max-width: 520px) {
    .brand {
      display: none;
    }
  }

  .search {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 560px;
    margin: 0 auto;
    padding: 0 14px;
    height: 42px;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text-2);
  }

  .search:focus-within {
    border-color: var(--accent);
  }

  .search input {
    flex: 1;
    min-width: 0;
    border: none;
    background: transparent;
    outline: none;
    color: var(--text);
  }

  .status {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    color: var(--text-2);
  }

  .status small {
    font-size: 0.75rem;
    font-weight: 600;
  }

  .syncing :global(svg) {
    animation: spin 1.2s linear infinite;
  }

  .count {
    margin-left: auto;
    font-size: 0.8rem;
    color: var(--text-2);
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 12px 6px 16px;
    max-width: 1400px;
    margin: 0 auto;
  }

  .filters {
    flex: 1;
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding: 6px 2px;
    scrollbar-width: none;
  }

  .dot {
    flex: none;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--dot);
    border: 1px solid rgba(0, 0, 0, 0.15);
    transition: transform 0.12s ease;
  }

  .dot.selected {
    transform: scale(1.12);
    box-shadow:
      0 0 0 2px var(--bg),
      0 0 0 4px var(--text);
  }

  main {
    max-width: 1400px;
    margin: 0 auto;
    padding: 4px 16px 120px;
  }

  h2 {
    margin: 12px 4px 8px;
    font-size: 0.78rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-2);
  }

  .notes {
    display: grid;
    gap: 12px;
    margin-bottom: 8px;
  }

  .notes.grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    align-items: start;
  }

  @media (min-width: 720px) {
    .notes.grid {
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    }
  }

  .notes.list {
    max-width: 760px;
    margin-inline: auto;
  }

  .empty {
    margin: 18vh auto 0;
    text-align: center;
    color: var(--text-2);
  }

  .trash-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 12px;
    padding: 10px 14px;
    border-radius: 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    font-size: 0.9rem;
    color: var(--text-2);
  }

  .fab {
    position: fixed;
    right: max(20px, env(safe-area-inset-right));
    bottom: max(20px, env(safe-area-inset-bottom));
    z-index: 20;
  }

  .fab-btn {
    width: 60px;
    height: 60px;
    border-radius: 20px;
    display: grid;
    place-items: center;
    background: var(--accent);
    color: var(--accent-text);
    box-shadow: var(--shadow-lg);
    transition: transform 0.15s ease;
  }

  .fab-btn.open {
    transform: rotate(45deg);
  }

  .fab :global(.panel) {
    min-width: 170px;
  }

  .toast {
    position: fixed;
    left: 50%;
    bottom: max(24px, env(safe-area-inset-bottom));
    transform: translateX(-50%);
    z-index: 60;
    display: flex;
    align-items: center;
    gap: 16px;
    max-width: calc(100vw - 32px);
    padding: 12px 18px;
    border-radius: 12px;
    background: #2b2a26;
    color: #f3f1ea;
    box-shadow: var(--shadow-lg);
    animation: rise 0.18s ease;
  }

  .toast button {
    color: #f2c94c;
    font-weight: 700;
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translate(-50%, 10px);
    }
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
