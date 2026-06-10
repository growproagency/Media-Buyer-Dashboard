"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const money = (n) =>
  n == null ? "—" : "$" + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function Page() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editPassword, setEditPassword] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/dashboard", { cache: "no-store" });
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const config = data?.config || {};
  const buyers = data?.buyers || [];

  async function addBuyer() {
    await fetch("/api/buyers", {
      method: "POST",
      headers: headers(editPassword),
      body: JSON.stringify({ name: "New Buyer" }),
    });
    load();
  }

  return (
    <div className="wrap">
      <div className="topbar">
        <div>
          <h1>Media Buyers · Meta Performance</h1>
        </div>
        <div className="controls">
          <span className={"pill " + (config.metaConnected ? "on" : "off")}>
            Meta {config.metaConnected ? "live" : "manual"}
          </span>
          <span className={"pill " + (config.clickupConnected ? "on" : "off")}>
            ClickUp {config.clickupConnected ? "on" : "off"}
          </span>
          <span className={"pill " + (config.dbConnected ? "on" : "off")}>
            {config.dbConnected ? "saving on" : "no database"}
          </span>
          {config.datePreset && <span className="pill">{config.datePreset.replace("_", " ")}</span>}
        </div>
      </div>
      <p className="subtitle">
        Numbers pull from Meta where an ad account is set; otherwise they show the last manual entry.
        Anyone with the link can {config.editProtected ? "view; editing needs the team password." : "view and edit."}
      </p>

      {!loading && !config.dbConnected && (
        <div className="banner">
          No database is connected yet, so edits won&apos;t save. Add a <code>DATABASE_URL</code> (see the README)
          and redeploy to turn on shared, persistent editing.
        </div>
      )}

      {config.editProtected && (
        <div className="row" style={{ marginBottom: 14 }}>
          <span className="muted">Edit password:</span>
          <input
            type="password"
            value={editPassword}
            onChange={(e) => setEditPassword(e.target.value)}
            placeholder="enter to edit"
            style={{
              background: "var(--panel-2)",
              border: "1px solid var(--line)",
              color: "var(--ink)",
              borderRadius: 8,
              padding: "6px 10px",
            }}
          />
        </div>
      )}

      {loading ? (
        <div className="empty">Loading…</div>
      ) : buyers.length === 0 ? (
        <div className="empty">
          No buyers yet. <button className="primary" onClick={addBuyer}>Add the first buyer</button>
        </div>
      ) : (
        <>
          <div className="grid">
            {buyers.map((b) => (
              <BuyerCard key={b.id} buyer={b} editPassword={editPassword} onChanged={load} />
            ))}
          </div>
          <div style={{ marginTop: 18 }}>
            <button onClick={addBuyer}>+ Add buyer</button>
          </div>
        </>
      )}
    </div>
  );
}

function headers(pw) {
  const h = { "Content-Type": "application/json" };
  if (pw) h["x-edit-password"] = pw;
  return h;
}

function cpaClass(cpa, target) {
  if (cpa == null || target == null) return "";
  if (cpa <= target) return "good";
  if (cpa <= target * 1.15) return "warn";
  return "bad";
}

