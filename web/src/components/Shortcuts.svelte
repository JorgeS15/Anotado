<script lang="ts">
  import Sheet from './Sheet.svelte';

  let { onclose }: { onclose: () => void } = $props();

  const GROUPS: { title: string; keys: [string, string][] }[] = [
    {
      title: 'Na lista de notas',
      keys: [
        ['N', 'Nova nota de texto'],
        ['L', 'Nova checklist'],
        ['/', 'Pesquisar'],
        ['Esc', 'Limpar a pesquisa'],
        ['Ctrl + clique', 'Selecionar uma nota'],
        ['?', 'Mostrar estes atalhos'],
      ],
    },
    {
      title: 'Numa nota',
      keys: [
        ['Esc', 'Fechar'],
        ['Ctrl + Enter', 'Fechar'],
        ['Ctrl + P', 'Imprimir'],
      ],
    },
    {
      title: 'Numa checklist',
      keys: [
        ['Enter', 'Novo item (divide o item no cursor)'],
        ['Backspace', 'Num item vazio, apaga-o; no início, junta-o ao anterior'],
        ['Tab', 'Tornar o item um sub-item (Shift + Tab desfaz)'],
        ['Alt + ↑ / ↓', 'Mover o item'],
        ['Ctrl + Espaço', 'Marcar ou desmarcar o item'],
      ],
    },
  ];
</script>

<Sheet title="Atalhos de teclado" {onclose}>
  {#each GROUPS as group (group.title)}
    <h3>{group.title}</h3>
    <dl>
      {#each group.keys as [key, action] (key + action)}
        <div>
          <dt>{#each key.split(' + ') as part, i (i)}{#if i}+{/if}<kbd>{part}</kbd>{/each}</dt>
          <dd>{action}</dd>
        </div>
      {/each}
    </dl>
  {/each}
</Sheet>

<style>
  h3 {
    margin: 14px 0 6px;
    font-size: 0.95rem;
  }

  h3:first-child {
    margin-top: 0;
  }

  dl {
    margin: 0;
  }

  dl div {
    display: flex;
    gap: 12px;
    align-items: baseline;
    padding: 5px 0;
  }

  dt {
    flex: none;
    width: 140px;
    display: flex;
    gap: 4px;
    align-items: baseline;
  }

  dd {
    margin: 0;
    color: var(--text-2);
  }

  kbd {
    font: inherit;
    font-size: 0.82rem;
    padding: 1px 7px;
    border-radius: 6px;
    border: 1px solid var(--border);
    border-bottom-width: 2px;
    background: var(--surface-2);
  }
</style>
