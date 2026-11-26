<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { trapFocus } from '../lib/focus';
  import Icon from './Icon.svelte';

  let {
    title,
    onclose,
    children,
  }: { title: string; onclose: () => void; children: Snippet } = $props();

  let sheet: HTMLElement;

  onMount(() => trapFocus(sheet, onclose));
</script>

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="sheet" role="dialog" aria-modal="true" aria-label={title} bind:this={sheet}>
    <header>
      <h2>{title}</h2>
      <button class="icon-btn" onclick={onclose} aria-label="Fechar"><Icon name="close" /></button>
    </header>
    <div class="content">
      {@render children()}
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 16px;
    animation: fade 0.12s ease;
  }

  .sheet {
    width: min(600px, 100%);
    max-height: min(88dvh, 100%);
    display: flex;
    flex-direction: column;
    background: var(--surface);
    color: var(--text);
    border-radius: 18px;
    box-shadow: var(--shadow-lg);
    overflow: hidden;
  }

  header {
    display: flex;
    align-items: center;
    padding: 8px 8px 8px 20px;
    border-bottom: 1px solid var(--border);
  }

  h2 {
    flex: 1;
    margin: 0;
    font-size: 1.1rem;
  }

  .content {
    overflow-y: auto;
    padding: 16px 20px 20px;
  }

  @keyframes fade {
    from {
      opacity: 0;
    }
  }
</style>
