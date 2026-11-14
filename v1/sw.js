// Predpomni lupino aplikacije; API klici gredo vedno na strežnik.
// Poti so relativne, da aplikacija deluje tudi v podmapi (npr. GitHub Pages).
// build_standalone.py ime zamenja z oznako gradnje – vsaka objava je nov service worker
const CACHE = "mtv1-c14af59-202611081742";
const SHELL = ["./", "index.html", "app.css", "app.js", "i18n.js", "local.js", "config.js", "manifest.json", "icons/icon-192.png", "icons/favicon-48.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k.startsWith("mtv1-")).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.includes("/api/")) return;
  // najprej omrežje (vedno preveri pri strežniku, ne v HTTP predpomnilniku – sicer telefon
  // do 10 min meša staro in novo različico datotek), ob izpadu predpomnilnik
  e.respondWith(
    fetch(e.request.mode === "navigate" ? e.request.url : e.request, { cache: "no-cache" })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("index.html")))
  );
});
