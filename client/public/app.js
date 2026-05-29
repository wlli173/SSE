/**
 * Cliente SSE — consome o stream do serviço `sse-server` e renderiza a UI.
 *
 * A URL do stream é relativa (`/events`): o nginx do container `sse-client`
 * faz proxy reverso para `http://sse-server:3000/events`. Para apontar
 * diretamente para o backend (sem proxy), defina `window.SSE_URL` no HTML
 * antes de carregar este script, ex.:
 *   <script>window.SSE_URL = "http://localhost:3000/events";</script>
 */

const SSE_URL = window.SSE_URL || "/events";

const $ = (sel) => document.querySelector(sel);

const els = {
  statusDot:   $("#status-dot"),
  statusText:  $("#status-text"),
  toggleBtn:   $("#toggle-btn"),
  lastUpdate:  $("#last-update"),
  eventsCount: $("#events-count"),
  upCount:     $("#up-count"),
  downCount:   $("#down-count"),
  quotesBody:  $("#quotes-body"),
  eventLog:    $("#event-log"),
};

let eventSource = null;
let eventsReceived = 0;
const rowsBySymbol = new Map();
const previousPrice = new Map();

// ---------- helpers ----------
const formatPrice = (n) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatTime = (iso) => {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleTimeString("pt-BR", { hour12: false });
};

function setStatus(state, label) {
  els.statusDot.className = `dot dot--${state}`;
  els.statusText.textContent = label;
}

function logEvent(name, payload) {
  const empty = els.eventLog.querySelector(".log-empty");
  if (empty) empty.remove();

  const li = document.createElement("li");
  const preview = Array.isArray(payload)
    ? `${payload.length} ativos · ${payload.slice(0, 3).map(p => `${p.symbol}=${formatPrice(p.price)}`).join(", ")}…`
    : JSON.stringify(payload);

  li.innerHTML =
    `<span class="ts">${formatTime()}</span>` +
    `<span class="evt">${name}</span>` +
    `<span>${preview}</span>`;

  els.eventLog.prepend(li);
  while (els.eventLog.children.length > 50) {
    els.eventLog.lastElementChild.remove();
  }
}

// ---------- renderização ----------
function renderRow(stock) {
  let tr = rowsBySymbol.get(stock.symbol);

  if (!tr) {
    const placeholder = els.quotesBody.querySelector(".empty");
    if (placeholder) placeholder.parentElement.remove();

    tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="symbol"></span></td>
      <td class="name"></td>
      <td class="sector"></td>
      <td class="num price"></td>
      <td class="num abs"></td>
      <td class="num pct"></td>
    `;
    els.quotesBody.appendChild(tr);
    rowsBySymbol.set(stock.symbol, tr);
  }

  tr.querySelector(".symbol").textContent = stock.symbol;
  tr.querySelector(".name").textContent   = stock.name;
  tr.querySelector(".sector").textContent = stock.sector;
  tr.querySelector(".price").textContent  = `R$ ${formatPrice(stock.price)}`;

  const prev = previousPrice.get(stock.symbol);
  const dir =
    prev == null || stock.price === prev ? "flat"
    : stock.price > prev ? "up" : "down";

  const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "■";
  const signed = (n) => (n > 0 ? `+${formatPrice(n)}` : formatPrice(n));

  tr.querySelector(".abs").innerHTML =
    `<span class="change ${dir}"><span class="arrow">${arrow}</span>${signed(stock.changeAbs)}</span>`;
  tr.querySelector(".pct").innerHTML =
    `<span class="change ${dir}">${signed(stock.changePct)}%</span>`;

  if (prev != null && stock.price !== prev) {
    tr.classList.remove("row-flash-up", "row-flash-down");
    void tr.offsetWidth;
    tr.classList.add(dir === "up" ? "row-flash-up" : "row-flash-down");
  }

  previousPrice.set(stock.symbol, stock.price);
}

function updateSummary(updates) {
  els.lastUpdate.textContent = formatTime(updates[0]?.timestamp);
  eventsReceived += 1;
  els.eventsCount.textContent = eventsReceived.toLocaleString("pt-BR");

  let up = 0, down = 0;
  for (const u of updates) {
    if (u.changePct > 0) up++;
    else if (u.changePct < 0) down++;
  }
  els.upCount.textContent = up;
  els.downCount.textContent = down;
}

// ---------- conexão SSE ----------
function connect() {
  if (eventSource) return;

  setStatus("off", "Conectando…");
  eventSource = new EventSource(SSE_URL);

  eventSource.addEventListener("open", () => {
    setStatus("on", "Conectado");
    els.toggleBtn.textContent = "Desconectar";
    logEvent("open", `Stream SSE aberto em ${SSE_URL}`);
  });

  eventSource.addEventListener("snapshot", (e) => {
    const data = JSON.parse(e.data);
    data.forEach(renderRow);
    logEvent("snapshot", data);
  });

  eventSource.addEventListener("price-update", (e) => {
    const data = JSON.parse(e.data);
    data.forEach(renderRow);
    updateSummary(data);
    logEvent("price-update", data);
  });

  eventSource.addEventListener("error", () => {
    if (eventSource && eventSource.readyState === EventSource.CONNECTING) {
      setStatus("err", "Reconectando…");
    } else {
      setStatus("err", "Erro na conexão");
    }
    logEvent("error", "Falha na conexão SSE");
  });
}

function disconnect() {
  if (!eventSource) return;
  eventSource.close();
  eventSource = null;
  setStatus("off", "Desconectado");
  els.toggleBtn.textContent = "Conectar";
  logEvent("close", "Stream encerrado pelo cliente");
}

els.toggleBtn.addEventListener("click", () => {
  if (eventSource) disconnect();
  else connect();
});

connect();
