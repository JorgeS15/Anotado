<script lang="ts">
  import { t, tn } from '../lib/i18n';
  import { store } from '../lib/store.svelte';
  import type { Template } from '../lib/types';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';

  let { onclose, notify }: { onclose: () => void; notify: (message: string, undo?: () => void) => void } = $props();

  function remove(template: Template) {
    const before = $state.snapshot(store.settings.templates);
    store.saveSettings({
      ...$state.snapshot(store.settings),
      templates: before.filter((tpl) => tpl.id !== template.id),
    });
    notify(t('Modelo "{name}" apagado', { name: template.name }), () =>
      store.saveSettings({ ...$state.snapshot(store.settings), templates: before }),
    );
  }

  function summary(tpl: Template) {
    if (tpl.type === 'checklist') return tn(tpl.items.length, '{n} item', '{n} itens');
    return tpl.content.slice(0, 60) || t('Texto');
  }
</script>

<Sheet title={t('Modelos')} {onclose}>
  <p class="help">
    {t('Para criar um modelo, abre uma nota e escolhe Mais opções → Guardar como modelo. As notas criadas a partir de um modelo começam com os itens por marcar.')}
  </p>
  {#if !store.settings.templates.length}
    <p class="help">{t('Ainda não tens modelos.')}</p>
  {:else}
    <ul>
      {#each store.settings.templates as tpl (tpl.id)}
        <li>
          <span class="dot" style:--dot="var(--dot-{tpl.color})" aria-hidden="true"></span>
          <div class="name">
            <strong>{tpl.name}</strong>
            <small>{summary(tpl)}</small>
          </div>
          <button
            class="icon-btn"
            title={t('Apagar modelo')}
            aria-label={t('Apagar modelo {name}', { name: tpl.name })}
            onclick={() => remove(tpl)}>
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
