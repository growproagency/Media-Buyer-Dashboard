/**
 * recommendation-rules.ts
 * ---------------------------------------------------------------------------
 * Starter config for the MBT Recommendations module (see spec Section 6.7).
 *
 * DESIGN (locked with Destiny):
 *   - Recommendations are MEDIA-BUYER-INITIATED. The buyer asks for a read on an
 *     account; the engine evaluates the `onDemand` rules against that account's
 *     current signal and returns a ranked list of suggestions. Nothing here fires
 *     on its own EXCEPT the passive warnings below.
 *   - There is ONE always-on PASSIVE WARNING: no leads for 3+ days on spend. It
 *     surfaces without anyone asking, because it is time-sensitive.
 *   - Action surface is limited to three levers: AUDIENCE, OFFER/SEASONAL,
 *     CREATIVE. Budget moves are intentionally OUT of scope for this engine.
 *   - Sensitivity = BALANCED: fire on clear signals AND early warnings (amber),
 *     not only on red/WTF.
 *   - Default evaluation window = MTD compared against trailing 7 days.
 *
 * This file is pure config + pure predicates. The engine that loads it
 * (src/lib/recommendations.ts) owns fetching the signal and rendering output.
 * Keep all data access OUT of this file so the rules stay unit-testable.
 */

// ---------------------------------------------------------------------------
// Shared enums / knobs
// ---------------------------------------------------------------------------

/** The three levers a recommendation is allowed to pull. */
export type ActionCategory = "AUDIENCE" | "OFFER_SEASONAL" | "CREATIVE";

/** How a rule reaches the buyer. */
export type TriggerMode =
  | "ON_DEMAND" // evaluated when a buyer requests a read on the account
  | "PASSIVE_WARNING"; // surfaced automatically, time-sensitive

/** Ordering / urgency for the UI. Higher sorts first. */
export type Severity = "INFO" | "WATCH" | "ACT_NOW";

const SEVERITY_RANK: Record<Severity, number> = {
  ACT_NOW: 3,
  WATCH: 2,
  INFO: 1,
};

/**
 * BALANCED sensitivity profile. The engine reads these instead of hard-coding
 * numbers in predicates, so flipping the whole tool to Conservative/Aggressive
 * later is a one-object change.
 */
export const SENSITIVITY = {
  profile: "BALANCED" as const,

  // Fire creative/offer/audience early-warnings once CPL drifts into amber, not
  // only at red. Bands mirror the WTF metric in spec Section 4.5.
  cplWarnBandAtOrAbove: "YELLOW" as WtfBand, // amber-and-up = surface a WATCH
  cplActBandAtOrAbove: "RED" as WtfBand, // red/WTF = ACT_NOW

  // Trailing-7d lead drop vs. the prior comparable stretch that counts as fatigue.
  leadDropPct: 0.25, // leads down >=25% => creative fatigue WATCH

  // Frequency ceiling (trailing 7d) that suggests audience saturation.
  frequencyCeiling: 2.5,

  // Passive "no leads on spend" warning threshold, in days.
  noLeadsWarnDays: 3,

  // Minimum spend in the window before lead-based rules are trustworthy. Below
  // this we stay quiet to avoid noise on tiny/just-launched accounts.
  minSpendForLeadRules: 100,
} as const;

/** Default evaluation window for every rule unless it overrides. */
export const EVAL_WINDOW = {
  primary: "MTD" as const,
  comparison: "TRAILING_7D" as const,
} as const;

// ---------------------------------------------------------------------------
// WTF bands (kept in sync with spec Section 4.5 — single source of truth there;
// duplicated here only as the type the rules compare against)
// ---------------------------------------------------------------------------

export type WtfBand = "GREEN" | "YELLOW" | "ORANGE" | "RED" | "WTF";

const BAND_ORDER: WtfBand[] = ["GREEN", "YELLOW", "ORANGE", "RED", "WTF"];

/** True if `band` is at or worse than `floor` (e.g. atOrWorse('ORANGE','YELLOW')). */
export function atOrWorse(band: WtfBand, floor: WtfBand): boolean {
  return BAND_ORDER.indexOf(band) >= BAND_ORDER.indexOf(floor);
}

