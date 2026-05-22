import { getMeta, setMeta } from "../db.js";
import { showToast } from "../components/toast.js";

export function getBadgeDefinitions(state) {
  const defs = [
    {
      id: "first-step",
      title: "Premier pas",
      description: "Première station visitée",
      icon: "👣",
      check: (s) => s.totalVisited >= 1,
    },
    {
      id: "explorer-10",
      title: "Explorateur",
      description: "10 stations visitées",
      icon: "🗺️",
      check: (s) => s.totalVisited >= 10,
    },
    {
      id: "explorer-50",
      title: "Aventurier",
      description: "50 stations visitées",
      icon: "🧭",
      check: (s) => s.totalVisited >= 50,
    },
    {
      id: "explorer-100",
      title: "Centenaire",
      description: "100 stations visitées",
      icon: "🏅",
      check: (s) => s.totalVisited >= 100,
    },
    {
      id: "explorer-200",
      title: "Bicentenaire",
      description: "200 stations visitées",
      icon: "🥇",
      check: (s) => s.totalVisited >= 200,
    },
    {
      id: "parisian-pride",
      title: "Fierté parisienne",
      description: "50 % de toutes les stations",
      icon: "🗼",
      check: (s) => s.percentageGlobal >= 0.5,
    },
    {
      id: "completionist",
      title: "Le Métronome",
      description: "Toutes les stations visitées",
      icon: "🏆",
      check: (s) => s.totalVisited >= s.totalStations && s.totalStations > 0,
    },
    {
      id: "all-interchange",
      title: "Roi des correspondances",
      description: "Toutes les stations de 3+ lignes",
      icon: "🔁",
      check: (s, ctx) => {
        const big = ctx.state.stations.filter(st => st.lineIds.length >= 3);
        if (!big.length) return false;
        return big.every(st => ctx.state.visits.has(st.id));
      },
    },
    {
      id: "photographer",
      title: "Photographe",
      description: "20 photos souvenirs",
      icon: "📸",
      check: (_s, ctx) => {
        let count = 0;
        for (const v of ctx.state.visits.values()) if (v.photo) count++;
        return count >= 20;
      },
    },
    {
      id: "early-bird",
      title: "Lève-tôt",
      description: "Une visite avant 7 h",
      icon: "🌅",
      check: (_s, ctx) => {
        for (const v of ctx.state.visits.values()) {
          const h = new Date(v.visitedAt).getHours();
          if (h >= 0 && h < 7) return true;
        }
        return false;
      },
    },
    {
      id: "night-owl",
      title: "Couche-tard",
      description: "Une visite après 22 h",
      icon: "🌙",
      check: (_s, ctx) => {
        for (const v of ctx.state.visits.values()) {
          const h = new Date(v.visitedAt).getHours();
          if (h >= 22) return true;
        }
        return false;
      },
    },
  ];

  // One badge per line
  for (const line of state.lines) {
    defs.push({
      id: `line-master-${line.id}`,
      title: `Maître ${line.name}`,
      description: `Toutes les stations de la ${line.name}`,
      icon: "🚇",
      lineId: line.id,
      check: (_s, ctx) => {
        const onLine = ctx.state.stations.filter(st => st.lineIds.includes(line.id));
        if (!onLine.length) return false;
        return onLine.every(st => ctx.state.visits.has(st.id));
      },
    });
  }
  return defs;
}

export async function evaluateBadges(state, summary, opts = {}) {
  const defs = getBadgeDefinitions(state);
  const ctx = { state };
  const newly = [];
  const statuses = new Map();
  for (const def of defs) {
    const stored = await getMeta(`badge:${def.id}`);
    const unlocked = def.check(summary, ctx);
    if (unlocked && !stored?.unlocked) {
      const record = { unlocked: true, date: Date.now() };
      await setMeta(`badge:${def.id}`, record);
      newly.push(def);
      statuses.set(def.id, record);
    } else if (!unlocked && stored?.unlocked) {
      const record = { unlocked: false, date: null };
      await setMeta(`badge:${def.id}`, record);
      statuses.set(def.id, record);
    } else {
      statuses.set(def.id, stored || { unlocked: false, date: null });
    }
  }
  if (opts.toast && newly.length) {
    for (const b of newly) {
      showToast(`Badge débloqué : ${b.title}`, { variant: "badge", icon: b.icon });
    }
  }
  return { defs, statuses, newly };
}
