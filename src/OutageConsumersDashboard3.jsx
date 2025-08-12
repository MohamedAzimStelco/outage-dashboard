// File: src/OutageConsumersDashboard.jsx
// Modes:
//  - Viewer (default): donut + % + OFF/ON counts, no toggles/tables
//  - Admin (?admin=1): full UI (import/export, toggles, tables)

import React, { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { PieChart, Pie, Tooltip, ResponsiveContainer, Cell } from "recharts";

export default function OutageConsumersDashboard() {
  // ----- MODE / FLAGS -----
  const viewerOnly = (() => {
    if (typeof window === "undefined") return true;
    if (typeof window.VIEWER_ONLY === "boolean") return window.VIEWER_ONLY;
    const p = new URLSearchParams(window.location.search);
    // viewer by default; admin ONLY when ?admin=1
    return p.get("admin") === "1" ? false : true;
  })();

  // If you set this in index.html you can override the CSV path:
  const DEFAULT_CSV_URL = `${import.meta.env.BASE_URL}data/feeders_substations.csv`;
  const REMOTE_CSV_URL =
    (typeof window !== "undefined" && window.REMOTE_CSV_URL) || DEFAULT_CSV_URL;
  const DATA_CSV_URL = REMOTE_CSV_URL;

  // ----- COLORS (okabe-ito) -----
  const C = {
    bg: "#f8fafc", card: "#ffffff", border: "#e2e8f0", text: "#0f172a",
    subtext: "#475569", accent: "#2563eb", accentBorder: "#3b82f6",
    affected: "#D55E00", healthy: "#0072B2", header: "#f1f5f9",
    affectedBg: "#FDE5D6", healthyBg: "#DDECF7", affectedBorder: "#F3B493", healthyBorder: "#9CC3E6"
  };

  // ----- STATE -----
  const [stations, setStations] = useState([]); // {id, feeder, name, consumers, isOut}
  const [feederOut, setFeederOut] = useState({}); // { [feederName]: boolean }
  const [q, setQ] = useState("");
  const [showAffectedOnly, setShowAffectedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selectedFeeder, setSelectedFeeder] = useState("ALL"); // "ALL" or feeder name

  // ----- DATA BUILD -----
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

  // Flat with effective outage flags
  const flatRows = useMemo(() => {
    const list = [];
    for (const f of feeders) {
      for (const s of f.stations) list.push({ feeder: f.name, feederEffOut: !!feederOut[f.name], ...s });
    }
    return list;
  }, [feeders, feederOut]);

  // Substation counts (global + per feeder)
  const stationCounts = useMemo(() => {
    const total = flatRows.length;
    let off = 0;
    for (const r of flatRows) if (r.effOut) off++;
    const on = total - off;
    const offPct = total ? Math.round((off / total) * 1000) / 10 : 0;
    return { total, off, on, offPct };
  }, [flatRows]);

  const feederStationCounts = useMemo(() => {
    if (selectedFeeder === 'ALL') return null;
    const rows = flatRows.filter(r => r.feeder === selectedFeeder);
    const total = rows.length;
    let off = 0;
    for (const r of rows) if (r.effOut) off++;
    const on = total - off;
    const offPct = total ? Math.round((off / total) * 1000) / 10 : 0;
    return { total, off, on, offPct };
  }, [flatRows, selectedFeeder]);

  // Search/filter/pagination
  const filteredRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let rows = flatRows;
    if (selectedFeeder !== "ALL") rows = rows.filter(r => r.feeder === selectedFeeder);
    if (needle) rows = rows.filter(r => r.name.toLowerCase().includes(needle) || r.feeder.toLowerCase().includes(needle));
    if (showAffectedOnly) rows = rows.filter(r => r.effOut);
    return rows.sort((a,b) => a.name.localeCompare(b.name));
  }, [flatRows, q, showAffectedOnly, selectedFeeder]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  useEffect(() => { if (page > totalPages) setPage(1); }, [filteredRows.length, pageSize]);

  // Load default CSV on start
  useEffect(() => { loadDefaultCsv(true); }, []);

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  const chartData = [
    { name: "Affected", value: totals.affected },
    { name: "Healthy", value: totals.healthy },
  ];

  // Mobile + donut sizing
  const isMobile = useIsMobile(768);
  const chartBoxRef = React.useRef(null);
  const [chartBox, setChartBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!chartBoxRef.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0].contentRect;
      setChartBox({ w: cr.width, h: cr.height });
    });
    ro.observe(chartBoxRef.current);
    return () => ro.disconnect();
  }, []);
  const minSide = Math.max(0, Math.min(chartBox.w, chartBox.h));
  const outerR = Math.max(70, Math.floor(minSide * 0.42));
  const innerR = Math.floor(outerR * 0.6);
  const pctFont = Math.round(Math.max(18, Math.min(48, outerR * 0.42)));

  // ----- ACTIONS -----
  async function loadDefaultCsv(silent = true) {
    try {
      const res = await fetch(DATA_CSV_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('Default CSV not found');
      const text = await res.text();
      const { data, errors } = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: true });
      if (errors?.length) console.warn('Default CSV parse warnings:', errors.slice(0, 3));
      applyParsedRows(data || []);
    } catch (e) {
      if (!silent) alert(`Default CSV not found at ${DATA_CSV_URL}`);
      console.warn(e);
    }
  }

  function applyParsedRows(parsed) {
    const rows = parsed.filter(r => r.name && Number.isFinite(Number(r.consumers)))
      .map(row => ({
        id: row.id?.toString().trim() || rid(),
        feeder: (row.feeder ?? row.bay ?? row.feeder_name ?? "Unassigned").toString().trim(),
        name: (row.name ?? row.station ?? row.substation ?? "").toString().trim(),
        consumers: Number(row.consumers ?? row.consumer_count ?? row.count ?? 0),
        isOut: String(row.isOut ?? row.outage ?? "false").trim().toLowerCase().startsWith("t"),
      }));
    setStations(rows);
    const initialFeederOut = {};
    for (const r of rows) initialFeederOut[r.feeder] = String((r.feeder_isOut ?? "false")).toLowerCase().startsWith("t");
    setFeederOut(initialFeederOut);
    setSelectedFeeder("ALL");
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
    if (viewerOnly) return; // viewer cannot toggle
    setFeederOut(prev => ({ ...prev, [name]: !prev[name] }));
  }

  function toggleStation(id) {
    if (viewerOnly) return; // viewer cannot toggle
    setStations(prev => prev.map(s => (s.id === id ? { ...s, isOut: !s.isOut } : s)));
  }

  // ----- UI -----
  return (
    <div style={{ minHeight: "100vh", padding: 12, background: C.bg, color: C.text }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        {/* Top bar (ADMIN ONLY) */}
        {!viewerOnly && (
          <div style={{ display: "flex", gap: 8, alignItems: isMobile ? "stretch" : "center", flexDirection: isMobile ? "column" : "row", flexWrap: "wrap", marginBottom: 8, position: "sticky", top: 0, background: C.bg, zIndex: 10, paddingTop: 6 }}>
            <input id="csvFile" type="file" accept=".csv,text/csv" onChange={importCsv} style={{ display: "none" }} />
            <label htmlFor="csvFile" style={btn(C)}>Import CSV</label>
            <button onClick={exportCsv} style={btnOutline(C)}>Export</button>
            <button onClick={() => loadDefaultCsv(false)} style={btnOutline(C)}>Load default CSV</button>

            {/* Feeder dropdown */}
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.subtext }}>
              Feeder
              <select
                value={selectedFeeder}
                onChange={(e)=>{ setSelectedFeeder(e.target.value); setPage(1); }}
                style={{ padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", color: C.text }}
              >
                <option value="ALL">All feeders</option>
                {feeders.map(f => (
                  <option key={f.name} value={f.name}>{f.name}</option>
                ))}
              </select>
            </label>

            <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
              <input
                placeholder="Search substation or feeder"
                value={q}
                onChange={(e) => { setQ(e.target.value); setPage(1); }}
                style={{ padding: "12px 14px", border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", color: C.text, width: isMobile ? "100%" : 260, fontSize: isMobile ? 16 : 14 }}
              />
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.subtext }}>
                <input type="checkbox" checked={showAffectedOnly} onChange={(e)=>{ setShowAffectedOnly(e.target.checked); setPage(1); }} />
                Affected only
              </label>
              {!isMobile && (
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
              )}
            </div>
          </div>
        )}

        {/* Stats + Chart */}
        <div style={{ display: "grid", gridTemplateColumns: (isMobile || viewerOnly) ? "1fr" : "2fr 1fr", gap: 8, marginBottom: 8 }}>
          <div style={card(C)}>
            <div ref={chartBoxRef} style={{ position: "relative", height: isMobile ? 300 : 340, padding: 8, boxSizing: 'border-box' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={innerR}
                    outerRadius={outerR}
                    label={false}
                    isAnimationActive={false}
                  >
                    {chartData.map((entry, i) => (
                      <Cell key={`${entry.name}-${i}`} fill={entry.name === "Affected" ? C.affected : C.healthy} stroke="#ffffff" />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => Number(v).toLocaleString()}
                    contentStyle={{ backgroundColor: "#ffffff", border: `1px solid ${C.border}`, color: C.text }}
                    itemStyle={{ color: C.text }}
                    labelStyle={{ color: C.subtext }}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Empty state when no totals yet */}
              {totals.total === 0 && (
                <div style={{ padding: 12, textAlign: 'center', color: C.subtext }}>
                  No data yet. {viewerOnly ? (
                    <span>Ask the admin to open <b>?admin=1</b> and update.</span>
                  ) : (
                    <span>Load a CSV to begin.</span>
                  )}
                  <div style={{ marginTop: 8 }}>
                    <button onClick={() => loadDefaultCsv(false)} style={btnOutline(C)}>Retry loading CSV</button>
                  </div>
                </div>
              )}

              {/* Center label with affected PERCENT */}
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: pctFont, fontWeight: 800, lineHeight: 1, color: C.affected }}>{totals.pct}%</div>
                  <div style={{ fontSize: 14, color: C.subtext }}>{totals.affected.toLocaleString()} affected of {totals.total.toLocaleString()}</div>
                </div>
              </div>
            </div>

            {/* Legend / KPI row under the chart */}
            {!viewerOnly ? (
              <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap", padding: "8px 0 12px" }} aria-label="Chart legend">
                <LegendItem color={C.affected} label="Affected" value={totals.affected} total={totals.total} />
                <LegendItem color={C.healthy} label="Healthy" value={totals.healthy} total={totals.total} />
              </div>
            ) : (
              <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap", padding: "8px 0 12px" }}>
                <KpiChip label="Substations OFF" value={stationCounts.off.toLocaleString()} color={C.affected} />
                <KpiChip label="Substations ON"  value={stationCounts.on.toLocaleString()}  color={C.healthy} />
              </div>
            )}
          </div>

          {/* Stats card (ADMIN ONLY) */}
          {!viewerOnly && (
            <div style={card(C)}>
              <div style={{ padding: 16 }}>
                <div style={{ fontSize: 12, color: C.subtext }}>Affected consumers</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: C.affected }}>{totals.affected.toLocaleString()}</div>

                <div style={{ marginTop: 12, fontSize: 12, color: C.subtext }}>Total consumers</div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{totals.total.toLocaleString()}</div>

                <div style={{ marginTop: 12, fontSize: 12, color: C.subtext }}>Affected percentage</div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{totals.pct}%</div>

                <div style={{ marginTop: 16, borderTop: `1px solid ${C.border}` }} />

                {/* Substation counts */}
                <div style={{ marginTop: 12, fontSize: 12, color: C.subtext }}>Substations OFF</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: C.affected }}>
                  {((feederStationCounts?.off ?? stationCounts.off)).toLocaleString()} <span style={{ fontSize: 12, color: C.subtext }}>
                    of {(feederStationCounts?.total ?? stationCounts.total).toLocaleString()} ({(feederStationCounts?.offPct ?? stationCounts.offPct)}%)
                  </span>
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: C.subtext }}>Substations ON</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: C.healthy }}>
                  {((feederStationCounts ? feederStationCounts.on : stationCounts.on)).toLocaleString()}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ADMIN TABLES ONLY */}
        {!viewerOnly && (
          selectedFeeder === "ALL" ? (
            <AdminAllView
              C={C}
              isMobile={isMobile}
              feeders={feeders}
              q={q}
              setQ={setQ}
              showAffectedOnly={showAffectedOnly}
              setShowAffectedOnly={setShowAffectedOnly}
              pageRows={pageRows}
              filteredRows={filteredRows}
              page={page}
              setPage={setPage}
              pageSize={pageSize}
              setPageSize={setPageSize}
              totalPages={totalPages}
              feederOut={feederOut}
              toggleFeeder={toggleFeeder}
              toggleStation={toggleStation}
              selectedFeeder={selectedFeeder}
              setSelectedFeeder={setSelectedFeeder}
            />
          ) : (
            <AdminFeederView
              C={C}
              isMobile={isMobile}
              feeders={feeders}
              selectedFeeder={selectedFeeder}
              setSelectedFeeder={setSelectedFeeder}
              feederOut={feederOut}
              toggleFeeder={toggleFeeder}
              pageRows={pageRows}
              toggleStation={toggleStation}
              filteredRows={filteredRows}
              page={page}
              setPage={setPage}
              pageSize={pageSize}
              totalPages={totalPages}
            />
          )
        )}

        {/* Small note */}
        <div style={{ fontSize: 12, color: C.subtext, marginTop: 8 }}>
          CSV columns: <code>feeder</code> (or <code>bay</code>), <code>name</code>, <code>consumers</code>, optional <code>isOut</code>.
        </div>
      </div>
    </div>
  );
}

