# Roadmap

O que falta ao Anotado e o que valeria a pena acrescentar, por ordem de prioridade.
O que já está feito está no [CHANGELOG](CHANGELOG.md).

Esforço: **P** pequeno (horas) · **M** médio (1–2 dias) · **G** grande (vários dias).

O Anotado quer continuar a ser **simples**: uma ideia só entra se não complicar o uso do dia a dia.

---

## Agora — fiabilidade e versão pública (1.1.x)

| # | O quê | Porquê | Esforço |
|---|---|---|---|
| 1 | **Nunca perder uma alteração rejeitada pelo servidor** | Hoje, se o servidor recusar uma alteração (por exemplo, uma nota com mais de 200 000 caracteres), a app descarta-a só com um aviso na consola. Na sincronização seguinte a versão local é substituída pela do servidor e o texto perde-se. Deve manter a alteração, mostrar um aviso e guardá-la como cópia. | P |
| 2 | **Limites visíveis no editor** | O servidor aceita no máximo 1 000 caracteres no título, 200 000 no texto e 2 000 itens por checklist, mas o editor não o diz. Mostrar o limite quando a nota se aproxima dele. | P |
| 3 | **Sessão renovada com o uso** | A sessão expira 400 dias depois do login, mesmo para quem usa a app todos os dias. Renovar o cookie quando a app abre evita um logout inesperado. | P |
| 4 | **Testar a importação do ColorNote com um backup real** | O formato não é público. A importação só foi testada com ficheiros gerados no mesmo formato. | P |
| 5 | **README em inglês e captura de ecrã** | Para um projeto público, o README só em português chega a pouca gente, e uma imagem explica a app em segundos. | P |
| 6 | **Atualizar o Playwright e voltar ao `ubuntu-latest` no CI** | O CI está fixo no Ubuntu 24.04 porque o Playwright 1.56 não suporta o 26.04. | P |
| 7 | **Rever os PRs do Dependabot com versões principais** | TypeScript 7, Node 26, `@types/node` 26: atualizar um de cada vez, com os testes a confirmar, ou fechar. | P–M |
| 8 | **Dividir o `App.svelte`** | Com quase 900 linhas, junta cabeçalho, filtros, seleção, menus e navegação. Separar em componentes torna as próximas alterações mais seguras. | M |

## Próximo — uso do dia a dia (1.2)

| # | O quê | Porquê | Esforço |
|---|---|---|---|
| 9 | **Ações em bloco nas checklists**: "Desmarcar tudo" e "Apagar concluídos" | Essencial para listas de compras reutilizadas. É das coisas mais usadas no ColorNote. | P |
| 10 | **Nomes para as cores** (ex.: verde = "Compras", azul = "Trabalho") | As cores fazem de categorias. Com nome, o filtro fica claro e mais fácil de lembrar. | P |
| 11 | **Restaurar backups do servidor a partir da app** | Os backups diários já existem em `/data/backups`, mas para os usar é preciso aceder ao servidor e importar o JSON à mão. Um ecrã "Backups" com a lista e um botão "Restaurar" resolve isso. | M |
| 12 | **Ordem manual das notas** (arrastar na grelha) | Hoje só há ordenação automática (data, cor, título). | M |
| 13 | **Acessibilidade com teclado e leitor de ecrã** | Os diálogos não prendem o foco, os menus não respondem às setas e só dá para reordenar a checklist com o rato ou o dedo. | M |
| 14 | **Dias no lixo configuráveis** (`TRASH_DAYS`) | Os 30 dias estão fixos no código. | P |
| 15 | **Cor da barra do sistema igual à da nota aberta** | No telemóvel, a barra de estado fica amarela mesmo com uma nota azul aberta. | P |

## Depois — funcionalidades maiores (1.3+)

| # | O quê | Porquê | Esforço |
|---|---|---|---|
| 16 | **Lembretes com notificação** | É a maior funcionalidade do ColorNote que falta. Numa PWA exige Web Push enviado pelo servidor, com chaves VAPID e permissão de notificações. | G |
| 17 | **Interface em inglês** (e outras línguas) | A interface só existe em português. Num projeto público, a língua seguiria a do browser. | M |
| 18 | **Backups fora do servidor** (WebDAV, S3 ou uma pasta sincronizada) | Hoje os backups ficam no mesmo disco que a base de dados: se o disco falhar, perde-se tudo. | M |
| 19 | **Mudar a password e terminar outras sessões a partir da app** | Hoje a password só se muda na variável de ambiente, o que termina todas as sessões. | M |
| 20 | **Imagens nas notas** | Fotos de recibos, quadros ou receitas. Exige guardar ficheiros, sincronizá-los e incluí-los nos backups. | G |
| 21 | **Formatação simples** (negrito, listas com marcadores) | Só se for possível sem complicar o editor. | M |
| 22 | **`TRUST_PROXY` configurável** | O limite de tentativas de login confia no cabeçalho do Caddy. Uma opção explícita protege quem expuser a porta diretamente. | P |

## Fora do âmbito (por agora)

- **Vários utilizadores e partilha de notas** — mudaria o modelo de dados e a autenticação. O Anotado é pessoal.
- **App nativa com widget** (Capacitor ou Kotlin) — a PWA já funciona offline e instala-se como app. O widget é a única coisa que exigiria código nativo.
- **Encriptação ponta a ponta** — complexo de fazer bem. Hoje os dados estão no teu servidor, atrás do HTTPS do Caddy.
- **Pastas, etiquetas e ligações entre notas** — as cores fazem de categorias, de propósito.

---

Tens uma sugestão? Abre uma [issue](https://github.com/JorgeS15/Anotado/issues).
