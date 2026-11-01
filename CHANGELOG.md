# Changelog

Todas as alterações relevantes do Anotado. O formato segue [Keep a Changelog](https://keepachangelog.com/pt-PT/1.1.0/)
e as versões seguem [Semantic Versioning](https://semver.org/lang/pt-PT/).

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
