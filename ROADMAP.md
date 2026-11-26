# Roadmap

O que falta ao Anotado e o que valeria a pena acrescentar, por ordem de prioridade.
O que já está feito está no [CHANGELOG](CHANGELOG.md).

Esforço: **P** pequeno (horas) · **M** médio (1–2 dias) · **G** grande (vários dias).

O Anotado quer continuar a ser **simples**: uma ideia só entra se não complicar o uso do dia a dia.

---

## Feito na 1.2.0

Nomes para as cores, ordem manual das notas, sub-itens, "Desmarcar tudo", "Apagar concluídos" e concluídos recolhíveis nas checklists, modelos de notas, ecrã
"Servidor e backups" com restauro, terminar sessão nos outros dispositivos, `TRASH_DAYS`, `TRUST_PROXY`, barra do sistema com a cor da nota,
atalhos novos com ajuda (`?`), tamanho da letra, exportar e imprimir uma nota, aviso de versão nova,
token de API para automações com guia para o Home Assistant, README em inglês com capturas de ecrã,
CI de volta ao `ubuntu-latest` e o `App.svelte` dividido em componentes. Detalhes no [CHANGELOG](CHANGELOG.md).

## Agora — fiabilidade

| # | O quê | Porquê | Esforço |
|---|---|---|---|
| 1 | **Testar a importação do ColorNote com um backup real** | O formato não é público. A importação só foi testada com ficheiros gerados no mesmo formato. As mensagens de erro dizem em que passo um backup falha. | P |
| 2 | **Experimentar o guia do Home Assistant numa instalação real** | Os exemplos de `rest_command` e das frases do Assist seguem a documentação, mas ainda não correram num Home Assistant. | P |
| 3 | **Atualizar as versões principais quando fizer sentido** | Os PRs do Dependabot com versões principais foram fechados. O Node 24 é LTS até 2028; o TypeScript 7 espera pelo suporte do `svelte-check`. | P |

## Próximo — uso do dia a dia (1.3)

| # | O quê | Porquê | Esforço |
|---|---|---|---|
| 4 | **Rever a app com um leitor de ecrã** | Os diálogos já prendem o foco, os menus usam as setas e notas e itens movem-se com `Alt`+setas; falta experimentar com o TalkBack e o NVDA e corrigir o que for anunciado mal. | P–M |

## Integrações

| # | O quê | Porquê | Esforço |
|---|---|---|---|
| 5 | **Checklists como listas de tarefas do Home Assistant** (integração *todo*) | Verias e marcarias a lista de compras no painel do Home Assistant. Exige uma integração própria em Python; a API para isso já existe. | G |

## Depois — funcionalidades maiores (1.4+)

| # | O quê | Porquê | Esforço |
|---|---|---|---|
| 6 | **Lembretes com notificação** | É a maior funcionalidade do ColorNote que falta. Numa PWA exige Web Push enviado pelo servidor, com chaves VAPID e permissão de notificações. | G |
| 7 | **Vista de calendário** | Notas por dia de criação ou de lembrete, como no ColorNote. Faz mais sentido depois dos lembretes. | M |
| 8 | **Interface em inglês** (e outras línguas) | A interface só existe em português. Num projeto público, a língua seguiria a do browser. | M |
| 9 | **Backups fora do servidor** (WebDAV, S3 ou uma pasta sincronizada) | Hoje os backups ficam no mesmo disco que a base de dados: se o disco falhar, perde-se tudo. | M |
| 10 | **Mudar a password a partir da app** | Hoje só se muda na variável de ambiente. Terminar a sessão nos outros dispositivos já é possível no menu. | M |
| 11 | **Bloquear notas com PIN** | Esconde notas sensíveis de quem pega no telemóvel. É só um bloqueio visual, não encripta os dados. | M |
| 12 | **Imagens nas notas** | Fotos de recibos, quadros ou receitas. Exige guardar ficheiros, sincronizá-los e incluí-los nos backups. | G |
| 13 | **Formatação simples** (negrito, listas com marcadores) | Só se for possível sem complicar o editor. | M |

## Fora do âmbito (por agora)

- **Vários utilizadores e partilha de notas** — mudaria o modelo de dados e a autenticação. O Anotado é pessoal.
- **App nativa com widget** (Capacitor ou Kotlin) — a PWA já funciona offline e instala-se como app. O widget é a única coisa que exigiria código nativo.
- **Encriptação ponta a ponta** — complexo de fazer bem. Hoje os dados estão no teu servidor, atrás do HTTPS do Caddy.
- **Pastas, etiquetas e ligações entre notas** — as cores fazem de categorias, de propósito.

---

Tens uma sugestão? Abre uma [issue](https://github.com/JorgeS15/Anotado/issues).
