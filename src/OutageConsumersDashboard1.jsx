// File: src/OutageConsumersDashboard.jsx (dark mode)
// Dark theme UI and chart colors. Affected = bright red, Healthy = bright green.

import React, { useMemo, useState } from "react";
import Papa from "papaparse";
import { PieChart, Pie, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";

export default function OutageConsumersDashboard() {
  const [stations, setStations] = useState([]);
  const [q, setQ] = useState("");

  // Dark palette tokens
  const COLORS = {
    bg: "#0f172a",        // slate-900
    card: "#111827",      // gray-900
    border: "#334155",    // slate-600
    text: "#e5e7eb",      // gray-200
    subtext: "#94a3b8",   // slate-400
    accent: "#0ea5e9",    // sky-500
    accentBorder: "#38bdf8", // sky-400
    affected: "#ef4444",  // red-500
    healthy: "#22c55e",   // green-500
  };

  const totals = useMemo(() => {
    const total = stations.reduce((s, x) => s + (Number(x.consumers) || 0), 0);
    const affected = stations.filter((s) => s.isOut).reduce((s, x) => s + (Number(x.consumers) || 0), 0);
    const healthy = total - affected;
    const pct = total > 0 ? Math.round(((affected / total) * 100) * 10) / 10 : 0;
    return { total, affected, healthy, pct };
  }, [stations]);

  const chartData = [
    { name: "Affected", value: totals.affected },
    { name: "Healthy", value: totals.healthy },
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
    a.href = url;
    a.download = "stations.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ minHeight: "100vh", padding: 16, background: COLORS.bg, color: COLORS.text }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <header style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0 }}>Outage Consumers Dashboard</h1>
            <div style={{ color: COLORS.subtext }}>Import your substations from CSV, then toggle outages to see affected consumers.</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input id="csvFile" type="file" accept=".csv,text/csv" onChange={importCsv} style={{ display: "none" }} />
            <label htmlFor="csvFile" style={btnOutline(COLORS)}>Import CSV</label>
            <button onClick={exportCsv} style={btn(COLORS)}>Export CSV</button>
            <button onClick={() => setAll(true)} style={btnOutline(COLORS)}>Mark All OFF</button>
            <button onClick={() => setAll(false)} style={btnOutline(COLORS)}>Mark All ON</button>
          </div>
        </header>

        <section style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16, marginTop: 16 }}>
          <div style={card(COLORS)}>
            <div style={cardHeader(COLORS)}>Affected vs Total</div>
            <div style={{ padding: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Stat label="Affected consumers" value={totals.affected} badge={`${totals.pct}%`} emphasize color={COLORS} />
                <Stat label="Total consumers" value={totals.total} subLabel={`Healthy: ${totals.healthy.toLocaleString()}`} color={COLORS} />
              </div>
              <div style={{ height: 300, marginTop: 16 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={false}
                      isAnimationActive={false}
                    >
                      {chartData.map((entry, i) => (
                        <Cell key={`${entry.name}-${i}`} fill={entry.name === "Affected" ? COLORS.affected : COLORS.healthy} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v) => Number(v).toLocaleString()}
                      contentStyle={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                      itemStyle={{ color: COLORS.text }}
                      labelStyle={{ color: COLORS.subtext }}
                    />
                    <Legend wrapperStyle={{ color: COLORS.text }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div style={card(COLORS)}>
            <div style={{ ...cardHeader(COLORS), display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>Substations</span>
              <input
                placeholder="Search substations…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                style={{ padding: "6px 10px", border: `1px solid ${COLORS.border}`, borderRadius: 8, background: COLORS.bg, color: COLORS.text }}
              />
            </div>
            <div style={{ padding: 16 }}>
              {filtered.length === 0 ? (
                <div style={{ color: COLORS.subtext, padding: 24, textAlign: "center" }}>No substations to show. Import a CSV to begin.</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
                  {filtered.map((s) => (
                    <div key={s.id} style={{ ...subCard(COLORS), borderColor: s.isOut ? "#7f1d1d" : "#064e3b" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
                          <div style={{ fontSize: 12, color: COLORS.subtext }}>{Number(s.consumers).toLocaleString()} consumers</div>
                        </div>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: COLORS.subtext }}>
                          <span>{s.isOut ? "OFF" : "ON"}</span>
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
          <div style={card(COLORS)}>
            <div style={cardHeader(COLORS)}>CSV format</div>
            <div style={{ padding: 16, fontSize: 14, color: COLORS.subtext }}>
              <p>Required columns: <code>name, consumers</code>. Optional: <code>id, isOut</code>. Accepted aliases: <code>station</code> or <code>substation</code> for name; <code>consumer_count</code> or <code>count</code> for consumers.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, subLabel, badge, emphasize, color }) {
  return (
    <div>
      <div style={{ fontSize: 32, fontWeight: 700, lineHeight: 1, color: emphasize ? "#f87171" : color.text }}>
        {Number(value).toLocaleString()}
      </div>
      <div style={{ fontSize: 12, color: color.subtext }}>{label}</div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
        {badge && (
          <span style={{ fontSize: 12, border: `1px solid ${color.border}`, borderRadius: 999, padding: "2px 8px", color: color.text }}>{badge}</span>
        )}
        {subLabel && <span style={{ fontSize: 12, color: color.subtext }}>{subLabel}</span>}
      </div>
    </div>
  );
}

// Dark-styled helpers
const card = (C) => ({ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", color: C.text });
const cardHeader = (C) => ({ padding: 16, fontWeight: 600, borderBottom: `1px solid ${C.border}`, background: C.bg, color: C.text });
const subCard = (C) => ({ border: `2px solid transparent`, borderRadius: 12, padding: 12, background: C.card, color: C.text });
const btn = (C) => ({ padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.accentBorder}`, background: C.accent, color: "#001018", cursor: "pointer" });
const btnOutline = (C) => ({ padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.text, cursor: "pointer" });
