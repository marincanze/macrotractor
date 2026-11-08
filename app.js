/* Macrotractor – odjemalec (PWA, brez gradnje). Prevodi so v i18n.js. */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const r0 = (n) => Math.round(n || 0);
const r1 = (n) => Math.round((n || 0) * 10) / 10;
const icon = (id) => `<svg><use href="#i-${id}"/></svg>`;
const buzz = () => navigator.vibrate?.(12);

const state = {
  day: isoDay(new Date()),
  profile: null,
  entries: [],
  version: null,
  statsDays: 7,
  view: "today",
};

const MACROS = ["protein", "carbs", "fat"];
// dodatna hranila (g) in vse, kar se pri spremembi količine sorazmerno preračuna
const EXTRAS = ["sat_fat", "sugar", "fiber", "salt"];
const NUTR = ["kcal", ...MACROS, ...EXTRAS];

function isoDay(d) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}
function shiftDay(day, n) {
  const d = new Date(day + "T12:00:00");
  d.setDate(d.getDate() + n);
  return isoDay(d);
}
function nowTime() {
  return new Date().toTimeString().slice(0, 5);
}
const shortDate = (d) => `${+d.slice(8)}.${+d.slice(5, 7)}.`;
const macroLine = (it, unit = "") =>
  `<span class="p">${t("macro.p")} ${r1(it.protein)}${unit}</span> · <span class="c">${t("macro.c")} ${r1(it.carbs)}${unit}</span> · <span class="f">${t("macro.f")} ${r1(it.fat)}${unit}</span>`;

const extrasLine = (it) =>
  EXTRAS.filter((k) => it[k] != null).map((k) => `${t("nutr." + k)} ${r1(it[k])} g`).join(" · ");

// ocena zdravja (1–10) z barvo
const healthBadge = (h, cls = "") =>
  h ? `<span class="hs ${h >= 7 ? "good" : h >= 5 ? "mid" : "bad"} ${cls}">${String(r1(h)).replace(".", I18N[LANG].locale.startsWith("sl") ? "," : ".")}</span>` : "";

/* ---------------------------------------------------------------- API */

let token = null;
try { token = localStorage.getItem("mt_token"); } catch {}

async function api(path, opts = {}) {
  // samostojna različica: podatki na telefonu, Claude prek aplikacije Claude (local.js)
  if (window.MT_LOCAL) return localApi(path, opts);
  const headers = { "Content-Type": "application/json", "X-Lang": LANG };
  if (token) headers["X-App-Token"] = token;
  const res = await fetch("api/" + path, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) {
    showLogin();
    throw new Error(t("login.required"));
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || t("error.http", { status: res.status }));
  return data;
}

function toast(msg, err = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.toggle("err", err);
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 3200);
}

/* ---------------------------------------------------------------- izračun ciljev */

function targets(p) {
  const w = +p.weight_kg, h = +p.height_cm, a = +p.age;
  const bmr = 10 * w + 6.25 * h - 5 * a + (p.sex === "female" ? -161 : 5);
  const tdee = bmr * +p.activity;
  // 1 kg maščobnega tkiva ≈ 7700 kcal
  const delta = p.goal === "cut" ? -(+p.rate * 7700) / 7 : p.goal === "bulk" ? (+p.rate * 7700) / 7 : 0;
  const floor = p.sex === "female" ? 1200 : 1500;
  let kcal = p.custom_kcal ? +p.custom_kcal : Math.max(floor, tdee + delta);
  const protein = +p.protein_per_kg * w;
  const fat = (kcal * (+p.fat_pct / 100)) / 9;
  const carbs = Math.max(0, (kcal - protein * 4 - fat * 9) / 4);
  return { bmr, tdee, delta, kcal, protein, carbs, fat };
}

function totals(entries) {
  const s = Object.fromEntries(NUTR.map((k) => [k, 0]));
  for (const e of entries) for (const k of NUTR) s[k] += +e[k] || 0;
  return s;
}

// povprečna ocena zdravja, utežena s kalorijami
function healthOf(entries) {
  const rated = entries.filter((e) => e.health);
  if (!rated.length) return null;
  const w = rated.reduce((s, e) => s + Math.max(1, e.kcal), 0);
  return rated.reduce((s, e) => s + e.health * Math.max(1, e.kcal), 0) / w;
}

// priporočene meje: nasičene ≤ 10 % energije, sladkorji ≤ 90 g / 2000 kcal (EU RI),
// vlaknine ≥ 14 g / 1000 kcal, sol ≤ 5 g (WHO)
function extraLimits(kcal) {
  return {
    sat_fat: { max: (kcal * 0.1) / 9 },
    sugar: { max: (kcal * 90) / 2000 },
    fiber: { min: (kcal * 14) / 1000 },
    salt: { max: 5 },
  };
}

function remaining() {
  const tg = targets(state.profile), s = totals(state.entries);
  return { kcal: tg.kcal - s.kcal, protein: tg.protein - s.protein, carbs: tg.carbs - s.carbs, fat: tg.fat - s.fat };
}

/* ---------------------------------------------------------------- jezik */

function renderStaticTexts() {
  applyI18n();
  $$("#rangeSeg button").forEach((b) => (b.textContent = t("stats.days", { n: b.dataset.days })));
  $$("[name=rate] option").forEach((o) => (o.textContent = t("rate.option", { n: (+o.value).toLocaleString(I18N[LANG].locale) })));
  $$("#langSeg button").forEach((b) => b.classList.toggle("active", b.dataset.lang === LANG));
}

$("#langSeg").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-lang]");
  if (!b || b.dataset.lang === LANG) return;
  setLang(b.dataset.lang);
  renderStaticTexts();
  if (state.profile) {
    renderToday();
    renderCalc();
    loadRecent();
    loadClaudeStatus();
  }
});

/* ---------------------------------------------------------------- navigacija */

$("#tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-view]");
  if (b) showView(b.dataset.view);
});

function showView(v) {
  state.view = v;
  $$("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
  $$(".view").forEach((s) => s.classList.toggle("active", s.id === "view-" + v));
  if (v === "stats") loadStats();
  if (v === "profile") fillProfileForm();
  window.scrollTo(0, 0);
}

/* ---------------------------------------------------------------- DANES */

$("#prevDay").onclick = () => setDay(shiftDay(state.day, -1));
$("#nextDay").onclick = () => setDay(shiftDay(state.day, 1));

// na telefonu: podrsaj levo/desno po povzetku dneva za menjavo dneva
(() => {
  const el = $("#dayCard");
  let x0 = null, y0 = null;
  el.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  el.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      buzz();
      setDay(shiftDay(state.day, dx < 0 ? 1 : -1));
    }
  }, { passive: true });
})();

function setDay(d) {
  state.day = d;
  loadEntries();
}

function dayLabel(d) {
  const today = isoDay(new Date());
  if (d === today) return t("day.today");
  if (d === shiftDay(today, -1)) return t("day.yesterday");
  if (d === shiftDay(today, 1)) return t("day.tomorrow");
  return new Date(d + "T12:00:00").toLocaleDateString(I18N[LANG].locale, { weekday: "short", day: "numeric", month: "short" });
}

