// ════════════════════════════════════════════════════════════════
// dashboard-globalview.js  —  Multi-Cluster Global View
// ════════════════════════════════════════════════════════════════
(function () {

  let _gvCharts = {};

  function destroyChart(id) {
    if (_gvCharts[id]) { _gvCharts[id].destroy(); delete _gvCharts[id]; }
  }

  // ── OS detection — broad matching ────────────────────────────
  function osInitial(os) {
    if (!os || os === 'Unknown' || os.trim() === '') return 'O';
    const l = os.toLowerCase();
    if (l.includes('windows') || l.includes('microsoft')) return 'W';
    if (l.includes('linux')   || l.includes('red hat')   ||
        l.includes('centos')  || l.includes('ubuntu')    ||
        l.includes('debian')  || l.includes('suse')      ||
        l.includes('oracle linux') || l.includes('fedora')) return 'L';
    if (l.includes('esx')     || l.includes('vmware'))    return 'E';
    return 'O';
  }

  // Returns a coloured OS badge span
  function osTagHtml(vm, showOS) {
    if (!showOS) return '';
    const raw     = vm.os_full || vm.os || '';
    const initial = osInitial(raw);
    const colorMap = {
      W: 'background:#dbeafe;color:#1d4ed8',   // blue   — Windows
      L: 'background:#dcfce7;color:#166534',   // green  — Linux
      E: 'background:#fef3c7;color:#92400e',   // amber  — ESXi
      O: 'background:#f3f4f6;color:#6b7280',   // grey   — Other
    };
    const style = colorMap[initial] || colorMap['O'];
    return `<span style="font-size:10px;font-weight:700;border-radius:3px;padding:0 3px;margin-right:2px;${style}">[${initial}]</span>`;
  }

  // ── Main render ───────────────────────────────────────────────
  function render(summary) {
    renderSummaryBar(summary.kpi, summary);
    renderClusterCards(summary.by_cluster, summary.host_rows, summary);
    renderCharts(summary.by_cluster);
  }

  // ── Summary bar ───────────────────────────────────────────────
  function renderSummaryBar(kpi, summary) {
    const el = document.getElementById('gv-summary-bar');
    if (!el) return;

    const vmOn  = kpi.active_vms;
    const vmOff = kpi.total_vms - kpi.active_vms;

    // Count using broad matching
    const osWin = summary.all_vms.filter(v => osInitial(v.os_full || v.os) === 'W').length;
    const osLin = summary.all_vms.filter(v => osInitial(v.os_full || v.os) === 'L').length;
    const osEsx = summary.all_vms.filter(v => osInitial(v.os_full || v.os) === 'E').length;
    const osOth = kpi.total_vms - osWin - osLin - osEsx;

    el.innerHTML = `
      <div class="gv-summary-item">
        <span class="gv-sum-label">Total ESX</span>
        <span class="gv-sum-val">${kpi.hosts}</span>
      </div>
      <div class="gv-summary-item">
        <span class="gv-sum-label">Total VMs</span>
        <span class="gv-sum-val">${kpi.total_vms.toLocaleString()}</span>
      </div>
      <div class="gv-summary-item">
        <span class="gv-sum-label">VM <span class="badge badge-on">ON</span></span>
        <span class="gv-sum-val" style="color:#22c55e">${vmOn.toLocaleString()}</span>
      </div>
      <div class="gv-summary-item">
        <span class="gv-sum-label">VM <span class="badge badge-off">OFF</span></span>
        <span class="gv-sum-val" style="color:#ef4444">${vmOff.toLocaleString()}</span>
      </div>
      <div class="gv-summary-item">
        <span class="gv-sum-label" style="display:flex;align-items:center;gap:4px">
          <span style="background:#dbeafe;color:#1d4ed8;font-size:10px;font-weight:700;border-radius:3px;padding:0 3px">[W]</span> Windows
        </span>
        <span class="gv-sum-val">${osWin.toLocaleString()}</span>
      </div>
      <div class="gv-summary-item">
        <span class="gv-sum-label" style="display:flex;align-items:center;gap:4px">
          <span style="background:#dcfce7;color:#166534;font-size:10px;font-weight:700;border-radius:3px;padding:0 3px">[L]</span> Linux
        </span>
        <span class="gv-sum-val">${osLin.toLocaleString()}</span>
      </div>
      <div class="gv-summary-item">
        <span class="gv-sum-label" style="display:flex;align-items:center;gap:4px">
          <span style="background:#fef3c7;color:#92400e;font-size:10px;font-weight:700;border-radius:3px;padding:0 3px">[E]</span> ESXi
        </span>
        <span class="gv-sum-val">${osEsx.toLocaleString()}</span>
      </div>
      <div class="gv-summary-item">
        <span class="gv-sum-label" style="display:flex;align-items:center;gap:4px">
          <span style="background:#f3f4f6;color:#6b7280;font-size:10px;font-weight:700;border-radius:3px;padding:0 3px">[O]</span> Other
        </span>
        <span class="gv-sum-val">${osOth.toLocaleString()}</span>
      </div>`;
  }

  // ── Cluster cards ─────────────────────────────────────────────
  function renderClusterCards(byCluster, hostRows, summary) {
    const showOS = document.getElementById('gv-show-os')?.checked !== false;
    const grid   = document.getElementById('gv-cluster-cards');
    if (!grid) return;

    grid.innerHTML = byCluster.map(cl => {
      const hosts    = hostRows.filter(h => h.cluster === cl.cluster);
      const hostList = hosts.map(h => {
        const vmsOnHost = summary.all_vms
          .filter(v => v.host === h.host_name)
          .slice(0, 10);

        const vmLines = vmsOnHost.map(v => {
          const tag = osTagHtml(v, showOS);
          const cls = v.powerstate.toLowerCase() === 'poweredon' ? 'gv-vm-on' : 'gv-vm-off';
          return `<div class="gv-vm-line ${cls}">${tag}${v.vm_name}</div>`;
        }).join('');

        const moreCount = summary.all_vms.filter(v => v.host === h.host_name).length - 10;
        const moreHint  = moreCount > 0
          ? `<div style="font-size:10px;color:#9ca3af;padding:1px 0">+${moreCount} more…</div>`
          : '';

        return `
          <div class="gv-host-block">
            <div class="gv-host-name">ESX: ${h.host_name}</div>
            ${vmLines}${moreHint}
          </div>`;
      }).join('');

      return `
        <div class="gv-cluster-card">
          <div class="gv-cluster-header">
            <span class="gv-cluster-name">${cl.cluster}</span>
            <span class="gv-cluster-meta">ESX: ${hosts.length} &nbsp;|&nbsp; VMs: ${cl.vm_count}</span>
          </div>
          <div class="gv-host-list">${hostList}</div>
        </div>`;
    }).join('');
  }

  // ── Charts ────────────────────────────────────────────────────
  function renderCharts(byCluster) {
    destroyChart('gv-esx');
    destroyChart('gv-vm');

    const labels = byCluster.map(c =>
      c.cluster.length > 22 ? c.cluster.slice(0, 20) + '…' : c.cluster
    );
    const COLORS = ['#4f46e5','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#3b82f6','#14b8a6','#f97316','#06b6d4'];

    const ctxEsx = document.getElementById('chart-gv-esx');
    const ctxVm  = document.getElementById('chart-gv-vm');
    if (!ctxEsx || !ctxVm) return;

    _gvCharts['gv-esx'] = new Chart(ctxEsx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'ESX Count',
          data: byCluster.map(c => {
            const s = window.APP_STATE.summary;
            return s ? s.host_rows.filter(h => h.cluster === c.cluster).length : 0;
          }),
          backgroundColor: byCluster.map((_, i) => COLORS[i % COLORS.length]),
          borderRadius: 6,
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, grid: { color: '#f1f5f9' } },
          y: { grid: { display: false } }
        }
      }
    });

    _gvCharts['gv-vm'] = new Chart(ctxVm, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'VM ON',
            data: byCluster.map(c => c.vm_on || 0),
            backgroundColor: '#22c55e',
            borderRadius: 6
          },
          {
            label: 'VM OFF',
            data: byCluster.map(c => (c.vm_count - (c.vm_on || 0))),
            backgroundColor: '#ef4444',
            borderRadius: 6
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        plugins: { legend: { position: 'top' } },
        scales: {
          x: { stacked: true, beginAtZero: true, grid: { color: '#f1f5f9' } },
          y: { stacked: true, grid: { display: false } }
        }
      }
    });
  }

  // ── Event listeners ───────────────────────────────────────────
  document.addEventListener('rvtools:dataready', function (e) {
    render(e.detail.summary);
  });

  document.addEventListener('rvtools:viewchange', function (e) {
    if (e.detail.view === 'globalview' && window.APP_STATE.loaded) {
      setTimeout(function () {
        renderCharts(window.APP_STATE.summary.by_cluster);
      }, 50);
    }
  });

  document.getElementById('gv-show-graphs')?.addEventListener('change', function (e) {
    const row = document.getElementById('gv-charts-row');
    if (row) row.classList.toggle('hidden', !e.target.checked);
  });

  document.getElementById('gv-show-os')?.addEventListener('change', function () {
    if (window.APP_STATE.loaded) render(window.APP_STATE.summary);
  });

  // ══════════════════════════════════════════════════════════════
  // PDF EXPORT — Global View
  // ══════════════════════════════════════════════════════════════
  async function exportGlobalViewPDF() {
    const s = window.APP_STATE.summary;
    if (!s) { alert('No data loaded.'); return; }

    const btn = document.getElementById('btn-export-pdf');
    if (btn) { btn.disabled = true; btn.textContent = 'Generating PDF…'; }

    try {
      const { jsPDF } = window.jspdf;
      const doc        = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageW      = doc.internal.pageSize.getWidth();   // 297
      const pageH      = doc.internal.pageSize.getHeight();  // 210
      const margin     = 12;
      const contentW   = pageW - margin * 2;
      const k          = s.kpi;

      // ── Helpers ──────────────────────────────────────────────
      function header(title, pageNum) {
        doc.setFillColor(79, 70, 229);
        doc.rect(0, 0, pageW, 9, 'F');
        doc.setFontSize(10); doc.setFont(undefined, 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text(title, margin, 6);
        doc.setFont(undefined, 'normal'); doc.setFontSize(8);
        doc.text('Page ' + pageNum, pageW - margin, 6, { align: 'right' });
      }

      function footer() {
        doc.setFontSize(7); doc.setTextColor(156, 163, 175);
        doc.text('RVTools Dash — Global View Export | StatelessPlatform', pageW / 2, pageH - 4, { align: 'center' });
      }

      function kpiBox(x, y, w, h, label, value, color) {
        doc.setFillColor(249, 250, 251);
        doc.roundedRect(x, y, w, h, 2, 2, 'F');
        doc.setFontSize(7); doc.setFont(undefined, 'normal');
        doc.setTextColor(107, 114, 128);
        doc.text(label, x + w / 2, y + 5, { align: 'center' });
        doc.setFontSize(13); doc.setFont(undefined, 'bold');
        doc.setTextColor(...color);
        doc.text(String(value), x + w / 2, y + 12, { align: 'center' });
      }

      // ── PAGE 1 — Summary KPIs ─────────────────────────────────
      let page = 1;
      header('Multi-Cluster Global View', page);

      const now = new Date();
      doc.setFontSize(8); doc.setFont(undefined, 'normal');
      doc.setTextColor(107, 114, 128);
      doc.text('Generated: ' + now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
        + ' at ' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }), margin, 16);

      // OS counts
      const osWin = s.all_vms.filter(v => osInitial(v.os_full || v.os) === 'W').length;
      const osLin = s.all_vms.filter(v => osInitial(v.os_full || v.os) === 'L').length;
      const osEsx = s.all_vms.filter(v => osInitial(v.os_full || v.os) === 'E').length;
      const osOth = k.total_vms - osWin - osLin - osEsx;
      const vmOff = k.total_vms - k.active_vms;

      // KPI row
      const kpiY = 20, kpiH = 18, kpiW = 36, gap = 4;
      const kpis = [
        { label: 'Total ESX',    value: k.hosts,                   color: [79, 70, 229]  },
        { label: 'Total VMs',    value: k.total_vms.toLocaleString(), color: [17, 24, 39]  },
        { label: 'VM ON',        value: k.active_vms.toLocaleString(), color: [34, 197, 94] },
        { label: 'VM OFF',       value: vmOff.toLocaleString(),     color: [239, 68, 68]  },
        { label: '[W] Windows',  value: osWin.toLocaleString(),     color: [29, 78, 216]  },
        { label: '[L] Linux',    value: osLin.toLocaleString(),     color: [22, 101, 52]  },
        { label: '[E] ESXi',     value: osEsx.toLocaleString(),     color: [146, 64, 14]  },
        { label: '[O] Other',    value: osOth.toLocaleString(),     color: [107, 114, 128]},
      ];
      kpis.forEach(function (kp, i) {
        kpiBox(margin + i * (kpiW + gap), kpiY, kpiW, kpiH, kp.label, kp.value, kp.color);
      });

      // ── Cluster summary table ─────────────────────────────────
      doc.setFontSize(10); doc.setFont(undefined, 'bold');
      doc.setTextColor(17, 24, 39);
      doc.text('Cluster Summary', margin, kpiY + kpiH + 8);

      doc.autoTable({
        startY: kpiY + kpiH + 11,
        head: [['Cluster', 'ESX Hosts', 'VMs Total', 'VM ON', 'VM OFF', 'vCPUs', 'vRAM (GiB)', 'vCPU/Core']],
        body: s.by_cluster.map(function (c) {
          return [
            c.cluster,
            s.host_rows.filter(function (h) { return h.cluster === c.cluster; }).length,
            c.vm_count,
            c.vm_on || 0,
            (c.vm_count - (c.vm_on || 0)),
            c.total_vcpus,
            c.total_mem_gib,
            c.vcpu_core_ratio,
          ];
        }),
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontSize: 8, fontStyle: 'bold' },
        styles:     { fontSize: 8, cellPadding: 2.5 },
        columnStyles: { 0: { cellWidth: 55 } },
        margin: { left: margin, right: margin },
      });

      footer();

      // ── PAGE 2 — ESX Host Detail ──────────────────────────────
      page++;
      doc.addPage();
      header('ESX Host Inventory', page);

      doc.autoTable({
        startY: 14,
        head: [['ESX Host', 'Cluster', 'Sockets', 'Cores', 'RAM (GiB)', 'vCPUs', 'VMs', 'ESXi Ver']],
        body: s.host_rows.map(function (h) {
          return [h.host_name, h.cluster, h.num_cpu, h.total_cores, h.memory_gib, h.vcpus_placed, h.vm_count, h.esx_version];
        }),
        theme: 'striped',
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontSize: 8 },
        styles:     { fontSize: 7.5, cellPadding: 2 },
        columnStyles: { 0: { cellWidth: 48 }, 1: { cellWidth: 48 }, 7: { cellWidth: 28 } },
        margin: { left: margin, right: margin },
      });

      footer();

      // ── PAGE 3 — Charts snapshot ──────────────────────────────
      const esxCanvas = document.getElementById('chart-gv-esx');
      const vmCanvas  = document.getElementById('chart-gv-vm');

      if (esxCanvas && vmCanvas) {
        page++;
        doc.addPage();
        header('Cluster Distribution Charts', page);

        doc.setFontSize(9); doc.setFont(undefined, 'bold');
        doc.setTextColor(17, 24, 39);
        doc.text('ESX Count by Cluster', margin, 16);
        doc.addImage(esxCanvas.toDataURL('image/png'), 'PNG', margin, 18, contentW * 0.48, 80);

        doc.text('VM Count by Cluster', margin + contentW * 0.52, 16);
        doc.addImage(vmCanvas.toDataURL('image/png'), 'PNG', margin + contentW * 0.52, 18, contentW * 0.48, 80);

        footer();
      }

      // ── Save ──────────────────────────────────────────────────
      const fname = 'GlobalView-' + now.toISOString().split('T')[0] + '.pdf';
      doc.save(fname);

    } catch (err) {
      console.error('Global View PDF error:', err);
      alert('PDF generation failed: ' + err.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Export PDF'; }
    }
  }


 // Expose for pdf-export.js to call
window.exportGlobalViewPDF = exportGlobalViewPDF;




})();
