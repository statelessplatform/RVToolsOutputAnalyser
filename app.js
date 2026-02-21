// ── Utilities ──────────────────────────────────────────────
function num(v) {
  if (v === null || v === undefined || v === "") return 0;
  const n = parseFloat(String(v).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}
function pct(part, total) {
  if (!total) return "0%";
  return ((part / total) * 100).toFixed(1) + "%";
}
function isPoweredOn(row) {
  const p   = (row["Powerstate"] || "").toString().trim().toLowerCase();
  const tpl = (row["Template"]   || "").toString().trim().toLowerCase();
  return p === "poweredon" && tpl !== "true";
}
function powerBadge(state) {
  const s = (state || "").toLowerCase();
  if (s === "poweredon")  return `<span class="badge badge-on">On</span>`;
  if (s === "poweredoff") return `<span class="badge badge-off">Off</span>`;
  return `<span class="badge badge-sus">${state || "–"}</span>`;
}
function safeStr(v) {
  if (v === null || v === undefined) return "Unknown";
  const s = String(v).trim();
  return s === "" ? "Unknown" : s;
}

// ── Navigation ──────────────────────────────────────────────
const VIEWS = ["dashboard", "clusters", "hosts", "vms"];

function showView(name) {
  // Toggle view panels
  VIEWS.forEach(v => {
    document.getElementById(`view-${v}`).classList.toggle("hidden", v !== name);
  });

  // Highlight active nav button
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.classList.toggle("nav-item-active", btn.dataset.view === name);
  });

  // Update page title
  const titles = {
    dashboard: "Dashboard",
    clusters:  "Clusters",
    hosts:     "Hosts",
    vms:       "VM Inventory",
  };
  document.getElementById("page-title").textContent = titles[name] || "Dashboard";
}

function unlockNav() {
  document.querySelectorAll(".nav-locked").forEach(btn => {
    btn.classList.remove("nav-locked");
  });
  document.querySelectorAll(".nav-item[data-view]").forEach(btn => {
    btn.addEventListener("click", () => showView(btn.dataset.view));
  });
}

// ── Sheet dispatcher ─────────────────────────────────────────
function detectSheetType(cols) {
  const c = new Set(cols.map(s => s.trim()));
  return {
    isVInfo: c.has("VM") && c.has("CPUs") &&
             (c.has("Memory") || c.has("Memory MiB")),
    isVHost: (c.has("# CPU") || c.has("#CPU")) &&
             (c.has("# Cores") || c.has("Cores per CPU")),
    isVDisk: c.has("VM") && (c.has("Disk") || c.has("Disk Key")) &&
             c.has("Capacity MiB"),
    isVDS:   c.has("Capacity MiB") && !c.has("VM") &&
             (c.has("Name") || c.has("Datastore") || c.has("Free space MiB")),
    isVCPU:  c.has("VM") && c.has("CPUs") && c.has("Sockets"),
    isVMem:  c.has("VM") && c.has("Size MiB") && !c.has("CPUs"),
  };
}

function dispatchRows(rows, label, buckets) {
  if (!rows || rows.length === 0) return;
  const cols = Object.keys(rows[0] || {});
  const t = detectSheetType(cols);

  if (t.isVInfo) {
    console.log(`[vInfo]  ← ${label} (${rows.length})`);
    buckets.vinfo.push(...rows);
  } else if (t.isVHost) {
    console.log(`[vHost]  ← ${label} (${rows.length})`);
    buckets.vhost.push(...rows);
  } else if (t.isVDisk) {
    console.log(`[vDisk]  ← ${label} (${rows.length})`);
    buckets.vdisk.push(...rows);
  } else if (t.isVDS) {
    console.log(`[vDS]    ← ${label} (${rows.length})`);
    buckets.vds.push(...rows);
  } else if (t.isVCPU) {
    console.log(`[vCPU]   ← ${label} (${rows.length})`);
    buckets.vcpu.push(...rows);
  } else if (t.isVMem) {
    console.log(`[vMem]   ← ${label} (${rows.length})`);
    buckets.vmem.push(...rows);
  } else {
    console.warn(`[skip]   ← ${label}`, cols.slice(0, 8));
  }
}

// ── File parsing: CSV + XLSX ─────────────────────────────────
async function parseFiles(fileList) {
  const buckets = {
    vinfo: [], vhost: [], vdisk: [], vds: [], vcpu: [], vmem: [],
  };
  for (const file of Array.from(fileList)) {
    const ext = file.name.toLowerCase().split(".").pop();
    if (ext === "csv") {
      const text   = await file.text();
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      dispatchRows(parsed.data, file.name, buckets);
    } else if (ext === "xlsx" || ext === "xls") {
      const buf      = await file.arrayBuffer();
      const workbook = XLSX.read(buf, { type: "array" });
      workbook.SheetNames.forEach(sheetName => {
        const rows = XLSX.utils.sheet_to_json(
          workbook.Sheets[sheetName], { defval: "" }
        );
        dispatchRows(rows, `${file.name} → ${sheetName}`, buckets);
      });
    } else {
      console.warn("Unsupported:", file.name);
    }
  }
  return buckets;
}

