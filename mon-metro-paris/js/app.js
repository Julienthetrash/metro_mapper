import { loadStaticData } from "./data-loader.js";
import { initDb } from "./db.js";
import { renderMapView, refreshMapView } from "./views/map-view.js";
import { renderLinesView, refreshLinesView } from "./views/lines-view.js";
import { renderStatsView, refreshStatsView } from "./views/stats-view.js";
import { showToast } from "./components/toast.js";

const ROUTES = ["map", "lines", "stats"];
const DEFAULT_ROUTE = "lines";

const state = {
  stations: [],
  lines: [],
  lineById: new Map(),
  stationById: new Map(),
  visits: new Map(),
  route: null,
};

const subscribers = new Set();

export function getState() { return state; }
export function onChange(fn) { subscribers.add(fn); return () => subscribers.delete(fn); }
function notify(reason) { subscribers.forEach(fn => fn(reason)); }

export async function markVisited(stationId, opts = {}) {
  const { db } = await initDb();
  const now = Date.now();
  const existing = state.visits.get(stationId);
  const record = {
    stationId,
    visitedAt: opts.visitedAt ?? existing?.visitedAt ?? now,
    photo: opts.photo !== undefined ? opts.photo : (existing?.photo ?? null),
    note: opts.note !== undefined ? opts.note : (existing?.note ?? ""),
  };
  await db.visits.put(record);
  state.visits.set(stationId, record);
  notify({ type: "visit-changed", stationId });
}

export async function unmarkVisited(stationId) {
  const { db } = await initDb();
  await db.visits.delete(stationId);
  state.visits.delete(stationId);
  notify({ type: "visit-removed", stationId });
}

export async function toggleVisit(stationId) {
  if (state.visits.has(stationId)) {
    await unmarkVisited(stationId);
    return false;
  }
  await markVisited(stationId);
  return true;
}

function setRoute(route) {
  if (!ROUTES.includes(route)) route = DEFAULT_ROUTE;
  state.route = route;
  for (const el of document.querySelectorAll(".view")) {
    const active = el.dataset.route === route;
    el.dataset.active = active ? "true" : "false";
    if (active) el.removeAttribute("hidden"); else el.setAttribute("hidden", "");
  }
  for (const a of document.querySelectorAll(".tab")) {
    if (a.dataset.route === route) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  const titles = { map: "Carte", lines: "Lignes", stats: "Statistiques" };
  document.getElementById("view-title").textContent = `Mon Métro Paris — ${titles[route]}`;

  if (route === "map") refreshMapView();
  else if (route === "lines") refreshLinesView();
  else if (route === "stats") refreshStatsView();
}

function resolveRoute() {
  const h = (location.hash || "").replace(/^#/, "").split("/")[0];
  return ROUTES.includes(h) ? h : DEFAULT_ROUTE;
}

function listenRoutes() {
  window.addEventListener("hashchange", () => setRoute(resolveRoute()));
  if (!location.hash) location.hash = `#${DEFAULT_ROUTE}`;
}

async function bootstrap() {
  const main = document.getElementById("app-main");
  main.insertAdjacentHTML("afterbegin", `<div class="loader" id="boot-loader">Chargement…</div>`);

  try {
    const [{ stations, lines }, { db, visits }] = await Promise.all([
      loadStaticData(),
      initDb().then(async ctx => {
        const all = await ctx.db.visits.toArray();
        return { db: ctx.db, visits: all };
      }),
    ]);

    state.stations = stations;
    state.lines = lines;
    state.lineById = new Map(lines.map(l => [l.id, l]));
    state.stationById = new Map(stations.map(s => [s.id, s]));
    state.visits = new Map(visits.map(v => [v.stationId, v]));

    document.getElementById("boot-loader")?.remove();

    renderMapView(document.getElementById("view-map"), state);
    renderLinesView(document.getElementById("view-lines"), state);
    renderStatsView(document.getElementById("view-stats"), state);

    listenRoutes();
    setRoute(resolveRoute());

    // Subscriptions: every view listens via its module to keep things tidy
    onChange(reason => {
      if (state.route === "map") refreshMapView(reason);
      else if (state.route === "lines") refreshLinesView(reason);
      else if (state.route === "stats") refreshStatsView(reason);
    });

    if (navigator.storage?.persist) {
      navigator.storage.persist().then(p => {
        if (!p) console.info("Storage not marked persistent — IndexedDB may be evicted on iOS.");
      });
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./service-worker.js").catch(err => {
        console.warn("Service worker registration failed", err);
      });
    }
  } catch (err) {
    console.error(err);
    document.getElementById("boot-loader")?.remove();
    main.insertAdjacentHTML("afterbegin",
      `<div class="loader">❌ Erreur au chargement : ${err.message}</div>`);
  }
}

window.__app = { getState, markVisited, unmarkVisited, toggleVisit, showToast, onChange, notify };

bootstrap();