// ---------------------------------------------------------------------------
// The signal a rule sees. The engine builds this from the snapshot cache +
// ClickUp context + seasonal calendar BEFORE calling any rule. Rules never fetch.
// ---------------------------------------------------------------------------

export interface AccountSignal {
  accountId: string;
  schoolName: string;

  // Performance (already normalized by leads.ts) for the primary window (MTD).
  spend: number;
  leads: number;
  cpl: number | null; // null when leads === 0
  cplBand: WtfBand;

  // Comparison window (trailing 7d) for drift/fatigue detection.
  trailing7d: {
    leads: number;
    priorLeads: number; // the 7 days before that, for the drop comparison
    frequency: number | null;
    cpl: number | null;
  };

  // Time-sensitive passive signal.
  daysWithSpendNoLeads: number;

  // Context pulled from ClickUp (canonical) + the seasonal calendar.
  context: {
    currentOffer: string | null;
    currentAudience: string | null;
    // From src/config/seasonal-calendar.ts via the Copy Audit derivation.
    seasonalThemeActive: string | null; // e.g. "Back to School"
    offerMatchesSeason: boolean; // false => offer looks off-season/stale
    daysSinceCreativeRefresh: number | null;
  };
}

// ---------------------------------------------------------------------------
// What a rule produces.
// ---------------------------------------------------------------------------

export interface Recommendation {
  ruleId: string;
  category: ActionCategory;
  mode: TriggerMode;
  severity: Severity;
  title: string; // short, scannable
  detail: string; // one or two sentences the buyer reads
  /** Why it fired — surfaced for trust ("we flagged this because…"). */
  evidence: string;
}

export interface Rule {
  id: string;
  category: ActionCategory;
  mode: TriggerMode;
  /** Cheap guard so the engine can skip rules that don't apply. */
  appliesTo?: (s: AccountSignal) => boolean;
  /** Does this rule fire for this signal? */
  when: (s: AccountSignal) => boolean;
  /** Build the recommendation. Only called when `when` is true. */
  build: (s: AccountSignal) => Omit<Recommendation, "ruleId" | "category" | "mode">;
}

const hasTrustworthySpend = (s: AccountSignal) =>
  s.spend >= SENSITIVITY.minSpendForLeadRules;

// ---------------------------------------------------------------------------
// PASSIVE WARNINGS — surface on their own, no buyer prompt needed.
// ---------------------------------------------------------------------------

export const PASSIVE_RULES: Rule[] = [
  {
    id: "no-leads-3d",
    category: "CREATIVE", // default lever to investigate; engine may reroute
    mode: "PASSIVE_WARNING",
    appliesTo: hasTrustworthySpend,
    when: (s) => s.daysWithSpendNoLeads >= SENSITIVITY.noLeadsWarnDays,
    build: (s) => ({
      severity: "ACT_NOW",
      title: `No leads for ${s.daysWithSpendNoLeads} days on active spend`,
      detail:
        "This account has spent without producing a single lead for 3+ days. " +
        "Check delivery, creative, and the offer/landing path before more budget burns.",
      evidence: `${money(s.spend)} spent, 0 leads across ${s.daysWithSpendNoLeads} days.`,
    }),
  },
];

// ---------------------------------------------------------------------------
// ON-DEMAND RULES — evaluated when a buyer requests a read on the account.
// Limited to the three approved levers: AUDIENCE, OFFER_SEASONAL, CREATIVE.
// ---------------------------------------------------------------------------

