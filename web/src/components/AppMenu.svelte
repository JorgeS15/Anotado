<script lang="ts">
  import { langPref, setLangPref, t, type LangPref } from '../lib/i18n';
  import { pwa } from '../lib/pwa.svelte';
  import { store } from '../lib/store.svelte';
  import type { FontSize, Theme, View } from '../lib/types';
  import Icon from './Icon.svelte';
  import Popover from './Popover.svelte';

  const THEMES: { value: Theme; label: string }[] = [
    { value: 'auto', label: t('Automático') },
    { value: 'light', label: t('Claro') },
    { value: 'dark', label: t('Escuro') },
  ];
  const FONT_SIZES: { value: FontSize; label: string }[] = [
    { value: 'small', label: t('Pequena') },
    { value: 'normal', label: t('Normal') },
    { value: 'large', label: t('Grande') },
  ];
  const LANGS: { value: LangPref; label: string }[] = [
    { value: 'auto', label: t('Automático') },
    { value: 'pt', label: 'Português' },
    { value: 'en', label: 'English' },
  ];
  const currentLang = langPref();

  let {
    view,
    counts,
    theme = $bindable(),
    fontSize = $bindable(),
    ongo,
    onselect,
    onexport,
    onimport,
    oncolornote,
    oncolornames,
    onserver,
    onshortcuts,
    onlogout,
    onlogoutothers,
  }: {
    view: View;
    counts: { reminders: number; archive: number; trash: number };
    theme: Theme;
    fontSize: FontSize;
    ongo: (view: View) => void;
    onselect: () => void;
    onexport: () => void;
    onimport: () => void;
    oncolornote: () => void;
    oncolornames: () => void;
    onserver: () => void;
    onshortcuts: () => void;
    onlogout: () => void;
    onlogoutothers: () => void;
  } = $props();

  let open = $state(false);
</script>

<Popover bind:open>
  {#snippet trigger(toggle)}
    <button class="icon-btn menu-btn" onclick={toggle} aria-label="Menu">
      <Icon name="more" />
      {#if store.newVersion}<span class="badge" aria-hidden="true"></span>{/if}
    </button>
  {/snippet}
  {#snippet children(close)}
    <button class="item" class:selected={view === 'notes'} onclick={() => (close(), ongo('notes'))}>
      <Icon name="notes" /> {t('Notas')}
    </button>
    <button class="item" class:selected={view === 'reminders'} onclick={() => (close(), ongo('reminders'))}>
      <Icon name="bell" /> {t('Lembretes')} {#if counts.reminders}<span class="count">{counts.reminders}</span>{/if}
    </button>
    <button class="item" class:selected={view === 'archive'} onclick={() => (close(), ongo('archive'))}>
      <Icon name="archive" /> {t('Arquivo')} {#if counts.archive}<span class="count">{counts.archive}</span>{/if}
    </button>
    <button class="item" class:selected={view === 'trash'} onclick={() => (close(), ongo('trash'))}>
      <Icon name="trash" /> {t('Lixo')} {#if counts.trash}<span class="count">{counts.trash}</span>{/if}
    </button>
    <hr />
    <div class="label">{t('Tema')}</div>
    <div class="segmented" role="radiogroup" aria-label={t('Tema')}>
      {#each THEMES as th (th.value)}
        <button role="radio" aria-checked={theme === th.value} onclick={() => (theme = th.value)}>{th.label}</button>
      {/each}
    </div>
    <div class="label">{t('Tamanho da letra')}</div>
    <div class="segmented" role="radiogroup" aria-label={t('Tamanho da letra')}>
      {#each FONT_SIZES as f (f.value)}
        <button role="radio" aria-checked={fontSize === f.value} onclick={() => (fontSize = f.value)}>{f.label}</button>
      {/each}
    </div>
    <div class="label">{t('Língua')}</div>
    <div class="segmented" role="radiogroup" aria-label={t('Língua')}>
      {#each LANGS as l (l.value)}
        <button role="radio" aria-checked={currentLang === l.value} onclick={() => setLangPref(l.value)}>{l.label}</button>
      {/each}
    </div>
    <hr />
    <button class="item" onclick={() => (close(), onselect())}><Icon name="select" /> {t('Selecionar notas')}</button>
    <button class="item" onclick={() => (close(), oncolornames())}><Icon name="palette" /> {t('Nomes das cores')}</button>
    {#if pwa.canInstall}
      <button class="item" onclick={() => (close(), pwa.install())}><Icon name="download" /> {t('Instalar app')}</button>
    {/if}
    <hr />
    <button class="item" onclick={() => (close(), onexport())}><Icon name="download" /> {t('Exportar backup')}</button>
    <button class="item" onclick={() => (close(), onimport())}><Icon name="upload" /> {t('Importar backup')}</button>
    <button class="item" onclick={() => (close(), oncolornote())}><Icon name="colornote" /> {t('Importar do ColorNote')}</button>
    <button class="item" onclick={() => (close(), onserver())}><Icon name="server" /> {t('Servidor e backups')}</button>
    <hr />
    <button class="item" onclick={() => (close(), onshortcuts())}><Icon name="keyboard" /> {t('Atalhos de teclado')}</button>
    <button class="item" onclick={() => (close(), onlogout())}><Icon name="logout" /> {t('Terminar sessão')}</button>
    <button class="item" onclick={() => (close(), onlogoutothers())}>
      <Icon name="logout" /> {t('Terminar sessão nos outros dispositivos')}
    </button>
    {#if store.newVersion}
      <a class="item new-version" href={store.newVersion.url} target="_blank" rel="noopener noreferrer">
        <Icon name="update" /> {t('Nova versão: v{version}', { version: store.newVersion.version })}
      </a>
    {/if}
    <div class="version">Anotado v{__APP_VERSION__}</div>
  {/snippet}
</Popover>

<style>
  .menu-btn {
    position: relative;
  }

  .badge {
    position: absolute;
    top: 9px;
    right: 9px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 2px var(--bg);
  }

  .count {
    margin-left: auto;
    font-size: 0.8rem;
    color: var(--text-2);
  }

  .segmented {
    display: flex;
    gap: 2px;
    margin: 2px 8px 8px;
    padding: 3px;
    border-radius: 10px;
    background: var(--surface-2);
  }

  .segmented button {
    flex: 1;
    padding: 6px 4px;
    border-radius: 8px;
    font-size: 0.85rem;
    white-space: nowrap;
  }

  .segmented button[aria-checked='true'] {
    background: var(--surface);
    box-shadow: var(--shadow);
    font-weight: 600;
  }

  .new-version {
    color: var(--accent);
    font-weight: 600;
    text-decoration: none;
  }

  .version {
    padding: 8px 12px 4px;
    font-size: 0.75rem;
    color: var(--text-2);
  }
</style>
