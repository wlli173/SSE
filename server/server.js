/**
 * Gerador de mensagens SSE — Simulador de Mercado Financeiro.
 *
 * Este serviço é responsável APENAS por produzir o stream de cotações.
 * Não serve arquivos estáticos: o frontend é entregue por outro container
 * (nginx) que faz proxy reverso para este endpoint.
 */

const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

// CORS permissivo — o frontend pode estar em outro host/porta quando
// acessar este serviço diretamente (sem passar pelo proxy nginx).
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Cache-Control");
  next();
});

// Catálogo inicial de ações com preços-base
const stocks = [
  { symbol: "PETR4", name: "Petrobras",      price: 38.50, sector: "Energia" },
  { symbol: "VALE3", name: "Vale",           price: 65.20, sector: "Mineração" },
  { symbol: "ITUB4", name: "Itaú Unibanco",  price: 32.10, sector: "Financeiro" },
  { symbol: "BBDC4", name: "Bradesco",       price: 14.85, sector: "Financeiro" },
  { symbol: "MGLU3", name: "Magazine Luiza", price:  9.40, sector: "Varejo" },
  { symbol: "WEGE3", name: "WEG",            price: 42.75, sector: "Industrial" },
  { symbol: "ABEV3", name: "Ambev",          price: 13.30, sector: "Bebidas" },
  { symbol: "B3SA3", name: "B3",             price: 11.95, sector: "Financeiro" },
];

const lastPrices = Object.fromEntries(stocks.map(s => [s.symbol, s.price]));

function tickPrices() {
  return stocks.map(stock => {
    const variationPct = (Math.random() - 0.5) * 0.03; // ±1.5%
    const newPrice = Math.max(0.01, stock.price * (1 + variationPct));
    const previous = lastPrices[stock.symbol];
    const changeAbs = newPrice - previous;
    const changePct = (changeAbs / previous) * 100;

    stock.price = newPrice;
    lastPrices[stock.symbol] = newPrice;

    return {
      symbol:    stock.symbol,
      name:      stock.name,
      sector:    stock.sector,
      price:     Number(newPrice.toFixed(2)),
      changeAbs: Number(changeAbs.toFixed(2)),
      changePct: Number(changePct.toFixed(2)),
      timestamp: new Date().toISOString(),
    };
  });
}

// Healthcheck para o docker-compose
app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.get("/api/stocks", (_req, res) => res.json(stocks));

/**
 * Endpoint SSE — stream contínuo de cotações.
 * Consumir com: new EventSource('/events')
 */
app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const clientId = Date.now();
  console.log(`[SSE] Cliente ${clientId} conectado`);

  // Snapshot inicial
  const snapshot = stocks.map(s => ({
    symbol:    s.symbol,
    name:      s.name,
    sector:    s.sector,
    price:     Number(s.price.toFixed(2)),
    changeAbs: 0,
    changePct: 0,
    timestamp: new Date().toISOString(),
  }));
  res.write(`event: snapshot\n`);
  res.write(`data: ${JSON.stringify(snapshot)}\n\n`);

  const intervalId = setInterval(() => {
    const updates = tickPrices();
    res.write(`event: price-update\n`);
    res.write(`id: ${Date.now()}\n`);
    res.write(`data: ${JSON.stringify(updates)}\n\n`);
  }, 1000);

  const heartbeatId = setInterval(() => {
    res.write(`: heartbeat ${Date.now()}\n\n`);
  }, 20000);

  req.on("close", () => {
    clearInterval(intervalId);
    clearInterval(heartbeatId);
    console.log(`[SSE] Cliente ${clientId} desconectado`);
    res.end();
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  [server] Gerador SSE rodando em http://0.0.0.0:${PORT}`);
  console.log(`  [server] Stream:  /events`);
  console.log(`  [server] Health:  /health\n`);
});