async function loadEntries() {
  const data = await api("entries?day=" + state.day);
  state.entries = data.entries;
  state.rating = data.rating || null;
  state.version = data.version;
  renderToday();
}

const MEALS = [
  { key: "breakfast", emoji: "🌅", until: "10:30" },
  { key: "lunch", emoji: "☀️", until: "15:30" },
  { key: "snack", emoji: "🍎", until: "18:00" },
  { key: "dinner", emoji: "🌙", until: "24:00" },
];

function mealOf(time) {
  return MEALS.find((m) => (time || "12:00") < m.until) || MEALS[MEALS.length - 1];
}

function greeting() {
  const h = new Date().getHours();
  return t(h < 10 ? "greet.morning" : h < 18 ? "greet.day" : "greet.evening");
}

function renderToday() {
  $("#greeting").textContent = greeting();
  $("#dayLabel").textContent = dayLabel(state.day);
  const tg = targets(state.profile);
  const s = totals(state.entries);
  const left = tg.kcal - s.kcal;

  $("#kcalLeft").textContent = fmt(Math.abs(left));
  $("#kcalLeftLabel").textContent = t(left >= 0 ? "kcal.left" : "kcal.over");
  $("#kcalEaten").textContent = fmt(s.kcal);
  $("#kcalTarget").textContent = fmt(tg.kcal);
  const chip = $("#goalChip");
  chip.textContent = t("goal." + state.profile.goal);
  chip.className = "goal-chip " + state.profile.goal;

  const ring = $("#kcalRing");
  const C = 2 * Math.PI * 86;
  ring.setAttribute("stroke-dasharray", C);
  ring.setAttribute("stroke-dashoffset", C * (1 - Math.min(1, s.kcal / tg.kcal || 0)));
  ring.classList.toggle("over", left < 0);

  $("#macroCards").innerHTML = MACROS.map((k) => {
    const eaten = s[k], goal = tg[k];
    const pct = Math.min(100, (eaten / goal) * 100 || 0);
    const over = eaten > goal * 1.05;
    const rest = goal - eaten;
    return `<div class="mcard ${k} ${over ? "over" : ""}">
      <div class="mcard-top"><span class="mdot"></span><span class="mname">${t("macro." + k)}</span><span class="mleft">${rest >= 0 ? t("macro.left", { n: r0(rest) }) : `+${r0(-rest)} g`}</span></div>
      <div class="mnum">${r0(eaten)}<small> / ${r0(goal)} g</small></div>
      <div class="mbar"><i style="width:${pct}%"></i></div>
    </div>`;
  }).join("");

  renderDetails(tg, s);

  const groups = MEALS.map((m) => ({ ...m, items: state.entries.filter((e) => mealOf(e.time).key === m.key) }))
    .filter((g) => g.items.length);
  $("#meals").innerHTML = groups.map((g) => {
    const tot = totals(g.items);
    return `<div class="card meal">
      <div class="meal-head">
        <span class="meal-emoji">${g.emoji}</span>
        <div><h3>${t("meal." + g.key)}</h3><div class="sub">${t("entries.count", { n: g.items.length })}</div></div>
        ${healthBadge(healthOf(g.items))}
        <div class="tot">${r0(tot.kcal)} <small>kcal</small></div>
      </div>
      <ul class="entries">${g.items.map((e) => `
        <li data-id="${e.id}" data-edit="${e.id}">
          <div>
            <div class="name">${esc(e.name)}${e.grams ? ` <small>· ${r0(e.grams)} g</small>` : ""} ${healthBadge(e.health, "sm")}</div>
            <div class="sub"><span class="p">${r1(e.protein)} ${t("macro.p")}</span><span class="c">${r1(e.carbs)} ${t("macro.c")}</span><span class="f">${r1(e.fat)} ${t("macro.f")}</span></div>
          </div>
          <span class="kcal">${r0(e.kcal)}<small>${esc(e.time)}</small></span>
          <button class="del" aria-label="${t("delete")}" data-del="${e.id}">${icon("x")}</button>
        </li>`).join("")}
      </ul>
    </div>`;
  }).join("");
  $("#entriesEmpty").hidden = state.entries.length > 0;
}

function renderDetails(tg, s) {
  const lim = extraLimits(tg.kcal);
  const h = healthOf(state.entries);
  const r = state.rating;
  $("#detailCard").innerHTML = `
    <div class="nutr-grid">${EXTRAS.map((k) => {
      const v = s[k], l = lim[k];
      const goal = l.max ?? l.min;
      const bad = l.max ? v > l.max : false;
      const good = l.min ? v >= l.min : false;
      return `<div class="nutr ${bad ? "bad" : ""} ${good ? "good" : ""}">
        <span class="lbl">${t("nutr." + k)}</span>
        <b>${r1(v)}<small> g</small></b>
        <span class="lim">${t(l.max ? "nutr.max" : "nutr.min", { n: r0(goal) })}</span>
        <i style="--p:${Math.min(100, (v / goal) * 100 || 0)}%"></i>
      </div>`;
    }).join("")}</div>
    <div class="health-row">
      <div class="health-score">
        ${r ? healthBadge(r.score, "lg") : h ? healthBadge(h, "lg") : `<span class="hs lg none">–</span>`}
        <div><b>${t(r ? "health.claude" : "health.title")}</b><small>${r ? "" : h ? t("health.meals") : t("health.none")}</small></div>
      </div>
      <button class="btn soft sm" id="rateDayBtn" ${state.entries.length ? "" : "disabled"}>${icon("sparkle")} ${t(r ? "health.rerate" : "health.rate")}</button>
    </div>
    ${r?.comment ? `<p class="health-note">${esc(r.comment)}</p>` : ""}`;
}

$("#detailCard").addEventListener("click", async (e) => {
  const btn = e.target.closest("#rateDayBtn");
  if (!btn) return;
  btn.disabled = true;
  const tg = targets(state.profile);
  const old = btn.innerHTML;
  btn.innerHTML = `<span class="spinner"></span> ${t("loading.day")}`;
  try {
    const r = await api("ai/day", {
      method: "POST",
      body: {
        day: state.day, goal: state.profile.goal,
        targets: { kcal: tg.kcal, protein: tg.protein, carbs: tg.carbs, fat: tg.fat },
        entries: state.entries.map(({ name, grams, time, ...e }) => ({ name, grams, time, ...Object.fromEntries(NUTR.map((k) => [k, e[k]])) })),
      },
    });
    await api("ratings", { method: "PUT", body: { day: state.day, score: r.score, comment: r.comment } });
    state.rating = { score: r.score, comment: r.comment };
    buzz();
    renderToday();
  } catch (err) {
    toast(err.message, true);
    btn.innerHTML = old;
    btn.disabled = false;
  }
});

$("#meals").addEventListener("click", async (e) => {
  const id = e.target.closest("[data-del]")?.dataset.del;
  if (!id) {
    const edit = e.target.closest("[data-edit]")?.dataset.edit;
    if (edit) openEntryEditor(edit);
    return;
  }
  const entry = state.entries.find((x) => x.id === id);
  if (!confirm(t("entry.confirmDelete", { name: entry?.name ?? "" }))) return;
  state.entries = state.entries.filter((x) => x.id !== id);
  renderToday();
  buzz();
  try {
    await api("entries/" + id, { method: "DELETE" });
    toast(t("deleted", { name: entry?.name ?? "" }));
    loadRecent();
  } catch (err) {
    toast(err.message, true);
    loadEntries();
  }
});

