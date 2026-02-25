// ════════════════════════════════════════════════════════════════
// dashboard-forecast.js — EoS Timeline Forecasting
// ════════════════════════════════════════════════════════════════
(function () {
  let _lineChart = null;

  // ── Full EOL database (Standard | Extended) ──────────────────
  const EOL_DB = [
    // Windows Server
    { key: 'windows server 2003',    os: 'Windows', ver: '2003',    std: '2015-07-14', ext: '2015-07-14' },
    { key: 'windows server 2008 r2', os: 'Windows', ver: '2008 R2', std: '2020-01-14', ext: '2020-01-14' },
    { key: 'windows server 2008',    os: 'Windows', ver: '2008',    std: '2020-01-14', ext: '2020-01-14' },
    { key: 'windows server 2012 r2', os: 'Windows', ver: '2012 R2', std: '2023-10-10', ext: '2026-10-13' },
    { key: 'windows server 2012',    os: 'Windows', ver: '2012',    std: '2023-10-10', ext: '2026-10-13' },
    { key: 'windows server 2016',    os: 'Windows', ver: '2016',    std: '2022-01-11', ext: '2027-01-12' },
    { key: 'windows server 2019',    os: 'Windows', ver: '2019',    std: '2024-01-09', ext: '2029-01-09' },
    { key: 'windows server 2022',    os: 'Windows', ver: '2022',    std: '2026-10-13', ext: '2031-10-14' },
    { key: 'windows 10',             os: 'Windows', ver: '10',      std: '2025-10-14', ext: '2025-10-14' },
    { key: 'windows 11',             os: 'Windows', ver: '11',      std: '2031-10-14', ext: '2031-10-14' },
    // RHEL / Red Hat
    { key: 'red hat enterprise linux 5', os: 'Linux', ver: 'RHEL 5', std: '2013-01-08', ext: '2020-11-30' },
    { key: 'red hat enterprise linux 6', os: 'Linux', ver: 'RHEL 6', std: '2016-05-10', ext: '2024-06-30' },
    { key: 'red hat enterprise linux 7', os: 'Linux', ver: 'RHEL 7', std: '2019-08-06', ext: '2026-06-30' },
    { key: 'red hat enterprise linux 8', os: 'Linux', ver: 'RHEL 8', std: '2024-05-31', ext: '2029-05-31' },
    { key: 'red hat enterprise linux 9', os: 'Linux', ver: 'RHEL 9', std: '2027-05-31', ext: '2032-05-31' },
    { key: 'red hat linux 5',            os: 'Linux', ver: 'RHEL 5', std: '2013-01-08', ext: '2020-11-30' },
    { key: 'red hat linux 6',            os: 'Linux', ver: 'RHEL 6', std: '2016-05-10', ext: '2024-06-30' },
    { key: 'red hat linux 7',            os: 'Linux', ver: 'RHEL 7', std: '2019-08-06', ext: '2026-06-30' },
    { key: 'red hat linux 8',            os: 'Linux', ver: 'RHEL 8', std: '2024-05-31', ext: '2029-05-31' },
    { key: 'red hat linux 9',            os: 'Linux', ver: 'RHEL 9', std: '2027-05-31', ext: '2032-05-31' },
    // CentOS
    { key: 'centos linux 6', os: 'Linux', ver: 'CentOS 6', std: '2020-11-30', ext: '2020-11-30' },
    { key: 'centos linux 7', os: 'Linux', ver: 'CentOS 7', std: '2024-06-30', ext: '2024-06-30' },
    { key: 'centos linux 8', os: 'Linux', ver: 'CentOS 8', std: '2021-12-31', ext: '2021-12-31' },
    { key: 'centos 6',       os: 'Linux', ver: 'CentOS 6', std: '2020-11-30', ext: '2020-11-30' },
    { key: 'centos 7',       os: 'Linux', ver: 'CentOS 7', std: '2024-06-30', ext: '2024-06-30' },
    { key: 'centos 8',       os: 'Linux', ver: 'CentOS 8', std: '2021-12-31', ext: '2021-12-31' },
    // Ubuntu
    { key: 'ubuntu 16.04', os: 'Linux', ver: 'Ubuntu 16.04', std: '2021-04-30', ext: '2024-04-30' },
    { key: 'ubuntu 18.04', os: 'Linux', ver: 'Ubuntu 18.04', std: '2023-04-02', ext: '2028-04-02' },
    { key: 'ubuntu 20.04', os: 'Linux', ver: 'Ubuntu 20.04', std: '2025-04-02', ext: '2030-04-02' },
    { key: 'ubuntu 22.04', os: 'Linux', ver: 'Ubuntu 22.04', std: '2027-04-01', ext: '2032-04-01' },
    // SUSE
    { key: 'suse linux enterprise server 11', os: 'Linux', ver: 'SLES 11', std: '2022-03-31', ext: '2022-03-31' },
    { key: 'suse linux enterprise server 12', os: 'Linux', ver: 'SLES 12', std: '2024-10-31', ext: '2027-10-31' },
    { key: 'suse linux enterprise server 15', os: 'Linux', ver: 'SLES 15', std: '2031-07-31', ext: '2031-07-31' },
    // ESXi
    { key: 'esxi 5.5',  os: 'ESXi', ver: '5.5', std: '2018-09-19', ext: '2020-09-19' },
    { key: 'esxi 6.0',  os: 'ESXi', ver: '6.0', std: '2020-03-12', ext: '2022-03-12' },
    { key: 'esxi 6.5',  os: 'ESXi', ver: '6.5', std: '2021-10-15', ext: '2023-11-15' },
    { key: 'esxi 6.7',  os: 'ESXi', ver: '6.7', std: '2022-10-15', ext: '2023-11-15' },
    { key: 'esxi 7.0',  os: 'ESXi', ver: '7.0', std: '2025-04-02', ext: '2027-04-02' },
    { key: 'esxi 8.0',  os: 'ESXi', ver: '8.0', std: '2027-10-11', ext: '2029-10-11' },
    // Debian
    { key: 'debian gnu/linux 9',  os: 'Linux', ver: 'Debian 9',  std: '2022-06-30', ext: '2022-06-30' },
    { key: 'debian gnu/linux 10', os: 'Linux', ver: 'Debian 10', std: '2024-06-30', ext: '2026-06-30' },
    { key: 'debian gnu/linux 11', os: 'Linux', ver: 'Debian 11', std: '2026-06-30', ext: '2028-06-30' },
    { key: 'debian 9',            os: 'Linux', ver: 'Debian 9',  std: '2022-06-30', ext: '2022-06-30' },
    { key: 'debian 10',           os: 'Linux', ver: 'Debian 10', std: '2024-06-30', ext: '2026-06-30' },
    { key: 'debian 11',           os: 'Linux', ver: 'Debian 11', std: '2026-06-30', ext: '2028-06-30' },
  ];

  function lookupEOL(osStr, mode) {
    if (!osStr || osStr === 'Unknown') return null;
    const lower = osStr.toLowerCase();
    // Sort by key length descending — most specific match first
    const sorted = [...EOL_DB].sort(function (a, b) { return b.key.length - a.key.length; });
    for (const entry of sorted) {
      if (lower.includes(entry.key)) {
        const dateStr = (mode === 'ext') ? entry.ext : entry.std;
        return { date: dateStr ? new Date(dateStr) : null, os: entry.os, ver: entry.ver, raw: dateStr };
      }
    }
    return null;
  }

  function addMonths(date, n) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + n);
    return d;
  }

  function classify(eolDate, checkDate) {
    if (!eolDate) return 'na';
    const warnWindow = addMonths(checkDate, 3); // warn if EoS within 3 months
    if (eolDate > warnWindow) return 'ok';
    if (eolDate > checkDate) return 'tbu';
    return 'ns';
  }

  function statusBadge(s) {
    const cfg = {
      ok:  { label: '✓ OK',            bg: '#dcfce7', color: '#166534' },
      tbu: { label: '⚠ To Upgrade',    bg: '#fef9c3', color: '#854d0e' },
      ns:  { label: '✗ Not Supported', bg: '#fee2e2', color: '#991b1b' },
      na:  { label: '— N/A',           bg: '#f1f5f9', color: '#64748b' },
    };
    const c = cfg[s] || cfg.na;
    return '<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:600;background:' + c.bg + ';color:' + c.color + ';">' + c.label + '</span>';
  }

  function fmtDate(dateStr) {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: '2-digit' });
    } catch (e) { return dateStr; }
  }

  function render(summary) {
    const incrMonths = parseInt(document.getElementById('forecast-increment')?.value || '12');
    const now = new Date();
    const t1  = addMonths(now, incrMonths);
    const t2  = addMonths(now, incrMonths * 2);
    const t3  = addMonths(now, incrMonths * 3);

    // Build asset list from VMs + ESXi hosts
    const assets = [
      ...summary.all_vms.map(function (v) {
        return { name: v.vm_name, os: v.os_full || v.os, type: 'VM' };
      }),
      ...summary.host_rows.map(function (h) {
        return { name: h.host_name, os: h.esx_version, type: 'ESXi' };
      }),
    ];

    // ── Summary table by unique OS group ───────────────────────
    const osGroups = new Map();
    assets.forEach(function (a) {
      const info   = lookupEOL(a.os, 'std');
      const groupKey = info ? (info.os + '||' + info.ver) : ('UNKNOWN||' + (a.os || 'Unknown').slice(0, 30));
      if (!osGroups.has(groupKey)) {
        osGroups.set(groupKey, {
          os:    info ? info.os : 'Other',
          ver:   info ? info.ver : (a.os || 'Unknown').slice(0, 25),
          eolRaw: info ? info.raw : null,
          count: 0,
        });
      }
      osGroups.get(groupKey).count++;
    });

    const forecastRows = Array.from(osGroups.values())
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, 25)
      .map(function (g) {
        const eolDate = g.eolRaw ? new Date(g.eolRaw) : null;
        return Object.assign({}, g, {
          today: classify(eolDate, now),
          p1:    classify(eolDate, t1),
          p2:    classify(eolDate, t2),
          p3:    classify(eolDate, t3),
        });
      });

    fillTable('tbl-forecast', forecastRows, [
      function (r) { return r.os; },
      function (r) { return r.ver; },
      function (r) { return fmtDate(r.eolRaw); },
      function (r) { return '<strong>' + r.count + '</strong>'; },
      function (r) { return statusBadge(r.today); },
      function (r) { return statusBadge(r.p1); },
      function (r) { return statusBadge(r.p2); },
      function (r) { return statusBadge(r.p3); },
      function (r) { return r.eolRaw ? '—' : '<span style="color:#94a3b8;font-size:10px;">No EoS data</span>'; },
    ]);

    // ── Per-asset detail table (first 300) ──────────────────────
    const assetRows = assets.slice(0, 300).map(function (a) {
      const info    = lookupEOL(a.os, 'std');
      const eolDate = info ? info.date : null;
      return {
        name:  a.name || '—',
        type:  a.type,
        os:    info ? (info.os + ' ' + info.ver) : ((a.os || 'Unknown').slice(0, 35)),
        today: classify(eolDate, now),
        p1:    classify(eolDate, t1),
        p2:    classify(eolDate, t2),
        p3:    classify(eolDate, t3),
      };
    });

    let rowNum = 0;
    fillTable('tbl-forecast-assets', assetRows, [
      function ()   { rowNum++; return rowNum; },
      function (r)  { return r.name; },
      function (r)  { return '<span style="font-size:10px;background:#f1f5f9;padding:1px 6px;border-radius:4px;">' + r.type + '</span> ' + r.os; },
      function (r)  { return statusBadge(r.today); },
      function (r)  { return statusBadge(r.p1); },
      function (r)  { return statusBadge(r.p2); },
      function (r)  { return statusBadge(r.p3); },
    ]);

    // ── Timeline chart ──────────────────────────────────────────
    const counts = [now, t1, t2, t3].map(function (date) {
      let ok = 0, tbu = 0, ns = 0, na = 0;
      assets.forEach(function (a) {
        const info = lookupEOL(a.os, 'std');
        const s    = classify(info ? info.date : null, date);
        if (s === 'ok') ok++; else if (s === 'tbu') tbu++; else if (s === 'ns') ns++; else na++;
      });
      return { ok, tbu, ns, na };
    });
    renderLine(counts, incrMonths);
  }

  function renderLine(counts, incrMonths) {
    if (_lineChart) { _lineChart.destroy(); _lineChart = null; }
    const ctx = document.getElementById('chart-forecast-timeline');
    if (!ctx) return;
    const labels = ['Today', '+' + incrMonths + 'M', '+' + (incrMonths * 2) + 'M', '+' + (incrMonths * 3) + 'M'];
    _lineChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'OK',            data: counts.map(function (c) { return c.ok;  }), borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.08)',   tension: 0.4, fill: true, pointRadius: 5 },
          { label: 'To Upgrade',    data: counts.map(function (c) { return c.tbu; }), borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.08)',  tension: 0.4, fill: true, pointRadius: 5 },
          { label: 'Not Supported', data: counts.map(function (c) { return c.ns;  }), borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.08)',   tension: 0.4, fill: true, pointRadius: 5 },
          { label: 'N/A',           data: counts.map(function (c) { return c.na;  }), borderColor: '#94a3b8', backgroundColor: 'rgba(148,163,184,0.08)', tension: 0.4, fill: true, pointRadius: 5 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 12 } },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return ' ' + ctx.dataset.label + ': ' + ctx.parsed.y + ' assets';
              }
            }
          }
        },
        scales: {
          y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 } } },
          x: { grid: { display: false }, ticks: { font: { size: 11 } } }
        }
      }
    });
  }

  // ── Event wiring ──────────────────────────────────────────────
  document.getElementById('forecast-increment')?.addEventListener('change', function () {
    if (window.APP_STATE.loaded) render(window.APP_STATE.summary);
  });
  document.getElementById('forecast-pct')?.addEventListener('change', function () {
    if (window.APP_STATE.loaded) render(window.APP_STATE.summary);
  });
  document.addEventListener('rvtools:dataready', function (e) {
    render(e.detail.summary);
  });
  document.addEventListener('rvtools:viewchange', function (e) {
    if (e.detail.view === 'forecast' && window.APP_STATE.loaded) {
      setTimeout(function () { render(window.APP_STATE.summary); }, 50);
    }
  });
})();
