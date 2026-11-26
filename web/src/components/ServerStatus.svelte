<script lang="ts">
  import { onMount } from 'svelte';
  import { store } from '../lib/store.svelte';
  import type { BackupInfo, ServerStatus } from '../lib/types';
  import { formatFull } from '../lib/util';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';

  let { onclose, notify }: { onclose: () => void; notify: (message: string) => void } = $props();

  let status = $state<ServerStatus | null>(null);
  let error = $state('');
  let busy = $state<string | null>(null);

  onMount(load);

  async function load() {
    try {
      status = await store.status();
      error = '';
    } catch {
      error = 'O estado do servidor precisa de ligação.';
    }
  }

  function size(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('pt-PT', { maximumFractionDigits: 0 })} KB`;
    return `${(bytes / 1024 / 1024).toLocaleString('pt-PT', { maximumFractionDigits: 1 })} MB`;
  }

  function day(backup: BackupInfo) {
    const [, y, m, d] = /(\d{4})-(\d{2})-(\d{2})/.exec(backup.name) ?? [];
    return y ? new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('pt-PT', { dateStyle: 'full' }) : backup.name;
  }

  async function restore(backup: BackupInfo) {
    const message =
      `Restaurar as notas como estavam em ${day(backup)}?\n\n` +
      'As notas alteradas ou apagadas desde então voltam ao que eram (a versão atual fica no histórico de cada nota). ' +
      'As notas criadas depois não são tocadas.';
    if (!confirm(message)) return;
    busy = backup.name;
    try {
      notify(await store.restoreBackup(backup.name));
      onclose();
    } catch {
      error = 'Não foi possível restaurar (sem ligação?).';
    }
    busy = null;
  }
</script>

<Sheet title="Servidor e backups" {onclose}>
  {#if error}
    <p class="error" role="alert">{error}</p>
  {:else if !status}
    <p class="info">A carregar…</p>
  {:else}
    {#if status.update}
      <a class="update" href={status.update.url} target="_blank" rel="noopener noreferrer">
        <Icon name="update" size={18} />
        <span>Há uma versão nova do Anotado: <strong>v{status.update.version}</strong>. Vê o que mudou.</span>
      </a>
    {/if}
    <dl class="stats">
      <div><dt>Notas</dt><dd>{status.notes}</dd></div>
      <div><dt>Arquivadas</dt><dd>{status.archived}</dd></div>
      <div><dt>No lixo</dt><dd>{status.trashed}</dd></div>
      <div><dt>Base de dados</dt><dd>{size(status.db_size)}</dd></div>
      <div><dt>Servidor</dt><dd>v{status.version}</dd></div>
      <div><dt>Lixo</dt><dd>{status.trash_days} dias</dd></div>
    </dl>
    <p class="info">
      Token de API (automações): {status.api_token ? 'ativo' : 'desligado'}.
      {#if !status.api_token}Define <code>ANOTADO_API_TOKEN</code> no servidor para o ligar.{/if}
    </p>

    <h3>Backups diários</h3>
    {#if status.remote}
      <p class="info" class:remote-error={status.remote.last_error}>
        Cópia para <code>{status.remote.target}</code>:
        {#if status.remote.last_error}
          falhou {formatFull(status.remote.last_error.at)} ({status.remote.last_error.message}). Tenta outra vez dentro
          de uma hora.
        {:else if status.remote.last_ok}
          última enviada {formatFull(status.remote.last_ok.at)}.
        {:else}
          ainda nenhuma enviada.
        {/if}
      </p>
    {:else}
      <p class="info">
        Os backups ficam no disco do servidor. Para guardar uma cópia noutro sítio, define
        <code>BACKUP_WEBDAV_URL</code> (Nextcloud, NAS…) ou <code>BACKUP_DIR</code>.
      </p>
    {/if}
    {#if !status.backups.length}
      <p class="info">
        Ainda não há backups. O servidor escreve um por dia em <code>/data/backups</code> (a não ser que
        <code>BACKUP_KEEP=0</code>).
      </p>
    {:else}
      <p class="info">Último: {formatFull(status.backups[0].created_at)}.</p>
      <ul class="backups">
        {#each status.backups as backup (backup.name)}
          <li>
            <div class="name">
              <strong>{day(backup)}</strong>
              <small>{size(backup.size)}</small>
            </div>
            <a class="icon-btn" href="/api/backups/{encodeURIComponent(backup.name)}" download title="Descarregar">
              <Icon name="download" size={20} />
            </a>
            <button class="btn ghost" disabled={busy !== null} onclick={() => restore(backup)}>
              {busy === backup.name ? 'A restaurar…' : 'Restaurar'}
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

  code {
    font-size: 0.85em;
    background: var(--surface-2);
    padding: 1px 4px;
    border-radius: 4px;
  }
</style>
