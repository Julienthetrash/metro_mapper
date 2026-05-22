import { getState } from "../app.js";
import { openStationDetail } from "./station-detail.js";

let map = null;
let markerLayer = null;
let markersByStationId = new Map();
let activeLineFilter = null; // null = all
let legendOpen = false;
let rootEl = null;
let domReady = false;

const PARIS_CENTER = [48.8566, 2.3522];

export function renderMapView(el, _state) {
  rootEl = el;
  el.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.style.position = "relative";
  wrap.style.flex = "1";
  wrap.style.minHeight = "0";
  wrap.style.display = "flex";

  const mapEl = document.createElement("div");
  mapEl.id = "leaflet-map";
  wrap.append(mapEl);

  const toolbar = document.createElement("div");
  toolbar.className = "map-toolbar";
  toolbar.innerHTML = `
    <button id="map-locate" title="Centrer sur Paris" aria-label="Centrer la carte sur Paris">
      <svg viewBox="0 0 24 24"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9 3h-2.05A7.002 7.002 0 0 0 13 5.05V3h-2v2.05A7.002 7.002 0 0 0 5.05 11H3v2h2.05A7.002 7.002 0 0 0 11 18.95V21h2v-2.05A7.002 7.002 0 0 0 18.95 13H21v-2zM12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/></svg>
    </button>
  `;
  wrap.append(toolbar);

  const legend = document.createElement("div");
  legend.className = "map-legend";
  legend.id = "map-legend";
  wrap.append(legend);

  el.append(wrap);
  domReady = true;
  // Do NOT init Leaflet here: the view is still display:none during bootstrap.
  // initLeaflet() runs from refreshMapView() once the view is actually visible.
}

function initLeaflet() {
  if (typeof L === "undefined") {
    console.warn("Leaflet n'est pas encore chargé.");
    return;
  }
  if (map) return;
  const mapEl = document.getElementById("leaflet-map");
  if (!mapEl) return;

  map = L.map(mapEl, {
    center: PARIS_CENTER,
    zoom: 12,
    preferCanvas: true,
    zoomControl: true,
  });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  if (L.markerClusterGroup) {
    markerLayer = L.markerClusterGroup({
      maxClusterRadius: 40,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      disableClusteringAtZoom: 14,
    });
  } else {
    markerLayer = L.layerGroup();
  }
  map.addLayer(markerLayer);

  document.getElementById("map-locate")?.addEventListener("click", () => {
    map.setView(PARIS_CENTER, 12);
  });

  paintLegend();
  paintMarkers();

  // Force a recompute once the browser has laid out the now-visible container.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => map.invalidateSize());
  });
}

function buildMarkerIcon(station, state) {
  const lines = station.lineIds.map(id => state.lineById.get(id)).filter(Boolean);
  const visited = state.visits.has(station.id);
  let background;
  if (lines.length === 1) {
    background = lines[0].colorHex;
  } else {
    // Conic-gradient segmented circle
    const step = 360 / lines.length;
    const stops = lines.map((l, i) => `${l.colorHex} ${i * step}deg ${(i + 1) * step}deg`).join(", ");
    background = `conic-gradient(${stops})`;
  }
  const html = `<div class="map-marker ${visited ? "map-marker--visited" : "map-marker--unvisited"}" style="background:${background}">
    ${visited ? `<span class="map-marker__check">✓</span>` : ""}
  </div>`;
  return L.divIcon({
    html,
    className: "",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function paintMarkers() {
  if (!map || !markerLayer) return;
  markerLayer.clearLayers();
  markersByStationId.clear();
  const state = getState();
  for (const station of state.stations) {
    if (activeLineFilter && !station.lineIds.includes(activeLineFilter)) continue;
    const marker = L.marker([station.latitude, station.longitude], {
      icon: buildMarkerIcon(station, state),
      title: station.name,
    });
    marker.on("click", () => openStationDetail(station.id));
    markerLayer.addLayer(marker);
    markersByStationId.set(station.id, marker);
  }
}

function paintLegend() {
  const legend = document.getElementById("map-legend");
  if (!legend) return;
  const state = getState();
  legend.innerHTML = `
    <div class="map-legend__head">
      <span>Lignes</span>
      <button id="legend-toggle" type="button">${legendOpen ? "Réduire" : "Filtrer"}</button>
    </div>
    <div class="map-legend__items" ${legendOpen ? "" : "hidden"}>
      <button data-line="" aria-pressed="${activeLineFilter === null}" style="background:var(--bg-elev-2)">Toutes</button>
      ${state.lines.map(l => `
        <button data-line="${l.id}" aria-pressed="${activeLineFilter === l.id}"
                style="background:${l.colorHex};color:${l.textColorHex}">
          ${l.id.endsWith("bis") ? l.id.replace("bis", "ᵇⁱˢ") : l.id}
        </button>
      `).join("")}
    </div>
  `;
  legend.querySelector("#legend-toggle").addEventListener("click", () => {
    legendOpen = !legendOpen;
    paintLegend();
  });
  legend.querySelectorAll("[data-line]").forEach(btn => {
    btn.addEventListener("click", () => {
      const v = btn.dataset.line;
      activeLineFilter = v ? v : null;
      paintLegend();
      paintMarkers();
    });
  });
}

export function refreshMapView(_reason) {
  if (!domReady) return;
  if (!map) {
    // First time the map view is shown: now we know the container is visible
    // (display:flex) and has real dimensions, so Leaflet can size correctly.
    initLeaflet();
    return;
  }
  // Subsequent calls: just sync visited state + size.
  requestAnimationFrame(() => map.invalidateSize());
  paintMarkers();
}
