<script lang="ts">
  import { colorLabel, store } from '../lib/store.svelte';
  import { COLORS, type Color } from '../lib/types';
  import Icon from './Icon.svelte';

  let { value, onpick }: { value: Color | null; onpick: (color: Color) => void } = $props();

  const named = $derived(Object.keys(store.settings.color_names).length > 0);
</script>

<div class="colors" class:named role="radiogroup" aria-label="Cor">
  {#each COLORS as color (color)}
    <button
      type="button"
      role="radio"
      aria-checked={value === color}
      title={colorLabel(color)}
      aria-label={colorLabel(color)}
      onclick={() => onpick(color)}>
      <span class="dot" style:--dot="var(--dot-{color})">
        {#if value === color}<Icon name="check" size={16} />{/if}
      </span>
      {#if named && store.settings.color_names[color]}<small>{store.settings.color_names[color]}</small>{/if}
    </button>
  {/each}
</div>

<style>
  .colors {
    display: grid;
    grid-template-columns: repeat(5, 36px);
    gap: 10px;
  }

  .colors.named {
    grid-template-columns: repeat(5, 52px);
    gap: 8px 4px;
  }

  button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    min-width: 0;
  }

  .dot {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--dot);
    border: 1px solid rgba(0, 0, 0, 0.15);
    display: grid;
    place-items: center;
    color: #222;
  }

  small {
    max-width: 100%;
    font-size: 0.68rem;
    line-height: 1.2;
    color: var(--text-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
