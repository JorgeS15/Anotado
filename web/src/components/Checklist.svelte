<script lang="ts">
  import { t, tn } from '../lib/i18n';
  import { tick } from 'svelte';
  import { autogrow } from '../lib/autogrow';
  import { LIMITS, formatCount } from '../lib/limits';
  import type { ChecklistItem } from '../lib/types';
  import { uid } from '../lib/util';
  import Icon from './Icon.svelte';

  let {
    items,
    readonly = false,
    hideDone = false,
    onchange,
    ontogglehidden,
  }: {
    items: ChecklistItem[];
    readonly?: boolean;
    /** Collapse the ticked items under their count. */
    hideDone?: boolean;
    onchange: () => void;
    ontogglehidden?: () => void;
  } = $props();

  let listEl: HTMLElement;
  let dragId = $state<string | null>(null);

  const open = $derived(items.filter((i) => !i.done));
  const done = $derived(items.filter((i) => i.done));
  const full = $derived(items.length >= LIMITS.items);

  async function focusItem(id: string, atEnd = true) {
    await tick();
    const el = document.querySelector<HTMLTextAreaElement>(`[data-item="${id}"]`);
    if (!el) return;
    el.focus();
    if (atEnd) el.setSelectionRange(el.value.length, el.value.length);
  }

  function add(afterId?: string, text = '', indent?: 1) {
    if (items.length >= LIMITS.items) return;
    const item: ChecklistItem = { id: uid(), text, done: false, ...(indent && { indent }) };
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

  /** Moves an item up or down among the items in its section (open or done). */
  function move(item: ChecklistItem, by: -1 | 1) {
    const visible = item.done ? done : open;
    const target = visible[visible.indexOf(item) + by];
    if (!target) return;
    const from = items.indexOf(item);
    items.splice(from, 1);
    items.splice(items.indexOf(target) + (by > 0 ? 1 : 0), 0, item);
    onchange();
    focusItem(item.id);
  }

  /** A sub-item needs an item above it in the same section. */
  function setIndent(item: ChecklistItem, indent: boolean) {
    const visible = item.done ? done : open;
    if (indent && visible.indexOf(item) <= 0) return false;
    if (indent === (item.indent === 1)) return false;
    if (indent) item.indent = 1;
    else delete item.indent;
    onchange();
    return true;
  }

  function onkeydown(e: KeyboardEvent, item: ChecklistItem) {
    const el = e.currentTarget as HTMLTextAreaElement;
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      // Tab makes a sub-item, Shift+Tab undoes it. At the edges, Tab keeps moving the focus.
      if (setIndent(item, !e.shiftKey)) e.preventDefault();
      return;
    }
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      move(item, e.key === 'ArrowUp' ? -1 : 1);
    } else if ((e.ctrlKey || e.metaKey) && e.key === ' ') {
      e.preventDefault();
      toggle(item);
      focusItem(item.id);
    } else if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.isComposing) {
      e.preventDefault();
      // At the item limit a split would drop the text after the cursor.
      if (full) return;
      // Split the item at the cursor, like a text editor.
      const rest = el.value.slice(el.selectionEnd);
      item.text = el.value.slice(0, el.selectionStart);
      add(item.id, rest, item.indent);
    } else if (e.key === 'Backspace' && el.selectionStart === 0 && el.selectionEnd === 0) {
      const visible = item.done ? done : open;
      const prev = visible[visible.indexOf(item) - 1];
      if (!item.text && item.indent) {
        // An empty sub-item first goes back to the top level, like in a text editor.
        e.preventDefault();
        setIndent(item, false);
      } else if (!item.text) {
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
    // Listen on the window: moving the row in the page would drop a pointer capture on its handle,
    // and the end of the drag (which saves the new order) would never arrive.
    const pointer = e.pointerId;
    const startX = e.clientX;
    dragId = item.id;

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointer) return;
      // Dragging sideways makes it a sub-item (right) or a top-level item (left).
      const dx = ev.clientX - startX;
      if (dx > 32 && !item.indent) setIndent(item, true);
      else if (dx < -32 && item.indent) setIndent(item, false);
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
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== pointer) return;
      dragId = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      onchange();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }
</script>

{#snippet row(item: ChecklistItem)}
  <li data-row={item.id} class:done={item.done} class:sub={item.indent === 1} class:dragging={dragId === item.id}>
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
      aria-label={item.done ? t('Desmarcar') : t('Marcar como feito')}
      disabled={readonly}
      onclick={() => toggle(item)}>
      <Icon name={item.done ? 'boxChecked' : 'box'} />
    </button>
    <textarea
      data-item={item.id}
      rows="1"
      maxlength={LIMITS.itemText}
      bind:value={item.text}
      use:autogrow={item.text}
      {readonly}
      placeholder={t('Item')}
      oninput={onchange}
      onkeydown={(e) => onkeydown(e, item)}></textarea>
    {#if !readonly}
      <button class="remove" type="button" aria-label={t('Remover item')} onclick={() => remove(item)}>
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
    {#if full}
      <p class="full">{t('Limite de {max} itens atingido.', { max: formatCount(LIMITS.items) })}</p>
    {:else}
      <button class="add" type="button" onclick={() => add()}>
        <Icon name="plus" size={20} /> {t('Adicionar item')}
      </button>
    {/if}
  {/if}

  {#if done.length}
    {#if ontogglehidden}
      <button class="done-label toggle" type="button" aria-expanded={!hideDone} onclick={ontogglehidden}>
        <span class="chevron" class:closed={hideDone}><Icon name="chevron" size={16} /></span>
        {tn(done.length, '{n} item concluído', '{n} itens concluídos')}
      </button>
    {:else}
      <p class="done-label">{tn(done.length, '{n} item concluído', '{n} itens concluídos')}</p>
    {/if}
    {#if !hideDone}
      <ul>
        {#each done as item (item.id)}
          {@render row(item)}
        {/each}
      </ul>
    {/if}
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

  li.sub {
    margin-left: 30px;
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

  .full {
    margin: 8px 0 8px 32px;
    font-size: 0.85rem;
    color: var(--danger);
  }

  .done-label {
    margin: 16px 0 4px 32px;
    font-size: 0.85rem;
    opacity: 0.6;
  }

  .toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: 10px;
    padding: 4px 6px;
    border-radius: 8px;
  }

  .toggle:hover {
    opacity: 0.85;
  }

  .chevron {
    display: inline-flex;
    transition: transform 0.15s ease;
  }

  .chevron.closed {
    transform: rotate(-90deg);
  }
</style>