/* ---- predogled vnosa pred potrditvijo ---- */

// vrednosti iz `base`, preračunane na faktor f (nove grame / stare grame)
function scaled(base, f) {
  const out = {};
  for (const k of NUTR) if (base[k] != null) out[k] = base[k] * f;
  return out;
}

function scaleItem(it, grams) {
  if (!it._base || !it._base.grams) return { ...it, grams };
  return { ...it, grams, ...scaled(it._base, grams / it._base.grams) };
}

function showPending(items, { note = "", source, image, health, healthNote } = {}) {
  const box = $("#pending");
  let current = items.map((it) => ({ ...it, _base: { ...it } }));

  const render = () => {
    const sum = totals(current);
    box.innerHTML = `<div class="pending">
      ${image ? `<img class="preview-img" src="${image}" alt="">` : ""}
      ${note ? `<p class="pending-note">${icon("sparkle")}<span>${esc(note)}</span></p>` : ""}
      ${health ? `<p class="pending-health">${healthBadge(health)}<span><b>${t("health.meal")}</b>${healthNote ? ` – ${esc(healthNote)}` : ""}</span></p>` : ""}
      ${current.map((it, i) => `
        <div class="pitem" data-i="${i}">
          <input value="${esc(it.name)}" data-f="name" aria-label="${t("pending.name")}">
          <span class="unit-input"><input type="number" min="0" inputmode="numeric" value="${r0(it.grams)}" data-f="grams" aria-label="${t("pending.grams")}"><em>g</em></span>
          <button class="icon-btn" data-rm="${i}" aria-label="${t("pending.remove")}">${icon("x")}</button>
          <div class="meta">${metaLine(it)}</div>
        </div>`).join("")}
      <div class="pending-actions">
        <button class="btn ghost" data-cancel>${t("cancel")}</button>
        <button class="btn primary" data-ok ${current.length ? "" : "disabled"}>${t("addKcal", { kcal: r0(sum.kcal) })}</button>
      </div>
    </div>`;
  };
  render();
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });

  box.oninput = (e) => {
    const row = e.target.closest(".pitem");
    if (!row) return;
    const i = +row.dataset.i;
    if (e.target.dataset.f === "name") current[i].name = e.target.value;
    if (e.target.dataset.f === "grams") {
      current[i] = scaleItem(current[i], +e.target.value || 0);
      $(".meta", row).innerHTML = metaLine(current[i]);
      $("[data-ok]", box).textContent = t("addKcal", { kcal: r0(totals(current).kcal) });
    }
  };
  box.onclick = async (e) => {
    const rm = e.target.closest("[data-rm]");
    if (rm) {
      current.splice(+rm.dataset.rm, 1);
      render();
    } else if (e.target.hasAttribute("data-cancel")) {
      box.innerHTML = "";
    } else if (e.target.hasAttribute("data-ok")) {
      e.target.disabled = true;
      try {
        const clean = current.map(({ _base, ...rest }) => rest);
        await addEntries(clean, source);
        box.innerHTML = "";
      } catch (err) {
        toast(err.message, true);
        e.target.disabled = false;
      }
    }
  };
}

function metaLine(it) {
  const ex = extrasLine(it);
  return `${r0(it.kcal)} kcal · ${macroLine(it)}${it.health ? ` ${healthBadge(it.health, "sm")}` : ""}${ex ? `<br><span class="extras">${ex}</span>` : ""}`;
}

async function addEntries(items, source) {
  const time = state.day === isoDay(new Date()) ? nowTime() : "12:00";
  const data = await api("entries", { method: "POST", body: { day: state.day, time, source, items } });
  state.entries.push(...data.entries);
  renderToday();
  buzz();
  toast(t("added", { names: items.map((i) => i.name).join(", ") }));
  loadRecent();
}

function loadingHtml(msg) {
  return `<div class="loading"><span class="spinner"></span><span class="shimmer">${esc(msg)}</span></div>`;
}
function showLoading(msg) {
  $("#pending").innerHTML = `<div class="pending">${loadingHtml(msg)}</div>`;
}

/* ---- chat vnos ---- */

$("#chatForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("#chatInput");
  const text = input.value.trim();
  if (!text) return;
  input.blur(); // skrij tipkovnico na telefonu
  showLoading(t("loading.parse"));
  try {
    const res = await api("ai/parse", { method: "POST", body: { text } });
    input.value = "";
    showPending(res.items, { note: res.note, source: "chat", health: res.health, healthNote: res.health_note });
  } catch (err) {
    $("#pending").innerHTML = "";
    toast(err.message, true);
  }
});

/* ---- nedavna živila ---- */

let frequent = [], favorites = [];
const pick = ({ name, grams, health, ...r }) => ({ name, grams, health: health || null, ...Object.fromEntries(NUTR.map((k) => [k, r[k] ?? null])) });

async function loadRecent() {
  try {
    [{ recent: frequent }, { favorites }] = await Promise.all([api("recent"), api("favorites")]);
  } catch {
    return;
  }
  if ($("#quickDialog").open) renderQuick();
}

function quickRow(it, i, kind) {
  const fav = kind === "fav" || favorites.some((f) => f.name.toLowerCase() === it.name.toLowerCase() && +f.grams === +it.grams);
  return `<li>
    <button class="q-add" data-${kind}="${i}">
      <b>${esc(it.name)}${it.grams ? ` <small>· ${r0(it.grams)} g</small>` : ""}</b>
      <span class="muted small">${r0(it.kcal)} kcal · ${macroLine(it)}${it.n > 1 ? ` · ${it.n}×` : ""}</span>
    </button>
    ${kind === "fav"
      ? `<button class="q-star on" data-unfav="${i}" aria-label="${t("quick.remove")}">★</button>`
      : `<button class="q-star ${fav ? "on" : ""}" data-star="${i}" aria-label="${t("quick.save")}" ${fav ? "disabled" : ""}>${fav ? "★" : "☆"}</button>`}
  </li>`;
}

function renderQuick() {
  $("#quickOut").innerHTML = `
    <h4>${t("quick.saved")}</h4>
    ${favorites.length ? `<ul class="quick-list">${favorites.map((f, i) => quickRow(f, i, "fav")).join("")}</ul>` : `<p class="muted small">${t("quick.noSaved")}</p>`}
    <h4>${t("quick.frequent")}</h4>
    ${frequent.length ? `<ul class="quick-list">${frequent.map((f, i) => quickRow(f, i, "freq")).join("")}</ul>` : `<p class="muted small">${t("quick.noFrequent")}</p>`}`;
}

async function saveFavorite(it) {
  await api("favorites", { method: "POST", body: pick(it) });
  toast(t("quick.saved_toast", { name: it.name }));
  buzz();
  await loadRecent();
}

$("#quickBtn").onclick = () => {
  renderQuick();
  $("#quickDialog").showModal();
  loadRecent();
};

