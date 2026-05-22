import { getState, markVisited, unmarkVisited } from "../app.js";
import { lineBadgeHTML } from "../components/line-badge.js";
import { showToast } from "../components/toast.js";

const ROOT_ID = "station-detail-root";
let miniMap = null;
let activeStationId = null;

function isoDateInputValue(ts) {
  const d = new Date(ts);
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 10);
}

async function compressPhoto(file, maxWidth = 1280, quality = 0.7) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const ratio = Math.min(1, maxWidth / img.naturalWidth);
    const w = Math.round(img.naturalWidth * ratio);
    const h = Math.round(img.naturalHeight * ratio);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    return await new Promise(res => canvas.toBlob(res, "image/jpeg", quality));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function openStationDetail(stationId) {
  const state = getState();
  const station = state.stationById.get(stationId);
  if (!station) return;
  activeStationId = stationId;

  const lines = station.lineIds.map(id => state.lineById.get(id)).filter(Boolean);
  const visit = state.visits.get(stationId);
  const visited = !!visit;

  const root = document.getElementById(ROOT_ID);
  root.setAttribute("aria-hidden", "false");
  root.innerHTML = "";

  const backdrop = document.createElement("div");
  backdrop.className = "sheet-backdrop";
  backdrop.addEventListener("click", closeStationDetail);

  const sheet = document.createElement("div");
  sheet.className = "sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.innerHTML = `
    <div class="sheet__handle"></div>
    <h2 class="sheet__title">${escapeHtml(station.name)}</h2>
    <div class="sheet__lines">${lines.map(l => lineBadgeHTML(l, { size: "sm" })).join("")}</div>
    <div id="sd-mini-map" class="sheet__mini-map"></div>
    <button id="sd-toggle" class="btn btn--block ${visited ? "btn--danger" : ""}" type="button">
      ${visited ? "Retirer de mes visites" : "Marquer comme visitée"}
    </button>
    <div id="sd-visited-extras" ${visited ? "" : "hidden"}>
      <div class="sheet__row">
        <label for="sd-date">Date de visite</label>
        <input id="sd-date" type="date" value="${visit ? isoDateInputValue(visit.visitedAt) : isoDateInputValue(Date.now())}">
      </div>
      <div class="photo-zone" id="sd-photo">
        ${visit?.photo ? `<img id="sd-photo-img" alt="Photo souvenir">` : `<p style="margin:0;color:var(--text-muted)">Pas encore de photo</p>`}
        <div class="photo-zone__actions">
          <label for="sd-photo-input" class="btn btn--secondary">${visit?.photo ? "Changer la photo" : "Ajouter une photo"}</label>
          ${visit?.photo ? `<button id="sd-photo-remove" class="btn btn--secondary" type="button">Supprimer</button>` : ""}
          <input id="sd-photo-input" type="file" accept="image/*" capture="environment">
        </div>
      </div>
      <div class="sheet__row">
        <label for="sd-note">Note</label>
        <textarea id="sd-note" placeholder="Souvenir, anecdote…">${escapeHtml(visit?.note || "")}</textarea>
      </div>
    </div>
    <div class="sheet__row" style="margin-top:14px">
      <a class="btn btn--secondary" target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=${station.latitude}&mlon=${station.longitude}#map=17/${station.latitude}/${station.longitude}">
        Voir sur OpenStreetMap
      </a>
    </div>
  `;

  root.append(backdrop, sheet);

  initMiniMap(station);
  bindHandlers(sheet, station);

  // restore photo blob preview
  if (visit?.photo instanceof Blob) {
    const imgEl = sheet.querySelector("#sd-photo-img");
    if (imgEl) imgEl.src = URL.createObjectURL(visit.photo);
  }

  // ESC to close
  document.addEventListener("keydown", onKeydown);
}

function onKeydown(e) {
  if (e.key === "Escape") closeStationDetail();
}

export function closeStationDetail() {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = "";
  activeStationId = null;
  miniMap = null;
  document.removeEventListener("keydown", onKeydown);
}

function initMiniMap(station) {
  const el = document.getElementById("sd-mini-map");
  if (!el || typeof L === "undefined") return;
  miniMap = L.map(el, {
    zoomControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    touchZoom: false,
    attributionControl: false,
  }).setView([station.latitude, station.longitude], 15);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OSM",
  }).addTo(miniMap);
  L.circleMarker([station.latitude, station.longitude], {
    radius: 8, color: "#fff", weight: 2, fillColor: "#003CA6", fillOpacity: 1,
  }).addTo(miniMap);
  setTimeout(() => miniMap?.invalidateSize(), 50);
}

function bindHandlers(sheet, station) {
  const toggleBtn = sheet.querySelector("#sd-toggle");
  toggleBtn.addEventListener("click", async () => {
    const state = getState();
    if (state.visits.has(station.id)) {
      await unmarkVisited(station.id);
      showToast("Retirée de vos visites");
    } else {
      await markVisited(station.id);
      if (navigator.vibrate) navigator.vibrate(50);
      showToast(`✅ ${station.name} ajoutée`);
    }
    // re-render to keep state coherent
    openStationDetail(station.id);
  });

  const dateInput = sheet.querySelector("#sd-date");
  dateInput?.addEventListener("change", async () => {
    const ts = new Date(dateInput.value).getTime();
    if (!Number.isNaN(ts)) {
      await markVisited(station.id, { visitedAt: ts });
      showToast("Date mise à jour");
    }
  });

  const note = sheet.querySelector("#sd-note");
  note?.addEventListener("blur", async () => {
    await markVisited(station.id, { note: note.value });
  });

  const photoInput = sheet.querySelector("#sd-photo-input");
  photoInput?.addEventListener("change", async () => {
    const file = photoInput.files?.[0];
    if (!file) return;
    showToast("Compression de la photo…");
    try {
      const blob = await compressPhoto(file);
      await markVisited(station.id, { photo: blob });
      openStationDetail(station.id);
    } catch (err) {
      console.error(err);
      showToast("Erreur photo");
    }
  });

  const photoRemove = sheet.querySelector("#sd-photo-remove");
  photoRemove?.addEventListener("click", async () => {
    await markVisited(station.id, { photo: null });
    openStationDetail(station.id);
  });
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