// ── Aggregation ──────────────────────────────────────────────
let _allVMs = [];   // kept for VM search/filter

function computeSummary(buckets) {
  const { vinfo, vhost, vds } = buckets;

  let totalVms = 0, activeVms = 0;
  let totalVcpus = 0, vMemMiB = 0, storageProvMiB = 0;

  const perCluster = new Map();
  const perPower   = new Map();
  const perOS      = new Map();
  const perHW      = new Map();
  const vmList     = [];

  for (const row of vinfo) {
    totalVms++;
    const cpus  = num(row["CPUs"]);
    const mem   = num(row["Memory"] ?? row["Memory MiB"]);
    const prov  = num(row["Provisioned MiB"]);
    const hw    = safeStr(row["HW version"] ?? row["HW Version"] ?? "");
    const cluster = safeStr(row["Cluster"]);
    const host    = safeStr(row["Host"]);
    const power   = safeStr(row["Powerstate"]);
    const os = safeStr(
      row["OS according to the VMware Tools"] ??
      row["OS according to the configuration file"] ?? ""
    );
    const osShort = os.length > 42 ? os.slice(0, 40) + "…" : os;

    totalVcpus     += cpus;
    vMemMiB        += mem;
    storageProvMiB += prov;
    if (isPoweredOn(row)) activeVms++;

    if (!perCluster.has(cluster)) {
      perCluster.set(cluster, {
        cluster, vm_count: 0, total_vcpus: 0, total_mem_mib: 0, p_cores: 0,
      });
    }
    const cl = perCluster.get(cluster);
    cl.vm_count++;
    cl.total_vcpus   += cpus;
    cl.total_mem_mib += mem;

    perPower.set(power,   (perPower.get(power)   || 0) + 1);
    perOS.set(osShort,    (perOS.get(osShort)     || 0) + 1);
    perHW.set(hw,         (perHW.get(hw)          || 0) + 1);

    vmList.push({
      vm_name:     safeStr(row["VM"]),
      powerstate:  power,
      cpus,
      memory_gib:  +(mem  / 1024).toFixed(1),
      storage_gib: +(prov / 1024).toFixed(1),
      cluster,
      host,
      os:          osShort,
      hw,
    });
  }

  // Host rows
  let hosts = 0, pCores = 0, pMemMiB = 0;
  const hostRows = [];

  for (const row of vhost) {
    hosts++;
    const sockets = num(row["# CPU"]);
    const cpc     = num(row["Cores per CPU"]);
    const cores   = num(row["# Cores"]) || (sockets * cpc);
    const mem     = num(row["# Memory"]);
    const vcpusPl = num(row["# vCPUs"]);
    const vmCount = num(row["# VMs"]);
    const cluster = safeStr(row["Cluster"]);

    pCores  += cores;
    pMemMiB += mem;

    if (perCluster.has(cluster)) {
      perCluster.get(cluster).p_cores += cores;
    }

    hostRows.push({
      host_name:    safeStr(row["Host"]),
      cluster,
      num_cpu:      sockets,
      total_cores:  cores,
      memory_gib:   +(mem / 1024).toFixed(1),
      vcpus_placed: vcpusPl,
      vm_count:     vmCount,
      esx_version:  safeStr(row["ESX Version"]),
    });
  }

  let dsCapMiB = 0;
  for (const row of vds) dsCapMiB += num(row["Capacity MiB"]);

  // Sorted outputs
  const top10 = [...vmList].sort((a, b) => b.cpus - a.cpus).slice(0, 10);

  const byCluster = Array.from(perCluster.values())
    .map(c => ({
      ...c,
      total_mem_gib: +(c.total_mem_mib / 1024).toFixed(1),
      vcpu_core_ratio: c.p_cores
        ? +(c.total_vcpus / c.p_cores).toFixed(2)
        : "–",
    }))
    .sort((a, b) => b.total_vcpus - a.total_vcpus);

  const osList = Array.from(perOS.entries())
    .map(([os, count]) => ({ os, count }))
    .sort((a, b) => b.count - a.count).slice(0, 8);

  const powerList = Array.from(perPower.entries())
    .map(([state, count]) => ({ state, count }))
    .sort((a, b) => b.count - a.count);

  const hwList = Array.from(perHW.entries())
    .map(([hw, count]) => ({ hw, count }))
    .sort((a, b) => b.count - a.count).slice(0, 8);

  _allVMs = vmList;   // store for live search

  return {
    kpi: {
      active_vms:              activeVms,
      total_vms:               totalVms,
      hosts,
      total_vcpus:             totalVcpus,
      physical_cores:          pCores,
      physical_memory_gib:     +(pMemMiB       / 1024).toFixed(1),
      virtual_memory_gib:      +(vMemMiB       / 1024).toFixed(1),
      storage_provisioned_tib: +(storageProvMiB / 1_048_576).toFixed(2),
      storage_capacity_tib:    +(dsCapMiB       / 1_048_576).toFixed(2),
    },
    ratios: {
      core_to_vcpu: pCores  ? +(totalVcpus / pCores).toFixed(2)  : 0,
      vram_to_pram: pMemMiB ? +(vMemMiB    / pMemMiB).toFixed(2) : 0,
      vm_density:   hosts   ? +(activeVms  / hosts).toFixed(1)   : 0,
    },
    top10_vcpu: top10,
    by_cluster: byCluster,
    os_list:    osList,
    power_list: powerList,
    hw_list:    hwList,
    host_rows:  hostRows,
  };
}