function BuyerCard({ buyer, editPassword, onChanged }) {
  const [b, setB] = useState(buyer);
  const [saveState, setSaveState] = useState(""); // "", "saving", "saved", "error"
  const [showSettings, setShowSettings] = useState(false);
  const timer = useRef(null);

  useEffect(() => setB(buyer), [buyer]);

  const save = useCallback(
    (patch) => {
      setSaveState("saving");
      clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        try {
          const res = await fetch("/api/buyers", {
            method: "PATCH",
            headers: headers(editPassword),
            body: JSON.stringify({ id: b.id, ...patch }),
          });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            setSaveState("error");
            console.warn(j.error);
            return;
          }
          setSaveState("saved");
          setTimeout(() => setSaveState(""), 1500);
        } catch {
          setSaveState("error");
        }
      }, 600);
    },
    [b.id, editPassword]
  );

  function field(key, value) {
    setB((cur) => ({ ...cur, [key]: value }));
    save({ [key]: value });
  }

  async function remove() {
    if (!confirm(`Delete ${b.name}?`)) return;
    await fetch(`/api/buyers?id=${encodeURIComponent(b.id)}`, {
      method: "DELETE",
      headers: headers(editPassword),
    });
    onChanged();
  }

  const cc = cpaClass(b.cpa, b.target_cpa);

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <input
            className="buyer"
            style={{ background: "transparent", border: "none", color: "var(--ink)", width: "100%" }}
            value={b.name || ""}
            onChange={(e) => field("name", e.target.value)}
          />
          <div className="acct">
            {b.ad_account_id ? `act_${String(b.ad_account_id).replace(/^act_/, "")}` : "no ad account set"}
            {" · "}
            <select
              value={b.status || "Active"}
              onChange={(e) => field("status", e.target.value)}
              style={{ background: "transparent", color: "var(--muted)", border: "none" }}
            >
              <option>Active</option>
              <option>Watch</option>
              <option>Paused</option>
            </select>
          </div>
        </div>
        <button title="Card settings" onClick={() => setShowSettings((s) => !s)}>⚙</button>
      </div>

      <div className="metrics">
        <div className="metric">
          <label>Spend{b.meta_live ? " · live" : ""}</label>
          {b.meta_live ? (
            <div className="val">{money(b.spend)}</div>
          ) : (
            <input
              type="number"
              value={b.manual_spend ?? ""}
              placeholder="0"
              onChange={(e) => field("manual_spend", e.target.value)}
            />
          )}
        </div>
        <div className={"metric cpa " + cc}>
          <label>CPA / CPL{b.meta_live ? " · live" : ""}</label>
          {b.meta_live ? (
            <div className="val">{money(b.cpa)}</div>
          ) : (
            <input
              type="number"
              value={b.manual_cpa ?? ""}
              placeholder="0"
              onChange={(e) => field("manual_cpa", e.target.value)}
            />
          )}
        </div>
        <div className="metric">
          <label>Target CPA</label>
          <input
            type="number"
            value={b.target_cpa ?? ""}
            placeholder="set goal"
            onChange={(e) => field("target_cpa", e.target.value)}
          />
        </div>
        <div className="metric">
          <label>Conversions</label>
          <div className="val">{b.conversions ?? "—"}</div>
        </div>
      </div>

      {b.meta_error && <div className="banner">Meta: {b.meta_error}</div>}

      {b.clickup ? (
        <div className="context">
          <div className="ctx-title">{b.clickup.listName}</div>
          {b.clickup.tasks?.length ? (
            <ul>
              {b.clickup.tasks.map((t, i) => (
                <li key={i}>
                  {t.url ? <a href={t.url} target="_blank" rel="noreferrer">{t.name}</a> : t.name}
                  {t.status ? ` — ${t.status}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <span>No open tasks.</span>
          )}
        </div>
      ) : (
        b.clickup_error && <div className="context">ClickUp: {b.clickup_error}</div>
      )}

      <div className="notes">
        <textarea
          value={b.notes || ""}
          placeholder="Notes — budget changes, creative tests, account context…"
          onChange={(e) => field("notes", e.target.value)}
        />
      </div>

      {showSettings && (
        <div className="context">
          <div className="ctx-title">Card settings</div>
          <div className="row" style={{ marginTop: 6 }}>
            <span className="muted" style={{ width: 110 }}>Meta ad account</span>
            <input
              value={b.ad_account_id || ""}
              placeholder="e.g. 1234567890"
              onChange={(e) => field("ad_account_id", e.target.value)}
              style={inp}
            />
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <span className="muted" style={{ width: 110 }}>ClickUp list ID</span>
            <input
              value={b.clickup_list_id || ""}
              placeholder="e.g. 901234567"
              onChange={(e) => field("clickup_list_id", e.target.value)}
              style={inp}
            />
          </div>
          <div style={{ marginTop: 10 }}>
            <button onClick={remove} style={{ borderColor: "var(--bad)", color: "var(--bad)" }}>
              Delete buyer
            </button>
          </div>
        </div>
      )}

      <div className="card-foot">
        {b.ads_manager_url ? (
          <a className="ads-link" href={b.ads_manager_url} target="_blank" rel="noreferrer">
            ↗ Open in Ads Manager
          </a>
        ) : (
          <span className="muted" style={{ fontSize: 13 }}>Add an ad account for the link</span>
        )}
        <span className={"save-state " + saveState}>
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved ✓" : saveState === "error" ? "Not saved" : ""}
        </span>
      </div>
    </div>
  );
}

const inp = {
  flex: 1,
  background: "var(--panel)",
  border: "1px solid var(--line)",
  color: "var(--ink)",
  borderRadius: 8,
  padding: "5px 8px",
};
