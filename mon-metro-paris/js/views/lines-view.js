import { getState, toggleVisit } from "../app.js";
import { lineBadgeHTML } from "../components/line-badge.js";
import { openStationDetail } from "./station-detail.js";
import { perLineStats } from "../services/stats-service.js";

let rootEl = null;
let currentLineId = null;

export function renderLinesView(el, _state) {
  rootEl = el;
  el.innerHTML = "";
  const scroll = document.createElement("div");
  scroll.className = "scroll-region content-padded";
  scroll.id = "lines-scroll";
  el.append(scroll);
  paintList();
}

export function refreshLinesView() {
  if (!rootEl) return;
  if (currentLineId) paintDetail(currentLineId);
  else paintList();
}

function paintList() {
  const state = getState();
  currentLineId = null;
  const stats = perLineStats(state);

  const ul = document.createElement("ul");
  ul.className = "line-list";

  for (const line of state.lines) {
    const s = stats.get(line.id) || { visited: 0, total: 0 };
    const pct = s.total ? Math.round((s.visited / s.total) * 100) : 0;

    const li = document.createElement("li");
    li.className = "line-list__item";
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    li.setAttribute("aria-label", `Ouvrir ${line.name}, ${s.visited} sur ${s.total} stations`);
    li.innerHTML = `
      ${lineBadgeHTML(line, { size: "lg" })}
      <div>
        <div class="line-list__name">${line.name}</div>
        <span class="line-list__progress"><span class="line-list__progress-bar" style="width:${pct}%;background:${line.colorHex}"></span></span>
      </div>
      <div class="line-list__count">${s.visited} / ${s.total}<br><small>${pct}%</small></div>
    `;
    li.addEventListener("click", () => paintDetail(line.id));
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); paintDetail(line.id); }
    });
    ul.append(li);
  }

  const scroll = document.getElementById("lines-scroll");
  scroll.innerHTML = "";
  scroll.append(ul);
}

function paintDetail(lineId) {
  const state = getState();
  const line = state.lineById.get(lineId);
  if (!line) return paintList();
  currentLineId = lineId;

  const stations = state.stations
    .filter(s => s.lineIds.includes(lineId))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  const visited = stations.filter(s => state.visits.has(s.id)).length;
  const total = stations.length;
  const pct = total ? Math.round((visited / total) * 100) : 0;

  const scroll = document.getElementById("lines-scroll");
  scroll.classList.remove("content-padded");
  scroll.innerHTML = "";

  const hero = document.createElement("div");
  hero.className = "line-detail__hero";
  hero.style.background = line.colorHex;
  hero.dataset.textColor = line.textColorHex.toLowerCase() === "#000000" ? "dark" : "light";
  hero.innerHTML = `
    <button class="back-btn" id="lines-back" aria-label="Retour aux lignes" style="color:inherit">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
      Lignes
    </button>
    <div style="flex:1">
      <h2>${line.name}</h2>
      <p>${visited} / ${total} stations · ${pct}%</p>
      <div class="line-detail__progress-outer"><div class="line-detail__progress-bar" style="width:${pct}%"></div></div>
    </div>
  `;

  scroll.append(hero);
  hero.querySelector("#lines-back").addEventListener("click", paintList);

  const list = document.createElement("ul");
  list.className = "station-list";

  for (const station of stations) {
    const isVisited = state.visits.has(station.id);
    const otherLines = station.lineIds.filter(id => id !== lineId).map(id => state.lineById.get(id)).filter(Boolean);
    const li = document.createElement("li");
    li.className = "station-list__item";
    li.innerHTML = `
      <button class="station-list__name" type="button" style="text-align:left;padding:0;background:none">${escapeHtml(station.name)}</button>
      <div class="station-list__lines">${otherLines.map(l => lineBadgeHTML(l, { size: "sm" })).join("")}</div>
      <button class="visit-toggle" aria-pressed="${isVisited}" aria-label="${isVisited ? "Retirer" : "Marquer"} ${station.name}">
        <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
      </button>
    `;
    li.querySelector(".station-list__name").addEventListener("click", () => openStationDetail(station.id));
    const toggle = li.querySelector(".visit-toggle");
    toggle.addEventListener("click", async (e) => {
      e.stopPropagation();
      const nowVisited = await toggleVisit(station.id);
      toggle.setAttribute("aria-pressed", String(nowVisited));
      toggle.classList.remove("bounce");
      void toggle.offsetWidth;
      toggle.classList.add("bounce");
      if (nowVisited && navigator.vibrate) navigator.vibrate(50);
    });
    list.append(li);
  }

  scroll.append(list);
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