// ── Table fill helper ────────────────────────────────────────
function setText(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = v;
}

function fillTable(tableId, rows, columns) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return;
  tbody.innerHTML = "";
  if (!rows || rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${columns.length}"
      style="color:#9ca3af;text-align:center;padding:16px">No data</td></tr>`;
    return;
  }
  const frag = document.createDocumentFragment();
  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = columns.map(col =>
      typeof col === "function"
        ? `<td>${col(row)}</td>`
        : `<td>${row[col] ?? "–"}</td>`
    ).join("");
    frag.appendChild(tr);
  }
  tbody.appendChild(frag);
}

// ── VM search / filter ───────────────────────────────────────
function renderVMTable(vms) {
  fillTable("table-vms-full", vms, [
    "vm_name",
    row => powerBadge(row.powerstate),
    "cpus", "memory_gib", "storage_gib",
    "cluster", "host", "os", "hw",
  ]);
  const lbl = document.getElementById("vm-count-label");
  if (lbl) lbl.textContent = `${vms.length} VMs`;
}

function applyVMFilters() {
  const q     = (document.getElementById("vm-search").value || "").toLowerCase();
  const power = (document.getElementById("vm-filter-power").value || "").toLowerCase();

  const filtered = _allVMs.filter(vm => {
    const matchPower = !power || vm.powerstate.toLowerCase() === power;
    const matchQ     = !q ||
      vm.vm_name.toLowerCase().includes(q) ||
      vm.cluster.toLowerCase().includes(q) ||
      vm.os.toLowerCase().includes(q) ||
      vm.host.toLowerCase().includes(q);
    return matchPower && matchQ;
  });
  renderVMTable(filtered);
}

// ── Main render ──────────────────────────────────────────────
function renderDashboard(s) {
  const k = s.kpi, r = s.ratios;

  // KPIs
  setText("kpi-active-vms",   k.active_vms);
  setText("kpi-total-vms",    `${k.total_vms} total VMs`);
  setText("kpi-hosts",        k.hosts);
  setText("kpi-vcpus",        k.total_vcpus);
  setText("kpi-cores",        `${k.physical_cores} physical cores`);
  setText("kpi-pram",         `${k.physical_memory_gib} GiB`);
  setText("kpi-vram",         `${k.virtual_memory_gib} GiB`);
  setText("kpi-storage-prov", `${k.storage_provisioned_tib} TiB`);
  setText("kpi-storage-cap",  `${k.storage_capacity_tib} TiB capacity`);

  setText("ratio-core-vcpu",  r.core_to_vcpu || "–");
  setText("ratio-vram-pram",  r.vram_to_pram || "–");
  setText("ratio-vm-density", r.vm_density   || "–");

  // Dashboard tables
  fillTable("table-top10", s.top10_vcpu, [
    "vm_name", "cpus", "memory_gib", "storage_gib",
    "cluster", row => powerBadge(row.powerstate),
  ]);
  fillTable("table-power", s.power_list, [
    row => powerBadge(row.state), "count",
    row => pct(row.count, s.kpi.total_vms),
  ]);
  fillTable("table-os", s.os_list, [
    "os", "count",
    row => pct(row.count, s.kpi.total_vms),
  ]);
  fillTable("table-hw", s.hw_list, [
    "hw", "count",
    row => pct(row.count, s.kpi.total_vms),
  ]);

  // Clusters view
  fillTable("table-clusters-full", s.by_cluster, [
    "cluster", "vm_count", "total_vcpus",
    "total_mem_gib", "p_cores", "vcpu_core_ratio",
  ]);

  // Hosts view
  fillTable("table-hosts-full", s.host_rows, [
    "host_name", "cluster", "num_cpu", "total_cores",
    "memory_gib", "vcpus_placed", "vm_count", "esx_version",
  ]);

  // VMs view
  renderVMTable(_allVMs);

  // Show drop zone off, unlock nav, show dashboard
  document.getElementById("drop-zone").classList.add("hidden");
  unlockNav();
  showView("dashboard");

    // ✅ Enable PDF export
  enablePDFExport(s);
}

// ── File badges ──────────────────────────────────────────────
function updateBadges(files) {
  const container = document.getElementById("file-badges");
  container.innerHTML = "";
  Array.from(files).forEach(f => {
    const b = document.createElement("span");
    b.className   = "file-badge";
    b.textContent = f.name;
    container.appendChild(b);
  });
}

// ── Drag & drop ──────────────────────────────────────────────
function initDragDrop() {
  const zone  = document.getElementById("drop-zone");
  const input = document.getElementById("file-input");

  zone.addEventListener("click", () => input.click());

  zone.addEventListener("dragover", e => {
    e.preventDefault();
    zone.classList.add("drag-over");
  });
  zone.addEventListener("dragleave", e => {
    if (!zone.contains(e.relatedTarget)) zone.classList.remove("drag-over");
  });
  zone.addEventListener("drop", e => {
    e.preventDefault();
    zone.classList.remove("drag-over");
    if (e.dataTransfer.files.length) {
      const dt = new DataTransfer();
      Array.from(e.dataTransfer.files).forEach(f => dt.items.add(f));
      input.files = dt.files;
      updateBadges(input.files);
    }
  });
}

// ── Analyse click ────────────────────────────────────────────
async function onAnalyseClick() {
  const input = document.getElementById("file-input");
  const files = input.files;

  if (!files || files.length === 0) {
    alert("Please select at least one RVTools export (.xlsx or .csv).");
    return;
  }
  if (files.length > 10) {
    alert("Maximum 10 files allowed.");
    return;
  }

  const btn = document.getElementById("btn-analyse");
  btn.disabled    = true;
  btn.textContent = "⏳ Analysing…";

  try {
    const parsed  = await parseFiles(files);
    const summary = computeSummary(parsed);
    renderDashboard(summary);
  } catch (e) {
    console.error(e);
    alert("Failed to analyse files:\n" + e.message);
  } finally {
    btn.disabled    = false;
    btn.textContent = "Analyse →";
  }
}

// ── Clear ────────────────────────────────────────────────────
function onClearClick() {
  _allVMs = [];
  document.getElementById("file-input").value  = "";
  document.getElementById("file-badges").innerHTML = "";

  // Re-lock nav
  document.querySelectorAll(".nav-item[data-view]").forEach(btn => {
    if (btn.dataset.view !== "dashboard") {
      btn.classList.add("nav-locked");
      btn.replaceWith(btn.cloneNode(true)); // remove listeners
    }
  });

  // Re-wire dashboard nav item
  document.querySelector(".nav-item[data-view='dashboard']")
    .addEventListener("click", () => showView("dashboard"));

  VIEWS.forEach(v =>
    document.getElementById(`view-${v}`).classList.add("hidden")
  );
  document.getElementById("drop-zone").classList.remove("hidden");
}


// ── PDF Export ───────────────────────────────────────────────
let _summaryData = null;

function enablePDFExport(summary) {
  _summaryData = summary;
  document.getElementById("btn-export-pdf").classList.remove("hidden");
}

async function generatePDF() {
  if (!_summaryData) {
    alert("No data to export. Please analyse files first.");
    return;
  }

  const btn = document.getElementById("btn-export-pdf");
  btn.disabled = true;
  btn.textContent = "⏳ Generating PDF…";

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    
    const s = _summaryData;
    const k = s.kpi;
    const r = s.ratios;
    
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - 2 * margin;
    
    let yPos = margin;
    
    // ══════════════════════════════════════════════════════════
    // COVER PAGE
    // ══════════════════════════════════════════════════════════
    
    // Logo box
    doc.setFillColor(79, 70, 229);
    doc.rect(margin, yPos, 30, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont(undefined, 'bold');
    doc.text('RV', margin + 15, yPos + 20, { align: 'center' });
    
    // Title
    doc.setTextColor(17, 24, 39);
    doc.setFontSize(32);
    doc.text('VMware Infrastructure', margin + 35, yPos + 12);
    doc.setFontSize(28);
    doc.text('Assessment Report', margin + 35, yPos + 24);
    
    yPos += 50;
    
    // Metadata box with fixed layout
    doc.setFillColor(249, 250, 251);
    doc.rect(margin, yPos, contentWidth, 40, 'F');
    
    doc.setFontSize(9);
    doc.setTextColor(75, 85, 99);
    doc.setFont(undefined, 'normal');
    
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
    const timeStr = now.toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit'
    });
    
    const col1X = margin + 5;
    const col2X = margin + 65;
    const col3X = margin + 125;
    let rowY = yPos + 7;
    
    // Column 1
    doc.text(`Generated:`, col1X, rowY);
    doc.setFont(undefined, 'bold');
    doc.text(`${dateStr}`, col1X, rowY + 5);
    doc.text(`at ${timeStr}`, col1X, rowY + 10);
    
    doc.setFont(undefined, 'normal');
    doc.text(`Total VMs:`, col1X, rowY + 18);
    doc.setFont(undefined, 'bold');
    doc.text(`${k.total_vms}`, col1X, rowY + 23);
    
    // Column 2
    doc.setFont(undefined, 'normal');
    doc.text(`Active VMs:`, col2X, rowY);
    doc.setFont(undefined, 'bold');
    doc.text(`${k.active_vms}`, col2X, rowY + 5);
    
    doc.setFont(undefined, 'normal');
    doc.text(`ESXi Hosts:`, col2X, rowY + 13);
    doc.setFont(undefined, 'bold');
    doc.text(`${k.hosts}`, col2X, rowY + 18);
    
    doc.setFont(undefined, 'normal');
    doc.text(`VM Density:`, col2X, rowY + 26);
    doc.setFont(undefined, 'bold');
    doc.text(`${r.vm_density}/host`, col2X, rowY + 31);
    
    // Column 3
    doc.setFont(undefined, 'normal');
    doc.text(`Physical RAM:`, col3X, rowY);
    doc.setFont(undefined, 'bold');
    doc.text(`${k.physical_memory_gib} GiB`, col3X, rowY + 5);
    
    doc.setFont(undefined, 'normal');
    doc.text(`Virtual RAM:`, col3X, rowY + 13);
    doc.setFont(undefined, 'bold');
    doc.text(`${k.virtual_memory_gib} GiB`, col3X, rowY + 18);
    
    doc.setFont(undefined, 'normal');
    doc.text(`Storage Prov.:`, col3X, rowY + 26);
    doc.setFont(undefined, 'bold');
    doc.text(`${k.storage_provisioned_tib} TiB`, col3X, rowY + 31);
    
    yPos += 55;
    
    // Executive summary
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(17, 24, 39);
    doc.text('Executive Summary', margin, yPos);
    
    yPos += 10;
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(55, 65, 81);
    
    const summaryLines = [
      `This VMware infrastructure assessment covers ${k.total_vms} virtual machines distributed`,
      `across ${k.hosts} ESXi hosts. The environment shows a vCPU overcommit ratio of ${r.core_to_vcpu}:1`,
      `and memory overcommit of ${r.vram_to_pram}:1.`,
      ``,
      `With ${k.active_vms} active VMs and an average density of ${r.vm_density} VMs per host, the`,
      `infrastructure demonstrates ${r.core_to_vcpu < 4 ? 'conservative' : r.core_to_vcpu < 8 ? 'moderate' : 'aggressive'} resource allocation. Total provisioned storage`,
      `stands at ${k.storage_provisioned_tib} TiB against a capacity of ${k.storage_capacity_tib} TiB.`
    ];
    
    summaryLines.forEach(line => {
      doc.text(line, margin, yPos);
      yPos += 5;
    });
    
    addPageFooter(doc, 1);
    
    // ══════════════════════════════════════════════════════════
    // PAGE 2: INFRASTRUCTURE METRICS + PIE CHART
    // ══════════════════════════════════════════════════════════
    
    doc.addPage();
    yPos = margin;
    
    addPageHeader(doc, 'Infrastructure Metrics', 2);
    yPos += 15;
    
    // KPI table
    doc.autoTable({
      startY: yPos,
      head: [['Metric', 'Value', 'Details']],
      body: [
        ['Active VMs', k.active_vms.toString(), `${k.total_vms} total VMs`],
        ['ESXi Hosts', k.hosts.toString(), 'Physical servers'],
        ['Total vCPUs', k.total_vcpus.toString(), `${k.physical_cores} physical cores`],
        ['Physical RAM', `${k.physical_memory_gib} GiB`, 'Host total'],
        ['Virtual RAM', `${k.virtual_memory_gib} GiB`, 'Active VMs'],
        ['Provisioned Storage', `${k.storage_provisioned_tib} TiB`, `${k.storage_capacity_tib} TiB capacity`],
      ],
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229], textColor: 255, fontSize: 10 },
      styles: { fontSize: 9, cellPadding: 3 },
      margin: { left: margin, right: margin },
    });
    
    yPos = doc.lastAutoTable.finalY + 10;
    
    // Overcommit ratios
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(17, 24, 39);
    doc.text('Infrastructure Overcommit Ratios', margin, yPos);
    yPos += 8;
    
    doc.autoTable({
      startY: yPos,
      head: [['Ratio', 'Value', 'Assessment']],
      body: [
        ['Core : vCPU', `${r.core_to_vcpu}:1`, getRatioAssessment('cpu', r.core_to_vcpu)],
        ['vRAM : pRAM', `${r.vram_to_pram}:1`, getRatioAssessment('ram', r.vram_to_pram)],
        ['VM Density', `${r.vm_density} VMs/host`, getRatioAssessment('density', r.vm_density)],
      ],
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229], fontSize: 10 },
      styles: { fontSize: 9, cellPadding: 3 },
      margin: { left: margin, right: margin },
    });
    
    yPos = doc.lastAutoTable.finalY + 12;
    
    // Powerstate pie chart
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('VM Powerstate Distribution', margin, yPos);
    yPos += 5;
    
    const pieChart = await createPieChart(
      s.power_list.map(p => p.state),
      s.power_list.map(p => p.count),
      'Powerstate Distribution'
    );
    
    doc.addImage(pieChart, 'PNG', margin, yPos, 80, 60);
    
    // Powerstate table next to chart
    doc.autoTable({
      startY: yPos,
      head: [['State', 'Count', '%']],
      body: s.power_list.map(p => [
        p.state,
        p.count.toString(),
        pct(p.count, k.total_vms)
      ]),
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229], fontSize: 9 },
      styles: { fontSize: 8, cellPadding: 2.5 },
      margin: { left: 105 },
      tableWidth: 90,
    });
    
    addPageFooter(doc, 2);
    
    // ══════════════════════════════════════════════════════════
    // PAGE 3: CLUSTER BREAKDOWN + BAR CHART
    // ══════════════════════════════════════════════════════════
    
    doc.addPage();
    yPos = margin;
    
    addPageHeader(doc, 'Cluster Inventory', 3);
    yPos += 15;
    
    // Cluster bar chart
    const clusterChart = await createBarChart(
      s.by_cluster.map(c => c.cluster),
      s.by_cluster.map(c => c.total_vcpus),
      'vCPUs per Cluster'
    );
    
    doc.addImage(clusterChart, 'PNG', margin, yPos, contentWidth, 55);
    yPos += 62;
    
    // Cluster table
    doc.autoTable({
      startY: yPos,
      head: [['Cluster', 'VMs', 'vCPUs', 'vRAM (GiB)', 'pCores', 'vCPU/Core']],
      body: s.by_cluster.map(c => [
        c.cluster,
        c.vm_count.toString(),
        c.total_vcpus.toString(),
        c.total_mem_gib.toString(),
        c.p_cores.toString(),
        c.vcpu_core_ratio.toString(),
      ]),
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229], fontSize: 9 },
      styles: { fontSize: 8, cellPadding: 2.5 },
      margin: { left: margin, right: margin },
    });
    
    addPageFooter(doc, 3);
    
    // ══════════════════════════════════════════════════════════
    // PAGE 4: HOST INVENTORY
    // ══════════════════════════════════════════════════════════
    
    doc.addPage();
    yPos = margin;
    
    addPageHeader(doc, 'ESXi Host Inventory', 4);
    yPos += 15;
    
    doc.autoTable({
      startY: yPos,
      head: [['Host', 'Cluster', 'CPU', 'Cores', 'RAM (GiB)', 'vCPUs', 'VMs', 'ESXi']],
      body: s.host_rows.map(h => [
        h.host_name,
        h.cluster,
        h.num_cpu.toString(),
        h.total_cores.toString(),
        h.memory_gib.toString(),
        h.vcpus_placed.toString(),
        h.vm_count.toString(),
        h.esx_version,
      ]),
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229], fontSize: 8 },
      styles: { fontSize: 7, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 25 },
        7: { cellWidth: 25 },
      },
      margin: { left: margin, right: margin },
    });
    
    addPageFooter(doc, 4);
    
    // ══════════════════════════════════════════════════════════
    // PAGE 5+: VM INVENTORY (paginated)
    // ══════════════════════════════════════════════════════════
    
    doc.addPage();
    let pageNum = 5;
    
    addPageHeader(doc, 'Virtual Machine Inventory', pageNum);
    
    doc.autoTable({
      startY: margin + 15,
      head: [['VM Name', 'Power', 'vCPU', 'RAM', 'Stor.', 'Cluster', 'OS']],
      body: _allVMs.map(vm => [
        vm.vm_name,
        vm.powerstate,
        vm.cpus.toString(),
        `${vm.memory_gib}G`,
        `${vm.storage_gib}G`,
        vm.cluster,
        vm.os.substring(0, 30),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229], fontSize: 8 },
      styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
      columnStyles: {
        0: { cellWidth: 40 },
        6: { cellWidth: 35 },
      },
      margin: { left: margin, right: margin, bottom: 15 },
      didDrawPage: (data) => {
        addPageFooter(doc, pageNum);
        if (data.pageNumber > 1) {
          pageNum++;
          addPageHeader(doc, 'Virtual Machine Inventory (cont.)', pageNum);
        }
      },
    });
    
    // ══════════════════════════════════════════════════════════
    // FINAL PAGE: OS & HW DISTRIBUTION WITH PIE CHARTS
    // ══════════════════════════════════════════════════════════
    
    doc.addPage();
    pageNum++;
    
    addPageHeader(doc, 'OS & HW Distribution', pageNum);
    yPos = margin + 15;
    
    // OS Distribution
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(17, 24, 39);
    doc.text('Operating System Distribution', margin, yPos);
    yPos += 5;
    
    const osChart = await createPieChart(
      s.os_list.map(o => o.os.substring(0, 20)),
      s.os_list.map(o => o.count),
      'OS Distribution'
    );
    
    doc.addImage(osChart, 'PNG', margin, yPos, 80, 60);
    
    doc.autoTable({
      startY: yPos,
      head: [['Operating System', 'Count', '%']],
      body: s.os_list.map(o => [
        o.os,
        o.count.toString(),
        pct(o.count, k.total_vms),
      ]),
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229], fontSize: 9 },
      styles: { fontSize: 8, cellPadding: 2.5 },
      margin: { left: 105 },
      tableWidth: 90,
    });
    
    yPos = Math.max(doc.lastAutoTable.finalY, yPos + 65) + 12;
    
    // HW Version Distribution
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Hardware Version Distribution', margin, yPos);
    yPos += 5;
    
    const hwChart = await createPieChart(
      s.hw_list.map(h => h.hw),
      s.hw_list.map(h => h.count),
      'HW Version'
    );
    
    doc.addImage(hwChart, 'PNG', margin, yPos, 80, 60);
    
    doc.autoTable({
      startY: yPos,
      head: [['HW Version', 'Count', '%']],
      body: s.hw_list.map(h => [
        h.hw,
        h.count.toString(),
        pct(h.count, k.total_vms),
      ]),
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229], fontSize: 9 },
      styles: { fontSize: 8, cellPadding: 2.5 },
      margin: { left: 105 },
      tableWidth: 90,
    });
    
    addPageFooter(doc, pageNum);
    
    // ══════════════════════════════════════════════════════════
    // SAVE PDF
    // ══════════════════════════════════════════════════════════
    
    const filename = `VMware-Infrastructure-Report-${now.toISOString().split('T')[0]}.pdf`;
    doc.save(filename);
    
  } catch (err) {
    console.error('PDF generation error:', err);
    alert('Failed to generate PDF: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "📄 Export PDF";
  }
}

// ── Chart generation helpers ─────────────────────────────────
// ── Chart generation helpers ─────────────────────────────────

async function renderChartToDataURL(config, width, height) {
  // Create offscreen canvas
  const canvas = document.createElement('canvas');
  canvas.width  = width;
  canvas.height = height;
  
  // White background
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  
  const chart = new Chart(ctx, config);
  
  // Tick once more to ensure full render
  await new Promise(r => requestAnimationFrame(r));
  await new Promise(r => setTimeout(r, 200));
  
  const dataURL = canvas.toDataURL('image/png', 1.0);
  chart.destroy();
  return dataURL;
}

// Fixed indigo-spectrum palette — avoids rainbow
const CHART_PALETTE = [
  '#4f46e5', // indigo-600
  '#7c3aed', // violet-600
  '#9333ea', // purple-600
  '#c026d3', // fuchsia-600
  '#db2777', // pink-600
  '#0284c7', // sky-600
  '#0891b2', // cyan-600
  '#059669', // emerald-600
  '#ca8a04', // yellow-600
  '#ea580c', // orange-600
];

async function createPieChart(labels, data, title) {
  const total = data.reduce((a, b) => a + b, 0);
  
  // Build clean labels with percentage
  const legendLabels = labels.map((l, i) => {
    const pctVal = ((data[i] / total) * 100).toFixed(1);
    const shortL = l.length > 22 ? l.slice(0, 21) + '…' : l;
    return `${shortL} (${pctVal}%)`;
  });

  return renderChartToDataURL(
    {
      type: 'pie',
      data: {
        labels: legendLabels,
        datasets: [{
          data,
          backgroundColor: CHART_PALETTE.slice(0, data.length),
          borderColor:      '#ffffff',
          borderWidth:      2,
          hoverOffset:      6,
        }]
      },
      options: {
        responsive: false,
        animation:  false,        // ← no animation so canvas is ready immediately
        layout: { padding: { top: 10, bottom: 20, left: 20, right: 20 } },
        plugins: {
          title: {
            display: true,
            text: title,
            color: '#111827',
            font: { size: 15, weight: 'bold', family: 'Arial' },
            padding: { bottom: 12 }
          },
          legend: {
            display:  true,
            position: 'bottom',
            align:    'start',
            labels: {
              color:     '#374151',
              font:      { size: 10, family: 'Arial' },
              boxWidth:  12,
              boxHeight: 12,
              padding:   10,
              usPointStyle: false,
            }
          },
          tooltip: { enabled: false }
        }
      }
    },
    600,   // wide canvas → ample room
    400    // tall enough for bottom legend
  );
}

async function createBarChart(labels, data, title) {
  return renderChartToDataURL(
    {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: title,
          data,
          backgroundColor: labels.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]),
          borderColor:     labels.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]),
          borderWidth:     1,
          borderRadius:    5,
        }]
      },
      options: {
        responsive: false,
        animation:  false,
        layout: { padding: { top: 10, bottom: 10, left: 10, right: 20 } },
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text:    title,
            color:   '#111827',
            font:    { size: 15, weight: 'bold', family: 'Arial' },
            padding: { bottom: 12 }
          },
          tooltip: { enabled: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks:  { font: { size: 10, family: 'Arial' }, color: '#374151' },
            grid:   { color: 'rgba(0,0,0,0.06)' },
            title:  {
              display: true,
              text:    'vCPUs',
              font:    { size: 12, weight: 'bold', family: 'Arial' },
              color:   '#111827'
            }
          },
          x: {
            ticks: {
              font:          { size: 10, family: 'Arial' },
              color:         '#374151',
              maxRotation:   35,
              minRotation:   0,
              autoSkip:      false,
            },
            grid: { display: false }
          }
        }
      }
    },
    900,
    380
  );
}


// Generate distinct color palette
function generateColors(count) {
  const baseColors = [
    { r: 79, g: 70, b: 229 },    // Indigo
    { r: 139, g: 92, b: 246 },   // Purple
    { r: 236, g: 72, b: 153 },   // Pink
    { r: 239, g: 68, b: 68 },    // Red
    { r: 249, g: 115, b: 22 },   // Orange
    { r: 234, g: 179, b: 8 },    // Yellow
    { r: 34, g: 197, b: 94 },    // Green
    { r: 6, g: 182, b: 212 },    // Cyan
    { r: 59, g: 130, b: 246 },   // Blue
    { r: 168, g: 85, b: 247 },   // Violet
  ];
  
  const backgrounds = [];
  const borders = [];
  
  for (let i = 0; i < count; i++) {
    const color = baseColors[i % baseColors.length];
    
    // Slightly vary the color if we're repeating
    const variation = Math.floor(i / baseColors.length) * 20;
    const r = Math.min(255, color.r + variation);
    const g = Math.min(255, color.g + variation);
    const b = Math.min(255, color.b + variation);
    
    backgrounds.push(`rgba(${r}, ${g}, ${b}, 0.8)`);
    borders.push(`rgba(${r}, ${g}, ${b}, 1)`);
  }
  
  return { backgrounds, borders };
}


// ── Helper functions ─────────────────────────────────────────

function addPageHeader(doc, title, pageNum) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  
  doc.setFillColor(79, 70, 229);
  doc.rect(0, 0, pageWidth, 8, 'F');
  
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.setFont(undefined, 'bold');
  doc.text(title, margin, 5.5);
  
  doc.setFont(undefined, 'normal');
  doc.setFontSize(8);
  doc.text(`Page ${pageNum}`, pageWidth - margin, 5.5, { align: 'right' });
}

function addPageFooter(doc, pageNum) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  doc.setFontSize(7);
  doc.setTextColor(156, 163, 175);
  doc.text(
    'RVTools Analyser • Generated by StatelessPlatform',
    pageWidth / 2,
    pageHeight - 8,
    { align: 'center' }
  );
}

function getRatioAssessment(type, value) {
  if (type === 'cpu') {
    if (value < 4) return '✓ Conservative';
    if (value < 8) return '○ Moderate';
    return '⚠ Aggressive';
  }
  if (type === 'ram') {
    if (value < 1.2) return '✓ Conservative';
    if (value < 2.0) return '○ Moderate';
    return '⚠ Aggressive';
  }
  if (type === 'density') {
    if (value < 20) return '✓ Low density';
    if (value < 40) return '○ Moderate';
    return '⚠ High density';
  }
  return '–';
}




// ── Boot ─────────────────────────────────────────────────────
document.getElementById("btn-analyse").addEventListener("click", onAnalyseClick);
document.getElementById("btn-clear").addEventListener("click", onClearClick);
document.getElementById("file-input").addEventListener("change", e => updateBadges(e.target.files));
document.getElementById("vm-search").addEventListener("input", applyVMFilters);
document.getElementById("vm-filter-power").addEventListener("change", applyVMFilters);

// Wire dashboard nav item on boot (others unlocked after analyse)
document.querySelector(".nav-item[data-view='dashboard']")
  .addEventListener("click", () => showView("dashboard"));

initDragDrop();

// ── Boot ─────────────────────────────────────────────────────
document.getElementById("btn-analyse").addEventListener("click", onAnalyseClick);
document.getElementById("btn-clear").addEventListener("click", onClearClick);
document.getElementById("btn-export-pdf").addEventListener("click", generatePDF);  // ✅ ADD THIS
document.getElementById("file-input").addEventListener("change", e => updateBadges(e.target.files));
document.getElementById("vm-search").addEventListener("input", applyVMFilters);
document.getElementById("vm-filter-power").addEventListener("change", applyVMFilters);
