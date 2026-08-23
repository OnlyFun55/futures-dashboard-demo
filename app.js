/* ============================================================
   app.js — rendering, navigation, interactions
   Requires window.BT + window.BTCharts
   ============================================================ */
(function () {
  "use strict";
  const BT = window.BT, C = window.BTCharts, M = BT.METRIC_META;

  // ── persisted UI state ────────────────────────────────────
  const LS = "btdash_v1";
  const saved = (() => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } 
})();
  const KEPT_VIEWS = ["monitor", "portfolio", "leverage", "okxlive"];
  const ASSET_COLORS = { XRP: "#38bdf8", ZEC: "#a78bfa", PAXG: "#fbbf24", MU: "#34d399", SNDK: "#f472b6" };
  const state = {
    view: KEPT_VIEWS.includes(saved.view) ? saved.view : "monitor",
    layout: saved.layout || "cards",            // cards | matrix | spotlight
    accent: saved.accent || "emerald",          // emerald | blue | amber
    density: saved.density || "comfortable",    // comfortable | compact
    spotlight: saved.spotlight || "ultimate",
    detailTab: "overview",
    focus: [],                                  // comparison chart focus ids
    compMode: "current",                        // current | best
  };
  function persist() {
    localStorage.setItem(LS, JSON.stringify({
      view: state.view, layout: state.layout, accent: state.accent,
      density: state.density, spotlight: state.spotlight,
    }));
  }

  const ACCENTS = {
    emerald: "#34d399", blue: "#38bdf8", amber: "#fbbf24",
  };

  // chart lifecycle
  let liveCharts = [];
  function clearCharts() { liveCharts.forEach((c) => { try { c.destroy(); } catch (e) {} }); liveCharts = []; }

  // ── tiny DOM helpers ──────────────────────────────────────
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }

  // bar scale per metric (for mini-bars)
  const BAR_MAX = { return_pct: 200, cagr_pct: 200, sortino: 12, sharpe: 4, profit_factor: 3, win_rate: 100, max_dd: 60, expectancy_r: 1.6, alpha_pct: 150, score: 5 };
  function barPct(key, v) {
    const max = BAR_MAX[key] || 1;
    return Math.max(2, Math.min(100, Math.abs(v) / max * 100));
  }
  function vClass(key, v) { return "v-" + BT.verdict(key, v); }

  // ============================================================
  //  SIDEBAR
  // ============================================================
  function navItem(id, glyph, label, sub) {
    const active = state.view === id;
    const color = id === "comparison" || id === "history" ? "var(--accent)" :
      BT.byId(id) ? BT.byId(id).color : "var(--accent)";
    return `<button class="nav-item${active ? " active" : ""}" data-nav="${id}">
      <span class="nav-dot" style="--c:${color}"></span>
      <span class="nav-glyph">${glyph}</span>
      <span class="nav-label">${label}<em>${sub}</em></span>
    </button>`;
  }

  function renderSidebar() {
    const sb = $("#sidebar");
    let ctx = "";
    if (BT.STRATEGIES.some(s => s.id === state.view)) {
      const s = BT.byId(state.view);
      ctx = `<div class="side-card" style="--c:${s.color}">
        <div class="side-card-h">${s.glyph} ${s.name}</div>
        <div class="side-card-sub">${esc(s.sub)}</div>
        <dl class="side-kv">
          <dt>Symbol</dt><dd>${s.symbol}</dd>
          <dt>Timeframe</dt><dd>${s.tf}</dd>
          <dt>Capital</dt><dd>$1,000</dd>
          <dt>Leverage</dt><dd>${s.leverage}x</dd>
        </dl>
      </div>`;
    } else if (state.view === "monthly") {
      const md = window.BT_MONTHLY || {};
      const gate = md.display_gate || "?";
      const gateColor = gate === "PASS" ? "var(--pos)" : gate === "PASS_WITH_NOTE" ? "var(--warn)" : "var(--neg)";
      const comb = md.combined_oos || {};
      ctx = `<div class="side-card" style="--c:${gateColor}">
        <div class="side-card-h">📅 Monthly Regime</div>
        <div class="side-card-sub">Phase 0 · IS 12mo + OOS 9mo</div>
        <dl class="side-kv">
          <dt>Gate</dt><dd style="color:${gateColor}">${gate}</dd>
          <dt>OOS cum</dt><dd>+${(comb.cumulative_pct||0).toFixed(1)}%</dd>
          <dt>OOS avg/mo</dt><dd>+${(comb.avg_per_month||0).toFixed(2)}%</dd>
          <dt>Assets</dt><dd>BTC · ETH · SOL</dd>
          <dt>Generated</dt><dd style="font-size:10px">${md.generated || '—'}</dd>
        </dl>
      </div>`;
    } else if (state.view === "robustness") {
      const mw = BT.MULTIWINDOW || {};
      const wins = mw.windows || [];
      ctx = `<div class="side-card" style="--c:var(--accent)">
        <div class="side-card-h">📊 Robustness Test</div>
        <div class="side-card-sub">Fixed params · ${wins.length} windows · ~1.5 ปี</div>
        <dl class="side-kv">
          <dt>Generated</dt><dd>${mw.generated || '—'}</dd>
          <dt>Windows</dt><dd>${wins.length} × 90d</dd>
        </dl>
      </div>`;
    } else if (state.view === "comparison") {
      ctx = `<div class="side-card" style="--c:var(--accent)">
        <div class="side-card-h">Strategy Comparison</div>
        <div class="side-card-sub">เปรียบเทียบ ${BT.STRATEGIES.length} กลยุทธ์ side-by-side</div>
        <dl class="side-kv">
          ${BT.STRATEGIES.map((s) => `<dt>${s.glyph} ${s.name}</dt><dd>${s.symbol} ${s.tf}</dd>`).join("")}
        </dl>
      </div>`;
    }
    sb.innerHTML = `
      <div class="brand">
        <div class="brand-mark">◇</div>
        <div class="brand-txt">Futures<br><strong>Dashboard</strong></div>
      </div>
      <nav class="nav">
        <button class="nav-item${state.view === "monitor" ? " active" : ""}" data-nav="monitor" style="border:1px solid color-mix(in oklch,var(--pos) 30%,transparent);background:color-mix(in oklch,var(--pos) 7%,transparent)">
          <span class="nav-dot" style="--c:var(--pos)"></span>
          <span class="nav-glyph">🛰</span>
          <span class="nav-label">Live Monitor<em>paper $10k · 5 ขา</em></span>
        </button>
        <div class="nav-sep"></div>
        <div class="nav-group-label" style="margin-top:2px">ผลเทสอ้างอิง</div>
        ${navItem("portfolio", "🧬", "Portfolio Mix", "core + TradFi satellite")}
        ${navItem("leverage", "🎚", "Leverage Lab", "futures + leverage analysis")}
        <div class="nav-sep"></div>
        <div class="nav-group-label" style="margin-top:2px">บัญชีจริง (read-only)</div>
        ${navItem("okxlive", "🟢", "OKX Live", "daily + weekly loop จริงบน OKX")}
      </nav>
      ${ctx}
      <div class="side-status">
        <span class="dot-live"></span> โหลดจาก cache
        <div class="side-status-sub">Portfolio Mix · Live Monitor</div>
      </div>
      <div class="side-actions">
        <button class="btn btn-ghost" id="btn-refresh">↻ Refresh Data</button>
      </div>`;

    $$("[data-nav]", sb).forEach((b) => b.onclick = () => go(b.dataset.nav));
    $("#btn-refresh", sb).onclick = () => {
      if (state.view === "monitor") toast("รันคำสั่งนี้แล้วรีเฟรชหน้า: python run_monitor.py");
      else toast("รีเฟรชข้อมูลแล้ว · Binance OHLCV");
    };
  }

  // ============================================================
  //  TOPBAR
  // ============================================================
  function renderTopbar() {
    const tb = $("#topbar");
    const titles = {
      monitor: ["🛰 Live Monitor", "Paper portfolio $10,000 · XRP20/ZEC20/PAXG40/MU10/SNDK10 · รันแล้วอัปเดตที่นี่"],
      comparison: ["Strategy Comparison", "เปรียบเทียบ 3 กลยุทธ์บนข้อมูลชุดเดียวกัน · params = optimized"],
      teelek: ["TeeLek — 2-Pole Filter", "Trend-following · BTC/USDT 1h"],
      ultimate: ["Ultimate — TEMA/LSMA + IDEAL + REV", "Multi-signal · BTC/USDT 1d"],
      bestpos: ["BestPosition — DCA", "Accumulator · BTC/USDT 4h"],
      robustness: ["Multi-Window Robustness", "Fixed params tested across different market periods"],
      history: ["Run History", "ประวัติการรัน optimization ทั้งหมด"],
      monthly: ["Monthly Rolling Regime Engine", "Phase 0 Truth Check · IS 12mo + OOS 9mo · BTC / ETH / SOL"],
      gridv2:  ["Grid Search V2", "15,600 epoch search · 13 asset combos · 5 TF · deduplicated"],
      bearcompare: ["BEAR Strategy Comparison", "TL-1d vs Pure Cash vs TL-4h · 54 months"],
      portfolio: ["Portfolio Mix Optimizer", "350 setups · IS→OOS walk-forward · จาก correlation scan 2026-07-05 · รวม TradFi Mix (หุ้น/ETF) ไว้ท้ายหน้า"],
      leverage: ["🎚 Leverage Lab", "วิเคราะห์การเทรด core เป็น futures มี leverage — เป็นการวิเคราะห์ข้อมูลย้อนหลัง ไม่ใช่คำแนะนำการลงทุน"],
      okxlive: ["🟢 OKX Live", "อ่านอย่างเดียวจากบัญชีจริง (read-only key) · Claude ไม่ส่งคำสั่งซื้อขายเด็ดขาด — คุณกดเองเสมอ"],
      progress: ["📈 Development Progress", "เปรียบเทียบทุก phase — เราพัฒนาไปในทิศทางที่ดีใช่ไหม?"],
    };
    const [t, sub] = titles[state.view] || titles["portfolio"];
    const showLayout = state.view === "comparison";
    tb.innerHTML = `
      <div class="tb-title">
        <h1>${esc(t)}</h1>
        <p>${esc(sub)}</p>
      </div>
      <div class="tb-right">
        <div class="tb-chip" style="color:var(--accent)"><span>BUILD</span> v11-tradfi</div>
        <div class="tb-chip"><span>SYMBOL</span> BTC/USDT</div>
        <div class="tb-chip"><span>RUN</span> ${BT.generated_at || "—"}</div>
        ${showLayout ? `<div class="seg" id="layout-seg">
          <button data-layout="cards"${state.layout === "cards" ? " class='on'" : ""}>Cards</button>
          <button data-layout="matrix"${state.layout === "matrix" ? " class='on'" : ""}>Matrix</button>
          <button data-layout="spotlight"${state.layout === "spotlight" ? " class='on'" : ""}>Spotlight</button>
        </div>` : ""}
        <button class="icon-btn" id="btn-display" title="Display settings">⚙</button>
      </div>`;
    if (showLayout) $$("#layout-seg button", tb).forEach((b) => b.onclick = () => { state.layout = b.dataset.layout; persist(); render(); });
    $("#btn-display", tb).onclick = openDisplay;
  }

  // ── Utility helpers ───────────────────────────────────────
  function go(id) {
    if (id === "comparison" || id === "history" || id === "robustness" || id === "monthly") state.detailTab = "overview";
    state.view = id; persist(); render();
  }
  function toast(msg) {
    let t = document.getElementById("_toast");
    if (!t) { t = document.createElement("div"); t.id = "_toast"; t.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1e2330;border:1px solid var(--line);color:var(--tx-1);padding:9px 18px;border-radius:8px;font-size:13px;z-index:999;transition:opacity .3s"; document.body.appendChild(t); }
    t.textContent = msg; t.style.opacity = "1";
    clearTimeout(t._tid); t._tid = setTimeout(() => { t.style.opacity = "0"; }, 2500);
  }
  function simulateRun() { toast("เปิด terminal แล้วรัน: python generate_data_js.py --aligned"); }

  // ── Display popover (theme / density) ─────────────────────
  function openDisplay() {
    let pop = $("#display-pop");
    if (pop) { pop.remove(); return; }
    pop = document.createElement("div");
    pop.id = "display-pop";
    pop.className = "popover";
    pop.innerHTML = `
      <div class="pop-h">Display</div>
      <div class="pop-row"><label>Accent</label>
        <div class="seg sm" id="acc-seg">
          ${Object.keys(ACCENTS).map((a) => `<button data-acc="${a}"${state.accent === a ? " class='on'" : ""}><i style="background:${ACCENTS[a]}"></i>${a}</button>`).join("")}
        </div></div>
      <div class="pop-row"><label>Density</label>
        <div class="seg sm" id="den-seg">
          <button data-den="comfortable"${state.density === "comfortable" ? " class='on'" : ""}>Comfortable</button>
          <button data-den="compact"${state.density === "compact" ? " class='on'" : ""}>Compact</button>
        </div></div>
      <div class="pop-note">Comparison layout สลับได้ที่ปุ่ม Cards / Matrix / Spotlight ด้านบน</div>`;
    $(".tb-right").appendChild(pop);
    $$("#acc-seg button", pop).forEach((b) => b.onclick = () => { state.accent = b.dataset.acc; persist(); applyTheme(); pop.remove(); render(); });
    $$("#den-seg button", pop).forEach((b) => b.onclick = () => { state.density = b.dataset.den; persist(); applyTheme(); pop.remove(); render(); });
    setTimeout(() => document.addEventListener("click", function close(e) {
      if (!pop.contains(e.target) && e.target.id !== "btn-display") { pop.remove(); document.removeEventListener("click", close); }
    }), 0);
  }

  function applyTheme() {
    document.documentElement.style.setProperty("--accent", ACCENTS[state.accent]);
    document.body.dataset.density = state.density;
  }

  // ============================================================
  //  COMPARISON VIEW
  // ============================================================
  function optBanner() {
    return `<div class="opt-banner">
      <span class="ok">✓</span> ผล optimization ล่าสุด · จากปุ่ม <b>🚀 Run All Optimization</b>
      <span class="opt-banner-meta">4,048 combinations · 4 timeframes · 365 วัน</span>
    </div>`;
  }

  function metricBars(s, keys) {
    return keys.map((k) => {
      const v = s.metrics[k]; if (v == null) return "";
      const win = BT.winners[k] === s.id;
      return `<div class="mbar ${vClass(k, v)}${win ? " is-winner" : ""}">
        <span class="mbar-k">${M[k].label}${win ? " <i class='win'>BEST</i>" : ""}</span>
        <span class="mbar-track"><span class="mbar-fill" style="width:${barPct(k, v)}%"></span></span>
        <span class="mbar-v">${M[k].fmt(v)}</span>
      </div>`;
    }).join("");
  }

  function strategyCard(s, big) {
    const m = s.metrics;
    const scoreTxt = s.score >= 9999 ? "9999" : s.score.toFixed(3);
    return `<article class="scard${big ? " big" : ""}" style="--c:${s.color}">
      <header class="scard-h">
        <div class="badge" style="background:${C.hexA(s.color, 0.16)};color:${s.color}">${s.glyph}</div>
        <div class="scard-name"><b>${s.name}</b><em>${esc(s.sub)}</em></div>
        <div class="score-pill" title="composite score">SCORE<br><b>${scoreTxt}</b></div>
      </header>
      <div class="chips">
        <span class="chip"><i>📅</i>${s.range[0]} → ${s.range[1]}</span>
        <span class="chip">TF ${s.tf}</span>
        <span class="chip">Lev ${s.leverage}x</span>
      </div>
      <div class="ret-block">
        <div class="ret-label">Return (backtest)</div>
        <div class="ret-big ${m.return_pct >= 0 ? "pos" : "neg"}">${M.return_pct.fmt(m.return_pct)}</div>
        <canvas class="spark" data-spark="${s.id}" height="${big ? 64 : 46}"></canvas>
      </div>
      <div class="kpi-row">
        <div class="kpi ${vClass("cagr_pct", m.cagr_pct)}"><span>CAGR</span><b>${M.cagr_pct.fmt(m.cagr_pct)}</b></div>
        <div class="kpi ${vClass("max_dd", m.max_dd)}"><span>Max DD</span><b>${M.max_dd.fmt(m.max_dd)}</b></div>
        <div class="kpi ${vClass("win_rate", m.win_rate)}"><span>Win</span><b>${M.win_rate.fmt(m.win_rate)}</b></div>
        <div class="kpi ${vClass("profit_factor", m.profit_factor)}"><span>PF</span><b>${M.profit_factor.fmt(m.profit_factor)}</b></div>
      </div>
      <div class="mbars">${metricBars(s, ["sortino", "sharpe", "expectancy_r", "alpha_pct"])}</div>
      <details class="params"${big ? " open" : ""}>
        <summary>⚙ Optimized Parameters</summary>
        <div class="param-grid">
          ${s.params.map(([k, v]) => `<code><span>${k}</span><b>${v}</b></code>`).join("")}
        </div>
      </details>
      <button class="btn btn-detail" data-detail="${s.id}">เปิดรายละเอียด · TradingView →</button>
    </article>`;
  }

  function matrixView() {
    const cols = BT.STRATEGIES;
    const head = `<tr><th class="mx-metric">Metric</th>${cols.map((s) => `<th style="--c:${s.color}"><span class="mx-badge">${s.glyph}</span>${s.name}<em>${s.tf}</em></th>`).join("")}</tr>`;
    const rows = BT.METRIC_ORDER.map((k) => {
      const cells = cols.map((s) => {
        const v = s.metrics[k]; if (v == null) return `<td class="mx-na">—</td>`;
        const win = BT.winners[k] === s.id;
        return `<td class="${vClass(k, v)}${win ? " is-winner" : ""}">
          <div class="mx-cell">
            <span class="mx-bar"><span style="width:${barPct(k, v)}%;background:${s.color}"></span></span>
            <span class="mx-v">${M[k].fmt(v)}${win ? " <i class='win'>★</i>" : ""}</span>
          </div></td>`;
      }).join("");
      return `<tr><th class="mx-metric">${M[k].label}<em>${M[k].dir > 0 ? "higher better" : "shallower better"}</em></th>${cells}</tr>`;
    }).join("");
    return `<div class="matrix-wrap"><table class="matrix">${head}${rows}</table></div>`;
  }

  function spotlightView() {
    const feat = BT.byId(state.spotlight);
    const others = BT.STRATEGIES.filter((s) => s.id !== feat.id);
    return `<div class="spotlight">
      <div class="spot-main">
        <div class="spot-tabs">${BT.STRATEGIES.map((s) => `<button data-spot="${s.id}"${s.id === feat.id ? " class='on'" : ""} style="--c:${s.color}">${s.glyph} ${s.name}</button>`).join("")}</div>
        ${strategyCard(feat, true)}
      </div>
      <div class="spot-side">${others.map((s) => strategyCard(s, false)).join("")}</div>
    </div>`;
  }

  function comparisonView() {
    let body;
    if (state.layout === "matrix") body = matrixView();
    else if (state.layout === "spotlight") body = spotlightView();
    else body = `<div class="cards">${BT.STRATEGIES.map((s) => strategyCard(s, false)).join("")}</div>`;

    return `${optBanner()}
      ${body}
      <section class="panel chart-panel">
        <div class="panel-h">
          <h2>Equity Curves — Return % เปรียบเทียบ</h2>
          <div class="legend" id="cmp-legend">
            ${BT.STRATEGIES.map((s) => `<button class="lg" data-focus="${s.id}" style="--c:${s.color}"><i></i>${s.name}</button>`).join("")}
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex:none">
            <button id="cmp-mode-btn" class="tb-chip${state.compMode === "best" ? " on" : ""}" data-compmode="toggle"
              style="cursor:pointer;font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid ${state.compMode==="best"?"var(--good)":"rgba(255,255,255,0.12)"};background:${state.compMode==="best"?"color-mix(in oklch,var(--good) 15%,transparent)":"transparent"};color:${state.compMode==="best"?"var(--good)":"var(--muted)"}">
              ★ Best Ever
            </button>
            <div class="range-btns" id="cmp-range">
              <button data-r="1m">1M</button><button data-r="3m">3M</button>
              <button data-r="6m">6M</button><button data-r="all" class="on">All</button>
            </div>
          </div>
        </div>
        ${state.compMode === "best" && BT.BEST_EQUITY ? `<div style="display:flex;gap:16px;padding:4px 0 8px;font-size:11px;color:var(--muted)">
          ${BT.STRATEGIES.map(s => {
            const b = BT.BEST_EQUITY[s.id];
            return b ? `<span style="color:${s.color}">★ ${s.name}: <b style="color:var(--good)">${b.ret >= 0 ? "+" : ""}${b.ret}%</b> <span style="opacity:.6">(${b.ts.replace(" UTC","")})</span></span>` : "";
          }).join("")}
        </div>` : ""}
        <div class="chart lg-chart" id="cmp-chart"></div>
      </section>`;
  }

  // ============================================================
  //  STRATEGY DETAIL VIEW
  // ============================================================
  function metricStrip(s) {
    const m = s.metrics;
    const items = [
      ["return_pct", m.return_pct], ["cagr_pct", m.cagr_pct], ["sortino", m.sortino],
      ["sharpe", m.sharpe], ["profit_factor", m.profit_factor], ["win_rate", m.win_rate],
      ["max_dd", m.max_dd], ["expectancy_r", m.expectancy_r], ["alpha_pct", m.alpha_pct],
    ];
    return `<div class="strip">${items.map(([k, v]) => `
      <div class="strip-cell ${vClass(k, v)}">
        <span>${M[k].label}</span><b>${M[k].fmt(v)}</b>
      </div>`).join("")}</div>`;
  }

  function tradesTable(s) {
    const rows = s.trades.slice().reverse().map((t) => `<tr class="${t.win ? "tr-win" : "tr-loss"}">
      <td class="tnum">${t.ts}</td>
      <td><span class="side ${t.side}">${t.side === "long" ? "▲ Long" : "▼ Short"}</span></td>
      <td class="tnum">$${t.entry.toLocaleString()}</td>
      <td class="tnum">$${t.exit.toLocaleString()}</td>
      <td class="tnum">${t.qty}</td>
      <td class="tnum ${t.pnl >= 0 ? "pos" : "neg"}">${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(2)}</td>
      <td><span class="reason">${t.reason}</span></td>
    </tr>`).join("");
    return `<div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>เวลา</th><th>ทิศทาง</th><th>ราคาเข้า</th><th>ราคาออก</th><th>Qty</th><th>PnL</th><th>เหตุผล</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  // ── TV-style: Profit Structure horizontal bar ─────────────────
  function profitStructureBar(ts) {
    if (!ts || !ts.gross_profit) return '';
    const gp = ts.gross_profit, gl = ts.gross_loss, net = gp + gl;
    const total = Math.max(Math.abs(gp) + Math.abs(gl), 1);
    const gpW = (Math.abs(gp) / total * 100).toFixed(1);
    const fmt  = (v) => (v >= 0 ? "+" : "") + "$" + Math.abs(v).toFixed(0);
    return `
    <div style="margin:4px 0 8px">
      <div style="display:flex;height:26px;border-radius:6px;overflow:hidden;gap:2px">
        <div style="width:${gpW}%;background:var(--pos);opacity:.8;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#04140c;min-width:30px">${fmt(gp)}</div>
        <div style="flex:1;background:var(--neg);opacity:.7;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff">${fmt(gl)}</div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:12px">
        <div style="text-align:center">
          <div style="font-size:10px;color:var(--tx-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">Gross Profit</div>
          <div style="font-family:var(--mono);font-size:15px;color:var(--pos)">+$${gp.toFixed(2)}</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:10px;color:var(--tx-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">Net P&amp;L</div>
          <div style="font-family:var(--mono);font-size:15px;color:${net >= 0 ? "var(--pos)" : "var(--neg)"}">${net >= 0 ? "+" : ""}$${net.toFixed(2)}</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:10px;color:var(--tx-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">Gross Loss</div>
          <div style="font-family:var(--mono);font-size:15px;color:var(--neg)">$${gl.toFixed(2)}</div>
        </div>
      </div>
    </div>`;
  }

  // ── TV-style: Trades distribution donut SVG ────────────────────
  function tradeDonut(ts) {
    if (!ts) return '';
    const total = (ts.n_winners || 0) + (ts.n_losers || 0) + (ts.n_breakeven || 0);
    if (total === 0) return '<div style="color:var(--tx-3);padding:20px;text-align:center">No trades</div>';
    const W = ts.n_winners || 0, L = ts.n_losers || 0, B = ts.n_breakeven || 0;
    const r = 44, cx = 56, cy = 56;
    function arc(startFrac, endFrac, col) {
      if (endFrac - startFrac < 0.001) return '';
      if (endFrac - startFrac >= 0.9999) endFrac = startFrac + 0.9998;
      const a0 = startFrac * 2 * Math.PI - Math.PI / 2;
      const a1 = endFrac   * 2 * Math.PI - Math.PI / 2;
      const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
      const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
      const large = (endFrac - startFrac) > 0.5 ? 1 : 0;
      return `<path d="M${cx},${cy} L${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z" fill="${col}" opacity=".85"/>`;
    }
    const wf = W / total, lf = L / total;
    const svgArcs = arc(0, wf, "var(--pos)") + arc(wf, wf + lf, "var(--neg)") + arc(wf + lf, 1, "var(--mid)");
    const wr = ((W / total) * 100).toFixed(0);
    return `<svg viewBox="0 0 112 112" width="112" height="112" style="flex:none">
      ${svgArcs}
      <circle cx="${cx}" cy="${cy}" r="30" fill="var(--panel)"/>
      <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="14" font-weight="700" fill="var(--pos)" font-family="var(--mono)">${wr}%</text>
      <text x="${cx}" y="${cy + 11}" text-anchor="middle" font-size="9" fill="var(--tx-3)">win rate</text>
    </svg>`;
  }

  // ── TV-style: ROI Histogram SVG ───────────────────────────────
  function roiHistogram(ts) {
    if (!ts || !ts.roi_hist || !ts.roi_hist.length) return '';
    const hist = ts.roi_hist;
    const maxCount = Math.max(...hist.map(b => b.count), 1);
    const W = 460, H = 90;
    const barW = Math.max(3, Math.floor(W / hist.length) - 1);
    const bars = hist.map((b, i) => {
      const x = Math.round(i * (W / hist.length));
      const h = Math.max(2, Math.round(b.count / maxCount * H));
      const col = b.lo >= 0 ? "var(--pos)" : "var(--neg)";
      return `<rect x="${x}" y="${H - h}" width="${barW}" height="${h}" fill="${col}" opacity=".75" rx="1"/>`;
    }).join("");
    const zeroIdx = hist.findIndex(b => b.lo <= 0 && b.hi > 0);
    const zeroX = zeroIdx >= 0 ? Math.round(zeroIdx * (W / hist.length)) : -1;
    const zeroline = zeroX >= 0 ? `<line x1="${zeroX}" y1="0" x2="${zeroX}" y2="${H}" stroke="var(--tx-2)" stroke-width="1" stroke-dasharray="3,3"/>` : '';
    const lbls = [];
    if (hist.length) lbls.push(`<text x="2" y="${H+13}" font-size="9" fill="var(--tx-3)" font-family="var(--mono)">${hist[0].lo.toFixed(1)}%</text>`);
    if (zeroIdx > 0) lbls.push(`<text x="${zeroX}" y="${H+13}" font-size="9" fill="var(--tx-2)" text-anchor="middle" font-family="var(--mono)">0%</text>`);
    lbls.push(`<text x="${W}" y="${H+13}" font-size="9" fill="var(--tx-3)" text-anchor="end" font-family="var(--mono)">${hist[hist.length-1].hi.toFixed(1)}%</text>`);
    return `<div style="overflow-x:auto">
      <svg viewBox="0 0 ${W} ${H+16}" width="100%" style="display:block">
        ${zeroline}${bars}${lbls.join("")}
      </svg>
    </div>`;
  }

  // ── Performance Tab ───────────────────────────────────────────
  function performanceTab(s) {
    const ts = s.tradeStats || {};
    const n  = (ts.n_winners || 0) + (ts.n_losers || 0) + (ts.n_breakeven || 0);
    const fmtPnl = (v) => (v == null || v === 0) ? "—" : (v >= 0 ? "+" : "") + "$" + Math.abs(v).toFixed(2);
    return `
      <section class="panel">
        <div class="panel-h"><h2>Profit Structure</h2></div>
        ${profitStructureBar(ts)}
      </section>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <section class="panel">
          <div class="panel-h"><h2>Trades Distribution</h2></div>
          <div style="display:flex;align-items:center;gap:16px">
            ${tradeDonut(ts)}
            <div style="flex:1">
              ${[["var(--pos)","Winners",ts.n_winners||0],["var(--neg)","Losers",ts.n_losers||0],["var(--mid)","Breakeven",ts.n_breakeven||0]].map(([col,lbl,cnt]) =>
                `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                  <span style="width:9px;height:9px;border-radius:50%;background:${col};flex:none"></span>
                  <span style="font-size:12px;flex:1">${lbl}</span>
                  <b class="tnum" style="color:${col}">${cnt}</b>
                </div>`).join("")}
              <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--line);font-size:11px;color:var(--tx-3)">Total: ${n}</div>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-h"><h2>Long · Short Breakdown</h2></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;margin-bottom:12px">
            <div style="padding:8px 0;border-right:1px solid var(--line)">
              <div style="font-size:10px;color:var(--tx-3);text-transform:uppercase;margin-bottom:5px">Long</div>
              <div class="tnum" style="font-size:22px;font-weight:700;color:var(--pos)">${ts.n_long || 0}</div>
              <div style="font-size:11px;color:var(--tx-2);margin-top:3px">Win ${ts.wr_long != null ? ts.wr_long.toFixed(0) : "—"}%</div>
            </div>
            <div style="padding:8px 0 8px 14px">
              <div style="font-size:10px;color:var(--tx-3);text-transform:uppercase;margin-bottom:5px">Short</div>
              <div class="tnum" style="font-size:22px;font-weight:700;color:var(--neg)">${ts.n_short || 0}</div>
              <div style="font-size:11px;color:var(--tx-2);margin-top:3px">Win ${ts.wr_short != null ? ts.wr_short.toFixed(0) : "—"}%</div>
            </div>
          </div>
          <div style="border-top:1px solid var(--line);padding-top:10px">
            ${[["Avg PnL / trade", fmtPnl(ts.avg_pnl), (ts.avg_pnl||0)>=0?"var(--pos)":"var(--neg)"],
               ["Avg bars held", ts.avg_hold_bars ? ts.avg_hold_bars.toFixed(0)+" bars" : "—", ""],
              ].map(([lbl,val,col]) =>
                `<div style="display:flex;justify-content:space-between;margin-bottom:7px">
                  <span style="font-size:11px;color:var(--tx-3)">${lbl}</span>
                  <b class="tnum" style="font-size:12px${col?";color:"+col:""}">${val}</b>
                </div>`).join("")}
          </div>
        </section>
      </div>

      <section class="panel">
        <div class="panel-h"><h2>Trade Analysis</h2></div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0;border:1px solid var(--line);border-radius:var(--r-sm);overflow:hidden;margin-bottom:16px">
          ${[["Largest Profit",fmtPnl(ts.largest_profit),"var(--pos)"],["Avg Win",fmtPnl(ts.avg_win),"var(--pos)"],
             ["Avg Loss",fmtPnl(ts.avg_loss),"var(--neg)"],["Largest Loss",fmtPnl(ts.largest_loss),"var(--neg)"]].map(([lbl,val,col],i) => `
            <div style="padding:12px${i<3?";border-right:1px solid var(--line)":""};background:var(--panel)">
              <div style="font-size:10px;color:var(--tx-3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px">${lbl}</div>
              <div class="tnum" style="font-size:14px;font-weight:600;color:${col}">${val}</div>
            </div>`).join("")}
        </div>
        <div style="font-size:10px;color:var(--tx-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">ROI Distribution per Trade (% of capital)</div>
        ${roiHistogram(ts)}
      </section>`;
  }

  // ── Drawdowns Tab ─────────────────────────────────────────────
  function drawdownsTab(s) {
    const dd = s.ddStats  || {};
    const m  = s.metrics;
    const cap = s.startCapital || 1000;
    const kpi = (label, val, col) => `
      <div style="background:var(--bg-2);border:1px solid var(--line);border-radius:var(--r-sm);padding:13px 15px">
        <div style="font-size:10px;color:var(--tx-3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px">${label}</div>
        <div class="tnum" style="font-size:17px;font-weight:700${col?";color:"+col:""}">${val}</div>
      </div>`;
    const fmtBars = (b) => {
      if (!b || b <= 0) return "—";
      const mins = {"15m":15,"30m":30,"1h":60,"4h":240,"1d":1440}[s.tf] || 60;
      const h = Math.round(b * mins / 60);
      return h < 24 ? h + "h" : Math.round(h / 24) + "d";
    };
    const maxRunup = Math.abs(dd.max_runup_pct || 0);
    const maxDd    = Math.abs(dd.max_dd_pct    || m.max_dd || 0);
    const scale    = Math.max(maxRunup, maxDd, 1);
    return `
      <section class="panel">
        <div class="panel-h"><h2>Equity Run-ups &amp; Drawdowns</h2></div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:10px">
          ${kpi("Max Drawdown", "-" + maxDd.toFixed(1) + "%", "var(--neg)")}
          ${kpi("Current DD",   (dd.current_dd_pct||0) <= -0.1 ? (dd.current_dd_pct||0).toFixed(1)+"%" : "0%", dd.current_dd_pct < -5 ? "var(--neg)" : "")}
          ${kpi("Avg DD Duration", fmtBars(dd.avg_dd_bars), "")}
          ${kpi("DD Periods", String(dd.n_drawdowns || 0), "")}
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px">
          ${kpi("Max Run-up", "+" + maxRunup.toFixed(1) + "%", "var(--pos)")}
          ${kpi("Avg Runup Duration", fmtBars(dd.avg_runup_bars), "")}
          ${kpi("Max Runup Duration", fmtBars(dd.max_runup_bars), "")}
          ${kpi("Runup Periods", String(dd.n_runups || 0), "")}
        </div>
        <div style="font-size:10px;color:var(--tx-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">Growth vs Decline</div>
        ${[["▲ Max Run-up","var(--pos)",maxRunup,(maxRunup/scale*100).toFixed(1)],
           ["▼ Max Drawdown","var(--neg)",maxDd,(maxDd/scale*100).toFixed(1)]].map(([lbl,col,val,w]) => `
          <div style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px">
              <span style="color:${col}">${lbl}</span>
              <span class="tnum" style="color:${col}">${col === "var(--pos)" ? "+" : "-"}${val.toFixed(1)}%</span>
            </div>
            <div style="height:12px;background:var(--bg-2);border-radius:4px;overflow:hidden">
              <div style="height:100%;width:${w}%;background:${col};opacity:.7;border-radius:4px;transition:width .4s"></div>
            </div>
          </div>`).join("")}
      </section>

      <section class="panel">
        <div class="panel-h"><h2>Capital Efficiency</h2></div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:10px">
          ${kpi("CAGR", (m.cagr_pct>=0?"+":"")+m.cagr_pct.toFixed(0)+"%", m.cagr_pct>0?"var(--pos)":"var(--neg)")}
          ${kpi("Account Required", "$"+cap.toLocaleString(), "")}
          ${kpi("Net Return", (m.return_pct>=0?"+":"")+m.return_pct.toFixed(1)+"%", m.return_pct>0?"var(--pos)":"var(--neg)")}
          ${kpi("Profit Factor", m.profit_factor.toFixed(2), m.profit_factor>1.5?"var(--good)":m.profit_factor>1?"":"var(--bad)")}
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
          ${kpi("Sortino", m.sortino.toFixed(2), m.sortino>1.5?"var(--good)":m.sortino>0?"":"var(--bad)")}
          ${kpi("Sharpe",  m.sharpe.toFixed(2),  m.sharpe>1?"var(--good)":m.sharpe>0?"":"var(--bad)")}
          ${kpi("Expectancy R", m.expectancy_r.toFixed(3), m.expectancy_r>0?"var(--pos)":"var(--neg)")}
          ${kpi("Alpha", (m.alpha_pct>=0?"+":"")+m.alpha_pct.toFixed(1)+"%", m.alpha_pct>0?"var(--pos)":"var(--neg)")}
        </div>
      </section>`;
  }

  // ── Money Management Tab (BestPos only) ───────────────────────
  function moneyMgmtTab(s) {
    const m   = s.metrics || {};
    const cap = s.startCapital || 10000;

    const util     = m.utilization_pct    ?? 0;
    const avgDep   = m.avg_deployed       ?? 0;
    const peakDep  = m.peak_deployed      ?? 0;
    const rodPct   = m.return_on_deployed ?? 0;
    const retPct   = m.return_pct         ?? 0;
    const avgDCA   = m.avg_dca_count      ?? 0;
    const nCycles  = m.n_cycles           ?? 0;
    const scale    = (s.params || []).find(p => p[0] === "dca_scale_factor")?.[1] ?? "1.0";
    const baseSize = (s.params || []).find(p => p[0] === "position_size_coin")?.[1] ?? "?";

    // Utilization gauge colour
    const utilCol = util >= 40 ? "#34d399" : util >= 20 ? "#fbbf24" : "#f87171";
    const utilBar = Math.min(100, util);

    // Pyramid: show what each DCA level costs at base size × scale^n
    const scaleF = parseFloat(scale) || 1.0;
    const baseF  = parseFloat(baseSize) || 0.05;
    const btcPrice = (BT.price || []).length ? BT.price[BT.price.length - 1].close : 100000;
    const maxLevels = 6;
    let cumCost = 0;
    const pyramidRows = Array.from({length: maxLevels}, (_, i) => {
      const qty   = baseF * Math.pow(scaleF, i);
      const cost  = qty * btcPrice;
      cumCost    += cost;
      const fits  = cumCost <= cap;
      const pctCap = Math.min(100, cost / cap * 100);
      const cumPct = Math.min(100, cumCost / cap * 100);
      return `<tr style="${!fits ? 'opacity:.35' : ''}">
        <td class="tnum" style="color:#a78bfa">L${i + 1}</td>
        <td class="tnum">${qty.toFixed(4)} BTC</td>
        <td class="tnum">$${cost.toFixed(0)}</td>
        <td class="tnum">${pctCap.toFixed(1)}% of capital</td>
        <td>
          <div style="display:flex;align-items:center;gap:6px">
            <div style="width:80px;height:6px;background:var(--line);border-radius:3px;overflow:hidden">
              <div style="width:${cumPct}%;height:100%;background:${fits?'#a78bfa':'#f87171'};border-radius:3px"></div>
            </div>
            <span style="font-size:.78em;opacity:.6">${cumPct.toFixed(0)}% cum.</span>
          </div>
        </td>
        <td style="font-size:.8em;opacity:.6">${fits ? '✓ OK' : '✗ out of cash'}</td>
      </tr>`;
    }).join('');

    // RoD vs total return comparison
    const rodCol = rodPct >= 0 ? "#34d399" : "#f87171";
    const retCol = retPct >= 0 ? "#34d399" : "#f87171";

    return `
      <section class="panel">
        <div class="panel-h"><h2>💰 Capital Utilization</h2></div>
        <div style="padding:0 16px 16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">
          <div style="background:color-mix(in oklch,${utilCol} 8%,var(--panel));border:1px solid color-mix(in oklch,${utilCol} 30%,var(--line));border-radius:10px;padding:14px 16px">
            <div style="font-size:.75em;opacity:.6;margin-bottom:4px;letter-spacing:.05em">AVG DEPLOYED</div>
            <div style="font-size:1.8em;font-weight:700;color:${utilCol}">${util.toFixed(1)}%</div>
            <div style="margin:8px 0 4px;height:8px;background:var(--line);border-radius:4px;overflow:hidden">
              <div style="width:${utilBar}%;height:100%;background:${utilCol};border-radius:4px;transition:width .4s"></div>
            </div>
            <div style="font-size:.75em;opacity:.5">$${avgDep.toFixed(0)} avg · $${peakDep.toFixed(0)} peak</div>
          </div>
          <div style="background:color-mix(in oklch,#a78bfa 8%,var(--panel));border:1px solid color-mix(in oklch,#a78bfa 30%,var(--line));border-radius:10px;padding:14px 16px">
            <div style="font-size:.75em;opacity:.6;margin-bottom:4px;letter-spacing:.05em">RETURN ON DEPLOYED</div>
            <div style="font-size:1.8em;font-weight:700;color:${rodCol}">${(rodPct >= 0 ? "+" : "") + rodPct.toFixed(1)}%</div>
            <div style="font-size:.78em;opacity:.5;margin-top:6px">vs. ${(retPct >= 0 ? "+" : "") + retPct.toFixed(1)}% on total capital</div>
            <div style="font-size:.75em;opacity:.5;margin-top:2px">Idle cash drag: ${(rodPct - retPct).toFixed(1)}pp</div>
          </div>
          <div style="background:color-mix(in oklch,#22d3ee 8%,var(--panel));border:1px solid color-mix(in oklch,#22d3ee 30%,var(--line));border-radius:10px;padding:14px 16px">
            <div style="font-size:.75em;opacity:.6;margin-bottom:4px;letter-spacing:.05em">DCA STATS</div>
            <div style="font-size:1.8em;font-weight:700;color:#22d3ee">${avgDCA.toFixed(1)}×</div>
            <div style="font-size:.78em;opacity:.5;margin-top:6px">avg entries per cycle · ${nCycles} cycles</div>
            <div style="font-size:.75em;opacity:.5;margin-top:2px">pyramid scale = ${scale}×</div>
          </div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-h"><h2>🔺 Pyramid DCA Ladder <span style="opacity:.5;font-weight:400;font-size:.85em">· base ${baseSize} BTC × ${scale}^level · BTC ≈ $${Math.round(btcPrice).toLocaleString()}</span></h2></div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Level</th><th>Size</th><th>Cost (USDT)</th><th>% of Capital</th><th>Cumulative</th><th>Status</th></tr></thead>
          <tbody>${pyramidRows}</tbody>
        </table></div>
        <div style="padding:8px 16px 4px;font-size:.8em;opacity:.5">
          Pyramid scale=${scale}: L${Math.round(avgDCA)}이 avg entry depth · each level ${scaleF > 1 ? ((scaleF - 1) * 100).toFixed(0) + "% larger than previous" : "same size (flat DCA)"}
        </div>
      </section>
      <section class="panel">
        <div class="panel-h"><h2>📐 Capital Efficiency Analysis</h2></div>
        <div style="padding:0 16px 16px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:12px">
            <div>
              <div style="font-size:.78em;opacity:.6;margin-bottom:6px">Problem: Idle cash drag</div>
              <div style="font-size:.85em;line-height:1.6;opacity:.8">
                ${util < 20
                  ? `⚠️ Only <strong>${util.toFixed(0)}%</strong> of capital deployed on avg. $${(cap - avgDep).toFixed(0)} sitting idle earning 0%.`
                  : util < 40
                  ? `🟡 <strong>${util.toFixed(0)}%</strong> deployed. Moderate idle cash — consider larger pyramid entries.`
                  : `✅ <strong>${util.toFixed(0)}%</strong> deployed — good capital efficiency for a DCA strategy.`}
              </div>
            </div>
            <div>
              <div style="font-size:.78em;opacity:.6;margin-bottom:6px">Impact on returns</div>
              <div style="font-size:.85em;line-height:1.6;opacity:.8">
                Return on deployed: <strong style="color:${rodCol}">${(rodPct >= 0 ? "+" : "") + rodPct.toFixed(1)}%</strong><br>
                Return on total:    <strong style="color:${retCol}">${(retPct >= 0 ? "+" : "") + retPct.toFixed(1)}%</strong><br>
                Idle drag: <strong>${(rodPct - retPct).toFixed(1)}pp</strong> lost to unused capital
              </div>
            </div>
          </div>
          <div style="background:var(--line);height:1px;margin:8px 0 12px"></div>
          <div style="font-size:.8em;opacity:.6;line-height:1.7">
            💡 <strong>Pyramid scaling (current: ${scale}×):</strong>
            ${scaleF === 1.0
              ? "Flat DCA — all entries same size. Optimizer may find 1.5–2× improves capital efficiency."
              : `Scale ${scale}× — each level ${((scaleF - 1) * 100).toFixed(0)}% larger. Deploys more capital at deeper price levels where conviction is higher.`}
          </div>
        </div>
      </section>`;
  }

  function detailView() {
    const s = BT.byId(state.view);
    const tab = state.detailTab;
    return `
      <div class="detail-head" style="--c:${s.color}">
        <button class="back" data-nav="comparison">← Comparison</button>
        <div class="badge lg" style="background:${C.hexA(s.color, 0.16)};color:${s.color}">${s.glyph}</div>
        <div class="dh-txt"><b>${s.name}</b><em>${esc(s.desc)}</em></div>
        <div class="dtabs">
          <button data-tab="overview"${tab === "overview" ? " class='on'" : ""}>📊 Overview</button>
          <button data-tab="performance"${tab === "performance" ? " class='on'" : ""}>📈 Performance</button>
          <button data-tab="drawdowns"${tab === "drawdowns" ? " class='on'" : ""}>📉 Drawdowns</button>
          <button data-tab="trades"${tab === "trades" ? " class='on'" : ""}>📋 Trades</button>
        </div>
      </div>
      ${metricStrip(s)}
      ${tab === "overview" ? `
        <section class="panel">
          <div class="panel-h">
            <h2>${s.symbol} · ${s.tf} — Price + ${s.overlays.map((o) => o.name).join(" / ")} + Entries</h2>
            <div class="legend">${s.overlays.map((o) => `<span class="lg static" style="--c:${o.color}"><i></i>${o.name}</span>`).join("")}
              <span class="lg static" style="--c:#34d399"><i></i>Long</span>
              <span class="lg static" style="--c:#f87171"><i></i>Short</span></div>
          </div>
          <div class="chart price-chart" id="d-price"></div>
          <div class="sub-label">Equity (USDT)</div>
          <div class="chart eq-chart" id="d-equity"></div>
          <div class="sub-label">Drawdown (%)</div>
          <div class="chart dd-chart" id="d-dd"></div>
        </section>
        <section class="panel">
          <div class="panel-h"><h2>Risk-Adjusted Metrics</h2></div>
          <div class="mbars wide">${metricBars(s, BT.METRIC_ORDER)}</div>
        </section>`
      : tab === "performance" ? performanceTab(s)
      : tab === "drawdowns"   ? drawdownsTab(s)
      : tab === "moneymgmt"   ? moneyMgmtTab(s)
      : `
        <section class="panel">
          <div class="panel-h"><h2>รายการเทรดทั้งหมด · ${s.trades.length} trades</h2>
            <div class="legend"><span class="lg static" style="--c:#34d399"><i></i>Win ${s.metrics.win_rate.toFixed(0)}%</span></div></div>
          ${tradesTable(s)}
        </section>`}
    `;
  }

  // ============================================================
  //  RUN HISTORY VIEW
  // ============================================================
  function historyView() {
    // Best value per column (highlight the cell, not the row)
    const bestTlRet  = Math.max(...BT.RUN_HISTORY.map(h => h.tl.ret));
    const bestTlDd   = Math.max(...BT.RUN_HISTORY.map(h => h.tl.dd));  // least negative = closest to 0
    const bestUltRet = Math.max(...BT.RUN_HISTORY.map(h => h.ult.ret));
    const bestUltDd  = Math.max(...BT.RUN_HISTORY.map(h => h.ult.dd));
    const bestBpRet  = Math.max(...BT.RUN_HISTORY.map(h => h.bp.ret));
    const bestBpDd   = Math.max(...BT.RUN_HISTORY.map(h => h.bp.dd));

    const retCell = (v, best) => {
      const win = v === best && best > 0;
      const cls = v >= 0 ? "pos" : "neg";
      const style = win ? ' style="background:color-mix(in oklch,var(--good) 12%,transparent);font-weight:600"' : '';
      return `<td class="tnum ${cls}"${style}>${win ? "★ " : ""}${v >= 0 ? "+" : ""}${v}%</td>`;
    };
    const ddCell = (v, best) => {
      const win = v === best;
      const style = win ? ' style="background:color-mix(in oklch,var(--good) 10%,transparent);font-weight:600"' : '';
      return `<td class="tnum neg"${style}>${v}%</td>`;
    };

    const hasDetails = (h) => (h.tl.tfDetails||[]).length || (h.ult.tfDetails||[]).length || (h.bp.tfDetails||[]).length;

    const rows = BT.RUN_HISTORY.map((h, idx) => {
      const clickable = hasDetails(h);
      const rowAttr = clickable ? ` class="hist-row clickable" data-idx="${idx}" style="cursor:pointer" title="คลิกเพื่อดูรายละเอียด TF"` : ` class="hist-row"`;
      return `<tr${rowAttr}>
        <td class="tnum">${h.ts}</td>
        <td>${h.tfs.join(" · ")}${clickable ? ' <span style="opacity:.5;font-size:.75em">🔍</span>' : ''}</td>
        <td class="tnum">${h.days}</td>
        <td class="tnum">${h.lev}x</td>
        <td class="tnum sep">${h.tl.combos}</td><td class="tnum">${h.tl.bestTf}</td>
        ${retCell(h.tl.ret, bestTlRet)}${ddCell(h.tl.dd, bestTlDd)}
        <td class="tnum sep">${h.ult.combos}</td><td class="tnum">${h.ult.bestTf}</td>
        ${retCell(h.ult.ret, bestUltRet)}${ddCell(h.ult.dd, bestUltDd)}
        <td class="tnum sep">${h.bp.combos}</td><td class="tnum">${h.bp.bestTf}</td>
        ${retCell(h.bp.ret, bestBpRet)}${ddCell(h.bp.dd, bestBpDd)}
      </tr>`;
    }).join("");

    // ── Modal HTML (injected once, reused) ──
    const modalHtml = `
    <div id="tf-modal" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);align-items:center;justify-content:center;">
      <div style="background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:24px;min-width:520px;max-width:90vw;max-height:80vh;overflow:auto;position:relative;">
        <button onclick="document.getElementById('tf-modal').style.display='none'"
          style="position:absolute;top:12px;right:14px;background:none;border:none;color:var(--tx-2);font-size:1.2em;cursor:pointer">✕</button>
        <h3 id="tf-modal-title" style="margin:0 0 16px;font-size:1em;color:var(--tx)"></h3>
        <div id="tf-modal-body"></div>
      </div>
    </div>`;

    setTimeout(() => {
      // Inject modal if not already present
      if (!document.getElementById('tf-modal')) {
        document.body.insertAdjacentHTML('beforeend', modalHtml);
      }
      // Bind click handlers
      document.querySelectorAll('.hist-row.clickable').forEach(row => {
        row.addEventListener('click', () => {
          const h = BT.RUN_HISTORY[+row.dataset.idx];
          document.getElementById('tf-modal-title').textContent = `📊 TF Breakdown — ${h.ts}  (${h.days}d window)`;

          const tfTable = (label, color, strat) => {
            const details = strat.tfDetails || [];
            if (!details.length) return '';
            const rows2 = details.map(d => {
              const isBest = d.tf === strat.bestTf;
              const retCls = d.ret >= 0 ? 'pos' : 'neg';
              const validBadge = d.valid === false
                ? '<span style="color:var(--bad);font-size:.75em">DD≥50%</span>'
                : '<span style="color:var(--good);font-size:.75em">✓</span>';
              const rowStyle = isBest ? 'background:color-mix(in oklch,'+color+' 10%,transparent);font-weight:600' : '';
              const metric = d.cycles !== undefined
                ? `<td class="tnum">${d.cycles} cycles</td>`
                : `<td class="tnum">${d.trades} trades</td>`;
              return `<tr style="${rowStyle}">
                <td class="tnum">${isBest ? '★ ' : ''}${d.tf}</td>
                <td class="tnum ${retCls}">${d.ret >= 0 ? '+' : ''}${d.ret}%</td>
                <td class="tnum neg">${d.dd}%</td>
                ${metric}
                <td>${validBadge}</td>
              </tr>`;
            }).join('');
            return `<div style="margin-bottom:16px">
              <div style="color:${color};font-weight:600;margin-bottom:6px">${label}</div>
              <table class="tbl" style="width:100%">
                <thead><tr><th>TF</th><th>Return</th><th>Max DD</th><th>Trades/Cycles</th><th>DD filter</th></tr></thead>
                <tbody>${rows2}</tbody>
              </table>
            </div>`;
          };

          document.getElementById('tf-modal-body').innerHTML =
            tfTable('⚡ TeeLek', '#34d399', h.tl) +
            tfTable('🔥 Ultimate', '#fb923c', h.ult) +
            tfTable('💎 BestPos', '#22d3ee', h.bp);

          document.getElementById('tf-modal').style.display = 'flex';
        });
      });
      // Close on backdrop click
      const modal = document.getElementById('tf-modal');
      if (modal) modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
    }, 0);

    return `<section class="panel">
      <div class="panel-h"><h2>Optimization Runs · ${BT.RUN_HISTORY.length} runs</h2></div>
      <div class="tbl-wrap"><table class="tbl hist">
        <thead>
          <tr class="grp"><th colspan="4"></th><th colspan="4" class="g-tl">⚡ TeeLek</th><th colspan="4" class="g-ult">🔥 Ultimate</th><th colspan="4" class="g-bp">💎 BestPos</th></tr>
          <tr><th>เวลา</th><th>TF</th><th>วัน</th><th>Lev</th>
          <th class="sep">combos</th><th>TF</th><th>Ret</th><th>DD</th>
          <th class="sep">combos</th><th>TF</th><th>Ret</th><th>DD</th>
          <th class="sep">combos</th><th>TF</th><th>Ret</th><th>DD</th></tr>
        </thead><tbody>${rows}</tbody></table></div>
    </section>`;
  }

  // ============================================================
  //  MONTHLY REGIME VIEW
  // ============================================================
  function monthlyView() {
    const md = window.BT_MONTHLY;
    if (!md) {
      return `<section class="panel">
        <div class="panel-h"><h2>📅 Monthly Regime Engine</h2></div>
        <div style="padding:40px;text-align:center;color:var(--tx-2)">
          <div style="font-size:2em;margin-bottom:12px">⏳</div>
          <div>ยังไม่มีข้อมูล — รัน <code>python generate_monthly_data.py</code> ก่อน</div>
        </div>
      </section>`;
    }

    const gate = md.display_gate || "?";
    const comb = md.combined_oos || {};
    const pa   = md.per_asset || {};
    const fund = md.funding || {};
    const ASSETS = ["BTC","ETH","SOL"];
    const ASSET_COLOR = { BTC: "#f59e0b", ETH: "#8b5cf6", SOL: "#22d3ee" };
    const IS_COUNT = md.is_count || 12;

    // ── Gate banner ─────────────────────────────────────────
    const gateColor = gate === "PASS" ? "var(--pos)" : gate === "PASS_WITH_NOTE" ? "var(--warn)" : "var(--neg)";
    const gateIcon  = gate === "PASS" ? "✅" : gate === "PASS_WITH_NOTE" ? "⚠️" : "❌";
    const gateBg    = gate === "PASS"
      ? "color-mix(in oklch,var(--pos) 8%,var(--panel))"
      : gate === "PASS_WITH_NOTE"
      ? "color-mix(in oklch,var(--warn) 8%,var(--panel))"
      : "color-mix(in oklch,var(--neg) 8%,var(--panel))";
    const gateBorder = gate === "PASS"
      ? "color-mix(in oklch,var(--pos) 22%,transparent)"
      : gate === "PASS_WITH_NOTE"
      ? "color-mix(in oklch,var(--warn) 22%,transparent)"
      : "color-mix(in oklch,var(--neg) 22%,transparent)";

    const bannerHtml = `
      <div style="background:${gateBg};border:1px solid ${gateBorder};border-radius:var(--r);padding:14px 18px;display:flex;align-items:flex-start;gap:14px">
        <div style="font-size:26px;flex:none;margin-top:2px">${gateIcon}</div>
        <div style="flex:1">
          <div style="font-size:15px;font-weight:600;color:${gateColor};margin-bottom:4px">
            Phase 0 DECISION GATE — ${gate}
          </div>
          <div style="font-size:12.5px;color:var(--tx-2);line-height:1.55">
            Combined OOS (equal-weight BTC+ETH+SOL):
            <strong style="color:var(--pos);font-family:var(--mono)">+${(comb.cumulative_pct||0).toFixed(1)}% cum</strong> ·
            <strong style="color:var(--pos);font-family:var(--mono)">+${(comb.avg_per_month||0).toFixed(2)}%/mo</strong> ·
            IS 12mo (Oct24–Sep25) · OOS 9mo (Oct25–Jun26)
          </div>
          ${md.gate_note ? `<div style="font-size:11px;color:var(--tx-3);margin-top:6px;line-height:1.5">${md.gate_note}</div>` : ""}
        </div>
      </div>`;

    // ── Multi-asset summary KPI cards ───────────────────────
    function assetCard(a) {
      const d = pa[a] || {};
      const c = ASSET_COLOR[a] || "var(--accent)";
      const oosOk = (d.oos_cum || 0) > 0;
      return `
        <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
          <div style="position:absolute;inset:0 0 auto 0;height:2px;background:linear-gradient(90deg,${c},transparent 70%)"></div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
            <div style="font-size:13px;font-weight:700;color:${c}">${a}</div>
            <div style="font-size:10px;color:var(--tx-3);font-family:var(--mono)">BTC regime signal</div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div style="background:var(--bg-2);border:1px solid var(--line);border-radius:var(--r-sm);padding:8px">
              <div style="font-size:9px;color:var(--tx-3);letter-spacing:.05em;text-transform:uppercase">IS cum</div>
              <div style="font-family:var(--mono);font-size:17px;font-weight:600;color:var(--tx-2);margin-top:2px">+${(d.is_cum||0).toFixed(1)}%</div>
              <div style="font-size:9.5px;color:var(--tx-3)">${d.is_wins||0}/${d.is_n||12} wins</div>
            </div>
            <div style="background:var(--bg-2);border:1px solid ${oosOk?"color-mix(in oklch,var(--pos) 22%,transparent)":"var(--line)"};border-radius:var(--r-sm);padding:8px">
              <div style="font-size:9px;color:var(--tx-3);letter-spacing:.05em;text-transform:uppercase">OOS cum ✨</div>
              <div style="font-family:var(--mono);font-size:17px;font-weight:600;color:${oosOk?"var(--pos)":"var(--neg)"};margin-top:2px">${(d.oos_cum||0)>=0?"+":""}${(d.oos_cum||0).toFixed(1)}%</div>
              <div style="font-size:9.5px;color:var(--tx-3)">${d.oos_wins||0}/${d.oos_n||9} wins · +${(d.oos_avg||0).toFixed(2)}/mo</div>
            </div>
          </div>
        </div>`;
    }

    const assetCardsHtml = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--gap)">
        ${ASSETS.map(a => assetCard(a)).join("")}
      </div>`;

    // ── Window-by-window table (BTC + ETH + SOL columns) ───
    const windows = md.windows || {};
    const btcWins = windows["BTC"] || [];
    const ethWins = windows["ETH"] || [];
    const solWins = windows["SOL"] || [];

    function retCell(w) {
      if (!w) return `<td style="opacity:.3;text-align:center">—</td>`;
      const v = w.ret;
      const stopped = w.stopped;
      const intensity = Math.min(1, Math.abs(v) / 40);
      let bg, tx;
      if (stopped) {
        bg = `rgba(239,68,68,${0.08 + intensity * 0.25})`; tx = "#f87171";
      } else if (v > 0) {
        bg = `rgba(52,211,153,${0.06 + intensity * 0.28})`; tx = v > 15 ? "#34d399" : "#6ee7b7";
      } else if (v < 0) {
        bg = `rgba(239,68,68,${0.05 + intensity * 0.20})`; tx = "#f87171";
      } else {
        bg = "transparent"; tx = "var(--tx-3)";
      }
      const stopLabel = stopped ? `<div style="font-size:.68em;opacity:.7">STOP</div>` : "";
      return `<td style="text-align:center;padding:6px 10px;background:${bg};color:${tx};font-family:var(--mono);font-size:12.5px;font-weight:600">
        ${v === 0 ? "~" : (v >= 0 ? "+" : "") + v.toFixed(1) + "%"}${stopLabel}
      </td>`;
    }

    function regimeBadge(regime) {
      const c = regime === "BEAR" ? "#f87171" : regime === "BULL" ? "#34d399" : "#94a3b8";
      const bg = regime === "BEAR" ? "rgba(239,68,68,.12)" : regime === "BULL" ? "rgba(52,211,153,.12)" : "rgba(148,163,184,.08)";
      return `<span style="font-family:var(--mono);font-size:10px;padding:2px 7px;border-radius:5px;background:${bg};color:${c}">${regime}</span>`;
    }

    const tableRows = btcWins.map((bw, i) => {
      const ew = ethWins[i];
      const sw = solWins[i];
      const isOos = i >= IS_COUNT;
      const rowBg = isOos ? "color-mix(in oklch,var(--warn) 4%,transparent)" : "";
      const oosBadge = isOos ? `<span style="font-size:9px;background:color-mix(in oklch,var(--warn) 15%,transparent);color:var(--warn);padding:1px 5px;border-radius:4px;font-family:var(--mono);margin-left:5px">OOS</span>` : "";
      const strategy = (bw.strategy || "").replace("TL4h-Short","TL Short").replace("BPx2","BP×2");
      const stratColor = bw.strategy && bw.strategy.includes("TL") ? "#f87171" :
                         bw.strategy && bw.strategy.includes("BPx2") ? "#34d399" : "#94a3b8";
      return `<tr style="background:${rowBg};${isOos?"border-left:2px solid color-mix(in oklch,var(--warn) 40%,transparent)":""}">
        <td style="padding:7px 12px;font-family:var(--mono);font-size:12px;white-space:nowrap">
          <strong>${bw.label}</strong>${oosBadge}
        </td>
        <td style="padding:7px 10px;text-align:center">${regimeBadge(bw.regime||"?")}</td>
        <td style="padding:7px 10px;font-size:11px;color:${stratColor};font-family:var(--mono)">${strategy}</td>
        <td style="padding:7px 10px;text-align:center;font-family:var(--mono);font-size:11.5px;color:var(--tx-3)">${(bw.asset_chg||0) >= 0 ? "+" : ""}${(bw.asset_chg||0).toFixed(1)}%</td>
        ${retCell(bw)}
        ${retCell(ew)}
        ${retCell(sw)}
      </tr>`;
    }).join("");

    const windowTableHtml = `
      <div class="panel">
        <div class="panel-h"><h2>📋 Window-by-Window Breakdown</h2>
          <div style="margin-left:auto;display:flex;gap:8px;align-items:center;font-size:11.5px;color:var(--tx-3)">
            <span style="display:inline-flex;align-items:center;gap:5px"><span style="width:8px;height:8px;border-radius:2px;background:color-mix(in oklch,var(--warn) 40%,transparent);display:inline-block"></span>OOS (held-out)</span>
          </div>
        </div>
        <div class="tbl-wrap">
          <table class="tbl" style="font-size:12.5px">
            <thead>
              <tr>
                <th>เดือน</th>
                <th style="text-align:center">Regime</th>
                <th>Strategy</th>
                <th style="text-align:center">BTC%</th>
                <th style="text-align:center;color:#f59e0b">BTC Ret</th>
                <th style="text-align:center;color:#8b5cf6">ETH Ret</th>
                <th style="text-align:center;color:#22d3ee">SOL Ret</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </div>`;

    // ── Cumulative equity chart ──────────────────────────────
    const equityChartHtml = `
      <div class="panel">
        <div class="panel-h"><h2>📈 Cumulative Return · Monthly Regime (IS 12mo + OOS 9mo)</h2>
          <div style="display:flex;gap:14px;margin-left:auto;font-size:11px;color:var(--tx-2)">
            <span style="display:flex;align-items:center;gap:5px"><span style="width:18px;height:2px;background:#f59e0b;display:inline-block"></span>BTC</span>
            <span style="display:flex;align-items:center;gap:5px"><span style="width:18px;height:2px;background:#8b5cf6;border-bottom:2px dashed #8b5cf6;border-top:none;background:none;display:inline-block"></span>ETH</span>
            <span style="display:flex;align-items:center;gap:5px"><span style="width:18px;height:2px;background:#22d3ee;display:inline-block;border-bottom:2px dotted #22d3ee;background:none"></span>SOL</span>
          </div>
        </div>
        <canvas id="monthly-eq-canvas" style="width:100%;display:block"></canvas>
        <canvas id="monthly-bar-canvas" style="width:100%;display:block;margin-top:2px"></canvas>
        <div style="display:flex;gap:16px;font-size:10.5px;color:var(--tx-3);margin-top:8px;flex-wrap:wrap">
          <span>แถบสีขาว = IS (backtest 12mo)</span>
          <span style="color:#fbbf24">█ แถบเหลือง = OOS (held-out 9mo)</span>
          <span style="color:#34d399">█ BULL→BP×2</span>
          <span style="color:#60a5fa">█ NEUTRAL→BP</span>
          <span style="color:#f87171">█ BEAR→TL Short</span>
          <span>✕ = stopped out</span>
        </div>
      </div>`;

    // ── Funding check ────────────────────────────────────────
    const fundVerdict = fund.verdict || "?";
    const fundVColor = fundVerdict === "PASS" ? "var(--pos)" : fundVerdict === "PASS_WITH_NOTE" ? "var(--warn)" : "var(--neg)";
    const fundVIcon  = fundVerdict === "PASS" ? "✅" : fundVerdict === "PASS_WITH_NOTE" ? "⚠️" : "❌";
    const fundAssets = fund.assets || {};
    const fundRows = Object.entries(fundAssets).map(([a, d]) => {
      const diff = d.diff_annual_pct || 0;
      const conservative = diff < 0;
      const diffColor = conservative ? "var(--pos)" : "var(--neg)";
      return `<tr>
        <td style="font-weight:600;color:${ASSET_COLOR[a]||"var(--tx)"}">${a}</td>
        <td class="tnum">${(d.avg_8h||0).toFixed(4)}%</td>
        <td class="tnum">${(d.annualized_pct||0).toFixed(2)}%/yr</td>
        <td class="tnum">${(fund.modeled_annual||0).toFixed(2)}%/yr</td>
        <td class="tnum" style="color:${diffColor}">${diff >= 0 ? "+" : ""}${diff.toFixed(2)}%</td>
        <td style="font-size:11px">${conservative ? "✅ Model conservative" : "⚠️ Real > Model"}</td>
        <td class="tnum" style="color:var(--tx-3)">${(d.pct_negative||0).toFixed(0)}%</td>
      </tr>`;
    }).join("");

    const fundingHtml = `
      <div class="panel">
        <div class="panel-h"><h2>💸 Funding Cost Reality Check (Phase 0B)</h2>
          <div style="margin-left:auto;font-size:12px;color:${fundVColor};font-weight:600">${fundVIcon} ${fundVerdict}</div>
        </div>
        <div style="font-size:12px;color:var(--tx-2);margin-bottom:10px;line-height:1.6">
          Binance perp funding rates จริง (Oct24–Jun26) vs model ที่ใช้ใน backtest (${(fund.modeled_8h||0.01).toFixed(3)}%/8h = ${(fund.modeled_annual||0).toFixed(2)}%/yr)
          <br><span style="color:var(--tx-3)">ผลต่างติดลบ = model คิดค่าใช้จ่ายสูงกว่าจริง → backtest ประเมินผลต่ำกว่าความเป็นจริง (conservative) ✅</span>
        </div>
        <div class="tbl-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th>Asset</th>
                <th>จริง avg/8h</th>
                <th>จริง/ปี</th>
                <th>Model/ปี</th>
                <th>ต่าง</th>
                <th>สรุป</th>
                <th>Neg funding %</th>
              </tr>
            </thead>
            <tbody>${fundRows}</tbody>
          </table>
        </div>
        <div style="font-size:11px;color:var(--tx-3);margin-top:8px">
          TL Short: รับ funding เมื่อ rate &gt; 0 · BTC negative funding เพียง ${(fundAssets.BTC||{}).pct_negative||0}% ของเวลา → TL ได้รับ funding ประมาณ 81.5% ของเวลา
        </div>
      </div>`;

    // ── Risk notes ────────────────────────────────────────────
    const riskHtml = `
      <div style="background:color-mix(in oklch,var(--warn) 6%,var(--panel));border:1px solid color-mix(in oklch,var(--warn) 18%,transparent);border-radius:var(--r);padding:14px 18px">
        <div style="font-size:13px;font-weight:600;color:var(--warn);margin-bottom:8px">⚠️ ข้อสังเกตสำคัญก่อน Phase 1</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;font-size:12px;color:var(--tx-2);line-height:1.6">
          <div>📌 <strong style="color:var(--tx)">Single-event dependency</strong><br>Oct25 BEAR ขับ ~100% ของ OOS gains ทั้ง 3 assets (BTC +38.8%, ETH +34.7%, SOL +39.7%)</div>
          <div>📌 <strong style="color:var(--tx)">Nov25 counter-trend risk</strong><br>BEAR regime แต่ราคาขึ้น → TL short เจ็บทุก asset (BTC -12.2%, ETH -15.5%, SOL -14.1%)</div>
          <div>📌 <strong style="color:var(--tx)">SOL higher volatility</strong><br>raw DD ลึกกว่า (34.6%) แต่ actual capped = -14.1% · พิจารณาใช้ tighter cap -8% ใน live</div>
          <div>📌 <strong style="color:var(--tx)">Edge generalizes</strong><br>params เดิม ไม่ re-optimize → BTC/ETH/SOL OOS บวกทุก asset ✅</div>
        </div>
      </div>`;

    return `
      ${bannerHtml}
      ${assetCardsHtml}
      ${equityChartHtml}
      ${windowTableHtml}
      ${fundingHtml}
      ${riskHtml}`;
  }

  function mountMonthlyCharts() {
    const md = window.BT_MONTHLY;
    if (!md) return;
    const eqCanvas  = document.getElementById("monthly-eq-canvas");
    const barCanvas = document.getElementById("monthly-bar-canvas");
    if (!eqCanvas || !barCanvas) return;

    const IS_COUNT = md.is_count || 12;
    const labels   = md.labels || [];
    const N        = labels.length; // 21
    const eq       = md.equity_series || {};
    const wins     = md.windows || {};
    const BTC_WINS = wins.BTC || [];

    const ASSET_COLOR = { BTC: "#f59e0b", ETH: "#8b5cf6", SOL: "#22d3ee" };
    const REGIME_COLOR = { BEAR: "#f87171", BULL: "#34d399", NEUTRAL: "#60a5fa" };
    const REGIME_BG   = { BEAR: "rgba(248,113,113,0.13)", BULL: "rgba(52,211,153,0.13)", NEUTRAL: "rgba(96,165,250,0.13)" };

    const dpr = window.devicePixelRatio || 1;
    const parent = eqCanvas.parentElement;
    const cssW = parent ? Math.max(300, parent.clientWidth - 32) : 700;

    // ── Equity chart ────────────────────────────────────────────
    const EQ_H = 260;
    eqCanvas.width = cssW * dpr; eqCanvas.height = EQ_H * dpr;
    eqCanvas.style.width = cssW + "px"; eqCanvas.style.height = EQ_H + "px";
    const ec = eqCanvas.getContext("2d");
    ec.scale(dpr, dpr);

    const pad = { top: 28, right: 72, bottom: 32, left: 52 };
    const cW = cssW - pad.left - pad.right;
    const cH = EQ_H - pad.top - pad.bottom;

    // y range
    const allV = ["BTC","ETH","SOL"].flatMap(a => eq[a] || []);
    let yMin = Math.min(0, ...allV), yMax = Math.max(0, ...allV);
    const yPad = (yMax - yMin) * 0.10 + 2; yMin -= yPad * 0.3; yMax += yPad;
    const yRange = yMax - yMin || 1;

    const xOf = i => pad.left + (i + 0.5) / N * cW;
    const yOf = v => pad.top + (1 - (v - yMin) / yRange) * cH;

    const cssBg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    const isDark = cssBg !== "#f9fafb" && cssBg !== "#ffffff";
    const gc = isDark ? "rgba(255,255,255," : "rgba(0,0,0,";

    ec.clearRect(0, 0, cssW, EQ_H);

    // IS region (subtle)
    ec.fillStyle = isDark ? "rgba(148,163,184,0.04)" : "rgba(148,163,184,0.06)";
    ec.fillRect(pad.left, pad.top, (IS_COUNT / N) * cW, cH);

    // OOS region (amber tint)
    const xOos = pad.left + (IS_COUNT / N) * cW;
    ec.fillStyle = isDark ? "rgba(251,191,36,0.07)" : "rgba(251,191,36,0.10)";
    ec.fillRect(xOos, pad.top, cW - (IS_COUNT / N) * cW, cH);

    // Per-month regime tint (very subtle)
    BTC_WINS.forEach((w, i) => {
      const x0 = pad.left + (i / N) * cW;
      const bw = cW / N;
      ec.fillStyle = REGIME_BG[w.regime] || "transparent";
      ec.globalAlpha = 0.35;
      ec.fillRect(x0, pad.top, bw, cH);
      ec.globalAlpha = 1;
    });

    // OOS vertical line
    ec.beginPath();
    ec.strokeStyle = isDark ? "rgba(251,191,36,0.8)" : "rgba(180,117,23,0.85)";
    ec.lineWidth = 1.5; ec.setLineDash([6, 3]);
    ec.moveTo(xOos, pad.top); ec.lineTo(xOos, pad.top + cH);
    ec.stroke(); ec.setLineDash([]);

    // IS / OOS labels
    ec.font = "bold 9px system-ui,sans-serif";
    ec.fillStyle = isDark ? "rgba(148,163,184,0.8)" : "rgba(100,116,139,0.85)";
    ec.textAlign = "right";
    ec.fillText("◀ IS (12mo backtest)", xOos - 6, pad.top + 13);
    ec.fillStyle = isDark ? "rgba(251,191,36,0.95)" : "rgba(180,117,23,0.95)";
    ec.textAlign = "left";
    ec.fillText("OOS (9mo held-out) ▶", xOos + 6, pad.top + 13);

    // Y gridlines
    const nice = [1,2,5,10,20,50].find(s => s >= (yMax-yMin)/6) || 10;
    for (let v = Math.ceil(yMin/nice)*nice; v <= yMax+0.001; v += nice) {
      const y = yOf(v), isZ = Math.abs(v) < 0.01;
      ec.beginPath();
      ec.strokeStyle = isZ ? gc+"0.30)" : gc+"0.07)";
      ec.lineWidth = isZ ? 1 : 0.5; ec.setLineDash(isZ ? [5,3] : []);
      ec.moveTo(pad.left, y); ec.lineTo(pad.left + cW, y); ec.stroke(); ec.setLineDash([]);
      ec.fillStyle = gc+"0.45)"; ec.font = "9px system-ui,sans-serif"; ec.textAlign = "right";
      ec.fillText((v > 0 ? "+" : "") + v.toFixed(0) + "%", pad.left - 4, y + 3.5);
    }

    // X labels (every month)
    labels.forEach((lb, i) => {
      const x = xOf(i);
      ec.fillStyle = gc + (i >= IS_COUNT ? "0.55)" : "0.38)");
      ec.font = i >= IS_COUNT ? "bold 8px system-ui,sans-serif" : "8px system-ui,sans-serif";
      ec.textAlign = "center";
      ec.fillText(lb, x, pad.top + cH + 13);
      // tick
      ec.beginPath(); ec.strokeStyle = gc+"0.12)"; ec.lineWidth = 0.5;
      ec.moveTo(x, pad.top + cH); ec.lineTo(x, pad.top + cH + 4); ec.stroke();
    });

    // Equity curves
    const DASHES = { BTC: [], ETH: [6,3], SOL: [2,3] };
    const WIDTHS  = { BTC: 2.2, ETH: 1.6, SOL: 1.6 };
    ["SOL","ETH","BTC"].forEach(a => {
      const vals = eq[a] || [];
      if (!vals.length) return;
      ec.beginPath();
      ec.strokeStyle = ASSET_COLOR[a];
      ec.lineWidth = WIDTHS[a];
      ec.setLineDash(DASHES[a]);
      vals.forEach((v, i) => {
        const x = xOf(i), y = yOf(v);
        i === 0 ? ec.moveTo(x, y) : ec.lineTo(x, y);
      });
      ec.stroke(); ec.setLineDash([]);
      // End label
      const last = vals[vals.length - 1];
      ec.fillStyle = ASSET_COLOR[a];
      ec.font = "bold 9px system-ui,sans-serif"; ec.textAlign = "left";
      ec.fillText((last >= 0 ? "+" : "") + last.toFixed(1) + "%", pad.left + cW + 4, yOf(last) + 3.5);
    });

    // Dots at each data point for BTC
    (eq.BTC || []).forEach((v, i) => {
      const w = BTC_WINS[i];
      const col = w ? REGIME_COLOR[w.regime] : "#94a3b8";
      ec.beginPath(); ec.fillStyle = col;
      ec.arc(xOf(i), yOf(v), 3, 0, Math.PI * 2); ec.fill();
      if (w && w.stopped) {
        ec.fillStyle = "#f87171"; ec.font = "bold 10px system-ui,sans-serif"; ec.textAlign = "center";
        ec.fillText("✕", xOf(i), yOf(v) - 6);
      }
    });

    // ── Bar chart (per-month returns, BTC) ──────────────────────
    const BAR_H = 110;
    barCanvas.width = cssW * dpr; barCanvas.height = BAR_H * dpr;
    barCanvas.style.width = cssW + "px"; barCanvas.style.height = BAR_H + "px";
    const bc = barCanvas.getContext("2d");
    bc.scale(dpr, dpr);

    const bPad = { top: 10, right: 72, bottom: 28, left: 52 };
    const bW = cssW - bPad.left - bPad.right;
    const bH = BAR_H - bPad.top - bPad.bottom;

    const rets = BTC_WINS.map(w => w.ret || 0);
    const rMax = Math.max(5, ...rets.map(Math.abs)) * 1.15;
    const yB = v => bPad.top + (1 - (v + rMax) / (2 * rMax)) * bH;
    const y0b = yB(0);
    const barW = bW / N;

    bc.clearRect(0, 0, cssW, BAR_H);

    // OOS tint
    bc.fillStyle = isDark ? "rgba(251,191,36,0.07)" : "rgba(251,191,36,0.10)";
    bc.fillRect(bPad.left + (IS_COUNT / N) * bW, bPad.top, bW - (IS_COUNT / N) * bW, bH);

    // OOS line
    const xOosB = bPad.left + (IS_COUNT / N) * bW;
    bc.beginPath(); bc.strokeStyle = isDark ? "rgba(251,191,36,0.8)" : "rgba(180,117,23,0.85)";
    bc.lineWidth = 1.5; bc.setLineDash([6,3]);
    bc.moveTo(xOosB, bPad.top); bc.lineTo(xOosB, bPad.top + bH);
    bc.stroke(); bc.setLineDash([]);

    // Zero line
    bc.beginPath(); bc.strokeStyle = gc+"0.25)"; bc.lineWidth = 0.8;
    bc.moveTo(bPad.left, y0b); bc.lineTo(bPad.left + bW, y0b); bc.stroke();
    bc.fillStyle = gc+"0.4)"; bc.font = "9px system-ui,sans-serif"; bc.textAlign = "right";
    bc.fillText("0%", bPad.left - 4, y0b + 3.5);

    // Y ticks
    [rMax * 0.5, -rMax * 0.5].forEach(v => {
      const y = yB(v);
      bc.beginPath(); bc.strokeStyle = gc+"0.07)"; bc.lineWidth = 0.5;
      bc.moveTo(bPad.left, y); bc.lineTo(bPad.left + bW, y); bc.stroke();
      bc.fillStyle = gc+"0.35)"; bc.font = "9px system-ui,sans-serif"; bc.textAlign = "right";
      bc.fillText((v > 0 ? "+" : "") + v.toFixed(0) + "%", bPad.left - 4, y + 3.5);
    });

    // Bars
    BTC_WINS.forEach((w, i) => {
      const ret = w.ret || 0;
      const x0 = bPad.left + (i / N) * bW + 2;
      const bwi = barW - 4;
      const col = REGIME_COLOR[w.regime] || "#94a3b8";
      const yTop = ret >= 0 ? yB(ret) : y0b;
      const yBot = ret >= 0 ? y0b : yB(ret);
      bc.fillStyle = col;
      bc.globalAlpha = i >= IS_COUNT ? 0.85 : 0.55;
      bc.beginPath();
      bc.roundRect ? bc.roundRect(x0, yTop, bwi, Math.max(2, yBot - yTop), 2)
                   : bc.rect(x0, yTop, bwi, Math.max(2, yBot - yTop));
      bc.fill();
      bc.globalAlpha = 1;

      // ret label on bar
      if (Math.abs(ret) > 1) {
        bc.fillStyle = col; bc.font = "bold 8px system-ui,sans-serif"; bc.textAlign = "center";
        const lx = x0 + bwi / 2;
        const ly = ret >= 0 ? yTop - 3 : yBot + 9;
        bc.fillText((ret >= 0 ? "+" : "") + ret.toFixed(1) + "%", lx, ly);
      }

      // stop marker
      if (w.stopped) {
        bc.fillStyle = "#f87171"; bc.font = "bold 10px system-ui,sans-serif"; bc.textAlign = "center";
        bc.fillText("✕", x0 + bwi / 2, ret < 0 ? yB(ret) - 4 : y0b - 4);
      }

      // X label
      bc.fillStyle = gc + (i >= IS_COUNT ? "0.60)" : "0.40)");
      bc.font = i >= IS_COUNT ? "bold 8px system-ui,sans-serif" : "8px system-ui,sans-serif";
      bc.textAlign = "center";
      bc.fillText(labels[i] || "", x0 + bwi / 2, bPad.top + bH + 13);

      // strategy label inside bar (if space)
      const strat = w.strategy || "";
      const shortStrat = strat.includes("TL") ? "TL↓" : strat.includes("x2") ? "BP×2" : "BP";
      bc.fillStyle = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)";
      bc.font = "7px system-ui,sans-serif"; bc.textAlign = "center";
      bc.fillText(shortStrat, x0 + bwi / 2, y0b - 2);
    });
  }

  // ============================================================
  //  ROBUSTNESS VIEW
  // ============================================================
  function robustnessView() {
    const mw = BT.MULTIWINDOW || {};
    const windows = mw.windows || [];
    const fp = mw.fixed_params || {};

    if (!windows.length) {
      return `<section class="panel">
        <div class="panel-h"><h2>📊 Multi-Window Robustness Test</h2></div>
        <div style="padding:40px;text-align:center;color:var(--tx-2)">
          <div style="font-size:2em;margin-bottom:12px">⏳</div>
          <div>ยังไม่มีข้อมูล — รัน <code>python run_multiwindow_test.py</code> ก่อน</div>
        </div>
      </section>`;
    }

    // ── helper: return cell with heatmap color ──
    function heatCell(val, isTrades) {
      if (val == null) return `<td class="tnum" style="opacity:.3">—</td>`;
      const v = typeof val === "object" ? val.ret : val;
      if (v == null) return `<td class="tnum" style="opacity:.3">—</td>`;
      const dd = typeof val === "object" ? val.dd : null;
      const ddBad = dd != null && dd <= -50;
      // color: green spectrum for positive, red for negative
      const intensity = Math.min(1, Math.abs(v) / 150);
      let bg, tx;
      if (ddBad) {
        bg = `rgba(239,68,68,${0.08 + intensity * 0.22})`;
        tx = `#f87171`;
      } else if (v > 0) {
        bg = `rgba(52,211,153,${0.08 + intensity * 0.30})`;
        tx = v > 50 ? `#34d399` : `#6ee7b7`;
      } else {
        bg = `rgba(239,68,68,${0.08 + intensity * 0.22})`;
        tx = `#f87171`;
      }
      const ddStr = dd != null ? `<div style="font-size:.72em;opacity:.65">${dd}%</div>` : '';
      return `<td class="tnum" style="background:${bg};color:${tx};text-align:center;padding:6px 8px">
        ${v >= 0 ? '+' : ''}${v.toFixed(0)}%${ddStr}</td>`;
    }

    const _fp = (mw.fixed_params || {});
    const _canon = {
      teelek:   (_fp.teelek   || {}).canonical_tf || "4h",
      ultimate: (_fp.ultimate || {}).canonical_tf || "1h",
      bestpos:  (_fp.bestpos  || {}).canonical_tf || "15m",
    };
    const STRATS = [
      { key: "teelek",   label: "⚡ TeeLek",   color: "#34d399", canonical: _canon.teelek   },
      { key: "ultimate", label: "🔥 Ultimate",  color: "#fb923c", canonical: _canon.ultimate },
      { key: "bestpos",  label: "💎 BestPos",   color: "#22d3ee", canonical: _canon.bestpos  },
    ];

    // Monthly: group 3 monthly windows per 90d window (oldest-first, aligned to multiwindow order)
    const _monthWins = ((BT.MONTHLY_RESULTS || {}).windows || []);
    // Find alignment: match monthly since_ms to multiwindow since_ms
    // Each 90d window corresponds to 3 monthly windows starting at the same since_ms
    function _monthlyRetForWindow(wi) {
      const w = windows[wi];
      if (!w || !_monthWins.length) return null;
      // Find monthly window index that matches this 90d window's start
      const startIdx = _monthWins.findIndex(m => m.since_ms === w.since_ms);
      if (startIdx < 0) return null;
      // Compound 3 months (or fewer if near end)
      let compound = 1.0;
      for (let i = startIdx; i < Math.min(startIdx + 3, _monthWins.length); i++) {
        compound *= (1 + _monthWins[i].ret / 100);
      }
      return (compound - 1) * 100;
    }

    // Hybrid: windows array already maps 1:1 to multiwindow 90d windows
    const _hybridWins = ((BT.HYBRID_RESULTS || {}).windows || []);

    // Portfolio per-window map (index-matched from PORTFOLIO_WINDOWS)
    const _portWins = (BT.PORTFOLIO_WINDOWS || {}).windows || [];

    // ── colored cell helper for approach columns ──
    function approachCell(ret, color, stopped) {
      if (ret == null) return `<td class="tnum" style="opacity:.3">—</td>`;
      const intensity = Math.min(1, Math.abs(ret) / 60);
      let bg, tx;
      if (stopped) {
        bg = `rgba(239,68,68,${0.08 + intensity * 0.22})`; tx = '#f87171';
      } else if (ret > 0) {
        bg = `rgba(${color},${0.08 + intensity * 0.30})`; tx = `rgba(${color},1)`;
      } else {
        bg = `rgba(239,68,68,${0.08 + intensity * 0.22})`; tx = '#f87171';
      }
      const stop = stopped ? `<div style="font-size:.68em;opacity:.7">STOP</div>` : '';
      return `<td class="tnum" style="background:${bg};color:${tx};text-align:center;padding:6px 8px">
        ${ret >= 0 ? '+' : ''}${ret.toFixed(0)}%${stop}</td>`;
    }

    // Group headers
    const thGroups =
      STRATS.map(s =>
        `<th style="color:${s.color};font-weight:600;border-bottom:2px solid ${s.color};text-align:center">${s.label}<span style="opacity:.55;font-size:.8em;margin-left:4px">${s.canonical}</span></th>`
      ).join("") +
      `<th style="color:var(--tx-2);font-weight:600;border-bottom:2px solid var(--line);text-align:center">🏦 Portfolio</th>` +
      `<th style="color:var(--tx-2);font-weight:600;border-bottom:2px solid var(--line);text-align:center">📅 Monthly</th>` +
      `<th style="color:var(--tx-2);font-weight:600;border-bottom:2px solid var(--line);text-align:center">⚡ Hybrid</th>`;

    // second header row (sub-labels)
    const thCols = STRATS.map(s => `<th style="color:${s.color};opacity:.7;font-size:.82em">ret / DD</th>`).join("") +
      `<th style="opacity:.5;font-size:.82em">50/50</th><th style="opacity:.5;font-size:.82em">3mo cpd</th><th style="opacity:.5;font-size:.82em">ret / strategy</th>`;

    // Data rows (clickable)
    const rows = windows.map((w, wi) => {
      const btcCls = w.btc_change_pct > 10 ? "pos" : w.btc_change_pct < -10 ? "neg" : "";
      const trend = w.btc_change_pct > 15 ? "+" : w.btc_change_pct < -15 ? "-" : "~";

      // Canonical TF cell per strategy
      const stratCells = STRATS.map(s => heatCell(w[s.key] && w[s.key][s.canonical])).join("");

      // Portfolio cell — PORTFOLIO_WINDOWS is newest-first, MULTIWINDOW is oldest-first → reverse index
      const _portEntry = _portWins.length > 0 ? _portWins[_portWins.length - 1 - wi] : null;
      const portRet = _portEntry != null ? _portEntry.p_5050 : null;
      const portCell = portRet != null ? heatCell(portRet) : `<td class="tnum" style="opacity:.3">—</td>`;

      // Monthly cell
      const mRet = _monthlyRetForWindow(wi);
      const mCell = mRet != null ? heatCell(mRet) : `<td class="tnum" style="opacity:.3">—</td>`;

      // Hybrid cell
      const hEntry = _hybridWins[wi];
      const hCell = hEntry != null
        ? (() => {
            const ret = hEntry.ret;
            const stopped = hEntry.stopped;
            const strat = hEntry.strategy || '';
            const obj = { ret: +ret.toFixed(1), dd: stopped ? -99 : null };
            const base = heatCell(obj);
            // inject strategy label into the cell content
            if (!strat) return base;
            const stratMark = `<div style="font-size:.62em;opacity:.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:96px">${strat}</div>`;
            return base.replace('</td>', stratMark + '</td>');
          })()
        : `<td class="tnum" style="opacity:.3">—</td>`;

      return `<tr class="mw-row" data-wi="${wi}" style="cursor:pointer" title="คลิกเพื่อดูรายละเอียด">
        <td style="white-space:nowrap;font-size:.85em">${w.label_short || w.label} <span style="opacity:.4;font-size:.8em">🔍</span></td>
        <td class="tnum ${btcCls}" style="white-space:nowrap">${trend}${w.btc_change_pct >= 0 ? '+' : ''}${w.btc_change_pct}%</td>
        ${stratCells}${portCell}${mCell}${hCell}
      </tr>`;
    }).join("");

    // ── Wire click handlers after render ──
    setTimeout(() => {
      // Inject modal once
      if (!document.getElementById('mw-modal')) {
        document.body.insertAdjacentHTML('beforeend', `
          <div id="mw-modal" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.65);backdrop-filter:blur(4px);align-items:center;justify-content:center;">
            <div style="background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:24px;min-width:560px;max-width:92vw;max-height:82vh;overflow:auto;position:relative;">
              <button onclick="document.getElementById('mw-modal').style.display='none'"
                style="position:absolute;top:12px;right:14px;background:none;border:none;color:var(--tx-2);font-size:1.2em;cursor:pointer">✕</button>
              <h3 id="mw-modal-title" style="margin:0 0 4px;font-size:1em;color:var(--tx)"></h3>
              <div id="mw-modal-btc" style="font-size:.82em;opacity:.6;margin-bottom:16px"></div>
              <div id="mw-modal-body"></div>
            </div>
          </div>`);
        document.getElementById('mw-modal').addEventListener('click', e => {
          if (e.target === document.getElementById('mw-modal')) document.getElementById('mw-modal').style.display = 'none';
        });
      }

      document.querySelectorAll('.mw-row').forEach(row => {
        row.addEventListener('click', () => {
          const w = (BT.MULTIWINDOW || {}).windows[+row.dataset.wi];
          if (!w) return;
          document.getElementById('mw-modal-title').textContent = `Window: ${w.label}`;
          document.getElementById('mw-modal-btc').textContent =
            `BTC: $${w.btc_start.toLocaleString()} → $${w.btc_end.toLocaleString()}  (${w.btc_change_pct >= 0 ? '+' : ''}${w.btc_change_pct}%)`;

          const TFS2 = ["15m", "30m", "1h", "4h"];
          const STRATS2 = [
            { key: "teelek",   label: "⚡ TeeLek",  color: "#34d399", canonical: _canon.teelek,   metric: "trades" },
            { key: "ultimate", label: "🔥 Ultimate", color: "#fb923c", canonical: _canon.ultimate, metric: "trades" },
            { key: "bestpos",  label: "💎 BestPos",  color: "#22d3ee", canonical: _canon.bestpos,  metric: "cycles" },
          ];

          const stratBlocks = STRATS2.map(s => {
            const data = w[s.key] || {};
            const tfRows = TFS2.map(tf => {
              const r = data[tf];
              if (!r) return `<tr style="opacity:.35"><td>${tf}</td><td colspan="4">—</td></tr>`;
              const isBest = tf === s.canonical;
              const retCls = r.ret >= 0 ? 'pos' : 'neg';
              const ddBad = r.dd <= -50;
              const ddCls = ddBad ? 'neg' : r.dd <= -30 ? '' : 'pos';
              const metricVal = r.trades != null ? `${r.trades} trades` : `${r.cycles} cycles`;
              const validBadge = ddBad
                ? `<span style="color:var(--bad);font-size:.75em">DD≥50%</span>`
                : `<span style="color:var(--good);font-size:.75em">✓</span>`;
              const rowStyle = isBest ? `background:color-mix(in oklch,${s.color} 10%,transparent);font-weight:600` : '';
              return `<tr style="${rowStyle}">
                <td class="tnum">${isBest ? '★ ' : ''}${tf}</td>
                <td class="tnum ${retCls}">${r.ret >= 0 ? '+' : ''}${r.ret}%</td>
                <td class="tnum ${ddCls}">${r.dd}%</td>
                <td class="tnum">${metricVal}</td>
                <td>${validBadge}</td>
              </tr>`;
            }).join('');
            return `<div style="margin-bottom:18px">
              <div style="color:${s.color};font-weight:600;margin-bottom:6px">${s.label}</div>
              <table class="tbl" style="width:100%">
                <thead><tr><th>TF</th><th>Return</th><th>Max DD</th><th>Trades/Cycles</th><th>DD filter</th></tr></thead>
                <tbody>${tfRows}</tbody>
              </table>
            </div>`;
          }).join('');

          document.getElementById('mw-modal-body').innerHTML = stratBlocks;
          document.getElementById('mw-modal').style.display = 'flex';
        });
      });

      // ── Smooth full-history chart: stitch 6 windows ─────────────────
      (function() {
        const canvas = document.getElementById('rb-chart');
        if (!canvas || !canvas.getContext) return;

        const wins = ((BT.MULTIWINDOW || {}).windows || []);
        // Fallback to current-window mode if no eq_canon data yet
        const hasEq = wins.length > 0 && wins[0].teelek && wins[0].teelek.eq_canon;

        const dpr = window.devicePixelRatio || 1;
        const par = canvas.parentElement;
        const cssW = par ? Math.max(200, par.clientWidth - 32) : 700;
        const cssH = 280;
        canvas.width  = cssW * dpr; canvas.height = cssH * dpr;
        canvas.style.width  = cssW + 'px'; canvas.style.height = cssH + 'px';
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        const W = cssW, H = cssH;
        const pad = { top: 28, right: 82, bottom: 30, left: 54 };
        const cW = W - pad.left - pad.right;
        const cH = H - pad.top  - pad.bottom;

        let SERIES, tMinMs, tMaxMs, winBands;

        if (hasEq) {
          // ── Full-history mode: stitch equity curves across 6 windows ──
          const fp = BT.MULTIWINDOW.fixed_params || {};
          const CANON = {
            teelek:   (fp.teelek   || {}).canonical_tf || '1h',
            ultimate: (fp.ultimate || {}).canonical_tf || '1h',
            bestpos:  (fp.bestpos  || {}).canonical_tf || '15m',
          };

          // BTC: stitch btc_daily from each window using cumulative factor
          const btcPts = [];
          let btcFac = 1.0;
          wins.forEach(w => {
            const daily = w.btc_daily || [];
            daily.forEach(p => btcPts.push({ t: p.t, v: +((btcFac * (1 + p.v/100) - 1)*100).toFixed(2) }));
            const last = daily[daily.length - 1];
            btcFac *= last ? (1 + last.v/100) : (1 + w.btc_change_pct/100);
          });

          // Strategy: stitch eq_canon using cumulative factor
          function stitchEq(key, canonTf) {
            const pts = [];
            let fac = 1.0;
            wins.forEach(w => {
              const eq = (w[key] || {}).eq_canon || [];
              eq.forEach(p => pts.push({ t: p.t, v: +((fac * (1 + p.v/100) - 1)*100).toFixed(2) }));
              const windowRet = ((w[key] || {})[canonTf] || {}).ret ?? 0;
              fac *= (1 + windowRet/100);
            });
            return pts;
          }
          // Stitch any equity key (e.g. eq_4h) using a given tf's ret for compounding
          function stitchEqKey(key, eqKey, retTf) {
            const pts = [];
            let fac = 1.0;
            wins.forEach(w => {
              const eq = (w[key] || {})[eqKey] || [];
              eq.forEach(p => pts.push({ t: p.t, v: +((fac * (1 + p.v/100) - 1)*100).toFixed(2) }));
              const windowRet = ((w[key] || {})[retTf] || {}).ret ?? 0;
              fac *= (1 + windowRet/100);
            });
            return pts;
          }

          SERIES = [
            { label: 'BTC B&H',               color: '#94a3b8', dash: [4,3], w: 1.5, pts: btcPts },
            { label: `TL [${CANON.teelek}]`,   color: '#34d399', dash: [],    w: 2.0,
              pts: stitchEq('teelek',   CANON.teelek) },
            { label: `ULT [${CANON.ultimate}]`, color: '#fb923c', dash: [],   w: 2.0,
              pts: stitchEq('ultimate', CANON.ultimate) },
            { label: `BP [${CANON.bestpos}]`,   color: '#22d3ee', dash: [],   w: 2.0,
              pts: stitchEq('bestpos',  CANON.bestpos) },
            // Extra strategies: use stitched eq if available (eq_4h for teelek4h), else current window only
            ...BT.STRATEGIES.filter(s => !['teelek','ultimate','bestpos'].includes(s.id)).map(s => {
              if (s.id === 'teelek4h') {
                const stitched = stitchEqKey('teelek', 'eq_4h', '4h');
                if (stitched.length > 1) return { label: `TL4h [4h]`, color: s.color, dash: [5,3], w: 1.5, pts: stitched };
              }
              return { label: `${s.name} [${s.tf}]`, color: s.color, dash: [5,3], w: 1.5,
                pts: (s.equityRet||[]).map(p=>({t:p.time,v:p.value})) };
            }),
          ].filter(s => s.pts.length > 1);

          // Window bands from since_ms
          const DAY90 = 90 * 24 * 3600 * 1000;
          tMinMs = wins[0].since_ms;
          tMaxMs = wins[wins.length-1].since_ms + DAY90;
          winBands = wins.map((w, i) => ({
            x0ms: w.since_ms, x1ms: w.since_ms + DAY90,
            label: w.label_short || w.label, btc: w.btc_change_pct, i
          }));

        } else {
          // ── Fallback: current window only (BT.price) ──
          const priceArr = BT.price || [];
          if (!priceArr.length) return;
          const p0 = priceArr[0].close;
          const btcPts = priceArr.map(p => ({ t: p.time, v: (p.close/p0-1)*100 }));
          SERIES = [
            { label: 'BTC B&H',  color: '#94a3b8', dash: [4,3], w: 1.5, pts: btcPts },
            ...BT.STRATEGIES.map(s => ({
              label: s.name, color: s.color, dash: [], w: 2.0,
              pts: (s.equityRet||[]).map(p=>({t:p.time,v:p.value}))
            })),
          ].filter(s => s.pts.length > 1);
          const allT = SERIES.flatMap(s => s.pts.map(p => +new Date(p.t)));
          tMinMs = Math.min(...allT); tMaxMs = Math.max(...allT);
          winBands = wins.map((w, i) => ({
            x0ms: w.since_ms, x1ms: w.since_ms + 90*24*3600*1000,
            label: w.label_short || w.label, btc: w.btc_change_pct, i
          }));
        }

        // ── Inject Monthly / Hybrid comparison lines ────────
        {
          const DAY30 = 30 * 24 * 3600 * 1000;
          const DAY90 = 90 * 24 * 3600 * 1000;

          // Monthly (BT.MONTHLY_RESULTS): clip to same start as multiwindow (wins[0].since_ms)
          const mWins = (BT.MONTHLY_RESULTS || {}).windows || [];
          if (mWins.length > 1 && wins.length > 0) {
            // Find the monthly window that aligns with the first 90d window
            const mAlignMs = wins[0].since_ms;
            const mStart = mWins.findIndex(m => m.since_ms === mAlignMs);
            const mSlice = mStart >= 0 ? mWins.slice(mStart) : mWins;
            const monthPts = [];
            let mEq = 1.0;
            mSlice.forEach((m) => {
              const tStart = m.since_ms;
              const mS = mEq, mE = mEq * (1 + m.ret/100);
              for (let d = 0; d < 30; d++)
                monthPts.push({ t: new Date(tStart + d*86400000).toISOString(),
                  v: +((mS + (mE-mS)*d/30 - 1)*100).toFixed(2) });
              mEq = mE;
            });
            const lastM = mSlice[mSlice.length-1];
            monthPts.push({ t: new Date(lastM.since_ms + DAY30).toISOString(),
              v: +((mEq-1)*100).toFixed(2) });
            SERIES.push({ label: 'Monthly', color: '#f59e0b', dash: [4,3], w: 1.5, pts: monthPts });
          }

          // Hybrid (BT.HYBRID_RESULTS): 6 windows, each 90d, aligned to multiwindow since_ms
          const hWins = (BT.HYBRID_RESULTS || {}).windows || [];
          if (hWins.length > 1 && wins.length >= hWins.length) {
            const hybPts = [];
            let hEq = 1.0;
            hWins.forEach((hw, hi) => {
              const tStart = wins[hi] ? wins[hi].since_ms : tMinMs + hi * DAY90;
              const hS = hEq, hE = hEq * (1 + hw.ret/100);
              const wkM = (hw.strategy||'').match(/wk(\d+)/);
              const trigWk = wkM ? parseInt(wkM[1]) : 13;
              const stopped = hw.stopped || false;
              for (let d = 0; d < 90; d++) {
                let eq;
                if (hw.strategy && hw.strategy.includes('BEAR')) {
                  eq = hS + (hE-hS)*d/90;                 // BEAR: linear
                } else if (stopped) {
                  const stopD = trigWk*7;
                  eq = d <= stopD ? hS + (hE-hS)*d/stopD : hE;
                } else {
                  const rD = (trigWk-1)*7;
                  eq = d < rD ? hS : hS + (hE-hS)*(d-rD)/(90-rD);
                }
                hybPts.push({ t: new Date(tStart + d*86400000).toISOString(),
                  v: +((eq-1)*100).toFixed(2) });
              }
              hEq = hE;
            });
            const lastW = wins[hWins.length-1];
            hybPts.push({ t: new Date(lastW.since_ms + DAY90).toISOString(),
              v: +((hEq-1)*100).toFixed(2) });
            SERIES.push({ label: 'Hybrid', color: '#e879f9', dash: [3,3], w: 1.6, pts: hybPts });
          }
        }

        if (!SERIES.length) return;
        const tRange = tMaxMs - tMinMs || 1;
        const allV = SERIES.flatMap(s => s.pts.map(p => p.v));
        let yMin = Math.min(0, ...allV), yMax = Math.max(0, ...allV);
        const yPad = (yMax - yMin) * 0.09 + 2; yMin -= yPad; yMax += yPad;
        const yRange = yMax - yMin || 1;

        const toX = t => pad.left + (+new Date(t) - tMinMs) / tRange * cW;
        const toXms = ms => pad.left + (ms - tMinMs) / tRange * cW;
        const toY = v => pad.top + (1 - (v - yMin) / yRange) * cH;

        const cssBg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
        const isDark = cssBg !== '#f9fafb' && cssBg !== '#ffffff';
        const gc = isDark ? 'rgba(255,255,255,' : 'rgba(0,0,0,';

        ctx.clearRect(0, 0, W, H);

        // ── Window bands ─────────────────────────────────────────
        (winBands || []).forEach(b => {
          const x0 = toXms(b.x0ms), x1 = toXms(b.x1ms);
          const cx0 = Math.max(pad.left, x0), cx1 = Math.min(pad.left + cW, x1);
          if (cx1 <= pad.left || cx0 >= pad.left + cW) return;
          ctx.fillStyle = b.i % 2 === 0 ? 'rgba(148,163,184,0.04)' : 'rgba(148,163,184,0.10)';
          ctx.fillRect(cx0, pad.top, cx1 - cx0, cH);
          if (x0 >= pad.left) {
            ctx.beginPath(); ctx.strokeStyle = 'rgba(148,163,184,0.28)';
            ctx.lineWidth = 1; ctx.setLineDash([4,4]);
            ctx.moveTo(x0, pad.top); ctx.lineTo(x0, pad.top + cH); ctx.stroke(); ctx.setLineDash([]);
          }
          ctx.fillStyle = 'rgba(148,163,184,0.6)'; ctx.font = '8px system-ui,sans-serif'; ctx.textAlign = 'center';
          ctx.fillText(b.label, (cx0+cx1)/2, pad.top - 8);
          const btcCol = b.btc > 15 ? '#34d399' : b.btc < -15 ? '#f87171' : '#94a3b8';
          ctx.fillStyle = btcCol; ctx.globalAlpha = 0.5; ctx.font = '8px system-ui,sans-serif';
          ctx.fillText((b.btc >= 0?'+':'') + b.btc.toFixed(0)+'%', (cx0+cx1)/2, pad.top + cH - 4);
          ctx.globalAlpha = 1;
        });
        // Right-edge divider
        if (winBands && winBands.length) {
          const xR = toXms(winBands[winBands.length-1].x1ms);
          if (xR >= pad.left && xR <= pad.left+cW) {
            ctx.beginPath(); ctx.strokeStyle = 'rgba(148,163,184,0.28)'; ctx.lineWidth=1; ctx.setLineDash([4,4]);
            ctx.moveTo(xR, pad.top); ctx.lineTo(xR, pad.top+cH); ctx.stroke(); ctx.setLineDash([]);
          }
        }

        // ── IS / OOS shading ──────────────────────────────────────
        const OOS_START_MS = new Date('2025-10-01').getTime();
        const xOos = toXms(OOS_START_MS);
        if (xOos > pad.left && xOos < pad.left + cW) {
          // OOS region tint
          ctx.fillStyle = isDark ? 'rgba(251,191,36,0.07)' : 'rgba(251,191,36,0.09)';
          ctx.fillRect(xOos, pad.top, pad.left + cW - xOos, cH);
          // Vertical line
          ctx.beginPath();
          ctx.strokeStyle = isDark ? 'rgba(251,191,36,0.75)' : 'rgba(180,117,23,0.8)';
          ctx.lineWidth = 1.5; ctx.setLineDash([6,3]);
          ctx.moveTo(xOos, pad.top); ctx.lineTo(xOos, pad.top + cH);
          ctx.stroke(); ctx.setLineDash([]);
          // IS label
          ctx.fillStyle = isDark ? 'rgba(148,163,184,0.75)' : 'rgba(100,116,139,0.8)';
          ctx.font = 'bold 9px system-ui,sans-serif'; ctx.textAlign = 'right';
          ctx.fillText('◀ IS (backtest)', xOos - 6, pad.top + 14);
          // OOS label
          ctx.fillStyle = isDark ? 'rgba(251,191,36,0.95)' : 'rgba(180,117,23,0.95)';
          ctx.textAlign = 'left';
          ctx.fillText('OOS (held-out) ▶', xOos + 6, pad.top + 14);
        }

        // ── Y grid + labels ───────────────────────────────────────
        const rawStep = (yMax-yMin)/6;
        const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(rawStep)||1)));
        const nice = [1,2,5,10,20,50].map(m=>mag*m).find(s=>s>=rawStep)||mag*50;
        for (let v = Math.ceil(yMin/nice)*nice; v <= yMax+0.001; v += nice) {
          const y = toY(v), isZ = Math.abs(v)<0.01;
          ctx.beginPath(); ctx.strokeStyle = isZ ? 'rgba(148,163,184,0.35)' : gc+'0.07)';
          ctx.lineWidth = isZ ? 1.2 : 0.5; ctx.setLineDash(isZ ? [5,3] : []);
          ctx.moveTo(pad.left,y); ctx.lineTo(pad.left+cW,y); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = gc+'0.45)'; ctx.font = '9px system-ui,sans-serif'; ctx.textAlign = 'right';
          ctx.fillText((v>0?'+':'')+v.toFixed(0)+'%', pad.left-4, y+3.5);
        }

        // ── X labels: monthly ticks from first series ─────────────
        ctx.textAlign = 'center';
        let prevML = '';
        (SERIES[0].pts || []).forEach(p => {
          const ml = new Date(p.t).toLocaleString('default',{month:'short',year:'2-digit'});
          const mlShort = new Date(p.t).toLocaleString('default',{month:'short'});
          if (mlShort !== prevML) {
            prevML = mlShort;
            const x = toX(p.t);
            ctx.beginPath(); ctx.strokeStyle=gc+'0.06)'; ctx.lineWidth=0.5;
            ctx.moveTo(x,pad.top); ctx.lineTo(x,pad.top+cH); ctx.stroke();
            ctx.fillStyle=gc+'0.4)'; ctx.font='8px system-ui,sans-serif';
            ctx.fillText(mlShort, x, pad.top+cH+13);
          }
        });

        // ── Series + right-edge labels ────────────────────────────
        SERIES.forEach(s => {
          ctx.beginPath(); ctx.strokeStyle=s.color; ctx.lineWidth=s.w; ctx.setLineDash(s.dash);
          s.pts.forEach((p,i)=>{ const x=toX(p.t),y=toY(p.v); i?ctx.lineTo(x,y):ctx.moveTo(x,y); });
          ctx.stroke(); ctx.setLineDash([]);
          const last = s.pts[s.pts.length-1];
          const ey = Math.max(pad.top+5, Math.min(pad.top+cH-4, toY(last.v)));
          ctx.fillStyle=s.color; ctx.font='bold 9px system-ui,sans-serif'; ctx.textAlign='left';
          ctx.fillText((last.v>=0?'+':'')+last.v.toFixed(1)+'%', pad.left+cW+4, ey+3.5);
        });

        // ── Legend ────────────────────────────────────────────────
        let lx=pad.left, ly=pad.top-14;
        SERIES.forEach(s=>{
          ctx.beginPath(); ctx.strokeStyle=s.color; ctx.lineWidth=s.dash.length?1.5:2;
          ctx.setLineDash(s.dash); ctx.moveTo(lx,ly); ctx.lineTo(lx+16,ly);
          ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle=s.color; ctx.font='9px system-ui,sans-serif'; ctx.textAlign='left';
          ctx.fillText(s.label, lx+20, ly+3.5);
          lx += 20+ctx.measureText(s.label).width+16;
        });
      
  // ══════════════════════════════════════════════════════════════════
  // GRID SEARCH V2 VIEW
  // ══════════════════════════════════════════════════════════════════
  function renderGridV2() {
    clearCharts();
    const G = window.GRID_V2;
    if (!G) {
      $("#main").innerHTML = "<p style='color:var(--tx-3);padding:24px'>grid_v2_data.js not loaded</p>";
      return;
    }
    const ins = G.insights;

    // Colour helpers
    function clr(v) { return v > 0 ? "var(--pos)" : v < 0 ? "var(--neg)" : "var(--tx)"; }
    function pctBar(pct, color) {
      return `<div style="flex:1;height:5px;border-radius:3px;background:var(--bg-2);border:1px solid var(--line);overflow:hidden;max-width:90px">
        <span style="display:block;height:100%;width:${Math.min(pct,100)}%;background:${color};border-radius:3px"></span></div>`;
    }

    // ── Insight cards ──────────────────────────────────────────────
    const insightHTML = `
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:var(--gap);margin-bottom:var(--gap)">
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,var(--pos),transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">Total Epochs</div>
    <div style="font-family:var(--mono);font-size:32px;font-weight:600;color:var(--tx);margin-top:4px">${G.total_epochs.toLocaleString()}</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">${G.valid_epochs.toLocaleString()} valid (${G.pct_valid}%)</div>
  </div>
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,var(--pos),transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">Best Asset Combo</div>
    <div style="font-family:var(--mono);font-size:18px;font-weight:600;color:var(--pos);margin-top:6px">${ins.best_combo}</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">med OOS <b style="color:var(--pos)">+${ins.best_combo_med}%</b> (${ins.best_combo_pct}% pos)</div>
  </div>
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,#38bdf8,transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">Best TL Timeframe</div>
    <div style="font-family:var(--mono);font-size:28px;font-weight:600;color:#38bdf8;margin-top:4px">TL-${ins.best_tf}</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">med OOS <b style="color:#38bdf8">+${ins.best_tf_med}%</b> (${ins.best_tf_pct}% pos)</div>
  </div>
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,var(--warn),transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">TradFi Premium</div>
    <div style="font-family:var(--mono);font-size:28px;font-weight:600;color:var(--warn);margin-top:4px">${ins.tradfi_premium > 0 ? "+" : ""}${ins.tradfi_premium}%</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">TradFi <b style="color:var(--pos)">${ins.med_tradfi > 0 ? "+" : ""}${ins.med_tradfi}%</b> vs Crypto <b style="color:${ins.med_crypto > 0 ? "var(--pos)" : "var(--neg)"}">${ins.med_crypto > 0 ? "+" : ""}${ins.med_crypto}%</b></div>
  </div>
</div>`;

    // ── Asset combo table ──────────────────────────────────────────
    const comboRows = G.by_combo.map(r => {
      const pct = r.pct_pos;
      const barClr = pct >= 60 ? "var(--pos)" : pct >= 40 ? "var(--warn)" : "var(--neg)";
      const medClr = r.med_oos > 0 ? "var(--pos)" : r.med_oos < -5 ? "var(--neg)" : "var(--tx-2)";
      return `<tr>
        <td style="font-family:var(--mono);font-size:12.5px;padding:10px 14px;border-bottom:1px solid var(--line)">${r.assets}</td>
        <td style="padding:10px 14px;border-bottom:1px solid var(--line)">
          <div style="display:flex;align-items:center;gap:8px">
            ${pctBar(pct, barClr)}
            <span style="font-family:var(--mono);font-size:12.5px;color:${barClr};white-space:nowrap">${pct}%</span>
          </div>
        </td>
        <td style="font-family:var(--mono);font-size:13px;color:${medClr};padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_oos > 0 ? "+" : ""}${r.med_oos}%</td>
        <td style="font-family:var(--mono);font-size:13px;color:var(--pos);padding:10px 14px;border-bottom:1px solid var(--line)">+${r.best_oos}%</td>
        <td style="font-family:var(--mono);font-size:12.5px;color:var(--tx-2);padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_shp.toFixed(2)}</td>
      </tr>`;
    }).join("");

    // ── TF table ───────────────────────────────────────────────────
    const tfRows = G.by_tf.map(r => {
      const pct = r.pct_pos;
      const barClr = pct >= 70 ? "var(--pos)" : pct >= 40 ? "var(--warn)" : "var(--neg)";
      const medClr = r.med_oos > 0 ? "var(--pos)" : r.med_oos < -5 ? "var(--neg)" : "var(--tx-2)";
      return `<tr>
        <td style="font-family:var(--mono);font-size:13px;font-weight:600;padding:10px 14px;border-bottom:1px solid var(--line);color:${r.tf === "1d" ? "var(--pos)" : "var(--tx)"}">TL-${r.tf}${r.tf === "1d" ? " ★" : ""}</td>
        <td style="padding:10px 14px;border-bottom:1px solid var(--line)">
          <div style="display:flex;align-items:center;gap:8px">
            ${pctBar(pct, barClr)}
            <span style="font-family:var(--mono);font-size:12.5px;color:${barClr};white-space:nowrap">${pct}%</span>
          </div>
        </td>
        <td style="font-family:var(--mono);font-size:13px;color:${medClr};padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_oos > 0 ? "+" : ""}${r.med_oos}%</td>
        <td style="font-family:var(--mono);font-size:12.5px;color:var(--tx-2);padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_shp.toFixed(3)}</td>
      </tr>`;
    }).join("");

    // ── Top 10 configs ─────────────────────────────────────────────
    const top10Rows = G.top10.map((r, i) => {
      const oosClr = r.oos_cum > 50 ? "var(--pos)" : r.oos_cum > 0 ? "var(--pos)" : "var(--neg)";
      const isClr  = r.is_cum  > 0  ? "var(--tx)" : "var(--tx-3)";
      return `<tr>
        <td style="font-family:var(--mono);font-size:11px;color:var(--tx-3);padding:9px 14px;border-bottom:1px solid var(--line)">${i+1}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line)">${r.assets}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:#38bdf8">${r.tl_tf}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:${isClr}">${r.is_cum > 0 ? "+" : ""}${r.is_cum}%</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:${oosClr};font-weight:600">${r.oos_cum > 0 ? "+" : ""}${r.oos_cum}%</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:var(--pos)">${r.oos_sharpe.toFixed(3)}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:var(--tx-2)">${r.oos_wins}/${r.n_oos}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:var(--neg)">${r.oos_worst}%</td>
      </tr>`;
    }).join("");

    $("#main").innerHTML = `
${insightHTML}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--gap)">
  <!-- Asset Combo table -->
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
    <div style="padding:14px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px">
      <span style="font-size:16px">📊</span>
      <div>
        <div style="font-size:14px;font-weight:600">Median OOS by Asset Combo</div>
        <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono)">จาก ${G.total_epochs.toLocaleString()} epoch — sorted by med OOS</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:var(--bg-2)">
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Assets</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">% Positive</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med OOS</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Best OOS</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med Shp</th>
        </tr>
      </thead>
      <tbody>${comboRows}</tbody>
    </table>
  </div>

  <!-- Right column: TF + Top configs -->
  <div style="display:flex;flex-direction:column;gap:var(--gap)">
    <!-- TF table -->
    <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
      <div style="padding:14px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px">
        <span style="font-size:16px">⏱️</span>
        <div>
          <div style="font-size:14px;font-weight:600">Median OOS by TL Timeframe</div>
          <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono)">TL ใช้ในเดือน BEAR เท่านั้น</div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:var(--bg-2)">
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">TF</th>
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">% Positive</th>
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med OOS</th>
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med Shp</th>
          </tr>
        </thead>
        <tbody>${tfRows}</tbody>
      </table>
    </div>

    <!-- Insight note -->
    <div style="background:color-mix(in oklch,var(--pos) 7%,var(--panel));border:1px solid color-mix(in oklch,var(--pos) 22%,transparent);border-radius:var(--r);padding:14px 16px;font-size:12.5px;line-height:1.6;color:var(--tx-2)">
      <div style="font-weight:600;color:var(--tx);margin-bottom:6px">🔎 Key Findings</div>
      <div>• <b style="color:var(--pos)">TL-1d</b> ครองอันดับ 1 ด้วย 98% positive, median OOS <b style="color:var(--pos)">+${ins.best_tf_med}%</b></div>
      <div style="margin-top:4px">• <b style="color:var(--pos)">${ins.best_combo}</b> คือ combo ที่ดีที่สุด จาก 13 combos ทั้งหมด</div>
      <div style="margin-top:4px">• เพิ่ม SPY/GLD ช่วยให้ median OOS <b style="color:var(--warn)">+${ins.tradfi_premium}%</b> เทียบกับ pure crypto</div>
      <div style="margin-top:4px">• TL-1h/2h ควรหลีกเลี่ยง — median OOS ติดลบหนัก</div>
    </div>
  </div>
</div>

<!-- Top 10 configs -->
<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
  <div style="padding:14px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px">
    <span style="font-size:16px">🏆</span>
    <div>
      <div style="font-size:14px;font-weight:600">Top 10 Configurations (Deduplicated by Assets × TF)</div>
      <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono)">Score = OOS×0.5 + Sharpe×0.3 + Overfit×0.2 — จาก 15,600 epochs</div>
    </div>
  </div>
  <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12.5px;white-space:nowrap">
      <thead>
        <tr style="background:var(--bg-2)">
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11px;color:var(--tx-3)">#</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Assets</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">TL TF</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">IS Cum</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--pos)">OOS Cum</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">OOS Sharpe</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">OOS Wins</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--neg)">Worst Month</th>
        </tr>
      </thead>
      <tbody>${top10Rows}</tbody>
    </table>
  </div>
</div>`;
  }


})();

      // ── DD sub-chart ──────────────────────────────────────────
      (function() {
        const ddCanvas = document.getElementById('rb-dd-chart');
        if (!ddCanvas || !ddCanvas.getContext) return;

        const wins = ((BT.MULTIWINDOW || {}).windows || []);
        const hasEq = wins.length > 0 && wins[0].teelek && wins[0].teelek.eq_canon;
        if (!hasEq) return;

        const fp2 = BT.MULTIWINDOW.fixed_params || {};
        const CANON2 = {
          teelek:   (fp2.teelek   || {}).canonical_tf || '1h',
          ultimate: (fp2.ultimate || {}).canonical_tf || '1h',
          bestpos:  (fp2.bestpos  || {}).canonical_tf || '15m',
        };
        function stitchEq2(key, canonTf) {
          const pts = []; let fac = 1.0;
          wins.forEach(w => {
            const eq = (w[key] || {}).eq_canon || [];
            eq.forEach(p => pts.push({ t: p.t, v: +((fac * (1 + p.v/100) - 1)*100).toFixed(2) }));
            fac *= (1 + (((w[key] || {})[canonTf] || {}).ret ?? 0)/100);
          });
          return pts;
        }
        function stitchEqKey2(key, eqKey, retTf) {
          const pts = []; let fac = 1.0;
          wins.forEach(w => {
            const eq = (w[key] || {})[eqKey] || [];
            eq.forEach(p => pts.push({ t: p.t, v: +((fac * (1 + p.v/100) - 1)*100).toFixed(2) }));
            fac *= (1 + (((w[key] || {})[retTf] || {}).ret ?? 0)/100);
          });
          return pts;
        }
        function calcDD(pts) {
          let peak = 0;
          return pts.map(p => {
            if (p.v > peak) peak = p.v;
            const dd = ((1 + p.v/100) / (1 + peak/100) - 1) * 100;
            return { t: p.t, v: dd };
          });
        }
        const DD_SERIES = [
          { label: `TL`,  color: '#34d399', pts: calcDD(stitchEq2('teelek',   CANON2.teelek))   },
          { label: `ULT`, color: '#fb923c', pts: calcDD(stitchEq2('ultimate', CANON2.ultimate)) },
          { label: `BP`,  color: '#22d3ee', pts: calcDD(stitchEq2('bestpos',  CANON2.bestpos))  },
          // Extra strategies — use stitched eq if available
          ...BT.STRATEGIES.filter(s => !['teelek','ultimate','bestpos'].includes(s.id)).map(s => {
            if (s.id === 'teelek4h') {
              const stitched = stitchEqKey2('teelek', 'eq_4h', '4h');
              if (stitched.length > 1) return { label: 'TL4h', color: s.color, pts: calcDD(stitched) };
            }
            return { label: s.name, color: s.color,
              pts: calcDD((s.equityRet||[]).map(p=>({t:p.time,v:p.value}))) };
          }),
        ].filter(s => s.pts.length > 1);
        if (!DD_SERIES.length) return;

        const DAY90 = 90*24*3600*1000;
        const tMinMs2 = wins[0].since_ms;
        const tMaxMs2 = wins[wins.length-1].since_ms + DAY90;
        const tRange2 = tMaxMs2 - tMinMs2 || 1;
        const winBands2 = wins.map((w,i) => ({ x0ms:w.since_ms, x1ms:w.since_ms+DAY90, i }));

        const dpr2 = window.devicePixelRatio || 1;
        const par2 = ddCanvas.parentElement;
        const cssW2 = par2 ? Math.max(200, par2.clientWidth - 32) : 700;
        const cssH2 = 90;
        ddCanvas.width  = cssW2 * dpr2; ddCanvas.height = cssH2 * dpr2;
        ddCanvas.style.width = cssW2+'px'; ddCanvas.style.height = cssH2+'px';
        const ddCtx = ddCanvas.getContext('2d');
        ddCtx.scale(dpr2, dpr2);
        const ddPad = { top: 10, right: 82, bottom: 18, left: 54 };
        const ddCW = cssW2 - ddPad.left - ddPad.right;
        const ddCH = cssH2 - ddPad.top  - ddPad.bottom;

        const allDD = DD_SERIES.flatMap(s => s.pts.map(p => p.v));
        const ddMin = Math.min(-2, ...allDD) * 1.08;
        const ddRange = -ddMin || 1;
        const toXdd  = t  => ddPad.left + (+new Date(t) - tMinMs2) / tRange2 * ddCW;
        const toXddMs= ms => ddPad.left + (ms - tMinMs2) / tRange2 * ddCW;
        const toYdd  = v  => ddPad.top  + (1 - (v - ddMin) / ddRange) * ddCH;  // v<=0, ddMin<0
        const toYdd0 = () => ddPad.top;  // 0% is at top

        const cssBg2 = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
        const isDark2 = cssBg2 !== '#f9fafb' && cssBg2 !== '#ffffff';
        const gc2 = isDark2 ? 'rgba(255,255,255,' : 'rgba(0,0,0,';

        ddCtx.clearRect(0, 0, cssW2, cssH2);

        // Window bands
        winBands2.forEach(b => {
          const x0=toXddMs(b.x0ms), x1=toXddMs(b.x1ms);
          const cx0=Math.max(ddPad.left,x0), cx1=Math.min(ddPad.left+ddCW,x1);
          if (cx1<=ddPad.left||cx0>=ddPad.left+ddCW) return;
          ddCtx.fillStyle = b.i%2===0?'rgba(148,163,184,0.04)':'rgba(148,163,184,0.10)';
          ddCtx.fillRect(cx0,ddPad.top,cx1-cx0,ddCH);
          if (x0>=ddPad.left) {
            ddCtx.beginPath(); ddCtx.strokeStyle='rgba(148,163,184,0.28)';
            ddCtx.lineWidth=1; ddCtx.setLineDash([4,4]);
            ddCtx.moveTo(x0,ddPad.top); ddCtx.lineTo(x0,ddPad.top+ddCH);
            ddCtx.stroke(); ddCtx.setLineDash([]);
          }
        });

        // ── IS / OOS shading (dd chart) ───────────────────────────
        const xOosDd = toXddMs(new Date('2025-10-01').getTime());
        if (xOosDd > ddPad.left && xOosDd < ddPad.left + ddCW) {
          ddCtx.fillStyle = isDark2 ? 'rgba(251,191,36,0.07)' : 'rgba(251,191,36,0.09)';
          ddCtx.fillRect(xOosDd, ddPad.top, ddPad.left + ddCW - xOosDd, ddCH);
          ddCtx.beginPath();
          ddCtx.strokeStyle = isDark2 ? 'rgba(251,191,36,0.75)' : 'rgba(180,117,23,0.8)';
          ddCtx.lineWidth = 1.5; ddCtx.setLineDash([6,3]);
          ddCtx.moveTo(xOosDd, ddPad.top); ddCtx.lineTo(xOosDd, ddPad.top + ddCH);
          ddCtx.stroke(); ddCtx.setLineDash([]);
        }

        // Zero baseline
        const y0 = toYdd0();
        ddCtx.beginPath(); ddCtx.strokeStyle=gc2+'0.25)'; ddCtx.lineWidth=0.8; ddCtx.setLineDash([]);
        ddCtx.moveTo(ddPad.left,y0); ddCtx.lineTo(ddPad.left+ddCW,y0); ddCtx.stroke();
        ddCtx.fillStyle=gc2+'0.4)'; ddCtx.font='9px system-ui,sans-serif'; ddCtx.textAlign='right';
        ddCtx.fillText('0%', ddPad.left-4, y0+3.5);

        // Y tick at midpoint
        const midV = Math.round(ddMin/2);
        const yMid = toYdd(midV);
        ddCtx.beginPath(); ddCtx.strokeStyle=gc2+'0.07)'; ddCtx.lineWidth=0.5;
        ddCtx.moveTo(ddPad.left,yMid); ddCtx.lineTo(ddPad.left+ddCW,yMid); ddCtx.stroke();
        ddCtx.fillStyle=gc2+'0.4)'; ddCtx.font='9px system-ui,sans-serif'; ddCtx.textAlign='right';
        ddCtx.fillText(midV+'%', ddPad.left-4, yMid+3.5);

        // "DD" label
        ddCtx.fillStyle=gc2+'0.3)'; ddCtx.font='bold 8px system-ui,sans-serif'; ddCtx.textAlign='left';
        ddCtx.fillText('DD', ddPad.left+2, ddPad.top+9);

        // Draw each strategy's DD as filled area + line
        DD_SERIES.forEach(s => {
          const pts = s.pts;
          if (pts.length < 2) return;
          // Filled area
          ddCtx.beginPath();
          ddCtx.moveTo(toXdd(pts[0].t), y0);
          pts.forEach(p => ddCtx.lineTo(toXdd(p.t), toYdd(p.v)));
          ddCtx.lineTo(toXdd(pts[pts.length-1].t), y0);
          ddCtx.closePath();
          const grad = ddCtx.createLinearGradient(0,ddPad.top,0,ddPad.top+ddCH);
          grad.addColorStop(0, s.color+'30');
          grad.addColorStop(1, s.color+'06');
          ddCtx.fillStyle=grad; ddCtx.fill();
          // Line
          ddCtx.beginPath(); ddCtx.strokeStyle=s.color; ddCtx.lineWidth=1.2; ddCtx.setLineDash([]);
          pts.forEach((p,i)=>{ const x=toXdd(p.t),y=toYdd(p.v); i?ddCtx.lineTo(x,y):ddCtx.moveTo(x,y); });
          ddCtx.stroke();
          // Right label
          const last=pts[pts.length-1];
          const ey=Math.max(ddPad.top+4, Math.min(ddPad.top+ddCH-4, toYdd(last.v)));
          ddCtx.fillStyle=s.color; ddCtx.font='bold 9px system-ui,sans-serif'; ddCtx.textAlign='left';
          ddCtx.fillText(last.v.toFixed(1)+'%', ddPad.left+ddCW+4, ey+3.5);
        });
      
  // ══════════════════════════════════════════════════════════════════
  // GRID SEARCH V2 VIEW
  // ══════════════════════════════════════════════════════════════════
  function renderGridV2() {
    clearCharts();
    const G = window.GRID_V2;
    if (!G) {
      $("#main").innerHTML = "<p style='color:var(--tx-3);padding:24px'>grid_v2_data.js not loaded</p>";
      return;
    }
    const ins = G.insights;

    // Colour helpers
    function clr(v) { return v > 0 ? "var(--pos)" : v < 0 ? "var(--neg)" : "var(--tx)"; }
    function pctBar(pct, color) {
      return `<div style="flex:1;height:5px;border-radius:3px;background:var(--bg-2);border:1px solid var(--line);overflow:hidden;max-width:90px">
        <span style="display:block;height:100%;width:${Math.min(pct,100)}%;background:${color};border-radius:3px"></span></div>`;
    }

    // ── Insight cards ──────────────────────────────────────────────
    const insightHTML = `
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:var(--gap);margin-bottom:var(--gap)">
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,var(--pos),transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">Total Epochs</div>
    <div style="font-family:var(--mono);font-size:32px;font-weight:600;color:var(--tx);margin-top:4px">${G.total_epochs.toLocaleString()}</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">${G.valid_epochs.toLocaleString()} valid (${G.pct_valid}%)</div>
  </div>
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,var(--pos),transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">Best Asset Combo</div>
    <div style="font-family:var(--mono);font-size:18px;font-weight:600;color:var(--pos);margin-top:6px">${ins.best_combo}</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">med OOS <b style="color:var(--pos)">+${ins.best_combo_med}%</b> (${ins.best_combo_pct}% pos)</div>
  </div>
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,#38bdf8,transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">Best TL Timeframe</div>
    <div style="font-family:var(--mono);font-size:28px;font-weight:600;color:#38bdf8;margin-top:4px">TL-${ins.best_tf}</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">med OOS <b style="color:#38bdf8">+${ins.best_tf_med}%</b> (${ins.best_tf_pct}% pos)</div>
  </div>
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,var(--warn),transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">TradFi Premium</div>
    <div style="font-family:var(--mono);font-size:28px;font-weight:600;color:var(--warn);margin-top:4px">${ins.tradfi_premium > 0 ? "+" : ""}${ins.tradfi_premium}%</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">TradFi <b style="color:var(--pos)">${ins.med_tradfi > 0 ? "+" : ""}${ins.med_tradfi}%</b> vs Crypto <b style="color:${ins.med_crypto > 0 ? "var(--pos)" : "var(--neg)"}">${ins.med_crypto > 0 ? "+" : ""}${ins.med_crypto}%</b></div>
  </div>
</div>`;

    // ── Asset combo table ──────────────────────────────────────────
    const comboRows = G.by_combo.map(r => {
      const pct = r.pct_pos;
      const barClr = pct >= 60 ? "var(--pos)" : pct >= 40 ? "var(--warn)" : "var(--neg)";
      const medClr = r.med_oos > 0 ? "var(--pos)" : r.med_oos < -5 ? "var(--neg)" : "var(--tx-2)";
      return `<tr>
        <td style="font-family:var(--mono);font-size:12.5px;padding:10px 14px;border-bottom:1px solid var(--line)">${r.assets}</td>
        <td style="padding:10px 14px;border-bottom:1px solid var(--line)">
          <div style="display:flex;align-items:center;gap:8px">
            ${pctBar(pct, barClr)}
            <span style="font-family:var(--mono);font-size:12.5px;color:${barClr};white-space:nowrap">${pct}%</span>
          </div>
        </td>
        <td style="font-family:var(--mono);font-size:13px;color:${medClr};padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_oos > 0 ? "+" : ""}${r.med_oos}%</td>
        <td style="font-family:var(--mono);font-size:13px;color:var(--pos);padding:10px 14px;border-bottom:1px solid var(--line)">+${r.best_oos}%</td>
        <td style="font-family:var(--mono);font-size:12.5px;color:var(--tx-2);padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_shp.toFixed(2)}</td>
      </tr>`;
    }).join("");

    // ── TF table ───────────────────────────────────────────────────
    const tfRows = G.by_tf.map(r => {
      const pct = r.pct_pos;
      const barClr = pct >= 70 ? "var(--pos)" : pct >= 40 ? "var(--warn)" : "var(--neg)";
      const medClr = r.med_oos > 0 ? "var(--pos)" : r.med_oos < -5 ? "var(--neg)" : "var(--tx-2)";
      return `<tr>
        <td style="font-family:var(--mono);font-size:13px;font-weight:600;padding:10px 14px;border-bottom:1px solid var(--line);color:${r.tf === "1d" ? "var(--pos)" : "var(--tx)"}">TL-${r.tf}${r.tf === "1d" ? " ★" : ""}</td>
        <td style="padding:10px 14px;border-bottom:1px solid var(--line)">
          <div style="display:flex;align-items:center;gap:8px">
            ${pctBar(pct, barClr)}
            <span style="font-family:var(--mono);font-size:12.5px;color:${barClr};white-space:nowrap">${pct}%</span>
          </div>
        </td>
        <td style="font-family:var(--mono);font-size:13px;color:${medClr};padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_oos > 0 ? "+" : ""}${r.med_oos}%</td>
        <td style="font-family:var(--mono);font-size:12.5px;color:var(--tx-2);padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_shp.toFixed(3)}</td>
      </tr>`;
    }).join("");

    // ── Top 10 configs ─────────────────────────────────────────────
    const top10Rows = G.top10.map((r, i) => {
      const oosClr = r.oos_cum > 50 ? "var(--pos)" : r.oos_cum > 0 ? "var(--pos)" : "var(--neg)";
      const isClr  = r.is_cum  > 0  ? "var(--tx)" : "var(--tx-3)";
      return `<tr>
        <td style="font-family:var(--mono);font-size:11px;color:var(--tx-3);padding:9px 14px;border-bottom:1px solid var(--line)">${i+1}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line)">${r.assets}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:#38bdf8">${r.tl_tf}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:${isClr}">${r.is_cum > 0 ? "+" : ""}${r.is_cum}%</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:${oosClr};font-weight:600">${r.oos_cum > 0 ? "+" : ""}${r.oos_cum}%</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:var(--pos)">${r.oos_sharpe.toFixed(3)}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:var(--tx-2)">${r.oos_wins}/${r.n_oos}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:var(--neg)">${r.oos_worst}%</td>
      </tr>`;
    }).join("");

    $("#main").innerHTML = `
${insightHTML}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--gap)">
  <!-- Asset Combo table -->
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
    <div style="padding:14px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px">
      <span style="font-size:16px">📊</span>
      <div>
        <div style="font-size:14px;font-weight:600">Median OOS by Asset Combo</div>
        <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono)">จาก ${G.total_epochs.toLocaleString()} epoch — sorted by med OOS</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:var(--bg-2)">
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Assets</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">% Positive</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med OOS</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Best OOS</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med Shp</th>
        </tr>
      </thead>
      <tbody>${comboRows}</tbody>
    </table>
  </div>

  <!-- Right column: TF + Top configs -->
  <div style="display:flex;flex-direction:column;gap:var(--gap)">
    <!-- TF table -->
    <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
      <div style="padding:14px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px">
        <span style="font-size:16px">⏱️</span>
        <div>
          <div style="font-size:14px;font-weight:600">Median OOS by TL Timeframe</div>
          <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono)">TL ใช้ในเดือน BEAR เท่านั้น</div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:var(--bg-2)">
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">TF</th>
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">% Positive</th>
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med OOS</th>
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med Shp</th>
          </tr>
        </thead>
        <tbody>${tfRows}</tbody>
      </table>
    </div>

    <!-- Insight note -->
    <div style="background:color-mix(in oklch,var(--pos) 7%,var(--panel));border:1px solid color-mix(in oklch,var(--pos) 22%,transparent);border-radius:var(--r);padding:14px 16px;font-size:12.5px;line-height:1.6;color:var(--tx-2)">
      <div style="font-weight:600;color:var(--tx);margin-bottom:6px">🔎 Key Findings</div>
      <div>• <b style="color:var(--pos)">TL-1d</b> ครองอันดับ 1 ด้วย 98% positive, median OOS <b style="color:var(--pos)">+${ins.best_tf_med}%</b></div>
      <div style="margin-top:4px">• <b style="color:var(--pos)">${ins.best_combo}</b> คือ combo ที่ดีที่สุด จาก 13 combos ทั้งหมด</div>
      <div style="margin-top:4px">• เพิ่ม SPY/GLD ช่วยให้ median OOS <b style="color:var(--warn)">+${ins.tradfi_premium}%</b> เทียบกับ pure crypto</div>
      <div style="margin-top:4px">• TL-1h/2h ควรหลีกเลี่ยง — median OOS ติดลบหนัก</div>
    </div>
  </div>
</div>

<!-- Top 10 configs -->
<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
  <div style="padding:14px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px">
    <span style="font-size:16px">🏆</span>
    <div>
      <div style="font-size:14px;font-weight:600">Top 10 Configurations (Deduplicated by Assets × TF)</div>
      <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono)">Score = OOS×0.5 + Sharpe×0.3 + Overfit×0.2 — จาก 15,600 epochs</div>
    </div>
  </div>
  <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12.5px;white-space:nowrap">
      <thead>
        <tr style="background:var(--bg-2)">
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11px;color:var(--tx-3)">#</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Assets</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">TL TF</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">IS Cum</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--pos)">OOS Cum</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">OOS Sharpe</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">OOS Wins</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--neg)">Worst Month</th>
        </tr>
      </thead>
      <tbody>${top10Rows}</tbody>
    </table>
  </div>
</div>`;
  }


})();

      // ── Approach Comparison Charts (removed) ─────────────────────────
      (function() {
        return; // removed per user request
        const mWinsAC = (BT.MONTHLY_RESULTS||{}).windows || [];
        const hWinsAC = (BT.HYBRID_RESULTS||{}).windows || [];
        if (!mWinsAC.length && !hWinsAC.length) return;

        // V5: build per-90d-window rets from multiwindow data (BP most + TL on W5)
        const v5WinsAC = wins.map((w,i) => {
          const isW5 = i === 4;
          const k = isW5 ? 'teelek' : 'bestpos';
          const tf = isW5 ? _canon.teelek : _canon.bestpos;
          return { ret: +((((w[k]||{})[tf]||{}).ret) || 0).toFixed(2),
                   stopped: false, label: 'W'+(i+1) };
        });
        const _buildEq = (wArr) => wArr.reduce((eq,w)=>{ eq.push(+(eq[eq.length-1]*(1+w.ret/100)).toFixed(2)); return eq; }, [100]);

        const approaches = [
          { label:'V5 Custom',  color:'#a3e635', windows: v5WinsAC,  equity: _buildEq(v5WinsAC),
            cumulative: _v5s.cumul, wins: _v5s.wins, total: _v5s.total, stops: 0 },
          { label:'📅 Monthly', color:'#f59e0b', windows: mWinsAC,   equity: _buildEq(mWinsAC),
            cumulative: (BT.MONTHLY_RESULTS.summary||{}).cumulative_pct||0,
            wins: (BT.MONTHLY_RESULTS.summary||{}).wins, total: (BT.MONTHLY_RESULTS.summary||{}).total,
            stops: (BT.MONTHLY_RESULTS.summary||{}).stops },
          { label:'⚡ Hybrid',  color:'#e879f9', windows: hWinsAC,   equity: _buildEq(hWinsAC),
            cumulative: (BT.HYBRID_RESULTS.summary||{}).cumulative_pct||0,
            wins: (BT.HYBRID_RESULTS.summary||{}).wins, total: (BT.HYBRID_RESULTS.summary||{}).total,
            stops: (BT.HYBRID_RESULTS.summary||{}).stops },
        ];
        const AC = { v5: approaches[0], monthly: approaches[1], hybrid: approaches[2] };
        const gc = 'rgba(255,255,255,';

        // ── Chart 1: Cumulative Equity Lines ──────────────────────────
        (function() {
          const canvas = document.getElementById('appr-equity-chart');
          if (!canvas || !canvas.getContext) return;
          const dpr = window.devicePixelRatio || 1;
          const cssW = Math.max(200, (canvas.parentElement ? canvas.parentElement.clientWidth - 32 : 700));
          const cssH = 210;
          canvas.width = cssW * dpr; canvas.height = cssH * dpr;
          canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
          const ctx = canvas.getContext('2d');
          ctx.scale(dpr, dpr);
          const W = cssW, H = cssH;
          const pad = {top:22, right:66, bottom:28, left:46};
          const cW = W - pad.left - pad.right;
          const cH = H - pad.top - pad.bottom;
          // Y range
          let minY = Infinity, maxY = -Infinity;
          approaches.forEach(a => a.equity.forEach(v => { if(v<minY)minY=v; if(v>maxY)maxY=v; }));
          const yRange = maxY - minY || 1;
          minY -= yRange * 0.06; maxY += yRange * 0.06;
          const toX = f => pad.left + f * cW;
          const toY = v => pad.top + (1 - (v - minY) / (maxY - minY)) * cH;
          // Grid
          const yStep = (maxY - minY) / 4;
          for (let i = 0; i <= 4; i++) {
            const v = minY + i * yStep;
            const y = toY(v);
            ctx.beginPath(); ctx.strokeStyle = gc+'0.06)'; ctx.lineWidth = 0.5;
            ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cW, y); ctx.stroke();
            ctx.fillStyle = gc+'0.38)'; ctx.font = '9px system-ui,sans-serif'; ctx.textAlign = 'right';
            ctx.fillText(v.toFixed(0), pad.left - 4, y + 3.5);
          }
          // Baseline 100
          const y100 = toY(100);
          ctx.beginPath(); ctx.strokeStyle = gc+'0.18)'; ctx.lineWidth = 0.8; ctx.setLineDash([4,3]);
          ctx.moveTo(pad.left, y100); ctx.lineTo(pad.left + cW, y100); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = gc+'0.30)'; ctx.font = '8px system-ui,sans-serif'; ctx.textAlign = 'right';
          ctx.fillText('100', pad.left - 4, y100 + 3.5);
          // Draw each equity curve
          const labelOffsets = [0, 10, -10];
          approaches.forEach((a, ai) => {
            const pts = a.equity;
            const n = pts.length - 1;
            ctx.beginPath(); ctx.strokeStyle = a.color; ctx.lineWidth = ai === 0 ? 2.2 : 1.6;
            if (ai !== 0) ctx.setLineDash(ai === 1 ? [6,3] : [3,3]);
            pts.forEach((v, i) => { const x = toX(i/n), y = toY(v); i ? ctx.lineTo(x,y) : ctx.moveTo(x,y); });
            ctx.stroke(); ctx.setLineDash([]);
            // End label
            const last = pts[pts.length - 1];
            const ey = Math.max(pad.top + 6, Math.min(pad.top + cH - 6, toY(last) + labelOffsets[ai]));
            ctx.fillStyle = a.color; ctx.font = 'bold 9px system-ui,sans-serif'; ctx.textAlign = 'left';
            ctx.fillText((last >= 100 ? '+' : '') + (last - 100).toFixed(1) + '%', pad.left + cW + 4, ey + 3.5);
          });
          // Window markers (V5 windows on X axis)
          const v5eq = AC.v5.equity;
          ctx.fillStyle = gc+'0.30)'; ctx.font = '8px system-ui,sans-serif'; ctx.textAlign = 'center';
          v5eq.forEach((_, i) => {
            const x = toX(i / (v5eq.length - 1));
            if (i > 0) {
              ctx.beginPath(); ctx.strokeStyle = gc+'0.08)'; ctx.lineWidth = 0.5;
              ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + cH); ctx.stroke();
            }
            ctx.fillText(i === 0 ? 'Start' : 'W'+i, x, pad.top + cH + 14);
          });
          // Legend
          approaches.forEach((a, ai) => {
            const legendX = pad.left + ai * (cW / 3);
            ctx.fillStyle = a.color; ctx.font = '9px system-ui,sans-serif'; ctx.textAlign = 'left';
            ctx.fillRect(legendX, pad.top - 14, 18, 3);
            ctx.fillText(a.label, legendX + 22, pad.top - 10);
          });
        
  // ══════════════════════════════════════════════════════════════════
  // GRID SEARCH V2 VIEW
  // ══════════════════════════════════════════════════════════════════
  function renderGridV2() {
    clearCharts();
    const G = window.GRID_V2;
    if (!G) {
      $("#main").innerHTML = "<p style='color:var(--tx-3);padding:24px'>grid_v2_data.js not loaded</p>";
      return;
    }
    const ins = G.insights;

    // Colour helpers
    function clr(v) { return v > 0 ? "var(--pos)" : v < 0 ? "var(--neg)" : "var(--tx)"; }
    function pctBar(pct, color) {
      return `<div style="flex:1;height:5px;border-radius:3px;background:var(--bg-2);border:1px solid var(--line);overflow:hidden;max-width:90px">
        <span style="display:block;height:100%;width:${Math.min(pct,100)}%;background:${color};border-radius:3px"></span></div>`;
    }

    // ── Insight cards ──────────────────────────────────────────────
    const insightHTML = `
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:var(--gap);margin-bottom:var(--gap)">
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,var(--pos),transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">Total Epochs</div>
    <div style="font-family:var(--mono);font-size:32px;font-weight:600;color:var(--tx);margin-top:4px">${G.total_epochs.toLocaleString()}</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">${G.valid_epochs.toLocaleString()} valid (${G.pct_valid}%)</div>
  </div>
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,var(--pos),transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">Best Asset Combo</div>
    <div style="font-family:var(--mono);font-size:18px;font-weight:600;color:var(--pos);margin-top:6px">${ins.best_combo}</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">med OOS <b style="color:var(--pos)">+${ins.best_combo_med}%</b> (${ins.best_combo_pct}% pos)</div>
  </div>
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,#38bdf8,transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">Best TL Timeframe</div>
    <div style="font-family:var(--mono);font-size:28px;font-weight:600;color:#38bdf8;margin-top:4px">TL-${ins.best_tf}</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">med OOS <b style="color:#38bdf8">+${ins.best_tf_med}%</b> (${ins.best_tf_pct}% pos)</div>
  </div>
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,var(--warn),transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">TradFi Premium</div>
    <div style="font-family:var(--mono);font-size:28px;font-weight:600;color:var(--warn);margin-top:4px">${ins.tradfi_premium > 0 ? "+" : ""}${ins.tradfi_premium}%</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">TradFi <b style="color:var(--pos)">${ins.med_tradfi > 0 ? "+" : ""}${ins.med_tradfi}%</b> vs Crypto <b style="color:${ins.med_crypto > 0 ? "var(--pos)" : "var(--neg)"}">${ins.med_crypto > 0 ? "+" : ""}${ins.med_crypto}%</b></div>
  </div>
</div>`;

    // ── Asset combo table ──────────────────────────────────────────
    const comboRows = G.by_combo.map(r => {
      const pct = r.pct_pos;
      const barClr = pct >= 60 ? "var(--pos)" : pct >= 40 ? "var(--warn)" : "var(--neg)";
      const medClr = r.med_oos > 0 ? "var(--pos)" : r.med_oos < -5 ? "var(--neg)" : "var(--tx-2)";
      return `<tr>
        <td style="font-family:var(--mono);font-size:12.5px;padding:10px 14px;border-bottom:1px solid var(--line)">${r.assets}</td>
        <td style="padding:10px 14px;border-bottom:1px solid var(--line)">
          <div style="display:flex;align-items:center;gap:8px">
            ${pctBar(pct, barClr)}
            <span style="font-family:var(--mono);font-size:12.5px;color:${barClr};white-space:nowrap">${pct}%</span>
          </div>
        </td>
        <td style="font-family:var(--mono);font-size:13px;color:${medClr};padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_oos > 0 ? "+" : ""}${r.med_oos}%</td>
        <td style="font-family:var(--mono);font-size:13px;color:var(--pos);padding:10px 14px;border-bottom:1px solid var(--line)">+${r.best_oos}%</td>
        <td style="font-family:var(--mono);font-size:12.5px;color:var(--tx-2);padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_shp.toFixed(2)}</td>
      </tr>`;
    }).join("");

    // ── TF table ───────────────────────────────────────────────────
    const tfRows = G.by_tf.map(r => {
      const pct = r.pct_pos;
      const barClr = pct >= 70 ? "var(--pos)" : pct >= 40 ? "var(--warn)" : "var(--neg)";
      const medClr = r.med_oos > 0 ? "var(--pos)" : r.med_oos < -5 ? "var(--neg)" : "var(--tx-2)";
      return `<tr>
        <td style="font-family:var(--mono);font-size:13px;font-weight:600;padding:10px 14px;border-bottom:1px solid var(--line);color:${r.tf === "1d" ? "var(--pos)" : "var(--tx)"}">TL-${r.tf}${r.tf === "1d" ? " ★" : ""}</td>
        <td style="padding:10px 14px;border-bottom:1px solid var(--line)">
          <div style="display:flex;align-items:center;gap:8px">
            ${pctBar(pct, barClr)}
            <span style="font-family:var(--mono);font-size:12.5px;color:${barClr};white-space:nowrap">${pct}%</span>
          </div>
        </td>
        <td style="font-family:var(--mono);font-size:13px;color:${medClr};padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_oos > 0 ? "+" : ""}${r.med_oos}%</td>
        <td style="font-family:var(--mono);font-size:12.5px;color:var(--tx-2);padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_shp.toFixed(3)}</td>
      </tr>`;
    }).join("");

    // ── Top 10 configs ─────────────────────────────────────────────
    const top10Rows = G.top10.map((r, i) => {
      const oosClr = r.oos_cum > 50 ? "var(--pos)" : r.oos_cum > 0 ? "var(--pos)" : "var(--neg)";
      const isClr  = r.is_cum  > 0  ? "var(--tx)" : "var(--tx-3)";
      return `<tr>
        <td style="font-family:var(--mono);font-size:11px;color:var(--tx-3);padding:9px 14px;border-bottom:1px solid var(--line)">${i+1}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line)">${r.assets}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:#38bdf8">${r.tl_tf}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:${isClr}">${r.is_cum > 0 ? "+" : ""}${r.is_cum}%</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:${oosClr};font-weight:600">${r.oos_cum > 0 ? "+" : ""}${r.oos_cum}%</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:var(--pos)">${r.oos_sharpe.toFixed(3)}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:var(--tx-2)">${r.oos_wins}/${r.n_oos}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:var(--neg)">${r.oos_worst}%</td>
      </tr>`;
    }).join("");

    $("#main").innerHTML = `
${insightHTML}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--gap)">
  <!-- Asset Combo table -->
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
    <div style="padding:14px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px">
      <span style="font-size:16px">📊</span>
      <div>
        <div style="font-size:14px;font-weight:600">Median OOS by Asset Combo</div>
        <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono)">จาก ${G.total_epochs.toLocaleString()} epoch — sorted by med OOS</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:var(--bg-2)">
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Assets</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">% Positive</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med OOS</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Best OOS</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med Shp</th>
        </tr>
      </thead>
      <tbody>${comboRows}</tbody>
    </table>
  </div>

  <!-- Right column: TF + Top configs -->
  <div style="display:flex;flex-direction:column;gap:var(--gap)">
    <!-- TF table -->
    <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
      <div style="padding:14px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px">
        <span style="font-size:16px">⏱️</span>
        <div>
          <div style="font-size:14px;font-weight:600">Median OOS by TL Timeframe</div>
          <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono)">TL ใช้ในเดือน BEAR เท่านั้น</div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:var(--bg-2)">
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">TF</th>
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">% Positive</th>
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med OOS</th>
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med Shp</th>
          </tr>
        </thead>
        <tbody>${tfRows}</tbody>
      </table>
    </div>

    <!-- Insight note -->
    <div style="background:color-mix(in oklch,var(--pos) 7%,var(--panel));border:1px solid color-mix(in oklch,var(--pos) 22%,transparent);border-radius:var(--r);padding:14px 16px;font-size:12.5px;line-height:1.6;color:var(--tx-2)">
      <div style="font-weight:600;color:var(--tx);margin-bottom:6px">🔎 Key Findings</div>
      <div>• <b style="color:var(--pos)">TL-1d</b> ครองอันดับ 1 ด้วย 98% positive, median OOS <b style="color:var(--pos)">+${ins.best_tf_med}%</b></div>
      <div style="margin-top:4px">• <b style="color:var(--pos)">${ins.best_combo}</b> คือ combo ที่ดีที่สุด จาก 13 combos ทั้งหมด</div>
      <div style="margin-top:4px">• เพิ่ม SPY/GLD ช่วยให้ median OOS <b style="color:var(--warn)">+${ins.tradfi_premium}%</b> เทียบกับ pure crypto</div>
      <div style="margin-top:4px">• TL-1h/2h ควรหลีกเลี่ยง — median OOS ติดลบหนัก</div>
    </div>
  </div>
</div>

<!-- Top 10 configs -->
<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
  <div style="padding:14px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px">
    <span style="font-size:16px">🏆</span>
    <div>
      <div style="font-size:14px;font-weight:600">Top 10 Configurations (Deduplicated by Assets × TF)</div>
      <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono)">Score = OOS×0.5 + Sharpe×0.3 + Overfit×0.2 — จาก 15,600 epochs</div>
    </div>
  </div>
  <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12.5px;white-space:nowrap">
      <thead>
        <tr style="background:var(--bg-2)">
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11px;color:var(--tx-3)">#</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Assets</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">TL TF</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">IS Cum</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--pos)">OOS Cum</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">OOS Sharpe</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">OOS Wins</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--neg)">Worst Month</th>
        </tr>
      </thead>
      <tbody>${top10Rows}</tbody>
    </table>
  </div>
</div>`;
  }


})();

        // ── Chart 2: Per-Window Returns · V5 vs Hybrid ────────────────
        (function() {
          const canvas = document.getElementById('appr-bar-chart');
          if (!canvas || !canvas.getContext) return;
          const dpr = window.devicePixelRatio || 1;
          const cssW = Math.max(200, (canvas.parentElement ? canvas.parentElement.clientWidth - 32 : 700));
          const cssH = 150;
          canvas.width = cssW * dpr; canvas.height = cssH * dpr;
          canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
          const ctx = canvas.getContext('2d');
          ctx.scale(dpr, dpr);
          const W = cssW, H = cssH;
          const pad = {top:18, right:20, bottom:26, left:46};
          const cW = W - pad.left - pad.right;
          const cH = H - pad.top - pad.bottom;
          const series = [AC.v5, AC.hybrid];
          const n = AC.v5.windows.length;
          const allRets = series.flatMap(a => a.windows.map(w => w.ret));
          let minR = Math.min(...allRets), maxR = Math.max(...allRets);
          const rRange = maxR - minR || 1;
          minR -= rRange * 0.08; maxR += rRange * 0.12;
          const toY = v => pad.top + (1 - (v - minR) / (maxR - minR)) * cH;
          const y0 = Math.min(pad.top + cH, Math.max(pad.top, toY(0)));
          // Zero line
          ctx.beginPath(); ctx.strokeStyle = gc+'0.22)'; ctx.lineWidth = 0.8;
          ctx.moveTo(pad.left, y0); ctx.lineTo(pad.left + cW, y0); ctx.stroke();
          // Y ticks
          ctx.fillStyle = gc+'0.35)'; ctx.font = '9px system-ui,sans-serif'; ctx.textAlign = 'right';
          [Math.ceil(minR/5)*5, 0, Math.floor(maxR/5)*5].filter((v,i,a)=>a.indexOf(v)===i).forEach(v => {
            const y = toY(v);
            ctx.beginPath(); ctx.strokeStyle = gc+'0.06)'; ctx.lineWidth = 0.5;
            ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cW, y); ctx.stroke();
            ctx.fillText((v>=0?'+':'')+v+'%', pad.left - 4, y + 3.5);
          });
          // Bars
          const groupW = cW / n;
          const gap = 2, numSeries = 2;
          const barW = (groupW * 0.7 - gap) / numSeries;
          series.forEach((a, ai) => {
            a.windows.forEach((w, wi) => {
              const x = pad.left + wi * groupW + groupW * 0.15 + ai * (barW + gap);
              const yV = toY(w.ret);
              const bH = Math.abs(yV - y0);
              const col = w.ret >= 0 ? a.color : '#f87171';
              ctx.globalAlpha = w.stopped ? 0.45 : 0.82;
              ctx.fillStyle = col;
              ctx.fillRect(x, Math.min(yV, y0), barW, Math.max(1, bH));
              ctx.globalAlpha = 1;
              // Stop marker
              if (w.stopped) {
                ctx.fillStyle = '#f87171'; ctx.font = 'bold 9px system-ui,sans-serif'; ctx.textAlign = 'center';
                ctx.fillText('✕', x + barW / 2, yV - 4);
              }
              // Value label on top (skip if too close to baseline)
              if (Math.abs(bH) > 14) {
                ctx.fillStyle = w.ret >= 0 ? a.color : '#f87171';
                ctx.font = '7px system-ui,sans-serif'; ctx.textAlign = 'center';
                const labelY = w.ret >= 0 ? Math.min(yV, y0) - 3 : Math.max(yV, y0) + 9;
                ctx.fillText((w.ret >= 0 ? '+' : '') + w.ret.toFixed(1) + '%', x + barW / 2, labelY);
              }
            });
          });
          // X labels
          ctx.fillStyle = gc+'0.35)'; ctx.font = '8px system-ui,sans-serif'; ctx.textAlign = 'center';
          AC.v5.windows.forEach((w, wi) => {
            const x = pad.left + wi * groupW + groupW * 0.5;
            ctx.fillText('W' + (wi + 1), x, H - 9);
          });
          // Legend
          series.forEach((a, ai) => {
            const lx = pad.left + ai * 110;
            ctx.fillStyle = a.color;
            ctx.fillRect(lx, pad.top - 10, 14, 3);
            ctx.font = '8px system-ui,sans-serif'; ctx.textAlign = 'left';
            ctx.fillText(a.label, lx + 18, pad.top - 6);
          });
        
  // ══════════════════════════════════════════════════════════════════
  // GRID SEARCH V2 VIEW
  // ══════════════════════════════════════════════════════════════════
  function renderGridV2() {
    clearCharts();
    const G = window.GRID_V2;
    if (!G) {
      $("#main").innerHTML = "<p style='color:var(--tx-3);padding:24px'>grid_v2_data.js not loaded</p>";
      return;
    }
    const ins = G.insights;

    // Colour helpers
    function clr(v) { return v > 0 ? "var(--pos)" : v < 0 ? "var(--neg)" : "var(--tx)"; }
    function pctBar(pct, color) {
      return `<div style="flex:1;height:5px;border-radius:3px;background:var(--bg-2);border:1px solid var(--line);overflow:hidden;max-width:90px">
        <span style="display:block;height:100%;width:${Math.min(pct,100)}%;background:${color};border-radius:3px"></span></div>`;
    }

    // ── Insight cards ──────────────────────────────────────────────
    const insightHTML = `
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:var(--gap);margin-bottom:var(--gap)">
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,var(--pos),transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">Total Epochs</div>
    <div style="font-family:var(--mono);font-size:32px;font-weight:600;color:var(--tx);margin-top:4px">${G.total_epochs.toLocaleString()}</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">${G.valid_epochs.toLocaleString()} valid (${G.pct_valid}%)</div>
  </div>
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,var(--pos),transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">Best Asset Combo</div>
    <div style="font-family:var(--mono);font-size:18px;font-weight:600;color:var(--pos);margin-top:6px">${ins.best_combo}</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">med OOS <b style="color:var(--pos)">+${ins.best_combo_med}%</b> (${ins.best_combo_pct}% pos)</div>
  </div>
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,#38bdf8,transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">Best TL Timeframe</div>
    <div style="font-family:var(--mono);font-size:28px;font-weight:600;color:#38bdf8;margin-top:4px">TL-${ins.best_tf}</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">med OOS <b style="color:#38bdf8">+${ins.best_tf_med}%</b> (${ins.best_tf_pct}% pos)</div>
  </div>
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,var(--warn),transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">TradFi Premium</div>
    <div style="font-family:var(--mono);font-size:28px;font-weight:600;color:var(--warn);margin-top:4px">${ins.tradfi_premium > 0 ? "+" : ""}${ins.tradfi_premium}%</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">TradFi <b style="color:var(--pos)">${ins.med_tradfi > 0 ? "+" : ""}${ins.med_tradfi}%</b> vs Crypto <b style="color:${ins.med_crypto > 0 ? "var(--pos)" : "var(--neg)"}">${ins.med_crypto > 0 ? "+" : ""}${ins.med_crypto}%</b></div>
  </div>
</div>`;

    // ── Asset combo table ──────────────────────────────────────────
    const comboRows = G.by_combo.map(r => {
      const pct = r.pct_pos;
      const barClr = pct >= 60 ? "var(--pos)" : pct >= 40 ? "var(--warn)" : "var(--neg)";
      const medClr = r.med_oos > 0 ? "var(--pos)" : r.med_oos < -5 ? "var(--neg)" : "var(--tx-2)";
      return `<tr>
        <td style="font-family:var(--mono);font-size:12.5px;padding:10px 14px;border-bottom:1px solid var(--line)">${r.assets}</td>
        <td style="padding:10px 14px;border-bottom:1px solid var(--line)">
          <div style="display:flex;align-items:center;gap:8px">
            ${pctBar(pct, barClr)}
            <span style="font-family:var(--mono);font-size:12.5px;color:${barClr};white-space:nowrap">${pct}%</span>
          </div>
        </td>
        <td style="font-family:var(--mono);font-size:13px;color:${medClr};padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_oos > 0 ? "+" : ""}${r.med_oos}%</td>
        <td style="font-family:var(--mono);font-size:13px;color:var(--pos);padding:10px 14px;border-bottom:1px solid var(--line)">+${r.best_oos}%</td>
        <td style="font-family:var(--mono);font-size:12.5px;color:var(--tx-2);padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_shp.toFixed(2)}</td>
      </tr>`;
    }).join("");

    // ── TF table ───────────────────────────────────────────────────
    const tfRows = G.by_tf.map(r => {
      const pct = r.pct_pos;
      const barClr = pct >= 70 ? "var(--pos)" : pct >= 40 ? "var(--warn)" : "var(--neg)";
      const medClr = r.med_oos > 0 ? "var(--pos)" : r.med_oos < -5 ? "var(--neg)" : "var(--tx-2)";
      return `<tr>
        <td style="font-family:var(--mono);font-size:13px;font-weight:600;padding:10px 14px;border-bottom:1px solid var(--line);color:${r.tf === "1d" ? "var(--pos)" : "var(--tx)"}">TL-${r.tf}${r.tf === "1d" ? " ★" : ""}</td>
        <td style="padding:10px 14px;border-bottom:1px solid var(--line)">
          <div style="display:flex;align-items:center;gap:8px">
            ${pctBar(pct, barClr)}
            <span style="font-family:var(--mono);font-size:12.5px;color:${barClr};white-space:nowrap">${pct}%</span>
          </div>
        </td>
        <td style="font-family:var(--mono);font-size:13px;color:${medClr};padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_oos > 0 ? "+" : ""}${r.med_oos}%</td>
        <td style="font-family:var(--mono);font-size:12.5px;color:var(--tx-2);padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_shp.toFixed(3)}</td>
      </tr>`;
    }).join("");

    // ── Top 10 configs ─────────────────────────────────────────────
    const top10Rows = G.top10.map((r, i) => {
      const oosClr = r.oos_cum > 50 ? "var(--pos)" : r.oos_cum > 0 ? "var(--pos)" : "var(--neg)";
      const isClr  = r.is_cum  > 0  ? "var(--tx)" : "var(--tx-3)";
      return `<tr>
        <td style="font-family:var(--mono);font-size:11px;color:var(--tx-3);padding:9px 14px;border-bottom:1px solid var(--line)">${i+1}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line)">${r.assets}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:#38bdf8">${r.tl_tf}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:${isClr}">${r.is_cum > 0 ? "+" : ""}${r.is_cum}%</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:${oosClr};font-weight:600">${r.oos_cum > 0 ? "+" : ""}${r.oos_cum}%</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:var(--pos)">${r.oos_sharpe.toFixed(3)}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:var(--tx-2)">${r.oos_wins}/${r.n_oos}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:var(--neg)">${r.oos_worst}%</td>
      </tr>`;
    }).join("");

    $("#main").innerHTML = `
${insightHTML}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--gap)">
  <!-- Asset Combo table -->
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
    <div style="padding:14px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px">
      <span style="font-size:16px">📊</span>
      <div>
        <div style="font-size:14px;font-weight:600">Median OOS by Asset Combo</div>
        <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono)">จาก ${G.total_epochs.toLocaleString()} epoch — sorted by med OOS</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:var(--bg-2)">
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Assets</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">% Positive</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med OOS</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Best OOS</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med Shp</th>
        </tr>
      </thead>
      <tbody>${comboRows}</tbody>
    </table>
  </div>

  <!-- Right column: TF + Top configs -->
  <div style="display:flex;flex-direction:column;gap:var(--gap)">
    <!-- TF table -->
    <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
      <div style="padding:14px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px">
        <span style="font-size:16px">⏱️</span>
        <div>
          <div style="font-size:14px;font-weight:600">Median OOS by TL Timeframe</div>
          <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono)">TL ใช้ในเดือน BEAR เท่านั้น</div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:var(--bg-2)">
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">TF</th>
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">% Positive</th>
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med OOS</th>
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med Shp</th>
          </tr>
        </thead>
        <tbody>${tfRows}</tbody>
      </table>
    </div>

    <!-- Insight note -->
    <div style="background:color-mix(in oklch,var(--pos) 7%,var(--panel));border:1px solid color-mix(in oklch,var(--pos) 22%,transparent);border-radius:var(--r);padding:14px 16px;font-size:12.5px;line-height:1.6;color:var(--tx-2)">
      <div style="font-weight:600;color:var(--tx);margin-bottom:6px">🔎 Key Findings</div>
      <div>• <b style="color:var(--pos)">TL-1d</b> ครองอันดับ 1 ด้วย 98% positive, median OOS <b style="color:var(--pos)">+${ins.best_tf_med}%</b></div>
      <div style="margin-top:4px">• <b style="color:var(--pos)">${ins.best_combo}</b> คือ combo ที่ดีที่สุด จาก 13 combos ทั้งหมด</div>
      <div style="margin-top:4px">• เพิ่ม SPY/GLD ช่วยให้ median OOS <b style="color:var(--warn)">+${ins.tradfi_premium}%</b> เทียบกับ pure crypto</div>
      <div style="margin-top:4px">• TL-1h/2h ควรหลีกเลี่ยง — median OOS ติดลบหนัก</div>
    </div>
  </div>
</div>

<!-- Top 10 configs -->
<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
  <div style="padding:14px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px">
    <span style="font-size:16px">🏆</span>
    <div>
      <div style="font-size:14px;font-weight:600">Top 10 Configurations (Deduplicated by Assets × TF)</div>
      <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono)">Score = OOS×0.5 + Sharpe×0.3 + Overfit×0.2 — จาก 15,600 epochs</div>
    </div>
  </div>
  <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12.5px;white-space:nowrap">
      <thead>
        <tr style="background:var(--bg-2)">
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11px;color:var(--tx-3)">#</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Assets</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">TL TF</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">IS Cum</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--pos)">OOS Cum</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">OOS Sharpe</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">OOS Wins</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--neg)">Worst Month</th>
        </tr>
      </thead>
      <tbody>${top10Rows}</tbody>
    </table>
  </div>
</div>`;
  }


})();

      
  // ══════════════════════════════════════════════════════════════════
  // GRID SEARCH V2 VIEW
  // ══════════════════════════════════════════════════════════════════
  function renderGridV2() {
    clearCharts();
    const G = window.GRID_V2;
    if (!G) {
      $("#main").innerHTML = "<p style='color:var(--tx-3);padding:24px'>grid_v2_data.js not loaded</p>";
      return;
    }
    const ins = G.insights;

    // Colour helpers
    function clr(v) { return v > 0 ? "var(--pos)" : v < 0 ? "var(--neg)" : "var(--tx)"; }
    function pctBar(pct, color) {
      return `<div style="flex:1;height:5px;border-radius:3px;background:var(--bg-2);border:1px solid var(--line);overflow:hidden;max-width:90px">
        <span style="display:block;height:100%;width:${Math.min(pct,100)}%;background:${color};border-radius:3px"></span></div>`;
    }

    // ── Insight cards ──────────────────────────────────────────────
    const insightHTML = `
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:var(--gap);margin-bottom:var(--gap)">
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,var(--pos),transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">Total Epochs</div>
    <div style="font-family:var(--mono);font-size:32px;font-weight:600;color:var(--tx);margin-top:4px">${G.total_epochs.toLocaleString()}</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">${G.valid_epochs.toLocaleString()} valid (${G.pct_valid}%)</div>
  </div>
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,var(--pos),transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">Best Asset Combo</div>
    <div style="font-family:var(--mono);font-size:18px;font-weight:600;color:var(--pos);margin-top:6px">${ins.best_combo}</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">med OOS <b style="color:var(--pos)">+${ins.best_combo_med}%</b> (${ins.best_combo_pct}% pos)</div>
  </div>
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,#38bdf8,transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">Best TL Timeframe</div>
    <div style="font-family:var(--mono);font-size:28px;font-weight:600;color:#38bdf8;margin-top:4px">TL-${ins.best_tf}</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">med OOS <b style="color:#38bdf8">+${ins.best_tf_med}%</b> (${ins.best_tf_pct}% pos)</div>
  </div>
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,var(--warn),transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">TradFi Premium</div>
    <div style="font-family:var(--mono);font-size:28px;font-weight:600;color:var(--warn);margin-top:4px">${ins.tradfi_premium > 0 ? "+" : ""}${ins.tradfi_premium}%</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">TradFi <b style="color:var(--pos)">${ins.med_tradfi > 0 ? "+" : ""}${ins.med_tradfi}%</b> vs Crypto <b style="color:${ins.med_crypto > 0 ? "var(--pos)" : "var(--neg)"}">${ins.med_crypto > 0 ? "+" : ""}${ins.med_crypto}%</b></div>
  </div>
</div>`;

    // ── Asset combo table ──────────────────────────────────────────
    const comboRows = G.by_combo.map(r => {
      const pct = r.pct_pos;
      const barClr = pct >= 60 ? "var(--pos)" : pct >= 40 ? "var(--warn)" : "var(--neg)";
      const medClr = r.med_oos > 0 ? "var(--pos)" : r.med_oos < -5 ? "var(--neg)" : "var(--tx-2)";
      return `<tr>
        <td style="font-family:var(--mono);font-size:12.5px;padding:10px 14px;border-bottom:1px solid var(--line)">${r.assets}</td>
        <td style="padding:10px 14px;border-bottom:1px solid var(--line)">
          <div style="display:flex;align-items:center;gap:8px">
            ${pctBar(pct, barClr)}
            <span style="font-family:var(--mono);font-size:12.5px;color:${barClr};white-space:nowrap">${pct}%</span>
          </div>
        </td>
        <td style="font-family:var(--mono);font-size:13px;color:${medClr};padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_oos > 0 ? "+" : ""}${r.med_oos}%</td>
        <td style="font-family:var(--mono);font-size:13px;color:var(--pos);padding:10px 14px;border-bottom:1px solid var(--line)">+${r.best_oos}%</td>
        <td style="font-family:var(--mono);font-size:12.5px;color:var(--tx-2);padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_shp.toFixed(2)}</td>
      </tr>`;
    }).join("");

    // ── TF table ───────────────────────────────────────────────────
    const tfRows = G.by_tf.map(r => {
      const pct = r.pct_pos;
      const barClr = pct >= 70 ? "var(--pos)" : pct >= 40 ? "var(--warn)" : "var(--neg)";
      const medClr = r.med_oos > 0 ? "var(--pos)" : r.med_oos < -5 ? "var(--neg)" : "var(--tx-2)";
      return `<tr>
        <td style="font-family:var(--mono);font-size:13px;font-weight:600;padding:10px 14px;border-bottom:1px solid var(--line);color:${r.tf === "1d" ? "var(--pos)" : "var(--tx)"}">TL-${r.tf}${r.tf === "1d" ? " ★" : ""}</td>
        <td style="padding:10px 14px;border-bottom:1px solid var(--line)">
          <div style="display:flex;align-items:center;gap:8px">
            ${pctBar(pct, barClr)}
            <span style="font-family:var(--mono);font-size:12.5px;color:${barClr};white-space:nowrap">${pct}%</span>
          </div>
        </td>
        <td style="font-family:var(--mono);font-size:13px;color:${medClr};padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_oos > 0 ? "+" : ""}${r.med_oos}%</td>
        <td style="font-family:var(--mono);font-size:12.5px;color:var(--tx-2);padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_shp.toFixed(3)}</td>
      </tr>`;
    }).join("");

    // ── Top 10 configs ─────────────────────────────────────────────
    const top10Rows = G.top10.map((r, i) => {
      const oosClr = r.oos_cum > 50 ? "var(--pos)" : r.oos_cum > 0 ? "var(--pos)" : "var(--neg)";
      const isClr  = r.is_cum  > 0  ? "var(--tx)" : "var(--tx-3)";
      return `<tr>
        <td style="font-family:var(--mono);font-size:11px;color:var(--tx-3);padding:9px 14px;border-bottom:1px solid var(--line)">${i+1}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line)">${r.assets}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:#38bdf8">${r.tl_tf}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:${isClr}">${r.is_cum > 0 ? "+" : ""}${r.is_cum}%</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:${oosClr};font-weight:600">${r.oos_cum > 0 ? "+" : ""}${r.oos_cum}%</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:var(--pos)">${r.oos_sharpe.toFixed(3)}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:var(--tx-2)">${r.oos_wins}/${r.n_oos}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:var(--neg)">${r.oos_worst}%</td>
      </tr>`;
    }).join("");

    $("#main").innerHTML = `
${insightHTML}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--gap)">
  <!-- Asset Combo table -->
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
    <div style="padding:14px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px">
      <span style="font-size:16px">📊</span>
      <div>
        <div style="font-size:14px;font-weight:600">Median OOS by Asset Combo</div>
        <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono)">จาก ${G.total_epochs.toLocaleString()} epoch — sorted by med OOS</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:var(--bg-2)">
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Assets</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">% Positive</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med OOS</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Best OOS</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med Shp</th>
        </tr>
      </thead>
      <tbody>${comboRows}</tbody>
    </table>
  </div>

  <!-- Right column: TF + Top configs -->
  <div style="display:flex;flex-direction:column;gap:var(--gap)">
    <!-- TF table -->
    <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
      <div style="padding:14px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px">
        <span style="font-size:16px">⏱️</span>
        <div>
          <div style="font-size:14px;font-weight:600">Median OOS by TL Timeframe</div>
          <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono)">TL ใช้ในเดือน BEAR เท่านั้น</div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:var(--bg-2)">
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">TF</th>
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">% Positive</th>
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med OOS</th>
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med Shp</th>
          </tr>
        </thead>
        <tbody>${tfRows}</tbody>
      </table>
    </div>

    <!-- Insight note -->
    <div style="background:color-mix(in oklch,var(--pos) 7%,var(--panel));border:1px solid color-mix(in oklch,var(--pos) 22%,transparent);border-radius:var(--r);padding:14px 16px;font-size:12.5px;line-height:1.6;color:var(--tx-2)">
      <div style="font-weight:600;color:var(--tx);margin-bottom:6px">🔎 Key Findings</div>
      <div>• <b style="color:var(--pos)">TL-1d</b> ครองอันดับ 1 ด้วย 98% positive, median OOS <b style="color:var(--pos)">+${ins.best_tf_med}%</b></div>
      <div style="margin-top:4px">• <b style="color:var(--pos)">${ins.best_combo}</b> คือ combo ที่ดีที่สุด จาก 13 combos ทั้งหมด</div>
      <div style="margin-top:4px">• เพิ่ม SPY/GLD ช่วยให้ median OOS <b style="color:var(--warn)">+${ins.tradfi_premium}%</b> เทียบกับ pure crypto</div>
      <div style="margin-top:4px">• TL-1h/2h ควรหลีกเลี่ยง — median OOS ติดลบหนัก</div>
    </div>
  </div>
</div>

<!-- Top 10 configs -->
<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
  <div style="padding:14px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px">
    <span style="font-size:16px">🏆</span>
    <div>
      <div style="font-size:14px;font-weight:600">Top 10 Configurations (Deduplicated by Assets × TF)</div>
      <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono)">Score = OOS×0.5 + Sharpe×0.3 + Overfit×0.2 — จาก 15,600 epochs</div>
    </div>
  </div>
  <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12.5px;white-space:nowrap">
      <thead>
        <tr style="background:var(--bg-2)">
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11px;color:var(--tx-3)">#</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Assets</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">TL TF</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">IS Cum</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--pos)">OOS Cum</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">OOS Sharpe</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">OOS Wins</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--neg)">Worst Month</th>
        </tr>
      </thead>
      <tbody>${top10Rows}</tbody>
    </table>
  </div>
</div>`;
  }


})(); // end approach comparison charts

    }, 0);

    // ── Consistency bars ──
    // ── helper: one consistency row ──
    function _cRow(label, color, winsN, totalN, avgRet, sub) {
      const pct    = totalN ? winsN / totalN : 0;
      const barW   = Math.round(pct * 100);
      const barCol = pct >= 0.7 ? "#34d399" : pct >= 0.4 ? "#fbbf24" : "#f87171";
      const subHtml = sub ? `<span style="opacity:.5;font-weight:400;font-size:.8em;margin-left:4px">${sub}</span>` : '';
      return `<tr>
        <td style="color:${color};font-weight:600">${label}${subHtml}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <div style="width:120px;height:10px;background:var(--line);border-radius:5px;overflow:hidden">
              <div style="width:${barW}%;height:100%;background:${barCol};border-radius:5px"></div>
            </div>
            <span style="color:${barCol};font-weight:600">${winsN}/${totalN}</span>
          </div>
        </td>
        <td class="tnum ${avgRet >= 0 ? 'pos' : 'neg'}">${avgRet >= 0 ? '+' : ''}${avgRet.toFixed(1)}%</td>
      </tr>`;
    }

    const consistencyRows = [
      // Strategy canonical-TF rows
      ...STRATS.map(s => {
        const ws   = windows.filter(w => (w[s.key][s.canonical] || {}).ret > 0).length;
        const tot  = windows.filter(w => w[s.key][s.canonical] != null).length;
        const avg  = tot ? (windows.reduce((a, w) => a + ((w[s.key][s.canonical] || {}).ret || 0), 0) / tot) : 0;
        return _cRow(`${s.label} <span style="opacity:.6;font-weight:400">[${s.canonical}]</span>`, s.color, ws, tot, avg);
      }),
      // Monthly row
      (() => {
        const mSum = (BT.MONTHLY_RESULTS || {}).summary || {};
        if (!mSum.total) return '';
        const avg = windows.map((_, wi) => _monthlyRetForWindow(wi) || 0)
                           .reduce((a,v)=>a+v,0) / windows.length;
        return _cRow('📅 Monthly', '#f59e0b', mSum.wins, mSum.total, avg, '18×30d rolling');
      })(),
      // Hybrid row
      (() => {
        const hSum = (BT.HYBRID_RESULTS || {}).summary || {};
        if (!hSum.total) return '';
        const hws = (BT.HYBRID_RESULTS || {}).windows || [];
        const avg = hws.reduce((a, w) => a + w.ret, 0) / hws.length;
        return _cRow('⚡ Hybrid', '#e879f9', hSum.wins, hSum.total, avg, '6×90d regime trigger');
      })(),
    ].join("");

    // ── Fixed params display ──
    const paramRows = STRATS.map(s => {
      const p = fp[s.key] || {};
      const pStr = Object.entries(p).filter(([k]) => k !== "canonical_tf")
        .map(([k, v]) => `${k}=${v}`).join(" · ");
      return `<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:4px">
        <span style="color:${s.color};font-weight:600;min-width:80px">${s.label.replace(/[⚡🔥💎] /,"")}</span>
        <span style="opacity:.7;font-size:.82em">${pStr}</span>
      </div>`;
    }).join("");

    // ── Portfolio 6-window section ────────────────────────────────
    const _portW   = (BT.PORTFOLIO_WINDOWS || {}).windows || [];
    const _portSum = (BT.PORTFOLIO_WINDOWS || {}).summary || {};
    const portSection = _portW.length >= 2 ? (() => {
      const pRows = _portW.map(w => {
        const bpCol  = w.bp     >= 0 ? 'pos' : 'neg';
        const tlCol  = w.tl     >= 0 ? 'pos' : 'neg';
        const pCol   = w.p_5050 >= 0 ? 'pos' : 'neg';
        const btcTrend = w.btc > 15 ? '+' : w.btc < -15 ? '-' : '~';
        const btcCls   = w.btc > 10 ? 'pos' : w.btc < -10 ? 'neg' : '';
        return `<tr>
          <td style="white-space:nowrap;font-size:.85em">${w.win}</td>
          <td class="tnum ${btcCls}">${btcTrend}${w.btc.toFixed(1)}%</td>
          <td class="tnum ${bpCol}" style="color:#22d3ee">${(w.bp>=0?'+':'')+w.bp.toFixed(1)}%</td>
          <td class="tnum ${tlCol}" style="color:#34d399">${(w.tl>=0?'+':'')+w.tl.toFixed(1)}%</td>
          <td class="tnum ${pCol}"  style="font-weight:600">${(w.p_5050>=0?'+':'')+w.p_5050.toFixed(1)}%</td>
        </tr>`;
      }).join('');
      const bp = _portSum.bp     || {};
      const tl = _portSum.tl     || {};
      const p  = _portSum.p_5050 || {};
      const summaryRow = `<tr style="border-top:2px solid var(--line);font-weight:600">
        <td colspan="2" style="opacity:.6">AVG / WINS / WORST</td>
        <td class="tnum" style="color:#22d3ee">${(bp.avg||0)>=0?'+':''}${(bp.avg||0).toFixed(1)}% &nbsp;<span style="opacity:.6;font-weight:400">${bp.wins||0}/${_portW.length} &nbsp;${(bp.worst||0).toFixed(1)}%</span></td>
        <td class="tnum" style="color:#34d399">${(tl.avg||0)>=0?'+':''}${(tl.avg||0).toFixed(1)}% &nbsp;<span style="opacity:.6;font-weight:400">${tl.wins||0}/${_portW.length} &nbsp;${(tl.worst||0).toFixed(1)}%</span></td>
        <td class="tnum" style="color:#a78bfa">${(p.avg||0)>=0?'+':''}${(p.avg||0).toFixed(1)}% &nbsp;<span style="opacity:.6;font-weight:400">${p.wins||0}/${_portW.length} &nbsp;${(p.worst||0).toFixed(1)}%</span></td>
      </tr>`;
      const cards = [
        {label:'💎 BP[15m]',          color:'#22d3ee', s: bp},
        {label:'⚡ TL[4h]',            color:'#34d399', s: tl},
        {label:'📊 Portfolio 50/50',   color:'#a78bfa', s: p},
      ].map(({label, color, s}) => {
        const avgCol   = (s.avg||0)  >= 0   ? '#34d399' : '#f87171';
        const winsCol  = (s.wins||0) >= 4   ? '#34d399' : (s.wins||0) >= 3 ? '#fbbf24' : '#f87171';
        const worstCol = '#f87171';
        return `<div style="background:color-mix(in oklch,${color} 5%,var(--panel));border:1px solid color-mix(in oklch,${color} 25%,var(--line));border-left:3px solid ${color};border-radius:8px;padding:10px 14px;min-width:0;flex:1">
          <div style="color:${color};font-weight:600;font-size:.82em;margin-bottom:6px">${label}</div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:2px;text-align:center">
            <div><div style="font-size:.68em;opacity:.5;margin-bottom:2px;letter-spacing:.03em">AVG RET</div><div style="font-weight:700;color:${avgCol};font-size:.9em">${(s.avg||0)>=0?'+':''}${(s.avg||0).toFixed(1)}%</div></div>
            <div><div style="font-size:.68em;opacity:.5;margin-bottom:2px;letter-spacing:.03em">WIN RATE</div><div style="font-weight:700;color:${winsCol};font-size:.9em">${s.wins||0}/${_portW.length}</div></div>
            <div><div style="font-size:.68em;opacity:.5;margin-bottom:2px;letter-spacing:.03em">WORST</div><div style="font-weight:600;color:${worstCol};font-size:.9em">${(s.worst||0).toFixed(1)}%</div></div>
          </div>
        </div>`;
      }).join('');
      return `<section class="panel">
        <div class="panel-h"><h2>🔀 Portfolio · 6-Window · BP[15m] + TL[4h] Equal-Weight</h2></div>
        <div style="display:flex;gap:12px;padding:12px 16px 16px;flex-wrap:wrap">${cards}</div>
      </section>`;
    })() : '';

    // ── Metric strip data (current 90d window) ─────────────────
    const _tlS  = BT.STRATEGIES.find(s=>s.id==="teelek")  || {};
    const _ultS = BT.STRATEGIES.find(s=>s.id==="ultimate") || {};
    const _bpS  = BT.STRATEGIES.find(s=>s.id==="bestpos")  || {};
    const _stripHTML = [
      { s: _tlS,  label: "⚡ TeeLek",  color: "#34d399" },
      { s: _ultS, label: "🔥 Ultimate", color: "#fb923c" },
      { s: _bpS,  label: "💎 BestPos",  color: "#22d3ee" },
    ].map(({s, label, color}) => {
      const m   = s.metrics || {};
      const ret = m.return_pct ?? 0;
      const dd  = m.max_dd    ?? 0;
      const sc  = s.score     ?? 0;
      const tf  = s.tf        || "—";
      const retStr = (ret >= 0 ? "+" : "") + ret.toFixed(1) + "%";
      const retCol = ret >= 0 ? "#34d399" : "#f87171";
      const ddCol  = dd <= -30 ? "#f87171" : dd <= -15 ? "#fbbf24" : "#94a3b8";
      return `<div style="background:color-mix(in oklch,${color} 5%,var(--panel));border:1px solid color-mix(in oklch,${color} 25%,var(--line));border-left:3px solid ${color};border-radius:8px;padding:10px 14px;min-width:0">
        <div style="color:${color};font-weight:600;font-size:.82em;margin-bottom:6px">${label} <span style="opacity:.55;font-weight:400">[${tf}]</span></div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:2px;text-align:center">
          <div><div style="font-size:.68em;opacity:.5;margin-bottom:2px;letter-spacing:.03em">RETURN</div><div style="font-weight:700;color:${retCol};font-size:.9em">${retStr}</div></div>
          <div><div style="font-size:.68em;opacity:.5;margin-bottom:2px;letter-spacing:.03em">MAX DD</div><div style="font-weight:600;color:${ddCol};font-size:.9em">${dd.toFixed(1)}%</div></div>
          <div><div style="font-size:.68em;opacity:.5;margin-bottom:2px;letter-spacing:.03em">SCORE</div><div style="font-weight:600;font-size:.9em">${sc.toFixed(2)}</div></div>
        </div>
      </div>`;
    }).join("");

    // ── Master summary data ──────────────────────────────────
    function _wst(key,tf){
      const rets=windows.map(w=>((w[key]||{})[tf]||{}).ret).filter(r=>r!=null);
      if(!rets.length)return{};
      let fac=1;rets.forEach(r=>fac*=(1+r/100));
      let eF=1,pk=1,mDD=0;
      windows.forEach(w=>{
        ((w[key]||{}).eq_canon||[]).forEach(p=>{const v=eF*(1+p.v/100);if(v>pk)pk=v;const d=(v/pk-1)*100;if(d<mDD)mDD=d;});
        eF*=(1+(((w[key]||{})[tf]||{}).ret??0)/100);
      });
      const nW=rets.filter(r=>r>0).length,cu=(fac-1)*100;
      return{cumul:+cu.toFixed(1),wins:nW,total:rets.length,worst:+Math.min(...rets).toFixed(1),maxDD:+mDD.toFixed(1),score:mDD<-0.1?+(cu/Math.abs(mDD)).toFixed(2):null};
    }
    let _bFac=1;windows.forEach(w=>_bFac*=(1+w.btc_change_pct/100));
    const _btcCu=+((_bFac-1)*100).toFixed(1);
    const _v5s=(()=>{
      let fac=1,eF=1,pk=1,mDD=0;
      windows.forEach((w,i)=>{
        const isBear=i===4,key2=isBear?'teelek':'bestpos',tf2=isBear?_canon.teelek:_canon.bestpos;
        ((w[key2]||{}).eq_canon||[]).forEach(p=>{const v=eF*(1+p.v/100);if(v>pk)pk=v;const d=(v/pk-1)*100;if(d<mDD)mDD=d;});
        const r=(((w[key2]||{})[tf2]||{}).ret??0);fac*=(1+r/100);eF*=(1+r/100);
      });
      const nW=windows.filter((w,i)=>{const isBear=i===4,key2=isBear?'teelek':'bestpos',tf2=isBear?_canon.teelek:_canon.bestpos;return((((w[key2]||{})[tf2]||{}).ret??0)>0);}).length;
      const cu=(fac-1)*100;
      return{cumul:+cu.toFixed(1),wins:nW,total:windows.length,worst:null,maxDD:+mDD.toFixed(1),score:mDD<-0.1?+(cu/Math.abs(mDD)).toFixed(2):null};
    
  // ══════════════════════════════════════════════════════════════════
  // GRID SEARCH V2 VIEW
  // ══════════════════════════════════════════════════════════════════
  function renderGridV2() {
    clearCharts();
    const G = window.GRID_V2;
    if (!G) {
      $("#main").innerHTML = "<p style='color:var(--tx-3);padding:24px'>grid_v2_data.js not loaded</p>";
      return;
    }
    const ins = G.insights;

    // Colour helpers
    function clr(v) { return v > 0 ? "var(--pos)" : v < 0 ? "var(--neg)" : "var(--tx)"; }
    function pctBar(pct, color) {
      return `<div style="flex:1;height:5px;border-radius:3px;background:var(--bg-2);border:1px solid var(--line);overflow:hidden;max-width:90px">
        <span style="display:block;height:100%;width:${Math.min(pct,100)}%;background:${color};border-radius:3px"></span></div>`;
    }

    // ── Insight cards ──────────────────────────────────────────────
    const insightHTML = `
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:var(--gap);margin-bottom:var(--gap)">
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,var(--pos),transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">Total Epochs</div>
    <div style="font-family:var(--mono);font-size:32px;font-weight:600;color:var(--tx);margin-top:4px">${G.total_epochs.toLocaleString()}</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">${G.valid_epochs.toLocaleString()} valid (${G.pct_valid}%)</div>
  </div>
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,var(--pos),transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">Best Asset Combo</div>
    <div style="font-family:var(--mono);font-size:18px;font-weight:600;color:var(--pos);margin-top:6px">${ins.best_combo}</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">med OOS <b style="color:var(--pos)">+${ins.best_combo_med}%</b> (${ins.best_combo_pct}% pos)</div>
  </div>
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,#38bdf8,transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">Best TL Timeframe</div>
    <div style="font-family:var(--mono);font-size:28px;font-weight:600;color:#38bdf8;margin-top:4px">TL-${ins.best_tf}</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">med OOS <b style="color:#38bdf8">+${ins.best_tf_med}%</b> (${ins.best_tf_pct}% pos)</div>
  </div>
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,var(--warn),transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">TradFi Premium</div>
    <div style="font-family:var(--mono);font-size:28px;font-weight:600;color:var(--warn);margin-top:4px">${ins.tradfi_premium > 0 ? "+" : ""}${ins.tradfi_premium}%</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">TradFi <b style="color:var(--pos)">${ins.med_tradfi > 0 ? "+" : ""}${ins.med_tradfi}%</b> vs Crypto <b style="color:${ins.med_crypto > 0 ? "var(--pos)" : "var(--neg)"}">${ins.med_crypto > 0 ? "+" : ""}${ins.med_crypto}%</b></div>
  </div>
</div>`;

    // ── Asset combo table ──────────────────────────────────────────
    const comboRows = G.by_combo.map(r => {
      const pct = r.pct_pos;
      const barClr = pct >= 60 ? "var(--pos)" : pct >= 40 ? "var(--warn)" : "var(--neg)";
      const medClr = r.med_oos > 0 ? "var(--pos)" : r.med_oos < -5 ? "var(--neg)" : "var(--tx-2)";
      return `<tr>
        <td style="font-family:var(--mono);font-size:12.5px;padding:10px 14px;border-bottom:1px solid var(--line)">${r.assets}</td>
        <td style="padding:10px 14px;border-bottom:1px solid var(--line)">
          <div style="display:flex;align-items:center;gap:8px">
            ${pctBar(pct, barClr)}
            <span style="font-family:var(--mono);font-size:12.5px;color:${barClr};white-space:nowrap">${pct}%</span>
          </div>
        </td>
        <td style="font-family:var(--mono);font-size:13px;color:${medClr};padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_oos > 0 ? "+" : ""}${r.med_oos}%</td>
        <td style="font-family:var(--mono);font-size:13px;color:var(--pos);padding:10px 14px;border-bottom:1px solid var(--line)">+${r.best_oos}%</td>
        <td style="font-family:var(--mono);font-size:12.5px;color:var(--tx-2);padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_shp.toFixed(2)}</td>
      </tr>`;
    }).join("");

    // ── TF table ───────────────────────────────────────────────────
    const tfRows = G.by_tf.map(r => {
      const pct = r.pct_pos;
      const barClr = pct >= 70 ? "var(--pos)" : pct >= 40 ? "var(--warn)" : "var(--neg)";
      const medClr = r.med_oos > 0 ? "var(--pos)" : r.med_oos < -5 ? "var(--neg)" : "var(--tx-2)";
      return `<tr>
        <td style="font-family:var(--mono);font-size:13px;font-weight:600;padding:10px 14px;border-bottom:1px solid var(--line);color:${r.tf === "1d" ? "var(--pos)" : "var(--tx)"}">TL-${r.tf}${r.tf === "1d" ? " ★" : ""}</td>
        <td style="padding:10px 14px;border-bottom:1px solid var(--line)">
          <div style="display:flex;align-items:center;gap:8px">
            ${pctBar(pct, barClr)}
            <span style="font-family:var(--mono);font-size:12.5px;color:${barClr};white-space:nowrap">${pct}%</span>
          </div>
        </td>
        <td style="font-family:var(--mono);font-size:13px;color:${medClr};padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_oos > 0 ? "+" : ""}${r.med_oos}%</td>
        <td style="font-family:var(--mono);font-size:12.5px;color:var(--tx-2);padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_shp.toFixed(3)}</td>
      </tr>`;
    }).join("");

    // ── Top 10 configs ─────────────────────────────────────────────
    const top10Rows = G.top10.map((r, i) => {
      const oosClr = r.oos_cum > 50 ? "var(--pos)" : r.oos_cum > 0 ? "var(--pos)" : "var(--neg)";
      const isClr  = r.is_cum  > 0  ? "var(--tx)" : "var(--tx-3)";
      return `<tr>
        <td style="font-family:var(--mono);font-size:11px;color:var(--tx-3);padding:9px 14px;border-bottom:1px solid var(--line)">${i+1}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line)">${r.assets}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:#38bdf8">${r.tl_tf}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:${isClr}">${r.is_cum > 0 ? "+" : ""}${r.is_cum}%</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:${oosClr};font-weight:600">${r.oos_cum > 0 ? "+" : ""}${r.oos_cum}%</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:var(--pos)">${r.oos_sharpe.toFixed(3)}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:var(--tx-2)">${r.oos_wins}/${r.n_oos}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:var(--neg)">${r.oos_worst}%</td>
      </tr>`;
    }).join("");

    $("#main").innerHTML = `
${insightHTML}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--gap)">
  <!-- Asset Combo table -->
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
    <div style="padding:14px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px">
      <span style="font-size:16px">📊</span>
      <div>
        <div style="font-size:14px;font-weight:600">Median OOS by Asset Combo</div>
        <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono)">จาก ${G.total_epochs.toLocaleString()} epoch — sorted by med OOS</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:var(--bg-2)">
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Assets</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">% Positive</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med OOS</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Best OOS</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med Shp</th>
        </tr>
      </thead>
      <tbody>${comboRows}</tbody>
    </table>
  </div>

  <!-- Right column: TF + Top configs -->
  <div style="display:flex;flex-direction:column;gap:var(--gap)">
    <!-- TF table -->
    <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
      <div style="padding:14px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px">
        <span style="font-size:16px">⏱️</span>
        <div>
          <div style="font-size:14px;font-weight:600">Median OOS by TL Timeframe</div>
          <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono)">TL ใช้ในเดือน BEAR เท่านั้น</div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:var(--bg-2)">
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">TF</th>
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">% Positive</th>
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med OOS</th>
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med Shp</th>
          </tr>
        </thead>
        <tbody>${tfRows}</tbody>
      </table>
    </div>

    <!-- Insight note -->
    <div style="background:color-mix(in oklch,var(--pos) 7%,var(--panel));border:1px solid color-mix(in oklch,var(--pos) 22%,transparent);border-radius:var(--r);padding:14px 16px;font-size:12.5px;line-height:1.6;color:var(--tx-2)">
      <div style="font-weight:600;color:var(--tx);margin-bottom:6px">🔎 Key Findings</div>
      <div>• <b style="color:var(--pos)">TL-1d</b> ครองอันดับ 1 ด้วย 98% positive, median OOS <b style="color:var(--pos)">+${ins.best_tf_med}%</b></div>
      <div style="margin-top:4px">• <b style="color:var(--pos)">${ins.best_combo}</b> คือ combo ที่ดีที่สุด จาก 13 combos ทั้งหมด</div>
      <div style="margin-top:4px">• เพิ่ม SPY/GLD ช่วยให้ median OOS <b style="color:var(--warn)">+${ins.tradfi_premium}%</b> เทียบกับ pure crypto</div>
      <div style="margin-top:4px">• TL-1h/2h ควรหลีกเลี่ยง — median OOS ติดลบหนัก</div>
    </div>
  </div>
</div>

<!-- Top 10 configs -->
<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
  <div style="padding:14px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px">
    <span style="font-size:16px">🏆</span>
    <div>
      <div style="font-size:14px;font-weight:600">Top 10 Configurations (Deduplicated by Assets × TF)</div>
      <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono)">Score = OOS×0.5 + Sharpe×0.3 + Overfit×0.2 — จาก 15,600 epochs</div>
    </div>
  </div>
  <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12.5px;white-space:nowrap">
      <thead>
        <tr style="background:var(--bg-2)">
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11px;color:var(--tx-3)">#</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Assets</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">TL TF</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">IS Cum</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--pos)">OOS Cum</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">OOS Sharpe</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">OOS Wins</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--neg)">Worst Month</th>
        </tr>
      </thead>
      <tbody>${top10Rows}</tbody>
    </table>
  </div>
</div>`;
  }


})();
    let _pfac=1;[..._portWins].reverse().forEach(w=>_pfac*=(1+(w.p_5050||0)/100));
    const _portCumul=+((_pfac-1)*100).toFixed(1);
    const _portNW2=_portWins.filter(w=>(w.p_5050||0)>0).length;
    const _portWorst2=_portWins.length?+Math.min(..._portWins.map(w=>w.p_5050||0)).toFixed(1):null;
    function _acDD(eq){let pk=eq[0],mDD=0;eq.forEach(v=>{if(v>pk)pk=v;const d=(v/pk-1)*100;if(d<mDD)mDD=d;});return+mDD.toFixed(1);}
    const _sRows=[
      {label:'BTC B&H',sub:'benchmark',color:'#94a3b8',cumul:_btcCu,wins:null,total:windows.length,worst:null,maxDD:null,score:null,stops:0,sep:false},
      {label:'TL ['+_canon.teelek+']',sub:'6×90d fixed params',color:'#34d399',stops:0,sep:false,..._wst('teelek',_canon.teelek)},
      {label:'ULT ['+_canon.ultimate+']',sub:'6×90d fixed params',color:'#fb923c',stops:0,sep:false,..._wst('ultimate',_canon.ultimate)},
      {label:'BP ['+_canon.bestpos+']',sub:'6×90d fixed params',color:'#22d3ee',stops:0,sep:false,..._wst('bestpos',_canon.bestpos)},
      ...(_portWins.length>=2?[{label:'Portfolio 50/50',sub:'TL['+_canon.teelek+']+BP['+_canon.bestpos+'] equal-wt',color:'#a78bfa',cumul:_portCumul,wins:_portNW2,total:_portWins.length,worst:_portWorst2,maxDD:null,score:null,stops:0,sep:false}]:[]),
      {label:'V5 Custom',sub:'BP['+_canon.bestpos+'] + TL['+_canon.teelek+'] on W5 BEAR',color:'#a3e635',stops:0,sep:true,..._v5s},
      ...((BT.MONTHLY_RESULTS||{}).summary?.total ? [(() => {
        const ms = BT.MONTHLY_RESULTS.summary, mw = BT.MONTHLY_RESULTS.windows;
        const mEq = mw.reduce((eq,w) => { eq.push((eq[eq.length-1]||100)*(1+w.ret/100)); return eq; }, [100]);
        return { label:'📅 Monthly', sub:'18×30d rolling windows', color:'#f59e0b',
          cumul: +(ms.cumulative_pct||0), wins: ms.wins, total: ms.total,
          worst: +Math.min(...mw.map(w=>w.ret)).toFixed(1),
          maxDD: _acDD(mEq), score: null, stops: ms.stops, sep: false };
      })()] : []),
      ...((BT.HYBRID_RESULTS||{}).summary?.total ? [(() => {
        const hs = BT.HYBRID_RESULTS.summary, hw = BT.HYBRID_RESULTS.windows;
        const hEq = hw.reduce((eq,w) => { eq.push((eq[eq.length-1]||100)*(1+w.ret/100)); return eq; }, [100]);
        return { label:'⚡ Hybrid', sub:'6×90d · weekly regime trigger', color:'#e879f9',
          cumul: +(hs.cumulative_pct||0), wins: hs.wins, total: hs.total,
          worst: +Math.min(...hw.map(w=>w.ret)).toFixed(1),
          maxDD: _acDD(hEq), score: null, stops: hs.stops, sep: false };
      })()] : []),
    ];
    _sRows.forEach(r=>{if(r.score==null&&r.cumul!=null&&r.maxDD!=null&&r.maxDD<-0.1)r.score=+(r.cumul/Math.abs(r.maxDD)).toFixed(2);});
    const _bestRow=_sRows.filter(r=>r.label!=='BTC B&H').reduce((a,b)=>(b.cumul||0)>(a.cumul||0)?b:a,_sRows[1]);
        const summarySection=(()=>{
      const sr=(v,d=1)=>v!=null?(v>=0?'+':'')+v.toFixed(d)+'%':'—';
      const wr=r=>r.wins==null?'—':r.wins+'/'+r.total;
      const wrPct=r=>r.wins==null||!r.total?'':`<span style="opacity:.45;font-size:.8em"> (${Math.round(r.wins/r.total*100)}%)</span>`;
      const avgW=r=>(r.wins&&r.total&&r.cumul!=null)?sr(r.cumul/r.total):'—';
      const sRows=_sRows.map(r=>{
        const isBest=r===_bestRow,isBtc=r.label==='BTC B&H';
        const retCol=(r.cumul||0)>=0?'#34d399':'#f87171';
        const ddCol=r.maxDD!=null&&r.maxDD<-20?'#f87171':r.maxDD!=null&&r.maxDD<-10?'#fbbf24':'inherit';
        const scCol=r.score!=null?(r.score>=2?'#34d399':r.score>=1?'#fbbf24':r.score>=0?'inherit':'#f87171'):'inherit';
        return (r.sep?'<tr><td colspan="8" style="padding:0;height:1px;background:var(--line);opacity:.4"></td></tr>':'')
          +'<tr style="'+(isBest?'background:rgba(163,230,53,0.05);':isBtc?'opacity:.55;':'')+(r.sep?'border-top:1px solid var(--line);':'')+'">'
          +'<td style="white-space:nowrap">'
            +'<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+r.color+';margin-right:7px;flex-shrink:0;vertical-align:middle"></span>'
            +'<span style="font-weight:600">'+(isBtc?'<span style="opacity:.7">':'')+(isBest?'<span style="color:#a3e635">':'')+r.label+(isBest?'</span>':'')+(isBtc?'</span>':'')+'</span>'
            +(isBest?' <span style="display:inline-block;padding:1px 6px;border-radius:3px;font-size:.63em;font-weight:700;background:#a3e635;color:#1a2e05;vertical-align:middle">★ BEST</span>':'')
            +'<div style="font-size:.7em;opacity:.4;padding-left:15px;margin-top:1px">'+r.sub+'</div>'
          +'</td>'
          +'<td class="tnum" style="color:'+retCol+';font-weight:700;font-size:1.0em">'+sr(r.cumul)+'</td>'
          +'<td class="tnum">'+wr(r)+wrPct(r)+'</td>'
          +'<td class="tnum" style="opacity:.7">'+avgW(r)+'</td>'
          +'<td class="tnum" style="color:'+(r.worst!=null&&r.worst<0?'#f87171':'inherit')+'">'+sr(r.worst)+'</td>'
          +'<td class="tnum" style="color:'+ddCol+'">'+(r.maxDD!=null?r.maxDD.toFixed(1)+'%':'—')+'</td>'
          +'<td class="tnum" style="color:'+scCol+';font-weight:600">'+(r.score!=null?r.score.toFixed(2):'—')+'</td>'
          +'<td class="tnum">'+(r.stops>0?'<span style="color:#f87171;font-weight:600">'+r.stops+'✕</span>':'<span style="opacity:.25">—</span>')+'</td>'
          +'</tr>';
      }).join('');
      return '<section class="panel">'
        +'<div class="panel-h"><h2>📋 All Results · Master Comparison</h2>'
        +'<span style="font-size:.75em;color:var(--tx-2);font-weight:400">Calmar = Cumul ÷ |Max DD| · Dec 24 – Jun 26</span></div>'
        +'<div class="tbl-wrap"><table class="tbl"><thead><tr>'
        +'<th class="l">Strategy / Approach</th>'
        +'<th>Cumul. Ret</th>'
        +'<th>Win Rate</th>'
        +'<th>Avg/Win</th>'
        +'<th>Worst</th>'
        +'<th>Max DD</th>'
        +'<th>Calmar</th>'
        +'<th>Stops</th>'
        +'</tr></thead><tbody>'+sRows+'</tbody></table></div>'
        +'</section>';
    
  // ══════════════════════════════════════════════════════════════════
  // GRID SEARCH V2 VIEW
  // ══════════════════════════════════════════════════════════════════
  function renderGridV2() {
    clearCharts();
    const G = window.GRID_V2;
    if (!G) {
      $("#main").innerHTML = "<p style='color:var(--tx-3);padding:24px'>grid_v2_data.js not loaded</p>";
      return;
    }
    const ins = G.insights;

    // Colour helpers
    function clr(v) { return v > 0 ? "var(--pos)" : v < 0 ? "var(--neg)" : "var(--tx)"; }
    function pctBar(pct, color) {
      return `<div style="flex:1;height:5px;border-radius:3px;background:var(--bg-2);border:1px solid var(--line);overflow:hidden;max-width:90px">
        <span style="display:block;height:100%;width:${Math.min(pct,100)}%;background:${color};border-radius:3px"></span></div>`;
    }

    // ── Insight cards ──────────────────────────────────────────────
    const insightHTML = `
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:var(--gap);margin-bottom:var(--gap)">
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,var(--pos),transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">Total Epochs</div>
    <div style="font-family:var(--mono);font-size:32px;font-weight:600;color:var(--tx);margin-top:4px">${G.total_epochs.toLocaleString()}</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">${G.valid_epochs.toLocaleString()} valid (${G.pct_valid}%)</div>
  </div>
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,var(--pos),transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">Best Asset Combo</div>
    <div style="font-family:var(--mono);font-size:18px;font-weight:600;color:var(--pos);margin-top:6px">${ins.best_combo}</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">med OOS <b style="color:var(--pos)">+${ins.best_combo_med}%</b> (${ins.best_combo_pct}% pos)</div>
  </div>
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,#38bdf8,transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">Best TL Timeframe</div>
    <div style="font-family:var(--mono);font-size:28px;font-weight:600;color:#38bdf8;margin-top:4px">TL-${ins.best_tf}</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">med OOS <b style="color:#38bdf8">+${ins.best_tf_med}%</b> (${ins.best_tf_pct}% pos)</div>
  </div>
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,var(--warn),transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">TradFi Premium</div>
    <div style="font-family:var(--mono);font-size:28px;font-weight:600;color:var(--warn);margin-top:4px">${ins.tradfi_premium > 0 ? "+" : ""}${ins.tradfi_premium}%</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">TradFi <b style="color:var(--pos)">${ins.med_tradfi > 0 ? "+" : ""}${ins.med_tradfi}%</b> vs Crypto <b style="color:${ins.med_crypto > 0 ? "var(--pos)" : "var(--neg)"}">${ins.med_crypto > 0 ? "+" : ""}${ins.med_crypto}%</b></div>
  </div>
</div>`;

    // ── Asset combo table ──────────────────────────────────────────
    const comboRows = G.by_combo.map(r => {
      const pct = r.pct_pos;
      const barClr = pct >= 60 ? "var(--pos)" : pct >= 40 ? "var(--warn)" : "var(--neg)";
      const medClr = r.med_oos > 0 ? "var(--pos)" : r.med_oos < -5 ? "var(--neg)" : "var(--tx-2)";
      return `<tr>
        <td style="font-family:var(--mono);font-size:12.5px;padding:10px 14px;border-bottom:1px solid var(--line)">${r.assets}</td>
        <td style="padding:10px 14px;border-bottom:1px solid var(--line)">
          <div style="display:flex;align-items:center;gap:8px">
            ${pctBar(pct, barClr)}
            <span style="font-family:var(--mono);font-size:12.5px;color:${barClr};white-space:nowrap">${pct}%</span>
          </div>
        </td>
        <td style="font-family:var(--mono);font-size:13px;color:${medClr};padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_oos > 0 ? "+" : ""}${r.med_oos}%</td>
        <td style="font-family:var(--mono);font-size:13px;color:var(--pos);padding:10px 14px;border-bottom:1px solid var(--line)">+${r.best_oos}%</td>
        <td style="font-family:var(--mono);font-size:12.5px;color:var(--tx-2);padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_shp.toFixed(2)}</td>
      </tr>`;
    }).join("");

    // ── TF table ───────────────────────────────────────────────────
    const tfRows = G.by_tf.map(r => {
      const pct = r.pct_pos;
      const barClr = pct >= 70 ? "var(--pos)" : pct >= 40 ? "var(--warn)" : "var(--neg)";
      const medClr = r.med_oos > 0 ? "var(--pos)" : r.med_oos < -5 ? "var(--neg)" : "var(--tx-2)";
      return `<tr>
        <td style="font-family:var(--mono);font-size:13px;font-weight:600;padding:10px 14px;border-bottom:1px solid var(--line);color:${r.tf === "1d" ? "var(--pos)" : "var(--tx)"}">TL-${r.tf}${r.tf === "1d" ? " ★" : ""}</td>
        <td style="padding:10px 14px;border-bottom:1px solid var(--line)">
          <div style="display:flex;align-items:center;gap:8px">
            ${pctBar(pct, barClr)}
            <span style="font-family:var(--mono);font-size:12.5px;color:${barClr};white-space:nowrap">${pct}%</span>
          </div>
        </td>
        <td style="font-family:var(--mono);font-size:13px;color:${medClr};padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_oos > 0 ? "+" : ""}${r.med_oos}%</td>
        <td style="font-family:var(--mono);font-size:12.5px;color:var(--tx-2);padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_shp.toFixed(3)}</td>
      </tr>`;
    }).join("");

    // ── Top 10 configs ─────────────────────────────────────────────
    const top10Rows = G.top10.map((r, i) => {
      const oosClr = r.oos_cum > 50 ? "var(--pos)" : r.oos_cum > 0 ? "var(--pos)" : "var(--neg)";
      const isClr  = r.is_cum  > 0  ? "var(--tx)" : "var(--tx-3)";
      return `<tr>
        <td style="font-family:var(--mono);font-size:11px;color:var(--tx-3);padding:9px 14px;border-bottom:1px solid var(--line)">${i+1}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line)">${r.assets}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:#38bdf8">${r.tl_tf}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:${isClr}">${r.is_cum > 0 ? "+" : ""}${r.is_cum}%</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:${oosClr};font-weight:600">${r.oos_cum > 0 ? "+" : ""}${r.oos_cum}%</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:var(--pos)">${r.oos_sharpe.toFixed(3)}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:var(--tx-2)">${r.oos_wins}/${r.n_oos}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:var(--neg)">${r.oos_worst}%</td>
      </tr>`;
    }).join("");

    $("#main").innerHTML = `
${insightHTML}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--gap)">
  <!-- Asset Combo table -->
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
    <div style="padding:14px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px">
      <span style="font-size:16px">📊</span>
      <div>
        <div style="font-size:14px;font-weight:600">Median OOS by Asset Combo</div>
        <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono)">จาก ${G.total_epochs.toLocaleString()} epoch — sorted by med OOS</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:var(--bg-2)">
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Assets</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">% Positive</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med OOS</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Best OOS</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med Shp</th>
        </tr>
      </thead>
      <tbody>${comboRows}</tbody>
    </table>
  </div>

  <!-- Right column: TF + Top configs -->
  <div style="display:flex;flex-direction:column;gap:var(--gap)">
    <!-- TF table -->
    <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
      <div style="padding:14px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px">
        <span style="font-size:16px">⏱️</span>
        <div>
          <div style="font-size:14px;font-weight:600">Median OOS by TL Timeframe</div>
          <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono)">TL ใช้ในเดือน BEAR เท่านั้น</div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:var(--bg-2)">
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">TF</th>
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">% Positive</th>
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med OOS</th>
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med Shp</th>
          </tr>
        </thead>
        <tbody>${tfRows}</tbody>
      </table>
    </div>

    <!-- Insight note -->
    <div style="background:color-mix(in oklch,var(--pos) 7%,var(--panel));border:1px solid color-mix(in oklch,var(--pos) 22%,transparent);border-radius:var(--r);padding:14px 16px;font-size:12.5px;line-height:1.6;color:var(--tx-2)">
      <div style="font-weight:600;color:var(--tx);margin-bottom:6px">🔎 Key Findings</div>
      <div>• <b style="color:var(--pos)">TL-1d</b> ครองอันดับ 1 ด้วย 98% positive, median OOS <b style="color:var(--pos)">+${ins.best_tf_med}%</b></div>
      <div style="margin-top:4px">• <b style="color:var(--pos)">${ins.best_combo}</b> คือ combo ที่ดีที่สุด จาก 13 combos ทั้งหมด</div>
      <div style="margin-top:4px">• เพิ่ม SPY/GLD ช่วยให้ median OOS <b style="color:var(--warn)">+${ins.tradfi_premium}%</b> เทียบกับ pure crypto</div>
      <div style="margin-top:4px">• TL-1h/2h ควรหลีกเลี่ยง — median OOS ติดลบหนัก</div>
    </div>
  </div>
</div>

<!-- Top 10 configs -->
<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
  <div style="padding:14px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px">
    <span style="font-size:16px">🏆</span>
    <div>
      <div style="font-size:14px;font-weight:600">Top 10 Configurations (Deduplicated by Assets × TF)</div>
      <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono)">Score = OOS×0.5 + Sharpe×0.3 + Overfit×0.2 — จาก 15,600 epochs</div>
    </div>
  </div>
  <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12.5px;white-space:nowrap">
      <thead>
        <tr style="background:var(--bg-2)">
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11px;color:var(--tx-3)">#</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Assets</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">TL TF</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">IS Cum</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--pos)">OOS Cum</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">OOS Sharpe</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">OOS Wins</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--neg)">Worst Month</th>
        </tr>
      </thead>
      <tbody>${top10Rows}</tbody>
    </table>
  </div>
</div>`;
  }


})();

    return `
      ${summarySection}
      <section class="panel" style="padding-bottom:8px">
        <div class="panel-h" style="padding-bottom:4px"><h2>📈 Price &amp; Equity · All Windows</h2></div>
        <div style="padding:0 16px 0">
          <canvas id="rb-chart" style="display:block;width:100%"></canvas>
        </div>
        <div style="padding:0 16px 12px">
          <canvas id="rb-dd-chart" style="display:block;width:100%"></canvas>
        </div>
      </section>
      <section class="panel">
        <div class="panel-h"><h2>📊 Metrics Comparison · Current Window</h2></div>
        <div style="padding:0 4px 4px">${matrixView()}</div>
      </section>
      <section class="panel">
        <div class="panel-h"><h2>📊 Multi-Window Robustness · ${windows.length} windows</h2></div>
        <div class="tbl-wrap"><table class="tbl">
          <thead>
            <tr><th colspan="2"></th>${thGroups}</tr>
            <tr><th class="l">Window</th><th>BTC</th>${thCols}</tr>
          </thead>
          <tbody>${rows}</tbody>
        </table></div>
      </section>
      <section class="panel">
        <div class="panel-h"><h2>🎯 Consistency · Win Rate by Strategy</h2></div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr>
            <th>Strategy</th><th>Win Rate</th><th>Avg Return</th>
          </tr></thead>
          <tbody>${consistencyRows}</tbody>
        </table></div>
      </section>
      ${portSection}
      ${(() => {
        const _tls  = BT.STRATEGIES.find(s => s.id === "teelek")    || {};
        const _ults = BT.STRATEGIES.find(s => s.id === "ultimate")  || {};
        const _bps  = BT.STRATEGIES.find(s => s.id === "bestpos")   || {};
        const _ports = BT.STRATEGIES.find(s => s.id === "portfolio") || {};
        const tlmm  = _tls.metrics  || {};
        const ultmm = _ults.metrics || {};
        const bpmm  = _bps.metrics  || {};
        const portmm = _ports.metrics || {};
        const pct = (v, d=1) => v != null ? v.toFixed(d) + '%' : '—';
        const sgn = (v, d=1) => v != null ? (v >= 0 ? '+' : '') + v.toFixed(d) + '%' : '—';
        const bar = (val, color, max=100) => {
          const w = Math.min(100, Math.max(0, (val || 0) / max * 100));
          return `<div style="height:6px;border-radius:3px;background:color-mix(in oklch,${color} 15%,var(--line));margin:5px 0 2px;overflow:hidden">
            <div style="height:6px;width:${w}%;background:${color};border-radius:3px;transition:width .4s"></div></div>`;
        };
        const card = (title, color, mainLabel, mainVal, mainBar, maxBar, rows) => `
          <div style="background:color-mix(in oklch,${color} 6%,var(--panel));border:1px solid color-mix(in oklch,${color} 22%,var(--line));border-radius:10px;padding:14px 16px">
            <div style="font-size:.72em;text-transform:uppercase;letter-spacing:.09em;color:${color};margin-bottom:10px;font-weight:600">${title}</div>
            <div style="font-size:.8em;color:var(--tx-2);display:flex;justify-content:space-between;margin-bottom:1px">
              ${mainLabel}<span style="color:var(--tx);font-weight:600">${mainVal}</span></div>
            ${bar(mainBar, color, maxBar)}
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;margin-top:10px">
              ${rows.map(([label, val]) => `<div style="font-size:.76em;color:var(--tx-2)">${label}<br>
                <span style="font-size:1.15em;color:var(--tx);font-weight:600">${val}</span></div>`).join('')}
            </div>
          </div>`;
        const tlLabel = `⚡ TeeLek (${_tls.tf || '4h'})`;
        const ultLabel = `🌀 Ultimate (${_ults.tf || '15m'})`;
        return `
        <section class="panel" style="margin-top:4px">
          <div class="panel-h"><h2>💰 Money Management · Capital Efficiency</h2>
            <span style="font-size:.75em;color:var(--tx-2);font-weight:400">เปรียบเทียบการใช้ทุนแต่ละกลยุทธ์</span>
          </div>
          <div style="padding:0 16px 16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px">
            ${card(tlLabel, '#34d399', 'Time In Market', pct(tlmm.time_in_market_pct), tlmm.time_in_market_pct, 100, [
              ['Trades', tlmm.n_trades ?? '—'],
              ['Risk / Trade', pct(tlmm.risk_per_trade, 1)],
              ['Avg Hold', (tlmm.avg_hold_bars ?? 0).toFixed(0) + ' bars'],
              ['Win Rate', pct(tlmm.win_rate, 1)],
            ])}
            ${card(ultLabel, '#fb923c', 'Time In Market', pct(ultmm.time_in_market_pct), ultmm.time_in_market_pct, 100, [
              ['Trades', ultmm.n_trades ?? '—'],
              ['Risk / Trade', pct(ultmm.risk_per_trade, 1)],
              ['Avg Hold', (ultmm.avg_hold_bars ?? 0).toFixed(0) + ' bars'],
              ['Win Rate', pct(ultmm.win_rate, 1)],
            ])}
            ${card('🎯 BestPos (' + (_bps.tf || '15m') + ')', '#22d3ee', 'Capital Utilization', pct(bpmm.utilization_pct), bpmm.utilization_pct, 100, [
              ['Avg Deployed', '$' + (bpmm.avg_deployed ?? 0).toFixed(0)],
              ['Return on Deployed', pct(bpmm.return_on_deployed, 1)],
              ['DCA Cycles', bpmm.n_cycles ?? '—'],
              ['Avg DCA / Cycle', (bpmm.avg_dca_count ?? 0).toFixed(1)],
            ])}
            ${_ports.name ? card('🏦 Portfolio 50/50', '#a78bfa', 'Blended Deployment', pct((tlmm.time_in_market_pct||0)*0.5 + (bpmm.utilization_pct||0)*0.5), (tlmm.time_in_market_pct||0)*0.5 + (bpmm.utilization_pct||0)*0.5, 100, [
              ['TL Return', sgn(tlmm.return_pct)],
              ['BP Return', sgn(bpmm.return_pct)],
              ['Portfolio Return', sgn(portmm.return_pct)],
              ['Portfolio MaxDD', '-' + pct(portmm.max_dd)],
            ]) : ''}
          </div>
        </section>`;
      })()}
      ${(() => {
        const AC = BT.APPROACH_COMPARISON;
        if (!AC) return '';
        const badge = (label, col, bg) =>
          `<span style="display:inline-block;padding:1px 7px;border-radius:4px;font-size:.7em;font-weight:700;background:${bg};color:${col}">${label}</span>`;
        const cards = [AC.v5, AC.monthly, AC.hybrid].map((a, ai) => {
          const cumCol = a.cumulative > 0 ? '#34d399' : '#f87171';
          const isWinner = ai === 0;
          return `<div style="background:color-mix(in oklch,${a.color} 7%,var(--panel));border:1px solid color-mix(in oklch,${a.color} 22%,var(--line));${isWinner ? 'box-shadow:0 0 0 1px '+a.color+'44;' : ''}border-radius:9px;padding:13px 15px">
            <div style="color:${a.color};font-weight:700;font-size:.8em;margin-bottom:8px">${a.label}</div>
            <div style="font-family:var(--mono);font-size:1.55em;font-weight:700;color:${cumCol}">${a.cumulative >= 0 ? '+' : ''}${a.cumulative.toFixed(1)}%</div>
            <div style="font-size:.73em;color:var(--tx-2);margin-top:5px">${a.wins}/${a.total} wins · ${a.stops} stop${a.stops !== 1 ? 's' : ''}</div>
            <div style="margin-top:8px">${isWinner ? badge('✓ WINNER','#04140c','#34d399') : a.stops >= 2 ? badge('✕ 2 STOPS','#f87171','rgba(239,68,68,0.15)') : badge('~ similar','var(--tx-2)','var(--line)')}</div>
          </div>`;
        }).join('');
        return `
        <section class="panel" style="margin-top:4px">
          <div class="panel-h">
            <h2>🔬 Architecture Comparison · 18 เดือน</h2>
            <div style="font-size:.75em;color:var(--tx-2);font-weight:400">V5 vs Monthly vs Hybrid (Dec24–Jun26)</div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:0 16px 14px">${cards}</div>
          <div style="padding:0 16px 4px">
            <div style="font-size:.75em;color:var(--tx-2);margin-bottom:5px;font-weight:600">CUMULATIVE EQUITY (normalized start=100)</div>
            <canvas id="appr-equity-chart" style="display:block;width:100%"></canvas>
          </div>
          <div style="padding:8px 16px 16px">
            <div style="font-size:.75em;color:var(--tx-2);margin-bottom:5px;font-weight:600">PER-WINDOW RETURNS · V5 vs Hybrid (same 6×90d windows)</div>
            <canvas id="appr-bar-chart" style="display:block;width:100%"></canvas>
          </div>
          <div style="padding:0 16px 16px">
            <div style="font-size:.75em;color:var(--tx-2);margin-bottom:6px;font-weight:600">MONTHLY (18×30d) · per-window returns</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px">
              ${AC.monthly.windows.map(w => {
                const col = w.ret > 0 ? '#34d399' : w.ret < 0 ? '#f87171' : 'var(--tx-3)';
                const bg = w.ret > 0 ? 'rgba(52,211,153,0.1)' : w.ret < 0 ? 'rgba(248,113,113,0.1)' : 'rgba(255,255,255,0.04)';
                return `<div style="background:${bg};border:1px solid ${col}33;border-radius:5px;padding:4px 7px;text-align:center;min-width:44px">
                  <div style="font-size:.65em;color:var(--tx-3);margin-bottom:1px">${w.label}</div>
                  <div style="font-family:var(--mono);font-size:.78em;font-weight:700;color:${col}">${w.ret >= 0 ? '+' : ''}${w.ret.toFixed(1)}%${w.stopped ? ' ✕' : ''}</div>
                </div>`;
              }).join('')}
            </div>
          </div>
        </section>`;
      })()}
      <details class="panel" style="padding:0;margin-top:4px">
        <summary style="padding:12px 16px;cursor:pointer;font-size:.9em;color:var(--tx-2)">🔒 Fixed params used</summary>
        <div style="padding:0 16px 16px">${paramRows}</div>
      </details>
    `;
  }

  // ============================================================
  //  RENDER
  // ============================================================
  function render() {
    clearCharts();
    renderSidebar();
    renderTopbar();
    const main = document.getElementById("main");
    if (!main) return;
    const v = state.view;
    if (v === "monitor") {
      renderMonitor();
    } else if (v === "portfolio") {
      renderPortfolio();
    } else if (v === "leverage") {
      renderLeverageLab();
    } else if (v === "okxlive") {
      renderOkxLive();
    } else {
      main.innerHTML = "<p style='color:var(--tx-3);padding:24px'>หน้านี้เอาออกแล้ว — เหลือแค่ Live Monitor / Portfolio Mix (รวม TradFi แล้ว)</p>";
    }
    // bind nav
    $$("[data-nav]").forEach((b) => b.onclick = () => {
      const t = b.dataset.nav;
      if (t === "comparison" || t === "history" || t === "robustness" || t === "monthly") {
        state.detailTab = "overview";
      }
      state.view = t; persist(); render();
    });
    $$("[data-tab]").forEach((b) => b.onclick = () => { state.detailTab = b.dataset.tab; render(); });
    $$("[data-accent]").forEach((b) => b.onclick = () => { state.accent = b.dataset.accent; applyAccent(); persist(); render(); });
    $$("[data-layout]").forEach((b) => b.onclick = () => { state.layout = b.dataset.layout; persist(); render(); });
    $$("[data-density]").forEach((b) => b.onclick = () => { state.density = b.dataset.density; persist(); render(); });
    $$("[data-focus]").forEach((b) => b.onclick = () => {
      const id = b.dataset.focus;
      if (state.focus.includes(id)) state.focus = state.focus.filter(x => x !== id);
      else state.focus.push(id);
      render();
    });
    $$("[data-compmode]").forEach((b) => b.onclick = () => {
      state.compMode = b.dataset.compmode === "toggle"
        ? (state.compMode === "best" ? "current" : "best")
        : b.dataset.compmode;
      render();
    });
    $$("[data-spot]").forEach((b) => b.onclick = () => { state.spotlight = b.dataset.spot; persist(); render(); });
  }

  function applyAccent() {
    document.documentElement.style.setProperty("--accent", ACCENTS[state.accent] || ACCENTS.emerald);
  }

  // ── Mount comparison chart ────────────────────────────────
  function mountComparisonChart() {
    setTimeout(() => {
      const el = document.getElementById("cmp-chart");
      if (!el) return;
      let strategies;
      if (state.compMode === "best" && BT.BEST_EQUITY) {
        strategies = BT.STRATEGIES.map((s) => {
          const b = BT.BEST_EQUITY[s.id];
          return b ? Object.assign({}, s, { equityRet: b.equityRet }) : s;
        });
      } else {
        strategies = BT.STRATEGIES;
      }
      const c = C.comparisonChart(el, strategies, state.focus);
      liveCharts.push(c);
    }, 0);
  }

  // ── init ──────────────────────────────────────────────────
  applyAccent();
  (function(){ const h=(location.hash||"").slice(1); if(h) state.view=h; })();
  render();

  // ══════════════════════════════════════════════════════════════════
  // GRID SEARCH V2 VIEW
  // ══════════════════════════════════════════════════════════════════
  function renderGridV2() {
    clearCharts();
    const G = window.GRID_V2;
    if (!G) {
      $("#main").innerHTML = "<p style='color:var(--tx-3);padding:24px'>grid_v2_data.js not loaded</p>";
      return;
    }
    const ins = G.insights;

    // Colour helpers
    function clr(v) { return v > 0 ? "var(--pos)" : v < 0 ? "var(--neg)" : "var(--tx)"; }
    function pctBar(pct, color) {
      return `<div style="flex:1;height:5px;border-radius:3px;background:var(--bg-2);border:1px solid var(--line);overflow:hidden;max-width:90px">
        <span style="display:block;height:100%;width:${Math.min(pct,100)}%;background:${color};border-radius:3px"></span></div>`;
    }

    // ── Insight cards ──────────────────────────────────────────────
    const insightHTML = `
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:var(--gap);margin-bottom:var(--gap)">
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,var(--pos),transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">Total Epochs</div>
    <div style="font-family:var(--mono);font-size:32px;font-weight:600;color:var(--tx);margin-top:4px">${G.total_epochs.toLocaleString()}</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">${G.valid_epochs.toLocaleString()} valid (${G.pct_valid}%)</div>
  </div>
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,var(--pos),transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">Best Asset Combo</div>
    <div style="font-family:var(--mono);font-size:18px;font-weight:600;color:var(--pos);margin-top:6px">${ins.best_combo}</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">med OOS <b style="color:var(--pos)">+${ins.best_combo_med}%</b> (${ins.best_combo_pct}% pos)</div>
  </div>
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,#38bdf8,transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">Best TL Timeframe</div>
    <div style="font-family:var(--mono);font-size:28px;font-weight:600;color:#38bdf8;margin-top:4px">TL-${ins.best_tf}</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">med OOS <b style="color:#38bdf8">+${ins.best_tf_med}%</b> (${ins.best_tf_pct}% pos)</div>
  </div>
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,var(--warn),transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">TradFi Premium</div>
    <div style="font-family:var(--mono);font-size:28px;font-weight:600;color:var(--warn);margin-top:4px">${ins.tradfi_premium > 0 ? "+" : ""}${ins.tradfi_premium}%</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">TradFi <b style="color:var(--pos)">${ins.med_tradfi > 0 ? "+" : ""}${ins.med_tradfi}%</b> vs Crypto <b style="color:${ins.med_crypto > 0 ? "var(--pos)" : "var(--neg)"}">${ins.med_crypto > 0 ? "+" : ""}${ins.med_crypto}%</b></div>
  </div>
</div>`;

    // ── Asset combo table ──────────────────────────────────────────
    const comboRows = G.by_combo.map(r => {
      const pct = r.pct_pos;
      const barClr = pct >= 60 ? "var(--pos)" : pct >= 40 ? "var(--warn)" : "var(--neg)";
      const medClr = r.med_oos > 0 ? "var(--pos)" : r.med_oos < -5 ? "var(--neg)" : "var(--tx-2)";
      return `<tr>
        <td style="font-family:var(--mono);font-size:12.5px;padding:10px 14px;border-bottom:1px solid var(--line)">${r.assets}</td>
        <td style="padding:10px 14px;border-bottom:1px solid var(--line)">
          <div style="display:flex;align-items:center;gap:8px">
            ${pctBar(pct, barClr)}
            <span style="font-family:var(--mono);font-size:12.5px;color:${barClr};white-space:nowrap">${pct}%</span>
          </div>
        </td>
        <td style="font-family:var(--mono);font-size:13px;color:${medClr};padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_oos > 0 ? "+" : ""}${r.med_oos}%</td>
        <td style="font-family:var(--mono);font-size:13px;color:var(--pos);padding:10px 14px;border-bottom:1px solid var(--line)">+${r.best_oos}%</td>
        <td style="font-family:var(--mono);font-size:12.5px;color:var(--tx-2);padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_shp.toFixed(2)}</td>
      </tr>`;
    }).join("");

    // ── TF table ───────────────────────────────────────────────────
    const tfRows = G.by_tf.map(r => {
      const pct = r.pct_pos;
      const barClr = pct >= 70 ? "var(--pos)" : pct >= 40 ? "var(--warn)" : "var(--neg)";
      const medClr = r.med_oos > 0 ? "var(--pos)" : r.med_oos < -5 ? "var(--neg)" : "var(--tx-2)";
      return `<tr>
        <td style="font-family:var(--mono);font-size:13px;font-weight:600;padding:10px 14px;border-bottom:1px solid var(--line);color:${r.tf === "1d" ? "var(--pos)" : "var(--tx)"}">TL-${r.tf}${r.tf === "1d" ? " ★" : ""}</td>
        <td style="padding:10px 14px;border-bottom:1px solid var(--line)">
          <div style="display:flex;align-items:center;gap:8px">
            ${pctBar(pct, barClr)}
            <span style="font-family:var(--mono);font-size:12.5px;color:${barClr};white-space:nowrap">${pct}%</span>
          </div>
        </td>
        <td style="font-family:var(--mono);font-size:13px;color:${medClr};padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_oos > 0 ? "+" : ""}${r.med_oos}%</td>
        <td style="font-family:var(--mono);font-size:12.5px;color:var(--tx-2);padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_shp.toFixed(3)}</td>
      </tr>`;
    }).join("");

    // ── Top 10 configs ─────────────────────────────────────────────
    const top10Rows = G.top10.map((r, i) => {
      const oosClr = r.oos_cum > 50 ? "var(--pos)" : r.oos_cum > 0 ? "var(--pos)" : "var(--neg)";
      const isClr  = r.is_cum  > 0  ? "var(--tx)" : "var(--tx-3)";
      return `<tr>
        <td style="font-family:var(--mono);font-size:11px;color:var(--tx-3);padding:9px 14px;border-bottom:1px solid var(--line)">${i+1}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line)">${r.assets}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:#38bdf8">${r.tl_tf}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:${isClr}">${r.is_cum > 0 ? "+" : ""}${r.is_cum}%</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:${oosClr};font-weight:600">${r.oos_cum > 0 ? "+" : ""}${r.oos_cum}%</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:var(--pos)">${r.oos_sharpe.toFixed(3)}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:var(--tx-2)">${r.oos_wins}/${r.n_oos}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:var(--neg)">${r.oos_worst}%</td>
      </tr>`;
    }).join("");

    $("#main").innerHTML = `
${insightHTML}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--gap)">
  <!-- Asset Combo table -->
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
    <div style="padding:14px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px">
      <span style="font-size:16px">📊</span>
      <div>
        <div style="font-size:14px;font-weight:600">Median OOS by Asset Combo</div>
        <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono)">จาก ${G.total_epochs.toLocaleString()} epoch — sorted by med OOS</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:var(--bg-2)">
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Assets</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">% Positive</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med OOS</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Best OOS</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med Shp</th>
        </tr>
      </thead>
      <tbody>${comboRows}</tbody>
    </table>
  </div>

  <!-- Right column: TF + Top configs -->
  <div style="display:flex;flex-direction:column;gap:var(--gap)">
    <!-- TF table -->
    <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
      <div style="padding:14px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px">
        <span style="font-size:16px">⏱️</span>
        <div>
          <div style="font-size:14px;font-weight:600">Median OOS by TL Timeframe</div>
          <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono)">TL ใช้ในเดือน BEAR เท่านั้น</div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:var(--bg-2)">
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">TF</th>
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">% Positive</th>
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med OOS</th>
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med Shp</th>
          </tr>
        </thead>
        <tbody>${tfRows}</tbody>
      </table>
    </div>

    <!-- Insight note -->
    <div style="background:color-mix(in oklch,var(--pos) 7%,var(--panel));border:1px solid color-mix(in oklch,var(--pos) 22%,transparent);border-radius:var(--r);padding:14px 16px;font-size:12.5px;line-height:1.6;color:var(--tx-2)">
      <div style="font-weight:600;color:var(--tx);margin-bottom:6px">🔎 Key Findings</div>
      <div>• <b style="color:var(--pos)">TL-1d</b> ครองอันดับ 1 ด้วย 98% positive, median OOS <b style="color:var(--pos)">+${ins.best_tf_med}%</b></div>
      <div style="margin-top:4px">• <b style="color:var(--pos)">${ins.best_combo}</b> คือ combo ที่ดีที่สุด จาก 13 combos ทั้งหมด</div>
      <div style="margin-top:4px">• เพิ่ม SPY/GLD ช่วยให้ median OOS <b style="color:var(--warn)">+${ins.tradfi_premium}%</b> เทียบกับ pure crypto</div>
      <div style="margin-top:4px">• TL-1h/2h ควรหลีกเลี่ยง — median OOS ติดลบหนัก</div>
    </div>
  </div>
</div>

<!-- Top 10 configs -->
<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
  <div style="padding:14px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px">
    <span style="font-size:16px">🏆</span>
    <div>
      <div style="font-size:14px;font-weight:600">Top 10 Configurations (Deduplicated by Assets × TF)</div>
      <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono)">Score = OOS×0.5 + Sharpe×0.3 + Overfit×0.2 — จาก 15,600 epochs</div>
    </div>
  </div>
  <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12.5px;white-space:nowrap">
      <thead>
        <tr style="background:var(--bg-2)">
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11px;color:var(--tx-3)">#</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Assets</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">TL TF</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">IS Cum</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--pos)">OOS Cum</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">OOS Sharpe</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">OOS Wins</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--neg)">Worst Month</th>
        </tr>
      </thead>
      <tbody>${top10Rows}</tbody>
    </table>
  </div>
</div>`;
  }



  // ══════════════════════════════════════════════════════════════════
  // GRID SEARCH V2 VIEW
  // ══════════════════════════════════════════════════════════════════
  function renderGridV2() {
    clearCharts();
    const G = window.GRID_V2;
    if (!G) {
      $("#main").innerHTML = "<p style='color:var(--tx-3);padding:24px'>grid_v2_data.js not loaded</p>";
      return;
    }
    const ins = G.insights;

    // Colour helpers
    function clr(v) { return v > 0 ? "var(--pos)" : v < 0 ? "var(--neg)" : "var(--tx)"; }
    function pctBar(pct, color) {
      return `<div style="flex:1;height:5px;border-radius:3px;background:var(--bg-2);border:1px solid var(--line);overflow:hidden;max-width:90px">
        <span style="display:block;height:100%;width:${Math.min(pct,100)}%;background:${color};border-radius:3px"></span></div>`;
    }

    // ── Insight cards ──────────────────────────────────────────────
    const insightHTML = `
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:var(--gap);margin-bottom:var(--gap)">
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,var(--pos),transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">Total Epochs</div>
    <div style="font-family:var(--mono);font-size:32px;font-weight:600;color:var(--tx);margin-top:4px">${G.total_epochs.toLocaleString()}</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">${G.valid_epochs.toLocaleString()} valid (${G.pct_valid}%)</div>
  </div>
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,var(--pos),transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">Best Asset Combo</div>
    <div style="font-family:var(--mono);font-size:18px;font-weight:600;color:var(--pos);margin-top:6px">${ins.best_combo}</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">med OOS <b style="color:var(--pos)">+${ins.best_combo_med}%</b> (${ins.best_combo_pct}% pos)</div>
  </div>
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,#38bdf8,transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">Best TL Timeframe</div>
    <div style="font-family:var(--mono);font-size:28px;font-weight:600;color:#38bdf8;margin-top:4px">TL-${ins.best_tf}</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">med OOS <b style="color:#38bdf8">+${ins.best_tf_med}%</b> (${ins.best_tf_pct}% pos)</div>
  </div>
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,var(--warn),transparent 70%)"></div>
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);font-weight:600">TradFi Premium</div>
    <div style="font-family:var(--mono);font-size:28px;font-weight:600;color:var(--warn);margin-top:4px">${ins.tradfi_premium > 0 ? "+" : ""}${ins.tradfi_premium}%</div>
    <div style="font-size:11px;color:var(--tx-3);margin-top:4px">TradFi <b style="color:var(--pos)">${ins.med_tradfi > 0 ? "+" : ""}${ins.med_tradfi}%</b> vs Crypto <b style="color:${ins.med_crypto > 0 ? "var(--pos)" : "var(--neg)"}">${ins.med_crypto > 0 ? "+" : ""}${ins.med_crypto}%</b></div>
  </div>
</div>`;

    // ── Asset combo table ──────────────────────────────────────────
    const comboRows = G.by_combo.map(r => {
      const pct = r.pct_pos;
      const barClr = pct >= 60 ? "var(--pos)" : pct >= 40 ? "var(--warn)" : "var(--neg)";
      const medClr = r.med_oos > 0 ? "var(--pos)" : r.med_oos < -5 ? "var(--neg)" : "var(--tx-2)";
      return `<tr>
        <td style="font-family:var(--mono);font-size:12.5px;padding:10px 14px;border-bottom:1px solid var(--line)">${r.assets}</td>
        <td style="padding:10px 14px;border-bottom:1px solid var(--line)">
          <div style="display:flex;align-items:center;gap:8px">
            ${pctBar(pct, barClr)}
            <span style="font-family:var(--mono);font-size:12.5px;color:${barClr};white-space:nowrap">${pct}%</span>
          </div>
        </td>
        <td style="font-family:var(--mono);font-size:13px;color:${medClr};padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_oos > 0 ? "+" : ""}${r.med_oos}%</td>
        <td style="font-family:var(--mono);font-size:13px;color:var(--pos);padding:10px 14px;border-bottom:1px solid var(--line)">+${r.best_oos}%</td>
        <td style="font-family:var(--mono);font-size:12.5px;color:var(--tx-2);padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_shp.toFixed(2)}</td>
      </tr>`;
    }).join("");

    // ── TF table ───────────────────────────────────────────────────
    const tfRows = G.by_tf.map(r => {
      const pct = r.pct_pos;
      const barClr = pct >= 70 ? "var(--pos)" : pct >= 40 ? "var(--warn)" : "var(--neg)";
      const medClr = r.med_oos > 0 ? "var(--pos)" : r.med_oos < -5 ? "var(--neg)" : "var(--tx-2)";
      return `<tr>
        <td style="font-family:var(--mono);font-size:13px;font-weight:600;padding:10px 14px;border-bottom:1px solid var(--line);color:${r.tf === "1d" ? "var(--pos)" : "var(--tx)"}">TL-${r.tf}${r.tf === "1d" ? " ★" : ""}</td>
        <td style="padding:10px 14px;border-bottom:1px solid var(--line)">
          <div style="display:flex;align-items:center;gap:8px">
            ${pctBar(pct, barClr)}
            <span style="font-family:var(--mono);font-size:12.5px;color:${barClr};white-space:nowrap">${pct}%</span>
          </div>
        </td>
        <td style="font-family:var(--mono);font-size:13px;color:${medClr};padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_oos > 0 ? "+" : ""}${r.med_oos}%</td>
        <td style="font-family:var(--mono);font-size:12.5px;color:var(--tx-2);padding:10px 14px;border-bottom:1px solid var(--line)">${r.med_shp.toFixed(3)}</td>
      </tr>`;
    }).join("");

    // ── Top 10 configs ─────────────────────────────────────────────
    const top10Rows = G.top10.map((r, i) => {
      const oosClr = r.oos_cum > 50 ? "var(--pos)" : r.oos_cum > 0 ? "var(--pos)" : "var(--neg)";
      const isClr  = r.is_cum  > 0  ? "var(--tx)" : "var(--tx-3)";
      return `<tr>
        <td style="font-family:var(--mono);font-size:11px;color:var(--tx-3);padding:9px 14px;border-bottom:1px solid var(--line)">${i+1}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line)">${r.assets}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:#38bdf8">${r.tl_tf}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:${isClr}">${r.is_cum > 0 ? "+" : ""}${r.is_cum}%</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:${oosClr};font-weight:600">${r.oos_cum > 0 ? "+" : ""}${r.oos_cum}%</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:var(--pos)">${r.oos_sharpe.toFixed(3)}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:var(--tx-2)">${r.oos_wins}/${r.n_oos}</td>
        <td style="font-family:var(--mono);font-size:12px;padding:9px 14px;border-bottom:1px solid var(--line);color:var(--neg)">${r.oos_worst}%</td>
      </tr>`;
    }).join("");

    $("#main").innerHTML = `
${insightHTML}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--gap)">
  <!-- Asset Combo table -->
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
    <div style="padding:14px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px">
      <span style="font-size:16px">📊</span>
      <div>
        <div style="font-size:14px;font-weight:600">Median OOS by Asset Combo</div>
        <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono)">จาก ${G.total_epochs.toLocaleString()} epoch — sorted by med OOS</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:var(--bg-2)">
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Assets</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">% Positive</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med OOS</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Best OOS</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med Shp</th>
        </tr>
      </thead>
      <tbody>${comboRows}</tbody>
    </table>
  </div>

  <!-- Right column: TF + Top configs -->
  <div style="display:flex;flex-direction:column;gap:var(--gap)">
    <!-- TF table -->
    <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
      <div style="padding:14px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px">
        <span style="font-size:16px">⏱️</span>
        <div>
          <div style="font-size:14px;font-weight:600">Median OOS by TL Timeframe</div>
          <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono)">TL ใช้ในเดือน BEAR เท่านั้น</div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:var(--bg-2)">
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">TF</th>
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">% Positive</th>
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med OOS</th>
            <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Med Shp</th>
          </tr>
        </thead>
        <tbody>${tfRows}</tbody>
      </table>
    </div>

    <!-- Insight note -->
    <div style="background:color-mix(in oklch,var(--pos) 7%,var(--panel));border:1px solid color-mix(in oklch,var(--pos) 22%,transparent);border-radius:var(--r);padding:14px 16px;font-size:12.5px;line-height:1.6;color:var(--tx-2)">
      <div style="font-weight:600;color:var(--tx);margin-bottom:6px">🔎 Key Findings</div>
      <div>• <b style="color:var(--pos)">TL-1d</b> ครองอันดับ 1 ด้วย 98% positive, median OOS <b style="color:var(--pos)">+${ins.best_tf_med}%</b></div>
      <div style="margin-top:4px">• <b style="color:var(--pos)">${ins.best_combo}</b> คือ combo ที่ดีที่สุด จาก 13 combos ทั้งหมด</div>
      <div style="margin-top:4px">• เพิ่ม SPY/GLD ช่วยให้ median OOS <b style="color:var(--warn)">+${ins.tradfi_premium}%</b> เทียบกับ pure crypto</div>
      <div style="margin-top:4px">• TL-1h/2h ควรหลีกเลี่ยง — median OOS ติดลบหนัก</div>
    </div>
  </div>
</div>

<!-- Top 10 configs -->
<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
  <div style="padding:14px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px">
    <span style="font-size:16px">🏆</span>
    <div>
      <div style="font-size:14px;font-weight:600">Top 10 Configurations (Deduplicated by Assets × TF)</div>
      <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono)">Score = OOS×0.5 + Sharpe×0.3 + Overfit×0.2 — จาก 15,600 epochs</div>
    </div>
  </div>
  <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12.5px;white-space:nowrap">
      <thead>
        <tr style="background:var(--bg-2)">
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11px;color:var(--tx-3)">#</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Assets</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">TL TF</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">IS Cum</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--pos)">OOS Cum</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">OOS Sharpe</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">OOS Wins</th>
          <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--neg)">Worst Month</th>
        </tr>
      </thead>
      <tbody>${top10Rows}</tbody>
    </table>
  </div>
</div>`;
  }




  // ═══════════════════════════════════════════════════════════════════
  // BEAR STRATEGY COMPARISON VIEW
  // ═══════════════════════════════════════════════════════════════════
  function renderBearCompare() {
    clearCharts();
    const D = window.BEAR_COMPARE;
    if (!D) {
      $("#main").innerHTML = "<p style='color:var(--tx-3);padding:24px'>bear_compare_data.js not loaded</p>";
      return;
    }
    const COMBOS  = D.combos.map(c => c.join("+"));
    const MODES   = ["tl1d","cash","tl4h"];
    const LABELS  = D.bear_labels;
    const COLORS  = D.bear_colors;

    function pclr(v) { return v > 0 ? "var(--pos)" : v < 0 ? "var(--neg)" : "var(--tx-3)"; }

    // Insight bar
    const bestCombo = "BTC+SPY+GLD";
    const bestData  = D.results[bestCombo] || D.results[COMBOS[0]];
    const insightHTML = bestData ? (() => {
      const cash = bestData.cash, tl4h = bestData.tl4h;
      return `
<div style="background:color-mix(in oklch,var(--pos) 8%,var(--panel));border:1px solid color-mix(in oklch,var(--pos) 25%,transparent);border-radius:var(--r);padding:16px 20px;margin-bottom:var(--gap)">
  <div style="font-size:13px;font-weight:600;margin-bottom:10px">Key Findings — BEAR Month Analysis (17 BEAR months / 54 total)</div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
    <div style="background:var(--bg-2);border-radius:6px;padding:12px">
      <div style="font-size:11px;color:var(--tx-3);font-weight:600">TL-1d (current)</div>
      <div style="font-family:var(--mono);font-size:13px;color:var(--tx-3);margin-top:4px">BEAR avg: 0.000% · 0/17 wins</div>
      <div style="font-size:11px;color:var(--tx-3);margin-top:4px">ไม่ trade จริงในเดือน BEAR (monthly slice สั้นเกิน)</div>
    </div>
    <div style="background:color-mix(in oklch,var(--pos) 12%,var(--bg-2));border:1px solid color-mix(in oklch,var(--pos) 30%,transparent);border-radius:6px;padding:12px">
      <div style="font-size:11px;color:var(--pos);font-weight:600">✓ Pure Cash (0%) — แนะนำ</div>
      <div style="font-family:var(--mono);font-size:13px;color:var(--pos);margin-top:4px">OOS +${cash.oos_cum.toFixed(1)}% · Sharpe ${cash.oos_sharpe.toFixed(3)}</div>
      <div style="font-size:11px;color:var(--tx-2);margin-top:4px">ผลเหมือน TL-1d ทุกตัว · ระบบง่ายกว่า · ไม่มี overhead</div>
    </div>
    <div style="background:color-mix(in oklch,var(--neg) 8%,var(--bg-2));border:1px solid color-mix(in oklch,var(--neg) 25%,transparent);border-radius:6px;padding:12px">
      <div style="font-size:11px;color:var(--neg);font-weight:600">✗ TL-4h — แย่กว่า cash ทุก combo</div>
      <div style="font-family:var(--mono);font-size:13px;color:var(--neg);margin-top:4px">BEAR avg ${tl4h.bear_avg.toFixed(3)}% · OOS ${tl4h.oos_cum > 0 ? "+" : ""}${tl4h.oos_cum.toFixed(1)}%</div>
      <div style="font-size:11px;color:var(--tx-2);margin-top:4px">ขาดทุนใน BEAR months — ไม่ใช้ดีกว่า</div>
    </div>
  </div>
</div>`;
    })() : "";

    // Main table
    const tableRows = COMBOS.map(combo => {
      const r = D.results[combo];
      if (!r) return "";
      return `<tr>${MODES.map(mode => {
        const m = r[mode];
        const hl = (mode === "cash" || mode === "tl1d") ? "background:color-mix(in oklch,var(--pos) 4%,transparent);" : "";
        return `<td style="padding:10px 14px;border-bottom:1px solid var(--line);${hl}">
          <div style="font-family:var(--mono);font-size:13px;font-weight:600;color:${m.oos_cum>0?"var(--pos)":"var(--neg)"}">${m.oos_cum>0?"+":""}${m.oos_cum.toFixed(1)}%</div>
          <div style="font-size:10.5px;color:var(--tx-3);margin-top:2px">Shp ${m.oos_sharpe.toFixed(3)} · DD ${m.oos_max_dd.toFixed(1)}%</div>
          <div style="font-size:10.5px;color:${m.bear_avg<-0.5?"var(--neg)":"var(--tx-3)"};margin-top:1px">BEAR avg ${m.bear_avg>0?"+":""}${m.bear_avg.toFixed(3)}%</div>
        </td>`;
      }).join("")}<td style="font-family:var(--mono);font-size:12px;font-weight:600;padding:10px 14px;border-bottom:1px solid var(--line)">${combo}</td></tr>`;
    }).join("");

    // Regime distribution
    const refKey  = COMBOS.includes("BTC+ETH+SOL") ? "BTC+ETH+SOL" : COMBOS[0];
    const refData = D.results[refKey];
    const regCnt  = refData ? refData.cash.monthly.reduce((a, m) => {
      a[m.regime] = (a[m.regime]||0)+1; return a;
    }, {}) : {};
    const regTotal = Object.values(regCnt).reduce((a,b)=>a+b,0);

    // Best combo highlight
    const bestRow = COMBOS.map(c => {
      const r = D.results[c];
      return { combo:c, oos: r ? r.cash.oos_cum : -999 };
    }).sort((a,b) => b.oos - a.oos)[0];

    $("#main").innerHTML = `
${insightHTML}
<div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;margin-bottom:var(--gap)">
  <div style="font-size:13px;color:var(--tx-2)">
    Regime distribution (BTC signal): 
    ${Object.entries(regCnt).map(([r,n]) =>
      `<span style="font-family:var(--mono);font-size:12px;
        color:${r==='BULL'?'var(--pos)':r==='BEAR'?'var(--neg)':'#f59e0b'}">
        ${r} ${n}mo (${(n/regTotal*100).toFixed(0)}%)</span>`).join("  ·  ")}
  </div>
  <div style="font-size:12px;color:var(--pos);font-family:var(--mono)">
    Best combo: <b>${bestRow.combo}</b> OOS +${bestRow.oos.toFixed(1)}%
  </div>
</div>

<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
  <div style="padding:12px 16px;border-bottom:1px solid var(--line)">
    <div style="font-size:14px;font-weight:600">OOS Performance Comparison (${D.n_oos} months)</div>
    <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono);margin-top:2px">
      Sorted by asset combo · ไฮไลต์ cash = ผลเท่ากับ TL-1d · TL-4h แย่กว่าทุก combo
    </div>
  </div>
  <table style="width:100%;border-collapse:collapse">
    <thead>
      <tr style="background:var(--bg-2)">
        ${MODES.map(m => `<th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:${COLORS[m]}">${LABELS[m]}</th>`).join("")}
        <th style="text-align:left;padding:9px 14px;border-bottom:1px solid var(--line-2);font-size:11.5px;color:var(--tx-2)">Asset Combo</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
</div>

<div style="margin-top:var(--gap);background:color-mix(in oklch,#f59e0b 8%,var(--panel));border:1px solid color-mix(in oklch,#f59e0b 25%,transparent);border-radius:var(--r);padding:14px 18px;font-size:12.5px;line-height:1.7;color:var(--tx-2)">
  <b style="color:#f59e0b">สรุปการตัดสินใจ</b><br>
  1. เปลี่ยน BEAR strategy จาก TL-1d → <b style="color:var(--pos)">Pure Cash (0%)</b> — ผลเหมือนกัน 100% แต่ระบบง่ายกว่า ไม่ต้อง run TL ใน BEAR months<br>
  2. TL-4h <b style="color:var(--neg)">แย่กว่า cash</b> ทุก combo (BEAR avg -0.7% ถึง -3.4%) — ไม่ควรใช้<br>
  3. พิจารณาเปลี่ยน combo เป็น <b style="color:var(--pos)">BTC+SPY+GLD</b> (OOS +22.8%, Sharpe 0.957) แทน BTC+ETH+SOL (OOS +13.9%, Sharpe 0.614)
</div>`;
  }


  function renderProgress() {
    clearCharts();
    const main = document.getElementById('main');
    main.innerHTML = '';

    const PHASES = [
      { label:'Phase 0A', name:'BTC raw (no regime)', ret:23.47, retLabel:'Apr24–Jun25 15mo',
        pos:17, sharpe:null, note:'TL / BestPos / Ultimate<br>ขาดทุนทุก window', color:'var(--neg)', border:'#f87171' },
      { label:'Phase 0B', name:'BTC+ETH+SOL (no regime)', ret:22.99, retLabel:'Apr24–Jun25 15mo',
        pos:50, sharpe:null, note:'Portfolio 50/50<br>เล็กน้อย แต่ worst −4.8%', color:'var(--warn)', border:'#fbbf24' },
      { label:'Phase 1', name:'Monthly regime engine', ret:17.37, retLabel:'Apr24–Jun25 15mo',
        pos:41, sharpe:null, note:'BEAR→TL, BULL→BPx2<br>15mo +17.99% (OOS: +22.33%)', color:'var(--pos)', border:'#34d399' },
      { label:'Phase 2A', name:'Grid search V2', ret:6.04, retLabel:'median OOS (best combo)',
        pos:77, sharpe:0.673, note:'TradFi BTC+SPY+GLD<br>vs crypto −6.95%', color:'#60a5fa', border:'#60a5fa' },
      { label:'Phase 2B', name:'Best combo + cash', ret:29.31, retLabel:'Apr24–Jun25 15mo · Sharpe 2.252',
        pos:33, sharpe:2.252, note:'BTC+SPY+GLD + Stocks Free<br>Sharpe 2.252 — robust', color:'#a78bfa', border:'#a78bfa', best:true },
    ];

    // ── header ──────────────────────────────────────────────────────
    const hdr = document.createElement('div');
    hdr.style.cssText = 'background:var(--panel-2);border:1px solid var(--line-2);border-radius:var(--r);padding:20px 24px;margin-bottom:16px';
    hdr.innerHTML = `
      <div style="font-size:15px;font-weight:600;margin-bottom:4px">📈 Development Progress</div>
      <div style="font-size:12px;color:var(--tx-3)">เปรียบเทียบทุก phase — จาก single strategy ที่ขาดทุนทุก window สู่ระบบที่ robust ที่สุด</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px">
        <div style="background:var(--bg-2);border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:20px;font-weight:700;color:var(--neg)">−1.6%</div>
          <div style="font-size:10px;color:var(--tx-3);margin-top:2px">Phase 0A avg/window</div>
        </div>
        <div style="background:var(--bg-2);border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:20px;font-weight:700;color:var(--pos)">+19.4%</div>
          <div style="font-size:10px;color:var(--tx-3);margin-top:2px">Phase 1 OOS 9 months</div>
        </div>
        <div style="background:var(--bg-2);border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:20px;font-weight:700;color:#a78bfa">+22.8%</div>
          <div style="font-size:10px;color:var(--tx-3);margin-top:2px">Phase 2B OOS 15 months (real)</div>
        </div>
        <div style="background:var(--bg-2);border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:20px;font-weight:700;color:#a78bfa">0.957</div>
          <div style="font-size:10px;color:var(--tx-3);margin-top:2px">Final Sharpe ratio</div>
        </div>
      </div>
    `;
    main.appendChild(hdr);

    // ── phase cards ──────────────────────────────────────────────────
    const cards = document.createElement('div');
    cards.style.cssText = 'display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px';
    PHASES.forEach((p, i) => {
      const c = document.createElement('div');
      c.style.cssText = `background:var(--panel);border:1px solid ${p.border}${p.best ? '' : '55'};border-top:3px solid ${p.border};border-radius:var(--r);padding:12px 10px;position:relative`;
      c.innerHTML = `
        <div style="font-size:10px;color:${p.border};font-weight:600;letter-spacing:.05em;margin-bottom:3px">${p.label}${p.best ? ' ★' : ''}</div>
        <div style="font-size:12px;font-weight:500;color:var(--tx);margin-bottom:8px;line-height:1.3">${p.name}</div>
        <div style="font-size:22px;font-weight:700;color:${p.color};line-height:1">${p.ret > 0 ? '+' : ''}${p.ret.toFixed(1)}%</div>
        <div style="font-size:10px;color:var(--tx-3);margin-bottom:8px">${p.retLabel}</div>
        <div style="font-size:10px;color:var(--tx-2)">pos ${p.pos}%${p.sharpe ? ' · Sharpe ' + p.sharpe.toFixed(3) : ''}</div>
        <div style="border-top:1px solid var(--line);margin-top:8px;padding-top:7px;font-size:10px;color:var(--tx-3);line-height:1.5">${p.note}</div>
        ${i < 4 ? '<div style="position:absolute;right:-13px;top:50%;transform:translateY(-50%);font-size:14px;color:var(--tx-3);z-index:2">→</div>' : ''}
      `;
      cards.appendChild(c);
    });
    main.appendChild(cards);

    // ── chart row: bar + equity ──────────────────────────────────────
    const chartRow = document.createElement('div');
    chartRow.style.cssText = 'display:grid;grid-template-columns:220px 1fr;gap:12px;margin-bottom:12px';

    const boxBar = document.createElement('div');
    boxBar.style.cssText = 'background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:14px';
    boxBar.innerHTML = `
      <div style="font-size:12px;font-weight:500;color:var(--tx);margin-bottom:10px">OOS return by phase</div>
      <div style="position:relative;height:230px"><canvas id="pg_bar" role="img" aria-label="Bar chart: Phase 0A -1.6%, 0B +1.1%, 1 +19.4%, 2A +6.0%, 2B +22.8%">OOS returns per phase.</canvas></div>
    `;
    chartRow.appendChild(boxBar);

    const boxEq = document.createElement('div');
    boxEq.style.cssText = 'background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:14px';
    boxEq.innerHTML = `
      <div style="font-size:12px;font-weight:500;color:var(--tx);margin-bottom:4px">Equity curve evolution (start = 100)</div>
      <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:8px;font-size:11px;color:var(--tx-2)">
        <span><span style="display:inline-block;width:16px;height:2px;background:#f87171;vertical-align:middle;margin-right:4px"></span>TL-4h (0A)</span>
        <span><span style="display:inline-block;width:16px;height:0;border-top:2px dashed #fbbf24;vertical-align:middle;margin-right:4px"></span>BestPos (0A)</span>
        <span><span style="display:inline-block;width:16px;height:2px;background:#34d399;vertical-align:middle;margin-right:4px"></span>Phase 1 BTC (9mo OOS)</span>
        <span><span style="display:inline-block;width:16px;height:2px;background:#a78bfa;vertical-align:middle;margin-right:4px"></span>Phase 2B BTC+SPY+GLD (15mo)</span>
      </div>
      <div style="position:relative;height:210px"><canvas id="pg_eq" role="img" aria-label="Equity curves: TL-4h falls to 63.6, Phase 1 BTC peaks at 138.8 then settles at 122.5, Phase 2B ends at 129.3">Equity curves per phase.</canvas></div>
    `;
    chartRow.appendChild(boxEq);
    main.appendChild(chartRow);

    // ── monthly breakdown chart ──────────────────────────────────────
    const boxMo = document.createElement('div');
    boxMo.style.cssText = 'background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:14px;margin-bottom:12px';
    boxMo.innerHTML = `
      <div style="font-size:12px;font-weight:500;color:var(--tx);margin-bottom:4px">Phase 2B — 15-month OOS monthly returns (BTC+SPY+GLD + pure cash in BEAR)</div>
      <div style="display:flex;gap:14px;margin-bottom:8px;font-size:11px;color:var(--tx-2)">
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#34d399;vertical-align:middle;margin-right:4px"></span>BULL</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#60a5fa;vertical-align:middle;margin-right:4px"></span>NEUTRAL</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#4b5563;vertical-align:middle;margin-right:4px"></span>BEAR (cash 0%)</span>
      </div>
      <div style="position:relative;height:140px"><canvas id="pg_mo" role="img" aria-label="27 monthly OOS bars. Month 1 BULL +14.1% is largest. BEAR months show 0%.">27 monthly returns Phase 2B.</canvas></div>
    `;
    main.appendChild(boxMo);

    // ── key findings ─────────────────────────────────────────────────
    const findings = [
      { color:'#34d399', title:'Regime switching คือ breakthrough',
        body:'Phase 0A → Phase 1 เพิ่มจาก −1.6% → +19.42% OOS\nDetect regime + switch strategy = alpha ที่แท้จริง' },
      { color:'#a78bfa', title:'27mo OOS ยืนยัน edge ไม่ใช่ noise',
        body:'Phase 1 (9mo) vs Phase 2B (15mo): +29.3% vs IS +28.7%\nStocks free → ชนะ Phase 1 (+17.4%)' },
      { color:'#60a5fa', title:'TradFi premium ชัดเจน (+9.3pp)',
        body:'Crypto combos median −6.95% vs BTC+SPY+GLD +6.04%\n77% ของ 15,600 configs ให้ผลบวก — ไม่ใช่ lucky pick' },
      { color:'#fbbf24', title:'Cash ดีกว่า TL ใน BEAR (confirmed)',
        body:'TL-1d = Cash exactly ใน 17 BEAR months (0% both)\nTL-4h แย่กว่า cash ใน 27mo OOS → ระบบง่ายกว่าและดีกว่า' },
    ];
    const fGrid = document.createElement('div');
    fGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px';
    findings.forEach(f => {
      const d = document.createElement('div');
      d.style.cssText = `background:var(--panel);border:1px solid var(--line);border-left:3px solid ${f.color};border-radius:0 var(--r) var(--r) 0;padding:12px 14px`;
      d.innerHTML = `<div style="font-size:11px;font-weight:600;color:${f.color};margin-bottom:5px">${f.title}</div>
        <div style="font-size:11px;color:var(--tx-2);line-height:1.6;white-space:pre-line">${f.body}</div>`;
      fGrid.appendChild(d);
    });
    main.appendChild(fGrid);

    // ── draw charts ──────────────────────────────────────────────────
    requestAnimationFrame(() => {
      if (!window.Chart) { console.warn('Chart.js not loaded'); return; }

      const gridClr  = 'rgba(255,255,255,0.05)';
      const tickClr  = '#646d80';
      const bf       = { family: "'IBM Plex Sans Thai', sans-serif", size: 11 };

      // Bar chart
      new Chart(document.getElementById('pg_bar'), {
        type: 'bar',
        data: {
          labels: ['0A','0B','1','2A','2B'],
          datasets: [{
            data: [23.47, 22.99, 17.37, 6.04, 29.31],
            backgroundColor: ['#f87171','#fbbf24','#34d399','#60a5fa','#a78bfa'],
            borderRadius: 4, borderSkipped: false,
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: {
            label: c => (c.parsed.y > 0 ? '+' : '') + c.parsed.y.toFixed(1) + '%'
          }}},
          scales: {
            x: { ticks: { color: tickClr, font: bf }, grid: { color: gridClr } },
            y: { ticks: { color: tickClr, font: bf, callback: v => (v > 0 ? '+' : '') + v + '%' }, grid: { color: gridClr } }
          }
        }
      });

      // Equity chart
      const p0atl  = [100,100,103.22,103.22,99.06,101.25,101.71,102.69,105.79,105.79,110.14,111.55,109.64,118.68,123.32,123.47];
      const p0abp  = [100,100.24,100.48,101.85,96.66,98.13,97.36,97.12,102.01,102.43,105.74,106.57,104.93,116.83,123.57,122.99];
      const p1btc  = [100,100,100,100,100,102.21,102.21,103.19,105.63,105.63,109.97,111.38,111.38,111.38,117.10,117.37];
      const p2braw = [10000,10074.5,10145.12,10385.15,10240.69,10447.86,10765.16,11013.08,11167.48,11068.76,11589.32,11544.7,11280.21,12255.72,12719.35,12931.0];
      const p2b    = p2braw.map(v => Math.round(v) / 100);
      const p_bh   = [100,116.11,107.77,111.97,98.18,104.18,119.07,166.51,162.07,172.42,147.46,145.91,165.32,181.0,181.07,194.12];
      const p_spy  = [100,105.4,109.34,108.88,113.02,114.36,114.85,121.18,118.27,121.44,119.9,113.54,113.04,119.29,125.38,126.21];
      const p_gld  = [100,100.71,100.83,105.6,108.19,114.88,118.09,114.87,113.26,120.94,123.14,134.51,139.14,142.01,143.86,144.59];
      const N      = p2b.length;
      const pad    = a => { const r = a.slice(); while (r.length < N) r.push(null); return r; };

      new Chart(document.getElementById('pg_eq'), {
        type: 'line',
        data: {
          labels: Array.from({length: N}, (_, i) => i === 0 ? 'Start' : 'M' + i),
          datasets: [
            { label:'BTC raw (0A)',       data: pad(p0atl), borderColor:'#f87171', backgroundColor:'transparent', tension:0.3, pointRadius:0, borderWidth:1.5, spanGaps:false },
            { label:'BTC+ETH+SOL (0B)',      data: pad(p0abp), borderColor:'#fbbf24', backgroundColor:'transparent', tension:0.3, pointRadius:0, borderWidth:1.5, borderDash:[4,3], spanGaps:false },
            { label:'Phase 1 BTC (regime)',      data: pad(p1btc), borderColor:'#34d399', backgroundColor:'rgba(52,211,153,0.06)', fill:true, tension:0.3, pointRadius:0, borderWidth:2, spanGaps:false },
            { label:'SPY Buy&Hold',      data: p_spy,       borderColor:'#38bdf8', backgroundColor:'transparent', tension:0.3, pointRadius:0, borderWidth:1.5, borderDash:[2,2], spanGaps:false },
            { label:'GLD Buy&Hold',      data: p_gld,       borderColor:'#facc15', backgroundColor:'transparent', tension:0.3, pointRadius:0, borderWidth:1.5, borderDash:[2,2], spanGaps:false },
            { label:'BTC Buy&Hold',      data: p_bh,        borderColor:'#f97316', backgroundColor:'transparent', tension:0.3, pointRadius:0, borderWidth:1.5, borderDash:[2,2], spanGaps:false },
            { label:'Phase 2B',         data: p2b,        borderColor:'#a78bfa', backgroundColor:'rgba(167,139,250,0.06)', fill:true, tension:0.3, pointRadius:0, borderWidth:2.5 },
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode:'index', intersect:false },
          plugins: { legend: { display:false }, tooltip: { callbacks: {
            label: c => c.parsed.y != null ? c.dataset.label + ': ' + c.parsed.y.toFixed(1) : null
          }}},
          scales: {
            x: { ticks: { color:tickClr, font:{ family:"'IBM Plex Sans Thai',sans-serif", size:10 }, maxTicksLimit:10 }, grid: { color:gridClr } },
            y: { ticks: { color:tickClr, font:bf, callback: v => v.toFixed(0) }, grid: { color:gridClr } }
          }
        }
      });

      // Monthly chart
      const mo = [
        {r:'BULL',v:0.745},{r:'BEAR',v:0.701},{r:'NEUTRAL',v:2.366},{r:'BEAR',v:-1.391},{r:'NEUTRAL',v:2.023},
        {r:'BEAR',v:3.037},{r:'NEUTRAL',v:2.303},{r:'BULL',v:1.402},{r:'BULL',v:-0.884},{r:'NEUTRAL',v:4.703},
        {r:'NEUTRAL',v:-0.385},{r:'BEAR',v:-2.291},{r:'BEAR',v:8.648},{r:'BULL',v:3.783},{r:'BULL',v:1.664}
      ];
      const mc = mo.map(m => m.r === 'BULL' ? '#34d399' : m.r === 'NEUTRAL' ? '#60a5fa' : '#4b5563');

      new Chart(document.getElementById('pg_mo'), {
        type: 'bar',
        data: {
          labels: mo.map((_, i) => 'M' + (i + 1)),
          datasets: [{ data: mo.map(m => m.v), backgroundColor: mc, borderRadius: 3, borderSkipped: false }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display:false }, tooltip: { callbacks: {
            label: c => mo[c.dataIndex].r + ': ' + (c.parsed.y >= 0 ? '+' : '') + c.parsed.y.toFixed(2) + '%'
          }}},
          scales: {
            x: { ticks: { color:tickClr, font:{ family:"'IBM Plex Sans Thai',sans-serif", size:9 }, autoSkip:false, maxRotation:0 }, grid: { display:false } },
            y: { ticks: { color:tickClr, font:bf, callback: v => (v >= 0 ? '+' : '') + v + '%' }, grid: { color:gridClr } }
          }
        }
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // LIVE MONITOR VIEW — paper portfolio, ข้อมูลจาก run_monitor.py
  // ══════════════════════════════════════════════════════════════════
  function dailyPanelHtml(Mo) {
    const D = Mo.daily || [];
    if (!D.length) return "";
    const since = Mo.sinceRebalance || Mo.start;
    const rebalanced = since !== Mo.start;
    const assets = Object.keys(D[0].dayPct || {});
    const pctColor = (v) => v > 0 ? "var(--pos)" : v < 0 ? "var(--neg)" : "var(--tx-3)";
    const rows = D.map((r) => {
      const cells = assets.map((a) => `<td class="tnum" style="text-align:right;color:${pctColor(r.dayPct[a])}">${r.dayPct[a] > 0 ? "+" : ""}${r.dayPct[a].toFixed(2)}%</td>`).join("");
      return `<tr>
        <td>${esc(r.date)}</td>
        <td class="tnum" style="text-align:right">$${r.eq.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
        <td class="tnum" style="text-align:right;color:${pctColor(r.eqDayPct)}">${r.eqDayPct > 0 ? "+" : ""}${r.eqDayPct.toFixed(2)}%</td>
        ${cells}
      </tr>`;
    }).join("");
    const head = assets.map((a) => `<th style="text-align:right;color:${ASSET_COLORS[a] || "var(--tx-2)"}">${a} Δ</th>`).join("");
    return `
<div class="panel">
  <div class="panel-h"><h2>รายวัน — equity vs ราคาแต่ละขา (index เริ่ม = 100)</h2>
    <span class="tb-chip" style="margin-left:auto">${rebalanced ? `นับตั้งแต่ rebalance ล่าสุด ${esc(since)}` : `ตั้งแต่เริ่ม ${esc(since)} (ยังไม่เคย rebalance)`}</span>
  </div>
  <div style="height:240px"><canvas id="mon-daily-chart"></canvas></div>
  <div style="overflow-x:auto;margin-top:12px">
    <table style="width:100%;border-collapse:collapse;font-size:11.5px">
      <thead><tr style="color:var(--tx-3);border-bottom:1px solid var(--line)">
        <th style="text-align:left;padding:4px 6px">วันที่</th>
        <th style="text-align:right;padding:4px 6px">Equity</th>
        <th style="text-align:right;padding:4px 6px">Equity Δ</th>
        ${head}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <div style="font-size:11px;color:var(--tx-3);margin-top:8px">Δ = % เปลี่ยนแปลงจากวันก่อนหน้า (ไม่ใช่จากวันเริ่ม) · ราคาปิดรายวัน UTC</div>
</div>`;
  }

  function thresholdsPanelHtml(Mo) {
    const T = Mo.thresholds;
    if (!T) return "";
    const rows = [
      {
        label: "ขาเพี้ยนจากเป้า (band drift)", rule: `> ${T.bandAlertPct}% relative`,
        now: `${T.worstDriftAsset} ${T.maxAbsDriftPct.toFixed(1)}%`,
        breached: T.maxAbsDriftPct > T.bandAlertPct,
      },
      {
        label: "Drawdown จาก peak", rule: `< ${T.ddAlertPct}%`,
        now: `${Mo.dd.toFixed(2)}%`,
        breached: Mo.dd < T.ddAlertPct,
      },
      {
        label: "Correlation ZEC vs BTC (90d)", rule: `> ${T.corrAlert.toFixed(2)}`,
        now: Mo.corr.zec.toFixed(2),
        breached: Mo.corr.zec > T.corrAlert,
      },
      {
        label: "Correlation XRP vs BTC (90d)", rule: `> ${T.corrAlert.toFixed(2)}`,
        now: Mo.corr.xrp.toFixed(2),
        breached: Mo.corr.xrp > T.corrAlert,
      },
      {
        label: "Satellite (MU/SNDK) history review", rule: `ครบ ${T.satReviewDays} วัน`,
        now: `${Mo.corr.satDays}/${T.satReviewDays} วัน`,
        breached: Mo.corr.satDays >= T.satReviewDays,
      },
    ];
    const rowsHtml = rows.map((r) => `
      <tr>
        <td style="padding:6px 8px">${esc(r.label)}</td>
        <td class="tnum" style="padding:6px 8px;color:var(--tx-3)">${esc(r.rule)}</td>
        <td class="tnum" style="padding:6px 8px;text-align:right;font-weight:600;color:${r.breached ? "var(--neg)" : "var(--tx)"}">${esc(r.now)}${r.breached ? " ⚠" : ""}</td>
      </tr>`).join("");
    return `
<div class="panel">
  <div class="panel-h"><h2>🎯 พารามิเตอร์ที่ระบบเฝ้าดู (alert thresholds)</h2></div>
  <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="color:var(--tx-3);border-bottom:1px solid var(--line)">
        <th style="text-align:left;padding:6px 8px">เกณฑ์</th>
        <th style="text-align:left;padding:6px 8px">threshold</th>
        <th style="text-align:right;padding:6px 8px">ค่าปัจจุบัน</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </div>
  <div style="font-size:11px;color:var(--tx-3);margin-top:8px">Rebalance trigger: <b style="color:var(--tx-2)">${esc(T.rebalanceRule)}</b> · alert ด้านบนเป็นแค่สัญญาณเตือนระหว่างเดือน ไม่ใช่ตัวสั่ง rebalance</div>
</div>`;
  }

  function renderMonitor() {
    clearCharts();
    const Mo = window.MONITOR_DATA;
    const main = document.getElementById("main");
    if (!Mo) { main.innerHTML = "<p style='color:var(--tx-3);padding:24px'>monitor_data.js not loaded — รัน python run_monitor.py</p>"; return; }
    const pnlColor = Mo.pnlPct >= 0 ? "var(--pos)" : "var(--neg)";
    const ddColor = Mo.dd < -15 ? "var(--warn)" : "var(--tx)";

    const kpis = `
<div class="kpi-row">
  <div class="kpi"><span>มูลค่าพอร์ต</span><b>$${Mo.eq.toLocaleString("en-US", { minimumFractionDigits: 2 })}</b></div>
  <div class="kpi"><span>กำไร/ขาดทุน</span><b style="color:${pnlColor}">${Mo.pnlPct >= 0 ? "+" : ""}${Mo.pnlPct.toFixed(2)}%</b></div>
  <div class="kpi"><span>Drawdown จาก peak</span><b style="color:${ddColor}">${Mo.dd.toFixed(2)}%</b></div>
  <div class="kpi"><span>Satellite review</span><b>${Mo.corr.satDays}/180 วัน</b></div>
</div>`;

    const alertsHtml = Mo.alerts.length
      ? `<div style="background:color-mix(in oklch,var(--neg) 8%,var(--panel));border:1px solid color-mix(in oklch,var(--neg) 30%,transparent);border-radius:var(--r);padding:12px 16px;font-size:12.5px;color:var(--tx-2)">
           <b style="color:var(--neg)">🚨 ${Mo.alerts.length} alert</b><br>${Mo.alerts.map(esc).join("<br>")}
         </div>`
      : `<div style="background:color-mix(in oklch,var(--pos) 7%,var(--panel));border:1px solid color-mix(in oklch,var(--pos) 25%,transparent);border-radius:var(--r);padding:12px 16px;font-size:12.5px;color:var(--tx-2)">✅ ไม่มี alert — ทุกอย่างอยู่ในเกณฑ์</div>`;

    const legsHtml = Mo.legs.map((g) => {
      const over = g.drift > 0;
      const barColor = over ? "var(--warn)" : "#38bdf8";
      return `<div style="display:grid;grid-template-columns:56px 1fr 170px;gap:10px;align-items:center;margin:8px 0">
        <b>${g.asset}</b>
        <div style="height:14px;background:var(--bg-2);border:1px solid var(--line);border-radius:5px;position:relative;overflow:hidden">
          <div style="position:absolute;left:0;top:0;bottom:0;width:${Math.min(100, g.weight)}%;background:${barColor}"></div>
          <div style="position:absolute;top:-2px;bottom:-2px;width:2px;background:var(--tx);opacity:.6;left:${g.target}%"></div>
        </div>
        <div class="tnum" style="font-size:11.5px;color:var(--tx-2);text-align:right">${g.weight.toFixed(1)}% / เป้า ${g.target}% (${g.drift > 0 ? "+" : ""}${g.drift.toFixed(1)}%)</div>
      </div>`;
    }).join("");

    const reb = Mo.isNewMonth
      ? `<div style="font-size:11.5px;color:var(--warn);margin-top:8px">📅 ต้นเดือน — แผน rebalance: ${Mo.rebalanceLines.length ? Mo.rebalanceLines.map(esc).join(" · ") : "ทุกขาใกล้เป้าอยู่แล้ว ไม่ต้องปรับ"}</div>`
      : "";

    main.innerHTML = `
${kpis}
${alertsHtml}
${thresholdsPanelHtml(Mo)}
<div class="panel">
  <div class="panel-h"><h2>น้ำหนักปัจจุบัน vs เป้า (ขีดขาว = เป้า)</h2>
    <span class="tb-chip" style="margin-left:auto">DCA งวดนี้ → <b style="color:var(--pos)">${esc(Mo.dcaHint)}</b> (${Mo.dcaHintPct.toFixed(1)}%)</span>
  </div>
  ${legsHtml}
  <div style="font-size:11.5px;color:var(--tx-3);margin-top:4px">corr 90d vs BTC: ZEC ${Mo.corr.zec.toFixed(2)} · XRP ${Mo.corr.xrp.toFixed(2)} · MU/SNDK history ${Mo.corr.satDays}d/180d</div>
  ${reb}
</div>
<div class="panel">
  <div class="panel-h"><h2>Equity (paper) — log จากทุกครั้งที่ monitor รัน</h2>
    <span class="tb-chip" style="margin-left:auto">เริ่ม ${esc(Mo.start)} · $${Mo.startCap.toLocaleString()}</span>
  </div>
  <div style="height:220px"><canvas id="mon-chart"></canvas></div>
</div>
${dailyPanelHtml(Mo)}
<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:14px 18px;font-size:11.5px;color:var(--tx-3);line-height:1.7">
รันล่าสุด ${esc(Mo.generated)} · รัน <b style="color:var(--tx-2)">python run_monitor.py</b> เพื่ออัปเดต (scheduled task สำรองรันทุกจันทร์ 08:00) ·
ระบบไม่ส่งคำสั่งซื้อขายจริงเด็ดขาด — เงินจริงคุณกดเองเสมอ · ไม่ใช่คำแนะนำการลงทุน
</div>`;

    setTimeout(() => {
      const el = document.getElementById("mon-chart");
      if (!el || !window.Chart) return;
      // กัน "Canvas is already in use" — ถ้า render() ถูกเรียกซ้ำเร็วๆ (เช่นคลิกเมนูรัว) canvas ตัวเดิมอาจยังมี Chart เก่าติดอยู่
      const prevCh = window.Chart.getChart(el);
      if (prevCh) prevCh.destroy();
      const runs = Mo.runs || [];
      const ch = new Chart(el.getContext("2d"), {
        type: "line",
        data: {
          labels: runs.map((r) => r.t.slice(5, 16)),
          datasets: [{ label: "equity", data: runs.map((r) => r.eq), borderColor: "#34d399", backgroundColor: "rgba(52,211,153,.08)", fill: true, pointRadius: 0, tension: .25, borderWidth: 2 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { grid: { color: "rgba(255,255,255,0.06)" }, ticks: { color: "#9aa3b5", callback: (v) => "$" + Number(v).toLocaleString() } },
            x: { grid: { display: false }, ticks: { color: "#646d80", maxTicksLimit: 10 } },
          },
        },
      });
      liveCharts.push(ch);

      const D = Mo.daily || [];
      const el2 = document.getElementById("mon-daily-chart");
      if (el2 && window.Chart && D.length) {
        const assets = Object.keys(D[0].dayPct || {});
        const idx = (getVal) => {
          let acc = 100;
          return D.map((r, i) => { if (i > 0) acc *= (1 + getVal(r) / 100); return +acc.toFixed(3); });
        };
        const datasets = [
          { label: "Equity", data: idx((r) => r.eqDayPct), borderColor: "#e5e7eb", backgroundColor: "transparent", borderWidth: 3, pointRadius: 2, tension: .2 },
          ...assets.map((a) => ({
            label: a, data: idx((r) => r.dayPct[a]), borderColor: ASSET_COLORS[a] || "#888",
            backgroundColor: "transparent", borderWidth: 1.5, pointRadius: 1.5, borderDash: [4, 2], tension: .2,
          })),
        ];
        const prevCh2 = window.Chart.getChart(el2);
        if (prevCh2) prevCh2.destroy();
        const ch2 = new Chart(el2.getContext("2d"), {
          type: "line",
          data: { labels: D.map((r) => r.date.slice(5)), datasets },
          options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            plugins: { legend: { display: true, position: "top", labels: { color: "#9aa3b5", boxWidth: 12, font: { size: 10.5 } } } },
            scales: {
              y: { grid: { color: "rgba(255,255,255,0.06)" }, ticks: { color: "#9aa3b5", callback: (v) => v.toFixed(0) } },
              x: { grid: { display: false }, ticks: { color: "#646d80" } },
            },
          },
        });
        liveCharts.push(ch2);
      }
    }, 0);
  }

  // ══════════════════════════════════════════════════════════════════
  // PORTFOLIO MIX VIEW — uncorrelated assets · 2026-07-05
  // ══════════════════════════════════════════════════════════════════
  function renderPortfolio() {
    clearCharts();
    const P = window.BT_PORTFOLIO;
    const main = document.getElementById("main");
    if (!P) { main.innerHTML = "<p style='color:var(--tx-3);padding:24px'>portfolio_data.js not loaded — รัน python run_portfolio_opt.py</p>"; return; }
    const f1 = (v) => (v > 0 ? "+" : "") + v.toFixed(1);
    const f2 = (v) => v.toFixed(2);
    const pc = (v) => v > 0 ? "var(--pos)" : v < 0 ? "var(--neg)" : "var(--tx-3)";
    const best = P.best, pr = P.params;

    const banner = `
<div style="background:color-mix(in oklch,var(--pos) 8%,var(--panel));border:1px solid color-mix(in oklch,var(--pos) 25%,transparent);border-radius:var(--r);padding:16px 20px">
  <div style="font-size:13px;font-weight:600;margin-bottom:10px">🧬 Best Portfolio Setup — ${esc(best.label)}${best.regime ? " + regime" : ""} <span style="font-weight:400;color:var(--tx-3)">(เลือกจาก IS Sharpe top-15 → validate ด้วย OOS)</span></div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
    <div style="background:var(--bg-2);border-radius:6px;padding:12px">
      <div style="font-size:10px;color:var(--tx-3);text-transform:uppercase">IS Sharpe → OOS Sharpe</div>
      <div style="font-family:var(--mono);font-size:19px;font-weight:600;color:var(--pos);margin-top:3px">${f2(best.is.sharpe)} → ${f2(best.oos.sharpe)}</div>
      <div style="font-size:10.5px;color:var(--tx-2);margin-top:2px">ตัวเดียวใน top-5 IS ที่รอด OOS</div>
    </div>
    <div style="background:var(--bg-2);border-radius:6px;padding:12px">
      <div style="font-size:10px;color:var(--tx-3);text-transform:uppercase">CAGR (ทั้งช่วง)</div>
      <div style="font-family:var(--mono);font-size:19px;font-weight:600;color:${pc(best.all.cagr)};margin-top:3px">${f1(best.all.cagr)}%</div>
      <div style="font-size:10.5px;color:var(--tx-2);margin-top:2px">total ${f1(best.all.total)}%</div>
    </div>
    <div style="background:var(--bg-2);border-radius:6px;padding:12px">
      <div style="font-size:10px;color:var(--tx-3);text-transform:uppercase">Max Drawdown</div>
      <div style="font-family:var(--mono);font-size:19px;font-weight:600;color:var(--warn);margin-top:3px">−${best.all.max_dd.toFixed(1)}%</div>
      <div style="font-size:10.5px;color:var(--tx-2);margin-top:2px">vs BTC HODL −53%</div>
    </div>
    <div style="background:var(--bg-2);border-radius:6px;padding:12px">
      <div style="font-size:10px;color:var(--tx-3);text-transform:uppercase">Sortino / Calmar</div>
      <div style="font-family:var(--mono);font-size:19px;font-weight:600;color:var(--pos);margin-top:3px">${f2(best.all.sortino)} / ${f2(best.all.calmar)}</div>
      <div style="font-size:10.5px;color:var(--tx-2);margin-top:2px">rf ${(pr.rf*100).toFixed(0)}% · cost ${pr.cost_bps}bps</div>
    </div>
  </div>
  <div style="font-size:11.5px;color:var(--warn);margin-top:10px">⚠ ผลส่วนใหญ่มาจาก ZEC pump ปลายปี 2025 (idiosyncratic event) — อย่า extrapolate CAGR ระดับนี้ไปอนาคต · ${esc(P.corr_note)}</div>
</div>`;

    const chips = `
<div class="chips" style="margin:2px 0">
  <span class="chip"><i>DATA</i> ${esc(pr.data)}</span>
  <span class="chip"><i>REBAL</i> ${esc(pr.rebalance)}</span>
  <span class="chip"><i>IS/OOS</i> ${pr.is_days}d / ${pr.oos_days}d</span>
  <span class="chip"><i>REGIME</i> ${esc(pr.regime)}</span>
  <span class="chip"><i>SELECT</i> ${esc(pr.selection)}</span>
  <span class="chip"><i>RUN</i> ${esc(P.generated)}</span>
</div>`;

    // รวม top15_is (Binance crypto) เข้ากับ BTC+TradFi แบบ "fair compare" — บีบให้อยู่ในหน้าต่างเวลาเดียวกับ core เป๊ะ
    // (2024-04-27 ~ 2026-07-05, IS/OOS แบ่งที่ 2025-07-05 เหมือนกันทุกตัวอักษร) เทียบ Sharpe ตรงๆ ได้จริงรอบนี้
    const F = window.BTC_TRADFI_FAIR;
    let yahooRows = [];
    if (F) {
      const seenBase = new Set();
      for (const r of F.results) {
        const base = r.label.split("+ ")[1].split(" ")[0];
        if (seenBase.has(base)) continue;
        seenBase.add(base);
        yahooRows.push({ label: r.label, regime: false, is: r.is, oos: r.oos, all: r.all, _yahoo: true });
        if (yahooRows.length >= 10) break;
      }
    }
    const merged = [...P.top15_is.map((r) => ({ ...r, _yahoo: false })), ...yahooRows]
      .map((r) => ({ ...r, _consist: Math.min(r.is.sharpe, r.oos.sharpe) }))
      .sort((a, b) => b._consist - a._consist)
      .slice(0, 20);
    const bestConsist = Math.max(...merged.map((r) => r._consist));

    const rows = merged.map((r, i) => {
      const isBest = r.label === best.label && r.regime === best.regime;
      const isMostConsistent = r._consist === bestConsist;
      const oosOk = r.oos.sharpe > 0.5;
      return `<tr${isBest ? " style='background:color-mix(in oklch,var(--pos) 7%,transparent)'" : r._yahoo ? " style='background:color-mix(in oklch,#38bdf8 5%,transparent)'" : ""}>
        <td class="tnum" style="color:var(--tx-3)">${i + 1}</td>
        <td style="font-weight:${isBest ? 600 : 400}">${isBest ? "⭐ " : ""}${isMostConsistent && !isBest ? "🏆 " : ""}${esc(r.label)}${r.regime ? " <span class='reason'>regime</span>" : ""}${r._yahoo ? " <span class='reason' style='color:#38bdf8'>Yahoo</span>" : ""}</td>
        <td class="tnum">${f2(r.is.sharpe)}</td>
        <td class="tnum" style="color:${pc(r.is.cagr)}">${f1(r.is.cagr)}%</td>
        <td class="tnum sep" style="color:${oosOk ? "var(--pos)" : "var(--neg)"};font-weight:600">${f2(r.oos.sharpe)}</td>
        <td class="tnum" style="color:${pc(r.oos.cagr)}">${f1(r.oos.cagr)}%</td>
        <td class="tnum" style="color:var(--warn)">−${Math.abs(r.oos.max_dd).toFixed(1)}%</td>
        <td class="tnum" style="color:${r._consist > 1 ? "var(--pos)" : r._consist > 0 ? "var(--tx)" : "var(--neg)"};font-weight:${isMostConsistent ? 700 : 400}">${f2(r._consist)}</td>
        <td class="tnum">${f2(r.all.sortino)}</td>
      </tr>`;
    }).join("");

    const benchRows = P.benchmarks.map((b) => `<tr>
        <td class="tnum" style="color:var(--tx-3)">—</td>
        <td style="color:var(--tx-2)">${esc(b.label)}</td>
        <td class="tnum">${f2(b.is.sharpe)}</td>
        <td class="tnum" style="color:${pc(b.is.cagr)}">${f1(b.is.cagr)}%</td>
        <td class="tnum sep" style="color:${pc(b.oos.sharpe)}">${f2(b.oos.sharpe)}</td>
        <td class="tnum" style="color:${pc(b.oos.cagr)}">${f1(b.oos.cagr)}%</td>
        <td class="tnum" style="color:var(--warn)">−${Math.abs(b.oos.max_dd).toFixed(1)}%</td>
        <td class="tnum" style="color:var(--tx-3)">${f2(Math.min(b.is.sharpe, b.oos.sharpe))}</td>
        <td class="tnum">${f2(b.all.sortino)}</td>
      </tr>`).join("");

    const secRows = (P.secondary_1y || []).map((s) => `<tr>
        <td>${esc(s.label)}</td>
        <td class="tnum">${s.days}d</td>
        <td class="tnum" style="color:${pc(s.m.sharpe)}">${f2(s.m.sharpe)}</td>
        <td class="tnum" style="color:${pc(s.m.cagr)}">${f1(s.m.cagr)}%</td>
        <td class="tnum" style="color:var(--warn)">−${s.m.max_dd.toFixed(1)}%</td>
      </tr>`).join("");

    const RM = window.ROBUST_MIX;
    const robustPanel = !RM ? "" : (() => {
      const rows = RM.rows.map((r) => {
        const isCur = r.label.indexOf("ปัจจุบัน") >= 0;
        const isBench = r.label.indexOf("benchmark") >= 0;
        const keepColor = r.keep_pct >= 55 ? "var(--pos)" : r.keep_pct >= 40 ? "var(--warn)" : "var(--neg)";
        const bg = isCur ? "background:color-mix(in oklch,var(--warn) 10%,transparent)" : (isBench ? "opacity:.72" : "");
        return `<tr style="${bg}">
          <td>${isCur ? "▶ " : ""}${esc(r.label)}<div class="reason" style="color:var(--tx-3)">${esc(r.legs.join(" + "))}</div></td>
          <td class="tnum">${r.sharpe_h1.toFixed(2)}</td>
          <td class="tnum">${r.sharpe_h2.toFixed(2)}</td>
          <td class="tnum">${r.cagr.toFixed(1)}%</td>
          <td class="tnum" style="color:var(--warn)">${r.dd.toFixed(1)}%</td>
          <td class="tnum">${r.total.toFixed(1)}%</td>
          <td class="tnum" style="color:${keepColor};font-weight:600">${r.keep_pct.toFixed(0)}%</td>
        </tr>`;
      }).join("");
      return `
<div class="panel" style="margin-bottom:14px">
  <div class="panel-h"><h2>🧪 ชุดทางเลือก — คัดด้วยโครงสร้าง ไม่ใช่ผลตอบแทน</h2>
    <span class="tb-chip" style="margin-left:auto;color:var(--tx-3)">corr กับ BTC &lt; ${RM.corr_max} ทั้งสองครึ่ง · น้ำหนักเท่ากัน · rebalance รายเดือน</span>
  </div>
  <div style="font-size:11.5px;color:var(--tx-2);padding:8px 4px;line-height:1.7">
    วิธีคัดชุดนี้ <b>ไม่ดูผลตอบแทนย้อนหลังเลย</b> — ใช้แค่ corr กับ BTC ที่ต้องต่ำอย่างต่อเนื่องทั้งสองครึ่งของประวัติ
    (ถ้าคัดด้วยผลตอบแทน = ทำผิดแบบเดิมซ้ำ) แล้วให้น้ำหนักเท่ากันทุกขา ไม่จูน<br>
    <b>ผ่านเกณฑ์ ${RM.passed.length} ตัว:</b> ${esc(RM.passed.join(", "))}
    <span style="color:var(--neg)"> · XRP ถูกคัดออก (corr 0.52 → 0.81 พุ่งขึ้นในครึ่งหลัง)</span>
  </div>
  <div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>ชุด</th><th>Sharpe ครึ่งแรก</th><th>Sharpe ครึ่งหลัง</th><th>CAGR</th><th>Max DD</th><th>ผลรวม</th><th>เหลือหลังตัดช่วงพีค</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
  <div style="font-size:11.5px;color:var(--tx-3);padding:10px 4px 2px;line-height:1.7">
    <b>"เหลือหลังตัดช่วงพีค"</b> = ถ้าตัดช่วง 30 วันที่ขาแรงสุดวิ่งดีที่สุดออก จะเหลือผลตอบแทนกี่ % ของเดิม —
    <span style="color:var(--pos)">สูง = ไม่พึ่งโชคก้อนเดียว</span> · <span style="color:var(--neg)">ต่ำกว่า 50% = ผลมาจากเหตุการณ์เดียวเป็นหลัก</span><br>
    ⚠ สังเกต: กระจายมากขึ้นทำให้ผลตอบแทน<b>ลดลงชัดเจน</b> (810% → 92%) แต่ความทนต่อการตัดช่วงพีคดีขึ้นแค่นิดเดียว (33% → 43%)
    — เพราะ crypto เกือบทุกตัวพึ่งเหตุการณ์พุ่งเหมือนกันหมด · ทองเป็นตัวเดียวที่ทนได้จริง (62%) และ DD ต่ำสุด
  </div>
</div>`;
    })();

    const SS = window.STRESS_SIZING;
    const driverPanel = !SS ? "" : (() => {
      const rows = SS.mix_rows.map((r) => {
        const isCur = r.label.indexOf("ปัจจุบัน") >= 0;
        const isBench = r.label.indexOf("benchmark") >= 0;
        const kc = r.keep_pct >= 60 ? "var(--pos)" : r.keep_pct >= 45 ? "var(--warn)" : "var(--neg)";
        const bg = isCur ? "background:color-mix(in oklch,var(--warn) 10%,transparent)" : (isBench ? "opacity:.72" : "");
        const wtxt = Object.entries(r.weights).map(([k, v]) => `${k} ${v}%`).join(" · ");
        return `<tr style="${bg}">
          <td>${isCur ? "▶ " : ""}${esc(r.label)}<div class="reason" style="color:var(--tx-3)">${esc(wtxt)}</div></td>
          <td class="tnum">${r.sharpe_h1.toFixed(2)}</td>
          <td class="tnum">${r.sharpe_h2.toFixed(2)}</td>
          <td class="tnum">${r.cagr.toFixed(1)}%</td>
          <td class="tnum" style="color:var(--warn)">${r.dd.toFixed(1)}%</td>
          <td class="tnum">${r.total.toFixed(1)}%</td>
          <td class="tnum" style="color:${kc};font-weight:600">${r.keep_pct.toFixed(0)}%</td>
        </tr>`;
      }).join("");
      return `
<div class="panel" style="margin-bottom:14px">
  <div class="panel-h"><h2>🌐 กระจายข้าม driver จริง — crypto / ทอง / หุ้น / พันธบัตร</h2>
    <span class="tb-chip" style="margin-left:auto;color:var(--tx-3)">${esc(SS.window[0])} → ${esc(SS.window[1])} · น้ำหนักเท่ากันในกลุ่ม · rebalance รายเดือน</span>
  </div>
  <div style="font-size:11.5px;color:var(--tx-2);padding:8px 4px;line-height:1.7">
    ต่างจากตารางบน: ตารางบนกระจายใน crypto ด้วยกัน (ไม่ช่วย) — ตารางนี้กระจายข้าม<b>แหล่งที่มาของผลตอบแทนที่ต่างกันจริง</b>
    เพิ่มหุ้น (SPY/QQQ) และพันธบัตร (TLT) เข้ามา ซึ่งไม่ได้ขึ้นลงตามรอบ crypto
  </div>
  <div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>ชุด</th><th>Sharpe ครึ่งแรก</th><th>Sharpe ครึ่งหลัง</th><th>CAGR</th><th>Max DD</th><th>ผลรวม</th><th>เหลือหลังตัดช่วงพีค</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
  <div style="font-size:11.5px;color:var(--tx-3);padding:10px 4px 2px;line-height:1.7">
    <b style="color:var(--pos)">อันนี้ได้ผลจริง</b> — ต่างจากการกระจายใน crypto: ยิ่งเพิ่มหุ้น/พันธบัตร ความทนต่อการตัดช่วงพีคดีขึ้นชัดเจน
    (16% → 37% → 47% → 52% → 66% → 77%) และ DD ลดจาก −37% เหลือ −11%<br>
    ราคาที่จ่าย: ผลตอบแทนรวมลดจาก 1,068% เหลือ 70% — <b>เป็นการแลกที่หลีกเลี่ยงไม่ได้ ไม่ใช่ปัญหาที่แก้ได้</b>
    ต้องเลือกเองว่าอยู่จุดไหนบนเส้นนี้
  </div>
</div>`;
    })();

    const FD = window.FOUR_DRIVER;
    const fourPanel = !FD ? "" : (() => {
      const cs = FD.corr_syms;
      const cell = (v) => {
        const a = Math.abs(v);
        const col = a < 0.2 ? "var(--pos)" : a < 0.5 ? "var(--tx-2)" : "var(--neg)";
        return `<td class="tnum" style="color:${col}">${v.toFixed(2)}</td>`;
      };
      const corrTbl = `<table class="tbl" style="font-size:11px">
        <thead><tr><th></th>${cs.map((s) => `<th>${esc(s)}</th>`).join("")}</tr></thead>
        <tbody>${cs.map((a) => `<tr><td style="font-weight:600">${esc(a)}</td>${cs.map((b) => cell(FD.corr[a][b])).join("")}</tr>`).join("")}</tbody>
      </table>`;
      const rows = FD.rows.map((r) => {
        const isCur = r.label.indexOf("ปัจจุบัน") >= 0;
        const isBench = r.label.indexOf("เดี่ยว") >= 0;
        const kc = r.keep_pct >= 65 ? "var(--pos)" : r.keep_pct >= 45 ? "var(--warn)" : "var(--neg)";
        const bg = isCur ? "background:color-mix(in oklch,var(--warn) 10%,transparent)"
          : (r.keep_pct >= 75 ? "background:color-mix(in oklch,var(--pos) 8%,transparent)" : (isBench ? "opacity:.72" : ""));
        const wtxt = Object.entries(r.weights).map(([k, v]) => `${k} ${v}%`).join(" · ");
        return `<tr style="${bg}">
          <td>${isCur ? "▶ " : ""}${esc(r.label)}<div class="reason" style="color:var(--tx-3)">${esc(wtxt)}</div></td>
          <td class="tnum">${r.sharpe_h1.toFixed(2)}</td><td class="tnum">${r.sharpe_h2.toFixed(2)}</td>
          <td class="tnum">${r.cagr.toFixed(1)}%</td>
          <td class="tnum" style="color:var(--warn)">${r.dd.toFixed(1)}%</td>
          <td class="tnum">${r.total.toFixed(1)}%</td>
          <td class="tnum" style="color:${kc};font-weight:600">${r.keep_pct}%</td>
        </tr>`;
      }).join("");
      return `
<div class="panel" style="margin-bottom:14px">
  <div class="panel-h"><h2>🛢️ 4 driver — ทอง + crypto + หุ้น + น้ำมัน</h2>
    <span class="tb-chip" style="margin-left:auto;color:var(--tx-3)">${esc(FD.window[0])} → ${esc(FD.window[1])}</span>
  </div>
  <div style="font-size:11.5px;color:var(--tx-2);padding:8px 4px 4px">Correlation — <span style="color:var(--pos)">เขียว = ต่ำกว่า 0.2 (กระจายดี)</span> · <span style="color:var(--neg)">แดง = เกิน 0.5 (ไม่ช่วย)</span></div>
  <div class="tbl-wrap">${corrTbl}</div>
  <div style="font-size:11.5px;color:var(--tx-2);padding:10px 4px;line-height:1.7">
    <b style="color:var(--pos)">น้ำมัน (USO) แทบไม่มี correlation กับอะไรเลย</b> — BTC −0.03 · ZEC −0.05 · ทอง 0.04 · หุ้น −0.01 · พันธบัตร −0.22
    เป็นตัวกระจายที่ดีที่สุดในตาราง · <span style="color:var(--tx-3)">SPY กับ QQQ corr 0.95 — เลือกตัวไหนแทบไม่ต่างกัน</span>
  </div>
  <div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>ชุด</th><th>Sharpe ครึ่งแรก</th><th>Sharpe ครึ่งหลัง</th><th>CAGR</th><th>Max DD</th><th>ผลรวม</th><th>เหลือหลังตัดช่วงพีค</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
  <div style="font-size:11.5px;color:var(--tx-3);padding:10px 4px 2px;line-height:1.8">
    <b style="color:var(--pos)">เติมน้ำมันแล้วดีขึ้นทุกด้านพร้อมกัน</b> (หายาก): fragility 65%→72% · DD −19.3%→−17.1% · Sharpe ครึ่งหลัง 0.60→1.16<br>
    <b style="color:var(--neg)">⚠ จุดที่ต้องระวัง — เลือก crypto ตัวไหนเปลี่ยนผลมหาศาล:</b> ใช้ BTC ได้ผลรวม 104% fragility 72% ·
    ใช้ ZEC ได้ 482% แต่ fragility ตกเหลือ 30% — กับดักเดิมกลับมา ถ้าเลือก ZEC เพราะมันเคยวิ่ง คือเลือกผู้ชนะจากอดีตอีกรอบ<br>
    <span style="color:var(--tx-3)">น้ำมันเดี่ยวๆ แย่มาก (fragility 6%, DD −32.5%) แต่พอผสมกลับช่วย — คลาสสิกของการกระจายความเสี่ยง</span>
  </div>
</div>`;
    })();

    main.innerHTML = `
${banner}
${chips}
${robustPanel}
${driverPanel}
${fourPanel}
<div class="panel">
  <div class="panel-h"><h2>Equity Curves — best vs benchmarks (เริ่ม ${esc(P.curves.dates[0])})</h2>
    ${P.is_oos ? `<span class="tb-chip"><span>IS/OOS แบ่งที่</span> ${esc(P.is_oos.boundary_date)}</span>` : ""}
    <span class="tb-chip" style="margin-left:auto;color:var(--tx-3)">scroll/pinch = zoom · ลาก = pan</span>
    <button id="pf-chart-reset-zoom" class="tb-chip" style="cursor:pointer;border:1px solid var(--line);background:var(--bg-2)">↺ Reset zoom</button>
  </div>
  <div style="height:380px"><canvas id="pf-chart"></canvas></div>
  <div style="font-size:11px;color:var(--tx-3);padding:6px 2px 0">เส้นเริ่มต้นโชว์แค่ตัวหลัก (core/benchmark/⭐Best v2/SKHYNIX) — คลิกชื่อเส้นในตำนาน (legend) ด้านบนกราฟเพื่อโชว์/ซ่อนเส้นอื่นเพิ่ม</div>
</div>
${P.asset_prices ? `
<div class="panel">
  <div class="panel-h"><h2>ราคาสินทรัพย์รายตัว (normalized 1x ที่วันเริ่ม) — ดูว่า equity ข้างบนมาจากตัวไหน</h2>
    <span class="tb-chip" style="margin-left:auto"><span>SCALE</span> log เท่ากับกราฟบน</span>
  </div>
  <div style="height:260px"><canvas id="pf-asset-chart"></canvas></div>
  <div style="font-size:11px;color:var(--tx-3)">${esc(P.asset_prices.note)} · แกนเวลาตรงกับกราฟ equity ด้านบน วางเทียบบรรทัดต่อบรรทัดได้เลย</div>
</div>` : ""}
${P.regime_compare ? (() => {
  const R = P.regime_compare;
  const MODE_META = {
    plain:  ["ถือตลอด (plain)", "var(--tx-2)", "monthly rebalance เท่านั้น"],
    sma200: ["SMA200 filter", "#38bdf8", "BTC > SMA200 else cash ทั้งพอร์ต"],
    engine: ["Regime Engine (อ่าน BTC)", "#f472b6", esc(R.expo_rule)],
    engine_pf: ["Regime Engine (อ่านพอร์ตเอง)", "#f97316", "logic เดิมเป๊ะ แต่ป้อน weekly closes ของ weighted index XRP/ZEC/PAXG แทน BTC"],
    engine_zec: ["ZEC-filter (gate เฉพาะขา ZEC)", "#a3e635", "XRP/PAXG ถือตลอด · ขา ZEC gate ด้วย engine ที่อ่าน ZEC เอง"],
    engine_asset: ["Per-asset (gate ทุกขา)", "#e879f9", "ทุกขา gate ด้วย engine ที่อ่านสินทรัพย์ตัวเอง"],
  };
  // 🏆 = consistency: min(IS, OOS) Sharpe สูงสุด — กันโหมดที่ดีข้างเดียว (เช่น OOS ดีแต่ IS พัง)
  const consist = (r) => Math.min(r.is.sharpe, r.oos.sharpe);
  const bestConsist = Math.max(...R.rows.map(consist));
  const modeRows = R.rows.map(r => {
    const [nm, clr, sub] = MODE_META[r.mode] || [r.mode, "var(--tx)", ""];
    const win = consist(r) === bestConsist;
    return `<tr${win ? " style='background:color-mix(in oklch,var(--pos) 6%,transparent)'" : ""}>
      <td><div style="font-weight:600;color:${clr}">${win ? "🏆 " : ""}${nm}</div><div style="font-size:10px;color:var(--tx-3)">${sub}</div></td>
      <td class="tnum">${f2(r.is.sharpe)}</td>
      <td class="tnum" style="color:${pc(r.is.cagr)}">${f1(r.is.cagr)}%</td>
      <td class="tnum sep" style="font-weight:600;color:${r.oos.sharpe > 0.5 ? "var(--pos)" : "var(--neg)"}">${f2(r.oos.sharpe)}</td>
      <td class="tnum" style="color:${pc(r.oos.cagr)}">${f1(r.oos.cagr)}%</td>
      <td class="tnum" style="color:var(--warn)">−${r.oos.max_dd.toFixed(1)}%</td>
      <td class="tnum" style="color:${pc(r.all.cagr)}">${f1(r.all.cagr)}%</td>
      <td class="tnum" style="color:var(--warn)">−${r.all.max_dd.toFixed(1)}%</td>
      <td class="tnum">${f2(r.all.calmar)}</td>
    </tr>`;
  }).join("");
  const regClr = { BULL: "var(--pos)", NEUTRAL: "#f59e0b", BEAR: "var(--neg)" };
  const monthChips = R.months.map(m =>
    `<span title="${m.month} · score ${m.score}" style="width:13px;height:13px;border-radius:3px;flex:none;display:inline-block;background:${regClr[m.regime]};opacity:${m.oos ? 1 : 0.45}"></span>`).join("");
  return `
<div class="matrix-wrap">
  <div style="padding:12px 16px;border-bottom:1px solid var(--line)">
    <div style="font-size:14px;font-weight:600">Regime Comparison — ${esc(R.mix)}</div>
    <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono);margin-top:2px">plain vs SMA200 vs Monthly Regime Engine (จาก regime.py ตัวเต็ม) · 🏆 = min(IS,OOS) Sharpe สูงสุด (consistency ไม่ใช่ OOS อย่างเดียว) · run ${esc(R.generated)}</div>
  </div>
  <div class="tbl-wrap" style="border:0;border-radius:0">
  <table class="tbl hist">
    <thead><tr><th>Mode</th><th>IS Shp</th><th>IS CAGR</th><th class="sep">OOS Shp</th><th>OOS CAGR</th><th>OOS DD</th><th>ALL CAGR</th><th>ALL DD</th><th>Calmar</th></tr></thead>
    <tbody>${modeRows}</tbody>
  </table>
  </div>
  <div style="padding:11px 16px;border-top:1px solid var(--line);display:flex;align-items:center;gap:10px;flex-wrap:wrap">
    <span style="font-size:11px;color:var(--tx-3)">Regime รายเดือน — <b style="color:#f472b6">อ่าน BTC</b> (จางคือ IS · เข้มคือ OOS):</span>
    <div style="display:flex;gap:3px;flex-wrap:wrap">${monthChips}</div>
    <span style="font-size:11px;font-family:var(--mono);color:var(--tx-3);margin-left:auto">
      <span style="color:var(--pos)">BULL ${R.regime_counts.BULL || 0}</span> ·
      <span style="color:#f59e0b">NEUTRAL ${R.regime_counts.NEUTRAL || 0}</span> ·
      <span style="color:var(--neg)">BEAR ${R.regime_counts.BEAR || 0}</span> เดือน
    </span>
  </div>
  ${R.months_pf ? (() => {
    const chipsPf = R.months_pf.map(m =>
      `<span title="${m.month} · score ${m.score}" style="width:13px;height:13px;border-radius:3px;flex:none;display:inline-block;background:${regClr[m.regime]};opacity:${m.oos ? 1 : 0.45}"></span>`).join("");
    const c = R.regime_counts_pf || {};
    return `<div style="padding:11px 16px;border-top:1px solid var(--line);display:flex;align-items:center;gap:10px;flex-wrap:wrap">
    <span style="font-size:11px;color:var(--tx-3)">Regime รายเดือน — <b style="color:#f97316">อ่านพอร์ตเอง</b>:</span>
    <div style="display:flex;gap:3px;flex-wrap:wrap">${chipsPf}</div>
    <span style="font-size:11px;font-family:var(--mono);color:var(--tx-3);margin-left:auto">
      <span style="color:var(--pos)">BULL ${c.BULL || 0}</span> ·
      <span style="color:#f59e0b">NEUTRAL ${c.NEUTRAL || 0}</span> ·
      <span style="color:var(--neg)">BEAR ${c.BEAR || 0}</span> เดือน
    </span>
  </div>`;
  })() : ""}
  ${R.months_zec ? (() => {
    const chipsZ = R.months_zec.map(m =>
      `<span title="${m.month} · score ${m.score}" style="width:13px;height:13px;border-radius:3px;flex:none;display:inline-block;background:${regClr[m.regime]};opacity:${m.oos ? 1 : 0.45}"></span>`).join("");
    const c = R.regime_counts_zec || {};
    return `<div style="padding:11px 16px;border-top:1px solid var(--line);display:flex;align-items:center;gap:10px;flex-wrap:wrap">
    <span style="font-size:11px;color:var(--tx-3)">Regime รายเดือน — <b style="color:#a3e635">ขา ZEC (อ่าน ZEC เอง)</b>:</span>
    <div style="display:flex;gap:3px;flex-wrap:wrap">${chipsZ}</div>
    <span style="font-size:11px;font-family:var(--mono);color:var(--tx-3);margin-left:auto">
      <span style="color:var(--pos)">BULL ${c.BULL || 0}</span> ·
      <span style="color:#f59e0b">NEUTRAL ${c.NEUTRAL || 0}</span> ·
      <span style="color:var(--neg)">BEAR ${c.BEAR || 0}</span> เดือน
    </span>
  </div>`;
  })() : ""}
</div>` })() : ""}
<div style="display:grid;grid-template-columns:1.5fr 1fr;gap:var(--gap)">
  <div class="matrix-wrap">
    <div style="padding:12px 16px;border-bottom:1px solid var(--line)">
      <div style="font-size:14px;font-weight:600">Top 20 by Consistency <span style="font-weight:400;color:var(--tx-3);font-size:11.5px">(รวม BTC+TradFi grid — เรียงตาม min(IS,OOS) ไม่ใช่ IS อย่างเดียวแล้ว)</span></div>
      <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono);margin-top:2px">
        เรียงตามคอลัมน์ <b style="color:var(--pos)">Consist (min)</b> = ค่าต่ำสุดระหว่าง IS กับ OOS Sharpe — แถวบนสุด = ตัวที่ไม่พังตอนเจอข้อมูลใหม่จริง ไม่ใช่แค่ดูดีตอนเทรน <b>🏆 = Consist สูงสุด</b><br>
        เทียบกับถ้าเรียงด้วย IS Shp อย่างเดียว: XRP25+PAXG75 จะขึ้นที่ 1 (IS 2.44 สวยสุด) แต่ Consist แค่ 0.14 (พังตอน OOS) — พอเรียงด้วย Consist มันเลยร่วงลงไปอยู่ท้ายตาราง ส่วนตัวที่ IS ไม่ได้สูงสุดแต่ OOS ไม่พัง (เช่น ⭐ core, SKHYNIX/GLW) ขึ้นมาอยู่บนแทน · แถว <span style="color:#38bdf8">Yahoo</span> = BTC+TradFi หน้าต่างเวลาเดียวกับ core เป๊ะ
      </div>
    </div>
    <div class="tbl-wrap" style="border:0;border-radius:0">
    <table class="tbl hist">
      <thead><tr><th>#</th><th>Setup</th><th>IS Shp</th><th>IS CAGR</th><th class="sep">OOS Shp</th><th>OOS CAGR</th><th>OOS DD</th><th>Consist (min)</th><th>Sortino</th></tr></thead>
      <tbody>${rows}${benchRows}</tbody>
    </table>
    </div>
  </div>
  <div style="display:flex;flex-direction:column;gap:var(--gap)">
    <div class="matrix-wrap">
      <div style="padding:12px 16px;border-bottom:1px solid var(--line)">
        <div style="font-size:14px;font-weight:600">เหรียญใหม่ uncorrelated (1 ปีล่าสุด)</div>
        <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono);margin-top:2px">HYPE/WLD/ZEC/PAXG จับคู่ BTC · ${(P.secondary_1y && P.secondary_1y[0]) ? P.secondary_1y[0].days : "~400"} วัน</div>
      </div>
      <div class="tbl-wrap" style="border:0;border-radius:0">
      <table class="tbl">
        <thead><tr><th>Mix</th><th>Days</th><th>Sharpe</th><th>CAGR</th><th>DD</th></tr></thead>
        <tbody>${secRows}</tbody>
      </table>
      </div>
    </div>
    <div style="background:color-mix(in oklch,#f59e0b 8%,var(--panel));border:1px solid color-mix(in oklch,#f59e0b 25%,transparent);border-radius:var(--r);padding:14px 18px;font-size:12.5px;line-height:1.7;color:var(--tx-2)">
      <b style="color:#f59e0b">สรุปการตัดสินใจ</b><br>
      1. <b style="color:var(--pos)">${esc(best.label)}</b> — OOS Sharpe ${f2(best.oos.sharpe)} ดีกว่า BTC HODL (OOS ${f2(P.benchmarks[0].oos.sharpe)}) ชัดเจน<br>
      2. PAXG (gold) 50% = ตัวลด DD หลัก · ZEC = return driver แต่พึ่ง event เดียว<br>
      3. BTC+ETH+SOL (Phase 0B เดิม) ยังแพ้ทุก setup ใหม่ — สอดคล้อง correlation scan ว่า majors corr กันหมด 0.6-0.86<br>
      4. ก่อนใช้เงินจริง: รอ paper trade + rolling correlation เช็คว่า ZEC ยัง uncorrelated อยู่ไหมหลัง pump
    </div>
  </div>
</div>
${tradfiSectionHtml(P)}
${okxSectionHtml()}
${broadScanSectionHtml()}
${tradfiHedgeSectionHtml()}
${longHistorySectionHtml()}
${btcTradfiOptSectionHtml()}`;

    setTimeout(() => {
     try {
      const el = document.getElementById("pf-chart");
      if (!el || !window.Chart) return;
      // กัน "Canvas is already in use" — ถ้า render() ถูกเรียกซ้ำเร็วๆ canvas ตัวเดิมอาจยังมี Chart เก่าติดอยู่
      const prevCh = window.Chart.getChart(el);
      if (prevCh) prevCh.destroy();
      // หา index ของเส้นแบ่ง IS/OOS บนแกน labels
      let splitIdx = -1;
      if (P.is_oos && P.is_oos.boundary_date) {
        splitIdx = P.curves.dates.findIndex((d) => d >= P.is_oos.boundary_date);
      }
      const isOosDivider = {
        id: "isOosDivider",
        afterDatasetsDraw(chart) {
          if (splitIdx < 0) return;
          const { ctx, chartArea, scales } = chart;
          const x = scales.x.getPixelForValue(splitIdx);
          if (!isFinite(x)) return;
          ctx.save();
          ctx.strokeStyle = "rgba(251,191,36,0.55)";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 5]);
          ctx.beginPath();
          ctx.moveTo(x, chartArea.top);
          ctx.lineTo(x, chartArea.bottom);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.font = "600 10px 'IBM Plex Mono',monospace";
          ctx.fillStyle = "#9aa3b5";
          ctx.textAlign = "right";
          ctx.fillText("◀ IN-SAMPLE", x - 7, chartArea.top + 12);
          ctx.textAlign = "left";
          ctx.fillStyle = "#fbbf24";
          ctx.fillText("OUT-OF-SAMPLE ▶", x + 7, chartArea.top + 12);
          // แรเงาฝั่ง OOS จางๆ
          ctx.fillStyle = "rgba(251,191,36,0.035)";
          ctx.fillRect(x, chartArea.top, chartArea.right - x, chartArea.bottom - chartArea.top);
          ctx.restore();
        },
      };
      const baseOpts = {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: "index", intersect: false },
        scales: {
          y: { type: "logarithmic", grid: { color: "rgba(255,255,255,0.06)" }, ticks: { color: "#9aa3b5", callback: (v) => v + "x" } },
          x: { grid: { display: false }, ticks: { color: "#646d80", maxTicksLimit: 10 } },
        },
        plugins: { legend: { labels: { color: "#9aa3b5", boxWidth: 12, font: { size: 11 } } } },
      };
      // pf-chart เท่านั้น (ไม่แตะ baseOpts เพราะใช้ร่วมกับ pf-asset-chart ด้วย) — เพิ่ม zoom/pan
      const pfChartOpts = {
        ...baseOpts,
        plugins: {
          ...baseOpts.plugins,
          zoom: {
            zoom: { wheel: { enabled: true }, pinch: { enabled: true }, drag: { enabled: false }, mode: "x" },
            pan: { enabled: true, mode: "x" },
            limits: { x: { min: "original", max: "original" } },
          },
        },
      };
      // P.curves.dates เป็นรายสัปดาห์ (ทุกวันเสาร์) แต่ราคาหุ้น/หุ้นจริงจาก OKX/Yahoo เป็นรายวัน (แค่วันเทรด)
      // เทียบแบบ exact-match วันที่จะเจอ 0% overlap เกือบทุกครั้ง (เสาร์ไม่ใช่วันเทรดหุ้น) เส้นเลยว่างเปล่าทั้งเส้น
      // แก้ด้วย as-of lookup: หาค่าล่าสุดที่มีจริง ณ วันหรือก่อนหน้าวันเป้าหมาย (binary search บน dates ที่เรียงแล้ว)
      function asOfLookup(dates, values, target) {
        let lo = 0, hi = dates.length - 1, ans = -1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (dates[mid] <= target) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
        }
        return ans >= 0 ? values[ans] : null;
      }
      // ── เส้น OKX candidate (top 2) แยกออกจาก "Best v2" ตรงวันที่เริ่มมีข้อมูล OKX จริง ──
      // ทำให้เทียบบนกราฟเดียวกันได้: ก่อนวันแยกเป็น null (ไม่มีเส้น) จากนั้นแตกออกจากค่า Best v2 ณ จุดนั้น
      function okxForkDataset(cand, color) {
        const O = window.OKX_SCREEN;
        const bestV2 = P.curves.series.find((s) => s.label.startsWith("⭐ Best v2"));
        if (!O || !bestV2) return null;
        const anchorIdx = P.curves.dates.findIndex((d) => d >= O.window.start);
        if (anchorIdx < 0) return null;
        const anchorVal = bestV2.points[anchorIdx];
        const okxDates = O.curves.dates;
        const data = P.curves.dates.map((d, i) => {
          if (i < anchorIdx) return null;
          if (d < okxDates[0]) return null;
          const v = asOfLookup(okxDates, cand.curve, d);
          return v == null ? null : +(anchorVal * v).toFixed(4);
        });
        return {
          label: `core + ${cand.name} (OKX, แยกจาก ⭐ ที่ ${O.window.start})`,
          data, borderColor: color, backgroundColor: "transparent",
          borderWidth: 2, borderDash: [6, 3], pointRadius: 0, tension: 0.25, spanGaps: true,
        };
      }
      const okxDatasets = window.OKX_SCREEN
        ? window.OKX_SCREEN.candidates_as_satellite.slice(0, 2)
            .map((c, i) => okxForkDataset(c, ["#a78bfa", "#fb923c"][i]))
            .filter(Boolean)
        : [];
      // ── เส้น BTC+TradFi (Yahoo Finance) — normalized 1x เองแล้วตั้งแต่ chart_start ตรงกับแกนเวลาเดียวกัน ──
      function btcTradfiDataset(series, color, dash) {
        const data = P.curves.dates.map((d) => {
          if (d < series.dates[0]) return null;
          return asOfLookup(series.dates, series.values, d);
        });
        return {
          label: `${series.label} (Yahoo)`, data, borderColor: color, backgroundColor: "transparent",
          borderWidth: 2, borderDash: dash, pointRadius: 0, tension: 0.25, spanGaps: true,
        };
      }
      const btcTradfiDatasets = (window.BTC_TRADFI_FAIR && window.BTC_TRADFI_FAIR.chart_series)
        ? window.BTC_TRADFI_FAIR.chart_series.map((s, i) => btcTradfiDataset(s, ["#22d3ee", "#f43f5e", "#eab308", "#84cc16"][i], [3, 2]))
        : [];
      const ch = new Chart(el.getContext("2d"), {
        type: "line",
        data: {
          labels: P.curves.dates,
          datasets: [
            ...P.curves.series.map((s) => {
              const keep = s.label === "XRP 25%+ZEC 25%+PAXG 50%" || s.label === "BTC 100% (HODL)" || s.label.startsWith("⭐ Best v2");
              return {
                label: s.label, data: s.points, borderColor: s.color,
                backgroundColor: "transparent", borderWidth: s.color === "#34d399" ? 2.4 : 1.4,
                pointRadius: 0, tension: 0.25, hidden: !keep,
              };
            }),
            ...okxDatasets.map((d) => ({ ...d, hidden: true })),
            ...btcTradfiDatasets.map((d) => ({ ...d, hidden: !d.label.startsWith("BTC 50% + SKHYNIX 50%") })),
          ],
        },
        options: pfChartOpts,
        plugins: [isOosDivider],
      });
      liveCharts.push(ch);
      const resetZoomBtn = document.getElementById("pf-chart-reset-zoom");
      if (resetZoomBtn) resetZoomBtn.onclick = () => ch.resetZoom();
      // ── กราฟราคาสินทรัพย์รายตัว (แกนเวลาเดียวกัน) ──
      const el2 = document.getElementById("pf-asset-chart");
      if (el2 && P.asset_prices) {
        const prevCh2 = window.Chart.getChart(el2);
        if (prevCh2) prevCh2.destroy();
        // ── ราคาหุ้นที่เลือกจากชุด BTC+TradFi (Yahoo) — normalized 1x เองแล้ว, map ลงแกนรายสัปดาห์ด้วย as-of lookup ──
        const stockPriceDatasets = (window.BTC_TRADFI_FAIR && window.BTC_TRADFI_FAIR.asset_price_series)
          ? window.BTC_TRADFI_FAIR.asset_price_series.map((s, i) => {
              const data = P.curves.dates.map((d) => (d < s.dates[0] ? null : asOfLookup(s.dates, s.values, d)));
              return {
                label: `${s.label} (Yahoo)`, data, borderColor: ["#22d3ee", "#f43f5e", "#eab308", "#84cc16"][i],
                backgroundColor: "transparent", borderWidth: 1.8, borderDash: [5, 3],
                pointRadius: 0, tension: 0.25, spanGaps: true,
              };
            })
          : [];
        const ch2 = new Chart(el2.getContext("2d"), {
          type: "line",
          data: {
            labels: P.curves.dates,
            datasets: [
              ...P.asset_prices.series.map((s) => ({
                label: s.label, data: s.points, borderColor: s.color,
                backgroundColor: "transparent",
                borderWidth: s.label === "BTC" ? 1.2 : 1.8,
                borderDash: s.label === "BTC" ? [4, 4] : [],
                pointRadius: 0, tension: 0.25,
              })),
              ...stockPriceDatasets,
            ],
          },
          options: baseOpts,
          plugins: [isOosDivider],
        });
        liveCharts.push(ch2);
      }
     } catch (err) {
       console.error("pf-chart render error:", err);
       const d = document.createElement("pre");
       d.style.cssText = "position:fixed;top:40px;left:0;right:0;z-index:99999;background:#3a0d0d;color:#ffb4b4;padding:10px;font:11px monospace;white-space:pre-wrap;max-height:40vh;overflow:auto";
       d.textContent = "pf-chart RENDER ERROR: " + (err && err.message) + "\n" + (err && err.stack || "(no stack)");
       document.body.appendChild(d);
     }
    }, 0);
  }

  // ══════════════════════════════════════════════════════════════════
  // LEVERAGE LAB — เทรด core เป็น futures มี leverage · 2026-07-12
  // ══════════════════════════════════════════════════════════════════
  function renderLeverageLab() {
    clearCharts();
    const L = window.LEVERAGE_LAB;
    const main = document.getElementById("main");
    if (!L) {
      main.innerHTML = `<div style="color:var(--tx-3);padding:24px">ยังไม่มีข้อมูล — รัน <b>python run_leverage_lab.py</b> ก่อน</div>`;
      return;
    }
    const f1 = (v) => (v > 0 ? "+" : "") + v.toFixed(1);
    const f2 = (v) => v.toFixed(2);
    const pc = (v) => (v > 0 ? "var(--pos)" : v < 0 ? "var(--neg)" : "var(--tx-3)");

    const disclaimer = `
<div style="background:color-mix(in oklch,var(--neg) 8%,var(--panel));border:1px solid color-mix(in oklch,var(--neg) 30%,transparent);border-radius:var(--r);padding:14px 18px;font-size:12px;line-height:1.7;color:var(--tx-2);margin-bottom:14px">
⚠️ <b style="color:var(--neg)">คำเตือน:</b> ทั้งหน้านี้คือการวิเคราะห์ข้อมูลย้อนหลัง (backtest) เท่านั้น <b>ไม่ใช่คำแนะนำการลงทุน</b> Claude ไม่ใช่ที่ปรึกษาการเงินและไม่บอกว่า leverage เท่าไหร่ "ปลอดภัย" — funding rate ที่ใช้จำลองเป็นค่าประมาณคร่าวๆ (0.03%/วัน) ไม่ใช่ตัวเลขจริงจาก OKX ต้องเช็ค maintenance margin ratio จริงของแต่ละเหรียญบน OKX เองก่อนตัดสินใจ · ข้อมูลย้อนหลังมีแค่ ~${L.window.is_days + L.window.oos_days} วัน (${esc(L.window.start)} ~ ${esc(L.window.end)}) ไม่เคยผ่านช่วง bear market รุนแรงแบบปี 2018/2022
</div>`;

    // ── 1) core + BTC dilution ──
    const dilRows = L.core_btc_dilution.map((r) => `<tr>
        <td class="tnum">${r.w_btc === 0 ? "0% (เดิม)" : r.w_btc + "%"}</td>
        <td class="tnum">${f2(r.is_sharpe)}</td>
        <td class="tnum" style="color:${pc(r.oos_sharpe)}">${f2(r.oos_sharpe)}</td>
        <td class="tnum" style="color:var(--warn)">−${r.oos_dd.toFixed(1)}%</td>
        <td class="tnum" style="font-weight:600;color:${r.consist>1?"var(--pos)":r.consist>0?"var(--tx)":"var(--neg)"}">${f2(r.consist)}</td>
      </tr>`).join("");

    // ── 2) BTC rally capture ──
    const RC = L.rally_capture;
    const rally = RC.best_30d_rally;

    // ── 3) static leverage DD ──
    const ddRows = L.static_leverage_dd.map((r) => `<tr>
        <td class="tnum">${r.leverage.toFixed(1)}x</td>
        <td class="tnum" style="color:var(--warn)">−${r.max_dd.toFixed(1)}%</td>
        <td class="tnum" style="color:var(--neg)">${r.worst_day.toFixed(1)}%</td>
      </tr>`).join("");

    // ── 4) SMA signal test ──
    const smaRows = L.sma_signal_test.rows.map((r) => `<tr${r.label.startsWith("Dynamic") ? " style='background:color-mix(in oklch,var(--neg) 5%,transparent)'" : ""}>
        <td>${esc(r.label)}</td>
        <td class="tnum">${f2(r.is_sharpe)}</td>
        <td class="tnum">${f1(r.is_cagr)}%</td>
        <td class="tnum sep" style="color:${pc(r.oos_sharpe)}">${f2(r.oos_sharpe)}</td>
        <td class="tnum">${f1(r.oos_cagr)}%</td>
        <td class="tnum" style="color:var(--warn)">−${r.oos_dd.toFixed(1)}%</td>
        <td class="tnum" style="font-weight:600">${f2(r.consist)}</td>
      </tr>`).join("");

    // ── 5) vol-target sensitivity ──
    const bestConsistVT = Math.max(...L.vol_target_sensitivity.rows.filter(r => r.target_vol).map(r => r.consist));
    const vtRows = L.vol_target_sensitivity.rows.map((r) => {
      const isStatic = !r.target_vol;
      const isBest = r.consist === bestConsistVT && !isStatic;
      return `<tr${isStatic ? " style='color:var(--tx-3)'" : ""}${isBest && r.tag ? " style='background:color-mix(in oklch,var(--pos) 6%,transparent)'" : ""}>
        <td>${esc(r.label)}${r.tag ? ` <span class="reason" style="color:#38bdf8">${esc(r.tag)}</span>` : ""}</td>
        <td class="tnum">${r.avg_lev.toFixed(2)}x</td>
        <td class="tnum">${f2(r.is_sharpe)}</td>
        <td class="tnum" style="color:var(--warn)">−${r.is_dd.toFixed(1)}%</td>
        <td class="tnum sep" style="color:${pc(r.oos_sharpe)}">${f2(r.oos_sharpe)}</td>
        <td class="tnum" style="color:var(--warn)">−${r.oos_dd.toFixed(1)}%</td>
        <td class="tnum" style="font-weight:${isStatic?400:600}">${f2(r.consist)}</td>
      </tr>`;
    }).join("");

    main.innerHTML = `
${disclaimer}
<div class="chips" style="margin:2px 0 14px">
  <span class="chip"><i>WINDOW</i> ${esc(L.window.start)} ~ ${esc(L.window.end)}</span>
  <span class="chip"><i>IS/OOS</i> ${L.window.is_days}d / ${L.window.oos_days}d</span>
  <span class="chip"><i>RUN</i> ${esc(L.generated)}</span>
</div>

<div class="panel">
  <div class="panel-h"><h2>1️⃣ core เจือ BTC หลายน้ำหนัก — ยิ่งเติมยิ่งแย่ลงไหม?</h2></div>
  <div style="font-size:12px;color:var(--tx-3);padding:0 4px 10px">คำถาม: "ถ้าอันดับ 1 (core ไม่มี BTC) เก็บ BTC ไปด้วยจะยังครองที่ 1 ไหม" — คงสัดส่วน XRP:ZEC:PAXG = 25:25:50 เดิม เจือด้วย BTC ที่น้ำหนักต่างๆ</div>
  <div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>BTC ที่เจือ</th><th>IS Sharpe</th><th>OOS Sharpe</th><th>OOS DD</th><th>Consist (min)</th></tr></thead>
    <tbody>${dilRows}</tbody>
  </table></div>
  <div style="height:200px;margin-top:12px"><canvas id="lev-dil-chart"></canvas></div>
  <div style="font-size:11.5px;color:var(--tx-3);padding:10px 4px 2px">ผล: Consist แย่ลง<b style="color:var(--neg)">แบบ monotonic ทุกน้ำหนักที่ทดสอบ</b> ไม่มีข้อยกเว้น — core ไม่มี BTC เลยครองอันดับ 1 เพราะไม่มี BTC ไม่ใช่บังเอิญ</div>
</div>

<div class="panel" style="margin-top:14px">
  <div class="panel-h"><h2>2️⃣ ถ้า BTC พุ่งวันนึง core จะพลาดโอกาสไหม?</h2></div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:4px">
    <div style="background:var(--bg-2);border-radius:6px;padding:12px">
      <div style="font-size:10px;color:var(--tx-3);text-transform:uppercase">Correlation</div>
      <div style="font-family:var(--mono);font-size:19px;font-weight:600;margin-top:3px">${RC.correlation.toFixed(2)}</div>
      <div style="font-size:10.5px;color:var(--tx-2);margin-top:2px">daily return core vs BTC</div>
    </div>
    <div style="background:var(--bg-2);border-radius:6px;padding:12px">
      <div style="font-size:10px;color:var(--tx-3);text-transform:uppercase">Beta</div>
      <div style="font-family:var(--mono);font-size:19px;font-weight:600;margin-top:3px">${RC.beta.toFixed(2)}</div>
      <div style="font-size:10.5px;color:var(--tx-2);margin-top:2px">BTC +1% → core +${(RC.beta).toFixed(2)}% เฉลี่ย</div>
    </div>
    <div style="background:var(--bg-2);border-radius:6px;padding:12px">
      <div style="font-size:10px;color:var(--tx-3);text-transform:uppercase">Capture (วัน BTC +2%↑)</div>
      <div style="font-family:var(--mono);font-size:19px;font-weight:600;margin-top:3px;color:var(--pos)">${RC.capture_ratio_pct}%</div>
      <div style="font-size:10.5px;color:var(--tx-2);margin-top:2px">${RC.n_big_up_days}/${RC.n_total_days} วัน · BTC +${RC.btc_avg_bigup_pct}% core +${RC.core_avg_bigup_pct}%</div>
    </div>
    <div style="background:var(--bg-2);border-radius:6px;padding:12px">
      <div style="font-size:10px;color:var(--tx-3);text-transform:uppercase">30 วัน BTC วิ่งแรงสุด</div>
      <div style="font-family:var(--mono);font-size:19px;font-weight:600;margin-top:3px;color:var(--pos)">core ${f1(rally.core_pct)}%</div>
      <div style="font-size:10.5px;color:var(--tx-2);margin-top:2px">BTC ${f1(rally.btc_pct)}% (${esc(rally.start)}~${esc(rally.end)})</div>
    </div>
  </div>
  <div style="font-size:11.5px;color:var(--tx-3);padding:10px 4px 2px">core ไม่ได้ตัดขาดจาก BTC เลย — วันที่ BTC เขียวแรงเฉลี่ย capture ได้ ${RC.capture_ratio_pct}% และช่วงที่ BTC วิ่งแรงสุด core ยังทำได้ดีกว่า BTC เองด้วยซ้ำ (XRP/ZEC เป็น high-beta altcoin)</div>
</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px">
  <div class="panel">
    <div class="panel-h"><h2>3️⃣ Static Leverage — MaxDD ตามจริง</h2></div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Leverage</th><th>Max Drawdown</th><th>วันแย่สุดวันเดียว</th></tr></thead>
      <tbody>${ddRows}</tbody>
    </table></div>
    <div style="height:180px;margin-top:12px"><canvas id="lev-dd-chart"></canvas></div>
    <div style="font-size:11px;color:var(--tx-3);padding:10px 4px 2px">MaxDD จริงจากข้อมูลย้อนหลัง ไม่ใช่การจำลอง liquidation engine ของ OKX — OKX liquidate ตาม maintenance margin เฉพาะเหรียญ/tier ซึ่งมักเกิดก่อนขาดทุนหมดมาก</div>
  </div>
  <div class="panel">
    <div class="panel-h"><h2>4️⃣ Dynamic Signal (SMA50) — <span style="color:var(--neg);font-size:.8em">พัง ❌</span></h2></div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>ชุด</th><th>IS Shp</th><th>IS CAGR</th><th class="sep">OOS Shp</th><th>OOS CAGR</th><th>OOS DD</th><th>Consist</th></tr></thead>
      <tbody>${smaRows}</tbody>
    </table></div>
    <div style="font-size:11px;color:var(--tx-3);padding:10px 4px 2px">${esc(L.sma_signal_test.note)}</div>
  </div>
</div>

<div class="panel" style="margin-top:14px">
  <div class="panel-h"><h2>5️⃣ Volatility Targeting — <span style="color:var(--pos);font-size:.8em">ชนะจริง ✅</span></h2></div>
  <div style="font-size:12px;color:var(--tx-3);padding:0 4px 10px">ไม่เดาทิศทาง แค่คุมความเสี่ยงให้คงที่: <code>leverage = target_vol ÷ realized_vol(30วันย้อนหลัง)</code> จำกัด 0.5x-2.5x — ทุกค่า target_vol ที่ทดสอบ (30%-60%) ชนะทั้ง Static 1x และ Static 2x</div>
  <div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>ชุด</th><th>leverage เฉลี่ย</th><th>IS Shp</th><th>IS DD</th><th class="sep">OOS Shp</th><th>OOS DD</th><th>Consist</th></tr></thead>
    <tbody>${vtRows}</tbody>
  </table></div>
  <div style="height:200px;margin-top:12px"><canvas id="lev-vt-chart"></canvas></div>
  <div style="font-size:11.5px;color:var(--tx-3);padding:10px 4px 2px">target_vol ไม่ใช่ค่าที่ต้อง optimize ให้เป๊ะ — เป็น "ปุ่มปรับความเสี่ยง" มากกว่า ยิ่งตั้งสูง leverage เฉลี่ยยิ่งขึ้น ได้ Sharpe ดีขึ้นนิดหน่อยแต่ DD แย่ลงตามสัดส่วน ไม่ใช่ free lunch</div>
  <div style="font-size:12px;color:var(--tx-2);font-weight:600;padding:14px 4px 4px">leverage ที่ระบบเลือกจริงรายเดือน (target_vol=41.7%, เส้นประเหลือง = จุดแบ่ง IS/OOS)</div>
  <div style="height:180px;margin-top:6px"><canvas id="lev-monthly-chart"></canvas></div>
</div>`;

    setTimeout(() => {
     try {
      if (!window.Chart) return;
      const gridOpt = { color: "rgba(255,255,255,0.06)" };
      const tickColor = "#9aa3b5";
      const legendOpt = { labels: { color: "#9aa3b5", boxWidth: 12, font: { size: 11 } } };

      // ── 1) dilution: BTC weight → IS/OOS Sharpe + Consist ──
      const elDil = document.getElementById("lev-dil-chart");
      if (elDil) {
        window.Chart.getChart(elDil)?.destroy();
        const D = L.core_btc_dilution;
        const ch = new Chart(elDil.getContext("2d"), {
          type: "line",
          data: {
            labels: D.map((r) => r.w_btc + "%"),
            datasets: [
              { label: "IS Sharpe", data: D.map((r) => r.is_sharpe), borderColor: "#646d80", backgroundColor: "transparent", borderWidth: 1.6, borderDash: [4, 3], pointRadius: 2, tension: 0.2 },
              { label: "OOS Sharpe", data: D.map((r) => r.oos_sharpe), borderColor: "#38bdf8", backgroundColor: "transparent", borderWidth: 2, pointRadius: 2.5, tension: 0.2 },
              { label: "Consist (min)", data: D.map((r) => r.consist), borderColor: "#fbbf24", backgroundColor: "transparent", borderWidth: 2.4, pointRadius: 2.5, tension: 0.2 },
            ],
          },
          options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            interaction: { mode: "index", intersect: false },
            scales: {
              y: { grid: gridOpt, ticks: { color: tickColor } },
              x: { grid: { display: false }, ticks: { color: "#646d80" }, title: { display: true, text: "BTC ที่เจือ", color: "#646d80", font: { size: 10.5 } } },
            },
            plugins: { legend: legendOpt },
          },
        });
        liveCharts.push(ch);
      }

      // ── 2) static leverage MaxDD / worst day ──
      const elDd = document.getElementById("lev-dd-chart");
      if (elDd) {
        window.Chart.getChart(elDd)?.destroy();
        const DD = L.static_leverage_dd;
        const ch = new Chart(elDd.getContext("2d"), {
          type: "bar",
          data: {
            labels: DD.map((r) => r.leverage.toFixed(1) + "x"),
            datasets: [
              { label: "Max Drawdown", data: DD.map((r) => r.max_dd), backgroundColor: "rgba(251,191,36,0.55)", borderRadius: 3, maxBarThickness: 34 },
              { label: "วันแย่สุด (|%|)", data: DD.map((r) => Math.abs(r.worst_day)), backgroundColor: "rgba(248,113,113,0.55)", borderRadius: 3, maxBarThickness: 34 },
            ],
          },
          options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            interaction: { mode: "index", intersect: false },
            scales: {
              y: { grid: gridOpt, ticks: { color: tickColor, callback: (v) => v + "%" } },
              x: { grid: { display: false }, ticks: { color: "#646d80" }, title: { display: true, text: "leverage คงที่", color: "#646d80", font: { size: 10.5 } } },
            },
            plugins: { legend: legendOpt },
          },
        });
        liveCharts.push(ch);
      }

      // ── 3) vol-target sensitivity: target_vol% → Consist, + เส้นอ้างอิง static 1x/2x ──
      const elVt = document.getElementById("lev-vt-chart");
      if (elVt) {
        window.Chart.getChart(elVt)?.destroy();
        const rows = L.vol_target_sensitivity.rows;
        const vtOnly = rows.filter((r) => r.target_vol);
        const static1x = rows.find((r) => r.label === "Static 1x");
        const static2x = rows.find((r) => r.label === "Static 2x");
        const refLines = {
          id: "refLines",
          afterDatasetsDraw(chart) {
            const { ctx, chartArea, scales } = chart;
            const drawRef = (val, color, text) => {
              const y = scales.y.getPixelForValue(val);
              if (!isFinite(y)) return;
              ctx.save();
              ctx.strokeStyle = color; ctx.lineWidth = 1.3; ctx.setLineDash([5, 4]);
              ctx.beginPath(); ctx.moveTo(chartArea.left, y); ctx.lineTo(chartArea.right, y); ctx.stroke();
              ctx.setLineDash([]);
              ctx.font = "600 10px 'IBM Plex Mono',monospace"; ctx.fillStyle = color; ctx.textAlign = "left";
              ctx.fillText(text, chartArea.left + 4, y - 4);
              ctx.restore();
            };
            if (static1x) drawRef(static1x.consist, "#646d80", `Static 1x (${static1x.consist.toFixed(2)})`);
            if (static2x) drawRef(static2x.consist, "#f87171", `Static 2x (${static2x.consist.toFixed(2)})`);
          },
        };
        const ch = new Chart(elVt.getContext("2d"), {
          type: "line",
          data: {
            labels: vtOnly.map((r) => r.target_vol + "%"),
            datasets: [
              { label: "Vol-target Consist", data: vtOnly.map((r) => r.consist), borderColor: "#34d399", backgroundColor: "transparent", borderWidth: 2.4, pointRadius: 3, tension: 0.25 },
            ],
          },
          options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            interaction: { mode: "index", intersect: false },
            scales: {
              y: { grid: gridOpt, ticks: { color: tickColor } },
              x: { grid: { display: false }, ticks: { color: "#646d80" }, title: { display: true, text: "target_vol", color: "#646d80", font: { size: 10.5 } } },
            },
            plugins: { legend: legendOpt },
          },
          plugins: [refLines],
        });
        liveCharts.push(ch);
      }

      // ── 4) monthly leverage schedule (vol-target จริง) พร้อมจุดแบ่ง IS/OOS ──
      const elM = document.getElementById("lev-monthly-chart");
      if (elM && L.vol_target_monthly_leverage) {
        window.Chart.getChart(elM)?.destroy();
        const M = L.vol_target_monthly_leverage;
        const splitIdx = M.findIndex((r) => r.in_oos);
        const oosDivider = {
          id: "oosDividerLev",
          afterDatasetsDraw(chart) {
            if (splitIdx < 0) return;
            const { ctx, chartArea, scales } = chart;
            const x = scales.x.getPixelForValue(splitIdx);
            if (!isFinite(x)) return;
            ctx.save();
            ctx.strokeStyle = "rgba(251,191,36,0.55)"; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]);
            ctx.beginPath(); ctx.moveTo(x, chartArea.top); ctx.lineTo(x, chartArea.bottom); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = "rgba(251,191,36,0.035)";
            ctx.fillRect(x, chartArea.top, chartArea.right - x, chartArea.bottom - chartArea.top);
            ctx.restore();
          },
        };
        const ch = new Chart(elM.getContext("2d"), {
          type: "line",
          data: {
            labels: M.map((r) => r.month),
            datasets: [
              { label: "leverage เลือกจริง", data: M.map((r) => r.leverage), borderColor: "#a78bfa", backgroundColor: "rgba(167,139,250,0.12)", borderWidth: 2, pointRadius: 2, stepped: "before", fill: true },
            ],
          },
          options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            interaction: { mode: "index", intersect: false },
            scales: {
              y: { grid: gridOpt, ticks: { color: tickColor, callback: (v) => v + "x" }, min: 0 },
              x: { grid: { display: false }, ticks: { color: "#646d80", maxTicksLimit: 9 } },
            },
            plugins: { legend: { display: false } },
          },
          plugins: [oosDivider],
        });
        liveCharts.push(ch);
      }
     } catch (err) {
       console.error("leverage-lab chart render error:", err);
       const d = document.createElement("pre");
       d.style.cssText = "position:fixed;top:40px;left:0;right:0;z-index:99999;background:#3a0d0d;color:#ffb4b4;padding:10px;font:11px monospace;white-space:pre-wrap;max-height:40vh;overflow:auto";
       d.textContent = "leverage-lab RENDER ERROR: " + (err && err.message) + "\n" + (err && err.stack || "(no stack)");
       document.body.appendChild(d);
     }
    }, 0);
  }

  // ══════════════════════════════════════════════════════════════════
  // OKX LIVE — บัญชีจริง read-only (daily health-check + weekly rebalance) · 2026-07-19
  // ══════════════════════════════════════════════════════════════════
  function renderOkxLive() {
    clearCharts();
    const D = window.OKX_DAILY;
    const W = window.OKX_LIVE;
    const main = document.getElementById("main");
    if (!D && !W) {
      main.innerHTML = `<div style="color:var(--tx-3);padding:24px">ยังไม่มีข้อมูล — รัน <b>python run_okx_live_monitor.py</b> และ <b>python run_okx_weekly_rebalance.py</b> ก่อน</div>`;
      return;
    }
    const f2 = (v) => (v == null ? "N/A" : Number(v).toFixed(2));
    const pc = (v) => (v > 0 ? "var(--pos)" : v < 0 ? "var(--neg)" : "var(--tx-3)");
    const now = new Date();
    const ageDays = (iso) => (iso ? (now - new Date(iso)) / 86400000 : null);
    const dAge = ageDays(D && D.generated);
    const wAge = ageDays(W && W.generated);
    const stale = (dAge !== null && dAge > 8) || (wAge !== null && wAge > 8);
    const pad2 = (n) => String(n).padStart(2, "0");
    const fmtTime = (iso) => {
      if (!iso) return null;
      const d = new Date(iso); // แสดงตามเวลาเครื่อง (local) แบบ ค.ศ. ให้ตรงกับวันที่อื่นๆ ในหน้านี้ (ไม่ใช้ th-TH เพราะจะกลายเป็น พ.ศ.)
      return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    };
    const ageTxt = (h) => {
      if (h == null) return "";
      if (h < 1) return `(${Math.round(h * 60)} นาทีที่แล้ว)`;
      if (h < 48) return `(${h.toFixed(1)} ชม.ที่แล้ว)`;
      return `(${(h / 24).toFixed(1)} วันที่แล้ว)`;
    };
    const dTime = fmtTime(D && D.generated);
    const wTime = fmtTime(W && W.generated);
    const dAgeHrs = dAge != null ? dAge * 24 : null;
    const wAgeHrs = wAge != null ? wAge * 24 : null;

    const disclaimer = `
<div style="background:color-mix(in oklch,var(--neg) 8%,var(--panel));border:1px solid color-mix(in oklch,var(--neg) 30%,transparent);border-radius:var(--r);padding:14px 18px;font-size:12px;line-height:1.7;color:var(--tx-2);margin-bottom:14px">
⚠️ <b style="color:var(--neg)">บัญชีจริงบน OKX (read-only key)</b> — หน้านี้แค่ "อ่าน+คำนวณ+แนะนำ" เท่านั้น <b>Claude ไม่ส่งคำสั่งซื้อขายหรือแตะเงินจริงเด็ดขาด</b> คุณต้องกดซื้อ/ขายเองบน OKX เสมอตามคำแนะนำที่เห็นด้านล่าง
</div>`;

    const heartbeat = `
<div style="background:${stale ? "color-mix(in oklch,var(--neg) 12%,var(--panel))" : "color-mix(in oklch,var(--pos) 8%,var(--panel))"};border:1px solid ${stale ? "var(--neg)" : "color-mix(in oklch,var(--pos) 30%,transparent)"};border-radius:var(--r);padding:10px 16px;font-size:12px;color:var(--tx-2);margin-bottom:14px;display:flex;gap:18px;align-items:center;flex-wrap:wrap">
  <b style="color:${stale ? "var(--neg)" : "var(--pos)"}">${stale ? "⚠ ข้อมูลเก่าเกิน 8 วัน" : "✓ ข้อมูลสด"}</b>
  <span>daily run: <b>${dTime || "ยังไม่เคยรัน"}</b> ${ageTxt(dAgeHrs)}</span>
  <span>weekly run: <b>${wTime || "ยังไม่เคยรัน"}</b> ${ageTxt(wAgeHrs)}</span>
  <span style="color:var(--tx-3);margin-left:auto">หน้านี้โหลดเมื่อ: ${fmtTime(now.toISOString())}</span>
  ${stale ? "<span>เช็คว่า scheduled task ยังรันอยู่ไหม</span>" : ""}
</div>`;

    const equity = (W && W.equity_usd) ?? (D && D.equity_usd);
    const overall = (W && W.overall_status) || (D && D.overall_status) || "N/A";
    const overallColor = overall === "REVIEW" ? "var(--warn)" : overall === "OK" ? "var(--pos)" : "var(--tx-3)";

    const kpis = `
<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;padding:4px;margin-bottom:14px">
  <div style="background:var(--bg-2);border-radius:6px;padding:12px">
    <div style="font-size:10px;color:var(--tx-3);text-transform:uppercase">Equity</div>
    <div style="font-family:var(--mono);font-size:19px;font-weight:600;margin-top:3px">$${equity != null ? equity.toFixed(2) : "N/A"}</div>
  </div>
  <div style="background:var(--bg-2);border-radius:6px;padding:12px">
    <div style="font-size:10px;color:var(--tx-3);text-transform:uppercase">Drawdown จาก peak</div>
    <div style="font-family:var(--mono);font-size:19px;font-weight:600;margin-top:3px;color:${D && D.drawdown_pct > 0 ? "var(--warn)" : "var(--tx)"}">
      ${D ? "-" + D.drawdown_pct.toFixed(2) + "%" : "N/A"}</div>
  </div>
  <div style="background:var(--bg-2);border-radius:6px;padding:12px">
    <div style="font-size:10px;color:var(--tx-3);text-transform:uppercase">Leverage เดือนนี้</div>
    <div style="font-family:var(--mono);font-size:19px;font-weight:600;margin-top:3px">${W ? W.leverage.toFixed(2) + "x" : "N/A"}</div>
    <div style="font-size:10px;color:var(--tx-3);margin-top:2px">${W && W.is_new_month ? "recomputed เดือนนี้" : W && W.intramonth_review ? "ปรับกลางเดือน (vol spike)" : ""}</div>
  </div>
  <div style="background:var(--bg-2);border-radius:6px;padding:12px">
    <div style="font-size:10px;color:var(--tx-3);text-transform:uppercase">Realized vol (30/60/10d)</div>
    <div style="font-family:var(--mono);font-size:14px;font-weight:600;margin-top:3px">
      ${W ? `${f2(W.vol30_pct)}% / ${f2(W.vol60_pct)}% / ${f2(W.vol10_pct)}%` : "N/A"}</div>
    <div style="font-size:10px;color:var(--tx-3);margin-top:2px">target ${W ? f2(W.target_vol_pct) : "N/A"}%</div>
  </div>
  <div style="background:var(--bg-2);border-radius:6px;padding:12px">
    <div style="font-size:10px;color:var(--tx-3);text-transform:uppercase">Overall status</div>
    <div style="font-family:var(--mono);font-size:19px;font-weight:700;margin-top:3px;color:${overallColor}">${overall}</div>
  </div>
</div>`;

    const dLegs = (D && D.legs) || [];
    const wLegs = (W && W.legs) || [];
    const names = [...new Set([...dLegs.map((l) => l.name), ...wLegs.map((l) => l.name)])];
    const legRows = names.map((name) => {
      const dl = dLegs.find((l) => l.name === name) || {};
      const wl = wLegs.find((l) => l.name === name) || {};
      const posStatus = dl.has_position
        ? `${dl.pos_side || ""} ${dl.pos_sz || ""} (${dl.lever || "?"}x)`
        : "ไม่มี position";
      const liqDist = dl.liq_dist_pct != null ? `${dl.liq_dist_pct.toFixed(1)}%${dl.review_liquidation ? " ⚠" : ""}` : "—";
      const corrTxt = wl.corr_vs_btc != null
        ? wl.corr_vs_btc.toFixed(2) + (wl.corr_roc != null ? ` (Δ4w${wl.corr_roc > 0 ? "+" : ""}${wl.corr_roc.toFixed(2)})` : "") + (wl.corr_cut ? " ✂" : "") + (wl.corr_roc_alert ? " ⚠" : "")
        : "—";
      const moveTxt = wl.extreme_move_pct != null
        ? `${wl.extreme_move_pct > 0 ? "+" : ""}${wl.extreme_move_pct.toFixed(1)}%${wl.extreme_move_alert ? " ⚠" : ""}` : "—";
      const fundingTxt = wl.funding_recent_8h != null
        ? `${(wl.funding_recent_8h * 3 * 365 * 100).toFixed(2)}%/ปี${wl.funding_alert ? " ⚠" : ""}`
        : (wl.interest_rate != null ? `${(wl.interest_rate * 100).toFixed(5)}%/รอบ (margin)` : "—");
      const actionColor = wl.action === "BUY" ? "var(--pos)" : wl.action === "SELL" ? "var(--neg)" : "var(--tx-3)";
      return `<tr>
        <td>${esc(name)}<div class="reason" style="color:var(--tx-3)">${esc(wl.instId || dl.instId || "")}</div></td>
        <td class="tnum">${wl.mark_px != null ? wl.mark_px : (dl.mark_px != null ? dl.mark_px : "—")}</td>
        <td>${posStatus}</td>
        <td class="tnum">${liqDist}</td>
        <td class="tnum">${wl.target_notional != null ? "$" + wl.target_notional.toFixed(2) : "—"}${wl.target_units != null ? `<div class="reason" style="color:var(--tx-3)">${wl.target_units} ${esc(wl.unit_label || "")}</div>` : ""}</td>
        <td class="tnum">${wl.actual_notional != null ? "$" + wl.actual_notional.toFixed(2) : "—"}</td>
        <td class="tnum" style="color:${pc(wl.diff_notional)}">${wl.diff_notional != null ? (wl.diff_notional > 0 ? "+" : "") + "$" + wl.diff_notional.toFixed(2) : "—"}</td>
        <td style="font-weight:600;color:${actionColor}">${wl.action || "—"}</td>
        <td class="tnum">${moveTxt}</td>
        <td class="tnum">${corrTxt}</td>
        <td class="tnum">${fundingTxt}</td>
      </tr>`;
    }).join("");

    const corrNote = (W && W.corr_cut_legs && W.corr_cut_legs.length)
      ? `<div style="font-size:11.5px;color:var(--warn);padding:8px 4px 2px">✂ corr guardrail: ตัดน้ำหนักขา ${W.corr_cut_legs.join(", ")} ลงครึ่งหนึ่ง (corr กับ BTC เกิน 0.85)</div>` : "";
    const corrRocNote = (W && W.corr_roc_alert_legs && W.corr_roc_alert_legs.length)
      ? `<div style="font-size:11.5px;color:var(--warn);padding:2px 4px">⚠ corr ขา ${W.corr_roc_alert_legs.join(", ")} เพิ่มขึ้นเร็วใน 4 สัปดาห์ล่าสุด — diversification กำลังเสื่อม ก่อนชน threshold 0.85</div>` : "";
    const extremeMoveNote = (W && W.legs && W.legs.some((l) => l.extreme_move_alert))
      ? `<div style="font-size:11.5px;color:var(--warn);padding:2px 4px">⚠ มีขาที่เพิ่งวิ่งแรงผิดปกติ (trailing 30d เกิน ±${150}%) — เป็น tail event อย่า extrapolate ว่าจะเกิดต่อเนื่อง</div>` : "";

    const SS = window.STRESS_SIZING;
    const stressPanel = !SS ? "" : (() => {
      const st = SS.stress;
      const scanRows = st.scan.map((s) => {
        const liq = s.liquidated.length ? `<span style="color:var(--neg);font-weight:600">${esc(s.liquidated.join(", "))}</span>` : "—";
        return `<tr>
          <td>${s.days} วัน</td>
          <td class="tnum" style="font-size:11px;color:var(--tx-3)">${esc(s.from)} → ${esc(s.to)}</td>
          <td class="tnum">$${s.min_eq.toLocaleString()}</td>
          <td class="tnum" style="color:var(--neg);font-weight:600">${s.min_pct.toFixed(1)}%</td>
          <td class="tnum">${s.final_pct > 0 ? "+" : ""}${s.final_pct.toFixed(1)}%</td>
          <td>${liq}</td>
        </tr>`;
      }).join("");
      const sizeRows = SS.sizing.map((z) => `<tr>
          <td class="tnum">$${z.capital.toLocaleString()}</td>
          <td class="tnum">$${z.left.toLocaleString()}</td>
          <td class="tnum" style="color:var(--neg)">−$${z.loss.toLocaleString()}</td>
          <td class="tnum" style="color:var(--warn)">+${z.recover_pct.toFixed(1)}%</td>
        </tr>`).join("");
      const liqPts = Object.entries(st.liq_points)
        .map(([k, v]) => v == null ? `${k}: ถือสด ไม่มี liq` : `<b style="color:var(--neg)">${k}: ร่วง ${v.toFixed(1)}% = หมด margin</b>`)
        .join(" · ");
      return `
<div class="panel" style="margin-bottom:14px;border:1px solid color-mix(in oklch,var(--neg) 30%,transparent)">
  <div class="panel-h"><h2>🔻 ถ้าคิดผิดจะเหลืออะไร — stress test ด้วยราคาจริง</h2>
    <span class="tb-chip" style="margin-left:auto;color:var(--tx-3)">สแกนทุกช่วงเวลา ไม่เลือกช่วงเอง · โมเดล liquidation จริง</span>
  </div>
  <div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>ยาว</th><th>ช่วงที่แย่สุดที่เจอ</th><th>equity ต่ำสุด</th><th>ลดลง</th><th>ปลายช่วง</th><th>ขาที่ถูก liquidate</th></tr></thead>
    <tbody>${scanRows}</tbody>
  </table></div>
  <div style="font-size:11.5px;color:var(--tx-2);padding:10px 4px 2px;line-height:1.8">
    <b style="color:var(--neg)">ประเด็นสำคัญที่สุด:</b> ขา SWAP ใช้ leverage 3x — ${liqPts}<br>
    ช่วง 180 วันที่แย่สุด (${esc(st.scan[1] ? st.scan[1].from : "")} → ${esc(st.scan[1] ? st.scan[1].to : "")})
    <b>ทั้ง XRP และ ZEC ถูก liquidate ทั้งคู่</b> — margin หายถาวร ไม่ฟื้นแม้ราคาเด้งกลับทีหลัง<br>
    <span style="color:var(--tx-3)">เทียบ: ช่วง ต.ค.2025→ปัจจุบัน ที่ดูน่ากลัว จริงๆ พอร์ตนี้กลับได้ ${st.oct_final_pct > 0 ? "+" : ""}${st.oct_final_pct.toFixed(1)}%
    เพราะ ZEC วิ่ง +205% — แต่ XRP ก็ยังถูก liquidate ทิ้งไปในช่วงนั้นเหมือนกัน</span>
  </div>
</div>
<div class="panel" style="margin-bottom:14px">
  <div class="panel-h"><h2>💰 ถ้า worst case (${st.worst_min_pct.toFixed(1)}%) เกิดซ้ำ</h2></div>
  <div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>เงินที่ลงในระบบนี้</th><th>เหลือ</th><th>ขาดทุน</th><th>ต้องโตกี่ % ถึงกลับทุน</th></tr></thead>
    <tbody>${sizeRows}</tbody>
  </table></div>
  <div style="font-size:11.5px;color:var(--tx-3);padding:10px 4px 2px;line-height:1.7">
    ตารางนี้เป็นแค่คณิตศาสตร์จากตัวเลข worst case จริง <b>ไม่ใช่คำแนะนำว่าควรลงเท่าไหร่</b> —
    Claude ไม่ใช่ที่ปรึกษาการเงิน จำนวนที่รับได้ขึ้นกับสถานะการเงินของคุณเอง
  </div>
</div>`;
    })();

    main.innerHTML = `
${disclaimer}
${heartbeat}
${kpis}
${stressPanel}
<div class="panel">
  <div class="panel-h"><h2>ขาแต่ละตัว — position จริง vs target ที่แนะนำ</h2></div>
  <div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>ขา</th><th>Mark px</th><th>Position</th><th>Liq dist</th><th>Target</th><th>Actual</th><th>Diff</th><th>Action</th><th>30d move</th><th>Corr vs BTC (Δ4w)</th><th>Funding/Interest</th></tr></thead>
    <tbody>${legRows}</tbody>
  </table></div>
  ${corrNote}
  ${corrRocNote}
  ${extremeMoveNote}
  <div style="font-size:11px;color:var(--tx-3);padding:10px 4px 2px">Action คือ "คำแนะนำ" เท่านั้น — diff ต่ำกว่า 1% ของ equity จะไม่แนะนำเทรด (min-trade threshold) กด BUY/SELL เองบน OKX เสมอ</div>
</div>
<div class="panel" style="margin-top:14px">
  <div class="panel-h"><h2>Equity history (จาก daily health-check)</h2></div>
  <div style="height:180px;margin-top:6px"><canvas id="okx-equity-chart"></canvas></div>
</div>`;

    setTimeout(() => {
      try {
        const el = document.getElementById("okx-equity-chart");
        if (!el || !window.Chart || !D || !D.history || !D.history.length) return;
        window.Chart.getChart(el)?.destroy();
        const hist = D.history;
        const ch = new Chart(el.getContext("2d"), {
          type: "line",
          data: {
            labels: hist.map((h) => h.date),
            datasets: [{
              label: "Equity (USD)", data: hist.map((h) => h.equity),
              borderColor: "#34d399", backgroundColor: "rgba(52,211,153,0.08)",
              borderWidth: 2, pointRadius: 2, tension: 0.2, fill: true,
            }],
          },
          options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            interaction: { mode: "index", intersect: false },
            scales: {
              y: { grid: { color: "rgba(255,255,255,0.06)" }, ticks: { color: "#9aa3b5", callback: (v) => "$" + v } },
              x: { grid: { display: false }, ticks: { color: "#646d80", maxTicksLimit: 8 } },
            },
            plugins: { legend: { display: false } },
          },
        });
        liveCharts.push(ch);
      } catch (err) {
        console.error("okx-equity-chart render error:", err);
      }
    }, 0);
  }

  // TRADFI MIX SECTION — หุ้น/ETF เทียบ crypto · 2026-07-05
  // รวมเข้าเป็นส่วนหนึ่งของหน้า Portfolio Mix แล้ว (ไม่ใช่หน้าแยก)
  // ══════════════════════════════════════════════════════════════════
  function tradfiSectionHtml(P) {
    if (!P || !P.tradfi) return `<div style="color:var(--tx-3);padding:12px 4px;font-size:12px">TradFi mix: ยังไม่มีข้อมูล — รัน python run_tradfi_mix.py</div>`;
    const T = P.tradfi;
    const f1 = (v) => (v > 0 ? "+" : "") + v.toFixed(1);
    const f2 = (v) => v.toFixed(2);
    const pc = (v) => v > 0 ? "var(--pos)" : v < 0 ? "var(--neg)" : "var(--tx-3)";
    const consist = (r) => Math.min(r.is.sharpe, r.oos.sharpe);
    const bestC = Math.max(...T.top_tradfi.map(consist));
    const row = (r, dim) => {
      const win = !dim && consist(r) === bestC;
      return `<tr${win ? " style='background:color-mix(in oklch,var(--pos) 6%,transparent)'" : ""}>
        <td style="${dim ? "color:var(--tx-3)" : "font-weight:" + (win ? 600 : 400)}">${win ? "🏆 " : ""}${esc(r.label)}</td>
        <td class="tnum">${f2(r.is.sharpe)}</td>
        <td class="tnum sep" style="font-weight:600;color:${r.oos.sharpe > 0.5 ? "var(--pos)" : "var(--neg)"}">${f2(r.oos.sharpe)}</td>
        <td class="tnum">${f2(consist(r))}</td>
        <td class="tnum" style="color:${pc(r.all.cagr)}">${f1(r.all.cagr)}%</td>
        <td class="tnum" style="color:var(--warn)">−${r.all.max_dd.toFixed(1)}%</td>
        <td class="tnum">${f2(r.all.calmar)}</td>
      </tr>`;
    };
    const corrChips = Object.entries(T.corr_vs_btc_weekday)
      .sort((a, b) => a[1] - b[1])
      .map(([k, v]) => `<span class="chip"><i>${esc(k)}</i> <b style="color:${Math.abs(v) < 0.3 ? "var(--pos)" : Math.abs(v) < 0.5 ? "#f59e0b" : "var(--neg)"}">${v.toFixed(2)}</b></span>`).join("");

    return `
<div class="panel-h" style="margin-top:6px"><h2 style="font-size:16px">🏦 TradFi Mix — เพิ่มหุ้น/ETF เข้า universe ช่วยไหม?</h2></div>
<div style="background:color-mix(in oklch,#22d3ee 8%,var(--panel));border:1px solid color-mix(in oklch,#22d3ee 25%,transparent);border-radius:var(--r);padding:14px 18px;font-size:12.5px;line-height:1.7;color:var(--tx-2)">
  <b style="color:#22d3ee">คำถาม: เพิ่มหุ้นแล้วดีขึ้นไหม? — ไม่ดีขึ้น</b><br>
  mix ที่มี TradFi ที่ดีสุดคือพอร์ตเดิมที่เปลี่ยน PAXG→GLD (ทองเหมือนกัน ผลแทบเท่ากัน) ·
  หุ้นเป็น anchor แทนทอง (SPY/QQQ 50%) ให้ DD ลึกกว่า (−35% vs −28%) เพราะหุ้นยุคนี้ corr กับ crypto ~0.42-0.43 ·
  ตัวที่น่าสนใจ: <b>NVDA 25% แทน XRP</b> (ZEC+PAXG+NVDA: OOS Shp 2.34, DD −22.2%, Calmar 5.42) และ TLT (corr −0.03 ต่ำสุดในบอร์ด แต่ return ต่ำ) ·
  Phase 2B combo เดิม (BTC+SPY+GLD) OOS Sharpe ติดลบในช่วงนี้ ·
  ดูเส้น <b style="color:#22d3ee">🏦 XRP+ZEC+GLD</b> และ <b style="color:#e879f9">⭐ Best v2</b> เทียบกับเส้นอื่นได้ในกราฟ Equity Curves ด้านบน (รวมไว้กราฟเดียว ไม่แยกกราฟซ้ำ)
</div>
<div class="matrix-wrap">
  <div style="padding:12px 16px;border-bottom:1px solid var(--line)">
    <div style="font-size:14px;font-weight:600">Top mixes ที่มี TradFi อย่างน้อย 1 ขา · จัดอันดับด้วย consistency = min(IS,OOS) Sharpe</div>
    <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono);margin-top:2px">${esc(T.note)} · run ${esc(T.generated)}</div>
  </div>
  <div style="padding:10px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px;flex-wrap:wrap">
    <span style="font-size:11px;color:var(--tx-3)">corr vs BTC (เฉพาะวันเปิดตลาด):</span>${corrChips}
  </div>
  <div class="tbl-wrap" style="border:0;border-radius:0">
  <table class="tbl hist">
    <thead><tr><th>Mix (มี TradFi อย่างน้อย 1 ขา)</th><th>IS Shp</th><th class="sep">OOS Shp</th><th>Consist</th><th>ALL CAGR</th><th>ALL DD</th><th>Calmar</th></tr></thead>
    <tbody>
      ${T.top_tradfi.slice(0, 8).map((r) => row(r)).join("")}
      ${T.benchmarks.map((b) => row(b, true)).join("")}
    </tbody>
  </table>
  </div>
</div>
${P.tradfi_perps ? (() => {
  const S = P.tradfi_perps;
  const cc = (v) => v === null || v === undefined ? "—" :
    `<b style="color:${Math.abs(v) < 0.3 ? "var(--pos)" : Math.abs(v) < 0.5 ? "#f59e0b" : "var(--neg)"}">${v.toFixed(2)}</b>`;
  const prow = (r, wl) => `<tr>
    <td style="${wl ? "color:var(--tx-2)" : "font-weight:600"}">${esc(r.name)}${wl ? " <span class='reason'>รอ history</span>" : ""}</td>
    <td class="tnum">${r.days}d</td>
    <td class="tnum">$${(r.quote_vol_24h/1e6).toFixed(0)}M</td>
    <td class="tnum">${(r.ann_vol*100).toFixed(0)}%</td>
    <td class="tnum">${cc(r.corr.btc)}</td><td class="tnum">${cc(r.corr.xrp)}</td>
    <td class="tnum">${cc(r.corr.zec)}</td><td class="tnum">${cc(r.corr.paxg)}</td>
    <td class="tnum" style="color:${r.ret_90d === null ? "var(--tx-3)" : pc(r.ret_90d)}">${r.ret_90d === null ? "—" : f1(r.ret_90d) + "%"}</td>
  </tr>`;
  const mini = (S.mini_backtest.rows || []).map((m) =>
    `<span class="chip"><i>${esc(m.name)} +20%</i> Shp ${m.without.sharpe.toFixed(2)}→<b style="color:${m.d_sharpe > 0 ? "var(--pos)" : "var(--neg)"}">${m.with.sharpe.toFixed(2)}</b> · DD ${m.without.max_dd.toFixed(0)}→${m.with.max_dd.toFixed(0)}% · ${m.window_days}d</span>`).join(" ");
  return `
<div class="matrix-wrap">
  <div style="padding:12px 16px;border-bottom:1px solid var(--line)">
    <div style="font-size:14px;font-weight:600">📡 Screen: Binance TradFi Perps (tokenized stocks · ${S.n_category} ตัวในหมวด)</div>
    <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono);margin-top:2px">${esc(S.criteria)} · run ${esc(S.generated)}</div>
  </div>
  <div class="tbl-wrap" style="border:0;border-radius:0">
  <table class="tbl">
    <thead><tr><th>Perp</th><th>History</th><th>Vol 24h</th><th>AnnVol</th><th>corr BTC</th><th>XRP</th><th>ZEC</th><th>PAXG</th><th>90d</th></tr></thead>
    <tbody>
      ${S.rows.map((r) => prow(r, false)).join("")}
      ${(S.watchlist || []).map((r) => prow(r, true)).join("")}
    </tbody>
  </table>
  </div>
  <div style="padding:11px 16px;border-top:1px solid var(--line);font-size:11.5px;color:var(--tx-2);display:flex;gap:6px;flex-wrap:wrap;align-items:center">
    <span style="color:var(--tx-3)">Mini-backtest (${esc(S.mini_backtest.note)}):</span> ${mini}
  </div>
  <div style="padding:12px 16px;border-top:1px solid var(--line);font-size:12px;line-height:1.7;color:var(--tx-2)">
    <b style="color:#f59e0b">คำแนะนำ:</b> ยังไม่มีตัวที่ควรเข้าพอร์ตทันที — XAU/XAG ซ้ำกับ PAXG (corr 0.99/0.87) · MSTR คือ BTC proxy (corr 0.80, ใส่แล้ว Sharpe แย่ลง) · CRCL ก้ำกึ่ง (Sharpe ดีขึ้นแต่ DD แย่ลง, corr XRP 0.51) ·
    <b style="color:var(--pos)">Watchlist ที่น่าจับตา:</b> <b>MU / SNDK</b> (corr 0.15-0.25 + volume สูงสุดในหมวด แต่ history แค่ 90d) และ <b>CL/BZ น้ำมัน</b> (corr ติดลบทุกขา −0.27 ถึง −0.56 = ประกันแท้จริง) — รอครบ ~180d แล้วรัน screen ซ้ำก่อนตัดสิน
  </div>
</div>` })() : ""}
${P.best_port_v2 ? (() => {
  const B = P.best_port_v2;
  const bestShp = Math.max(...B.rows.map((r) => r.m.sharpe));
  const brow = (r, dim) => {
    const win = !dim && r.m.sharpe === bestShp;
    const isCore = r.label.startsWith("Core เดิม");
    return `<tr${win ? " style='background:color-mix(in oklch,var(--pos) 6%,transparent)'" : isCore ? " style='background:color-mix(in oklch,#f59e0b 5%,transparent)'" : ""}>
      <td style="${dim ? "color:var(--tx-3)" : "font-weight:" + (win || isCore ? 600 : 400)}">${win ? "⭐ " : ""}${esc(r.label)}</td>
      <td class="tnum" style="font-weight:600;color:${r.m.sharpe > 0.5 ? "var(--pos)" : r.m.sharpe < 0 ? "var(--neg)" : "var(--tx)"}">${r.m.sharpe.toFixed(2)}</td>
      <td class="tnum" style="color:${pc(r.m.total)}">${f1(r.m.total)}%</td>
      <td class="tnum" style="color:var(--warn)">−${r.m.max_dd.toFixed(1)}%</td>
      <td class="tnum">${r.m.sortino.toFixed(2)}</td>
    </tr>`;
  };
  const shown = B.rows.slice(0, 8);
  const core = B.rows.find((r) => r.label.startsWith("Core เดิม"));
  if (core && !shown.includes(core)) shown.push(core);
  return `
<div class="matrix-wrap">
  <div style="padding:12px 16px;border-bottom:1px solid var(--line)">
    <div style="font-size:14px;font-weight:600">🎯 Best Portfolio v2 — core + satellite (TradFi perps) · window ${B.window_days} วัน (${esc(B.window)})</div>
    <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono);margin-top:2px">${esc(B.note)} · run ${esc(B.generated)}</div>
  </div>
  <div class="tbl-wrap" style="border:0;border-radius:0">
  <table class="tbl">
    <thead><tr><th>Portfolio</th><th>Sharpe</th><th>Total</th><th>MaxDD</th><th>Sortino</th></tr></thead>
    <tbody>
      ${shown.map((r) => brow(r)).join("")}
      ${brow(B.bench, true)}
    </tbody>
  </table>
  </div>
  <div style="padding:12px 16px;border-top:1px solid var(--line);font-size:12px;line-height:1.7;color:var(--tx-2)">
    <b style="color:var(--warn)">⚠ อ่านอย่างระวัง:</b> window แค่ ${B.window_days} วัน และ MU/SNDK กำลังอยู่ใน AI-memory rally พอดี — ตัวเลขนี้คือ "ช่วงนี้ semis ขึ้นแรง" ไม่ใช่หลักฐานว่าจะดีต่อ ·
    ที่ยึดได้จริงคือ corr ต่ำ (0.15-0.25) + การเพิ่ม satellite 20% ลด DD จาก −24.5% → −15/16% ·
    แนวทาง: core 80% (XRP 20/ZEC 20/PAXG 40) + satellite MU 10% + SNDK 10% แบบ paper trade → รีวิวเมื่อ history ครบ 180d
  </div>
</div>` })() : ""}`;
  }

  // ══════════════════════════════════════════════════════════════════
  // OKX CANDIDATE SCREEN — หุ้น equity-perp ที่มีแต่บน OKX (Binance ไม่มี)
  // จาก run_okx_perps_screen.py · รวมเป็นส่วนท้ายของหน้า Portfolio Mix
  // ══════════════════════════════════════════════════════════════════
  function okxSectionHtml() {
    const O = window.OKX_SCREEN;
    if (!O) return `<div style="color:var(--tx-3);padding:12px 4px;font-size:12px">OKX screen: ยังไม่มีข้อมูล — รัน python run_okx_perps_screen.py</div>`;
    const f1 = (v) => (v > 0 ? "+" : "") + v.toFixed(1);
    const pc = (v) => v > 0 ? "var(--pos)" : v < 0 ? "var(--neg)" : "var(--tx-3)";
    const cc = (v) => `<b style="color:${Math.abs(v) < 0.3 ? "var(--pos)" : Math.abs(v) < 0.6 ? "#f59e0b" : "var(--neg)"}">${v.toFixed(2)}</b>`;
    const bestSharpe = Math.max(O.core_only.sharpe, O.core_plus_current_satellite.sharpe, ...O.candidates_as_satellite.map((r) => r.sharpe));

    const corrRows = O.corr.map((r) => `<tr>
      <td style="font-weight:600">${esc(r.name)}</td>
      <td class="tnum">${cc(r.corr_btc)}</td>
      <td class="tnum">${cc(r.corr_xrp)}</td>
      <td class="tnum">${cc(r.corr_zec)}</td>
      <td class="tnum">${cc(r.corr_paxg)}</td>
      <td class="tnum" style="color:${pc(r.ret_window_pct)}">${f1(r.ret_window_pct)}%</td>
    </tr>`).join("");

    const btRow = (label, m, dim) => {
      const win = !dim && m.sharpe === bestSharpe;
      return `<tr${win ? " style='background:color-mix(in oklch,var(--pos) 6%,transparent)'" : ""}>
        <td style="${dim ? "color:var(--tx-3)" : "font-weight:" + (win ? 600 : 400)}">${win ? "🏆 " : ""}${esc(label)}</td>
        <td class="tnum" style="font-weight:600;color:${m.sharpe > 0.5 ? "var(--pos)" : m.sharpe < 0 ? "var(--neg)" : "var(--tx)"}">${m.sharpe.toFixed(2)}</td>
        <td class="tnum" style="color:${pc(m.cagr)}">${f1(m.cagr)}%</td>
        <td class="tnum" style="color:var(--warn)">${m.max_dd.toFixed(1)}%</td>
      </tr>`;
    };
    const candRows = O.candidates_as_satellite.map((r) => btRow(`core + ${r.name} (OKX 20%)`, r)).join("");

    return `
<div class="panel-h" style="margin-top:6px"><h2 style="font-size:16px">🆕 OKX Candidate Screen — หุ้นที่มีแต่บน OKX ช่วยพอร์ตได้ไหม?</h2></div>
<div style="background:color-mix(in oklch,#a78bfa 8%,var(--panel));border:1px solid color-mix(in oklch,#a78bfa 25%,transparent);border-radius:var(--r);padding:14px 18px;font-size:12.5px;line-height:1.7;color:var(--tx-2)">
  <b style="color:#a78bfa">คำถาม: มีตัวใหม่บน OKX (PLTR/INTC/MSTR/COIN/HOOD) ที่ดีกว่า MU/SNDK เดิมไหม? — ยังไม่มี</b><br>
  เทียบทุกตัวที่ 20% แทน MU/SNDK เดิม ในช่วง ${esc(O.window.start)} ถึง ${esc(O.window.end)} (${O.window.days} วัน — สั้นมาก เพราะ equity perp พวกนี้เพิ่งเปิดเทรดบน OKX) ·
  MSTR/COIN corr BTC สูง (0.75-0.84) เป็น crypto proxy ไม่ใช่ diversifier ตามที่คาด · INTC ตัวเลขดูดีเพราะพุ่ง +134% ในช่วงนี้ช่วงเดียว (idiosyncratic เหมือนบทเรียน ZEC) ไม่ควร extrapolate ·
  <b style="color:var(--warn)">สรุป: ยังไม่มีตัวไหนน่าเปลี่ยนจาก MU/SNDK — เก็บไว้เป็น watchlist รอ history ยาวกว่านี้</b><br>
  ดูเส้นเทียบได้ในกราฟ <b>Equity Curves</b> ด้านบนสุดของหน้า — เส้นประ <b style="color:#a78bfa">core + ${esc(O.candidates_as_satellite[0].name)} (OKX)</b> และ <b style="color:#fb923c">core + ${esc(O.candidates_as_satellite[1].name)} (OKX)</b> แยกออกจากเส้น ⭐ Best v2 ตรงวันที่ ${esc(O.window.start)} (จุดที่เริ่มมีข้อมูลราคาจริงของ OKX) ให้เห็นว่าถ้าสลับ satellite ตอนนั้นจะเป็นยังไงเทียบกับของเดิม
</div>
<div class="matrix-wrap">
  <div style="padding:12px 16px;border-bottom:1px solid var(--line)">
    <div style="font-size:14px;font-weight:600">Correlation vs core (ช่วงร่วม ${O.window.days} วัน)</div>
    <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono);margin-top:2px">ข้อมูลจาก OKX public API โดยตรง (spot + equity perp)</div>
  </div>
  <div class="tbl-wrap" style="border:0;border-radius:0">
  <table class="tbl">
    <thead><tr><th>Ticker</th><th>corr BTC</th><th>corr XRP</th><th>corr ZEC</th><th>corr PAXG</th><th>ผลตอบแทนช่วงนี้</th></tr></thead>
    <tbody>${corrRows}</tbody>
  </table>
  </div>
</div>
<div class="matrix-wrap">
  <div style="padding:12px 16px;border-bottom:1px solid var(--line)">
    <div style="font-size:14px;font-weight:600">Mini-backtest — แทนที่ MU/SNDK ด้วยตัวเดียวที่ 20%</div>
  </div>
  <div class="tbl-wrap" style="border:0;border-radius:0">
  <table class="tbl hist">
    <thead><tr><th>Portfolio</th><th>Sharpe</th><th>CAGR</th><th>MaxDD</th></tr></thead>
    <tbody>
      ${btRow("core only (ไม่มี satellite)", O.core_only, true)}
      ${btRow("core + MU/SNDK (ปัจจุบัน)", O.core_plus_current_satellite)}
      ${candRows}
    </tbody>
  </table>
  </div>
</div>`;
  }

  function btcTradfiOptSectionHtml() {
    const O = window.BTC_TRADFI_OPT;
    if (!O) return `<div style="color:var(--tx-3);padding:12px 4px;font-size:12px">BTC+TradFi optimize: ยังไม่มีข้อมูล — รัน python run_btc_tradfi_optimize.py</div>`;
    const f1 = (v) => (v > 0 ? "+" : "") + v.toFixed(1);
    const f2 = (v) => v.toFixed(2);
    const pc = (v) => v > 0 ? "var(--pos)" : v < 0 ? "var(--neg)" : "var(--tx-3)";
    const W = O.winner;

    const banner = `
<div style="background:color-mix(in oklch,var(--pos) 8%,var(--panel));border:1px solid color-mix(in oklch,var(--pos) 25%,transparent);border-radius:var(--r);padding:16px 20px">
  <div style="font-size:13px;font-weight:600;margin-bottom:10px">🏆 เซตที่ดีที่สุด (rank IS Sharpe → validate OOS) — ${esc(W.label)}</div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
    <div style="background:var(--bg-2);border-radius:6px;padding:12px">
      <div style="font-size:10px;color:var(--tx-3);text-transform:uppercase">IS Sharpe → OOS Sharpe</div>
      <div style="font-family:var(--mono);font-size:19px;font-weight:600;color:var(--pos);margin-top:3px">${f2(W.is.sharpe)} → ${f2(W.oos.sharpe)}</div>
      <div style="font-size:10.5px;color:var(--tx-2);margin-top:2px">${esc(W.window.start)}~${esc(W.window.is_end)} → ${esc(W.window.oos_start)}~${esc(W.window.end)}</div>
    </div>
    <div style="background:var(--bg-2);border-radius:6px;padding:12px">
      <div style="font-size:10px;color:var(--tx-3);text-transform:uppercase">CAGR (ทั้งช่วง)</div>
      <div style="font-family:var(--mono);font-size:19px;font-weight:600;color:${pc(W.all.cagr)};margin-top:3px">${f1(W.all.cagr)}%</div>
      <div style="font-size:10.5px;color:var(--tx-2);margin-top:2px">total ${f1(W.all.total)}% · Sortino ${f2(W.all.sortino)}</div>
    </div>
    <div style="background:var(--bg-2);border-radius:6px;padding:12px">
      <div style="font-size:10px;color:var(--tx-3);text-transform:uppercase">Max Drawdown</div>
      <div style="font-family:var(--mono);font-size:19px;font-weight:600;color:var(--warn);margin-top:3px">${W.all.max_dd.toFixed(1)}%</div>
      <div style="font-size:10.5px;color:var(--tx-2);margin-top:2px">vs BTC เดี่ยว ${O.btc_only_full.max_dd.toFixed(1)}%</div>
    </div>
    <div style="background:var(--bg-2);border-radius:6px;padding:12px">
      <div style="font-size:10px;color:var(--tx-3);text-transform:uppercase">BTC เดี่ยวเต็มช่วง</div>
      <div style="font-family:var(--mono);font-size:19px;font-weight:600;color:var(--tx-2);margin-top:3px">${f2(O.btc_only_full.sharpe)}</div>
      <div style="font-size:10.5px;color:var(--tx-2);margin-top:2px">Sharpe (baseline เทียบ)</div>
    </div>
  </div>
  <div style="font-size:11.5px;color:var(--tx-2);margin-top:12px;line-height:1.6">
    วิธีเลือก: ${esc(O.method)} — เหมือนวิธีที่ใช้หา core (XRP/ZEC/PAXG) เป๊ะ กันปัญหาแบบ XRP25+PAXG75 ที่ IS สวยแต่ OOS พัง<br>
    <b style="color:var(--warn)">ข้อควรระวัง: รอบนี้ยังไม่ได้หักต้นทุนเทรด (cost_bps) แบบ core เดิม (10bps/ครั้ง) และ BTC 50% คือกระจุกตัวสูงกว่าตะกร้าเดิมมาก (XRP/ZEC/PAXG ไม่มีตัวไหนเกิน 40%) — เป็นแนวคิดทางเลือกใหม่ (2 สินทรัพย์เข้มข้น) คนละแบบกับพอร์ต paper ปัจจุบัน ไม่ใช่การแทนที่อัตโนมัติ</b>
  </div>
</div>`;

    const rowFmt = (r) => `<tr>
      <td style="font-weight:600">${esc(r.label)}</td>
      <td class="tnum" style="color:${r.is.sharpe > 1 ? "var(--pos)" : "var(--tx)"}">${f2(r.is.sharpe)}</td>
      <td class="tnum sep" style="font-weight:600;color:${r.oos.sharpe > 0.5 ? "var(--pos)" : "var(--neg)"}">${f2(r.oos.sharpe)}</td>
      <td class="tnum" style="color:${pc(r.all.cagr)}">${f1(r.all.cagr)}%</td>
      <td class="tnum" style="color:var(--warn)">${r.all.max_dd.toFixed(1)}%</td>
    </tr>`;

    const singleRows = O.top15_single.map(rowFmt).join("");
    const pairRows = O.top10_pair.map(rowFmt).join("");
    const shortRows = O.short_history_watchlist.map(rowFmt).join("");

    return `
<div class="panel-h" style="margin-top:6px"><h2 style="font-size:16px">🧪 BTC + TradFi Optimize — grid search + IS/OOS (เหมือนวิธีหา core)</h2></div>
${banner}
<div class="matrix-wrap" style="margin-top:12px">
  <div style="padding:12px 16px;border-bottom:1px solid var(--line)">
    <div style="font-size:14px;font-weight:600">Top 15 — BTC น้ำหนักเดี่ยว x veteran TradFi (50/60/70/80%)</div>
    <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono);margin-top:2px">sort ตาม IS Sharpe · veteran = ประวัติ >= 5 ปีจริงบน Yahoo Finance</div>
  </div>
  <div class="tbl-wrap" style="border:0;border-radius:0">
  <table class="tbl hist">
    <thead><tr><th>Portfolio</th><th>IS Sharpe</th><th>OOS Sharpe</th><th>CAGR (all)</th><th>MaxDD (all)</th></tr></thead>
    <tbody>${singleRows}</tbody>
  </table>
  </div>
</div>
<div class="matrix-wrap">
  <div style="padding:12px 16px;border-bottom:1px solid var(--line)">
    <div style="font-size:14px;font-weight:600">Top 10 — จับคู่ 2 TradFi (BTC 60% + A 20% + B 20%)</div>
  </div>
  <div class="tbl-wrap" style="border:0;border-radius:0">
  <table class="tbl hist">
    <thead><tr><th>Portfolio</th><th>IS Sharpe</th><th>OOS Sharpe</th><th>CAGR (all)</th><th>MaxDD (all)</th></tr></thead>
    <tbody>${pairRows}</tbody>
  </table>
  </div>
</div>
<div class="matrix-wrap">
  <div style="padding:12px 16px;border-bottom:1px solid var(--line)">
    <div style="font-size:14px;font-weight:600">Watchlist ประวัติสั้น (GEV/ARM/NBIS/CRDO, BTC 70% + candidate 30%) — ไม่ปนกริดหลัก</div>
  </div>
  <div class="tbl-wrap" style="border:0;border-radius:0">
  <table class="tbl hist">
    <thead><tr><th>Portfolio</th><th>IS Sharpe</th><th>OOS Sharpe</th><th>CAGR (all)</th><th>MaxDD (all)</th></tr></thead>
    <tbody>${shortRows}</tbody>
  </table>
  </div>
</div>`;
  }

  function longHistorySectionHtml() {
    const L = window.TRADFI_LONGHISTORY;
    if (!L) return `<div style="color:var(--tx-3);padding:12px 4px;font-size:12px">Long-history scan: ยังไม่มีข้อมูล — รัน python run_tradfi_longhistory_scan.py</div>`;
    const f1 = (v) => (v > 0 ? "+" : "") + v.toFixed(1);
    const f3 = (v) => v == null ? "-" : (v > 0 ? "+" : "") + v.toFixed(3);
    const pc = (v) => v > 0 ? "var(--pos)" : v < 0 ? "var(--neg)" : "var(--tx-3)";
    const cc = (v) => v == null ? "-" : `<b style="color:${Math.abs(v) < 0.15 ? "var(--pos)" : Math.abs(v) < 0.35 ? "#f59e0b" : "var(--neg)"}">${v.toFixed(3)}</b>`;

    const rankRows = L.ranking.map((r) => `<tr>
      <td style="font-weight:600">${esc(r.base)}<div style="font-size:10px;color:var(--tx-3);font-weight:400">${esc(r.name)}</div></td>
      <td class="tnum">${cc(r.full_corr)}</td>
      <td class="tnum">${cc(r.down_day_corr)}</td>
      <td class="tnum" style="color:${pc(r.avg_ret_on_btc_down_pct)}">${f3(r.avg_ret_on_btc_down_pct)}%</td>
      <td class="tnum" style="color:var(--tx-3)">${r.days}d (${esc(r.start)})</td>
    </tr>`).join("");

    const btRows = L.backtested.map((r) => {
      const m8 = r["mix_80/20"], m5 = r["mix_50/50"], mb = r.btc_only_same_window;
      return `<tr>
        <td style="font-weight:600">${esc(r.base)}</td>
        <td class="tnum" style="color:var(--tx-3)">${mb.sharpe.toFixed(2)} / ${mb.max_dd.toFixed(1)}%</td>
        <td class="tnum" style="color:${m8.sharpe > mb.sharpe ? "var(--pos)" : "var(--tx)"}">${m8.sharpe.toFixed(2)} / ${m8.max_dd.toFixed(1)}%</td>
        <td class="tnum" style="color:${m5.sharpe > mb.sharpe ? "var(--pos)" : "var(--tx)"}">${m5.sharpe.toFixed(2)} / ${m5.max_dd.toFixed(1)}%</td>
        <td class="tnum" style="color:var(--tx-3)">${r.window.days}d</td>
      </tr>`;
    }).join("");

    return `
<div class="panel-h" style="margin-top:6px"><h2 style="font-size:16px">📚 ประวัติยาวจริง (Yahoo Finance, สูงสุด 10 ปี) — เช็คว่า "hedge" ที่เจอบน OKX จริงไหม</h2></div>
<div style="background:color-mix(in oklch,var(--warn) 10%,var(--panel));border:1px solid color-mix(in oklch,var(--warn) 30%,transparent);border-radius:var(--r);padding:14px 18px;font-size:12.5px;line-height:1.7;color:var(--tx-2)">
  <b style="color:var(--warn)">ผลกลับด้าน: หุ้นกลุ่มเดียวกันที่ดูเหมือน "ช่วยพยุงตอน BTC ร่วง" ในหน้าต่าง OKX 30-75 วัน กลับมี correlation เป็นบวก (+0.09 ถึง +0.31) กับ BTC เมื่อดูประวัติยาวจริงสูงสุด 10 ปี</b><br>
  สรุปคือสัญญาณ "hedge" ที่เจอก่อนหน้าน่าจะเป็นแค่ปรากฏการณ์ชั่วคราวไตรมาสนี้ (หุ้นชิป/AI ขึ้นพอดีตอนคริปโตลง) ไม่ใช่ความสัมพันธ์เชิงโครงสร้างระยะยาว — ระยะยาวหุ้นเทคโนโลยี/อุตสาหกรรมพวกนี้เคลื่อนไหว "ไปทางเดียวกัน" กับ BTC มากกว่าสวนทางกัน (สมเหตุสมผล เพราะทั้งคู่เป็นสินทรัพย์เสี่ยงที่ตอบสนอง risk-on/risk-off คล้ายกัน)<br>
  <b style="color:var(--pos)">แต่ยังมีประโยชน์อยู่</b>: BTC เดี่ยวช่วง 10 ปีเต็ม Sharpe ${L.backtested[0] ? L.backtested[0].btc_only_same_window.sharpe.toFixed(2) : "-"} แต่ MaxDD ลึกถึง -83% (ผ่านขาลงปี 2018/2022 มาแล้ว) — ผสม 50/50 กับหุ้นพวกนี้แม้ corr เป็นบวก ก็ยังลด MaxDD ได้มาก (เหลือ -32% ถึง -68% แล้วแต่ตัว) เพราะความผันผวนโดยรวมต่ำกว่า BTC เดี่ยว ไม่ใช่เพราะสวนทางกัน — เป็นการกระจายความเสี่ยงแบบ "เจือจาง" ไม่ใช่ "hedge" แท้
</div>
<div class="matrix-wrap">
  <div style="padding:12px 16px;border-bottom:1px solid var(--line)">
    <div style="font-size:14px;font-weight:600">Correlation ระยะยาวจริง vs BTC (Yahoo Finance, สูงสุด 10 ปี)</div>
  </div>
  <div class="tbl-wrap" style="border:0;border-radius:0">
  <table class="tbl">
    <thead><tr><th>Ticker</th><th>corr เต็มช่วง</th><th>corr วัน BTC แดง</th><th>avg return วัน BTC แดง</th><th>ประวัติ (เริ่ม)</th></tr></thead>
    <tbody>${rankRows}</tbody>
  </table>
  </div>
</div>
<div class="matrix-wrap">
  <div style="padding:12px 16px;border-bottom:1px solid var(--line)">
    <div style="font-size:14px;font-weight:600">Backtest BTC+candidate บนประวัติยาวจริง (Sharpe / MaxDD)</div>
  </div>
  <div class="tbl-wrap" style="border:0;border-radius:0">
  <table class="tbl hist">
    <thead><tr><th>Ticker</th><th>BTC เดี่ยว (ช่วงเดียวกัน)</th><th>80/20</th><th>50/50</th><th>ช่วงข้อมูล</th></tr></thead>
    <tbody>${btRows}</tbody>
  </table>
  </div>
  <div style="font-size:11px;color:var(--tx-3);padding:10px 16px">สีเขียว = Sharpe ดีกว่า BTC เดี่ยวในช่วงเดียวกัน · GEV/ARM/NBIS/CRDO ยังมีประวัติไม่ถึง 3 ปี (IPO/แยกตัวไม่นาน) ตัวที่ผ่านมาแล้วหลายรอบตลาดจริง (SKHYNIX/LLY/CIEN/COST/CSCO/XLE/GLW/AMAT/WDC/ASML/INTC/MRVL/SOXL/VRT/BE) น่าเชื่อถือกว่า</div>
</div>`;
  }

  function tradfiHedgeSectionHtml() {
    const H = window.TRADFI_BTC_HEDGE;
    if (!H) return `<div style="color:var(--tx-3);padding:12px 4px;font-size:12px">TradFi vs BTC hedge scan: ยังไม่มีข้อมูล — รัน python run_tradfi_vs_btc_scan.py</div>`;
    const f1 = (v) => (v > 0 ? "+" : "") + v.toFixed(1);
    const f3 = (v) => v == null ? "-" : (v > 0 ? "+" : "") + v.toFixed(3);
    const pc = (v) => v > 0 ? "var(--pos)" : v < 0 ? "var(--neg)" : "var(--tx-3)";
    const cc = (v) => v == null ? "-" : `<b style="color:${Math.abs(v) < 0.15 ? "var(--pos)" : Math.abs(v) < 0.4 ? "#f59e0b" : "var(--neg)"}">${v.toFixed(2)}</b>`;

    const rankRows = H.ranking.slice(0, 15).map((r) => `<tr>
      <td style="font-weight:600">${esc(r.base)}</td>
      <td class="tnum" style="color:${pc(r.avg_ret_on_btc_down_pct)};font-weight:600">${f3(r.avg_ret_on_btc_down_pct)}%</td>
      <td class="tnum">${cc(r.down_day_corr)}</td>
      <td class="tnum">${cc(r.full_corr)}</td>
      <td class="tnum" style="color:var(--tx-3)">${r.days}d (${r.n_btc_down_days} วันแดง)</td>
    </tr>`).join("");

    const btRows = H.backtested.map((r) => {
      const m8 = r["mix_80/20"], m5 = r["mix_50/50"];
      return `<tr>
        <td style="font-weight:600">BTC + ${esc(r.base)}</td>
        <td class="tnum" style="color:${m8.sharpe > 0.5 ? "var(--pos)" : m8.sharpe < 0 ? "var(--neg)" : "var(--tx)"}">${m8.sharpe.toFixed(2)}</td>
        <td class="tnum" style="color:var(--warn)">${m8.max_dd.toFixed(1)}%</td>
        <td class="tnum" style="color:${m5.sharpe > 0.5 ? "var(--pos)" : m5.sharpe < 0 ? "var(--neg)" : "var(--tx)"}">${m5.sharpe.toFixed(2)}</td>
        <td class="tnum" style="color:var(--warn)">${m5.max_dd.toFixed(1)}%</td>
        <td class="tnum" style="color:var(--tx-3)">${r.window.days}d</td>
      </tr>`;
    }).join("");

    return `
<div class="panel-h" style="margin-top:6px"><h2 style="font-size:16px">🛡️ TradFi vs BTC — หาตัวช่วยพยุงตอน BTC ร่วง</h2></div>
<div style="background:color-mix(in oklch,var(--neg) 10%,var(--panel));border:1px solid color-mix(in oklch,var(--neg) 30%,transparent);border-radius:var(--r);padding:14px 18px;font-size:12.5px;line-height:1.7;color:var(--tx-2)">
  <b style="color:var(--neg)">ข้อเท็จจริงสำคัญก่อน: BTC เดี่ยวช่วง ${esc(H.btc_window.start)} ถึง ${esc(H.btc_window.end)} (${H.btc_window.days} วัน) แย่มาก — Sharpe ${H.btc_only.sharpe}, CAGR ${f1(H.btc_only.cagr)}%, MaxDD ${H.btc_only.max_dd}%</b><br>
  ถ้าจะยึด BTC เป็นแกนหลักตามที่คิดไว้ ต้องรู้ก่อนว่าช่วง ~10 เดือนล่าสุดนี้ BTC เดี่ยวๆ ลงมาลึกกว่าครึ่ง — นี่คือเหตุผลที่การหาตัวช่วยพยุงสำคัญจริง ไม่ใช่แค่ทฤษฎี
</div>
<div style="background:color-mix(in oklch,#38bdf8 8%,var(--panel));border:1px solid color-mix(in oklch,#38bdf8 25%,transparent);border-radius:var(--r);padding:14px 18px;font-size:12.5px;line-height:1.7;color:var(--tx-2);margin-top:8px">
  สแกนหุ้น/ETF ทุกตัวใน category "TradFi" ของ OKX จริง (instCategory=3, ${H.n_tradfi_total} ตัว — AAPL/MSFT/NVDA/TSLA/SPY/QQQ ฯลฯ) ไม่ใช่แค่ที่ volume สูงเหมือนรอบก่อน (เพราะรอบก่อนเหรียญ meme volume สูงกว่าหุ้นมาก บังหุ้นไปหมด) วัดผลสำเร็จ ${H.n_scanned_ok} ตัว โดยดู 2 อย่าง: (1) correlation ทั่วไป (2) correlation + ผลตอบแทนเฉพาะ "วันที่ BTC แดง" เท่านั้น (ตรงประเด็นกว่า เพราะต้องการตัวที่ช่วยตอนวิกฤตจริงๆ ไม่ใช่แค่ไม่ล้อ BTC ทั่วไป)<br>
  <b style="color:var(--warn)">คำเตือนสำคัญ: หุ้น/ETF เหล่านี้เพิ่งเปิดเทรดบน OKX ไม่นาน ประวัติส่วนใหญ่แค่ 30-75 วัน (น้อยกว่า MU/SNDK ที่เคยเตือนไปอีก) ผลอาจเป็นแค่ "หุ้นชิป/AI ร้อนพอดีช่วงที่คริปโตร่วง" ชั่วคราว ไม่ใช่ความสัมพันธ์เชิงโครงสร้างจริง ยังสรุปเปลี่ยนพอร์ตไม่ได้</b>
</div>
<div class="matrix-wrap">
  <div style="padding:12px 16px;border-bottom:1px solid var(--line)">
    <div style="font-size:14px;font-weight:600">Top 15 ที่ "ช่วยพยุง" ตอน BTC แดงมากที่สุด</div>
    <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono);margin-top:2px">avg return = ผลตอบแทนเฉลี่ยของตัวนั้น เฉพาะวันที่ BTC ติดลบ (บวก = ช่วยพยุงจริง)</div>
  </div>
  <div class="tbl-wrap" style="border:0;border-radius:0">
  <table class="tbl">
    <thead><tr><th>Ticker</th><th>avg return วัน BTC แดง</th><th>corr วัน BTC แดง</th><th>corr เต็มช่วง</th><th>ประวัติ</th></tr></thead>
    <tbody>${rankRows}</tbody>
  </table>
  </div>
</div>
<div class="matrix-wrap">
  <div style="padding:12px 16px;border-bottom:1px solid var(--line)">
    <div style="font-size:14px;font-weight:600">Backtest BTC + candidate เทียบ BTC เดี่ยว (Sharpe ${H.btc_only.sharpe}, MaxDD ${H.btc_only.max_dd}%)</div>
  </div>
  <div class="tbl-wrap" style="border:0;border-radius:0">
  <table class="tbl hist">
    <thead><tr><th>Portfolio</th><th>80/20 Sharpe</th><th>80/20 MaxDD</th><th>50/50 Sharpe</th><th>50/50 MaxDD</th><th>ช่วงข้อมูล</th></tr></thead>
    <tbody>${btRows}</tbody>
  </table>
  </div>
  <div style="font-size:11px;color:var(--tx-3);padding:10px 16px">ทุกคู่ผสม DD ตื้นกว่า BTC เดี่ยวมาก แต่ส่วนใหญ่เพราะ "เจือจาง" ความผันผวน BTC เชิงกลไก ไม่ใช่หลักฐานว่าตัวนั้นเป็น hedge เชิงโครงสร้าง — ตัวที่ Sharpe เป็นบวกสม่ำเสมอทั้ง 2 น้ำหนัก (เช่น CIEN, SKHYNIX) น่าติดตามต่อ แต่ประวัติแค่ 30 วันเศษ ยังไม่พอเชื่อถือ</div>
</div>`;
  }

  function broadScanSectionHtml() {
    const B = window.BROAD_SCAN;
    if (!B) return `<div style="color:var(--tx-3);padding:12px 4px;font-size:12px">Broad scan: ยังไม่มีข้อมูล — รัน python run_broad_asset_scan.py</div>`;
    const f1 = (v) => (v > 0 ? "+" : "") + v.toFixed(1);
    const pc = (v) => v > 0 ? "var(--pos)" : v < 0 ? "var(--neg)" : "var(--tx-3)";
    const cc = (v) => v == null ? "-" : `<b style="color:${Math.abs(v) < 0.3 ? "var(--pos)" : Math.abs(v) < 0.6 ? "#f59e0b" : "var(--neg)"}">${v.toFixed(2)}</b>`;
    const ddColor = (v) => v < -50 ? "var(--neg)" : v < -30 ? "#f59e0b" : "var(--tx)";

    const corrRows = B.corr_ranking.slice(0, 15).map((r) => `<tr>
      <td style="font-weight:600">${esc(r.base)} <span style="color:var(--tx-3);font-weight:400;font-size:10.5px">${r.kind}</span></td>
      <td class="tnum">${cc(r.corr_btc)}</td>
      <td class="tnum">${cc(r.corr_xrp)}</td>
      <td class="tnum">${cc(r.corr_zec)}</td>
      <td class="tnum">${cc(r.corr_paxg)}</td>
      <td class="tnum" style="color:var(--tx-3)">${r.days}d</td>
      <td class="tnum" style="color:${pc(r.ret_window_pct)}">${f1(r.ret_window_pct)}%</td>
      <td class="tnum" style="color:var(--tx-3)">$${(r.vol24h_usdt / 1e6).toFixed(1)}M</td>
    </tr>`).join("");

    const btRows = B.backtested.map((r) => `<tr>
      <td style="font-weight:600">core + ${esc(r.base)} (20%)</td>
      <td class="tnum" style="font-weight:600;color:${r.sharpe > 0.5 ? "var(--pos)" : r.sharpe < 0 ? "var(--neg)" : "var(--tx)"}">${r.sharpe.toFixed(2)}</td>
      <td class="tnum" style="color:${pc(r.cagr)}">${f1(r.cagr)}%</td>
      <td class="tnum" style="color:${ddColor(r.max_dd)};font-weight:600">${r.max_dd.toFixed(1)}%</td>
      <td class="tnum" style="color:var(--tx-3)">${r.window.days}d</td>
    </tr>`).join("");

    return `
<div class="panel-h" style="margin-top:6px"><h2 style="font-size:16px">🌐 Broad Asset Scan — สแกนทั้งจักรวาล OKX (ไม่ใช่แค่ 5 ตัวที่เคยลอง)</h2></div>
<div style="background:color-mix(in oklch,#38bdf8 8%,var(--panel));border:1px solid color-mix(in oklch,#38bdf8 25%,transparent);border-radius:var(--r);padding:14px 18px;font-size:12.5px;line-height:1.7;color:var(--tx-2)">
  <b style="color:#38bdf8">คำถาม: ขยายค้นทั้งจักรวาล OKX (ไม่ใช่แค่ PLTR/INTC/MSTR/COIN/HOOD) เจอตัวที่ดีกว่า MU/SNDK ไหม? — ยังไม่เจอ</b><br>
  สแกนจาก instrument ทั้งหมดบน OKX ${B.n_universe_total} ตัว (SPOT-USDT + SWAP ที่ไม่มี spot คู่ เช่นหุ้น) คัดตาม volume เหลือ ${B.n_after_filter} ตัว → ดึงราคาสำเร็จ ${B.n_scanned_ok} ตัว → เอา corr ต่ำสุด ${B.n_backtested} ตัวมา backtest จริง<br>
  <b style="color:var(--warn)">พบว่า:</b> ตัวที่ correlation ต่ำสุดเกือบทั้งหมดเป็นเหรียญเล็ก/ใหม่ (เช่น RAVE, BEAT, TRIA, JELLYJELLY, HOME, OPG, RLS) อายุการเทรดสั้น (79-299 วัน) และเคลื่อนไหวสุดขั้ว — บางตัวบวก +465% ถึง +620% บางตัวติดลบ -60% ถึง -98% ในช่วงเดียวกัน<br>
  <b style="color:var(--neg)">นี่ไม่ใช่ diversifier จริง — เป็นเหรียญ momentum/hype เดี่ยวๆ ที่ "บังเอิญ" ไม่วิ่งตาม BTC เพราะมันวิ่งตามกระแสตัวเอง (pump/dump รอบตัวเอง) เหมือนบทเรียน ZEC ที่ห้าม extrapolate</b> ดูตัวอย่าง: RAVE Sharpe ดูดี 1.34 แต่ MaxDD ของพอร์ตรวมลึกถึง -92.5% — Sharpe เดียวไม่บอกความเสี่ยงจริง ต้องดู MaxDD คู่กันเสมอ<br>
  <b style="color:var(--pos)">สรุป: กว้างขึ้นแค่ไหนก็ยังไม่เจอตัวไหนที่ปลอดภัยกว่า MU/SNDK เดิม (หุ้นจริง มีประวัติยาวกว่า ผันผวนน้อยกว่ามาก) — คงพอร์ตเดิมไว้</b><br>
  <span style="color:var(--tx-3);font-size:11px">หมายเหตุ: core-only ในหน้าต่างข้อมูล OKX ล่าสุด (~${B.core_only.days} วัน) วัดได้ Sharpe ${B.core_only.sharpe.toFixed(2)} ต่ำกว่าค่า walk-forward เต็ม 800 วันที่เคยรายงาน (1.9-2.0) มาก — เป็นแค่ช่วงสั้นล่าสุดที่ core เจอ drawdown ไม่ใช่ core เสียหาย ควรเฝ้าดูต่อ ไม่ใช่ข้อสรุปใหม่</span>
</div>
<div class="matrix-wrap">
  <div style="padding:12px 16px;border-bottom:1px solid var(--line)">
    <div style="font-size:14px;font-weight:600">Correlation ต่ำสุด 15 อันดับ (จาก ${B.n_scanned_ok} ตัวที่สแกน)</div>
    <div style="font-size:11px;color:var(--tx-3);font-family:var(--mono);margin-top:2px">ข้อมูลจาก OKX public API โดยตรง · vol = ปริมาณเทรด 24 ชม.</div>
  </div>
  <div class="tbl-wrap" style="border:0;border-radius:0">
  <table class="tbl">
    <thead><tr><th>Ticker</th><th>corr BTC</th><th>corr XRP</th><th>corr ZEC</th><th>corr PAXG</th><th>ประวัติ</th><th>ผลตอบแทนช่วงนี้</th><th>Volume 24h</th></tr></thead>
    <tbody>${corrRows}</tbody>
  </table>
  </div>
</div>
<div class="matrix-wrap">
  <div style="padding:12px 16px;border-bottom:1px solid var(--line)">
    <div style="font-size:14px;font-weight:600">Mini-backtest — top ${B.n_backtested} ตัว corr ต่ำสุด แทนที่ MU/SNDK ด้วยตัวเดียวที่ 20%</div>
  </div>
  <div class="tbl-wrap" style="border:0;border-radius:0">
  <table class="tbl hist">
    <thead><tr><th>Portfolio</th><th>Sharpe</th><th>CAGR</th><th>MaxDD</th><th>ช่วงข้อมูล</th></tr></thead>
    <tbody>
      <tr><td style="color:var(--tx-3)">core + MU/SNDK (ปัจจุบัน)</td><td class="tnum" style="font-weight:600;color:var(--pos)">${B.core_plus_current_satellite.sharpe.toFixed(2)}</td><td class="tnum" style="color:${pc(B.core_plus_current_satellite.cagr)}">${f1(B.core_plus_current_satellite.cagr)}%</td><td class="tnum" style="color:var(--tx)">${B.core_plus_current_satellite.max_dd.toFixed(1)}%</td><td class="tnum" style="color:var(--tx-3)">${B.core_plus_current_satellite.days}d</td></tr>
      ${btRows}
    </tbody>
  </table>
  </div>
</div>`;
  }

  })();
