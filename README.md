# SSE Market — Simulador de Mercado Financeiro com Server-Sent Events

Aplicação de exemplo para demonstrar **SSE (Server-Sent Events)**

![stack](https://img.shields.io/badge/stack-Node%20%2B%20Express%20%2B%20nginx-339933) ![docker](https://img.shields.io/badge/orquestra%C3%A7%C3%A3o-Docker%20Compose-2496ED) ![sse](https://img.shields.io/badge/protocolo-SSE-blue)

## Arquitetura

```
┌─────────────┐        :8080         ┌──────────────────┐
│             │ ────────────────────▶│   sse-client     │   nginx
│  Navegador  │                      │  (static + proxy)│
│             │◀──── /events ────────│                  │
└─────────────┘    (stream SSE)      └────────┬─────────┘
                                              │
                                              │  proxy_pass
                                              │  http://sse-server:3000
                                              ▼
                                     ┌──────────────────┐
                                     │   sse-server     │   Node + Express
                                     │ (gerador SSE)    │
                                     └──────────────────┘
                                     porta interna 3000
                                       (não exposta)
```

| Container    | Imagem base       | Porta no host | Responsabilidade                                |
| ------------ | ----------------- | ------------- | ----------------------------------------------- |
| `sse-server` | `node:20-alpine`  | —             | Gera as cotações e expõe `/events` (SSE)        |
| `sse-client` | `nginx:alpine`    | `8080`        | Serve a SPA e faz proxy reverso para o backend  |

Os dois containers ficam na rede interna **`sse-net`** do Compose. O cliente
resolve o backend pelo DNS interno do Docker (`sse-server`) — o backend não
precisa ser publicado no host.

## Como rodar

Pré-requisito: **Docker + Docker Compose**.

```bash
docker compose up --build
```

Depois abra <http://localhost:8080>.

Para parar tudo:

```bash
docker compose down
```

## Estrutura do projeto

```
SSE/
├── docker-compose.yml          # orquestra os dois serviços
├── README.md
│
├── server/                     # ◀── gerador de mensagens SSE
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── package.json
│   └── server.js
│
└── client/                     # ◀── cliente (nginx + frontend)
    ├── Dockerfile
    ├── .dockerignore
    ├── nginx.conf
    └── public/
        ├── index.html
        ├── styles.css
        └── app.js
```

## Pontos-chave para SSE em produção

### Backend (`server/server.js`)

```js
res.setHeader("Content-Type", "text/event-stream");
res.setHeader("Cache-Control", "no-cache, no-transform");
res.setHeader("Connection", "keep-alive");
res.setHeader("X-Accel-Buffering", "no");   // evita buffering em proxies
```

- Evento nomeado: `event: price-update`
- ID de evento: `id: <timestamp>` (habilita `Last-Event-ID` na reconexão)
- Heartbeat: `: heartbeat ...` a cada 20s para atravessar proxies/firewalls
- Limpeza de timers em `req.on('close')`

### Proxy nginx (`client/nginx.conf`)

```nginx
location /events {
    proxy_pass              http://sse-server:3000/events;
    proxy_http_version      1.1;
    proxy_set_header        Connection "";
    proxy_buffering         off;     # ◀── CRÍTICO para SSE
    proxy_cache             off;
    proxy_read_timeout      24h;
    chunked_transfer_encoding on;
}
```

Sem `proxy_buffering off`, o nginx acumularia os eventos no buffer e o
navegador só receberia o stream em "lotes" — quebrando a sensação de
tempo real.

### Frontend (`client/public/app.js`)

```js
const es = new EventSource("/events");                  // mesmo origin → sem CORS
es.addEventListener("snapshot",     (e) => render(JSON.parse(e.data)));
es.addEventListener("price-update", (e) => render(JSON.parse(e.data)));
// reconexão automática gerenciada pelo próprio EventSource
```

## Comandos úteis

```bash
docker compose up --build             # build + start em foreground
docker compose up -d --build          # em background
docker compose logs -f sse-server     # logs do gerador
docker compose logs -f sse-client     # logs do nginx
docker compose ps                     # status dos containers
docker compose down -v                # para tudo e remove a rede
```

Testar o stream do backend a partir de dentro da rede do compose:

```bash
docker compose exec sse-client wget -qO- http://sse-server:3000/events
```

Ou via proxy do cliente, do host:

```bash
curl -N http://localhost:8080/events
```

## Desenvolvimento sem Docker

Se quiser iterar no backend sem rebuild:

```bash
cd server
npm install
npm start
```

E rodar o frontend separadamente (qualquer servidor estático), apontando para
o backend definindo `window.SSE_URL` antes do `app.js`:

```html
<script>window.SSE_URL = "http://localhost:3000/events";</script>
<script src="app.js"></script>
```

## Licença

MIT