$("#quickOut").addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  try {
    if (b.dataset.fav !== undefined || b.dataset.freq !== undefined) {
      const it = b.dataset.fav !== undefined ? favorites[b.dataset.fav] : frequent[b.dataset.freq];
      $("#quickDialog").close();
      showPending([pick(it)], { source: "quick" });
    } else if (b.dataset.star !== undefined) {
      b.disabled = true;
      await saveFavorite(frequent[b.dataset.star]);
    } else if (b.dataset.unfav !== undefined) {
      await api("favorites/" + favorites[b.dataset.unfav].id, { method: "DELETE" });
      await loadRecent();
    }
  } catch (err) {
    toast(err.message, true);
  }
});

/* ---- urejanje vnosa ---- */

function openEntryEditor(id) {
  const e = state.entries.find((x) => x.id === id);
  if (!e) return;
  const d = $("#entryDialog");
  const hasGrams = !!e.grams;
  let cur = { ...e };
  const out = $("#entryOut");
  out.innerHTML = `
    <form class="form" id="entryForm">
      <label><span>${t("pending.name")}</span><input name="name" value="${esc(e.name)}"></label>
      <div class="grid2">
        <label><span>${t(hasGrams ? "entry.amount" : "entry.factor")}</span>
          <span class="unit-input"><input type="number" name="amount" min="0" step="any" inputmode="decimal" value="${hasGrams ? r0(e.grams) : 1}"><em>${hasGrams ? "g" : "×"}</em></span></label>
        <label><span>${t("entry.time")}</span><input type="time" name="time" value="${esc(e.time)}"></label>
      </div>
      <div class="macro-pills" id="entryCalc"></div>
      <p class="muted small" id="entryExtras"></p>
      <button class="btn primary full" type="submit">${t("entry.save")}</button>
      <div class="entry-actions">
        <button type="button" class="btn soft" data-act="fav">★ ${t("quick.save")}</button>
        <button type="button" class="btn ghost" data-act="del">${icon("trash")} ${t("delete")}</button>
      </div>
    </form>`;
  const f = $("#entryForm");
  const calc = () => {
    const a = +f.amount.value || 0;
    const factor = hasGrams ? a / e.grams : a;
    cur = { ...e, ...scaled(e, factor), grams: hasGrams ? a : e.grams, name: f.name.value.trim() || e.name, time: f.time.value || e.time };
    $("#entryCalc").innerHTML = `<span class="k">${r0(cur.kcal)} kcal</span><span class="p">${t("macro.p")} ${r1(cur.protein)} g</span><span class="c">${t("macro.c")} ${r1(cur.carbs)} g</span><span class="f">${t("macro.f")} ${r1(cur.fat)} g</span>${healthBadge(cur.health)}`;
    $("#entryExtras").textContent = extrasLine(cur);
  };
  calc();
  f.oninput = calc;
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const body = { name: cur.name, grams: cur.grams, time: cur.time };
    for (const k of NUTR) if (cur[k] != null) body[k] = Math.round(cur[k] * 10) / 10;
    try {
      await api("entries/" + id, { method: "PUT", body });
      d.close();
      toast(t("entry.saved"));
      buzz();
      await loadEntries();
      loadRecent();
    } catch (err) {
      toast(err.message, true);
    }
  };
  f.onclick = async (ev) => {
    const act = ev.target.closest("[data-act]")?.dataset.act;
    if (act === "fav") {
      ev.target.closest("button").disabled = true;
      await saveFavorite(cur).catch((err) => toast(err.message, true));
    } else if (act === "del") {
      if (!confirm(t("entry.confirmDelete", { name: e.name }))) return;
      d.close();
      await api("entries/" + id, { method: "DELETE" });
      toast(t("deleted", { name: e.name }));
      await loadEntries();
      loadRecent();
    }
  };
  d.showModal();
}

/* ---- slike ---- */

function readImage(file, maxSide = 1280) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL("image/jpeg", 0.85);
      resolve({ dataUrl, base64: dataUrl.split(",")[1], objectUrl: url, img, canvas: c });
    };
    img.onerror = () => reject(new Error(t("img.error")));
    img.src = url;
  });
}

$("#photoInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const note = $("#chatInput").value.trim();
  try {
    const { dataUrl, base64 } = await readImage(file);
    showLoading(t("loading.photo"));
    const res = await api("ai/photo", { method: "POST", body: { image: base64, media_type: "image/jpeg", note } });
    if (note) $("#chatInput").value = "";
    showPending(res.items, { note: res.note, source: "photo", image: dataUrl, health: res.health, healthNote: res.health_note });
  } catch (err) {
    $("#pending").innerHTML = "";
    toast(err.message, true);
  }
});

/* ---- črtna koda ---- */

let zxingLoading = null;
function loadZxing() {
  if (window.ZXing) return Promise.resolve();
  zxingLoading ??= new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js";
    s.onload = res;
    s.onerror = () => rej(new Error(t("zxing.error")));
    document.head.appendChild(s);
  });
  return zxingLoading;
}

