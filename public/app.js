/* ✠ Имперское Таро — клиентская логика веб-храма */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  spreads: [],
  selectedSpreadId: null,
  cards: null, // кэш кодекса
  casting: false,
};

/* ---------- Утилиты ---------- */

function turbulenceOmen(t) {
  if (t < 0.2) return "Штиль имматериума: знаки читаются ясно.";
  if (t < 0.4) return "Лёгкая рябь варпа: толкование надёжно.";
  if (t < 0.6) return "Варп неспокоен: знаки двоятся, будь внимателен.";
  if (t < 0.8) return "Варп-буря крепчает: многие карты ложатся навыворот.";
  return "ВАРП-ШТОРМ! Завеса истончилась — внимай знакам с трепетом.";
}

function el(tag, cls, html) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const AQUILA_BACK = `<svg viewBox="0 0 120 120" class="back-emblem" fill="currentColor">
  <path d="M60 58 L20 40 L34 50 L18 50 L36 60 L20 62 L40 70 L26 74 L60 78 Z"/>
  <path d="M60 58 L100 40 L86 50 L102 50 L84 60 L100 62 L80 70 L94 74 L60 78 Z"/>
  <path d="M60 44 q8 14 6 40 q-6 8 -6 14 q0 -6 -6 -14 q-2 -26 6 -40 Z"/>
  <path d="M58 46 q-3 -10 -12 -12 q6 -2 9 2 q1 -4 5 -4 q-3 6 -2 14 Z"/>
  <path d="M62 46 q3 -10 12 -12 q-6 -2 -9 2 q-1 -4 -5 -4 q3 6 2 14 Z"/>
  <path d="M54 96 L60 86 L66 96 L60 92 Z"/>
</svg>`;

/* ---------- Состояние LM Studio ---------- */

async function checkHealth() {
  const chip = $("#lmStatus");
  const text = $("#lmText");
  chip.classList.remove("online", "offline");
  text.textContent = "Проверка LM Studio…";
  try {
    const data = await getJson("/api/health");
    if (data.lmstudio) {
      chip.classList.add("online");
      const model = data.models?.[0] ? ` · ${data.models[0]}` : "";
      text.textContent = `LM Studio на связи${model}`;
    } else {
      chip.classList.add("offline");
      text.textContent = "LM Studio офлайн — толкование локально";
    }
  } catch {
    chip.classList.add("offline");
    text.textContent = "Сервер недоступен";
  }
}

/* ---------- Расклады ---------- */

async function loadSpreads() {
  const data = await getJson("/api/spreads");
  state.spreads = data.spreads;
  const grid = $("#spreadGrid");
  grid.innerHTML = "";
  data.spreads.forEach((s, i) => {
    const card = el("button", "spread-card");
    card.type = "button";
    card.dataset.id = s.id;
    card.innerHTML = `
      <div class="sc-name">${escapeHtml(s.name)}</div>
      <div class="sc-title">${escapeHtml(s.title)}</div>
      <div class="sc-size">${s.size} карт</div>`;
    card.addEventListener("click", () => selectSpread(s.id));
    grid.appendChild(card);
    // По умолчанию выбираем «Триптих» либо первый.
    if (s.id === "triptych" || (i === 0 && !state.selectedSpreadId)) selectSpread(s.id);
  });
}

function selectSpread(id) {
  state.selectedSpreadId = id;
  $$(".spread-card").forEach((c) => c.classList.toggle("active", c.dataset.id === id));
}

/* ---------- Обряд гадания ---------- */

