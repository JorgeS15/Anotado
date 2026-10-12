<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    open = $bindable(false),
    align = 'right',
    up = false,
    trigger,
    children,
  }: {
    open?: boolean;
    align?: 'left' | 'right';
    up?: boolean;
    trigger: Snippet<[() => void]>;
    children: Snippet<[() => void]>;
  } = $props();

  let root: HTMLElement;
  const toggle = () => (open = !open);
  const close = () => (open = false);

  $effect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  });
</script>

<div class="popover" bind:this={root}>
  {@render trigger(toggle)}
  {#if open}
    <div class="panel" class:left={align === 'left'} class:up role="menu">
      {@render children(close)}
    </div>
  {/if}
</div>

<style>
  .popover {
    position: relative;
  }

  .panel {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 50;
    min-width: 220px;
    padding: 6px;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: var(--shadow-lg);
  }

  .panel.left {
    right: auto;
    left: 0;
  }

  .panel.up {
    top: auto;
    bottom: calc(100% + 6px);
  }

  .panel :global(.item) {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 10px 12px;
    border-radius: 9px;
    text-align: left;
    white-space: nowrap;
  }

  .panel :global(.item:hover) {
    background: var(--surface-2);
  }

  .panel :global(.item.selected) {
    color: var(--accent);
    font-weight: 600;
  }

  .panel :global(.item.danger) {
    color: var(--danger);
  }

  .panel :global(hr) {
    border: none;
    border-top: 1px solid var(--border);
    margin: 6px 4px;
  }

  .panel :global(.label) {
    padding: 6px 12px 2px;
    font-size: 0.78rem;
    color: var(--text-2);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
</style>
