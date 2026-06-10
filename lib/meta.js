// Pulls Spend + cost-per-conversion (CPA/CPL) from the Meta Marketing API.
// If no token or ad account is configured, returns null so the UI falls back
// to the manually-entered numbers stored in the database.

const GRAPH = "https://graph.facebook.com/v19.0";

export async function getMetaInsights(adAccountId) {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token || !adAccountId) return null;

  const acct = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  const preset = process.env.META_DATE_PRESET || "last_7d";
  const conversionAction = process.env.META_CONVERSION_ACTION || "lead";

  const params = new URLSearchParams({
    access_token: token,
    date_preset: preset,
    fields: "spend,cost_per_action_type,actions",
    level: "account",
  });

  const url = `${GRAPH}/${acct}/insights?${params.toString()}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    const json = await res.json();
    if (json.error) {
      return { error: json.error.message };
    }
    const row = json.data && json.data[0];
    if (!row) return { spend: 0, cpa: null, conversions: 0, source: "meta" };

    const spend = Number(row.spend || 0);

    // cost_per_action_type is an array of { action_type, value }
    let cpa = null;
    const cpaRow = (row.cost_per_action_type || []).find(
      (a) => a.action_type === conversionAction
    );
    if (cpaRow) cpa = Number(cpaRow.value);

    let conversions = 0;
    const convRow = (row.actions || []).find(
      (a) => a.action_type === conversionAction
    );
    if (convRow) conversions = Number(convRow.value);

    return { spend, cpa, conversions, source: "meta" };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

export function adsManagerUrl(adAccountId) {
  if (!adAccountId) return null;
  const id = adAccountId.replace(/^act_/, "");
  return `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${id}`;
}
