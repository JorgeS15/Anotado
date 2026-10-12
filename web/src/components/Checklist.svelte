<script lang="ts">
  import { tick } from 'svelte';
  import { autogrow } from '../lib/autogrow';
  import type { ChecklistItem } from '../lib/types';
  import { uid } from '../lib/util';
  import Icon from './Icon.svelte';

  let {
    items,
    readonly = false,
    onchange,
  }: { items: ChecklistItem[]; readonly?: boolean; onchange: () => void } = $props();

  let listEl: HTMLElement;
  let dragId = $state<string | null>(null);

  const open = $derived(items.filter((i) => !i.done));
  const done = $derived(items.filter((i) => i.done));

  async function focusItem(id: string, atEnd = true) {
    await tick();
    const el = document.querySelector<HTMLTextAreaElement>(`[data-item="${id}"]`);
    if (!el) return;
    el.focus();
    if (atEnd) el.setSelectionRange(el.value.length, el.value.length);
  }

  function add(afterId?: string, text = '') {
    const item: ChecklistItem = { id: uid(), text, done: false };
    const index = afterId ? items.findIndex((i) => i.id === afterId) + 1 : lastOpenIndex() + 1;
    items.splice(index, 0, item);
    onchange();
    focusItem(item.id, false);
  }

  function lastOpenIndex() {
    for (let i = items.length - 1; i >= 0; i--) if (!items[i].done) return i;
    return -1;
  }

  function remove(item: ChecklistItem, focusPrevious = false) {
    const visible = item.done ? done : open;
    const prev = visible[visible.indexOf(item) - 1];
    items.splice(items.indexOf(item), 1);
    onchange();
    if (focusPrevious && prev) focusItem(prev.id);
  }

  function onkeydown(e: KeyboardEvent, item: ChecklistItem) {
    const el = e.currentTarget as HTMLTextAreaElement;
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      // Split the item at the cursor, like a text editor.
      const rest = el.value.slice(el.selectionEnd);
      item.text = el.value.slice(0, el.selectionStart);
      add(item.id, rest);
    } else if (e.key === 'Backspace' && el.selectionStart === 0 && el.selectionEnd === 0) {
      const visible = item.done ? done : open;
      const prev = visible[visible.indexOf(item) - 1];
      if (!item.text) {
        e.preventDefault();
        remove(item, true);
      } else if (prev) {
        // Merge into the previous item.
        e.preventDefault();
        const caret = prev.text.length;
        prev.text += item.text;
        remove(item);
        tick().then(() => {
          const prevEl = document.querySelector<HTMLTextAreaElement>(`[data-item="${prev.id}"]`);
          prevEl?.focus();
          prevEl?.setSelectionRange(caret, caret);
        });
      }
    }
  }

  function toggle(item: ChecklistItem) {
    item.done = !item.done;
    onchange();
  }

  function startDrag(e: PointerEvent, item: ChecklistItem) {
    if (readonly) return;
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    dragId = item.id;

    const move = (ev: PointerEvent) => {
      for (const row of listEl.querySelectorAll<HTMLElement>('[data-row]')) {
        const rect = row.getBoundingClientRect();
        if (ev.clientY < rect.top || ev.clientY > rect.bottom) continue;
        const target = items.find((i) => i.id === row.dataset.row);
        if (target && target !== item) {
          const to = items.indexOf(target);
          items.splice(items.indexOf(item), 1);
          items.splice(to, 0, item);
        }
        break;
      }
    };
    const end = () => {
      dragId = null;
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      onchange();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }
</script>

{#snippet row(item: ChecklistItem)}
  <li data-row={item.id} class:done={item.done} class:dragging={dragId === item.id}>
    {#if !item.done && !readonly}
      <span class="grip" onpointerdown={(e) => startDrag(e, item)} aria-hidden="true">
        <Icon name="grip" size={18} />
      </span>
    {:else}
      <span class="grip-space"></span>
    {/if}
    <button
      class="check"
      type="button"
      role="checkbox"
      aria-checked={item.done}
      aria-label={item.done ? 'Desmarcar' : 'Marcar como feito'}
      disabled={readonly}
      onclick={() => toggle(item)}>
      <Icon name={item.done ? 'boxChecked' : 'box'} />
    </button>
    <textarea
      data-item={item.id}
      rows="1"
      bind:value={item.text}
      use:autogrow={item.text}
      {readonly}
      placeholder="Item"
      oninput={onchange}
      onkeydown={(e) => onkeydown(e, item)}></textarea>
    {#if !readonly}
      <button class="remove" type="button" aria-label="Remover item" onclick={() => remove(item)}>
        <Icon name="close" size={18} />
      </button>
    {/if}
  </li>
{/snippet}

<div class="checklist">
  <ul bind:this={listEl}>
    {#each open as item (item.id)}
      {@render row(item)}
    {/each}
  </ul>

  {#if !readonly}
    <button class="add" type="button" onclick={() => add()}>
      <Icon name="plus" size={20} /> Adicionar item
    </button>
  {/if}

  {#if done.length}
    <p class="done-label">{done.length} {done.length === 1 ? 'item concluído' : 'itens concluídos'}</p>
    <ul>
      {#each done as item (item.id)}
        {@render row(item)}
      {/each}
    </ul>
  {/if}
</div>

<style>
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    display: flex;
    align-items: flex-start;
    gap: 2px;
    border-radius: 10px;
  }

  li.dragging {
    background: color-mix(in srgb, currentColor 8%, transparent);
  }

  .grip,
  .grip-space {
    width: 22px;
    height: 40px;
    flex: none;
    display: grid;
    place-items: center;
    opacity: 0.35;
    touch-action: none;
    cursor: grab;
  }

  .check {
    width: 38px;
    height: 40px;
    flex: none;
    display: grid;
    place-items: center;
  }

  textarea {
    flex: 1;
    min-width: 0;
    padding: 8px 4px;
    border: none;
    background: transparent;
    outline: none;
    resize: none;
    overflow: hidden;
    line-height: 1.5;
  }

  li.done textarea {
    text-decoration: line-through;
    opacity: 0.55;
  }

  .remove {
    width: 36px;
    height: 40px;
    flex: none;
    display: grid;
    place-items: center;
    opacity: 0;
  }

  li:hover .remove,
  li:focus-within .remove {
    opacity: 0.5;
  }

  @media (hover: none) {
    .remove {
      opacity: 0.35;
    }
  }

  .add {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 6px 8px 32px;
    opacity: 0.6;
  }

  .done-label {
    margin: 16px 0 4px 32px;
    font-size: 0.85rem;
    opacity: 0.6;
  }
</style>
