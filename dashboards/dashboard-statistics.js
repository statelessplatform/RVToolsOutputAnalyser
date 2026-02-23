// ════════════════════════════════════════════════════════════════
// dashboard-statistics.js  —  ESX & VM Size Distribution Stats
// ════════════════════════════════════════════════════════════════
(function () {

  let _charts = {};

  const BUCKETS = [
    { label: 'Very Large', min: 41,  max: Infinity },
    { label: 'Large',      min: 21,  max: 40 },
    { label: 'Medium',     min: 11,  max: 20 },
    { label: 'Small',      min: 0,   max: 10 },
  ];

  function render(summary) {
    const { host_rows, all_vms } = summary;

    // ── Build bucket data ───────────────────────────────────────
    const data = BUCKETS.map(function (b) {
      // Find ESX hosts whose total VM count falls in this bucket
      const hostsInBucket = host_rows.filter(function (h) {
        const total = h.vm_count || 0;
        return total >= b.min && total <= b.max;
      });

      const hostNameSet = new Set(hostsInBucket.map(function (h) { return h.host_name; }));

      // Count VMs that are placed on these hosts
      const vmsOn  = all_vms.filter(function (v) {
        return hostNameSet.has(v.host) && v.powerstate.toLowerCase() === 'poweredon';
      }).length;
      const vmsOff = all_vms.filter(function (v) {
        return hostNameSet.has(v.host) && v.powerstate.toLowerCase() !== 'poweredon';
      }).length;

      return {
        label:    b.label,
        esx:      hostsInBucket.length,
        vms_on:   vmsOn,
        vms_off:  vmsOff,
      };
    });

    // ── Fill table ──────────────────────────────────────────────
    var tbody = document.querySelector('#tbl-esx-dist tbody');
    if (tbody) {
      tbody.innerHTML = data.map(function (d) {
        return '<tr>'
          + '<td>' + d.label + '</td>'
          + '<td>' + d.esx + '</td>'
          + '<td style="color:#22c55e;font-weight:600">' + d.vms_on + '</td>'
          + '<td style="color:#ef4444;font-weight:600">' + d.vms_off + '</td>'
          + '</tr>';
      }).join('');
    }

    // ── Destroy old charts ──────────────────────────────────────
    ['stat-esx', 'stat-vm'].forEach(function (id) {
      if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
    });

    const labels = data.map(function (d) { return d.label; });
    const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#94a3b8'];

    // ── Shared Y-axis config (integer ticks, starts at 0) ───────
    function yAxis(maxVal) {
      return {
        beginAtZero: true,
        ticks: {
          precision: 0,          // integers only — no decimals
          stepSize: Math.max(1, Math.ceil(maxVal / 6)),
        },
        grid: { color: '#f1f5f9' },
      };
    }

    // ── ESX Distribution chart ──────────────────────────────────
    const ctxEsx = document.getElementById('chart-stat-esx');
    if (ctxEsx) {
      const maxEsx = Math.max.apply(null, data.map(function (d) { return d.esx; }));
      _charts['stat-esx'] = new Chart(ctxEsx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'ESX Count',
            data:  data.map(function (d) { return d.esx; }),
            backgroundColor: COLORS,
            borderRadius: 8,
            borderSkipped: false,
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function (ctx) {
                  return ' ' + ctx.dataset.label + ': ' + ctx.parsed.y + ' hosts';
                }
              }
            }
          },
          scales: {
            y: yAxis(maxEsx),
            x: { grid: { display: false } }
          }
        }
      });
    }

    // ── VM Distribution (ON vs OFF) chart ───────────────────────
    const ctxVm = document.getElementById('chart-stat-vm');
    if (ctxVm) {
      const maxVm = Math.max.apply(null, data.map(function (d) {
        return d.vms_on + d.vms_off;
      }));
      _charts['stat-vm'] = new Chart(ctxVm, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'VM ON',
              data:  data.map(function (d) { return d.vms_on; }),
              backgroundColor: '#22c55e',
              borderRadius: 8,
              borderSkipped: false,
            },
            {
              label: 'VM OFF',
              data:  data.map(function (d) { return d.vms_off; }),
              backgroundColor: '#ef4444',
              borderRadius: 8,
              borderSkipped: false,
            }
          ]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: 'top' },
            tooltip: {
              callbacks: {
                label: function (ctx) {
                  return ' ' + ctx.dataset.label + ': ' + ctx.parsed.y + ' VMs';
                }
              }
            }
          },
          scales: {
            y: yAxis(maxVm),
            x: { grid: { display: false } }
          }
        }
      });
    }
  }

  // ── Event listeners ──────────────────────────────────────────
  document.addEventListener('rvtools:dataready', function (e) {
    render(e.detail.summary);
  });

  document.addEventListener('rvtools:viewchange', function (e) {
    if (e.detail.view === 'statistics' && window.APP_STATE.loaded) {
      setTimeout(function () { render(window.APP_STATE.summary); }, 50);
    }
  });

})();
