<script lang="ts">
  import { store } from '../lib/store.svelte';
  import type { Template } from '../lib/types';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';

  let { onclose, notify }: { onclose: () => void; notify: (message: string, undo?: () => void) => void } = $props();

  function remove(template: Template) {
    const before = $state.snapshot(store.settings.templates);
    store.saveSettings({
      ...$state.snapshot(store.settings),
      templates: before.filter((t) => t.id !== template.id),
    });
    notify(`Modelo "${template.name}" apagado`, () =>
      store.saveSettings({ ...$state.snapshot(store.settings), templates: before }),
    );
  }

  function summary(t: Template) {
    if (t.type === 'checklist') return `${t.items.length} ${t.items.length === 1 ? 'item' : 'itens'}`;
    return t.content.slice(0, 60) || 'Texto';
  }
</script>

<Sheet title="Modelos" {onclose}>
  <p class="help">
    Para criar um modelo, abre uma nota e escolhe <strong>Mais opções → Guardar como modelo</strong>. As notas criadas a
    partir de um modelo começam com os itens por marcar.
  </p>
  {#if !store.settings.templates.length}
    <p class="help">Ainda não tens modelos.</p>
  {:else}
    <ul>
      {#each store.settings.templates as t (t.id)}
        <li>
          <span class="dot" style:--dot="var(--dot-{t.color})" aria-hidden="true"></span>
          <div class="name">
            <strong>{t.name}</strong>
            <small>{summary(t)}</small>
          </div>
          <button class="icon-btn" title="Apagar modelo" aria-label="Apagar modelo {t.name}" onclick={() => remove(t)}>
            <Icon name="trash" size={20} />
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</Sheet>

<style>
  .help {
    margin: 0 0 12px;
    color: var(--text-2);
    font-size: 0.9rem;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 0;
    border-top: 1px solid var(--border);
  }

  .dot {
    flex: none;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--dot);
    border: 1px solid rgba(0, 0, 0, 0.15);
  }

  .name {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .name small {
    color: var(--text-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