/* ---------- Admin-only views (split out for readability) ---------- */

function AdminAllView(props) {
  const { C, isMobile, feeders, q, setQ, showAffectedOnly, setShowAffectedOnly,
          pageRows, filteredRows, page, setPage, pageSize, setPageSize, totalPages,
          feederOut, toggleFeeder, toggleStation, selectedFeeder, setSelectedFeeder } = props;

  const StationCard = (r) => (
    <div key={r.id} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, background: C.card, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 600 }}>{r.name}</div>
        <span style={{ padding: "2px 8px", borderRadius: 999, border: `1px solid ${r.effOut ? C.affectedBorder : C.healthyBorder}`, background: r.effOut ? C.affectedBg : C.healthyBg, color: r.effOut ? C.affected : C.healthy }}>
          {r.effOut ? 'OFF' : 'ON'}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: C.subtext }}>
        <div>Feeder: <span style={{ fontWeight: 600 }}><span style={{ width: 10, height: 10, borderRadius: 999, background: feederColor(r.feeder), display: 'inline-block', marginRight: 6 }}></span>{r.feeder}</span></div>
        <div><b>{Number(r.consumers).toLocaleString()}</b> consumers</div>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={!!feederOut[r.feeder]} onChange={() => toggleFeeder(r.feeder)} style={{ transform: 'scale(1.3)' }} /> Feeder OFF
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={!!r.isOut} onChange={() => toggleStation(r.id)} disabled={!!feederOut[r.feeder]} style={{ transform: 'scale(1.3)' }} /> Substation OFF
        </label>
      </div>
    </div>
  );

  return (
    <div style={card(C)}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${C.border}`, padding: 8, background: C.header }}>
        <div style={{ fontWeight: 600 }}>Substations (search across all feeders)</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ fontSize: 12, color: C.subtext }}>{filteredRows.length} result(s)</div>
          <button onClick={() => { setQ(""); setShowAffectedOnly(false); setPage(1); }} style={btnOutline(C)}>Clear search</button>
        </div>
      </div>
      {isMobile ? (
        <div style={{ display: 'grid', gap: 8, padding: 8 }}>
          {pageRows.map(r => <StationCard key={r.id} {...r} />)}
          {pageRows.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: C.subtext }}>No rows match this search.</div>}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: C.subtext }}>
                <th style={thStyle(C)}>Feeder</th>
                <th style={thStyle(C)}>Substation</th>
                <th style={{ ...thStyle(C), textAlign: "right" }}>Consumers</th>
                <th style={{ ...thStyle(C), textAlign: "center" }}>Feeder</th>
                <th style={{ ...thStyle(C), textAlign: "center" }}>Toggle (ON/OFF)</th>
                <th style={{ ...thStyle(C), textAlign: "center" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map(r => (
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
                    <span style={{ padding: "2px 8px", borderRadius: 999, border: `1px solid ${r.effOut ? C.affectedBorder : C.healthyBorder}`, background: r.effOut ? C.affectedBg : C.healthyBg, color: r.effOut ? C.affected : C.healthy }}>
                      {r.effOut ? "OFF" : "ON"}
                    </span>
                  </td>
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: C.subtext }}>No rows match this search.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 8, borderTop: `1px solid ${C.border}`, color: C.subtext }}>
        <div>
          Showing <b>{filteredRows.length === 0 ? 0 : (page - 1) * pageSize + 1}</b>–<b>{Math.min(page * pageSize, filteredRows.length)}</b> of <b>{filteredRows.length}</b>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {!isMobile && <button onClick={() => setPage(1)} disabled={page === 1} style={pagerBtn(C, page === 1)}>« First</button>}
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={pagerBtn(C, page === 1)}>‹ Prev</button>
          <div style={{ padding: "4px 8px" }}>{isMobile ? `Page ${page}` : `Page ${page} / ${totalPages}`}</div>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={pagerBtn(C, page === totalPages)}>Next ›</button>
          {!isMobile && <button onClick={() => setPage(totalPages)} disabled={page === totalPages} style={pagerBtn(C, page === totalPages)}>Last »</button>}
        </div>
      </div>
    </div>
  );
}

function AdminFeederView(props) {
  const { C, isMobile, feeders, selectedFeeder, setSelectedFeeder, feederOut,
          toggleFeeder, pageRows, toggleStation, filteredRows, page, setPage, pageSize, totalPages } = props;

  return (
    <div style={card(C)}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${C.border}`, padding: 8, background: C.header }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: 999, background: feederColor(selectedFeeder), display: "inline-block" }}></span>
          <strong>{selectedFeeder}</strong>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.subtext }}>
            <span>{feederOut[selectedFeeder] ? "OFF" : "ON"}</span>
            <input type="checkbox" checked={!!feederOut[selectedFeeder]} onChange={() => toggleFeeder(selectedFeeder)} />
          </label>
          <button onClick={() => setSelectedFeeder("ALL")} style={btnOutline(C)}>Show all feeders</button>
        </div>
      </div>

      {isMobile ? (
        <div style={{ display: 'grid', gap: 8, padding: 8 }}>
          {pageRows.map(r => <StationRow key={r.id} r={r} C={C} feederOut={feederOut} toggleStation={toggleStation} selectedFeeder={selectedFeeder} />)}
          {pageRows.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: C.subtext }}>No rows match this filter.</div>}
      </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: C.subtext }}>
                <th style={thStyle(C)}>Substation</th>
                <th style={{ ...thStyle(C), textAlign: "right" }}>Consumers</th>
                <th style={{ ...thStyle(C), textAlign: "center" }}>Toggle (ON/OFF)</th>
                <th style={{ ...thStyle(C), textAlign: "center" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map(r => <StationRow key={r.id} r={r} C={C} feederOut={feederOut} toggleStation={toggleStation} selectedFeeder={selectedFeeder} />)}
              {pageRows.length === 0 && (
                <tr><td colSpan={4} style={{ padding: 24, textAlign: "center", color: C.subtext }}>No rows match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 8, borderTop: `1px solid ${C.border}`, color: C.subtext }}>
        <div>
          Showing <b>{filteredRows.length === 0 ? 0 : (page - 1) * pageSize + 1}</b>–<b>{Math.min(page * pageSize, filteredRows.length)}</b> of <b>{filteredRows.length}</b>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {!isMobile && <button onClick={() => setPage(1)} disabled={page === 1} style={pagerBtn(C, page === 1)}>« First</button>}
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={pagerBtn(C, page === 1)}>‹ Prev</button>
          <div style={{ padding: "4px 8px" }}>{isMobile ? `Page ${page}` : `Page ${page} / ${totalPages}`}</div>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={pagerBtn(C, page === totalPages)}>Next ›</button>
          {!isMobile && <button onClick={() => setPage(totalPages)} disabled={page === totalPages} style={pagerBtn(C, page === totalPages)}>Last »</button>}
        </div>
      </div>
    </div>
  );
}

