// File: src/OutageConsumersDashboard.jsx (updated colors)
// Affected slice = red, Healthy = green. Works with recharts@^2.

import React, { useMemo, useState } from "react";
import Papa from "papaparse";
import { PieChart, Pie, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";

export default function OutageConsumersDashboard() {
  const [stations, setStations] = useState([]);
  const [q, setQ] = useState("");

  const totals = useMemo(() => {
    const total = stations.reduce((s, x) => s + (Number(x.consumers) || 0), 0);
    const affected = stations.filter((s) => s.isOut).reduce((s, x) => s + (Number(x.consumers) || 0), 0);
    const healthy = total - affected;
    const pct = total > 0 ? Math.round(((affected / total) * 100) * 10) / 10 : 0;
    return { total, affected, healthy, pct };
  }, [stations]);

  // Add explicit colors to each datum as a fallback, and also map to <Cell />
  const chartData = [
    { name: "Affected", value: totals.affected, fill: "#4b0c0cff" }, // red-600
    { name: "Healthy", value: totals.healthy, fill: "#a4a9caff" },  // green-600
  ];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return stations;
    return stations.filter((s) => s.name.toLowerCase().includes(needle));
  }, [stations, q]);

  function importCsv(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data, errors }) => {
        if (errors?.length) console.warn("CSV parse warnings:", errors.slice(0, 3));
        const normalized = (data || [])
          .map((row) => ({
            id: row.id?.toString().trim() || crypto.randomUUID(),
            name: (row.name ?? row.station ?? row.substation ?? "").toString().trim(),
            consumers: Number(row.consumers ?? row.consumer_count ?? row.count ?? 0),
            isOut: String(row.isOut ?? row.outage ?? "false").trim().toLowerCase().startsWith("t"),
          }))
          .filter((r) => r.name && Number.isFinite(r.consumers));
        setStations(normalized);
      },
    });
    e.target.value = "";
  }

  function toggle(id) {
    setStations((prev) => prev.map((s) => (s.id === id ? { ...s, isOut: !s.isOut } : s)));
  }

  function setAll(out) {
    setStations((prev) => prev.map((s) => ({ ...s, isOut: out })));
  }

  function exportCsv() {
    const rows = stations.map(({ id, name, consumers, isOut }) => ({ id, name, consumers, isOut }));
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "stations.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ minHeight: "100vh", padding: 16, background: "#f8fafc" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <header style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0 }}>Outage Consumers Dashboard</h1>
            <div style={{ color: "#475569" }}>Import your substations from CSV, then toggle outages to see affected consumers.</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input id="csvFile" type="file" accept=".csv,text/csv" onChange={importCsv} style={{ display: "none" }} />
            <label htmlFor="csvFile" style={btnOutline}>Import CSV</label>
            <button onClick={exportCsv} style={btn}>Export CSV</button>
            <button onClick={() => setAll(true)} style={btnOutline}>Mark All OFF</button>
            <button onClick={() => setAll(false)} style={btnOutline}>Mark All ON</button>
          </div>
        </header>

        <section style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16, marginTop: 16 }}>
          <div style={card}>
            <div style={cardHeader}>Affected vs Total</div>
            <div style={{ padding: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Stat label="Affected consumers" value={totals.affected} badge={`${totals.pct}%`} emphasize />
                <Stat label="Total consumers" value={totals.total} subLabel={`Healthy: ${totals.healthy.toLocaleString()}`} />
              </div>
              <div style={{ height: 300, marginTop: 16 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => Number(v).toLocaleString()} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div style={card}>
            <div style={{ ...cardHeader, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>Substations</span>
              <input
                placeholder="Search substations…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                style={{ padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 8 }}
              />
            </div>
            <div style={{ padding: 16 }}>
              {filtered.length === 0 ? (
                <div style={{ color: "#64748b", padding: 24, textAlign: "center" }}>No substations to show. Import a CSV to begin.</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
                  {filtered.map((s) => (
                    <div key={s.id} style={{ ...subCard, borderColor: s.isOut ? "#fecaca" : "#bbf7d0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
                          <div style={{ fontSize: 12, color: "#64748b" }}>{Number(s.consumers).toLocaleString()} consumers</div>
                        </div>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                          <span style={{ color: "#475569" }}>{s.isOut ? "OFF" : "ON"}</span>
                          <input type="checkbox" checked={s.isOut} onChange={() => toggle(s.id)} />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <section style={{ marginTop: 16 }}>
          <div style={card}>
            <div style={cardHeader}>CSV format</div>
            <div style={{ padding: 16, fontSize: 14, color: "#334155" }}>
              <p>Required columns: <code>name, consumers</code>. Optional: <code>id, isOut</code>. Accepted aliases: <code>station</code> or <code>substation</code> for name; <code>consumer_count</code> or <code>count</code> for consumers.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, subLabel, badge, emphasize }) {
  return (
    <div>
      <div style={{ fontSize: 32, fontWeight: 700, lineHeight: 1, color: emphasize ? "#dc2626" : "inherit" }}>
        {Number(value).toLocaleString()}
      </div>
      <div style={{ fontSize: 12, color: "#64748b" }}>{label}</div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
        {badge && (
          <span style={{ fontSize: 12, border: "1px solid #e2e8f0", borderRadius: 999, padding: "2px 8px" }}>{badge}</span>
        )}
        {subLabel && <span style={{ fontSize: 12, color: "#334155" }}>{subLabel}</span>}
      </div>
    </div>
  );
}

const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" };
const cardHeader = { padding: 16, fontWeight: 600, borderBottom: "1px solid #e2e8f0", background: "#f1f5f9" };
const subCard = { border: "2px solid transparent", borderRadius: 12, padding: 12, background: "#fff" };
const btn = { padding: "8px 12px", borderRadius: 8, border: "1px solid #0ea5e9", background: "#0ea5e9", color: "#fff", cursor: "pointer" };
const btnOutline = { padding: "8px 12px", borderRadius: 8, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", cursor: "pointer" };
