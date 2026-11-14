/* Samostojna različica (window.MT_LOCAL): brez strežnika.
   - podatki so v localStorage na napravi (ista oblika kot baza na strežniku, zato so
     varnostne kopije med različicama združljive),
   - črtne kode gredo neposredno na Open Food Facts,
   - Claude: vprašanje se deli v aplikacijo Claude, odgovor uporabnik prilepi nazaj.
   localApi() posnema končne točke server.py, tako da app.js ostane enak. */

(() => {
  if (!window.MT_LOCAL) return;

  const KEY = "mt_data";
  const DEFAULT_PROFILE = {
    sex: "male", age: 30, height_cm: 180, weight_kg: 80, activity: 1.55,
    goal: "maintain", rate: 0.5, protein_per_kg: 2.0, fat_pct: 25, custom_kcal: null,
    tdee_override: null, goal_weight: null,
  };

  /* ---------------------------------------------------------------- shramba */

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      if (d && Array.isArray(d.entries)) return d;
    } catch {}
    return { profile: null, entries: [], weights: [], recipes: [], version: "0" };
  }
  let db = load();
  db.favorites ||= [];
  db.ratings ||= {};
  db.kv ||= {}; // splošna shramba: voda, shranjeni obroki …
  function save() {
    db.version = String(Date.now());
    localStorage.setItem(KEY, JSON.stringify(db));
  }
  // prosi brskalnik, naj podatkov ne briše, ko zmanjka prostora
  navigator.storage?.persist?.().catch(() => {});

  const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
  const r1 = (n) => Math.round((+n || 0) * 10) / 10;
  const now = () => Date.now() / 1000;
  const today = () => isoDay(new Date());

  // hranila v vnosu: kcal, makroti, dodatna hranila (lahko manjkajo) in ocena zdravja 1–10
  function nutrients(it) {
    const out = {};
    for (const k of NUTR) out[k] = it[k] == null || it[k] === "" ? (EXTRAS.includes(k) ? null : 0) : r1(it[k]);
    out.health = it.health ? Math.max(1, Math.min(10, r1(it.health))) : null;
    return out;
  }

  function setWeight(day, kg) {
    db.weights = db.weights.filter((w) => w.day !== day);
    db.weights.push({ day, kg });
    db.weights.sort((a, b) => a.day.localeCompare(b.day));
  }

  /* ---------------------------------------------------------------- končne točke */

  async function localApi(path, opts = {}) {
    const method = opts.method || "GET";
    const [route, query = ""] = path.split("?");
    const parts = route.split("/");
    const q = Object.fromEntries(new URLSearchParams(query));
    const body = opts.body || {};
    const h = handlers[`${method} ${parts[0]}`];
    if (!h) throw new Error("not found: " + path);
    return h(parts, q, body);
  }

  const handlers = {
    "GET sync": () => ({ version: db.version }),

    "GET claude": () => ({ ok: true, message: t("local.claudeOk"), account: t("local.claudeSub") }),

    "GET profile": () => ({ profile: { ...DEFAULT_PROFILE, ...(db.profile || {}) }, configured: !!db.profile }),
    "PUT profile": (p, q, b) => {
      const prof = Object.fromEntries(Object.entries(DEFAULT_PROFILE).map(([k, v]) => [k, b[k] ?? v]));
      db.profile = prof;
      if (prof.weight_kg) setWeight(b.today || today(), +prof.weight_kg);
      save();
      return { profile: prof };
    },

    "GET entries": (p, q) => {
      const day = q.day || today();
      const entries = db.entries
        .filter((e) => e.day === day)
        .sort((a, b) => a.time.localeCompare(b.time) || a.created_at - b.created_at);
      return { entries, rating: db.ratings[day] || null, version: db.version };
    },
    "POST entries": (p, q, b) => {
      const out = (b.items || []).map((it) => ({
        id: rid(),
        day: b.day,
        time: b.time || new Date().toTimeString().slice(0, 5),
        name: String(it.name).slice(0, 120),
        grams: +it.grams || null,
        ...nutrients(it),
        source: b.source || "manual",
        created_at: now(),
      }));
      db.entries.push(...out);
      save();
      return { entries: out };
    },
    "PUT entries": (p, q, b) => {
      const e = db.entries.find((x) => x.id === p[1]);
      if (e) for (const k of ["name", "grams", "time", ...NUTR, "health"]) if (k in b) e[k] = b[k];
      save();
      return { ok: true };
    },
    "DELETE entries": (p) => {
      db.entries = db.entries.filter((x) => x.id !== p[1]);
      save();
      return { ok: true };
    },

    "GET weights": () => ({ weights: db.weights }),
    "POST weights": (p, q, b) => {
      const kg = +b.kg;
      setWeight(b.day, kg);
      // zadnja teža vpliva na izračun dnevne porabe
      if (db.profile && b.day >= db.weights[db.weights.length - 1].day) db.profile.weight_kg = kg;
      save();
      return { ok: true };
    },

    "GET stats": (p, q) => {
      const days = Math.max(1, Math.min(+q.days || 30, 365));
      const end = q.end || today();
      const start = shiftDay(end, -(days - 1));
      const inRange = db.entries.filter((e) => e.day >= start && e.day <= end);
      const zero = () => ({ ...Object.fromEntries(NUTR.map((k) => [k, 0])), n: 0, hw: 0, hs: 0 });
      const byDay = {};
      for (const e of inRange) {
        const d = (byDay[e.day] ||= zero());
        for (const m of NUTR) d[m] += +e[m] || 0;
        d.n++;
        if (e.health) {
          const w = Math.max(1, e.kcal);
          d.hw += w;
          d.hs += e.health * w;
        }
      }
      const series = [];
      for (let i = 0; i < days; i++) {
        const day = shiftDay(start, i);
        const d = byDay[day] || zero();
        series.push({
          day, ...Object.fromEntries(NUTR.map((k) => [k, r1(d[k])])), n: d.n,
          health: db.ratings[day]?.score ?? (d.hw ? r1(d.hs / d.hw) : null),
        });
      }
      const top = {};
      for (const e of inRange) {
        const k = e.name.toLowerCase();
        top[k] ||= { name: e.name, n: 0, kcal: 0 };
        top[k].n++;
        top[k].kcal += e.kcal;
      }
      return {
        series,
        weights: db.weights.filter((w) => w.day >= start && w.day <= end),
        top: Object.values(top).sort((a, b) => b.n - a.n || b.kcal - a.kcal).slice(0, 8),
      };
    },

    "GET recent": (p, q) => {
      const groups = {};
      for (const e of db.entries) {
        const k = e.name.toLowerCase() + "|" + (e.grams || "");
        const g = (groups[k] ||= { ...e, last: 0, n: 0 });
        g.n++;
        if (e.created_at >= g.last) Object.assign(g, e, { last: e.created_at, n: g.n });
      }
      // najprej najpogostejša, nato najnovejša
      return { recent: Object.values(groups).sort((a, b) => b.n - a.n || b.last - a.last).slice(0, +q.limit || 15) };
    },

    "GET favorites": () => ({ favorites: db.favorites }),
    "POST favorites": (p, q, b) => {
      const f = { id: rid(), name: String(b.name).slice(0, 120), grams: +b.grams || null, ...nutrients(b), created_at: now() };
      db.favorites = db.favorites.filter((x) => !(x.name.toLowerCase() === f.name.toLowerCase() && x.grams === f.grams));
      db.favorites.push(f);
      save();
      return { id: f.id };
    },
    "DELETE favorites": (p) => {
      db.favorites = db.favorites.filter((f) => f.id !== p[1]);
      save();
      return { ok: true };
    },

    "GET kv": (p) => ({ value: db.kv[p[1]] ?? null }),
    "PUT kv": (p, q, b) => {
      db.kv[p[1]] = b.value;
      save();
      return { ok: true };
    },

    "PUT ratings": (p, q, b) => {
      db.ratings[b.day] = { score: Math.max(1, Math.min(10, +b.score || 0)), comment: String(b.comment || "") };
      save();
      return { ok: true };
    },

    "GET recipes": () => ({ recipes: [...db.recipes].sort((a, b) => b.saved_at - a.saved_at) }),
    "POST recipes": (p, q, b) => {
      const keys = ["title", "servings", "minutes", "ingredients", "steps", "kcal", "protein", "carbs", "fat", "tip"];
      const r = Object.fromEntries(keys.map((k) => [k, b[k]]));
      r.id = rid();
      r.saved_at = now();
      db.recipes.push(r);
      save();
      return { id: r.id };
    },
    "DELETE recipes": (p) => {
      db.recipes = db.recipes.filter((r) => r.id !== p[1]);
      save();
      return { ok: true };
    },

    // ista oblika kot /api/backup na strežniku
    "GET backup": () => ({
      app: "macrotractor", format: 1, exported_at: now(),
      profile: db.profile ? [{ id: 1, data: JSON.stringify(db.profile), updated_at: now() }] : [],
      entries: db.entries,
      weights: db.weights,
      recipes: db.recipes.map(({ id, saved_at, ...r }) => ({ id, data: JSON.stringify(r), created_at: saved_at })),
      favorites: db.favorites.map(({ id, created_at, ...f }) => ({ id, data: JSON.stringify(f), created_at })),
      ratings: Object.entries(db.ratings).map(([day, r]) => ({ day, ...r })),
      kv: Object.entries(db.kv).map(([key, value]) => ({ key, value: JSON.stringify(value) })),
    }),
    "POST backup": (p, q, b) => {
      if (b.app !== "macrotractor") throw new Error(t("backup.bad"));
      const prof = (b.profile || [])[0];
      db = {
        profile: prof ? { ...DEFAULT_PROFILE, ...JSON.parse(prof.data) } : null,
        entries: (b.entries || []).filter((e) => e && e.id && e.day),
        weights: (b.weights || []).filter((w) => w && w.day),
        recipes: (b.recipes || []).map((r) => ({ ...JSON.parse(r.data), id: r.id, saved_at: r.created_at })),
        favorites: (b.favorites || []).map((f) => ({ ...JSON.parse(f.data), id: f.id, created_at: f.created_at })),
        ratings: Object.fromEntries((b.ratings || []).map((r) => [r.day, { score: r.score, comment: r.comment }])),
        kv: Object.fromEntries((b.kv || []).map((r) => [r.key, JSON.parse(r.value)])),
        version: "0",
      };
      save();
      return { ok: true, counts: { entries: db.entries.length } };
    },

    "GET barcode": async (p) => {
      const code = (p[1] || "").replace(/\D/g, "");
      if (!code) throw new Error(t("product.code"));
      const url = `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_sl,product_name_en,brands,nutriments,serving_quantity,image_front_small_url,nutriscore_grade`;
      let data;
      try {
        data = await fetch(url).then((r) => r.json());
      } catch {
        data = null;
      }
      if (!data || data.status !== 1) throw new Error(LANG === "en" ? "Product not found in Open Food Facts." : "Izdelka ni v bazi Open Food Facts.");
      const pr = data.product;
      const n = pr.nutriments || {};
      const num = (...keys) => {
        for (const k of keys) if (n[k] !== undefined && n[k] !== "" && !isNaN(+n[k])) return +n[k];
        return 0;
      };
      const kcal = num("energy-kcal_100g") || num("energy_100g") / 4.184;
      return {
        product: {
          code,
          name: (LANG === "en" ? pr.product_name_en : pr.product_name_sl) || pr.product_name || (LANG === "en" ? "Unknown product" : "Neznan izdelek"),
          brand: pr.brands || "",
          image: pr.image_front_small_url,
          serving_g: pr.serving_quantity,
          per100: {
            kcal: r1(kcal), protein: num("proteins_100g"), carbs: num("carbohydrates_100g"), fat: num("fat_100g"),
            sat_fat: num("saturated-fat_100g"), sugar: num("sugars_100g"), fiber: num("fiber_100g"), salt: num("salt_100g"),
          },
          nutriscore: /^[a-e]$/.test(pr.nutriscore_grade || "") ? pr.nutriscore_grade : null,
          // Nutri-Score A–E → ocena zdravja 1–10
          health: { a: 9, b: 7, c: 5, d: 3, e: 2 }[pr.nutriscore_grade] || null,
        },
      };
    },

    "POST ai": (p, q, b) => askClaude(p[1], b),
  };

  /* ---------------------------------------------------------------- vprašanja za Claude */

  const ITEMS_FORMAT =
    '{"items":[{"name":"...","grams":0,"kcal":0,"protein":0,"carbs":0,"fat":0,"sat_fat":0,"sugar":0,"fiber":0,"salt":0,"health":0}],"health":0,"health_note":"...","note":"..."}';
  const DAY_FORMAT = '{"score":0,"comment":"..."}';
  const RECIPE_FORMAT =
    '{"title":"...","servings":1,"minutes":0,"ingredients":[{"name":"...","amount":"..."}],"steps":["..."],"kcal":0,"protein":0,"carbs":0,"fat":0,"tip":"..."}';

  const P = {
    sl: {
      food: "Si prehranski asistent. Oceni živila, količine v gramih in hranilne vrednosti za DEJANSKO zaužito količino: kcal ter beljakovine (protein), ogljikove hidrate (carbs) in maščobe (fat) v gramih. Kjer količina ni podana, predpostavi običajno porcijo. Sestavljeno jed razdeli na glavne sestavine. Pri kuhanih živilih upoštevaj maso v stanju, kot je bilo pojedeno (kuhan riž, pečeno meso), in to zapiši v ime; olje ali maslo za pripravo navedi kot ločeno živilo, če je bilo verjetno uporabljeno. Uporabljaj realne vrednosti iz prehranskih tabel in preveri, da se kcal ujemajo z makrohranili (4/4/9 kcal na g). Imena živil piši kratko, v slovenščini. Za vsako živilo dodaj še nasičene maščobe (sat_fat), sladkorje (sugar), vlaknine (fiber) in sol (salt) v gramih ter \"health\": oceno 1–10, kako zdravo je (10 = nepredelano, hranljivo; 1 = ultra predelano, veliko sladkorja, nasičenih maščob ali soli). Dodaj še skupno oceno obroka \"health\" (1–10) in v \"health_note\" en kratek stavek, zakaj. V \"note\" v enem stavku navedi predpostavke.",
      ate: "Kaj sem pojedel/a:",
      known: "Za ta moja znana živila uporabi točno te vrednosti na 100 g (kcal / beljakovine / OH / maščobe):",
      photo: "Na priloženi fotografiji je obrok. Prepoznaj vsa živila na krožniku in oceni njihovo maso v gramih (upoštevaj velikost krožnika in pribora).",
      userNote: "Moja opomba:",
      format: "Odgovori SAMO z JSON v enem bloku kode, točno v tej obliki (številke brez enot):",
      chef: "Si športni nutricionist in kuhar. Recept napiši v slovenščini.",
      left: (r) => `Ostanek za danes: ${Math.round(r.kcal)} kcal, ${Math.round(r.protein)} g beljakovin, ${Math.round(r.carbs)} g OH, ${Math.round(r.fat)} g maščob.`,
      target: (t) => `Ciljne vrednosti za ENO porcijo: ${Math.round(t.kcal)} kcal, ${Math.round(t.protein)} g beljakovin, ${Math.round(t.carbs)} g OH, ${Math.round(t.fat)} g maščob.`,
      servings: (n) => `Število porcij: ${n}. Količine sestavin so za vse porcije; kcal, protein, carbs in fat v odgovoru so SKUPNI za vse porcije.`,
      goal: { cut: "hujšanje", bulk: "pridobivanje mase", maintain: "vzdrževanje" },
      goalL: "Cilj:",
      focus: "Najpomembneje je čim bolj natančno zadeti:",
      focusNames: { protein: "beljakovine", carbs: "ogljikove hidrate", fat: "maščobe" },
      meal: "Vrsta obroka:",
      prefs: "Želje / omejitve:",
      prev: "Prejšnji predlog:",
      tweak: "Prilagodi ga takole:",
      tweakEnd: "Vrni prilagojen recept (ali nov, če to zahtevam).",
      day: "Si prehranski strokovnjak. Oceni, kako zdrav je bil moj prehranski dan, z oceno 1–10 (10 = odlično uravnotežen, veliko nepredelane hrane, vlaknin in beljakovin; 1 = zelo nezdrav). Upoštevaj kakovost živil, ravnovesje makrohranil glede na moj cilj, nasičene maščobe, sladkor, sol in vlaknine. V \"comment\" v 2–3 kratkih stavkih v slovenščini napiši, kaj je bilo dobro in kaj naj izboljšam.",
      dayGoal: (g, tg) => `Moj cilj: ${g}. Dnevni cilj: ${Math.round(tg.kcal)} kcal, ${Math.round(tg.protein)} g beljakovin, ${Math.round(tg.carbs)} g OH, ${Math.round(tg.fat)} g maščob.`,
      dayList: "Danes sem pojedel/a:",
      ask: "Predlagaj en realen, okusen recept, ki na porcijo čim bolj natančno doseže ciljne vrednosti, brez da jih preseže. Če so cilji zelo majhni, predlagaj lahek prigrizek. Sestavine v gramih, pogoste v običajnih trgovinah.",
    },
    en: {
      food: "You are a nutrition assistant. Estimate the foods, amounts in grams and nutrition for the amount ACTUALLY eaten: kcal plus protein, carbs and fat in grams. Where no amount is given, assume a typical serving. Split a composite dish into its main ingredients. For cooked foods use the weight as eaten (cooked rice, roasted meat) and say so in the name; list oil or butter used in cooking as a separate item when it was likely used. Use realistic values from nutrition tables and check that kcal agree with the macros (4/4/9 kcal per g). Keep food names short, in English. For each food also add saturated fat (sat_fat), sugars (sugar), fibre (fiber) and salt (salt) in grams, and \"health\": a 1–10 score of how healthy it is (10 = whole, nutritious; 1 = ultra-processed, high in sugar, saturated fat or salt). Also add an overall meal score \"health\" (1–10) and one short sentence on why in \"health_note\". In \"note\", state your assumptions in one sentence.",
      ate: "What I ate:",
      known: "For these foods I know, use exactly these values per 100 g (kcal / protein / carbs / fat):",
      photo: "The attached photo shows a meal. Identify every food on the plate and estimate its weight in grams (use the plate and cutlery for scale).",
      userNote: "My note:",
      format: "Reply ONLY with JSON in a single code block, exactly in this shape (numbers without units):",
      chef: "You are a sports nutritionist and chef. Write the recipe in English.",
      left: (r) => `Left for today: ${Math.round(r.kcal)} kcal, ${Math.round(r.protein)} g protein, ${Math.round(r.carbs)} g carbs, ${Math.round(r.fat)} g fat.`,
      target: (t) => `Targets for ONE serving: ${Math.round(t.kcal)} kcal, ${Math.round(t.protein)} g protein, ${Math.round(t.carbs)} g carbs, ${Math.round(t.fat)} g fat.`,
      servings: (n) => `Servings: ${n}. Ingredient amounts are for all servings; kcal, protein, carbs and fat in the answer are TOTALS for all servings.`,
      goal: { cut: "cutting", bulk: "bulking", maintain: "maintenance" },
      goalL: "Goal:",
      focus: "Most important is to hit as closely as possible:",
      focusNames: { protein: "protein", carbs: "carbs", fat: "fat" },
      meal: "Meal type:",
      prefs: "Preferences / restrictions:",
      prev: "Previous suggestion:",
      tweak: "Adjust it like this:",
      tweakEnd: "Return the adjusted recipe (or a new one if I ask for it).",
      day: "You are a nutrition expert. Rate how healthy my day of eating was on a 1–10 scale (10 = very well balanced, mostly whole foods, plenty of fibre and protein; 1 = very unhealthy). Consider food quality, macro balance for my goal, saturated fat, sugar, salt and fibre. In \"comment\", write 2–3 short sentences in English on what was good and what to improve.",
      dayGoal: (g, tg) => `My goal: ${g}. Daily targets: ${Math.round(tg.kcal)} kcal, ${Math.round(tg.protein)} g protein, ${Math.round(tg.carbs)} g carbs, ${Math.round(tg.fat)} g fat.`,
      dayList: "Today I ate:",
      ask: "Suggest one realistic, tasty recipe that hits the per-serving targets as closely as possible without exceeding them. If the targets are very small, suggest a light snack. Ingredients in grams, common in ordinary supermarkets.",
    },
  };

  function buildPrompt(kind, b) {
    const L = P[LANG] || P.sl;
    const known = (b.known || []).length
      ? ["", L.known, ...b.known.map((k) => `- ${k.name}: ${k.kcal} / ${k.protein} / ${k.carbs} / ${k.fat}`)]
      : [];
    if (kind === "parse") return [L.food, "", `${L.ate} ${b.text}`, ...known, "", L.format, ITEMS_FORMAT].join("\n");
    if (kind === "photo") return [L.food, "", L.photo, b.note ? `${L.userNote} ${b.note}` : "", ...known, "", L.format, ITEMS_FORMAT].filter((x, i, a) => x || a[i - 1]).join("\n");
    if (kind === "day") {
      const fmtN = (v) => (v == null ? "?" : Math.round(v * 10) / 10);
      const rows = (b.entries || []).map((e) =>
        `- ${e.time} ${e.name}${e.grams ? ` (${Math.round(e.grams)} g)` : ""}: ${Math.round(e.kcal)} kcal, P ${fmtN(e.protein)}, C ${fmtN(e.carbs)}, F ${fmtN(e.fat)}, sat ${fmtN(e.sat_fat)}, sugar ${fmtN(e.sugar)}, fiber ${fmtN(e.fiber)}, salt ${fmtN(e.salt)}`);
      return [L.day, "", L.dayGoal(L.goal[b.goal] || b.goal, b.targets || {}), "", L.dayList, ...rows, "", L.format, DAY_FORMAT].join("\n");
    }
    // recept
    const lines = [L.chef, "", L.left(b.remaining || {}), L.target(b.target || b.remaining || {}), L.servings(b.servings || 1), `${L.goalL} ${L.goal[b.goal] || b.goal}.`];
    if (b.focus?.length) lines.push(`${L.focus} ${b.focus.map((f) => L.focusNames[f]).join(", ")}.`);
    if (b.meal) lines.push(`${L.meal} ${t("recipe." + b.meal)}.`);
    if (b.prefs) lines.push(`${L.prefs} ${b.prefs}`);
    lines.push("");
    if (b.previous && b.tweak) {
      const { id, saved_at, ...prev } = b.previous;
      lines.push(L.prev, JSON.stringify(prev), "", `${L.tweak} ${b.tweak}`, L.tweakEnd);
    } else {
      lines.push(L.ask);
    }
    lines.push("", L.format, RECIPE_FORMAT);
    return lines.join("\n");
  }

  // iz Claudovega odgovora izlušči JSON (blok kode, ali karkoli med prvim { in zadnjim })
  function parseAnswer(kind, text) {
    let s = String(text || "").trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) s = fence[1];
    const a = s.indexOf("{"), z = s.lastIndexOf("}");
    if (a === -1 || z <= a) return null;
    let d;
    try {
      d = JSON.parse(s.slice(a, z + 1));
    } catch {
      return null;
    }
    const n = (v) => (isFinite(parseFloat(v)) ? parseFloat(v) : 0);
    const opt = (v) => (isFinite(parseFloat(v)) ? parseFloat(v) : null);
    const score = (v) => (opt(v) ? Math.max(1, Math.min(10, opt(v))) : null);
    if (d.title === "..." || d.comment === "..." || d.items?.[0]?.name === "...") return null;
    if (kind === "day") {
      if (!score(d.score)) return null;
      return { score: score(d.score), comment: String(d.comment || "") };
    }
    if (kind === "recipe") {
      if (!d.title || !Array.isArray(d.ingredients) || !Array.isArray(d.steps)) return null;
      return {
        title: String(d.title), servings: Math.max(1, n(d.servings) || 1), minutes: n(d.minutes),
        ingredients: d.ingredients.map((i) => ({ name: String(i.name ?? i), amount: String(i.amount ?? "") })),
        steps: d.steps.map(String),
        kcal: n(d.kcal), protein: n(d.protein), carbs: n(d.carbs), fat: n(d.fat), tip: String(d.tip || ""),
      };
    }
    const items = Array.isArray(d) ? d : d.items;
    if (!Array.isArray(items) || !items.length) return null;
    return {
      items: items.map((i) => ({
        name: String(i.name || "?"), grams: n(i.grams), kcal: n(i.kcal), protein: n(i.protein), carbs: n(i.carbs), fat: n(i.fat),
        sat_fat: opt(i.sat_fat), sugar: opt(i.sugar), fiber: opt(i.fiber), salt: opt(i.salt), health: score(i.health),
      })),
      health: score(d.health),
      health_note: String(d.health_note || ""),
      note: String(d.note || ""),
    };
  }

  /* ---------------------------------------------------------------- okno »Vprašaj Claude« */

  const dlg = document.createElement("dialog");
  dlg.className = "dialog handoff";
  document.body.append(dlg);

  // prepozna vrsto odgovora (živila, recept, ocena dneva) – za odgovor, ki pride prek »Deli«
  window.mtParseAny = (text) => {
    for (const kind of ["items", "recipe", "day"]) {
      const res = parseAnswer(kind, text);
      if (res) return { kind, res };
    }
    return null;
  };

  function askClaude(kind, b) {
    const prompt = buildPrompt(kind, b);
    const image = kind === "photo"
      ? new File([Uint8Array.from(atob(b.image), (c) => c.charCodeAt(0))], "obrok.jpg", { type: b.media_type || "image/jpeg" })
      : null;
    const canShare = !!navigator.share;
    const canShareImg = !!(image && navigator.canShare?.({ files: [image], text: prompt }));
    // neposredna povezava odpre nov pogovor z že vpisanim vprašanjem (brez menija za deljenje)
    const link = image ? null : "https://claude.ai/new?q=" + encodeURIComponent(prompt);
    // če odgovor pride nazaj prek »Deli → Macrotractor«, se aplikacija naloži na novo
    try { localStorage.setItem("mt_pending", JSON.stringify({ kind, day: b.day || state.day, at: Date.now() })); } catch {}

    return new Promise((resolve, reject) => {
      let done = false;
      dlg.innerHTML = `
        <form method="dialog" class="dialog-head">
          <h3>${t("local.title")}</h3>
          <button class="icon-btn" aria-label="${t("close")}">${icon("x")}</button>
        </form>
        <section class="ho-step">
          <h4>${t("local.step1")}</h4>
          <p class="muted small">${image && !canShareImg ? t("local.noShareFiles") : t(image ? "local.step1Photo" : "local.step1Sub")}</p>
          <div class="ho-btns">
            ${canShare && (!image || canShareImg) ? `<button type="button" class="btn primary" data-act="share">${icon("share")} ${t("local.share")}</button>` : ""}
            ${link ? `<a class="btn ${canShare ? "soft" : "primary"}" data-act="link" href="${esc(link)}" target="_blank" rel="noopener">${icon("send")} ${t("local.link")}</a>` : ""}
            <button type="button" class="btn soft" data-act="copy">${icon("copy")} ${t("local.copy")}</button>
            ${image && !canShareImg ? `<button type="button" class="btn soft" data-act="img">${icon("download")} ${t("local.saveImg")}</button>` : ""}
          </div>
        </section>
        <section class="ho-step">
          <h4>${t("local.step2")}</h4>
          <p class="muted small">${t("local.step2Sub")}</p>
          <textarea rows="3" placeholder="${esc(t("local.pastePh"))}"></textarea>
          <p class="error ho-err" hidden></p>
          <div class="ho-btns">
            <button type="button" class="btn primary" data-act="paste">${icon("copy")} ${t("local.paste")}</button>
            <button type="button" class="btn soft" data-act="use">${t("local.use")}</button>
          </div>
        </section>`;
      const ta = dlg.querySelector("textarea");
      const err = dlg.querySelector(".ho-err");

      const tryUse = (text, silent = false) => {
        const res = text === prompt ? null : parseAnswer(kind === "recipe" || kind === "day" ? kind : "items", text);
        if (!res) {
          if (!silent) {
            err.textContent = t("local.bad");
            err.hidden = false;
          }
          return false;
        }
        done = true;
        dlg.close();
        resolve(res);
        return true;
      };

      // ob vrnitvi iz Clauda poskusi odgovor prebrati sam (ko je dostop do odložišča že dovoljen)
      const onReturn = async () => {
        if (document.hidden || !dlg.open || done || ta.value) return;
        try {
          const perm = await navigator.permissions.query({ name: "clipboard-read" });
          if (perm.state !== "granted") return;
          const text = await navigator.clipboard.readText();
          if (text && text.includes("{")) tryUse(text, true);
        } catch {}
      };
      document.addEventListener("visibilitychange", onReturn);
      window.addEventListener("focus", onReturn);

      dlg.onclick = async (e) => {
        const btn = e.target.closest("[data-act]");
        if (!btn) return;
        const act = btn.dataset.act;
        if (act === "share") {
          try {
            await navigator.share(canShareImg ? { text: prompt, files: [image] } : { text: prompt });
          } catch {}
        } else if (act === "link") {
          // povezava se odpre sama; vprašanje še kopiraj, če ga Claude ne bi vpisal
          copyPlain(prompt);
        } else if (act === "copy") {
          await copyPlain(prompt);
          toast(t("local.copied"));
        } else if (act === "img") {
          const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(image), download: image.name });
          a.click();
        } else if (act === "paste") {
          try {
            ta.value = await navigator.clipboard.readText();
            tryUse(ta.value);
          } catch {
            toast(t("local.noClipboard"), true);
            ta.focus();
          }
        } else if (act === "use") {
          tryUse(ta.value);
        }
      };
      // prilepljen odgovor se uporabi takoj
      ta.addEventListener("paste", () => setTimeout(() => ta.value.includes("}") && tryUse(ta.value), 0));

      dlg.onclose = () => {
        document.removeEventListener("visibilitychange", onReturn);
        window.removeEventListener("focus", onReturn);
        try { localStorage.removeItem("mt_pending"); } catch {}
        if (!done) reject(new Error(t("local.cancelled")));
      };
      dlg.showModal();
    });
  }

  async function copyPlain(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = Object.assign(document.createElement("textarea"), { value: text });
      ta.style.cssText = "position:fixed;opacity:0";
      dlg.append(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  }

  /* ---------------------------------------------------------------- profil: drugačna besedila */

  const claudeInfo = document.getElementById("claudeInfo");
  if (claudeInfo) claudeInfo.innerHTML = '<span data-i18n="local.claudeInfo"></span>';
  document.getElementById("syncInfo")?.setAttribute("data-i18n", "local.syncInfo");
  document.querySelector('[data-i18n="sync.title"]')?.setAttribute("data-i18n", "local.syncTitle");
  const addr = document.getElementById("serverAddr");
  if (addr) addr.hidden = true;

  window.localApi = localApi;
})();
