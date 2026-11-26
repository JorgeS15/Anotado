<script lang="ts">
  import { enablePush, pushState } from '../lib/push';
  import { formatReminder } from '../lib/util';
  import Icon from './Icon.svelte';
  import Popover from './Popover.svelte';

  let {
    value,
    onchange,
    notify,
  }: {
    value: number | null | undefined;
    onchange: (at: number | null) => void;
    notify: (message: string) => void;
  } = $props();

  let open = $state(false);
  let custom = $state('');

  function at(days: number, hours: number, minutes = 0) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hours, minutes, 0, 0);
    return d.getTime();
  }

  const quick = $derived.by(() => {
    void open;
    const now = new Date();
    const options: { label: string; at: number }[] = [{ label: 'Daqui a 1 hora', at: Date.now() + 60 * 60 * 1000 }];
    if (now.getHours() < 17) options.push({ label: 'Hoje às 18:00', at: at(0, 18) });
    options.push({ label: 'Amanhã às 9:00', at: at(1, 9) });
    const toMonday = ((8 - now.getDay()) % 7) || 7;
    options.push({ label: 'Segunda-feira às 9:00', at: at(toMonday, 9) });
    return options;
  });

  function toInput(ts: number) {
    const d = new Date(ts - new Date(ts).getTimezoneOffset() * 60_000);
    return d.toISOString().slice(0, 16);
  }

  $effect(() => {
    if (open) custom = toInput(value ?? at(1, 9));
  });

  async function set(ts: number | null, close: () => void) {
    close();
    onchange(ts);
    if (ts === null) {
      notify('Lembrete removido');
      return;
    }
    // Ask for notifications the first time a reminder is set on this device.
    let state = await pushState();
    if (state === 'off') state = await enablePush().catch(() => 'off' as const);
    const when = formatReminder(ts);
    if (state === 'on') notify(`Lembrete para ${when}`);
    else if (state === 'denied')
      notify(`Lembrete para ${when}, mas as notificações estão bloqueadas neste dispositivo.`);
    else notify(`Lembrete para ${when}. Ativa as notificações em Menu → Servidor e backups.`);
  }

  function submit(e: SubmitEvent, close: () => void) {
    e.preventDefault();
    const ts = new Date(custom).getTime();
    if (Number.isFinite(ts)) set(ts, close);
  }
</script>

<Popover bind:open>
  {#snippet trigger(toggle)}
    <button class="icon-btn" class:active={value != null} onclick={toggle} title="Lembrete">
      <Icon name="bell" />
    </button>
  {/snippet}
  {#snippet children(close)}
    {#if value != null}
      <div class="label">Lembrete</div>
      <div class="current">{formatReminder(value)}</div>
      <button class="item danger" onclick={() => set(null, close)}><Icon name="bellOff" /> Remover lembrete</button>
      <hr />
    {/if}
    {#each quick as q (q.label)}
      <button class="item" onclick={() => set(q.at, close)}>{q.label}</button>
    {/each}
    <hr />
    <form class="custom" onsubmit={(e) => submit(e, close)}>
      <label>
        <span class="sr-only">Data e hora do lembrete</span>
        <input type="datetime-local" bind:value={custom} required />
      </label>
      <button class="btn" type="submit">Definir</button>
    </form>
  {/snippet}
</Popover>

<style>
  .current {
    padding: 2px 12px 8px;
    font-weight: 600;
  }

  .custom {
    display: flex;
    gap: 8px;
    padding: 6px 8px;
  }

  .custom label {
    flex: 1;
  }

  input {
    width: 100%;
    padding: 7px 8px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg);
  }

  .custom .btn {
    padding: 7px 14px;
  }
</style>
