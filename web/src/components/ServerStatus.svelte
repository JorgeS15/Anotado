<script lang="ts">
  import { locale, t, tn } from '../lib/i18n';
  import { onMount } from 'svelte';
  import { disablePush, enablePush, pushState, testPush, type PushState } from '../lib/push';
  import { store } from '../lib/store.svelte';
  import type { BackupInfo, ServerStatus } from '../lib/types';
  import { formatFull } from '../lib/util';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';

  let { onclose, notify }: { onclose: () => void; notify: (message: string) => void } = $props();

  let status = $state<ServerStatus | null>(null);
  let error = $state('');
  let busy = $state<string | null>(null);
  let push = $state<PushState | null>(null);

  onMount(() => {
    load();
    pushState().then((s) => (push = s));
  });

  async function togglePush() {
    try {
      push = push === 'on' ? await disablePush() : await enablePush();
      if (push === 'denied') notify(t('As notificações estão bloqueadas: permite-as nas definições do browser.'));
    } catch {
      notify(t('Não foi possível ativar as notificações neste dispositivo.'));
    }
  }

  async function test() {
    try {
      const sent = await testPush();
      notify(
        sent
          ? tn(sent, 'Notificação de teste enviada para {n} dispositivo.', 'Notificação de teste enviada para {n} dispositivos.')
          : t('Nenhum dispositivo recebeu a notificação.'),
      );
    } catch {
      notify(t('Não foi possível enviar (sem ligação?).'));
    }
  }

  async function load() {
    try {
      status = await store.status();
      error = '';
    } catch {
      error = t('O estado do servidor precisa de ligação.');
    }
  }

  function size(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString(locale, { maximumFractionDigits: 0 })} KB`;
    return `${(bytes / 1024 / 1024).toLocaleString(locale, { maximumFractionDigits: 1 })} MB`;
  }

  function day(backup: BackupInfo) {
    const [, y, m, d] = /(\d{4})-(\d{2})-(\d{2})/.exec(backup.name) ?? [];
    return y ? new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString(locale, { dateStyle: 'full' }) : backup.name;
  }

  async function restore(backup: BackupInfo) {
    const message =
      t('Restaurar as notas como estavam em {day}?', { day: day(backup) }) +
      '\n\n' +
      t(
        'As notas alteradas ou apagadas desde então voltam ao que eram (a versão atual fica no histórico de cada nota). As notas criadas depois não são tocadas.',
      );
    if (!confirm(message)) return;
    busy = backup.name;
    try {
      notify(await store.restoreBackup(backup.name));
      onclose();
    } catch {
      error = t('Não foi possível restaurar (sem ligação?).');
    }
    busy = null;
  }
</script>

<Sheet title={t('Servidor e backups')} {onclose}>
  {#if error}
    <p class="error" role="alert">{error}</p>
  {:else if !status}
    <p class="info">{t('A carregar…')}</p>
  {:else}
    {#if status.update}
      <a class="update" href={status.update.url} target="_blank" rel="noopener noreferrer">
        <Icon name="update" size={18} />
        <span>{t('Há uma versão nova do Anotado: v{version}. Vê o que mudou.', { version: status.update.version })}</span>
      </a>
    {/if}
    <dl class="stats">
      <div><dt>{t('Notas')}</dt><dd>{status.notes}</dd></div>
      <div><dt>{t('Arquivadas')}</dt><dd>{status.archived}</dd></div>
      <div><dt>{t('No lixo')}</dt><dd>{status.trashed}</dd></div>
      <div><dt>{t('Base de dados')}</dt><dd>{size(status.db_size)}</dd></div>
      <div><dt>{t('Servidor')}</dt><dd>v{status.version}</dd></div>
      <div><dt>{t('Lixo')}</dt><dd>{tn(status.trash_days, '{n} dia', '{n} dias')}</dd></div>
    </dl>
    <p class="info">
      {status.api_token ? t('Token de API (automações): ativo.') : t('Token de API (automações): desligado.')}
      {#if !status.api_token}{t('Define ANOTADO_API_TOKEN no servidor para o ligar.')}{/if}
    </p>

    <h3>{t('Notificações dos lembretes')}</h3>
    <div class="push">
      <p class="info">
        {#if push === null}
          {t('A verificar…')}
        {:else if push === 'on'}
          {t('Ativas neste dispositivo.')}
        {:else if push === 'denied'}
          {t('Bloqueadas neste dispositivo. Permite-as nas definições do browser ou da app.')}
        {:else if push === 'unsupported'}
          {t('Este browser não suporta notificações. No iPhone, instala primeiro a app no ecrã principal.')}
        {:else}
          {t('Desligadas neste dispositivo.')}
        {/if}
      </p>
      {#if push === 'on' || push === 'off'}
        <button class="btn ghost" onclick={togglePush}>{push === 'on' ? t('Desligar') : t('Ativar')}</button>
      {/if}
      {#if push === 'on'}<button class="btn ghost" onclick={test}>{t('Testar')}</button>{/if}
    </div>

    <h3>{t('Backups diários')}</h3>
    {#if status.remote}
      <p class="info" class:remote-error={status.remote.last_error}>
        {t('Cópia para {target}:', { target: status.remote.target })}
        {#if status.remote.last_error}
          {t('falhou {at} ({message}). Tenta outra vez dentro de uma hora.', {
            at: formatFull(status.remote.last_error.at),
            message: status.remote.last_error.message,
          })}
        {:else if status.remote.last_ok}
          {t('última enviada {at}.', { at: formatFull(status.remote.last_ok.at) })}
        {:else}
          {t('ainda nenhuma enviada.')}
        {/if}
      </p>
    {:else}
      <p class="info">
        {t('Os backups ficam no disco do servidor. Para guardar uma cópia noutro sítio, define BACKUP_WEBDAV_URL (Nextcloud, NAS…) ou BACKUP_DIR.')}
      </p>
    {/if}
    {#if !status.backups.length}
      <p class="info">
        {t('Ainda não há backups. O servidor escreve um por dia em /data/backups (a não ser que BACKUP_KEEP=0).')}
      </p>
    {:else}
      <p class="info">{t('Último: {at}.', { at: formatFull(status.backups[0].created_at) })}</p>
      <ul class="backups">
        {#each status.backups as backup (backup.name)}
          <li>
            <div class="name">
              <strong>{day(backup)}</strong>
              <small>{size(backup.size)}</small>
            </div>
            <a class="icon-btn" href="/api/backups/{encodeURIComponent(backup.name)}" download title={t('Descarregar')}>
              <Icon name="download" size={20} />
            </a>
            <button class="btn ghost" disabled={busy !== null} onclick={() => restore(backup)}>
              {busy === backup.name ? t('A restaurar…') : t('Restaurar')}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</Sheet>

<style>
  .info {
    color: var(--text-2);
    font-size: 0.9rem;
    margin: 8px 0;
  }

  .error,
  .remote-error {
    color: var(--danger);
  }

  .update {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    margin-bottom: 14px;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid var(--accent);
    color: inherit;
    text-decoration: none;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin: 0 0 8px;
  }

  .stats div {
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--surface-2);
  }

  dt {
    font-size: 0.78rem;
    color: var(--text-2);
  }

  dd {
    margin: 0;
    font-weight: 650;
    font-size: 1.05rem;
  }

  @media (max-width: 420px) {
    .stats {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  h3 {
    margin: 18px 0 4px;
    font-size: 1rem;
  }

  .push {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .push .info {
    flex: 1 1 200px;
  }

  .push .btn {
    padding: 7px 14px;
  }

  .backups {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .backups li {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 0;
    border-top: 1px solid var(--border);
  }

  .name {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .name strong {
    font-weight: 600;
    font-size: 0.95rem;
  }

  .name small {
    color: var(--text-2);
  }

  .backups .btn {
    padding: 7px 14px;
  }

</style>