function StationRow({ r, C, feederOut, toggleStation, selectedFeeder }) {
  return (
    <tr key={r.id} style={{ borderTop: `1px solid ${C.border}` }}>
      <td style={tdStyle}>{r.name}</td>
      <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{Number(r.consumers).toLocaleString()}</td>
      <td style={{ ...tdStyle, textAlign: "center" }}>
        <input type="checkbox" checked={!!r.isOut} onChange={() => toggleStation(r.id)} disabled={!!feederOut[selectedFeeder]} />
      </td>
      <td style={{ ...tdStyle, textAlign: "center" }}>
        <span style={{ padding: "2px 8px", borderRadius: 999, border: `1px solid ${r.effOut ? C.affectedBorder : C.healthyBorder}`, background: r.effOut ? C.affectedBg : C.healthyBg, color: r.effOut ? C.affected : C.healthy }}>
          {r.effOut ? "OFF" : "ON"}
        </span>
      </td>
    </tr>
  );
}

/* ---------- Shared small components/helpers ---------- */

function LegendItem({ color, label, value, total }) {
  const pct = total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
  return (
    <div role="listitem" style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 999, padding: '6px 10px' }}>
      <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 2, background: color, display: 'inline-block' }} />
      <span style={{ fontWeight: 700 }}>{label}</span>
      <span style={{ color: '#475569' }}> — {Number(value || 0).toLocaleString()} ({pct}%)</span>
    </div>
  );
}

function KpiChip({ label, value, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 999, padding: '6px 10px' }}>
      {color ? <span style={{ width: 12, height: 12, borderRadius: 2, background: color, display: 'inline-block' }} /> : null}
      <strong>{label}</strong>
      <span style={{ color: '#475569' }}> — {value}</span>
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

function rid() {
  try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch {}
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function useIsMobile(breakpoint = 768) {
  const [is, setIs] = React.useState(typeof window !== 'undefined' ? window.innerWidth < breakpoint : false);
  React.useEffect(() => {
    function onResize() { setIs(window.innerWidth < breakpoint); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return is;
}

function feederColor(name) {
  const h = hashStringToHue(name || "");
  return `hsl(${h}, 65%, 45%)`;
}
function hashStringToHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % 360;
}
