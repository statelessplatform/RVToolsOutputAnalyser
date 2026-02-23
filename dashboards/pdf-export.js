// ════════════════════════════════════════════════════════════════
// pdf-export.js — Central PDF Export Router
// ════════════════════════════════════════════════════════════════
(function () {

  const BRAND = { color: [79, 70, 229], accent: [124, 58, 237] };
  const PAGE  = { w: 297, h: 210, ml: 14, mr: 14 }; // A4 landscape mm

  // ── Current active view ───────────────────────────────────────
  function currentView() {
    return document.querySelector('.nav-item-active')?.dataset.view || 'dashboard';
  }

  // ── Header ────────────────────────────────────────────────────
  function addHeader(doc, title, subtitle) {
    doc.setFillColor(...BRAND.color);
    doc.rect(0, 0, PAGE.w, 14, 'F');
    doc.setFillColor(...BRAND.accent);
    doc.roundedRect(PAGE.ml, 3, 20, 8, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8); doc.setFont(undefined, 'bold');
    doc.text('RVTools', PAGE.ml + 10, 8, { align: 'center' });
    doc.setFontSize(13); doc.setFont(undefined, 'bold');
    doc.text(title, PAGE.ml + 26, 9);
    doc.setFontSize(8); doc.setFont(undefined, 'normal');
    doc.setTextColor(200, 210, 255);
    doc.text(subtitle + ' · Generated: ' + new Date().toLocaleString(), PAGE.ml + 26, 12.5);
    doc.setTextColor(30, 30, 30);
  }

  // ── Footer ────────────────────────────────────────────────────
  function addFooter(doc, pageNum, total) {
    const y = PAGE.h - 6;
    doc.setDrawColor(220, 220, 230);
    doc.line(PAGE.ml, y - 2, PAGE.w - PAGE.mr, y - 2);
    doc.setFontSize(8); doc.setTextColor(120, 120, 140);
    doc.text('RVTools Analytics Dashboard — Confidential', PAGE.ml, y);
    doc.text('Page ' + pageNum + ' / ' + total, PAGE.w - PAGE.mr, y, { align: 'right' });
    doc.setTextColor(30, 30, 30);
  }

  // ── Read table from DOM ───────────────────────────────────────
  function tableFromHTML(tableId) {
    const tbody = document.querySelector('#' + tableId + ' tbody');
    const thead = document.querySelector('#' + tableId + ' thead');
    if (!tbody || !thead) return { head: [], body: [] };
    const head = [Array.from(thead.querySelectorAll('th')).map(function (th) { return th.textContent.trim(); })];
    const body = Array.from(tbody.querySelectorAll('tr')).map(function (tr) {
      return Array.from(tr.querySelectorAll('td')).map(function (td) { return td.textContent.trim(); });
    });
    return { head: head, body: body };
  }

  // ── Generic table section renderer ───────────────────────────
  function exportTable(doc, title, tableId, startY) {
    const { head, body } = tableFromHTML(tableId);
    if (!head[0] || !head[0].length) return startY;
    doc.setFontSize(10); doc.setFont(undefined, 'bold');
    doc.setTextColor(...BRAND.color);
    doc.text(title, PAGE.ml, startY);
    doc.setFont(undefined, 'normal'); doc.setTextColor(30, 30, 30);
    doc.autoTable({
      head: head, body: body,
      startY: startY + 4,
      styles:              { fontSize: 7.5, cellPadding: 2.5, overflow: 'ellipsize' },
      headStyles:          { fillColor: BRAND.color, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles:  { fillColor: [245, 247, 255] },
      tableWidth:          PAGE.w - PAGE.ml - PAGE.mr,
      margin:              { left: PAGE.ml, right: PAGE.mr },
    });
    return doc.lastAutoTable.finalY + 8;
  }

  // ── Dashboard export (KPIs + tables) ─────────────────────────
  function exportDashboard(doc) {
    const k = window.APP_STATE.summary.kpi;
    const r = window.APP_STATE.summary.ratios;
    const kpis = [
      ['Active VMs',    k.active_vms.toLocaleString()],
      ['Total VMs',     k.total_vms.toLocaleString()],
      ['ESXi Hosts',    k.hosts],
      ['Total vCPUs',   k.total_vcpus.toLocaleString()],
      ['Physical RAM',  k.physical_memory_gib + ' GiB'],
      ['vRAM',          k.virtual_memory_gib + ' GiB'],
      ['Provisioned',   k.storage_provisioned_tib + ' TiB'],
      ['Core:vCPU',     r.core_to_vcpu + 'x'],
      ['vRAM:pRAM',     r.vram_to_pram + 'x'],
    ];
    let x = PAGE.ml;
    const bw = 30, bh = 18, by = 18;
    kpis.forEach(function ([label, value], i) {
      doc.setFillColor(238, 242, 255);
      doc.roundedRect(x, by, bw - 1, bh, 3, 3, 'F');
      doc.setFontSize(7); doc.setTextColor(100, 100, 130);
      doc.text(label, x + 1.5, by + 5);
      doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.setTextColor(30, 30, 50);
      doc.text(String(value), x + 1.5, by + 13);
      doc.setFont(undefined, 'normal');
      x += bw + 1;
    });
    const ct = tableFromHTML('tbl-clusters');
    doc.autoTable({
      head: ct.head, body: ct.body, startY: 42,
      styles:             { fontSize: 8, cellPadding: 3 },
      headStyles:         { fillColor: BRAND.color, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 247, 255] },
      tableWidth:         PAGE.w - PAGE.ml - PAGE.mr,
      margin:             { left: PAGE.ml, right: PAGE.mr },
    });
  }

  // ── Statistics export (table + chart snapshots) ───────────────
  function exportStatistics(doc) {
    let y = exportTable(doc, 'ESXi Host Size Distribution', 'tbl-esx-dist', 20);

    // Capture both charts if visible
    const esxChart = document.getElementById('chart-stat-esx');
    const vmChart  = document.getElementById('chart-stat-vm');
    if (esxChart && vmChart) {
      const cw = (PAGE.w - PAGE.ml - PAGE.mr - 6) / 2;
      doc.setFontSize(9); doc.setFont(undefined, 'bold'); doc.setTextColor(...BRAND.color);
      doc.text('ESX Distribution', PAGE.ml, y);
      doc.text('VM Distribution (ON vs OFF)', PAGE.ml + cw + 6, y);
      doc.addImage(esxChart.toDataURL('image/png'), 'PNG', PAGE.ml, y + 3, cw, 55);
      doc.addImage(vmChart.toDataURL('image/png'), 'PNG', PAGE.ml + cw + 6, y + 3, cw, 55);
    }
  }

  // ── Storage export (table + donut chart) ─────────────────────
  function exportStorage(doc) {
    let y = exportTable(doc, 'Storage Analysis', 'tbl-storage-main', 20);
    const chart = document.getElementById('chart-storage');
    if (chart) {
      const cw = 100;
      doc.setFontSize(9); doc.setFont(undefined, 'bold'); doc.setTextColor(...BRAND.color);
      doc.text('Storage Distribution', PAGE.ml, y);
      doc.addImage(chart.toDataURL('image/png'), 'PNG', PAGE.ml, y + 3, cw, 60);
    }
  }

  // ── End of Support export ─────────────────────────────────────
  function exportSupport(doc) {
    let y = exportTable(doc, 'OS End of Support Status', 'tbl-support', 20);
    // Capture EoS donut charts
    const charts = ['chart-eos-total', 'chart-eos-linux', 'chart-eos-windows', 'chart-eos-esx'];
    const labels = ['Total Assets', 'Linux', 'Windows', 'ESXi'];
    const cw = (PAGE.w - PAGE.ml - PAGE.mr - 18) / 4;
    charts.forEach(function (id, i) {
      const c = document.getElementById(id);
      if (!c) return;
      doc.setFontSize(8); doc.setFont(undefined, 'bold'); doc.setTextColor(...BRAND.color);
      doc.text(labels[i], PAGE.ml + i * (cw + 6), y);
      doc.addImage(c.toDataURL('image/png'), 'PNG', PAGE.ml + i * (cw + 6), y + 3, cw, 45);
    });
  }

  // ── Main export dispatcher ────────────────────────────────────
  window.exportCurrentViewPDF = function () {
    if (!window.APP_STATE || !window.APP_STATE.loaded) {
      alert('Load RVTools data first.');
      return;
    }

    const view = currentView();

    // ── Global View has its own rich exporter ─────────────────
    if (view === 'globalview') {
      if (typeof window.exportGlobalViewPDF === 'function') {
        window.exportGlobalViewPDF();
      } else {
        alert('Global View PDF exporter not loaded.');
      }
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const k   = window.APP_STATE.summary.kpi;

    const titleMap = {
      dashboard:  'Infrastructure Dashboard',
      clusters:   'Cluster Inventory',
      hosts:      'ESXi Host Inventory',
      vms:        'VM Inventory',
      statistics: 'Statistics',
      storage:    'Storage Analysis',
      support:    'End of Support',
    };

    const subtitle = k.hosts + ' hosts · ' + k.total_vms.toLocaleString() + ' VMs';
    addHeader(doc, titleMap[view] || view, subtitle);

    // ── Route to view-specific renderer ──────────────────────
    if (view === 'dashboard') {
      exportDashboard(doc);

    } else if (view === 'statistics') {
      exportStatistics(doc);

    } else if (view === 'storage') {
      exportStorage(doc);

    } else if (view === 'support') {
      exportSupport(doc);

    } else {
      // Generic table fallback for clusters / hosts / vms
      const tableMap = {
        clusters: [['Cluster Inventory',    'tbl-clusters-full']],
        hosts:    [['ESXi Host Inventory',  'tbl-hosts-full']],
        vms:      [['VM Inventory',          'tbl-vms']],
      };
      let y = 20;
      (tableMap[view] || []).forEach(function ([title, id]) {
        y = exportTable(doc, title, id, y);
      });
    }

    // ── Footers on all pages ──────────────────────────────────
    const total = doc.internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      addFooter(doc, i, total);
    }

    doc.save('rvtools-' + view + '-' + Date.now() + '.pdf');
  };

})();

