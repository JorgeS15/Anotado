<script lang="ts">
  import { t } from '../lib/i18n';
  import { store } from '../lib/store.svelte';
  import { COLORS, COLOR_LABELS, type Color } from '../lib/types';
  import Sheet from './Sheet.svelte';

  let { onclose, notify }: { onclose: () => void; notify: (message: string) => void } = $props();

  // svelte-ignore state_referenced_locally
  let names = $state<Record<Color, string>>(
    Object.fromEntries(COLORS.map((c) => [c, store.settings.color_names[c] ?? ''])) as Record<Color, string>,
  );

  function save(e: SubmitEvent) {
    e.preventDefault();
    const color_names: Partial<Record<Color, string>> = {};
    for (const c of COLORS) if (names[c].trim()) color_names[c] = names[c].trim();
    store.saveSettings({ ...$state.snapshot(store.settings), color_names });
    notify(t('Nomes das cores guardados'));
    onclose();
  }
</script>

<Sheet title={t('Nomes das cores')} {onclose}>
  <form onsubmit={save}>
    <p class="help">
      {t('Dá um nome às cores que usas como categorias (por exemplo, verde = "Compras"). Aparece no filtro e ao escolher a cor, em todos os dispositivos.')}
    </p>
    <ul>
      {#each COLORS as color (color)}
        <li>
          <span class="dot" style:--dot="var(--dot-{color})" aria-hidden="true"></span>
          <label>
            <span class="sr-only">{t('Nome para {color}', { color: COLOR_LABELS[color] })}</span>
            <input type="text" maxlength="40" placeholder={COLOR_LABELS[color]} bind:value={names[color]} />
          </label>
        </li>
      {/each}
    </ul>
    <div class="actions">
      <button class="btn ghost" type="button" onclick={onclose}>{t('Cancelar')}</button>
      <button class="btn" type="submit">{t('Guardar')}</button>
    </div>
  </form>
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
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  li {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  label {
    flex: 1;
  }

  .dot {
    flex: none;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--dot);
    border: 1px solid rgba(0, 0, 0, 0.15);
  }

  input {
    width: 100%;
    padding: 9px 12px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 16px;
  }
</style>