async function decodeBarcode(file) {
  const { canvas, objectUrl } = await readImage(file, 1600);
  if ("BarcodeDetector" in window) {
    try {
      const det = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
      const found = await det.detect(canvas);
      if (found.length) return found[0].rawValue;
    } catch {}
  }
  await loadZxing();
  const hints = new Map([[ZXing.DecodeHintType.TRY_HARDER, true]]);
  const reader = new ZXing.BrowserMultiFormatReader(hints);
  try {
    const result = await reader.decodeFromImageUrl(objectUrl);
    return result.getText();
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

$("#barcodeInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  openBarcodeDialog();
  $("#productOut").innerHTML = loadingHtml(t("loading.barcode"));
  try {
    const code = await decodeBarcode(file);
    if (!code) {
      $("#productOut").innerHTML = `<p class="muted">${t("barcode.fail")}</p>`;
      $("#codeInput").focus();
      return;
    }
    $("#codeInput").value = code;
    lookupProduct(code);
  } catch (err) {
    $("#productOut").innerHTML = `<p class="error">${esc(err.message)}</p>`;
  }
});

$("#manualCodeBtn").onclick = () => {
  openBarcodeDialog();
  $("#productOut").innerHTML = "";
  $("#codeInput").value = "";
  $("#codeInput").focus();
};

function openBarcodeDialog() {
  const d = $("#barcodeDialog");
  if (!d.open) d.showModal();
}

$("#codeForm").addEventListener("submit", (e) => {
  e.preventDefault();
  $("#codeInput").blur();
  lookupProduct($("#codeInput").value.trim());
});

async function lookupProduct(code) {
  const out = $("#productOut");
  out.innerHTML = loadingHtml(t("loading.product", { code }));
  try {
    const { product: p } = await api("barcode/" + encodeURIComponent(code));
    const def = +p.serving_g || 100;
    out.innerHTML = `
      <div class="product">
        ${p.image ? `<img src="${esc(p.image)}" alt="">` : `<div class="noimg">📦</div>`}
        <div><b>${esc(p.name)}</b><div class="muted">${esc(p.brand)}</div>
        <div class="muted small">${t("product.per100")}: ${r0(p.per100.kcal)} kcal · ${macroLine(p.per100)}</div>
        ${extrasLine(p.per100) ? `<div class="muted small">${extrasLine(p.per100)}</div>` : ""}
        ${p.health ? `<div class="muted small">${t("health.title")} ${healthBadge(p.health, "sm")}${p.nutriscore ? ` · Nutri-Score ${esc(p.nutriscore.toUpperCase())}` : ""}</div>` : ""}</div>
      </div>
      <form class="form" id="qtyForm">
        <label><span>${t("product.qty")}</span><span class="unit-input"><input type="number" id="qtyInput" min="1" inputmode="decimal" value="${r0(def)}" required><em>g / ml</em></span></label>
        <div class="macro-pills" id="qtyCalc"></div>
        <button class="btn primary full" type="submit">${t("add")}</button>
      </form>`;
    const calc = () => {
      const g = +$("#qtyInput").value || 0, f = g / 100;
      return { name: p.name, grams: g, health: p.health || null, ...scaled(p.per100, f) };
    };
    const show = () => {
      const it = calc();
      $("#qtyCalc").innerHTML = `<span class="k">${r0(it.kcal)} kcal</span><span class="p">${t("macro.p")} ${r1(it.protein)} g</span><span class="c">${t("macro.c")} ${r1(it.carbs)} g</span><span class="f">${t("macro.f")} ${r1(it.fat)} g</span>`;
    };
    show();
    $("#qtyInput").oninput = show;
    $("#qtyForm").onsubmit = async (ev) => {
      ev.preventDefault();
      try {
        await addEntries([calc()], "barcode");
        $("#barcodeDialog").close();
      } catch (err) {
        toast(err.message, true);
      }
    };
  } catch (err) {
    out.innerHTML = `<p class="error">${esc(err.message)}</p><p class="muted small">${t("barcode.hint")}</p>`;
  }
}

/* ---- recept ---- */

const recipeOpts = { meal: "", pct: 100, servings: 1, focus: new Set() };
const tInputs = { kcal: "#tKcal", protein: "#tProtein", carbs: "#tCarbs", fat: "#tFat" };

function pills(r, div = 1) {
  return `<span class="k">${r0(r.kcal / div)} kcal</span><span class="p">${t("macro.p")} ${r0(r.protein / div)} g</span><span class="c">${t("macro.c")} ${r0(r.carbs / div)} g</span><span class="f">${t("macro.f")} ${r0(r.fat / div)} g</span>`;
}

// cilji na porcijo = izbran delež ostanka
function fillTargets() {
  const rem = remaining();
  const k = recipeOpts.pct / 100;
  for (const [m, sel] of Object.entries(tInputs)) $(sel).value = Math.max(0, r0(rem[m] * k));
}
function readTargets() {
  const o = {};
  for (const [m, sel] of Object.entries(tInputs)) o[m] = Math.max(0, +$(sel).value || 0);
  return o;
}
// ročna sprememba: kcal razmerno spremeni makrote, makro pa preračuna kcal
$("#tKcal").addEventListener("input", () => {
  const cur = readTargets();
  const fromMacros = cur.protein * 4 + cur.carbs * 4 + cur.fat * 9;
  if (fromMacros > 0) for (const m of MACROS) $(tInputs[m]).value = r0(cur[m] * cur.kcal / fromMacros);
  $$("#pctChips .chip").forEach((c) => c.classList.remove("active"));
});
for (const m of MACROS) $(tInputs[m]).addEventListener("input", () => {
  const cur = readTargets();
  $("#tKcal").value = r0(cur.protein * 4 + cur.carbs * 4 + cur.fat * 9);
  $$("#pctChips .chip").forEach((c) => c.classList.remove("active"));
});

$("#pctChips").addEventListener("click", (e) => {
  const b = e.target.closest("[data-pct]");
  if (!b) return;
  recipeOpts.pct = +b.dataset.pct;
  $$("#pctChips .chip").forEach((c) => c.classList.toggle("active", c === b));
  fillTargets();
});
$("#focusChips").addEventListener("click", (e) => {
  const b = e.target.closest("[data-focus]");
  if (!b) return;
  const f = b.dataset.focus;
  recipeOpts.focus.has(f) ? recipeOpts.focus.delete(f) : recipeOpts.focus.add(f);
  b.classList.toggle("active", recipeOpts.focus.has(f));
});
$(".stepper").addEventListener("click", (e) => {
  const b = e.target.closest("[data-step]");
  if (!b) return;
  recipeOpts.servings = Math.max(1, Math.min(8, recipeOpts.servings + +b.dataset.step));
  $("#servingsOut").value = recipeOpts.servings;
});

$("#recipeBtn").onclick = () => {
  $("#recipeRemaining").innerHTML = pills(remaining()).replace(/^<span class="k">[^<]*/, `<span class="k">${t("recipe.left", { kcal: r0(remaining().kcal) })}`);
  $("#recipeOut").innerHTML = "";
  showRecipeTab("new");
  fillTargets();
  loadSavedRecipes();
  $("#recipeDialog").showModal();
};

$("#mealSeg").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-meal]");
  if (!b) return;
  recipeOpts.meal = b.dataset.meal;
  $$("#mealSeg button").forEach((x) => x.classList.toggle("active", x === b));
});

function showRecipeTab(tab) {
  $$("#recipeTabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $("#recipeNew").hidden = tab !== "new";
  $("#recipeOut").hidden = tab !== "new";
  $("#recipeSaved").hidden = tab !== "saved";
  if (tab === "saved") renderSavedList();
}
$("#recipeTabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-tab]");
  if (b) showRecipeTab(b.dataset.tab);
});

async function requestRecipe(extra = {}) {
  const out = $("#recipeOut");
  const btns = $$("#recipeForm button[type=submit], #recipeOut button");
  btns.forEach((b) => (b.disabled = true));
  document.activeElement?.blur();
  const loader = document.createElement("div");
  loader.innerHTML = loadingHtml(t("loading.recipe"));
  if (extra.previous) out.append(loader); else out.replaceChildren(loader);
  loader.scrollIntoView({ behavior: "smooth", block: "center" });
  try {
    const r = await api("ai/recipe", {
      method: "POST",
      body: {
        remaining: remaining(),
        target: readTargets(),
        servings: recipeOpts.servings,
        focus: [...recipeOpts.focus],
        goal: state.profile.goal,
        meal: recipeOpts.meal,
        prefs: $("#recipeForm [name=prefs]").value,
        ...extra,
      },
    });
    showRecipe(out, r, {});
  } catch (err) {
    loader.innerHTML = `<p class="error">${esc(err.message)}</p>`;
  } finally {
    btns.forEach((b) => (b.disabled = false));
  }
}

$("#recipeForm").addEventListener("submit", (e) => {
  e.preventDefault();
  requestRecipe();
});

