// ════════════════════════════════════════════════════════════════
// dashboard-forecast.js  —  EoS Timeline Forecasting
// ════════════════════════════════════════════════════════════════
(function() {
  let _lineChart = null;

  function addMonths(date, n) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + n);
    return d;
  }

  function getEOL(osStr, mode) {
    if (!osStr) return null;
    const lower = osStr.toLowerCase();
    // Reuse the same EOL lookup — access parent scope via window reference
    // (dashboard-support.js must load first; we duplicate a minimal lookup here)
    const EOL_MINI = {
      'windows server 2008': mode==='ext'?'2020-01-14':'2015-01-13',
      'windows server 2012': mode==='ext'?'2023-10-10':'2018-10-09',
      'windows server 2016': mode==='ext'?'2027-01-12':'2022-01-11',
      'windows server 2019': mode==='ext'?'2029-01-09':'2024-01-09',
      'red hat linux 5':  mode==='ext'?'2020-11-30':'2013-01-08',
      'red hat linux 6':  mode==='ext'?'2024-06-30':'2016-05-10',
      'red hat linux 7':  mode==='ext'?'2026-06-30':'2019-08-06',
      'centos 6': '2020-11-30', 'centos 7': '2024-06-30',
      'ubuntu 18.04': mode==='ext'?'2028-04-02':'2023-04-02',
      'ubuntu 20.04': mode==='ext'?'2030-04-02':'2025-04-02',
      'esxi 6.0': '2020-03-12', 'esxi 6.5': '2021-10-15',
      'esxi 6.7': '2022-10-15', 'esxi 7.0': '2025-04-02',
    };
    for (const [k,v] of Object.entries(EOL_MINI)) {
      if (lower.includes(k)) return v ? new Date(v) : null;
    }
    return null;
  }

  function classify(eolDate, checkDate) {
    if (!eolDate) return 'na';
    const inSix = addMonths(checkDate, 1);
    if (eolDate > inSix)   return 'ok';
    if (eolDate > checkDate) return 'tbu';
    return 'ns';
  }

  function render(summary) {
    const incrMonths = parseInt(document.getElementById('forecast-increment')?.value || '6');
    const showPct    = document.getElementById('forecast-pct')?.checked;
    const now        = new Date();
    const t1         = addMonths(now, incrMonths);
    const t2         = addMonths(now, incrMonths*2);
    const t3         = addMonths(now, incrMonths*3);

    const assets = [
      ...summary.all_vms.map(v => ({ name:v.vm_name, os:v.os_full, type:'VM' })),
      ...summary.host_rows.map(h => ({ name:h.host_name, os:h.esx_version, type:'ESX' })),
    ];

    // Per-asset forecast
    const assetRows = assets.slice(0, 200).map(a => {
      const eol = getEOL(a.os, 'std');
      return {
        name: a.name, os: a.os ? a.os.slice(0,30) : 'Unknown',
        today: classify(eol, now),
        p1:    classify(eol, t1),
        p2:    classify(eol, t2),
        p3:    classify(eol, t3),
      };
    });

    fillTable('tbl-forecast-assets', assetRows, [
      (_,i) => i+1,
      r => r.name, r => r.os,
      r => statusCell(r.today), r => statusCell(r.p1),
      r => statusCell(r.p2),   r => statusCell(r.p3),
    ]);

    // Summary table by OS group
    const osGroups = new Map();
    assets.forEach(a => {
      const key = a.os ? a.os.slice(0,35) : 'Unknown';
      if (!osGroups.has(key)) osGroups.set(key, { os:key, count:0, today:null, p1:null, p2:null, p3:null });
      const g = osGroups.get(key);
      g.count++;
      const eol = getEOL(a.os, 'std');
      g.today = classify(eol, now);
      g.p1    = classify(eol, t1);
      g.p2    = classify(eol, t2);
      g.p3    = classify(eol, t3);
    });

    const forecastRows = Array.from(osGroups.values()).sort((a,b)=>b.count-a.count).slice(0,20);
    fillTable('tbl-forecast', forecastRows, [
      r => r.os.split(' ').slice(0,2).join(' '), r => r.os.split(' ').slice(-1)[0],
      r => '—', r => `<strong>${r.count}</strong>`,
      r => statusCell(r.today), r => statusCell(r.p1),
      r => statusCell(r.p2),   r => statusCell(r.p3), r => '—'
    ]);

    // Timeline counts
    const counts = [now, t1, t2, t3].map(date => {
      let ok=0, tbu=0, ns=0, na=0;
      assets.forEach(a => {
        const s = classify(getEOL(a.os,'std'), date);
        if (s==='ok') ok++; else if (s==='tbu') tbu++; else if (s==='ns') ns++; else na++;
      });
      return {ok,tbu,ns,na};
    });

    renderLine(counts, [now,t1,t2,t3], incrMonths);
  }

  function statusCell(s) {
    const map = { ok:'status-ok-text', tbu:'status-tbu-text', ns:'status-ns-text', na:'status-na-text' };
    const label = { ok:'OK', tbu:'TBU', ns:'NS', na:'N/A' };
    return `<span class="${map[s]||''}">${label[s]||s.toUpperCase()}</span>`;
  }

  function renderLine(counts, dates, incrMonths) {
    if (_lineChart) { _lineChart.destroy(); _lineChart = null; }
    const ctx = document.getElementById('chart-forecast-line');
    if (!ctx) return;

    const labels = [`Today`, `+${incrMonths}M`, `+${incrMonths*2}M`, `+${incrMonths*3}M`];
    _lineChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label:'OK',  data: counts.map(c=>c.ok),  borderColor:'#22c55e', backgroundColor:'rgba(34,197,94,0.1)',  tension:0.3, fill:true },
          { label:'TBU', data: counts.map(c=>c.tbu), borderColor:'#f59e0b', backgroundColor:'rgba(245,158,11,0.1)', tension:0.3, fill:true },
          { label:'NS',  data: counts.map(c=>c.ns),  borderColor:'#ef4444', backgroundColor:'rgba(239,68,68,0.1)',  tension:0.3, fill:true },
          { label:'N/A', data: counts.map(c=>c.na),  borderColor:'#94a3b8', backgroundColor:'rgba(148,163,184,0.1)',tension:0.3, fill:true },
        ]
      },
      options: { responsive:true, interaction:{ mode:'index', intersect:false },
        plugins:{ legend:{ position:'top' } },
        scales:{ y:{ beginAtZero:true, grid:{ color:'#f1f5f9' } }, x:{ grid:{ display:false } } } }
    });
  }

  document.getElementById('forecast-increment')?.addEventListener('change', () => {
    if (window.APP_STATE.loaded) render(window.APP_STATE.summary);
  });
  document.getElementById('forecast-pct')?.addEventListener('change', () => {
    if (window.APP_STATE.loaded) render(window.APP_STATE.summary);
  });

  document.addEventListener('rvtools:dataready', e => render(e.detail.summary));
  document.addEventListener('rvtools:viewchange', e => {
    if (e.detail.view === 'forecast' && window.APP_STATE.loaded)
      setTimeout(() => render(window.APP_STATE.summary), 50);
  });
})();
