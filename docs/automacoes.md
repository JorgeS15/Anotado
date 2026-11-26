# Automações: Home Assistant, Atalhos do iPhone, Tasker…

Com um **token de API**, outras apps podem criar notas e acrescentar itens a uma checklist sem
a password principal. Exemplo: dizer ao Assist do Home Assistant *"adiciona leite à lista de compras"*.

## 1. Ligar o token

Gera um token aleatório (pelo menos 24 caracteres) e define-o no `docker-compose.yml`:

```sh
openssl rand -hex 24
```

```yaml
    environment:
      ANOTADO_PASSWORD: a-tua-password
      ANOTADO_API_TOKEN: cole-aqui-o-token
```

Depois de `docker compose up -d`, **Menu → Servidor e backups** mostra "Token de API: ativo".

O token dá acesso total às notas, como a password: guarda-o só onde for preciso (por exemplo no
`secrets.yaml` do Home Assistant). Para o revogar, muda-o ou apaga a variável e reinicia o contentor.

## 2. A API

Todos os pedidos levam o cabeçalho `Authorization: Bearer <token>` e um corpo JSON.

### Acrescentar itens a uma checklist

`POST /api/lists/items`

```json
{ "list": "Compras", "items": ["Leite", "Ovos"] }
```

- A lista é encontrada pelo título, sem ligar a maiúsculas nem acentos ("compras" encontra "Compras").
  Se não existir, é criada (pode levar `"color": "green"`).
- Um item que já está na lista não é duplicado; se estava marcado, volta a ficar por fazer.
- `items` também pode ser texto, com um item por linha.
- A resposta diz o que foi acrescentado (`added`) e o que já lá estava (`existing`).

### Criar uma nota

`POST /api/notes`

```json
{ "title": "Ideia", "content": "Texto da nota", "color": "blue" }
```

ou uma checklist:

```json
{ "title": "Mala", "items": ["Escova", "Carregador"] }
```

Cores: `yellow`, `orange`, `red`, `pink`, `purple`, `blue`, `green`, `gray`, `white`.

### Testar com `curl`

```sh
curl -X POST https://notas.teudominio.pt/api/lists/items \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"list": "Compras", "items": ["Leite"]}'
```

As notas aparecem logo nos dispositivos abertos.

## 3. Home Assistant

### Comando REST

`secrets.yaml`:

```yaml
anotado_auth: "Bearer cole-aqui-o-token"
```

`configuration.yaml`:

```yaml
rest_command:
  anotado_adicionar:
    url: "https://notas.teudominio.pt/api/lists/items"
    method: POST
    headers:
      Authorization: !secret anotado_auth
    content_type: "application/json"
    # "leite e ovos" ou "leite, ovos" viram dois itens.
    payload: >
      {"list": {{ lista | to_json }},
       "items": {{ (item | regex_replace(' e ', ',')).split(',') | map('trim') | reject('eq', '') | list | to_json }}}
```

Reinicia o Home Assistant e experimenta em **Ferramentas de programador → Ações**:

```yaml
action: rest_command.anotado_adicionar
data:
  lista: Compras
  item: leite e ovos
```

Pode ser usado em qualquer automação: por exemplo, acrescentar "Detergente" à lista quando um
sensor da máquina da loiça diz que está a acabar.

### Por voz, com o Assist

`custom_sentences/pt/anotado.yaml` (na pasta de configuração do Home Assistant):

```yaml
language: "pt"
intents:
  AnotadoAdicionar:
    data:
      - sentences:
          - "(adiciona|acrescenta|põe|junta) {item} (à|na|a) lista [de|das|dos|da|do] {lista}"
lists:
  item:
    wildcard: true
  lista:
    wildcard: true
```

`configuration.yaml`:

```yaml
intent_script:
  AnotadoAdicionar:
    action:
      - action: rest_command.anotado_adicionar
        data:
          lista: "{{ lista }}"
          item: "{{ item }}"
    speech:
      text: "Feito, adicionei {{ item }} à lista {{ lista }}."
```

Com isto, *"adiciona leite e pão à lista de compras"* acrescenta "leite" e "pão" à checklist
"Compras". O título da lista tem de corresponder ao que dizes depois de "lista de".

> Estes exemplos seguem a documentação atual do Home Assistant (`rest_command`, `intent_script` e
> frases personalizadas), mas ainda não foram experimentados numa instalação real. Se algo não
> funcionar, abre uma issue.

## 4. Atalhos do iPhone e Tasker

Em qualquer app que faça pedidos HTTP:

- **Método:** POST
- **URL:** `https://notas.teudominio.pt/api/lists/items` (ou `/api/notes`)
- **Cabeçalhos:** `Authorization: Bearer <token>` e `Content-Type: application/json`
- **Corpo:** como nos exemplos acima

Nos Atalhos do iPhone: ação **Obter conteúdo do URL**, método POST, corpo do pedido JSON, com os
campos `list` (texto) e `items` (texto pedido com **Pedir entrada**). Junta o atalho à Siri para o usar
por voz.
