let _cache = null;

export async function loadStaticData() {
  if (_cache) return _cache;
  const [stationsRes, linesRes] = await Promise.all([
    fetch("./data/stations.json"),
    fetch("./data/lines.json"),
  ]);
  if (!stationsRes.ok) throw new Error("Impossible de charger data/stations.json");
  if (!linesRes.ok) throw new Error("Impossible de charger data/lines.json");

  const [stations, lines] = await Promise.all([
    stationsRes.json(),
    linesRes.json(),
  ]);

  lines.sort((a, b) => a.sortOrder - b.sortOrder);
  stations.sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));

  _cache = { stations, lines };
  return _cache;
}
