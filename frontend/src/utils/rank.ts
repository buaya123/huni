export type Rank = {
  level: number;
  title: string;
  exp: number;
  exp_current_level: number;
  exp_next_level: number;
  progress_percent: number;
};

const BASE: readonly number[] = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200];
const TITLES: ReadonlyArray<[number, string]> = [
  [1, "New Neighbor"],
  [5, "Resident"],
  [10, "Regular"],
  [20, "Contributor"],
  [30, "Local Guide"],
  [40, "Community Builder"],
  [50, "Town Champion"],
  [60, "Community Pillar"],
  [75, "Huni Elder"],
  [100, "Legend"],
];

function buildThresholds(maxLevel = 100): number[] {
  const t: number[] = [...BASE];
  let step = t[t.length - 1] - t[t.length - 2];
  while (t.length < maxLevel) {
    step = Math.round(step * 1.15);
    t.push(t[t.length - 1] + step);
  }
  return t;
}

const THRESHOLDS = buildThresholds(100);

export function rankForExp(rawExp: number | null | undefined): Rank {
  const exp = Math.max(0, Math.floor(Number(rawExp) || 0));
  let level = 1;
  for (let i = 0; i < THRESHOLDS.length; i += 1) {
    if (exp >= THRESHOLDS[i]) level = i + 1;
    else break;
  }
  let title = TITLES[0][1];
  for (const [minLvl, name] of TITLES) {
    if (level >= minLvl) title = name;
  }
  const expAtLevel = THRESHOLDS[level - 1] ?? THRESHOLDS[THRESHOLDS.length - 1];
  const expNext = THRESHOLDS[level] ?? expAtLevel;
  const span = Math.max(1, expNext - expAtLevel);
  const progress = level < THRESHOLDS.length ? Math.round(((exp - expAtLevel) / span) * 100) : 100;
  return {
    level,
    title,
    exp,
    exp_current_level: expAtLevel,
    exp_next_level: expNext,
    progress_percent: Math.max(0, Math.min(100, progress)),
  };
}

export const TITLE_TABLE = TITLES.map(([lvl, name]) => ({ level: lvl, title: name }));
