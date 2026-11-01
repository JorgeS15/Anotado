<script lang="ts">
  import { highlight } from '../lib/highlight';
  import type { Note } from '../lib/types';
  import { formatShort, normalize } from '../lib/util';
  import Icon from './Icon.svelte';

  let {
    note,
    compact = false,
    query = '',
    selecting = false,
    selected = false,
    onopen,
    onselect,
  }: {
    note: Note;
    compact?: boolean;
    query?: string;
    selecting?: boolean;
    selected?: boolean;
    onopen: () => void;
    onselect: () => void;
  } = $props();

  const maxItems = $derived(compact ? 3 : 8);
  const q = $derived(normalize(query.trim()));
  const ordered = $derived.by(() => {
    const items = [...note.items.filter((i) => !i.done), ...note.items.filter((i) => i.done)];
    // When searching, show the matching items first.
    return q ? [...items.filter((i) => normalize(i.text).includes(q)), ...items.filter((i) => !normalize(i.text).includes(q))] : items;
  });
  const shown = $derived(ordered.slice(0, maxItems));
  const doneCount = $derived(note.items.filter((i) => i.done).length);

  /** If the match is far into a long text, start the preview just before it. */
  const preview = $derived.by(() => {
    const at = q ? normalize(note.content).indexOf(q) : -1;
    if (at < 160) return note.content;
    const start = note.content.lastIndexOf('\n', at - 40) + 1 || Math.max(0, at - 40);
    return '…' + note.content.slice(start);
  });

  // Long press (touch or mouse) and right click start selection.
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let longPressed = false;
  let startX = 0;
  let startY = 0;

  function onpointerdown(e: PointerEvent) {
    if (e.button !== 0) return;
    longPressed = false;
    startX = e.clientX;
    startY = e.clientY;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      longPressed = true;
      navigator.vibrate?.(15);
      onselect();
    }, 500);
  }

  function onpointermove(e: PointerEvent) {
    if (Math.abs(e.clientX - startX) > 8 || Math.abs(e.clientY - startY) > 8) clearTimeout(pressTimer);
  }

  function cancelPress() {
    clearTimeout(pressTimer);
  }

  function onclick(e: MouseEvent) {
    if (longPressed) {
      longPressed = false;
      return;
    }
    if (selecting || e.ctrlKey || e.metaKey) onselect();
    else onopen();
  }

  function oncontextmenu(e: MouseEvent) {
    e.preventDefault();
    clearTimeout(pressTimer);
    if (!longPressed) onselect();
    longPressed = true;
  }
</script>

{#snippet marked(text: string)}{#each highlight(text, query) as seg, i (i)}{#if seg.match}<mark>{seg.text}</mark>{:else}{seg.text}{/if}{/each}{/snippet}

<button
  class="card"
  class:compact
  class:selected
  style:--note="var(--note-{note.color})"
  aria-pressed={selecting ? selected : undefined}
  {onclick}
  {onpointerdown}
  {onpointermove}
  onpointerup={cancelPress}
  onpointercancel={cancelPress}
  onpointerleave={cancelPress}
  {oncontextmenu}>
  {#if selecting}
    <span class="tick" aria-hidden="true"><Icon name={selected ? 'boxChecked' : 'box'} size={20} /></span>
  {/if}
  {#if note.title || note.pinned}
    <div class="head">
      {#if note.title}<h3>{@render marked(note.title)}</h3>{/if}
      {#if note.pinned && !selecting}<span class="pin" title="Fixada"><Icon name="pin" size={16} /></span>{/if}
    </div>
  {/if}

  {#if note.type === 'checklist'}
    <ul>
      {#each shown as item (item.id)}
        <li class:done={item.done}>
          <Icon name={item.done ? 'boxChecked' : 'box'} size={16} />
          <span>{@render marked(item.text)}</span>
        </li>
      {/each}
    </ul>
    {#if note.items.length > shown.length || doneCount}
      <p class="meta">
        {#if note.items.length > shown.length}+{note.items.length - shown.length} itens · {/if}{doneCount}/{note.items.length}
      </p>
    {/if}
  {:else if note.content}
    <p class="text">{@render marked(preview)}</p>
  {/if}

  {#if !note.title && !note.content && !note.items.length}
    <p class="text empty">Nota vazia</p>
  {/if}

  <span class="date">{formatShort(note.updated_at)}</span>
</button>

<style>
  .card {
    position: relative;
    -webkit-touch-callout: none;
    user-select: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
    min-height: 92px;
    padding: 12px 14px 10px;
    text-align: left;
    background: var(--note);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    border: 1px solid var(--border);
    overflow: hidden;
    transition: transform 0.12s ease;
  }

  .card.selected {
    outline: 3px solid var(--text);
    outline-offset: 1px;
  }

  .tick {
    position: absolute;
    top: 8px;
    right: 8px;
    opacity: 0.8;
  }

  .selected .tick {
    opacity: 1;
  }

  mark {
    background: color-mix(in srgb, var(--accent) 45%, transparent);
    color: inherit;
    border-radius: 3px;
    padding: 0 1px;
  }

  .card:active {
    transform: scale(0.98);
  }

  .head {
    display: flex;
    gap: 6px;
    align-items: flex-start;
  }

  h3 {
    flex: 1;
    margin: 0;
    font-size: 1rem;
    font-weight: 650;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .pin {
    margin-left: auto;
    opacity: 0.6;
  }

  .text {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 0.92rem;
    display: -webkit-box;
    -webkit-line-clamp: 8;
    line-clamp: 8;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .compact .text {
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }

  .empty {
    opacity: 0.5;
    font-style: italic;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 0.92rem;
  }

  li {
    display: flex;
    gap: 6px;
    align-items: flex-start;
  }

  li :global(svg) {
    margin-top: 2px;
    opacity: 0.7;
  }

  li span {
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  li.done span {
    text-decoration: line-through;
    opacity: 0.55;
  }

  .meta,
  .date {
    margin: 0;
    font-size: 0.75rem;
    opacity: 0.6;
  }

  .date {
    margin-top: auto;
    padding-top: 2px;
  }
</style>
