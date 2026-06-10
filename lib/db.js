import { Pool } from "pg";

// One shared pool across hot-reloads / serverless invocations.
let pool = global.__pgPool;
if (!pool) {
  if (!process.env.DATABASE_URL) {
    console.warn("[db] DATABASE_URL not set — edits will not persist.");
  }
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined,
    max: 5,
  });
  global.__pgPool = pool;
}

let initPromise = null;

// Create the table on first use and seed a couple of example buyers so the
// page is never blank on a fresh deploy.
export function ensureSchema() {
  if (!process.env.DATABASE_URL) return Promise.resolve();
  if (!initPromise) {
    initPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS buyers (
          id              TEXT PRIMARY KEY,
          name            TEXT NOT NULL,
          ad_account_id   TEXT,            -- Meta ad account, e.g. 1234567890
          clickup_list_id TEXT,            -- ClickUp list for account context
          target_cpa      NUMERIC,         -- editable goal
          manual_spend    NUMERIC,         -- used when Meta isn't connected
          manual_cpa      NUMERIC,         -- used when Meta isn't connected
          status          TEXT DEFAULT 'Active',
          notes           TEXT DEFAULT '',
          sort_order      INTEGER DEFAULT 0,
          updated_at      TIMESTAMPTZ DEFAULT now()
        );
      `);
      const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM buyers");
      if (rows[0].n === 0) {
        await pool.query(
          `INSERT INTO buyers (id, name, ad_account_id, clickup_list_id, target_cpa, manual_spend, manual_cpa, status, notes, sort_order)
           VALUES
           ('demo-1','Example Buyer A','', '', 45, 1200, 38, 'Active', 'Replace me — edit ad_account_id to pull live Meta numbers.', 1),
           ('demo-2','Example Buyer B','', '', 60, 2400, 71, 'Watch',  'CPA trending over target this week.', 2)`
        );
      }
    })();
  }
  return initPromise;
}

export async function getBuyers() {
  await ensureSchema();
  if (!process.env.DATABASE_URL) return [];
  const { rows } = await pool.query(
    `SELECT * FROM buyers ORDER BY sort_order ASC, name ASC`
  );
  return rows;
}

const EDITABLE = new Set([
  "name",
  "ad_account_id",
  "clickup_list_id",
  "target_cpa",
  "manual_spend",
  "manual_cpa",
  "status",
  "notes",
]);

export async function updateBuyer(id, patch) {
  await ensureSchema();
  const sets = [];
  const vals = [];
  let i = 1;
  for (const [k, v] of Object.entries(patch)) {
    if (!EDITABLE.has(k)) continue;
    sets.push(`${k} = $${i++}`);
    vals.push(v === "" ? null : v);
  }
  if (!sets.length) return null;
  sets.push(`updated_at = now()`);
  vals.push(id);
  const { rows } = await pool.query(
    `UPDATE buyers SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
    vals
  );
  return rows[0] || null;
}

export async function createBuyer({ name }) {
  await ensureSchema();
  const id = "b_" + Math.random().toString(36).slice(2, 9);
  const { rows } = await pool.query(
    `INSERT INTO buyers (id, name, sort_order)
     VALUES ($1, $2, COALESCE((SELECT MAX(sort_order) FROM buyers), 0) + 1)
     RETURNING *`,
    [id, name || "New Buyer"]
  );
  return rows[0];
}

export async function deleteBuyer(id) {
  await ensureSchema();
  await pool.query(`DELETE FROM buyers WHERE id = $1`, [id]);
}