export const ON_DEMAND_RULES: Rule[] = [
  // ---- OFFER / SEASONAL -------------------------------------------------
  {
    id: "offer-off-season",
    category: "OFFER_SEASONAL",
    mode: "ON_DEMAND",
    when: (s) =>
      s.context.seasonalThemeActive != null &&
      s.context.offerMatchesSeason === false,
    build: (s) => ({
      severity: "WATCH",
      title: `Offer may be off-season (now: ${s.context.seasonalThemeActive})`,
      detail:
        `The live offer ${q(s.context.currentOffer)} doesn't match the active ` +
        `seasonal theme. Consider swapping to a ${s.context.seasonalThemeActive} angle.`,
      evidence: `Seasonal calendar: ${s.context.seasonalThemeActive} is active; offer flagged as non-matching.`,
    }),
  },

  // ---- CREATIVE ---------------------------------------------------------
  {
    id: "creative-fatigue-cpl-drift",
    category: "CREATIVE",
    mode: "ON_DEMAND",
    appliesTo: hasTrustworthySpend,
    when: (s) => atOrWorse(s.cplBand, SENSITIVITY.cplWarnBandAtOrAbove),
    build: (s) => ({
      severity: atOrWorse(s.cplBand, SENSITIVITY.cplActBandAtOrAbove)
        ? "ACT_NOW"
        : "WATCH",
      title: `CPL in ${s.cplBand} — refresh creative`,
      detail:
        "Cost per lead has drifted into a flagged band. New creative angles are " +
        "usually the fastest lever before touching audience or offer.",
      evidence: `MTD CPL ${money(s.cpl)} (band ${s.cplBand}).`,
    }),
  },
  {
    id: "creative-lead-drop",
    category: "CREATIVE",
    mode: "ON_DEMAND",
    appliesTo: hasTrustworthySpend,
    when: (s) => {
      const { leads, priorLeads } = s.trailing7d;
      if (priorLeads <= 0) return false;
      return (priorLeads - leads) / priorLeads >= SENSITIVITY.leadDropPct;
    },
    build: (s) => {
      const { leads, priorLeads } = s.trailing7d;
      const dropPct = Math.round(((priorLeads - leads) / priorLeads) * 100);
      return {
        severity: "WATCH",
        title: `Leads down ${dropPct}% week-over-week`,
        detail:
          "Trailing-7d lead volume fell sharply versus the prior week — a classic " +
          "creative-fatigue signal. Rotate in fresh creative before CPL climbs.",
        evidence: `Trailing 7d: ${leads} leads vs ${priorLeads} prior.`,
      };
    },
  },

  // ---- AUDIENCE ---------------------------------------------------------
  {
    id: "audience-saturation",
    category: "AUDIENCE",
    mode: "ON_DEMAND",
    appliesTo: hasTrustworthySpend,
    when: (s) =>
      s.trailing7d.frequency != null &&
      s.trailing7d.frequency >= SENSITIVITY.frequencyCeiling,
    build: (s) => ({
      severity: "WATCH",
      title: `Audience saturating (freq ${s.trailing7d.frequency?.toFixed(1)})`,
      detail:
        "Frequency is high enough that the same people are seeing ads repeatedly. " +
        "Expand or rebuild the audience (ties into the Audience Builder module).",
      evidence: `Trailing-7d frequency ${s.trailing7d.frequency?.toFixed(2)} ≥ ${SENSITIVITY.frequencyCeiling}.`,
    }),
  },
];

// ---------------------------------------------------------------------------
// Engine entrypoint helpers (the actual engine lives in src/lib/recommendations.ts;
// these are convenience evaluators kept here so the rules + their evaluation
// stay together and unit-testable).
// ---------------------------------------------------------------------------

function evaluate(rules: Rule[], s: AccountSignal): Recommendation[] {
  return rules
    .filter((r) => (r.appliesTo ? r.appliesTo(s) : true))
    .filter((r) => r.when(s))
    .map((r) => ({ ruleId: r.id, category: r.category, mode: r.mode, ...r.build(s) }))
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}

/** Always-on warnings — call on every snapshot refresh, not just on request. */
export function evaluatePassive(s: AccountSignal): Recommendation[] {
  return evaluate(PASSIVE_RULES, s);
}

/** Buyer-initiated read — call when a buyer asks for recommendations. */
export function evaluateOnDemand(s: AccountSignal): Recommendation[] {
  return evaluate(ON_DEMAND_RULES, s);
}

// ---------------------------------------------------------------------------
// tiny local formatters (kept inline so this file has no imports → trivial to test)
// ---------------------------------------------------------------------------

function money(n: number | null): string {
  return n == null ? "—" : "$" + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function q(s: string | null): string {
  return s ? `“${s}”` : "(none set)";
}
