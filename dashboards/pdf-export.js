// ════════════════════════════════════════════════════════════════
// pdf-export.js v5 — Chart-safe Multi-Dashboard PDF Export
// Theme: VMware Clarity Design System — #0072a3
// FIX: Dedicated full-page chart sections with page-break logic
// ════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── VMware Clarity Brand Colors ───────────────────────────────
  var C = {
    // Clarity blue family
    primary  : [0, 114, 163],   // #0072a3 — Clarity primary
    primaryD : [0, 74, 112],    // #004a70 — Clarity dark blue
    primaryM : [0, 146, 200],   // #0092c8 — Clarity mid blue
    primaryL : [225, 241, 246], // #e1f1f6 — Clarity light blue

    // Semantic status
    green : [49, 135, 0  ],     // #318700 — Clarity success
    amber : [230, 105, 0 ],     // #e66900 — Clarity warning
    red   : [194, 29, 0  ],     // #c21d00 — Clarity danger

    // Neutrals
    dark   : [49, 49, 49  ],    // #313131 — Clarity text-main
    mid    : [115, 115, 115],   // #737373 — Clarity text-muted
    slate  : [160, 180, 200],   // subtle blue-grey (footer text)
    border : [204, 204, 204],   // #cccccc — Clarity border
    light  : [225, 241, 246],   // #e1f1f6 — Clarity accent-soft
    panel  : [255, 255, 255],   // #ffffff — white
    body   : [244, 244, 244],   // #f4f4f4 — Clarity body bg

    // Cover page — dark Clarity navy
    navyDark : [15, 25, 35 ],   // #0f1923
    navyMid  : [26, 37, 53 ],   // #1a2535 — sidebar bg
    navyBox  : [37, 51, 71 ],   // #253347 — metric card bg
  };

  // ── Page geometry A4 landscape ───────────────────────────────
  var P = { w:297, h:210, ml:14, mr:14, mt:20, mb:14 };

  // ─────────────────────────────────────────────────────────────
  // CHART-SAFE IMAGE CAPTURE
  // ─────────────────────────────────────────────────────────────
  var _offscreenCharts = [];

  function destroyOffscreen() {
    _offscreenCharts.forEach(function(c){ try{ c.destroy(); }catch(e){} });
    _offscreenCharts = [];
  }

  function chartImg(canvasId, w, h) {
    w = w || 800; h = h || 380;
    var live = document.getElementById(canvasId);
    if (live && live.width > 10 && live.height > 10) {
      try {
        var dataUrl = live.toDataURL('image/png', 0.92);
        if (dataUrl && dataUrl.length > 500) return dataUrl;
      } catch(e) {}
    }

    var chartInst = null;
    if (window.Chart && Chart.instances) {
      var keys = Object.keys(Chart.instances);
      for (var i = 0; i < keys.length; i++) {
        var inst = Chart.instances[keys[i]];
        if (inst.canvas && inst.canvas.id === canvasId) { chartInst = inst; break; }
      }
    }
    if (!chartInst) return null;

    try {
      var oc = document.createElement('canvas');
      oc.width = w; oc.height = h;
      oc.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none;';
      document.body.appendChild(oc);

      var cfg = JSON.parse(JSON.stringify({
        type    : chartInst.config.type,
        data    : chartInst.config.data,
        options : chartInst.config.options,
      }));

      cfg.options = cfg.options || {};
      cfg.options.animation = false;
      cfg.options.animations = false;
      cfg.options.responsive = false;
      cfg.options.maintainAspectRatio = false;

      var newChart = new Chart(oc, cfg);
      _offscreenCharts.push(newChart);

      var result = oc.toDataURL('image/png', 0.92);
      return (result && result.length > 500) ? result : null;
    } catch(e) {
      console.warn('[pdf] offscreen render failed for', canvasId, e.message);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // DOM TABLE READER
  // ─────────────────────────────────────────────────────────────
  function tableFromDOM(id) {
    var tbody = document.querySelector('#' + id + ' tbody');
    var thead = document.querySelector('#' + id + ' thead');
    if (!tbody || !thead) return null;

    var head = [Array.from(thead.querySelectorAll('th')).map(function(th){
      return th.textContent.trim();
    })];

    var body = Array.from(tbody.querySelectorAll('tr')).map(function(tr){
      return Array.from(tr.querySelectorAll('td')).map(function(td){
        return td.textContent.trim();
      });
    }).filter(function(r){ return r.length > 0 && r.some(function(c){ return c !== ''; }); });

    if (!head[0] || !head[0].length || !body.length) return null;
    return { head:head, body:body };
  }

  function safe(v, fb) {
    if (v === null || v === undefined) return fb || '—';
    if (typeof v === 'number' && isNaN(v)) return fb || '—';
    return v;
  }

  // ─────────────────────────────────────────────────────────────
  // HELPER: Ensure minimum space on page, add new page if needed
  // ─────────────────────────────────────────────────────────────
  function ensureSpace(doc, requiredHeight) {
    var currentY = doc.lastAutoTable ? doc.lastAutoTable.finalY : P.mt;
    var available = P.h - P.mb - currentY;
    if (available < requiredHeight) {
      doc.addPage();
      return P.mt;  // Return top margin on fresh page
    }
    return currentY;  // Return current position
  }

  // ─────────────────────────────────────────────────────────────
  // PAGE CHROME — Clarity style
  // ─────────────────────────────────────────────────────────────
  function header(doc, title) {
    // Clarity blue top bar
    doc.setFillColor.apply(doc, C.primary);
    doc.rect(0, 0, P.w, 13, 'F');

    // Left logo chip — Clarity dark blue rectangle
    doc.setFillColor.apply(doc, C.primaryD);
    doc.roundedRect(P.ml, 2.5, 22, 8, 2, 2, 'F');
    doc.setFontSize(8.5); doc.setFont(undefined, 'bold');
    doc.setTextColor.apply(doc, C.panel);
    doc.text('RVTools', P.ml + 11, 7.8, { align: 'center' });

    // Section title
    doc.setFontSize(10.5); doc.setFont(undefined, 'bold');
    doc.setTextColor.apply(doc, C.panel);
    doc.text(title, P.ml + 26, 8.5);

    // Timestamp right-aligned
    doc.setFontSize(7.5); doc.setFont(undefined, 'normal');
    doc.setTextColor(200, 225, 240);
    doc.text(new Date().toLocaleString('en-IN'), P.w - P.mr, 8.5, { align: 'right' });
    doc.setTextColor.apply(doc, C.dark);
  }

  function footer(doc, pg, total) {
    var y = P.h - 7;
    // Clarity thin bottom border
    doc.setDrawColor.apply(doc, C.border);
    doc.setLineWidth(0.3);
    doc.line(P.ml, y - 2, P.w - P.mr, y - 2);
    doc.setLineWidth(0.2);

    doc.setFontSize(7.5); doc.setFont(undefined, 'normal');
    doc.setTextColor.apply(doc, C.mid);
    doc.text('Infrastructure Assessment Report — Confidential', P.ml, y);
    doc.text('Page ' + pg + ' / ' + total, P.w - P.mr, y, { align: 'right' });
    doc.setTextColor.apply(doc, C.dark);
  }

  // Section banner — Clarity light blue bg, primary text
  function banner(doc, label, y) {
    doc.setFillColor.apply(doc, C.primaryL);
    doc.rect(P.ml, y, P.w - P.ml - P.mr, 10, 'F');

    // Left accent bar
    doc.setFillColor.apply(doc, C.primary);
    doc.rect(P.ml, y, 3, 10, 'F');

    doc.setFontSize(11); doc.setFont(undefined, 'bold');
    doc.setTextColor.apply(doc, C.primaryD);
    doc.text(label, P.ml + 7, y + 7);
    doc.setFont(undefined, 'normal');
    doc.setTextColor.apply(doc, C.dark);
    return y + 14;
  }

  function subHead(doc, txt, y) {
    doc.setFontSize(9); doc.setFont(undefined, 'bold');
    doc.setTextColor.apply(doc, C.primary);
    doc.text(txt, P.ml, y);
    doc.setFont(undefined, 'normal');
    doc.setTextColor.apply(doc, C.dark);
    return y + 5;
  }

  // Clarity datagrid: blue header, light blue alternating rows, border lines
  function autoTbl(doc, data, y, opts) {
    if (!data) return y;
    var cfg = Object.assign({
      head               : data.head,
      body               : data.body,
      startY             : y,
      styles             : {
        fontSize     : 7.5,
        cellPadding  : 2.5,
        overflow     : 'ellipsize',
        lineColor    : C.border,
        lineWidth    : 0.15,
      },
      headStyles         : {
        fillColor    : C.primary,
        textColor    : C.panel,
        fontStyle    : 'bold',
        fontSize     : 7.5,
        lineColor    : C.primaryD,
        lineWidth    : 0.2,
      },
      alternateRowStyles : { fillColor: [240, 248, 252] }, // very light blue tint
      tableLineColor     : C.border,
      tableLineWidth     : 0.15,
      tableWidth         : P.w - P.ml - P.mr,
      margin             : { left: P.ml, right: P.mr },
    }, opts || {});

    doc.autoTable(cfg);
    return doc.lastAutoTable.finalY + 8;
  }

  function safeAddImage(doc, img, x, y, w, h) {
    if (!img || img.length < 500) return;
    try { doc.addImage(img, 'PNG', x, y, w, h); }
    catch(e) { console.warn('[pdf] addImage skipped:', e.message); }
  }

  // ─────────────────────────────────────────────────────────────
  // COVER PAGE — Clarity dark navy theme
  // ─────────────────────────────────────────────────────────────
  function buildCover(doc) {
    var k = (window.APP_STATE.summary.kpi) || {};
    var r = (window.APP_STATE.summary.ratios) || {};

    // Background — Clarity dark navy
    doc.setFillColor.apply(doc, C.navyMid);
    doc.rect(0, 0, P.w, P.h, 'F');

    // Top Clarity blue header stripe
    doc.setFillColor.apply(doc, C.primary);
    doc.rect(0, 0, P.w, 14, 'F');

    // VMware / RVTools branding in header
    doc.setFontSize(9); doc.setFont(undefined, 'bold');
    doc.setTextColor.apply(doc, C.panel);
    doc.text('VMware | RVTools Infrastructure Analyser', P.ml, 9.5);

    doc.setFontSize(8); doc.setFont(undefined, 'normal');
    doc.setTextColor(200, 225, 240);
    doc.text(new Date().toLocaleString('en-IN', {
      year:'numeric', month:'long', day:'2-digit',
      hour:'2-digit', minute:'2-digit'
    }), P.w - P.mr, 9.5, { align: 'right' });

    // Main content card — darker navy
    doc.setFillColor.apply(doc, C.navyDark);
    doc.roundedRect(14, 20, P.w - 28, 136, 4, 4, 'F');

    // Clarity blue left accent bar on card
    doc.setFillColor.apply(doc, C.primary);
    doc.roundedRect(14, 20, 4, 136, 2, 2, 'F');

    // Title block
    doc.setTextColor.apply(doc, C.panel);
    doc.setFontSize(24); doc.setFont(undefined, 'bold');
    doc.text('Infrastructure Assessment Report', P.w / 2, 48, { align: 'center' });

    doc.setFontSize(11); doc.setFont(undefined, 'normal');
    doc.setTextColor(160, 210, 235);
    doc.text('VMware RVTools — Multi-Dashboard Analysis', P.w / 2, 58, { align: 'center' });

    // Clarity blue divider line
    doc.setDrawColor.apply(doc, C.primaryM);
    doc.setLineWidth(0.6);
    doc.line(P.w / 2 - 60, 64, P.w / 2 + 60, 64);
    doc.setLineWidth(0.2);

    // KPI metric boxes — Clarity navy card style
    var metrics = [
      ['ESXi Hosts',      safe(k.hosts, '—')],
      ['Total VMs',       safe(k.total_vms, '—')],
      ['Active VMs',      safe(k.active_vms, '—')],
      ['Total vCPUs',     safe(k.total_vcpus, '—')],
      ['Physical RAM',    safe(k.physical_memory_gib, '—') + ' GiB'],
      ['vRAM Allocated',  safe(k.virtual_memory_gib, '—') + ' GiB'],
      ['Storage Prov.',   safe(k.storage_provisioned_tib, '—') + ' TiB'],
      ['vCPU:Core',       safe(r.core_to_vcpu, '—') + 'x'],
    ];

    var cols = 4;
    var bw = (P.w - 28 - 12 - (cols - 1) * 6) / cols;
    var bh = 22;
    var bx0 = 14 + 10;
    var by0 = 70;

    metrics.forEach(function (m, i) {
      var col = i % cols;
      var row = Math.floor(i / cols);
      var bx = bx0 + col * (bw + 6);
      var by = by0 + row * (bh + 5);

      // Card bg
      doc.setFillColor.apply(doc, C.navyBox);
      doc.roundedRect(bx, by, bw, bh, 2, 2, 'F');

      // Top blue accent line on each card
      doc.setFillColor.apply(doc, C.primaryM);
      doc.roundedRect(bx, by, bw, 2, 1, 1, 'F');

      // Label
      doc.setFontSize(7); doc.setFont(undefined, 'normal');
      doc.setTextColor(140, 190, 220);
      doc.text(m[0], bx + 4, by + 8);

      // Value
      doc.setFontSize(13); doc.setFont(undefined, 'bold');
      doc.setTextColor.apply(doc, C.panel);
      doc.text(String(m[1]), bx + 4, by + 17);
      doc.setFont(undefined, 'normal');
    });

    // Bottom confidential notice
    doc.setFontSize(8); doc.setFont(undefined, 'normal');
    doc.setTextColor(90, 120, 150);
    doc.text('CONFIDENTIAL — For Internal Use Only', P.w / 2, P.h - 8, { align: 'center' });
  }

  // ─────────────────────────────────────────────────────────────
  // SECTION BUILDERS
  // ─────────────────────────────────────────────────────────────
  function buildExecutiveSummary(doc) {
    doc.addPage();
    var y = banner(doc, '1  Executive Summary', P.mt);

    var k = window.APP_STATE.summary.kpi || {};
    var r = window.APP_STATE.summary.ratios || {};

    var kpis = [
      { l:'ESXi Hosts',        v:safe(k.hosts,'—') },
      { l:'Total VMs',         v:safe(k.total_vms,'—') },
      { l:'Active VMs (On)',   v:safe(k.active_vms,'—') },
      { l:'Total vCPUs',       v:safe(k.total_vcpus,'—') },
      { l:'Physical Cores',    v:safe(k.total_cores,'—') },
      { l:'vCPU:Core Ratio',   v:safe(r.core_to_vcpu,'—')+'x' },
      { l:'Physical RAM',      v:safe(k.physical_memory_gib,'—')+' GiB' },
      { l:'vRAM Allocated',    v:safe(k.virtual_memory_gib,'—')+' GiB' },
      { l:'vRAM:pRAM Ratio',   v:safe(r.vram_to_pram,'—')+'x' },
      { l:'Storage Prov.',     v:safe(k.storage_provisioned_tib,'—')+' TiB'},
      { l:'Storage Capacity',  v:safe(k.storage_capacity_tib,'—')+' TiB' },
      { l:'VMs per Host',      v:safe(r.vm_per_host,'—') },
    ];

    var cols = 3;
    var bw = (P.w - P.ml - P.mr - (cols - 1) * 5) / cols;
    var bh = 18;

    kpis.forEach(function (kpi, i) {
      var col = i % cols;
      var row = Math.floor(i / cols);
      var bx = P.ml + col * (bw + 5);
      var by = y + row * (bh + 4);

      // Clarity light-blue card bg
      doc.setFillColor.apply(doc, C.primaryL);
      doc.rect(bx, by, bw, bh, 'F');

      // Left Clarity blue accent bar
      doc.setFillColor.apply(doc, C.primary);
      doc.rect(bx, by, 3, bh, 'F');

      // Clarity border
      doc.setDrawColor.apply(doc, C.border);
      doc.setLineWidth(0.15);
      doc.rect(bx, by, bw, bh);
      doc.setLineWidth(0.2);

      // Label
      doc.setFontSize(7.5); doc.setFont(undefined, 'normal');
      doc.setTextColor.apply(doc, C.mid);
      doc.text(kpi.l, bx + 6, by + 6);

      // Value
      doc.setFontSize(13); doc.setFont(undefined, 'bold');
      doc.setTextColor.apply(doc, C.primaryD);
      doc.text(String(kpi.v), bx + 6, by + 14.5);
      doc.setFont(undefined, 'normal');
    });

    y += Math.ceil(kpis.length / cols) * (bh + 4) + 8;
    y = subHead(doc, 'Key Findings', y);

    doc.setFontSize(9); doc.setTextColor.apply(doc, C.dark);
    var findings = [];

    if (k.hosts) findings.push(
      'Infrastructure spans ' + k.hosts + ' ESXi hosts managing ' +
      safe(k.total_vms, '—') + ' virtual machines (' +
      safe(k.active_vms, '—') + ' powered on).');

    if (r.core_to_vcpu) findings.push(
      'CPU overcommit ratio is ' + r.core_to_vcpu + 'x — ' +
      safe(k.total_vcpus, '—') + ' vCPUs across ' +
      safe(k.total_cores, '—') + ' physical cores.');

    if (r.vram_to_pram) findings.push(
      'Memory overcommit ratio is ' + r.vram_to_pram + 'x — ' +
      safe(k.virtual_memory_gib, '—') + ' GiB vRAM on ' +
      safe(k.physical_memory_gib, '—') + ' GiB physical RAM.');

    var cap = safe(k.storage_capacity_tib, 0);
    var prov = safe(k.storage_provisioned_tib, 0);
    if (cap > 0) findings.push(
      'Storage: ' + prov + ' TiB provisioned of ' + cap + ' TiB capacity (' +
      Math.round((prov / cap) * 100) + '% utilization).');

    if (!findings.length) findings.push('Load RVTools data to populate findings.');

    findings.forEach(function (f) {
      // Clarity bullet — use primary blue dot
      doc.setFillColor.apply(doc, C.primary);
      doc.circle(P.ml + 2, y - 1.5, 1, 'F');

      var lines = doc.splitTextToSize(f, P.w - P.ml - P.mr - 8);
      doc.setTextColor.apply(doc, C.dark);
      doc.text(lines, P.ml + 6, y);
      y += lines.length * 5.5;
    });
  }

  function buildClusters(doc) {
    doc.addPage();
    var y = banner(doc, '2  Cluster Inventory', P.mt);

    var d = tableFromDOM('tbl-clusters') || tableFromDOM('tbl-clusters-full');
    if (d) autoTbl(doc, d, y);
    else { doc.setFontSize(9); doc.text('No cluster data.', P.ml, y); }
  }

  function buildHosts(doc) {
    doc.addPage();
    var y = banner(doc, '3  ESXi Host Inventory', P.mt);

    var d = tableFromDOM('tbl-hosts-full') || tableFromDOM('tbl-hosts');
    if (d) {
      var total = d.body.length;
      d.body = d.body.slice(0, 50);
      autoTbl(doc, d, y, { styles: { fontSize: 7, cellPadding: 2 } });

      if (total > 50) {
        var ly = doc.lastAutoTable.finalY + 3;
        doc.setFontSize(7.5); doc.setTextColor.apply(doc, C.mid);
        doc.text('Showing first 50 of ' + total + ' hosts.', P.ml, ly);
        doc.setTextColor.apply(doc, C.dark);
      }
    } else { doc.setFontSize(9); doc.text('No host data.', P.ml, y); }
  }

  function buildVMs(doc) {
    doc.addPage();
    var y = banner(doc, '4  Virtual Machine Inventory', P.mt);

    var d = tableFromDOM('tbl-vms');
    if (d) {
      var total = d.body.length;
      d.body = d.body.slice(0, 50);
      autoTbl(doc, d, y, { styles: { fontSize: 6.5, cellPadding: 1.8 } });

      if (total > 50) {
        var ly = doc.lastAutoTable.finalY + 3;
        doc.setFontSize(7.5); doc.setTextColor.apply(doc, C.mid);
        doc.text('Showing 50 of ' + total + ' VMs. Full data in source file.', P.ml, ly);
        doc.setTextColor.apply(doc, C.dark);
      }
    } else { doc.setFontSize(9); doc.text('No VM data.', P.ml, y); }
  }

  // ─────────────────────────────────────────────────────────────
  // SECTION 5: Statistics — Dedicated chart pages
  // ─────────────────────────────────────────────────────────────
  function buildStatistics(doc) {
    doc.addPage();
    var y = banner(doc, '5  Infrastructure Statistics', P.mt);

    // ESX Distribution table (if exists)
    var d = tableFromDOM('tbl-esx-dist');
    if (d) {
      y = subHead(doc, 'ESXi Host Size Distribution', y);
      doc.autoTable({
        head               : d.head,
        body               : d.body,
        startY             : y,
        styles             : { fontSize: 8, cellPadding: 2.5, lineColor: C.border, lineWidth: 0.15 },
        headStyles         : { fillColor: C.primary, textColor: C.panel, fontStyle: 'bold' },
        alternateRowStyles : { fillColor: [240, 248, 252] },
        tableLineColor     : C.border,
        tableLineWidth     : 0.15,
        tableWidth         : (P.w - P.ml - P.mr) / 2 - 5,
        margin             : { left: P.ml, right: P.mr },
      });
      y = doc.lastAutoTable.finalY + 10;
    }

    // ── CHARTS: Dedicated section on new page if needed ──────
    var img1 = chartImg('chart-stat-esx', 800, 380);
    var img2 = chartImg('chart-stat-vm',  800, 380);

    if (img1 || img2) {
      // Check if we have space for two side-by-side charts (~75mm tall)
      y = ensureSpace(doc, 85);

      var cw = (P.w - P.ml - P.mr - 10) / 2;
      var ch = 70;

      if (img1) {
        y = subHead(doc, 'ESXi Host Distribution', y);
        safeAddImage(doc, img1, P.ml, y + 2, cw, ch);
      }

      if (img2) {
        subHead(doc, 'VM Power State Distribution', y);
        safeAddImage(doc, img2, P.ml + cw + 10, y + 2, cw, ch);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // SECTION 6: Storage — Dedicated chart page
  // ─────────────────────────────────────────────────────────────
  function buildStorage(doc) {
    doc.addPage();
    var y = banner(doc, '6  Storage Analysis', P.mt);

    // Storage table
    var d = tableFromDOM('tbl-storage-main');
    if (d) {
      y = autoTbl(doc, d, y);
    }

    // ── CHART: Dedicated space ──────────────────────────────
    var img = chartImg('chart-storage', 900, 420);
    if (img) {
      // Ensure minimum 80mm available for chart
      y = ensureSpace(doc, 85);
      y = subHead(doc, 'Storage Distribution by Datastore', y);
      
      // Full-width chart
      var chartW = P.w - P.ml - P.mr;
      var chartH = 75;
      safeAddImage(doc, img, P.ml, y + 2, chartW, chartH);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // SECTION 7: End of Support — Dedicated multi-chart page
  // ─────────────────────────────────────────────────────────────
  function buildEndOfSupport(doc) {
    doc.addPage();
    var y = banner(doc, '7  End of Support Analysis', P.mt);

    // EOS status table (top 20 rows)
    var d = tableFromDOM('tbl-support');
    if (d) {
      d.body = d.body.slice(0, 20);
      y = autoTbl(doc, d, y);
    }

    // ── CHARTS: 4 pie charts in a grid ─────────────────────
    var eosCharts = [
      { id: 'chart-eos-total',   label: 'Total Assets' },
      { id: 'chart-eos-linux',   label: 'Linux'        },
      { id: 'chart-eos-windows', label: 'Windows'      },
      { id: 'chart-eos-esx',     label: 'ESXi'         },
    ];

    // Check if any charts exist
    var hasCharts = eosCharts.some(function (c) {
      return chartImg(c.id, 400, 400);
    });

    if (hasCharts) {
      // Ensure space for 4-chart grid (~65mm tall)
      y = ensureSpace(doc, 75);

      y = subHead(doc, 'End of Support Status Breakdown', y);

      var cw  = (P.w - P.ml - P.mr - 15) / 4;  // 4 columns
      var ch  = cw * 0.95;  // Slightly shorter than wide

      eosCharts.forEach(function (c, i) {
        var img = chartImg(c.id, 450, 450);
        if (!img) return;

        var cx = P.ml + i * (cw + 5);

        // Chart label above
        doc.setFontSize(8);
        doc.setFont(undefined, 'bold');
        doc.setTextColor.apply(doc, C.primary);
        doc.text(c.label, cx + cw / 2, y, { align: 'center' });

        // Chart image
        safeAddImage(doc, img, cx, y + 4, cw, ch);
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // SECTION 8: Forecast — Dedicated timeline chart page
  // ─────────────────────────────────────────────────────────────
  function buildForecast(doc) {
    doc.addPage();
    var y = banner(doc, '8  End of Support Forecast', P.mt);

    // Forecast table (top 15 rows)
    var d = tableFromDOM('tbl-forecast');
    if (d) {
      d.body = d.body.slice(0, 15);
      y = autoTbl(doc, d, y);
    }

    // ── TIMELINE CHART: Full-width ───────────────────────────
    var img = chartImg('chart-forecast-timeline', 1000, 400);
    if (img) {
      // Ensure space for wide timeline chart (~80mm tall)
      y = ensureSpace(doc, 90);
      y = subHead(doc, 'OS Support Status Timeline', y);

      var chartW = P.w - P.ml - P.mr;
      var chartH = 75;
      safeAddImage(doc, img, P.ml, y + 3, chartW, chartH);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // MAIN EXPORT
  // ─────────────────────────────────────────────────────────────
  window.exportCompletePDF = function () {
    if (!window.APP_STATE || !window.APP_STATE.loaded) {
      alert('⚠️ Upload and process your RVTools file first.'); return;
    }

    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert('⚠️ jsPDF library not loaded — check CDN'); return;
    }

    console.log('[pdf] Starting complete multi-dashboard export…');

    var doc = new jspdf.jsPDF({
      orientation : 'landscape',
      unit        : 'mm',
      format      : 'a4',
    });

    // Build all sections
    buildCover(doc);
    buildExecutiveSummary(doc);
    buildClusters(doc);
    buildHosts(doc);
    buildVMs(doc);
    buildStatistics(doc);
    buildStorage(doc);
    buildEndOfSupport(doc);
    buildForecast(doc);

    // Apply header+footer to all pages except cover
    var totalPages = doc.internal.pages.length - 1;
    for (var i = 2; i <= totalPages; i++) {
      doc.setPage(i);
      var ttl = 'RVTools Infrastructure Assessment';
      if (i === 2) ttl = 'Executive Summary';
      else if (i === 3) ttl = 'Cluster Inventory';
      else if (i === 4) ttl = 'ESXi Host Inventory';
      else if (i === 5) ttl = 'Virtual Machine Inventory';
      else if (i === 6) ttl = 'Infrastructure Statistics';
      else if (i === 7) ttl = 'Storage Analysis';
      else if (i === 8) ttl = 'End of Support Analysis';
      else if (i === 9) ttl = 'End of Support Forecast';

      header(doc, ttl);
      footer(doc, i - 1, totalPages - 1);
    }

    destroyOffscreen();

    var filename = 'RVTools-Infrastructure-Assessment-' +
      new Date().toISOString().slice(0, 10) + '.pdf';

    doc.save(filename);
    console.log('[pdf] ✅ Export complete:', filename);
  };

})();
