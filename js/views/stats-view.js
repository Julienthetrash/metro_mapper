import { getState } from "../app.js";
import { progressRing } from "../components/progress-ring.js";
import { lineBadgeHTML } from "../components/line-badge.js";
import { globalStats } from "../services/stats-service.js";
import { evaluateBadges } from "../services/badge-engine.js";
import { exportJson, importJson, shareStatsText } from "../services/share-service.js";
import { getMeta, setMeta } from "../db.js";
import { showToast } from "../components/toast.js";

let rootEl = null;
let sortMode = "byPercentage";

export function renderStatsView(el, _state) {
  rootEl = el;
  el.innerHTML = `<div class="scroll-region content-padded" id="stats-scroll"><div class="loader">Chargement…</div></div>`;
  init();
}

async function init() {
  const stored = await getMeta("pref:lineSort", "byPercentage");
  sortMode = stored;
  paint();
}

export async function refreshStatsView() {
  if (!rootEl) return;
  paint();
}

async function paint() {
  const state = getState();
  const scroll = document.getElementById("stats-scroll");
  if (!scroll) return;
  const summary = globalStats(state);
  const { defs, statuses, newly } = await evaluateBadges(state, summary, { toast: true });

  scroll.innerHTML = "";

  // Global card
  const globalCard = document.createElement("div");
  globalCard.className = "stats-card";
  const ring = progressRing({
    percentage: summary.percentageGlobal,
    label: `${summary.totalVisited} / ${summary.totalStations}`,
    sublabel: `${Math.round(summary.percentageGlobal * 100)} %`,
  });
  globalCard.append(ring);

  const meta = document.createElement("div");
  meta.className = "stats-card__meta";
  if (summary.firstVisit) {
    meta.innerHTML = `Première visite : ${formatDate(summary.firstVisit)}<br>Dernière visite : ${formatDate(summary.lastVisit)}`;
  } else {
    meta.textContent = "Aucune station visitée pour le moment.";
  }
  globalCard.append(meta);
  scroll.append(globalCard);

  // Per-line
  const perLineSection = document.createElement("div");
  perLineSection.className = "stats-card";
  perLineSection.innerHTML = `
    <h3 class="section-title">Par ligne</h3>
    <div class="toggle-pill" role="group">
      <button data-sort="byPercentage" aria-pressed="${sortMode === "byPercentage"}">% décroissant</button>
      <button data-sort="byLine" aria-pressed="${sortMode === "byLine"}">Par n° de ligne</button>
    </div>
    <div id="per-line-rows"></div>
  `;
  scroll.append(perLineSection);

  perLineSection.querySelectorAll(".toggle-pill button").forEach(btn => {
    btn.addEventListener("click", async () => {
      sortMode = btn.dataset.sort;
      await setMeta("pref:lineSort", sortMode);
      paint();
    });
  });

  const lines = [...state.lines];
  if (sortMode === "byPercentage") {
    lines.sort((a, b) => {
      const sa = summary.perLine.get(a.id);
      const sb = summary.perLine.get(b.id);
      return (sb.percentage - sa.percentage) || (a.sortOrder - b.sortOrder);
    });
  } else {
    lines.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  const rows = perLineSection.querySelector("#per-line-rows");
  for (const line of lines) {
    const s = summary.perLine.get(line.id);
    const pct = Math.round(s.percentage * 100);
    const row = document.createElement("div");
    row.className = "per-line-row";
    row.innerHTML = `
      ${lineBadgeHTML(line, { size: "sm" })}
      <div>
        <div style="font-weight:500;font-size:14px">${line.name}</div>
        <div class="per-line-row__bar"><span style="width:${pct}%;background:${line.colorHex}"></span></div>
      </div>
      <div class="per-line-row__count">${s.visited} / ${s.total} · ${pct}%</div>
    `;
    rows.append(row);
  }

  // Badges
  const badgeCard = document.createElement("div");
  badgeCard.className = "stats-card";
  badgeCard.innerHTML = `<h3 class="section-title">Badges</h3><div class="badge-grid" id="badge-grid"></div>`;
  scroll.append(badgeCard);

  const grid = badgeCard.querySelector("#badge-grid");
  for (const def of defs) {
    const st = statuses.get(def.id) || { unlocked: false };
    const card = document.createElement("button");
    card.type = "button";
    card.className = "badge";
    card.dataset.unlocked = String(!!st.unlocked);
    card.innerHTML = `
      <div class="badge__icon">${st.unlocked ? def.icon : "🔒"}</div>
      <div class="badge__title">${escapeHtml(def.title)}</div>
      <div class="badge__desc">${escapeHtml(def.description)}</div>
    `;
    card.title = st.unlocked && st.date
      ? `${def.title} — débloqué le ${formatDate(st.date)}`
      : `${def.title} — ${def.description}`;
    card.addEventListener("click", () => {
      showToast(`${def.title} — ${def.description}${st.unlocked && st.date ? ` (débloqué le ${formatDate(st.date)})` : ""}`);
    });
    grid.append(card);
  }

  // Share & export
  const shareCard = document.createElement("div");
  shareCard.className = "stats-card";
  shareCard.innerHTML = `
    <h3 class="section-title">Partage &amp; sauvegarde</h3>
    <div class="action-row">
      <button class="btn btn--block" id="btn-share">Partager mes stats</button>
      <button class="btn btn--block btn--secondary" id="btn-export">Exporter (JSON)</button>
      <label class="btn btn--block btn--secondary" for="import-input">Importer un export…</label>
      <input id="import-input" type="file" accept="application/json,.json" hidden>
      <p style="font-size:12px;color:var(--text-muted);margin:8px 0 0">
        💡 Astuce : exportez régulièrement votre progression. Sur iOS, Safari peut purger les données des PWA non utilisées pendant ~7 jours.
      </p>
    </div>
  `;
  scroll.append(shareCard);

  shareCard.querySelector("#btn-share").addEventListener("click", async () => {
    const shared = await shareStatsText();
    if (!shared) showToast("Stats copiées dans le presse-papier");
  });
  shareCard.querySelector("#btn-export").addEventListener("click", async () => {
    await exportJson();
    showToast("Export téléchargé");
  });
  shareCard.querySelector("#import-input").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm("Importer remplacera toutes vos visites actuelles. Continuer ?")) {
      e.target.value = "";
      return;
    }
    try {
      const n = await importJson(file);
      // refresh in-memory state by reloading the page
      showToast(`${n} visites importées — rechargement…`);
      setTimeout(() => location.reload(), 800);
    } catch (err) {
      console.error(err);
      showToast("Import échoué : " + err.message);
    }
  });
}

function formatDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
