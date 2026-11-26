<script lang="ts">
  import { t } from '../lib/i18n';
  import Sheet from './Sheet.svelte';

  let { onclose }: { onclose: () => void } = $props();

  const GROUPS: { title: string; keys: [string, string][] }[] = [
    {
      title: t('Na lista de notas'),
      keys: [
        ['N', t('Nova nota de texto')],
        ['L', t('Nova checklist')],
        ['/', t('Pesquisar')],
        ['Esc', t('Limpar a pesquisa')],
        [t('Ctrl + clique'), t('Selecionar uma nota')],
        ['?', t('Mostrar estes atalhos')],
      ],
    },
    {
      title: t('Numa nota'),
      keys: [
        ['Esc', t('Fechar')],
        ['Ctrl + Enter', t('Fechar')],
        ['Ctrl + P', t('Imprimir')],
      ],
    },
    {
      title: t('Numa checklist'),
      keys: [
        ['Enter', t('Novo item (divide o item no cursor)')],
        ['Backspace', t('Num item vazio, apaga-o; no início, junta-o ao anterior')],
        ['Tab', t('Tornar o item um sub-item (Shift + Tab desfaz)')],
        ['Alt + ↑ / ↓', t('Mover o item')],
        [t('Ctrl + Espaço'), t('Marcar ou desmarcar o item')],
      ],
    },
  ];
</script>

<Sheet title={t('Atalhos de teclado')} {onclose}>
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
