// File: src/OutageConsumersDashboard.jsx (feeders/bays + LIGHT mode)
// - Group by feeder/bay
// - Toggle feeders ON/OFF and individual substations ON/OFF
// - Affected = feeder OFF OR substation OFF

import React, { useMemo, useState } from "react";
import Papa from "papaparse";
import { PieChart, Pie, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";

export default function OutageConsumersDashboard() {
  const [stations, setStations] = useState([]); // {id, feeder, name, consumers, isOut}
  const [feederOut, setFeederOut] = useState({}); // { [feederName]: boolean }
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState({}); // { [feederName]: boolean }

  // Light palette
  const C = {
    bg: "#f8fafc", card: "#ffffff", border: "#e2e8f0", text: "#0f172a",
    subtext: "#475569", accent: "#2563eb", accentBorder: "#3b82f6",
    affected: "#dc2626", healthy: "#16a34a", header: "#f1f5f9"
  };

  // Build feeder index and compute totals (effective outage = feederOut || station.isOut)
  const { feeders, totals } = useMemo(() => {
    const groups = new Map();
    let total = 0, affected = 0;

    for (const s of stations) {
      const f = (s.feeder || "Unassigned").toString();
      if (!groups.has(f)) groups.set(f, { name: f, stations: [], total: 0, affected: 0, healthy: 0 });
      const g = groups.get(f);
      const cons = Number(s.consumers) || 0;
      const effOut = !!(feederOut[f]) || !!s.isOut;
      g.stations.push({ ...s, effOut });
      g.total += cons;
      if (effOut) g.affected += cons;
      total += cons;
      if (effOut) affected += cons;
    }

    for (const g of groups.values()) g.healthy = g.total - g.affected;

    const healthy = total - affected;
    const pct = total > 0 ? Math.round(((affected / total) * 100) * 10) / 10 : 0;
    return { feeders: Array.from(groups.values()).sort((a,b)=>a.name.localeCompare(b.name)), totals: { total, affected, healthy, pct } };
  }, [stations, feederOut]);

  const chartData = [
    { name: "Affected", value: totals.affected },
    { name: "Healthy", value: totals.healthy },
  ];

  // Search filter (matches feeder or station name)
  const filterNeedle = q.trim().toLowerCase();
  const visibleFeeders = useMemo(() => {
    if (!filterNeedle) return feeders;
    return feeders
      .map(f => ({
        ...f,
        stations: f.stations.filter(s => s.name.toLowerCase().includes(filterNeedle) || f.name.toLowerCase().includes(filterNeedle))
      }))
      .filter(f => f.stations.length > 0 || f.name.toLowerCase().includes(filterNeedle));
  }, [feeders, filterNeedle]);

  function importCsv(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data, errors }) => {
        if (errors?.length) console.warn("CSV parse warnings:", errors.slice(0, 3));
        const parsed = (data || []).map(row => ({
          id: row.id?.toString().trim() || crypto.randomUUID(),
          feeder: (row.feeder ?? row.bay ?? row.feeder_name ?? "Unassigned").toString().trim(),
          name: (row.name ?? row.station ?? row.substation ?? "").toString().trim(),
          consumers: Number(row.consumers ?? row.consumer_count ?? row.count ?? 0),
          isOut: String(row.isOut ?? row.outage ?? "false").trim().toLowerCase().startsWith("t"),
        })).filter(r => r.name && Number.isFinite(r.consumers));
        setStations(parsed);
        // Reset feeder toggles; optional CSV column feeder_isOut to set defaults
        const initialFeederOut = {};
        for (const r of parsed) initialFeederOut[r.feeder] = String((r.feeder_isOut ?? "false")).toLowerCase().startsWith("t");
        setFeederOut(initialFeederOut);
        setExpanded({});
      }
    });
    e.target.value = "";
  }

  function toggleFeeder(name) {
    setFeederOut(prev => ({ ...prev, [name]: !prev[name] }));
  }

  function toggleStation(id) {
    setStations(prev => prev.map(s => (s.id === id ? { ...s, isOut: !s.isOut } : s)));
  }

  function setAllFeeders(out) {
    setFeederOut(prev => {
      const next = { ...prev };
      for (const f of feeders) next[f.name] = out;
      return next;
    });
  }

  function exportCsv() {
    const rows = stations.map(({ id, feeder, name, consumers, isOut }) => ({ id, feeder, name, consumers, isOut }));
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "stations.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ minHeight: "100vh", padding: 16, background: C.bg, color: C.text }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <header style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0 }}>Outage Consumers Dashboard</h1>
            <div style={{ color: C.subtext }}>Group by feeder/bay. Affected = feeder OFF or substation OFF.</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input id="csvFile" type="file" accept=".csv,text/csv" onChange={importCsv} style={{ display: "none" }} />
            <label htmlFor="csvFile" style={btnOutline(C)}>Import CSV</label>
            <button onClick={exportCsv} style={btn(C)}>Export CSV</button>
            <button onClick={() => setAllFeeders(true)} style={btnOutline(C)}>All Feeders OFF</button>
            <button onClick={() => setAllFeeders(false)} style={btnOutline(C)}>All Feeders ON</button>
          </div>
        </header>

        <section style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16, marginTop: 16 }}>
          {/* Chart + totals */}
          <div style={card(C)}>
            <div style={cardHeader(C)}>Affected vs Total</div>
            <div style={{ padding: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Stat label="Affected consumers" value={totals.affected} badge={`${totals.pct}%`} emphasize color={C} />
                <Stat label="Total consumers" value={totals.total} subLabel={`Healthy: ${totals.healthy.toLocaleString()}`} color={C} />
              </div>
              <div style={{ height: 300, marginTop: 16 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={false} isAnimationActive={false}>
                      {chartData.map((entry, i) => (
                        <Cell key={`${entry.name}-${i}`} fill={entry.name === "Affected" ? C.affected : C.healthy} stroke="#ffffff" />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => Number(v).toLocaleString()} contentStyle={{ backgroundColor: "#ffffff", border: `1px solid ${C.border}`, color: C.text }} itemStyle={{ color: C.text }} labelStyle={{ color: C.subtext }} />
                    <Legend wrapperStyle={{ color: C.text }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Feeders & Substations */}
          <div style={card(C)}>
            <div style={{ ...cardHeader(C), background: C.header, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>Feeders / Bays</span>
              <input placeholder="Search feeders or substations…" value={q} onChange={(e) => setQ(e.target.value)} style={{ padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 8, background: "#ffffff", color: C.text }} />
            </div>
            <div style={{ padding: 12, display: "grid", gap: 10 }}>
              {visibleFeeders.length === 0 ? (
                <div style={{ color: C.subtext, padding: 24, textAlign: "center" }}>No results. Import a CSV to begin.</div>
              ) : (
                visibleFeeders.map((f) => (
                  <div key={f.name} style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", background: C.card }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 12, background: C.header }}>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <button onClick={() => setExpanded(p => ({ ...p, [f.name]: !p[f.name] }))} style={pill(C)}>{expanded[f.name] ? "▾" : "▸"}</button>
                        <div>
                          <div style={{ fontWeight: 600 }}>{f.name}</div>
                          <div style={{ fontSize: 12, color: C.subtext }}>{f.affected.toLocaleString()} / {f.total.toLocaleString()} affected</div>
                        </div>
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.subtext }}>
                        <span>{feederOut[f.name] ? "OFF" : "ON"}</span>
                        <input type="checkbox" checked={!!feederOut[f.name]} onChange={() => toggleFeeder(f.name)} />
                      </label>
                    </div>

                    {expanded[f.name] !== false && (
                      <div style={{ padding: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
                        {f.stations.map((s) => (
                          <div key={s.id} style={{ border: `2px solid ${s.effOut ? "#fecaca" : "#bbf7d0"}`, borderRadius: 10, padding: 10, background: "#fff" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
                                <div style={{ fontSize: 12, color: C.subtext }}>{Number(s.consumers).toLocaleString()} consumers</div>
                              </div>
                              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.subtext }}>
                                <span>{s.effOut ? "OFF" : "ON"}</span>
                                <input type="checkbox" checked={!!s.isOut} onChange={() => toggleStation(s.id)} disabled={!!feederOut[f.name]} />
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section style={{ marginTop: 16 }}>
          <div style={card(C)}>
            <div style={{ ...cardHeader(C), background: C.header }}>CSV format</div>
            <div style={{ padding: 16, fontSize: 14, color: C.subtext }}>
              <p>Columns: <code>feeder</code> (or <code>bay</code>), <code>name</code>, <code>consumers</code>, optional <code>isOut</code>. Example:</p>
              <pre style={{ background: "#ffffff", padding: 12, borderRadius: 8, border: `1px solid ${C.border}`, overflow: "auto" }}>{`feeder,name,consumers,isOut
FDR-01,SS-01 Hulhumalé Central,620,false
FDR-01,SS-02 HM Phase 2,480,true
FDR-02,SS-03 Malé North,750,false
FDR-03,SS-04 Villimale,310,false`}</pre>
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
      <div style={{ fontSize: 32, fontWeight: 700, lineHeight: 1, color: emphasize ? "#dc2626" : color.text }}>
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

const card = (C) => ({ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", color: C.text });
const cardHeader = (C) => ({ padding: 16, fontWeight: 600, borderBottom: `1px solid ${C.border}`, background: C.header, color: C.text });
const pill = (C) => ({ border: `1px solid ${C.border}`, background: C.card, color: C.text, borderRadius: 8, padding: "2px 8px", cursor: "pointer" });
const btn = (C) => ({ padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.accentBorder}`, background: C.accent, color: "#ffffff", cursor: "pointer" });
const btnOutline = (C) => ({ padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.text, cursor: "pointer" });
