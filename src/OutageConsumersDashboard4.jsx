// File: src/OutageConsumersDashboard.jsx (LIGHT, simple + CSV import + 200+ scale)
// - Import a CSV file (header row required)
// - Group by feeder/bay; toggle feeders ON/OFF and substations ON/OFF
// - Affected = feeder OFF OR substation OFF
// - Compact table + pagination + filters for 200+ substations
// - Enlarged donut chart with center label for affected count & percent
// - Color-coded feeders (consistent hue per feeder name)

import React, { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { PieChart, Pie, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";

export default function OutageConsumersDashboard() {
  // Data
  const [stations, setStations] = useState([]); // {id, feeder, name, consumers, isOut}
  const [feederOut, setFeederOut] = useState({}); // { [feederName]: boolean }

  // UI state
  const [q, setQ] = useState("");
  const [showAffectedOnly, setShowAffectedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50); // good default for 200+

  // Light palette
  const C = {
    bg: "#f8fafc", card: "#ffffff", border: "#e2e8f0", text: "#0f172a",
    subtext: "#475569", accent: "#2563eb", accentBorder: "#3b82f6",
    affected: "#7e4500ff", healthy: "#96ebdec0", header: "#f1f5f9"
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

  // Flat rows for the table, with filters
  const flatRows = useMemo(() => {
    const list = [];
    for (const f of feeders) {
      for (const s of f.stations) list.push({ feeder: f.name, feederEffOut: !!feederOut[f.name], ...s });
    }
    return list;
  }, [feeders, feederOut]);

  const filteredRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let rows = flatRows;
    if (needle) rows = rows.filter(r => r.name.toLowerCase().includes(needle) || r.feeder.toLowerCase().includes(needle));
    if (showAffectedOnly) rows = rows.filter(r => r.effOut);
    return rows.sort((a,b) => a.feeder.localeCompare(b.feeder) || a.name.localeCompare(b.name));
  }, [flatRows, q, showAffectedOnly]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  useEffect(() => { if (page > totalPages) setPage(1); }, [filteredRows.length, pageSize]);
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  const feederMap = useMemo(() => { const m = new Map(); for (const f of feeders) m.set(f.name, f); return m; }, [feeders]);

  const chartData = [
    { name: "Affected", value: totals.affected },
    { name: "Healthy", value: totals.healthy },
  ];

  // ----- Actions -----
  function applyParsedRows(parsed) {
    const rows = parsed.filter(r => r.name && Number.isFinite(Number(r.consumers)))
      .map(row => ({
        id: row.id?.toString().trim() || crypto.randomUUID(),
        feeder: (row.feeder ?? row.bay ?? row.feeder_name ?? "Unassigned").toString().trim(),
        name: (row.name ?? row.station ?? row.substation ?? "").toString().trim(),
        consumers: Number(row.consumers ?? row.consumer_count ?? row.count ?? 0),
        isOut: String(row.isOut ?? row.outage ?? "false").trim().toLowerCase().startsWith("t"),
      }));
    setStations(rows);
    const initialFeederOut = {};
    for (const r of rows) initialFeederOut[r.feeder] = String((r.feeder_isOut ?? "false")).toLowerCase().startsWith("t");
    setFeederOut(initialFeederOut);
    setPage(1);
  }

  function importCsv(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: ({ data, errors }) => {
        if (errors?.length) console.warn("CSV parse warnings:", errors.slice(0, 3));
        applyParsedRows(data || []);
      }
    });
    e.target.value = "";
  }

  function exportCsv() {
    const rows = stations.map(({ id, feeder, name, consumers, isOut }) => ({ id, feeder, name, consumers, isOut }));
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "stations.csv"; a.click();
    URL.revokeObjectURL(url);
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

  // Render grouped rows with feeder headers
  function renderRows(rows) {
    const out = [];
    let lastFeeder = null;
    for (const r of rows) {
      if (r.feeder !== lastFeeder) {
        const fx = feederMap.get(r.feeder);
        const color = feederColor(r.feeder);
        out.push(
          <tr key={`hdr-${r.feeder}`}>
            <td colSpan={6} style={{ background: C.header, padding: 8, borderTop: `2px solid ${color}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: color, display: "inline-block" }}></span>
                  <span style={{ fontWeight: 600 }}>{r.feeder}</span>
                  <span style={{ fontSize: 12, color: C.subtext }}>
                    {fx ? `${fx.affected.toLocaleString()} / ${fx.total.toLocaleString()} affected` : ""}
                  </span>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.subtext }}>
                  <span>{feederOut[r.feeder] ? "OFF" : "ON"}</span>
                  <input type="checkbox" checked={!!feederOut[r.feeder]} onChange={() => toggleFeeder(r.feeder)} />
                </label>
              </div>
            </td>
          </tr>
        );
        lastFeeder = r.feeder;
      }
      out.push(
        <tr key={r.id} style={{ borderTop: `1px solid ${C.border}` }}>
          <td style={tdStyle}>
            <span style={{ width: 10, height: 10, borderRadius: 999, background: feederColor(r.feeder), display: "inline-block", marginRight: 6 }}></span>
            {r.feeder}
          </td>
          <td style={tdStyle}>{r.name}</td>
          <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{Number(r.consumers).toLocaleString()}</td>
          <td style={{ ...tdStyle, textAlign: "center" }}>
            <input type="checkbox" checked={!!feederOut[r.feeder]} onChange={() => toggleFeeder(r.feeder)} />
          </td>
          <td style={{ ...tdStyle, textAlign: "center" }}>
            <input type="checkbox" checked={!!r.isOut} onChange={() => toggleStation(r.id)} disabled={!!feederOut[r.feeder]} />
          </td>
          <td style={{ ...tdStyle, textAlign: "center" }}>
            <span style={{ padding: "2px 8px", borderRadius: 999, border: `1px solid ${r.effOut ? "#fecaca" : "#bbf7d0"}`, background: r.effOut ? "#fee2e2" : "#ecfdf5", color: r.effOut ? C.affected : C.healthy }}>
              {r.effOut ? "OFF" : "ON"}
            </span>
          </td>
        </tr>
      );
    }
    return out;
  }

  // ----- UI -----
  return (
    <div style={{ minHeight: "100vh", padding: 12, background: C.bg, color: C.text }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        {/* Top bar */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          <input id="csvFile" type="file" accept=".csv,text/csv" onChange={importCsv} style={{ display: "none" }} />
          <label htmlFor="csvFile" style={btn(C)}>Import CSV</label>
          <button onClick={exportCsv} style={btnOutline(C)}>Export</button>
          <button onClick={() => setAllFeeders(true)} style={btnOutline(C)}>All Feeders OFF</button>
          <button onClick={() => setAllFeeders(false)} style={btnOutline(C)}>All Feeders ON</button>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <input
              placeholder="Search feeder or substation"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              style={{ padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", color: C.text, width: 280 }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.subtext }}>
              <input type="checkbox" checked={showAffectedOnly} onChange={(e)=>{ setShowAffectedOnly(e.target.checked); setPage(1); }} />
              Show affected only
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.subtext }}>
              Page size
              <select value={pageSize} onChange={(e)=>{ setPageSize(Number(e.target.value)); setPage(1); }} style={{ padding: "4px 8px", border: `1px solid ${C.border}`, borderRadius: 8 }}>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
                <option value={10000}>All</option>
              </select>
            </label>
          </div>
        </div>

        {/* Stats + Chart (enlarged for management) */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8, marginBottom: 8 }}>
          <div style={card(C)}>
            <div style={{ position: "relative", height: 340 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={100}
                    outerRadius={160}
                    label={false}
                    isAnimationActive={false}
                  >
                    {chartData.map((entry, i) => (
                      <Cell key={`${entry.name}-${i}`} fill={entry.name === "Affected" ? C.affected : C.healthy} stroke="#ffffff" />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => Number(v).toLocaleString()} contentStyle={{ backgroundColor: "#ffffff", border: `1px solid ${C.border}`, color: C.text }} itemStyle={{ color: C.text }} labelStyle={{ color: C.subtext }} />
                  <Legend wrapperStyle={{ color: C.text }} />
                </PieChart>
              </ResponsiveContainer>
              {/* Center label with affected PERCENT */}
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 48, fontWeight: 800, lineHeight: 1, color: C.affected }}>{totals.pct}%</div>
                  <div style={{ fontSize: 14, color: C.subtext }}>{totals.affected.toLocaleString()} affected of {totals.total.toLocaleString()}</div>
                </div>
              </div>
            </div>
          </div>
          <div style={card(C)}>
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: C.subtext }}>Affected consumers</div>
              <div style={{ fontSize: 32, fontWeight: 700, color: C.affected }}>{totals.affected.toLocaleString()}</div>
              <div style={{ marginTop: 12, fontSize: 12, color: C.subtext }}>Total consumers</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{totals.total.toLocaleString()}</div>
              <div style={{ marginTop: 12, fontSize: 12, color: C.subtext }}>Affected percentage</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{totals.pct}%</div>
            </div>
          </div>
        </div>

        {/* Feeder quick toggles (color-coded by feeder) */}
        <div style={card(C)}>
          <div style={{ padding: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {feeders.map(f => (
              <button
                key={f.name}
                onClick={() => toggleFeeder(f.name)}
                title={`${f.name} (${f.affected}/${f.total})`}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: `1px solid ${C.border}`,
                  borderLeft: `6px solid ${feederColor(f.name)}`,
                  background: feederOut[f.name] ? "#fee2e2" : "#ecfeff",
                  color: feederOut[f.name] ? C.affected : "#075985",
                  fontSize: 12
                }}
              >
                {feederOut[f.name] ? "OFF" : "ON"} · {f.name}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div style={card(C)}>
          <div style={{ borderBottom: `1px solid ${C.border}`, padding: 8, background: C.header, fontWeight: 600 }}>Substations</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", color: C.subtext }}>
                  <th style={thStyle(C)}>Feeder</th>
                  <th style={thStyle(C)}>Substation</th>
                  <th style={{ ...thStyle(C), textAlign: "right" }}>Consumers</th>
                  <th style={{ ...thStyle(C), textAlign: "center" }}>Feeder</th>
                  <th style={{ ...thStyle(C), textAlign: "center" }}>Substation</th>
                  <th style={{ ...thStyle(C), textAlign: "center" }}>Effective</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length ? (
                  renderRows(pageRows)
                ) : (
                  <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: C.subtext }}>No rows. Import a CSV above.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 8, borderTop: `1px solid ${C.border}`, color: C.subtext }}>
            <div>
              Showing <b>{filteredRows.length === 0 ? 0 : (page - 1) * pageSize + 1}</b>–<b>{Math.min(page * pageSize, filteredRows.length)}</b> of <b>{filteredRows.length}</b>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setPage(1)} disabled={page === 1} style={pagerBtn(C, page === 1)}>« First</button>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={pagerBtn(C, page === 1)}>‹ Prev</button>
              <div style={{ padding: "4px 8px" }}>Page {page} / {totalPages}</div>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={pagerBtn(C, page === totalPages)}>Next ›</button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages} style={pagerBtn(C, page === totalPages)}>Last »</button>
            </div>
          </div>
        </div>

        {/* Small note */}
        <div style={{ fontSize: 12, color: C.subtext, marginTop: 8 }}>
          CSV columns: <code>feeder</code> (or <code>bay</code>), <code>name</code>, <code>consumers</code>, optional <code>isOut</code>. Values are case-insensitive.
        </div>
      </div>
    </div>
  );
}

// ---- Small UI helpers ----
const card = (C) => ({ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" });
const thStyle = (C) => ({ padding: 8, borderBottom: `1px solid ${C.border}` });
const tdStyle = { padding: 8 };
const btn = (C) => ({ padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.accentBorder}`, background: C.accent, color: "#ffffff", cursor: "pointer" });
const btnOutline = (C) => ({ padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.text, cursor: "pointer" });
const pagerBtn = (C, disabled) => ({ padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: disabled ? "#f1f5f9" : "#fff", color: disabled ? "#94a3b8" : C.text, cursor: disabled ? "not-allowed" : "pointer" });

// Deterministic feeder color from name
function feederColor(name) {
  const h = hashStringToHue(name || "");
  return `hsl(${h}, 65%, 45%)`;
}
function hashStringToHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % 360;
}
