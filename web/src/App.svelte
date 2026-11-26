<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import AppMenu from './components/AppMenu.svelte';
  import ColorNames from './components/ColorNames.svelte';
  import ColorNoteImport from './components/ColorNoteImport.svelte';
  import Editor from './components/Editor.svelte';
  import Icon from './components/Icon.svelte';
  import Login from './components/Login.svelte';
  import NoteCard from './components/NoteCard.svelte';
  import Popover from './components/Popover.svelte';
  import SelectBar from './components/SelectBar.svelte';
  import ServerStatus from './components/ServerStatus.svelte';
  import Shortcuts from './components/Shortcuts.svelte';
  import Templates from './components/Templates.svelte';
  import { now } from './lib/clock';
  import { pwa } from './lib/pwa.svelte';
  import { refreshPush } from './lib/push';
  import { colorLabel, store } from './lib/store.svelte';
  import {
    COLORS,
    type Color,
    type FontSize,
    type Layout,
    type Note,
    type NoteType,
    type SortMode,
    type Template,
    type Theme,
    type View,
  } from './lib/types';
  import { normalize, readPref, searchText, uid, writePref } from './lib/util';

  const SORTS: { value: SortMode; label: string }[] = [
    { value: 'updated', label: 'Data de alteração' },
    { value: 'created', label: 'Data de criação' },
    { value: 'color', label: 'Cor' },
    { value: 'title', label: 'Título' },
    { value: 'manual', label: 'Manual (arrastar)' },
  ];
  const VIEW_TITLES: Record<View, string> = { notes: 'Anotado', archive: 'Arquivo', trash: 'Lixo' };

  let view = $state<View>('notes');
  let query = $state('');
  let colorFilter = $state<Color | null>(null);
  let layout = $state<Layout>(readPref('layout', ['grid', 'list'], 'grid'));
  let sort = $state<SortMode>(readPref('sort', ['updated', 'created', 'color', 'title', 'manual'], 'updated'));
  let theme = $state<Theme>(readPref('theme', ['auto', 'light', 'dark'], 'auto'));
  let fontSize = $state<FontSize>(readPref('font-size', ['small', 'normal', 'large'], 'normal'));

  let editing = $state<{ id: string; draft?: Note } | null>(null);
  let editor = $state<ReturnType<typeof Editor>>();
  let toast = $state<{ message: string; undo?: () => void; action?: { label: string; run: () => void }; key: number } | null>(
    null,
  );
  let sortOpen = $state(false);
  let fabOpen = $state(false);
  let searchEl = $state<HTMLInputElement>();
  let importEl = $state<HTMLInputElement>();
  let sheet = $state<'colornote' | 'colornames' | 'server' | 'shortcuts' | 'templates' | null>(null);

  let selectMode = $state(false);
  const selected = new SvelteSet<string>();

  /** A note to create from the URL: Android share target or app shortcut. */
  let pendingLaunch: { type: NoteType; title?: string; content?: string } | null = null;
  /** A note to open from the URL, e.g. after tapping a reminder. */
  let pendingOpen = $state<string | null>(null);

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
    } else if (url.searchParams.get('note')) {
      pendingOpen = url.searchParams.get('note');
    }
    if (pendingLaunch || pendingOpen || url.pathname !== '/') history.replaceState(null, '', '/');
    else if (history.state) history.replaceState(null, '');
    // A reminder tapped while the app is already open.
    navigator.serviceWorker?.addEventListener('message', (e) => {
      if (e.data?.type === 'open-note' && e.data.id) pendingOpen = e.data.id;
    });
    store.onreminder = (id) => {
      const note = store.notes[id];
      if (!note) return;
      const title = note.title.trim() || note.content.trim().split('\n')[0] || 'nota';
      notify(`Lembrete: ${title.slice(0, 60)}`, undefined, { label: 'Abrir', run: () => openNote(id) });
    };
    store.init();
  });

  $effect(() => {
    if (store.auth !== 'yes' || !pendingOpen || !store.notes[pendingOpen]) return;
    const id = pendingOpen;
    pendingOpen = null;
    if (editing?.id === id) return;
    if (editing) switchNote(id);
    else openNote(id);
  });

  $effect(() => {
    if (store.auth === 'yes') refreshPush();
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
    // Manual order: notes not placed by hand yet come first, newest first.
    const rank = new Map((dragging?.order ?? store.settings.order).map((id, i) => [id, i]));
    const label = (n: Note) => (n.title || n.content || n.items[0]?.text || '').trim();
    const compare: Record<SortMode, (a: Note, b: Note) => number> = {
      updated: (a, b) => b.updated_at - a.updated_at,
      created: (a, b) => b.created_at - a.created_at,
      color: (a, b) => COLORS.indexOf(a.color) - COLORS.indexOf(b.color) || b.updated_at - a.updated_at,
      title: (a, b) => label(a).localeCompare(label(b), 'pt', { sensitivity: 'base' }),
      manual: (a, b) => (rank.get(a.id) ?? -1) - (rank.get(b.id) ?? -1) || b.updated_at - a.updated_at,
    };
    if (view === 'trash') return list.sort((a, b) => (b.deleted_at ?? 0) - (a.deleted_at ?? 0));
    return list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || compare[sort](a, b));
  });
  // --- Manual order -------------------------------------------------------------

  let dragging = $state<{ id: string; order: string[] } | null>(null);
  const reorderable = $derived(sort === 'manual' && view !== 'trash' && !query.trim());

  /** The full order with the visible notes as they are on screen, keeping hidden ones after them. */
  function currentOrder(): string[] {
    const shown = visible.map((n) => n.id);
    const set = new Set(shown);
    return [...shown, ...store.settings.order.filter((id) => !set.has(id) && store.notes[id])];
  }

  function saveOrder(order: string[]) {
    store.saveSettings({ ...$state.snapshot(store.settings), order: order.filter((id) => store.notes[id]) });
  }

  function moveNote(id: string, by: -1 | 1) {
    const list = visible.filter((n) => n.pinned === store.notes[id]?.pinned).map((n) => n.id);
    const target = list[list.indexOf(id) + by];
    if (!target) return;
    const order = currentOrder();
    order.splice(order.indexOf(id), 1);
    order.splice(order.indexOf(target) + (by > 0 ? 1 : 0), 0, id);
    saveOrder(order);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-note="${id}"]`)?.focus());
  }

  function startDrag(e: PointerEvent, id: string) {
    e.preventDefault();
    // Listen on the window: moving the card in the page would drop a pointer capture on its handle.
    const pointer = e.pointerId;
    dragging = { id, order: currentOrder() };
    const pinnedGroup = store.notes[id]?.pinned;

    const move = (ev: PointerEvent) => {
      if (!dragging || ev.pointerId !== pointer) return;
      ev.preventDefault();
      const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-note]');
      const target = over?.dataset.note;
      if (!target || target === id || store.notes[target]?.pinned !== pinnedGroup) return;
      const order = dragging.order.filter((x) => x !== id);
      const to = order.indexOf(target);
      const from = dragging.order.indexOf(id);
      // Dropping on a later card puts the note after it, on an earlier one before it.
      order.splice(to + (from <= dragging.order.indexOf(target) ? 1 : 0), 0, id);
      dragging = { id, order };
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== pointer) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (dragging) saveOrder(dragging.order);
      dragging = null;
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  const pinned = $derived(view === 'trash' ? [] : visible.filter((n) => n.pinned));
  const others = $derived(view === 'trash' ? visible : visible.filter((n) => !n.pinned));

  // --- Preferences -------------------------------------------------------------

  $effect(() => {
    if (theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    writePref('theme', theme);
  });
  $effect(() => {
    if (fontSize === 'normal') delete document.documentElement.dataset.font;
    else document.documentElement.dataset.font = fontSize;
    writePref('font-size', fontSize);
  });
  $effect(() => writePref('layout', layout));
  $effect(() => writePref('sort', sort));
  $effect(() => {
    document.body.classList.toggle('lock', editing !== null);
  });

  // The phone's status bar takes the colour of the open note, or of the app.
  const editingColor = $derived(editing ? (store.notes[editing.id] ?? editing.draft)?.color : undefined);
  $effect(() => {
    void theme;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) return;
    const css = getComputedStyle(document.documentElement);
    // Narrow screens show the note full screen; wider ones over the app background.
    const fullScreen = matchMedia('(max-width: 720px)').matches;
    const color = editingColor && fullScreen ? css.getPropertyValue(`--note-${editingColor}`) : css.getPropertyValue('--bg');
    meta.content = color.trim() || '#f6f3ea';
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

  function newNote(type: NoteType, title = '', content = '', template?: Template) {
    if (view === 'trash') goTo('notes');
    const time = now();
    const items = template?.items.length ? template.items : [''];
    const draft: Note = {
      id: uid(),
      type,
      title,
      content,
      items: type === 'checklist' ? items.map((text) => ({ id: uid(), text, done: false })) : [],
      color: template?.color ?? colorFilter ?? 'yellow',
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

  // --- Sync problems ------------------------------------------------------------

  const rejectedCount = $derived(Object.keys(store.rejected).length);
  let rejectedSeen = 0;
  $effect(() => {
    // Say it once when a note starts being refused; the editor and the card explain why.
    if (rejectedCount > rejectedSeen) notify('Uma nota não foi sincronizada: abre-a para ver porquê.');
    rejectedSeen = rejectedCount;
  });

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

  function onkeydown(e: KeyboardEvent) {
    if (e.defaultPrevented || store.auth !== 'yes') return;
    if (sheet) return;
    if (editing) {
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        closeEditor();
      }
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
    } else if (e.key === '?') {
      e.preventDefault();
      sheet = 'shortcuts';
    }
  }

  // --- Actions -----------------------------------------------------------------

  let toastTimer: ReturnType<typeof setTimeout>;
  function notify(message: string, undo?: () => void, action?: { label: string; run: () => void }) {
    clearTimeout(toastTimer);
    toast = { message, undo, action, key: Date.now() };
    toastTimer = setTimeout(() => (toast = null), action ? 10_000 : 5000);
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

  async function logoutOthers() {
    const question =
      'Terminar a sessão em todos os outros dispositivos? Vão pedir a password outra vez. ' +
      'As alterações que ainda não sincronizaram ficam guardadas neles e são enviadas depois de entrar.';
    if (confirm(question)) notify(await store.logoutOthers());
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
    <SelectBar {view} {selected} {visible} onclear={() => clearSelection()} {notify} />
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
    {:else if rejectedCount}
      <span class="status warn" title="{rejectedCount} {rejectedCount === 1 ? 'nota não sincronizada' : 'notas não sincronizadas'}: abre-as para ver porquê.">
        <Icon name="warning" size={20} /><small>{rejectedCount}</small>
      </span>
    {:else if store.pending}
      <span class="status syncing" title="A sincronizar…"><Icon name="sync" size={18} /></span>
    {/if}

    <AppMenu
      {view}
      {counts}
      bind:theme
      bind:fontSize
      ongo={goTo}
      onselect={startSelect}
      onexport={exportBackup}
      onimport={() => importEl?.click()}
      oncolornote={() => (sheet = 'colornote')}
      oncolornames={() => (sheet = 'colornames')}
      onserver={() => (sheet = 'server')}
      onshortcuts={() => (sheet = 'shortcuts')}
      onlogout={logout}
      onlogoutothers={logoutOthers} />
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
          title={colorLabel(color)}
          aria-label="Filtrar: {colorLabel(color)}"
          aria-pressed={colorFilter === color}
          onclick={() => (colorFilter = colorFilter === color ? null : color)}></button>
      {/each}
    </div>
    {#if colorFilter && store.settings.color_names[colorFilter]}
      <span class="filter-name">{colorLabel(colorFilter)}</span>
    {/if}
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

  {#snippet noteCard(note: Note)}
    <NoteCard
      {note}
      {query}
      compact={layout === 'list'}
      selecting={selectMode}
      selected={selected.has(note.id)}
      warning={store.rejected[note.id]}
      {reorderable}
      dragging={dragging?.id === note.id}
      onopen={() => openNote(note.id)}
      onselect={() => toggleSelect(note.id)}
      ondragstart={(e) => startDrag(e, note.id)}
      onmove={(by) => moveNote(note.id, by)} />
  {/snippet}

  <main>
    {#if view === 'trash' && counts.trash}
      <div class="trash-bar">
        <span>As notas no lixo são apagadas ao fim de {store.trashDays} {store.trashDays === 1 ? 'dia' : 'dias'}.</span>
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
          {@render noteCard(note)}
        {/each}
      </div>
      {#if others.length}<h2>Outras</h2>{/if}
    {/if}
    <div class="notes {layout}">
      {#each others as note (note.id)}
        {@render noteCard(note)}
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
          {#if store.settings.templates.length}
            <hr />
            <div class="label">Modelos</div>
            {#each store.settings.templates as t (t.id)}
              <button class="item" onclick={() => (close(), newNote(t.type, t.title, t.content, t))}>
                <Icon name={t.type === 'checklist' ? 'checklist' : 'text'} />
                <span class="template-name">{t.name}</span>
              </button>
            {/each}
            <button class="item manage" onclick={() => (close(), (sheet = 'templates'))}>
              <Icon name="template" /> Gerir modelos
            </button>
          {/if}
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

  {#if sheet === 'colornote'}
    <ColorNoteImport onclose={() => (sheet = null)} {notify} />
  {:else if sheet === 'colornames'}
    <ColorNames onclose={() => (sheet = null)} {notify} />
  {:else if sheet === 'server'}
    <ServerStatus onclose={() => (sheet = null)} {notify} />
  {:else if sheet === 'templates'}
    <Templates onclose={() => (sheet = null)} {notify} />
  {:else if sheet === 'shortcuts'}
    <Shortcuts onclose={() => (sheet = null)} />
  {/if}

  {#if toast}
    {#key toast.key}
      <div class="toast" role="status">
        <span>{toast.message}</span>
        {#if toast.action}
          <button
            onclick={() => {
              toast?.action?.run();
              toast = null;
            }}>{toast.action.label}</button>
        {/if}
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

  .status.warn {
    color: var(--danger);
  }

  .status small {
    font-size: 0.75rem;
    font-weight: 600;
  }

  .syncing :global(svg) {
    animation: spin 1.2s linear infinite;
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

  .filter-name {
    flex: none;
    max-width: 40%;
    padding: 3px 10px;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--border);
    font-size: 0.85rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    max-width: min(300px, calc(100vw - 40px));
  }

  .template-name {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .manage {
    color: var(--text-2);
    font-size: 0.9rem;
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
