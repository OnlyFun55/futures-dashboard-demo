/* ============================================================
   charts.js — Lightweight Charts (TradingView) helpers
   Requires window.LightweightCharts (v4) + window.BT
   ============================================================ */
(function () {
  "use strict";
  const LWC = () => window.LightweightCharts;

  const FONT = "'IBM Plex Mono','SFMono-Regular',monospace";

  function baseOptions(extra) {
    return Object.assign({
      layout: {
        background: { type: "solid", color: "transparent" },
        textColor: "#8b93a7",
        fontFamily: FONT,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.035)" },
        horzLines: { color: "rgba(255,255,255,0.045)" },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.07)", scaleMargins: { top: 0.12, bottom: 0.12 } },
      timeScale: { borderColor: "rgba(255,255,255,0.07)", timeVisible: false, rightOffset: 4, fixLeftEdge: true },
      crosshair: {
        mode: 1,
        vertLine: { color: "rgba(255,255,255,0.25)", width: 1, style: 3, labelBackgroundColor: "#2a2e3a" },
        horzLine: { color: "rgba(255,255,255,0.25)", width: 1, style: 3, labelBackgroundColor: "#2a2e3a" },
      },
      handleScroll: true, handleScale: true,
    }, extra || {});
  }

  function autoResize(chart, el) {
    function apply() {
      const w = Math.floor(el.offsetWidth || el.clientWidth || 0);
      const h = Math.floor(el.offsetHeight || el.clientHeight || 0);
      if (w > 0 && h > 0) chart.applyOptions({ width: w, height: h });
    }
    apply(); // fire immediately in case already laid out
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return ro;
  }

  const pctFmt = { type: "custom", formatter: (v) => (v >= 0 ? "+" : "") + v.toFixed(0) + "%" };
  const usdFmt = { type: "custom", formatter: (v) => "$" + (v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(0)) };

  // ── COMPARISON: normalized return % overlay ───────────────
  function comparisonChart(el, strategies, focusIds) {
    el.innerHTML = "";
    const chart = LWC().createChart(el, baseOptions({
      width: el.clientWidth, height: el.clientHeight,
      rightPriceScale: { borderColor: "rgba(255,255,255,0.07)", scaleMargins: { top: 0.1, bottom: 0.08 } },
    }));
    const zero = chart.addLineSeries({ color: "rgba(255,255,255,0.18)", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    zero.setData(window.BT.dates.map((d) => ({ time: d, value: 0 })));

    const series = {};
    strategies.forEach((s) => {
      const dim = focusIds && focusIds.length && focusIds.indexOf(s.id) === -1;
      const ls = chart.addLineSeries({
        color: dim ? "rgba(255,255,255,0.14)" : s.color,
        lineWidth: dim ? 1 : 2,
        priceFormat: pctFmt,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerRadius: 3,
        title: s.name,
      });
      ls.setData(s.equityRet);
      series[s.id] = ls;
    });
    chart.timeScale().fitContent();
    const ro = autoResize(chart, el);
    return { chart, series, ro, destroy: () => { ro.disconnect(); chart.remove(); } };
  }

  // ── SVG sub-chart (equity / drawdown) — no timing/dimension issues ──
  function drawSubChart(el, values, lineColor, fillColor, mode) {
    if (!values || values.length < 2) { el.innerHTML = ""; return; }
    const n = values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const rng = (max - min) || 1;
    const VW = 1000, VH = 100;  // viewBox coords (unitless)
    const pl = 2, pr = 58, pt = 4, pb = 16;
    const cw = VW - pl - pr, ch = VH - pt - pb;
    const X = i => pl + (i / (n - 1)) * cw;
    const Y = v => pt + (1 - (v - min) / rng) * ch;

    const pts    = values.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
    const fill   = `${X(0)},${pt+ch} ${pts} ${X(n-1)},${pt+ch}`;
    const gid    = "g_" + mode + "_" + Math.random().toString(36).slice(2,6);

    // Y-axis labels
    const labels = [0, 0.5, 1].map(t => {
      const v = min + t * rng;
      const y = pt + (1 - t) * ch;
      const txt = mode === "usd"
        ? (Math.abs(v) >= 1000 ? "$" + (v/1000).toFixed(1) + "k" : "$" + v.toFixed(0))
        : (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
      return `<text x="${VW - pr + 4}" y="${y + 3.5}" fill="rgba(155,163,181,0.8)" font-size="8" font-family="'IBM Plex Mono',monospace">${txt}</text>`;
    }).join("");

    // Zero / start-capital reference line
    let refLine = "";
    if (mode === "pct" && min < 0) {
      const zy = Y(0);
      refLine = `<line x1="${pl}" y1="${zy.toFixed(1)}" x2="${pl+cw}" y2="${zy.toFixed(1)}" stroke="rgba(255,255,255,0.18)" stroke-width="0.6" stroke-dasharray="3,3"/>`;
    } else if (mode === "usd" && min < 1000 && max > 1000) {
      const sy = Y(1000);
      refLine = `<line x1="${pl}" y1="${sy.toFixed(1)}" x2="${pl+cw}" y2="${sy.toFixed(1)}" stroke="rgba(251,191,36,0.4)" stroke-width="0.6" stroke-dasharray="3,3"/>`;
    }

    el.innerHTML = `<svg viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="none"
      style="width:100%;height:100%;display:block;overflow:visible"
      xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${lineColor}" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="${lineColor}" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      <polygon points="${fill}" fill="url(#${gid})"/>
      ${refLine}
      <polyline points="${pts}" fill="none" stroke="${lineColor}" stroke-width="1.8" stroke-linejoin="round"/>
      ${labels}
    </svg>`;
  }

  // ── PER-STRATEGY: price + equity + drawdown (synced) ──────
  function getDim(el, fallbackH) {
    return { w: el.offsetWidth || el.clientWidth || 800, h: el.offsetHeight || el.clientHeight || fallbackH };
  }

  function strategyCharts(els, s) {
    const out = { charts: [], ros: [] };
    // price
    const pd = getDim(els.price, 400);
    const priceChart = LWC().createChart(els.price, baseOptions({
      width: pd.w, height: pd.h,
    }));
    const candle = priceChart.addCandlestickSeries({
      upColor: "#26a69a", downColor: "#ef5350",
      borderUpColor: "#26a69a", borderDownColor: "#ef5350",
      wickUpColor: "#26a69a", wickDownColor: "#ef5350",
    });
    // Draw equity & drawdown FIRST (before any LWC ops that might throw)
    drawSubChart(els.equity,   s.equityUsd.map(p => p.value), s.color,   s.colorDim,                  "usd");
    drawSubChart(els.drawdown, s.drawdown.map(p => p.value),  "#f87171", "rgba(248,113,113,0.28)",     "pct");

    candle.setData(window.BT.price);
    s.overlays.forEach((o) => {
      try {
        const ls = priceChart.addLineSeries({ color: o.color, lineWidth: 1.6, priceLineVisible: false, lastValueVisible: false, title: o.name, crosshairMarkerVisible: false });
        ls.setData(o.data);
      } catch(e) {}
    });
    try {
      // Sort markers by time before setting (LWC requires ascending order)
      const sorted = [...s.markers].sort((a, b) => a.time < b.time ? -1 : 1);
      candle.setMarkers(sorted);
    } catch(e) { console.warn("markers:", e.message); }

    priceChart.timeScale().fitContent();
    out.ros.push(autoResize(priceChart, els.price));
    out.charts = [priceChart];
    out.destroy = () => { out.ros.forEach((r) => r.disconnect()); priceChart.remove(); };
    return out;
  }

  // mini sparkline (canvas) for metric cards / leaderboard
  function sparkline(canvas, series, color, opts) {
    opts = opts || {};
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const vals = series.map((p) => p.value);
    const min = Math.min(...vals), max = Math.max(...vals);
    const rng = (max - min) || 1;
    const pad = 2;
    const X = (i) => pad + (i / (vals.length - 1)) * (w - 2 * pad);
    const Y = (v) => h - pad - ((v - min) / rng) * (h - 2 * pad);
    // zero line
    if (min < 0 && max > 0) {
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1; ctx.beginPath();
      ctx.moveTo(0, Y(0)); ctx.lineTo(w, Y(0)); ctx.stroke();
    }
    // area
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, hexA(color, 0.28));
    grad.addColorStop(1, hexA(color, 0));
    ctx.beginPath();
    ctx.moveTo(X(0), Y(vals[0]));
    for (let i = 1; i < vals.length; i++) ctx.lineTo(X(i), Y(vals[i]));
    ctx.lineTo(X(vals.length - 1), h - pad); ctx.lineTo(X(0), h - pad); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
    // line
    ctx.beginPath();
    ctx.moveTo(X(0), Y(vals[0]));
    for (let i = 1; i < vals.length; i++) ctx.lineTo(X(i), Y(vals[i]));
    ctx.strokeStyle = color; ctx.lineWidth = opts.lw || 1.5;
    ctx.lineJoin = "round"; ctx.stroke();
  }
  function hexA(hex, a) {
    const m = hex.replace("#", "");
    const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  window.BTCharts = { comparisonChart, strategyCharts, sparkline, hexA };
})();
