import { NextResponse } from "next/server";
import { getBuyers } from "../../../lib/db";
import { getMetaInsights, adsManagerUrl } from "../../../lib/meta";
import { getClickUpContext } from "../../../lib/clickup";

export const dynamic = "force-dynamic";

export async function GET() {
  const buyers = await getBuyers();

  const enriched = await Promise.all(
    buyers.map(async (b) => {
      const [meta, clickup] = await Promise.all([
        getMetaInsights(b.ad_account_id),
        getClickUpContext(b.clickup_list_id),
      ]);

      // Prefer live Meta numbers; fall back to manually-entered values.
      const liveOk = meta && !meta.error;
      const spend = liveOk && meta.spend != null ? meta.spend : numOrNull(b.manual_spend);
      const cpa = liveOk && meta.cpa != null ? meta.cpa : numOrNull(b.manual_cpa);

      return {
        ...b,
        target_cpa: numOrNull(b.target_cpa),
        manual_spend: numOrNull(b.manual_spend),
        manual_cpa: numOrNull(b.manual_cpa),
        spend,
        cpa,
        conversions: liveOk ? meta.conversions ?? null : null,
        meta_live: !!liveOk,
        meta_error: meta?.error || null,
        clickup: clickup && !clickup.error ? clickup : null,
        clickup_error: clickup?.error || null,
        ads_manager_url: adsManagerUrl(b.ad_account_id),
      };
    })
  );

  const config = {
    metaConnected: !!process.env.META_ACCESS_TOKEN,
    clickupConnected: !!process.env.CLICKUP_API_TOKEN,
    dbConnected: !!process.env.DATABASE_URL,
    editProtected: !!process.env.EDIT_PASSWORD,
    datePreset: process.env.META_DATE_PRESET || "last_7d",
  };

  return NextResponse.json({ buyers: enriched, config });
}

function numOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