// besedilo recepta za deljenje / shranjevanje izven aplikacije
function recipeText(r) {
  const s = Math.max(1, r.servings);
  return [
    r.title,
    `${t("recipe.servings", { n: r0(r.servings) })} · ${r0(r.minutes)} min`,
    `${r0(r.kcal / s)} kcal · ${t("macro.p")} ${r0(r.protein / s)} g · ${t("macro.c")} ${r0(r.carbs / s)} g · ${t("macro.f")} ${r0(r.fat / s)} g (${t("recipe.perServing")})`,
    "",
    t("recipe.ingredients").toUpperCase(),
    ...r.ingredients.map((i) => `• ${i.amount} ${i.name}`),
    "",
    t("recipe.steps").toUpperCase(),
    ...r.steps.map((st, i) => `${i + 1}. ${st}`),
    ...(r.tip ? ["", `💡 ${r.tip}`] : []),
    "",
    "— Macrotractor",
  ].join("\n");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // brez https (npr. telefon prek domačega omrežja) clipboard API ni na voljo
    const ta = Object.assign(document.createElement("textarea"), { value: text });
    ta.style.cssText = "position:fixed;opacity:0";
    $("#recipeDialog").append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  toast(t("recipe.copied"));
}

function downloadText(r) {
  const name = (r.title || "recept").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([recipeText(r)], { type: "text/plain;charset=utf-8" })),
    download: `${name || "recept"}.txt`,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(t("recipe.downloaded"));
}

function showRecipe(container, r, { saved = false }) {
  const s = Math.max(1, r.servings);
  const tweaks = I18N[LANG]["recipe.tweaks"];
  container.innerHTML = `<div class="recipe">
    ${saved ? `<button class="btn ghost back" data-act="back">${icon("left")} ${t("recipe.back")}</button>` : ""}
    <h4>${esc(r.title)}</h4>
    <div class="muted small">${t("recipe.servings", { n: r0(r.servings) })} · ${r0(r.minutes)} min</div>
    <div class="macro-pills">${pills(r, s)}<span class="per">${s > 1 ? t("recipe.perServing") : ""}</span></div>
    <h3>${t("recipe.ingredients")}</h3>
    <ul>${r.ingredients.map((i) => `<li><b>${esc(i.amount)}</b>${esc(i.name)}</li>`).join("")}</ul>
    <h3>${t("recipe.steps")}</h3>
    <ol>${r.steps.map((st) => `<li>${esc(st)}</li>`).join("")}</ol>
    ${r.tip ? `<p class="tip">💡 ${esc(r.tip)}</p>` : ""}
    <button class="btn primary full" data-act="eat">${t(s > 1 ? "recipe.ateOne" : "recipe.ate")}</button>
    <div class="recipe-actions">
      ${saved
        ? `<button class="btn soft" data-act="delete">${icon("trash")}<span>${t("recipe.delete")}</span></button>`
        : `<button class="btn soft" data-act="save">${icon("bookmark")}<span>${t("recipe.save")}</span></button>`}
      ${navigator.share ? `<button class="btn soft" data-act="share">${icon("share")}<span>${t("recipe.share")}</span></button>` : ""}
      <button class="btn soft" data-act="copy">${icon("copy")}<span>${t("recipe.copy")}</span></button>
      <button class="btn soft" data-act="download">${icon("download")}<span>${t("recipe.download")}</span></button>
    </div>
    ${saved ? "" : `<form class="adjust">
      <h3>${t("recipe.adjust")}</h3>
      <div class="chip-row">${tweaks.map((x) => `<button type="button" class="chip" data-tweak="${esc(x)}">${esc(x)}</button>`).join("")}</div>
      <div class="inline-form">
        <input name="tweak" placeholder="${esc(t("recipe.adjustPh"))}" enterkeyhint="go">
        <button class="btn soft" type="submit">${t("recipe.adjustGo")}</button>
      </div>
    </form>`}
  </div>`;
  const el = $(".recipe", container);
  el.scrollIntoView({ behavior: "smooth", block: "start" });

  const adjust = (tweak) => tweak && requestRecipe({ previous: r, tweak });
  $(".adjust", el)?.addEventListener("submit", (e) => {
    e.preventDefault();
    adjust(e.target.tweak.value.trim());
  });

  el.addEventListener("click", async (e) => {
    const tw = e.target.closest("[data-tweak]");
    if (tw) return adjust(tw.dataset.tweak);
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "eat") {
      await addEntries([{ name: r.title, grams: 0, kcal: r.kcal / s, protein: r.protein / s, carbs: r.carbs / s, fat: r.fat / s }], "recipe");
      $("#recipeDialog").close();
    } else if (act === "save") {
      b.disabled = true;
      try {
        await api("recipes", { method: "POST", body: r });
        b.innerHTML = `${icon("bookmark")}<span>${t("recipe.saved")}</span>`;
        toast(t("recipe.savedToast"));
        buzz();
        loadSavedRecipes();
      } catch (err) {
        b.disabled = false;
        toast(err.message, true);
      }
    } else if (act === "delete") {
      if (!confirm(t("recipe.confirmDelete"))) return;
      await api("recipes/" + r.id, { method: "DELETE" });
      toast(t("recipe.deleted"));
      await loadSavedRecipes();
      renderSavedList();
    } else if (act === "share") {
      navigator.share({ title: r.title, text: recipeText(r) }).catch(() => {});
    } else if (act === "copy") {
      copyText(recipeText(r));
    } else if (act === "download") {
      downloadText(r);
    } else if (act === "back") {
      renderSavedList();
    }
  });
}

/* ---- shranjeni recepti ---- */

let savedRecipes = [];
async function loadSavedRecipes() {
  try {
    savedRecipes = (await api("recipes")).recipes;
  } catch {
    return;
  }
  $("#savedCount").textContent = savedRecipes.length || "";
}

function renderSavedList() {
  const box = $("#recipeSaved");
  if (!savedRecipes.length) {
    box.innerHTML = `<p class="muted small empty-saved">${t("recipe.noSaved")}</p>`;
    return;
  }
  box.innerHTML = `<ul class="saved-list">${savedRecipes.map((r) => {
    const s = Math.max(1, r.servings);
    return `<li><button data-id="${r.id}">
      <b>${esc(r.title)}</b>
      <span class="muted small">${r0(r.kcal / s)} kcal · ${t("macro.p")} ${r0(r.protein / s)} g · ${r0(r.minutes)} min · ${new Date(r.saved_at * 1000).toLocaleDateString(I18N[LANG].locale)}</span>
    </button></li>`;
  }).join("")}</ul>`;
  box.onclick = (e) => {
    const b = e.target.closest("[data-id]");
    if (!b) return;
    box.onclick = null;
    showRecipe(box, savedRecipes.find((x) => x.id === b.dataset.id), { saved: true });
  };
}

// klik na ozadje zapre okno
$$("dialog").forEach((d) => d.addEventListener("click", (e) => {
  if (e.target === d && d.id !== "loginDialog") d.close();
}));

/* ---------------------------------------------------------------- STATISTIKA */

$("#rangeSeg").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-days]");
  if (!b) return;
  state.statsDays = +b.dataset.days;
  $$("#rangeSeg button").forEach((x) => x.classList.toggle("active", x === b));
  loadStats();
});

$("#weightForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const kg = +$("#weightInput").value;
  $("#weightInput").blur();
  try {
    await api("weights", { method: "POST", body: { day: isoDay(new Date()), kg } });
    $("#weightInput").value = "";
    toast(t("stats.weightSaved"));
    await loadProfile();
    loadStats();
  } catch (err) {
    toast(err.message, true);
  }
});

