<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import ColorNoteImport from './components/ColorNoteImport.svelte';
  import ColorPicker from './components/ColorPicker.svelte';
  import Editor from './components/Editor.svelte';
  import Icon from './components/Icon.svelte';
  import Login from './components/Login.svelte';
  import NoteCard from './components/NoteCard.svelte';
  import Popover from './components/Popover.svelte';
  import { now } from './lib/clock';
  import { pwa } from './lib/pwa.svelte';
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
  let colorNoteOpen = $state(false);

  let selectMode = $state(false);
  const selected = new SvelteSet<string>();
  let selectColorOpen = $state(false);

  /** A note to create from the URL: Android share target or app shortcut. */
  let pendingLaunch: { type: NoteType; title?: string; content?: string } | null = null;

  onMount(() => {
    const url = new URL(location.href);
    if (url.pathname === '/share') {
      const title = url.searchParams.get('title') ?? '';
      const text = url.searchParams.get('text') ?? '';
      const link = url.searchParams.get('url') ?? '';
      const content = [text, link && !text.includes(link) ? link : ''].filter(Boolean).join('\n');
      pendingLaunch = { type: 'text', title, content };
    } else if (url.searchParams.get('new') === 'text' || url.searchParams.get('new') === 'checklist') {
      pendingLaunch = { type: url.searchParams.get('new') as NoteType };
    }
    if (pendingLaunch || url.pathname !== '/') history.replaceState(null, '', '/');
    else if (history.state) history.replaceState(null, '');
    store.init();
  });

  $effect(() => {
    if (store.auth !== 'yes' || !pendingLaunch) return;
    const launch = pendingLaunch;
    pendingLaunch = null;
    newNote(launch.type, launch.title, launch.content);
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
    clearSelection(false);
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

  function newNote(type: NoteType, title = '', content = '') {
    if (view === 'trash') goTo('notes');
    const time = now();
    const draft: Note = {
      id: uid(),
      type,
      title,
      content,
      items: type === 'checklist' ? [{ id: uid(), text: '', done: false }] : [],
      color: colorFilter ?? 'yellow',
      pinned: false,
      archived: view === 'archive',
      deleted_at: null,
      created_at: time,
      updated_at: time,
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

  /** Replaces the open note with another one (e.g. a duplicate). */
  function switchNote(id: string) {
    editor?.finish();
    editing = { id };
  }

  function onpopstate(e: PopStateEvent) {
    if (editing && !e.state?.editor) finishEditing();
    if (selectMode && !e.state?.select) {
      selectMode = false;
      selected.clear();
    }
    view = e.state?.view ?? 'notes';
  }

  // --- Selection ---------------------------------------------------------------

  function toggleSelect(id: string) {
    if (!selectMode) {
      selectMode = true;
      history.pushState({ select: true, view }, '');
    }
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
  }

  function startSelect() {
    if (selectMode) return;
    selectMode = true;
    history.pushState({ select: true, view }, '');
  }

  function clearSelection(popHistory = true) {
    if (!selectMode) return;
    selectMode = false;
    selected.clear();
    if (popHistory && history.state?.select) history.back();
  }

  const selectedNotes = $derived([...selected].map((id) => store.notes[id]).filter(Boolean));
  const allPinned = $derived(selectedNotes.length > 0 && selectedNotes.every((n) => n.pinned));

  function bulk(patch: (n: Note) => Partial<Note>, message: string, undoable = true) {
    const notes = selectedNotes;
    const before = notes.map((n) => [n.id, { pinned: n.pinned, archived: n.archived, deleted_at: n.deleted_at, color: n.color }] as const);
    for (const n of notes) store.update(n.id, patch(n));
    clearSelection();
    notify(
      message.replace('{n}', String(notes.length)),
      undoable ? () => before.forEach(([id, old]) => store.update(id, old)) : undefined,
    );
  }

  function bulkColor(color: Color) {
    selectColorOpen = false;
    bulk(() => ({ color }), 'Cor alterada em {n} notas');
  }

  function bulkDeleteForever() {
    const ids = [...selected];
    if (!ids.length || !confirm(`Apagar ${ids.length} ${ids.length === 1 ? 'nota' : 'notas'} para sempre?`)) return;
    for (const id of ids) store.purge(id);
    clearSelection();
    notify('Notas apagadas');
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.defaultPrevented || store.auth !== 'yes') return;
    if (editing) {
      if (e.key === 'Escape') closeEditor();
      return;
    }
    if (selectMode) {
      if (e.key === 'Escape') clearSelection();
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
  {#if selectMode}
    <header class="top selectbar">
      <button class="icon-btn" onclick={() => clearSelection()} aria-label="Cancelar seleção"><Icon name="close" /></button>
      <h1>{selected.size} {selected.size === 1 ? 'selecionada' : 'selecionadas'}</h1>
      <button
        class="icon-btn"
        title="Selecionar todas"
        onclick={() => visible.forEach((n) => selected.add(n.id))}><Icon name="select" /></button>
      {#if view === 'trash'}
        <button
          class="icon-btn"
          title="Restaurar"
          disabled={!selected.size}
          onclick={() => bulk(() => ({ deleted_at: null }), '{n} notas restauradas', false)}><Icon name="restore" /></button>
        <button class="icon-btn" title="Apagar para sempre" disabled={!selected.size} onclick={bulkDeleteForever}>
          <Icon name="trash" />
        </button>
      {:else}
        <button
          class="icon-btn"
          title={allPinned ? 'Desafixar' : 'Fixar'}
          class:active={allPinned}
          disabled={!selected.size}
          onclick={() => bulk(() => ({ pinned: !allPinned }), allPinned ? '{n} notas desafixadas' : '{n} notas fixadas')}>
          <Icon name="pin" />
        </button>
        <Popover bind:open={selectColorOpen}>
          {#snippet trigger(toggle)}
            <button class="icon-btn" title="Cor" disabled={!selected.size} onclick={toggle}><Icon name="palette" /></button>
          {/snippet}
          {#snippet children()}
            <div class="picker"><ColorPicker value={null} onpick={bulkColor} /></div>
          {/snippet}
        </Popover>
        <button
          class="icon-btn"
          title={view === 'archive' ? 'Desarquivar' : 'Arquivar'}
          disabled={!selected.size}
          onclick={() =>
            bulk(
              () => ({ archived: view !== 'archive' }),
              view === 'archive' ? '{n} notas desarquivadas' : '{n} notas arquivadas',
            )}>
          <Icon name={view === 'archive' ? 'unarchive' : 'archive'} />
        </button>
        <button
          class="icon-btn"
          title="Mover para o lixo"
          disabled={!selected.size}
          onclick={() => bulk(() => ({ deleted_at: now() }), '{n} notas movidas para o lixo')}>
          <Icon name="trash" />
        </button>
      {/if}
    </header>
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
        <button class="item" onclick={() => (close(), startSelect())}><Icon name="select" /> Selecionar notas</button>
        <hr />
        <button class="item" onclick={() => (close(), exportBackup())}><Icon name="download" /> Exportar backup</button>
        <button class="item" onclick={() => (close(), importEl?.click())}><Icon name="upload" /> Importar backup</button>
        <button class="item" onclick={() => (close(), (colorNoteOpen = true))}>
          <Icon name="colornote" /> Importar do ColorNote
        </button>
        <hr />
        <button class="item" onclick={() => (close(), logout())}><Icon name="logout" /> Terminar sessão</button>
        <div class="version">Anotado v{__APP_VERSION__}</div>
      {/snippet}
    </Popover>
    <input type="file" accept="application/json,.json" hidden bind:this={importEl} onchange={importBackup} />
  </header>
  {/if}

  {#if pwa.needRefresh}
    <div class="update-bar" role="status">
      <Icon name="update" size={18} />
      <span>Há uma nova versão do Anotado.</span>
      <button onclick={() => pwa.update()}>Atualizar</button>
    </div>
  {/if}

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
          <NoteCard
            {note}
            {query}
            compact={layout === 'list'}
            selecting={selectMode}
            selected={selected.has(note.id)}
            onopen={() => openNote(note.id)}
            onselect={() => toggleSelect(note.id)} />
        {/each}
      </div>
      {#if others.length}<h2>Outras</h2>{/if}
    {/if}
    <div class="notes {layout}">
      {#each others as note (note.id)}
        <NoteCard
            {note}
            {query}
            compact={layout === 'list'}
            selecting={selectMode}
            selected={selected.has(note.id)}
            onopen={() => openNote(note.id)}
            onselect={() => toggleSelect(note.id)} />
      {/each}
    </div>
  </main>

  {#if view !== 'trash' && !selectMode}
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
      <Editor
        bind:this={editor}
        id={editing.id}
        draft={editing.draft}
        onclose={closeEditor}
        onopen={switchNote}
        {notify} />
    {/key}
  {/if}

  {#if colorNoteOpen}
    <ColorNoteImport onclose={() => (colorNoteOpen = false)} {notify} />
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
    min-width: 0;
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
    font-size: 1.05rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .picker {
    padding: 8px;
  }

  .icon-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .version {
    padding: 8px 12px 4px;
    font-size: 0.75rem;
    color: var(--text-2);
  }

  .update-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    width: min(760px, calc(100% - 32px));
    margin: 4px auto 6px;
    padding: 8px 10px 8px 14px;
    border-radius: 12px;
    background: var(--surface);
    border: 1px solid var(--accent);
    font-size: 0.92rem;
  }

  .update-bar span {
    flex: 1;
  }

  .update-bar button {
    padding: 6px 14px;
    border-radius: 999px;
    background: var(--accent);
    color: var(--accent-text);
    font-weight: 600;
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
    min-width: 0;
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