async function cast() {
  if (state.casting) return;
  state.casting = true;

  const btn = $("#castBtn");
  btn.disabled = true;
  btn.classList.add("casting");

  const panel = $("#resultPanel");
  panel.hidden = false;
  $("#interpretation").hidden = true;
  $("#vox").innerHTML = "";
  $("#interpSource").innerHTML = "";
  $("#cards").innerHTML = "";
  $("#turbulence").hidden = true;
  $("#spreadHeader").innerHTML =
    `<p class="sh-desc">Провожу обряд: очищаю разум, считываю варп, трижды тасую колоду…</p>`;
  panel.scrollIntoView({ behavior: "smooth", block: "start" });

  const payload = {
    question: $("#question").value.trim(),
    spreadId: state.selectedSpreadId,
    seed: $("#seed").value.trim() || undefined,
    offline: $("#offline").checked,
  };

  let voxStarted = false;
  const vox = $("#vox");

  try {
    await streamDivine(payload, {
      onReading: (reading) => renderReading(reading),
      onStatus: (s) => {
        if (!s.lmstudio) flashSource(`⚠ ${s.message ?? "LM Studio офлайн"}`, "warn");
      },
      onToken: (delta) => {
        if (!voxStarted) {
          $("#interpretation").hidden = false;
          voxStarted = true;
        }
        vox.append(document.createTextNode(delta));
        vox.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
      },
      onDone: (d) => {
        $("#interpretation").hidden = false;
        const label = d.source === "lmstudio"
          ? `<span class="ok">Источник: LM Studio${d.model ? ` (${escapeHtml(d.model)})` : ""}</span>`
          : `<span>Источник: офлайн-прорицание</span>`;
        const warn = d.warning ? `<div class="warn">⚠ ${escapeHtml(d.warning)}</div>` : "";
        $("#interpSource").innerHTML = label + warn;
      },
      onError: (msg) => {
        $("#interpretation").hidden = false;
        $("#interpSource").innerHTML = `<div class="warn">✗ Сбой обряда: ${escapeHtml(msg)}</div>`;
      },
    });
  } catch (err) {
    $("#interpretation").hidden = false;
    $("#interpSource").innerHTML = `<div class="warn">✗ ${escapeHtml(err.message || String(err))}</div>`;
  } finally {
    state.casting = false;
    btn.disabled = false;
    btn.classList.remove("casting");
  }
}

function flashSource(text, cls) {
  $("#interpSource").innerHTML = `<div class="${cls}">${escapeHtml(text)}</div>`;
}

/* Парсинг SSE-потока от POST /api/divine */
async function streamDivine(payload, handlers) {
  const res = await fetch("/api/divine", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      let event = "message";
      let dataStr = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
      }
      if (!dataStr) continue;
      let data;
      try { data = JSON.parse(dataStr); } catch { continue; }
      dispatch(event, data, handlers);
    }
  }
}

function dispatch(event, data, h) {
  switch (event) {
    case "reading": h.onReading?.(data.reading); break;
    case "status": h.onStatus?.(data); break;
    case "token": h.onToken?.(data.delta); break;
    case "done": h.onDone?.(data); break;
    case "error": h.onError?.(data.message); break;
  }
}

/* ---------- Рендер расклада ---------- */

function renderReading(reading) {
  const sp = reading.spread;
  const q = reading.question
    ? `<p class="sh-q">Вопрос к варпу: «${escapeHtml(reading.question)}»</p>`
    : `<p class="sh-q">Знамение общего течения судьбы.</p>`;
  $("#spreadHeader").innerHTML = `
    <h2>${escapeHtml(sp.name)} — ${escapeHtml(sp.title)}</h2>
    <p class="sh-desc">${escapeHtml(sp.description)}</p>
    ${q}`;

  // Турбулентность
  const t = reading.warpTurbulence;
  $("#turbulence").hidden = false;
  $("#turbPct").textContent = `${Math.round(t * 100)}%`;
  $("#turbOmen").textContent = turbulenceOmen(t);
  requestAnimationFrame(() => { $("#turbFill").style.width = `${Math.round(t * 100)}%`; });

  // Карты
  const wrap = $("#cards");
  wrap.innerHTML = "";
  reading.cards.forEach((drawn, i) => {
    const node = buildCard(drawn);
    wrap.appendChild(node);
    // Каскадное раскрытие
    setTimeout(() => node.classList.add("revealed"), 250 + i * 320);
  });
}

function buildCard(drawn) {
  const { card, orientation, position } = drawn;
  const reversed = orientation === "reversed";
  const meaning = reversed ? card.reversed : card.upright;

  const root = el("div", `card elem-${card.element}${reversed ? " reversed" : ""}`);
  const orientCls = reversed ? "rev" : "up";
  const orientTxt = reversed ? "▼ перевёрнуто" : "▲ прямое";
  const arcana = card.arcana === "major" ? "Старший Аркан" : "Младший Аркан";

  const kw = meaning.keywords.map((k) => `<span class="kw">${escapeHtml(k)}</span>`).join("");

  root.innerHTML = `
    <div class="card-inner">
      <div class="card-face card-back">${AQUILA_BACK}</div>
      <div class="card-face card-front">
        <div class="card-pos">
          <span>${escapeHtml(position.name)}</span>
          <span class="card-orient ${orientCls}">${orientTxt}</span>
        </div>
        <div class="card-glyph">${escapeHtml(card.glyph)}</div>
        <div class="card-name">${escapeHtml(card.name)}</div>
        <div class="card-title">${escapeHtml(card.title)} · ${arcana}</div>
        <div class="card-keywords">${kw}</div>
        <div class="card-text">${escapeHtml(meaning.text)}</div>
      </div>
    </div>`;
  root.title = position.meaning;
  return root;
}

