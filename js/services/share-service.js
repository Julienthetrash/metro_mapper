import { getState } from "../app.js";
import { allVisits, getMeta, setMeta } from "../db.js";
import { initDb } from "../db.js";
import { globalStats } from "./stats-service.js";

export async function exportJson() {
  const state = getState();
  const visits = await allVisits();
  const serializableVisits = [];
  for (const v of visits) {
    let photoBase64 = null;
    if (v.photo instanceof Blob) {
      photoBase64 = await blobToBase64(v.photo);
    }
    serializableVisits.push({
      stationId: v.stationId,
      visitedAt: v.visitedAt,
      note: v.note || "",
      photo: photoBase64,
    });
  }
  const data = {
    app: "mon-metro-paris",
    version: 1,
    exportedAt: new Date().toISOString(),
    visits: serializableVisits,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mon-metro-paris-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return data;
}

export async function importJson(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (data.app !== "mon-metro-paris" || !Array.isArray(data.visits)) {
    throw new Error("Fichier d'import invalide.");
  }
  const { db } = await initDb();
  await db.transaction("rw", db.visits, async () => {
    await db.visits.clear();
    for (const v of data.visits) {
      const record = {
        stationId: v.stationId,
        visitedAt: v.visitedAt,
        note: v.note || "",
        photo: v.photo ? base64ToBlob(v.photo) : null,
      };
      await db.visits.put(record);
    }
  });
  return data.visits.length;
}

export async function shareStatsText() {
  const state = getState();
  const summary = globalStats(state);
  const pct = Math.round(summary.percentageGlobal * 100);
  const text = `Mon Métro Paris : ${summary.totalVisited} / ${summary.totalStations} stations visitées (${pct} %) 🚇`;
  if (navigator.share) {
    try {
      await navigator.share({ title: "Mon Métro Paris", text });
      return true;
    } catch (e) {
      if (e.name !== "AbortError") console.warn(e);
    }
  }
  await navigator.clipboard?.writeText(text);
  return false;
}

function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

function base64ToBlob(dataUrl) {
  const [head, body] = dataUrl.split(",");
  const mimeMatch = head.match(/data:(.*?);base64/);
  const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
  const bytes = atob(body);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