async function loadStats() {
  const data = await api(`stats?days=${state.statsDays}&end=${isoDay(new Date())}`);
  const tg = targets(state.profile);
  const logged = data.series.filter((d) => d.n > 0);
  const avg = (k) => (logged.length ? logged.reduce((s, d) => s + d[k], 0) / logged.length : 0);
  const onTarget = logged.filter((d) => Math.abs(d.kcal - tg.kcal) <= tg.kcal * 0.1).length;

  let streak = 0;
  for (let i = data.series.length - 1; i >= 0; i--) {
    if (data.series[i].n > 0) streak++;
    else if (i !== data.series.length - 1) break;
  }

  const w = data.weights;
  const wChange = w.length > 1 ? w[w.length - 1].kg - w[0].kg : null;
  const loc = I18N[LANG].locale;

  $("#kpis").innerHTML = [
    ["bolt", "a3", fmt(avg("kcal")), t("stats.avgKcal")],
    ["target", "a2", `${onTarget}<small>/${logged.length}</small>`, t("stats.onTarget")],
    ["flame", "a1", streak, t("stats.streak", { n: streak })],
    ["scale", "a4", wChange === null ? "–" : (wChange > 0 ? "+" : "") + r1(wChange).toLocaleString(loc) + "<small> kg</small>", t("stats.weightChange")],
  ].map(([ic, cls, v, l]) => `<div class="kpi"><div class="kpi-ico ${cls}">${icon(ic)}</div><div class="v">${v}</div><div class="l">${l}</div></div>`).join("");

  $("#kcalChart").innerHTML = barChart(data.series, tg.kcal, chartWidth("#kcalChart"));

  const ap = avg("protein"), ac = avg("carbs"), af = avg("fat");
  const kp = ap * 4, kc = ac * 4, kf = af * 9, ksum = kp + kc + kf || 1;
  $("#macroAvg").innerHTML = logged.length ? `
    <div class="stack">
      <i style="width:${(kp / ksum) * 100}%;background:var(--protein)"></i>
      <i style="width:${(kc / ksum) * 100}%;background:var(--carbs)"></i>
      <i style="width:${(kf / ksum) * 100}%;background:var(--fat)"></i>
    </div>
    <div class="macro-avg">
      ${[["p", "protein", ap, tg.protein, kp], ["c", "carbs", ac, tg.carbs, kc], ["f", "fat", af, tg.fat, kf]].map(([c, k, v, goal, kk]) =>
        `<div><div class="l ${c}">${t("macro." + k)}</div><b>${r0(v)} g</b><div class="t">${t("stats.goal", { g: r0(goal) })} · ${r0((kk / ksum) * 100)} %</div></div>`).join("")}
    </div>` : `<div class="chart-empty">${t("stats.noData")}</div>`;

  $("#weightChart").innerHTML = lineChart(w, chartWidth("#weightChart"));
  $("#topFoods").innerHTML = data.top.length
    ? data.top.map((f) => `<li>${esc(f.name)} <span>${f.n}× · ${r0(f.kcal)} kcal</span></li>`).join("")
    : `<li class="muted">${t("stats.noData")}</li>`;
}

// širina v px, da je besedilo v grafih enako veliko na telefonu in računalniku
const chartWidth = (sel) => Math.max(280, $(sel).clientWidth || 600);

function barChart(series, target, W) {
  if (!series.some((d) => d.n)) return `<div class="chart-empty">${t("stats.noEntries")}</div>`;
  const H = 200, pl = 34, pb = 20, pt = 8;
  const max = Math.max(target * 1.2, ...series.map((d) => d.kcal));
  const bw = (W - pl) / series.length;
  const y = (v) => pt + (H - pt - pb) * (1 - v / max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round((max * f) / 100) * 100);
  const every = Math.ceil(series.length / Math.floor(W / 45));
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${t("stats.kcalPerDay")}">`;
  ticks.forEach((v) => (s += `<line class="grid" x1="${pl}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${pl - 4}" y="${y(v) + 3}" text-anchor="end">${v}</text>`));
  series.forEach((d, i) => {
    const x = pl + i * bw + bw * 0.18, w = bw * 0.64;
    const over = d.kcal > target * 1.1, under = d.kcal < target * 0.9;
    const color = over ? "url(#gFat)" : under ? "url(#gCarbs)" : "url(#gAccent)";
    const h = Math.max(d.n ? 3 : 0, y(0) - y(d.kcal));
    s += `<rect x="${x}" y="${pt}" width="${w}" height="${y(0) - pt}" rx="${Math.min(6, w / 2)}" fill="rgba(255,255,255,.035)"/>`;
    if (d.n) s += `<rect x="${x}" y="${y(0) - h}" width="${w}" height="${h}" rx="${Math.min(6, w / 2)}" fill="${color}"><title>${d.day}: ${r0(d.kcal)} kcal</title></rect>`;
    if (i % every === 0) s += `<text x="${x + w / 2}" y="${H - 5}" text-anchor="middle">${shortDate(d.day)}</text>`;
  });
  s += `<line class="target" x1="${pl}" x2="${W}" y1="${y(target)}" y2="${y(target)}"/>`;
  return s + "</svg>";
}

function lineChart(points, W) {
  if (points.length < 2) return `<div class="chart-empty">${t("stats.needWeights")}</div>`;
  const H = 180, pl = 38, pb = 20, pt = 10;
  const vals = points.map((p) => p.kg);
  const lo = Math.floor(Math.min(...vals) - 1), hi = Math.ceil(Math.max(...vals) + 1);
  const t0 = new Date(points[0].day).getTime(), t1 = new Date(points[points.length - 1].day).getTime() || t0 + 1;
  const x = (d) => pl + (W - pl - 8) * ((new Date(d).getTime() - t0) / (t1 - t0 || 1));
  const y = (v) => pt + (H - pt - pb) * (1 - (v - lo) / (hi - lo));
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${t("stats.weight")}">`;
  [lo, (lo + hi) / 2, hi].forEach((v) => (s += `<line class="grid" x1="${pl}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${pl - 4}" y="${y(v) + 3}" text-anchor="end">${r1(v)}</text>`));
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.day)},${y(p.kg)}`).join(" ");
  const area = `${path} L${x(points[points.length - 1].day)},${y(lo)} L${x(points[0].day)},${y(lo)} Z`;
  s += `<defs><linearGradient id="wArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9d8cf5" stop-opacity=".28"/><stop offset="1" stop-color="#9d8cf5" stop-opacity="0"/></linearGradient></defs>`;
  s += `<path d="${area}" fill="url(#wArea)"/>`;
  s += `<path d="${path}" fill="none" stroke="url(#gAccent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  points.forEach((p) => (s += `<circle cx="${x(p.day)}" cy="${y(p.kg)}" r="4" fill="#242428" stroke="#9d8cf5" stroke-width="2"><title>${p.day}: ${p.kg} kg</title></circle>`));
  const first = points[0].day, last = points[points.length - 1].day;
  s += `<text x="${pl}" y="${H - 5}">${shortDate(first)}</text><text x="${W - 8}" y="${H - 5}" text-anchor="end">${shortDate(last)}</text>`;
  return s + "</svg>";
}

