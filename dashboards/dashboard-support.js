// ════════════════════════════════════════════════════════════════
// dashboard-support.js  —  End of Support Analysis
// ════════════════════════════════════════════════════════════════
(function() {
  let _charts = {};

  // Comprehensive EOL database
  const EOL_DB = {
    // Windows
    'windows server 2000':  { eol:'2005-06-30', ext:'2010-07-13' },
    'windows server 2003':  { eol:'2010-07-13', ext:'2015-07-14' },
    'windows server 2008':  { eol:'2015-01-13', ext:'2020-01-14' },
    'windows server 2008 r2':{ eol:'2015-01-13', ext:'2020-01-14' },
    'windows server 2012':  { eol:'2018-10-09', ext:'2023-10-10' },
    'windows server 2012 r2':{ eol:'2018-10-09', ext:'2023-10-10' },
    'windows server 2016':  { eol:'2022-01-11', ext:'2027-01-12' },
    'windows server 2019':  { eol:'2024-01-09', ext:'2029-01-09' },
    'windows server 2022':  { eol:'2026-10-13', ext:'2031-10-14' },
    // Linux RHEL
    'red hat enterprise linux 5': { eol:'2013-01-08', ext:'2020-11-30' },
    'red hat linux 5':        { eol:'2013-01-08', ext:'2020-11-30' },
    'red hat enterprise linux 6': { eol:'2016-05-10', ext:'2024-06-30' },
    'red hat linux 6':        { eol:'2016-05-10', ext:'2024-06-30' },
    'red hat enterprise linux 7': { eol:'2019-08-06', ext:'2026-06-30' },
    'red hat linux 7':        { eol:'2019-08-06', ext:'2026-06-30' },
    'red hat enterprise linux 8': { eol:'2024-05-31', ext:'2029-05-31' },
    'red hat enterprise linux 9': { eol:'2027-05-31', ext:'2032-05-31' },
    // CentOS
    'centos 6': { eol:'2020-11-30', ext:'2020-11-30' },
    'centos 7': { eol:'2024-06-30', ext:'2024-06-30' },
    'centos 8': { eol:'2021-12-31', ext:'2021-12-31' },
    // Ubuntu
    'ubuntu 16.04': { eol:'2021-04-30', ext:'2024-04-30' },
    'ubuntu 18.04': { eol:'2023-04-02', ext:'2028-04-02' },
    'ubuntu 20.04': { eol:'2025-04-02', ext:'2030-04-02' },
    'ubuntu 22.04': { eol:'2027-04-01', ext:'2032-04-01' },
    // SUSE
    'suse linux enterprise server 10': { eol:'2013-07-31', ext:'2016-07-31' },
    'suse linux enterprise server 11': { eol:'2019-03-31', ext:'2022-03-31' },
    'suse linux enterprise server 12': { eol:'2024-10-31', ext:'2027-10-31' },
    'suse linux enterprise server 15': { eol:'2028-07-31', ext:'2031-07-31' },
    // ESXi
    'esxi 5.0': { eol:'2016-05-25', ext:'2018-05-25' },
    'esxi 5.1': { eol:'2016-08-24', ext:'2018-08-24' },
    'esxi 5.5': { eol:'2018-09-19', ext:'2020-09-19' },
    'esxi 6.0': { eol:'2020-03-12', ext:'2022-03-12' },
    'esxi 6.5': { eol:'2021-10-15', ext:'2023-11-15' },
    'esxi 6.7': { eol:'2022-10-15', ext:'2023-11-15' },
    'esxi 7.0': { eol:'2025-04-02', ext:'2027-04-02' },
    'esxi 8.0': { eol:'2027-10-11', ext:'2029-10-11' },
  };

  function lookupEOL(osStr) {
    if (!osStr) return null;
    const lower = osStr.toLowerCase();
    for (const [key, val] of Object.entries(EOL_DB)) {
      if (lower.includes(key)) return val;
    }
    return null;
  }

  function getOSType(osStr) {
    if (!osStr) return 'other';
    const l = osStr.toLowerCase();
    if (l.includes('windows')) return 'windows';
    if (l.includes('linux') || l.includes('ubuntu') || l.includes('centos') || l.includes('suse') || l.includes('red hat') || l.includes('debian')) return 'linux';
    if (l.includes('esxi') || l.includes('vmkernel')) return 'esx';
    return 'other';
  }

  function classifyAsset(eolEntry, mode, now) {
    if (!eolEntry) return 'na';
    const date = mode === 'extended' ? eolEntry.ext : eolEntry.eol;
    if (!date) return 'na';
    const eolDate = new Date(date);
    const inSix   = new Date(now); inSix.setMonth(inSix.getMonth()+6);
    if (eolDate > inSix)   return 'ok';
    if (eolDate > now)     return 'tbu';
    return 'ns';
  }

  function render(summary) {
    const mode = document.getElementById('support-mode')?.value || 'standard';
    const now  = new Date();
    const { all_vms, host_rows, kpi } = summary;

    // Group by OS
    const osMap = new Map();
    const processAsset = (osStr, type) => {
      const eolEntry = lookupEOL(osStr);
      const eolDate  = eolEntry ? (mode==='extended'?eolEntry.ext:eolEntry.eol) : null;
      const status   = classifyAsset(eolEntry, mode, now);
      const key = `${type.toUpperCase()}||${normalizeOSKey(osStr)}||${eolDate||'NA'}`;
      if (!osMap.has(key)) osMap.set(key, { os:type.toUpperCase(), version:normalizeVersion(osStr), eol:eolDate, count:0, ok:0, tbu:0, ns:0, na:0 });
      const e = osMap.get(key);
      e.count++; e[status]++;
    };

    all_vms.forEach(v => processAsset(v.os_full, getOSType(v.os_full)));
    host_rows.forEach(h => processAsset(h.esx_version, 'esx'));

    const rows = Array.from(osMap.values()).sort((a,b)=>b.count-a.count);

    fillTable('tbl-support', rows, [
      r => r.os, r => r.version,
      r => r.eol ? `<span style="font-size:11px">${r.eol}</span>` : '—',
      r => `<strong>${r.count}</strong>`,
      r => r.ok  ? `<span class="status-ok-text">${r.ok}</span>`   : '—',
      r => r.tbu ? `<span class="status-tbu-text">${r.tbu}</span>` : '—',
      r => r.ns  ? `<span class="status-ns-text">${r.ns}</span>`   : '—',
      r => r.na  ? `<span class="status-na-text">${r.na}</span>`   : '—',
    ]);

    const totals = rows.reduce((s,r)=>({ok:s.ok+r.ok,tbu:s.tbu+r.tbu,ns:s.ns+r.ns,na:s.na+r.na}),{ok:0,tbu:0,ns:0,na:0});
    const winRows = rows.filter(r=>r.os==='WINDOWS');
    const linRows = rows.filter(r=>r.os==='LINUX');
    const esxRows = rows.filter(r=>r.os==='ESX');
    const winTot  = winRows.reduce((s,r)=>({ok:s.ok+r.ok,tbu:s.tbu+r.tbu,ns:s.ns+r.ns,na:s.na+r.na}),{ok:0,tbu:0,ns:0,na:0});
    const linTot  = linRows.reduce((s,r)=>({ok:s.ok+r.ok,tbu:s.tbu+r.tbu,ns:s.ns+r.ns,na:s.na+r.na}),{ok:0,tbu:0,ns:0,na:0});
    const esxTot  = esxRows.reduce((s,r)=>({ok:s.ok+r.ok,tbu:s.tbu+r.tbu,ns:s.ns+r.ns,na:s.na+r.na}),{ok:0,tbu:0,ns:0,na:0});

    renderPie('chart-support-total',   [totals.ok,totals.tbu,totals.ns,totals.na]);
    renderPie('chart-support-windows', [winTot.ok,winTot.tbu,winTot.ns,winTot.na]);
    renderPie('chart-support-linux',   [linTot.ok,linTot.tbu,linTot.ns,linTot.na]);
    renderPie('chart-support-esx',     [esxTot.ok,esxTot.tbu,esxTot.ns,esxTot.na]);
  }

  function renderPie(canvasId, [ok,tbu,ns,na]) {
    if (_charts[canvasId]) { _charts[canvasId].destroy(); }
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    _charts[canvasId] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['OK','To Upgrade','Not Supported','N/A'],
        datasets: [{ data:[ok,tbu,ns,na], backgroundColor:['#22c55e','#f59e0b','#ef4444','#94a3b8'], borderWidth:2, borderColor:'#fff' }]
      },
      options: { responsive:true, plugins:{ legend:{ position:'bottom', labels:{ font:{ size:10 } } } } }
    });
  }

  function normalizeOSKey(os) {
    if (!os) return 'Unknown';
    const l = os.toLowerCase();
    for (const key of Object.keys(EOL_DB)) if (l.includes(key)) return key;
    return os.slice(0,30);
  }
  function normalizeVersion(os) {
    if (!os) return 'Unknown';
    const m = os.match(/\d+\.?\d*/);
    return m ? m[0] : os.slice(0,20);
  }

  document.getElementById('support-mode')?.addEventListener('change', () => {
    if (window.APP_STATE.loaded) render(window.APP_STATE.summary);
  });

  document.addEventListener('rvtools:dataready', e => render(e.detail.summary));
  document.addEventListener('rvtools:viewchange', e => {
    if (e.detail.view === 'support' && window.APP_STATE.loaded)
      setTimeout(() => render(window.APP_STATE.summary), 50);
  });
})();
