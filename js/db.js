// Thin wrapper over Dexie (loaded globally via CDN script in index.html).

let _ctx = null;

export async function initDb() {
  if (_ctx) return _ctx;

  if (typeof Dexie === "undefined") {
    throw new Error("Dexie n'est pas chargé.");
  }

  const db = new Dexie("mon-metro-paris");
  db.version(1).stores({
    visits: "stationId, visitedAt",
    meta: "key",
  });
  await db.open();

  _ctx = { db };
  return _ctx;
}

export async function getMeta(key, fallback = null) {
  const { db } = await initDb();
  const row = await db.meta.get(key);
  return row ? row.value : fallback;
}

export async function setMeta(key, value) {
  const { db } = await initDb();
  await db.meta.put({ key, value });
}

export async function allVisits() {
  const { db } = await initDb();
  return db.visits.toArray();
}

export async function clearAll() {
  const { db } = await initDb();
  await db.transaction("rw", db.visits, db.meta, async () => {
    await db.visits.clear();
    await db.meta.clear();
  });
}