/* ---------------------------------------------------------------- PROFIL */

const form = $("#profileForm");

function readForm() {
  const fd = new FormData(form);
  const p = { ...state.profile };
  for (const [k, v] of fd.entries()) p[k] = v;
  for (const k of ["age", "height_cm", "weight_kg", "activity", "rate", "protein_per_kg", "fat_pct"]) p[k] = +p[k];
  p.custom_kcal = p.custom_kcal ? +p.custom_kcal : null;
  return p;
}

function fillProfileForm() {
  const p = state.profile;
  for (const el of form.elements) {
    if (el.name && el.name in p) el.value = p[el.name] ?? "";
  }
  form.elements.activity.value = String(p.activity);
  form.elements.rate.value = String(p.rate);
  setSex(p.sex);
  setGoal(p.goal);
  loadClaudeStatus();
}

function setSex(v) {
  form.elements.sex.value = v;
  $$("#sexSeg button").forEach((b) => b.classList.toggle("active", b.dataset.sex === v));
  renderCalc();
}

$("#sexSeg").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-sex]");
  if (b) setSex(b.dataset.sex);
});

async function loadClaudeStatus() {
  const box = $("#claudeStatus");
  try {
    const st = await api("claude");
    box.className = "claude-status " + (st.ok ? "ok" : "bad");
    const extra = [st.account, st.plan].filter(Boolean).join(" · ");
    box.innerHTML = `<span class="dot"></span><div>${esc(st.message)}${extra ? `<small>${esc(extra)}</small>` : ""}</div>`;
  } catch (err) {
    box.className = "claude-status bad";
    box.innerHTML = `<span class="dot"></span><div>${esc(err.message)}</div>`;
  }
}

function setGoal(g) {
  form.elements.goal.value = g;
  $$("#goalSeg button").forEach((b) => b.classList.toggle("active", b.dataset.goal === g));
  $("#rateLabel").hidden = g === "maintain";
  renderCalc();
}

$("#goalSeg").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-goal]");
  if (!b) return;
  const g = b.dataset.goal;
  // smiselne privzete vrednosti za tempo in beljakovine
  form.elements.rate.value = g === "bulk" ? "0.25" : "0.5";
  form.elements.protein_per_kg.value = g === "cut" ? "2.2" : "1.8";
  setGoal(g);
});

form.addEventListener("input", renderCalc);

function renderCalc() {
  if (!state.profile) return;
  const p = readForm();
  if (!p.weight_kg || !p.height_cm || !p.age) return;
  const tg = targets(p);
  const row = (l, v) => `<div class="calc-row"><span>${l}</span><b>${v}</b></div>`;
  const kc = (n) => fmt(n) + " kcal";
  $("#calcBox").innerHTML = `
    <div class="calc-top"><div class="l">${t("profile.dailyTarget")}</div><div class="v">${fmt(tg.kcal)} <small>kcal</small></div></div>
    <div class="calc-rows">
      ${row(t("profile.bmr"), kc(tg.bmr))}
      ${row(t("profile.tdee"), kc(tg.tdee))}
      ${p.goal !== "maintain" && !p.custom_kcal ? row(t(p.goal === "cut" ? "profile.deficit" : "profile.surplus"), (tg.delta > 0 ? "+" : "−") + kc(Math.abs(tg.delta))) : ""}
    </div>
    <div class="calc-macros">
      <div><b>${r0(tg.protein)} g</b><span class="p">${t("macro.protein")}</span></div>
      <div><b>${r0(tg.carbs)} g</b><span class="c">${t("macro.carbs")}</span></div>
      <div><b>${r0(tg.fat)} g</b><span class="f">${t("macro.fat")}</span></div>
    </div>`;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const p = readForm();
    const res = await api("profile", { method: "PUT", body: { ...p, today: isoDay(new Date()) } });
    state.profile = res.profile;
    toast(t("profile.saved"));
    renderToday();
    showView("today");
  } catch (err) {
    toast(err.message, true);
  }
});

async function loadProfile() {
  const { profile, configured } = await api("profile");
  state.profile = profile;
  return configured;
}

/* ---------------------------------------------------------------- prijava */

function showLogin() {
  const d = $("#loginDialog");
  if (!d.open) d.showModal();
}

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  token = $("#loginPass").value;
  try {
    const r = await fetch("api/auth", { headers: { "X-App-Token": token } }).then((res) => res.json());
    if (!r.ok) throw new Error(t("login.wrong"));
    try { localStorage.setItem("mt_token", token); } catch {}
    $("#loginDialog").close();
    boot();
  } catch (err) {
    $("#loginErr").textContent = err.message;
  }
});

/* ---- varnostna kopija ---- */

$("#backupExport").onclick = async () => {
  try {
    const data = await api("backup");
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" })),
      download: `macrotractor-${isoDay(new Date())}.json`,
    });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(t("backup.exported"));
  } catch (err) {
    toast(err.message, true);
  }
};

$("#backupImport").onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  let data;
  try {
    data = JSON.parse(await file.text());
    if (data.app !== "macrotractor") throw new Error();
  } catch {
    return toast(t("backup.bad"), true);
  }
  if (!confirm(t("backup.confirm", { n: (data.entries || []).length }))) return;
  try {
    const r = await api("backup", { method: "POST", body: data });
    toast(t("backup.imported", { n: r.counts.entries }));
    await syncCheck();
  } catch (err) {
    toast(err.message, true);
  }
};

$("#logoutBtn").onclick = () => {
  try { localStorage.removeItem("mt_token"); } catch {}
  location.reload();
};

/* ---------------------------------------------------------------- sinhronizacija */

async function syncCheck() {
  const dot = $("#syncDot");
  try {
    const { version } = await api("sync");
    dot.className = "sync-dot";
    dot.title = t("sync.ok");
    if (state.version && version !== state.version) {
      state.version = version;
      await loadProfile();
      await loadEntries();
      loadRecent();
      loadSavedRecipes();
      if (state.view === "stats") loadStats();
    } else {
      state.version = version;
    }
  } catch {
    dot.className = "sync-dot off";
    dot.title = t("sync.off");
  }
}

setInterval(() => { if (!document.hidden) syncCheck(); }, 8000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    // če je aplikacija ostala odprta čez polnoč, skoči na nov dan
    const today = isoDay(new Date());
    if (state._lastToday && state._lastToday !== today && state.day === state._lastToday) state.day = today;
    state._lastToday = today;
    syncCheck();
  }
});

/* ---------------------------------------------------------------- zagon */

async function boot() {
  renderStaticTexts();
  $("#serverUrl").textContent = location.origin;
  try {
    const auth = window.MT_LOCAL
      ? { required: false, ok: true }
      : await fetch("api/auth", { headers: token ? { "X-App-Token": token } : {} }).then((r) => r.json());
    $("#logoutBtn").hidden = !auth.required;
    if (!auth.ok) return showLogin();

    const configured = await loadProfile();
    state._lastToday = isoDay(new Date());
    await loadEntries();
    loadRecent();
    if (!configured) {
      showView("profile");
      toast(t("profile.setupFirst"));
    }
  } catch (err) {
    $("#syncDot").className = "sync-dot off";
    toast(err.message, true);
  }
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

boot();
