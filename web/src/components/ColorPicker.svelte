<script lang="ts">
  import { COLORS, COLOR_LABELS, type Color } from '../lib/types';
  import Icon from './Icon.svelte';

  let { value, onpick }: { value: Color | null; onpick: (color: Color) => void } = $props();
</script>

<div class="colors" role="radiogroup" aria-label="Cor">
  {#each COLORS as color (color)}
    <button
      type="button"
      role="radio"
      aria-checked={value === color}
      title={COLOR_LABELS[color]}
      aria-label={COLOR_LABELS[color]}
      style:--dot="var(--dot-{color})"
      onclick={() => onpick(color)}>
      {#if value === color}<Icon name="check" size={16} />{/if}
    </button>
  {/each}
</div>

<style>
  .colors {
    display: grid;
    grid-template-columns: repeat(5, 36px);
    gap: 10px;
  }

  button {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--dot);
    border: 1px solid rgba(0, 0, 0, 0.15);
    display: grid;
    place-items: center;
    color: #222;
  }
</style>
