# Anotado

Notas simples e coloridas, ao estilo do ColorNote, para usar no PC e no telemóvel (PWA).

- Notas de **texto** e **checklist**
- **9 cores** que servem de categorias, com filtro por cor
- Fixar, arquivar e lixo (as notas no lixo são apagadas ao fim de 30 dias)
- Pesquisa (ignora acentos), vista em grelha ou em lista, ordenação
- Guarda automaticamente
- **Funciona offline**: as notas ficam guardadas no dispositivo e as alterações são enviadas quando a ligação voltar
- Sincronização em tempo real entre dispositivos
- Modo claro e escuro, exportar e importar backup (JSON)
- Um só utilizador, protegido por password

## Instalação (Docker)

A imagem é publicada automaticamente em `ghcr.io/jorges15/anotado` a cada merge para `main`,
para `amd64` e `arm64`.

```yaml
# docker-compose.yml
services:
  anotado:
    image: ghcr.io/jorges15/anotado:latest
    container_name: anotado
    restart: unless-stopped
    environment:
      ANOTADO_PASSWORD: muda-esta-password
      TZ: Europe/Lisbon
    volumes:
      - ./data:/data
    ports:
      - "4008:4008"
```

```sh
mkdir -p data && sudo chown 1000:1000 data   # o contentor corre como utilizador 1000
docker compose up -d
```

### Variáveis de ambiente

| Variável           | Obrigatória | Descrição                                                                    |
| ------------------ | ----------- | ---------------------------------------------------------------------------- |
| `ANOTADO_PASSWORD` | sim         | Password de acesso. Mudá-la termina a sessão em todos os dispositivos.       |
| `PORT`             | não         | Porta HTTP (por omissão `4008`).                                             |
| `SESSION_SECRET`   | não         | Segredo das sessões. Se não for definido, é gerado e guardado na base de dados. |
| `TZ`               | não         | Fuso horário.                                                                |

Os dados ficam em `/data/anotado.db` (SQLite). Para fazer backup, basta copiar a pasta `data`,
ou usar **Menu → Exportar backup** na app.

### Caddy

```caddyfile
notas.teudominio.pt {
    reverse_proxy anotado:4008
}
```

Se o Caddy não estiver na mesma rede Docker, usa `reverse_proxy localhost:4008`.
O HTTPS é necessário para instalar a PWA e para a app funcionar offline.
Não exponhas a porta 4008 diretamente à internet; usa sempre o Caddy à frente.

### Instalar no telemóvel

Abre o endereço no Chrome (Android), entra com a password e escolhe
**⋮ → Adicionar ao ecrã principal / Instalar app**. No iPhone: Safari → Partilhar → **Adicionar ao ecrã principal**.

## Atalhos de teclado (PC)

| Tecla | Ação                    |
| ----- | ----------------------- |
| `N`   | Nova nota de texto      |
| `L`   | Nova checklist          |
| `/`   | Pesquisar               |
| `Esc` | Fechar a nota / limpar a pesquisa |

Nas checklists, `Enter` cria um novo item e `Backspace` num item vazio apaga-o.

## Desenvolvimento

Requer Node.js 22.18 ou mais recente.

```sh
# Terminal 1: API em http://localhost:4008
cd server && npm install && ANOTADO_PASSWORD=teste npm run dev

# Terminal 2: frontend em http://localhost:5173 (encaminha /api para a porta 4008)
cd web && npm install && npm run dev
```

Estrutura:

```
server/   API (Hono + SQLite nativo do Node), autenticação, eventos em tempo real; serve o frontend
web/      Frontend (Svelte 5 + Vite + PWA), guarda as notas em IndexedDB para uso offline
```

Sincronização: cada alteração é guardada primeiro no dispositivo e posta numa fila, que é enviada
para o servidor quando há ligação. Em caso de conflito, ganha a edição mais recente.