/* ---------- Модальное окно: правила ---------- */

async function openRules() {
  const modal = $("#rulesModal");
  modal.hidden = false;
  if (!modal.dataset.loaded) {
    const data = await getJson("/api/rules");
    $("#rulesPreamble").textContent = data.preamble;
    const list = $("#rulesList");
    list.innerHTML = "";
    for (const r of data.rules) {
      const node = el("div", "rule",
        `<h4>${r.n}. ${escapeHtml(r.title)}</h4><p>${escapeHtml(r.text)}</p>`);
      list.appendChild(node);
    }
    modal.dataset.loaded = "1";
  }
}

/* ---------- Модальное окно: кодекс карт ---------- */

const CODEX_FILTERS = [
  { id: "all", label: "Все" },
  { id: "major", label: "Старшие" },
  { id: "aquila", label: "❂ Аквилы" },
  { id: "bolter", label: "⚜ Болтеры" },
  { id: "chalice", label: "♆ Чаши" },
  { id: "blade", label: "† Клинки" },
];

async function openCodex() {
  const modal = $("#codexModal");
  modal.hidden = false;
  if (!state.cards) {
    const data = await getJson("/api/cards");
    state.cards = data.cards;
    const filters = $("#codexFilters");
    filters.innerHTML = "";
    CODEX_FILTERS.forEach((f) => {
      const b = el("button", "link-btn", f.label);
      b.type = "button";
      b.addEventListener("click", () => renderCodex(f.id));
      filters.appendChild(b);
    });
  }
  renderCodex("all");
}

function renderCodex(filter) {
  const grid = $("#codexGrid");
  $("#codexDetail").hidden = true;
  let cards = state.cards;
  if (filter === "major") cards = cards.filter((c) => c.arcana === "major");
  else if (filter !== "all") cards = cards.filter((c) => c.suit === filter);

  grid.innerHTML = "";
  for (const c of cards) {
    const item = el("button", "codex-item");
    item.type = "button";
    item.innerHTML = `
      <div class="ci-name"><span class="ci-glyph">${escapeHtml(c.glyph)}</span>${escapeHtml(c.name)}</div>
      <div class="ci-title">${escapeHtml(c.title)}</div>`;
    item.addEventListener("click", () => showCardDetail(c));
    grid.appendChild(item);
  }
}

function showCardDetail(c) {
  const arcana = c.arcana === "major" ? "Старший Аркан" : "Младший Аркан";
  const d = $("#codexDetail");
  d.hidden = false;
  d.innerHTML = `
    <h3>${escapeHtml(c.glyph)} ${escapeHtml(c.name)}</h3>
    <div class="ci-title">${escapeHtml(c.title)} · ${arcana} · стихия: ${escapeHtml(c.element)}</div>
    <p class="cd-lore">${escapeHtml(c.lore)}</p>
    <div class="cd-side"><span class="cd-up">▲ Прямое:</span> ${escapeHtml(c.upright.keywords.join(", "))}<br>${escapeHtml(c.upright.text)}</div>
    <div class="cd-side"><span class="cd-rev">▼ Перевёрнутое:</span> ${escapeHtml(c.reversed.keywords.join(", "))}<br>${escapeHtml(c.reversed.text)}</div>`;
  d.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* ---------- Модальные окна: общее ---------- */

function wireModals() {
  $$(".modal").forEach((m) => {
    m.addEventListener("click", (e) => {
      if (e.target === m || e.target.hasAttribute("data-close")) m.hidden = true;
    });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") $$(".modal").forEach((m) => (m.hidden = true));
  });
}

/* ---------- Инициализация ---------- */

async function init() {
  wireModals();
  $("#castBtn").addEventListener("click", cast);
  $("#openRules").addEventListener("click", openRules);
  $("#openCodex").addEventListener("click", openCodex);
  $("#recheckLm").addEventListener("click", checkHealth);
  $("#question").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) cast();
  });

  try { await loadSpreads(); } catch (e) { console.error("Расклады не загружены:", e); }
  checkHealth();
}

init();
