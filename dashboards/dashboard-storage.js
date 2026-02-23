// ════════════════════════════════════════════════════════════════
// dashboard-storage.js  —  Storage Analysis (Cluster / ESX / VM)
// ════════════════════════════════════════════════════════════════
(function () {

  let _storageChart = null;
  let _currentTab   = 'cluster';
  let _lastRows     = [];
  let _lastTabType  = 'cluster';

  // ── Helpers ───────────────────────────────────────────────────
  function mibToGib(mib) { return +(mib / 1024).toFixed(1); }

  function scaleStorageData(gibValues) {
    const maxGib = Math.max.apply(null, gibValues.length ? gibValues : [0]);
    if (maxGib >= 1000) {
      return {
        values: gibValues.map(function (v) { return +(v / 1024).toFixed(2); }),
        label:  'Total TiB',
        unit:   'TiB',
      };
    }
    return { values: gibValues, label: 'Total GiB', unit: 'GiB' };
  }

  function destroyChart() {
    if (_storageChart) { _storageChart.destroy(); _storageChart = null; }
  }

  function powerBadge(state) {
    const s = (state || '').toLowerCase();
    if (s === 'poweredon')  return '<span class="badge badge-on">On</span>';
    if (s === 'poweredoff') return '<span class="badge badge-off">Off</span>';
    return '<span class="badge badge-sus">' + (state || '–') + '</span>';
  }

  // ── Tab activation ────────────────────────────────────────────
  function setActiveTab(tab) {
    _currentTab = tab;
    document.querySelectorAll('.storage-tab').forEach(function (btn) {
      btn.classList.toggle('storage-tab-active', btn.dataset.stab === tab);
    });
  }

  // ── Main render ───────────────────────────────────────────────
  function render(buckets, summary) {
    switch (_currentTab) {
      case 'cluster': renderClusterView(buckets, summary); break;
      case 'esx':     renderESXView(buckets, summary);     break;
      case 'vm':      renderVMView(buckets, summary);      break;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // CLUSTER VIEW
  // ══════════════════════════════════════════════════════════════
  function renderClusterView(buckets, summary) {
    const titleEl = document.getElementById('storage-table-title');
    const thead   = document.getElementById('storage-thead-row');
    const tbody   = document.querySelector('#tbl-storage-main tbody');
    const summEl  = document.getElementById('storage-summary-box');
    if (titleEl) titleEl.textContent = 'Cluster Storage';

    const clMap = new Map();
    (buckets.vdisk || []).forEach(function (d) {
      const vm      = String(d['VM'] || '').trim();
      const capMiB  = parseFloat(d['Capacity MiB'] || 0);
      const vmInfo  = summary.all_vms.find(function (v) { return v.vm_name === vm; });
      const cluster = vmInfo ? vmInfo.cluster : 'Unknown';
      if (!clMap.has(cluster)) clMap.set(cluster, { cluster: cluster, disks: 0, totalMiB: 0, vms: new Set() });
      const c = clMap.get(cluster);
      c.disks++; c.totalMiB += capMiB; c.vms.add(vm);
    });

    const rows = Array.from(clMap.values())
      .map(function (c) { return { cluster: c.cluster, vms: c.vms.size, disks: c.disks, totalGib: mibToGib(c.totalMiB) }; })
      .sort(function (a, b) { return b.totalGib - a.totalGib; });

    if (thead) thead.innerHTML = '<th>Cluster</th><th>VMs</th><th>Disks</th><th>Total (GiB)</th>';
    if (tbody) {
      tbody.innerHTML = rows.length === 0
        ? '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px">No vDisk data — load vDisk sheet</td></tr>'
        : rows.map(function (r) {
            return '<tr><td>' + r.cluster + '</td><td>' + r.vms + '</td><td>' + r.disks + '</td><td><strong>' + r.totalGib.toLocaleString() + '</strong></td></tr>';
          }).join('');
    }

    const totalGib   = rows.reduce(function (s, r) { return s + r.totalGib; }, 0);
    const totalDisks = rows.reduce(function (s, r) { return s + r.disks; }, 0);
    if (summEl) summEl.innerHTML =
      '<div class="storage-summary-grid">'
      + '<span>Total VMs: <strong>' + summary.kpi.total_vms + '</strong></span>'
      + '<span>Total Disks: <strong>' + totalDisks.toLocaleString() + '</strong></span>'
      + '<span>Total Size: <strong>' + totalGib.toLocaleString() + ' GiB</strong></span>'
      + '<span>Avg / Cluster: <strong>' + (rows.length ? (totalGib / rows.length).toFixed(1) : 0) + ' GiB</strong></span>'
      + '</div>';

    _lastRows = rows; _lastTabType = 'cluster';
    renderStorageChart(rows, 'cluster');
  }

  // ══════════════════════════════════════════════════════════════
  // ESX VIEW
  // ══════════════════════════════════════════════════════════════
  function renderESXView(buckets, summary) {
    const titleEl = document.getElementById('storage-table-title');
    const thead   = document.getElementById('storage-thead-row');
    const tbody   = document.querySelector('#tbl-storage-main tbody');
    const summEl  = document.getElementById('storage-summary-box');
    if (titleEl) titleEl.textContent = 'ESX Host Storage';

    const hostMap = new Map();
    (buckets.vdisk || []).forEach(function (d) {
      const vm     = String(d['VM'] || '').trim();
      const capMiB = parseFloat(d['Capacity MiB'] || 0);
      const vmInfo = summary.all_vms.find(function (v) { return v.vm_name === vm; });
      const host   = vmInfo ? vmInfo.host : 'Unknown';
      if (!hostMap.has(host)) hostMap.set(host, { host: host, disks: 0, totalMiB: 0, vms: new Set() });
      const h = hostMap.get(host);
      h.disks++; h.totalMiB += capMiB; h.vms.add(vm);
    });

    const rows = Array.from(hostMap.values())
      .map(function (h) { return { host: h.host, vms: h.vms.size, disks: h.disks, totalGib: mibToGib(h.totalMiB) }; })
      .sort(function (a, b) { return b.totalGib - a.totalGib; });

    if (thead) thead.innerHTML = '<th>ESX Host</th><th>VMs</th><th>Disks</th><th>Total (GiB)</th>';
    if (tbody) {
      tbody.innerHTML = rows.length === 0
        ? '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px">No vDisk data — load vDisk sheet</td></tr>'
        : rows.map(function (r) {
            return '<tr><td>' + r.host + '</td><td>' + r.vms + '</td><td>' + r.disks + '</td><td><strong>' + r.totalGib.toLocaleString() + '</strong></td></tr>';
          }).join('');
    }

    const totalGib   = rows.reduce(function (s, r) { return s + r.totalGib; }, 0);
    const totalDisks = rows.reduce(function (s, r) { return s + r.disks; }, 0);
    if (summEl) summEl.innerHTML =
      '<div class="storage-summary-grid">'
      + '<span>Total Hosts: <strong>' + rows.length + '</strong></span>'
      + '<span>Total Disks: <strong>' + totalDisks.toLocaleString() + '</strong></span>'
      + '<span>Total Size: <strong>' + totalGib.toLocaleString() + ' GiB</strong></span>'
      + '<span>Avg / Host: <strong>' + (rows.length ? (totalGib / rows.length).toFixed(1) : 0) + ' GiB</strong></span>'
      + '</div>';

    _lastRows = rows; _lastTabType = 'esx';
    renderStorageChart(rows, 'esx');
  }

  // ══════════════════════════════════════════════════════════════
  // VM VIEW
  // ══════════════════════════════════════════════════════════════
  function renderVMView(buckets, summary) {
    const titleEl = document.getElementById('storage-table-title');
    const thead   = document.getElementById('storage-thead-row');
    const tbody   = document.querySelector('#tbl-storage-main tbody');
    const summEl  = document.getElementById('storage-summary-box');
    if (titleEl) titleEl.textContent = 'VM Storage Detail';

    const vmMap = new Map();
    (buckets.vdisk || []).forEach(function (d) {
      const vm     = String(d['VM'] || '').trim();
      const capMiB = parseFloat(d['Capacity MiB'] || 0);
      const vmInfo = summary.all_vms.find(function (v) { return v.vm_name === vm; });
      if (!vmMap.has(vm)) {
        vmMap.set(vm, { vm_name: vm, cluster: vmInfo ? vmInfo.cluster : 'Unknown', power: vmInfo ? vmInfo.powerstate : 'Unknown', disks: 0, totalMiB: 0 });
      }
      const e = vmMap.get(vm); e.disks++; e.totalMiB += capMiB;
    });

    const rows = Array.from(vmMap.values())
      .map(function (v) { return Object.assign({}, v, { totalGib: mibToGib(v.totalMiB) }); })
      .sort(function (a, b) { return b.totalGib - a.totalGib; });

    if (thead) thead.innerHTML = '<th>VM Name</th><th>Power</th><th>Cluster</th><th>Disks</th><th>Total (GiB)</th>';
    if (tbody) {
      tbody.innerHTML = rows.length === 0
        ? '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px">No vDisk data — load vDisk sheet</td></tr>'
        : rows.map(function (r) {
            return '<tr><td><strong>' + r.vm_name + '</strong></td><td>' + powerBadge(r.power) + '</td><td>' + r.cluster + '</td><td>' + r.disks + '</td><td><strong>' + r.totalGib.toLocaleString() + '</strong></td></tr>';
          }).join('');
    }

    const totalGib   = rows.reduce(function (s, r) { return s + r.totalGib; }, 0);
    const totalDisks = rows.reduce(function (s, r) { return s + r.disks; }, 0);
    if (summEl) summEl.innerHTML =
      '<div class="storage-summary-grid">'
      + '<span>Total VMs: <strong>' + rows.length + '</strong></span>'
      + '<span>Total Disks: <strong>' + totalDisks.toLocaleString() + '</strong></span>'
      + '<span>Total Size: <strong>' + totalGib.toLocaleString() + ' GiB</strong></span>'
      + '<span>Avg / VM: <strong>' + (rows.length ? (totalGib / rows.length).toFixed(1) : 0) + ' GiB</strong></span>'
      + '</div>';

    _lastRows = rows; _lastTabType = 'vm';
    renderStorageChart(rows, 'vm');
  }

  // ══════════════════════════════════════════════════════════════
  // DONUT CHART — fixed size, never grows
  // ══════════════════════════════════════════════════════════════
  function renderStorageChart(rows, tabType) {
    destroyChart();
    const ctx = document.getElementById('chart-storage');
    if (!ctx || !rows || rows.length === 0) return;

    const metric  = (document.getElementById('storage-chart-metric') || {}).value || 'size';
    const COLORS  = [
      '#4f46e5','#10b981','#f59e0b','#ef4444','#8b5cf6',
      '#ec4899','#3b82f6','#14b8a6','#f97316','#06b6d4',
      '#a855f7','#84cc16','#f43f5e','#0ea5e9','#22d3ee'
    ];

    // Top 12 segments max — rest grouped as "Others"
    const MAX_SEGMENTS = 12;
    let topRows = rows.slice(0, MAX_SEGMENTS);
    const otherRows = rows.slice(MAX_SEGMENTS);

    let rawData, fullLabels, unit;

    // Labels per tab
    if (tabType === 'cluster') {
      fullLabels = topRows.map(function (r) { return r.cluster; });
    } else if (tabType === 'esx') {
      fullLabels = topRows.map(function (r) { return r.host; });
    } else {
      fullLabels = topRows.map(function (r) { return r.vm_name; });
    }

    // Data per metric
    if (metric === 'size') {
      const scaled = scaleStorageData(topRows.map(function (r) { return r.totalGib; }));
      rawData = scaled.values; unit = scaled.unit;
      // Add "Others" bucket if needed
      if (otherRows.length > 0) {
        const otherGib = otherRows.reduce(function (s, r) { return s + r.totalGib; }, 0);
        const otherScaled = unit === 'TiB' ? +(otherGib / 1024).toFixed(2) : otherGib;
        rawData.push(otherScaled);
        fullLabels.push('Others (' + otherRows.length + ')');
      }
    } else if (metric === 'count') {
      rawData = topRows.map(function (r) { return r.disks; }); unit = 'disks';
      if (otherRows.length > 0) {
        rawData.push(otherRows.reduce(function (s, r) { return s + r.disks; }, 0));
        fullLabels.push('Others (' + otherRows.length + ')');
      }
    } else {
      // vms metric — for VM tab show top 12 by size instead of "1 per VM"
      if (tabType === 'vm') {
        rawData = topRows.map(function (r) { return r.totalGib; }); unit = 'GiB';
      } else {
        rawData = topRows.map(function (r) { return r.vms || 0; }); unit = 'VMs';
        if (otherRows.length > 0) {
          rawData.push(otherRows.reduce(function (s, r) { return s + (r.vms || 0); }, 0));
          fullLabels.push('Others (' + otherRows.length + ')');
        }
      }
    }

    const bgColors = fullLabels.map(function (_, i) {
      return i < COLORS.length ? COLORS[i] : '#9ca3af';
    });

    const total = rawData.reduce(function (s, v) { return s + v; }, 0);

    // Short display labels (truncated for legend)
    const shortLabels = fullLabels.map(function (l) {
      return l.length > 22 ? l.slice(0, 20) + '…' : l;
    });

    _storageChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: shortLabels,
        datasets: [{
          data:            rawData,
          backgroundColor: bgColors,
          borderColor:     '#ffffff',
          borderWidth:     2,
          hoverOffset:     8,
        }]
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        cutout:              '60%',
        plugins: {
          legend: {
            position: 'right',
            align:    'center',
            labels: {
              boxWidth:  12,
              boxHeight: 12,
              padding:   8,
              font:      { size: 11 },
              color:     '#374151',
              generateLabels: function (chart) {
                const ds = chart.data.datasets[0];
                return chart.data.labels.map(function (label, i) {
                  const val = ds.data[i];
                  const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
                  return {
                    text:        label + '  ' + Number(val).toLocaleString() + ' ' + unit + '  (' + pct + '%)',
                    fillStyle:   ds.backgroundColor[i],
                    strokeStyle: '#ffffff',
                    lineWidth:   1,
                    index:       i,
                    hidden:      false,
                  };
                });
              }
            }
          },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                const val = ctx.parsed;
                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
                return '  ' + ctx.label + ': ' + Number(val).toLocaleString() + ' ' + unit + ' (' + pct + '%)';
              }
            }
          }
        }
      }
    });
  }

  // ── Event listeners ───────────────────────────────────────────
  document.addEventListener('rvtools:dataready', function (e) {
    render(e.detail.buckets, e.detail.summary);
  });

  document.addEventListener('rvtools:viewchange', function (e) {
    if (e.detail.view === 'storage' && window.APP_STATE.loaded) {
      setTimeout(function () { render(window.APP_STATE.buckets, window.APP_STATE.summary); }, 50);
    }
  });

  document.querySelectorAll('.storage-tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setActiveTab(btn.dataset.stab);
      if (window.APP_STATE.loaded) render(window.APP_STATE.buckets, window.APP_STATE.summary);
    });
  });

  var metricSelect = document.getElementById('storage-chart-metric');
  if (metricSelect) {
    metricSelect.addEventListener('change', function () {
      if (_lastRows.length) renderStorageChart(_lastRows, _lastTabType);
    });
  }

})();
