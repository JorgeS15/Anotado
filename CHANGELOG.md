# Changelog

Todas as alterações relevantes do Anotado. O formato segue [Keep a Changelog](https://keepachangelog.com/pt-PT/1.1.0/)
e as versões seguem [Semantic Versioning](https://semver.org/lang/pt-PT/).

## [1.2.0] - 2026-11-26

### Added
- **Nomes para as cores** (Menu → Nomes das cores): por exemplo, verde = "Compras". Aparecem no filtro e ao escolher a cor, e são partilhados por todos os dispositivos.
- **Checklists**: "Desmarcar tudo" e "Apagar concluídos" (com Anular) no menu da nota, e os itens concluídos podem ser recolhidos num toque.
- **Sub-itens nas checklists**: `Tab` num item torna-o sub-item do de cima (`Shift`+`Tab` desfaz); no telemóvel, arrasta-o pela pega para a direita ou para a esquerda. Aparecem indentados no cartão, no Markdown e na impressão.
- **Modelos de notas**: Mais opções → Guardar como modelo; as notas novas a partir de um modelo saem do botão +, com os itens por marcar. Gerir modelos no mesmo menu.
- **Servidor e backups** (Menu): número de notas, espaço ocupado, versão, e a lista dos backups diários, que se podem descarregar ou restaurar. Restaurar repõe as notas como estavam nesse dia; a versão atual de cada nota fica no histórico.
- **Automações**: com `ANOTADO_API_TOKEN`, o Home Assistant, os Atalhos do iPhone ou o Tasker podem criar notas (`POST /api/notes`) e acrescentar itens a uma checklist pelo nome (`POST /api/lists/items`). Guia em `docs/automacoes.md`, com exemplos para o Home Assistant, incluindo voz com o Assist.
- **Aviso de versão nova** no menu: o servidor consulta uma vez por dia a última release no GitHub (`UPDATE_CHECK=false` desliga).
- **Ordem manual das notas**: Ordenar → Manual (arrastar). Arrasta uma nota pela pega à esquerda, ou move-a com `Alt` + setas. A ordem é partilhada pelos dispositivos.
- Exportar uma nota em Markdown e imprimi-la (também com `Ctrl`+`P`).
- Tamanho da letra (pequeno, normal, grande), no menu.
- Atalhos de teclado: `?` mostra a lista, `Ctrl`+`Enter` fecha a nota, `Alt`+`↑`/`↓` move um item da checklist e `Ctrl`+`Espaço` marca-o.
- `TRASH_DAYS` define quantos dias as notas ficam no lixo (por omissão 30).
- `TRUST_PROXY=false` faz o limite de tentativas de login ignorar `X-Forwarded-For`, para quem expõe a porta sem proxy.
- README em inglês, com capturas de ecrã.

### Changed
- No telemóvel, a barra de estado fica com a cor da nota aberta.
- Os diálogos mantêm o foco do teclado lá dentro e devolvem-no ao fechar, e os menus navegam-se com as setas.
- O `App.svelte` foi dividido (barra de seleção, menu e diálogos em componentes próprios).
- O CI volta a correr os testes end-to-end no `ubuntu-latest`, com o Playwright 1.65.

### Fixed
- Uma nota criada ou apagada noutro dispositivo durante uma sincronização completa podia desaparecer (ou voltar) até à sincronização seguinte.

## [1.1.3] - 2026-11-23

### Fixed
- Uma alteração recusada pelo servidor (por exemplo, uma nota demasiado grande) já não se perde: fica guardada no dispositivo, a nota mostra "Não sincronizada" com o motivo, e é enviada outra vez quando for corrigida. Antes era descartada sem aviso e substituída pela versão do servidor na sincronização seguinte.

### Added
- O editor mostra o número de caracteres quando a nota se aproxima do limite (200 000), e não deixa ultrapassar os limites do título, dos itens e do número de itens das checklists.
- A sessão é renovada sempre que a app abre (depois de um dia), por isso um dispositivo em uso nunca chega a expirar.
- Mensagens de erro mais claras na importação do ColorNote: password errada, ficheiro que não é um backup, ou backup aberto mas com um formato ainda não suportado.

## [1.1.2] - 2026-11-22

### Security
- Atualizados `hono` (4.13.20) e `@hono/node-server` (2.1.11), que corrigem vulnerabilidades conhecidas, incluindo uma em que certos caminhos podiam saltar middleware como o da autenticação.
- O servidor recusa-se a arrancar se `ANOTADO_PASSWORD` for a password de exemplo do `docker-compose.yml`, e avisa se tiver menos de 8 caracteres.

### Changed
- O Dependabot só propõe atualizações menores e correções; as versões principais ficam para atualizar à mão.

## [1.1.1] - 2026-11-01

### Added
- Botão "Instalar app" no menu, para instalar o Anotado como app (aparece na lista de apps e na pesquisa do telemóvel) em vez de criar só um atalho.

### Changed
- O CI cria a tag `vX.Y.Z` e a release no GitHub sozinho quando uma versão nova chega ao `main`, e publica as imagens com essa versão.

## [1.1.0] - 2026-10-31

### Added
- Cópia "(conflito)" quando a mesma nota é editada em dois dispositivos ao mesmo tempo, em vez de perder uma das edições.
- Histórico de versões de cada nota (Menu da nota → Histórico), com restauro.
- Backups diários automáticos em `/data/backups` (os últimos 30; configurável com `BACKUP_KEEP`).
- Importação de backups do ColorNote, com escolha da cor correspondente a cada cor do ColorNote.
- Seleção de várias notas (toque longo, Ctrl+clique ou Menu → Selecionar notas) para mudar cor, fixar, arquivar, apagar ou restaurar.
- Partilhar uma nota (menu de partilha do sistema ou cópia para a área de transferência) e duplicar notas.
- Partilhar texto e links de outras apps para o Anotado (Android) e atalhos "Nova nota" / "Nova checklist" no ícone.
- Pesquisa com destaque dos resultados nas notas.
- Aviso "Há uma nova versão" com botão para atualizar.
- Versão da app visível no menu e em `/api/health`.
- Testes do servidor e testes end-to-end (Playwright) no CI; Dependabot; imagens Docker com tags de versão (`1.1.0`, `1.1`, `1`).

### Changed
- As horas das alterações são corrigidas pelo relógio do servidor.
- A app pede armazenamento persistente, para o browser não apagar as notas offline.

### Fixed
- A página ficava mais larga do que o ecrã em telemóveis com menos de 412 px.

## [1.0.0] - 2026-10-12

### Added
- Primeira versão: notas de texto e checklist, 9 cores, fixar, arquivo, lixo, pesquisa, grelha/lista,
  tema claro/escuro, PWA offline com sincronização em tempo real, exportar/importar, imagem Docker.
