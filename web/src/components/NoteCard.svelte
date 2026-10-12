<script lang="ts">
  import type { Note } from '../lib/types';
  import { formatShort } from '../lib/util';
  import Icon from './Icon.svelte';

  let { note, compact = false, onopen }: { note: Note; compact?: boolean; onopen: () => void } = $props();

  const maxItems = $derived(compact ? 3 : 8);
  const ordered = $derived([...note.items.filter((i) => !i.done), ...note.items.filter((i) => i.done)]);
  const shown = $derived(ordered.slice(0, maxItems));
  const doneCount = $derived(note.items.filter((i) => i.done).length);
</script>

<button class="card" class:compact style:--note="var(--note-{note.color})" onclick={onopen}>
  {#if note.title || note.pinned}
    <div class="head">
      {#if note.title}<h3>{note.title}</h3>{/if}
      {#if note.pinned}<span class="pin" title="Fixada"><Icon name="pin" size={16} /></span>{/if}
    </div>
  {/if}

  {#if note.type === 'checklist'}
    <ul>
      {#each shown as item (item.id)}
        <li class:done={item.done}>
          <Icon name={item.done ? 'boxChecked' : 'box'} size={16} />
          <span>{item.text}</span>
        </li>
      {/each}
    </ul>
    {#if note.items.length > shown.length || doneCount}
      <p class="meta">
        {#if note.items.length > shown.length}+{note.items.length - shown.length} itens · {/if}{doneCount}/{note.items.length}
      </p>
    {/if}
  {:else if note.content}
    <p class="text">{note.content}</p>
  {/if}

  {#if !note.title && !note.content && !note.items.length}
    <p class="text empty">Nota vazia</p>
  {/if}

  <span class="date">{formatShort(note.updated_at)}</span>
</button>

<style>
  .card {
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
