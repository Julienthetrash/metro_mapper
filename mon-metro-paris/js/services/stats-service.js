export function perLineStats(state) {
  const result = new Map();
  for (const line of state.lines) {
    result.set(line.id, { lineId: line.id, visited: 0, total: 0, percentage: 0 });
  }
  for (const station of state.stations) {
    const visited = state.visits.has(station.id);
    for (const lid of station.lineIds) {
      const s = result.get(lid);
      if (!s) continue;
      s.total += 1;
      if (visited) s.visited += 1;
    }
  }
  for (const s of result.values()) {
    s.percentage = s.total ? s.visited / s.total : 0;
  }
  return result;
}

export function globalStats(state) {
  const total = state.stations.length;
  const visited = state.visits.size;
  let first = null;
  let last = null;
  for (const v of state.visits.values()) {
    if (first === null || v.visitedAt < first) first = v.visitedAt;
    if (last === null || v.visitedAt > last) last = v.visitedAt;
  }
  return {
    totalStations: total,
    totalVisited: visited,
    percentageGlobal: total ? visited / total : 0,
    firstVisit: first,
    lastVisit: last,
    perLine: perLineStats(state),
  };
}
