<script lang="ts">
  import { store } from '../lib/store.svelte';

  let password = $state('');
  let error = $state('');
  let busy = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!password || busy) return;
    busy = true;
    error = (await store.login(password)) ?? '';
    busy = false;
    if (error) password = '';
  }
</script>

<main>
  <form onsubmit={submit}>
    <img src="/favicon.svg" alt="" width="72" height="72" />
    <h1>Anotado</h1>
    <label class="sr-only" for="password">Password</label>
    <!-- svelte-ignore a11y_autofocus -->
    <input
      id="password"
      type="password"
      placeholder="Password"
      autocomplete="current-password"
      autofocus
      bind:value={password} />
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <button class="btn" type="submit" disabled={busy}>{busy ? 'A entrar…' : 'Entrar'}</button>
  </form>
</main>

<style>
  main {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 16px;
  }

  form {
    width: min(340px, 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: 32px 24px;
    background: var(--surface);
    border-radius: 20px;
    box-shadow: var(--shadow);
  }

  h1 {
    margin: 0 0 8px;
    font-size: 1.6rem;
  }

  input {
    width: 100%;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: var(--bg);
    outline: none;
  }

  input:focus {
    border-color: var(--accent);
  }

  .btn {
    width: 100%;
    justify-content: center;
  }

  .error {
    margin: 0;
    color: var(--danger);
    font-size: 0.9rem;
  }
</style>
