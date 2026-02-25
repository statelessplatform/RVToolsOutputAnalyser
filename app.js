// ════════════════════════════════════════════════════════════════
// app.js — Core Engine: Parsing · Aggregation · Navigation · Render
// ════════════════════════════════════════════════════════════════

window.APP_STATE = { buckets: null, summary: null, loaded: false };

// ── Utilities ─────────────────────────────────────────────────
function num(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}
function pct(part, total) {
  if (!total) return '0%';
  return ((part / total) * 100).toFixed(1) + '%';
}
function isPoweredOn(row) {
  const p   = (row['Powerstate'] || '').toString().trim().toLowerCase();
  const tpl = (row['Template']   || '').toString().trim().toLowerCase();
  return p === 'poweredon' && tpl !== 'true';
}
function powerBadge(state) {
  const s = (state || '').toLowerCase();
  if (s === 'poweredon')  return '<span class="badge badge-on">On</span>';
  if (s === 'poweredoff') return '<span class="badge badge-off">Off</span>';
  return '<span class="badge badge-sus">' + (state || '–') + '</span>';
}
function safeStr(v) {
  if (v === null || v === undefined) return 'Unknown';
  const s = String(v).trim();
  return s === '' ? 'Unknown' : s;
}
function setText(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = v;
}
function fillTable(tableId, rows, columns) {
  const tbody = document.querySelector('#' + tableId + ' tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="' + columns.length + '" style="text-align:center;color:var(--text-muted);padding:20px;">No data</td></tr>';
    return;
  }
  rows.forEach(function (row) {
    const tr = document.createElement('tr');
    tr.innerHTML = columns.map(function (col) { return '<td>' + col(row) + '</td>'; }).join('');
    tbody.appendChild(tr);
  });
}

// ── Loading Overlay ───────────────────────────────────────────
function showLoading(msg, sub) {
  const el = document.getElementById('loading-overlay');
  const m  = document.getElementById('loading-msg');
  const s  = document.getElementById('loading-sub');
  if (m) m.textContent = msg || 'Analysing files…';
  if (s) s.textContent = sub || 'Parsing sheets and computing summary';
  if (el) el.style.display = 'flex';
}
function updateLoading(msg, sub) {
  const m = document.getElementById('loading-msg');
  const s = document.getElementById('loading-sub');
  if (m && msg) m.textContent = msg;
  if (s && sub) s.textContent = sub;
}
function hideLoading() {
  const el = document.getElementById('loading-overlay');
  if (el) el.style.display = 'none';
}

// ── Navigation ────────────────────────────────────────────────
const VIEWS = ['dashboard','clusters','hosts','vms','globalview','statistics','storage','support','forecast'];

function showView(name) {
  VIEWS.forEach(function (v) {
    const el = document.getElementById('view-' + v);
    if (el) el.classList.toggle('hidden', v !== name);
  });
  document.querySelectorAll('.nav-item').forEach(function (btn) {
    btn.classList.toggle('nav-item-active', btn.dataset.view === name);
  });
  const titles = {
    dashboard:  'Dashboard',
    clusters:   'Clusters',
    hosts:      'ESXi Hosts',
    vms:        'VM Inventory',
    globalview: 'Global View',
    statistics: 'Statistics',
    storage:    'Storage Analysis',
    support:    'End of Support',
    forecast:   'EoS Forecast',
  };
  setText('page-title', titles[name] || 'Dashboard');
  document.dispatchEvent(new CustomEvent('rvtools:viewchange', { detail: { view: name } }));
}

function unlockNav() {
  document.querySelectorAll('.nav-locked').forEach(function (btn) {
    btn.classList.remove('nav-locked');
  });
  document.querySelectorAll('.nav-item[data-view]').forEach(function (btn) {
    btn.addEventListener('click', function () { showView(btn.dataset.view); });
  });
  const r = document.getElementById('btn-reset');
  const p = document.getElementById('btn-export-pdf');
  if (r) r.style.display = '';
  if (p) p.style.display = '';
}

// ── Sheet type detection ──────────────────────────────────────
function detectSheetType(cols) {
  const c = new Set(cols.map(function (s) { return s.trim(); }));
  return {
    isVInfo:    c.has('VM') && c.has('CPUs') && (c.has('Memory') || c.has('Memory MiB')),
    isVHost:    (c.has('CPU') || c.has('# CPU')) && (c.has('Cores') || c.has('Cores per CPU')),
    isVDisk:    c.has('VM') && (c.has('Disk') || c.has('Disk Key')) && c.has('Capacity MiB'),
    isVDS:      c.has('Capacity MiB') && !c.has('VM') && (c.has('Name') || c.has('Datastore')) && c.has('Free space MiB'),
    isVCPU:     c.has('VM') && c.has('CPUs') && c.has('Sockets'),
    isVMem:     c.has('VM') && c.has('Size MiB') && !c.has('CPUs'),
    isVNetwork: c.has('VM') && c.has('Network') && c.has('MAC Address'),
  };
}

function dispatchRows(rows, label, buckets) {
  if (!rows || rows.length === 0) return;
  const cols = Object.keys(rows[0]);
  const t = detectSheetType(cols);
  if      (t.isVInfo)    { console.log('vInfo',    label); buckets.vinfo.push(...rows); }
  else if (t.isVHost)    { console.log('vHost',    label); buckets.vhost.push(...rows); }
  else if (t.isVDisk)    { console.log('vDisk',    label); buckets.vdisk.push(...rows); }
  else if (t.isVDS)      { console.log('vDS',      label); buckets.vds.push(...rows); }
  else if (t.isVCPU)     { console.log('vCPU',     label); buckets.vcpu.push(...rows); }
  else if (t.isVMem)     { console.log('vMem',     label); buckets.vmem.push(...rows); }
  else if (t.isVNetwork) { console.log('vNet',     label); buckets.vnetwork.push(...rows); }
  else { console.warn('Skipped sheet:', label, cols.slice(0, 8)); }
}

// ── File parsing ──────────────────────────────────────────────
async function parseFiles(fileList) {
  const buckets = { vinfo: [], vhost: [], vdisk: [], vds: [], vcpu: [], vmem: [], vnetwork: [] };
  for (const file of Array.from(fileList)) {
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext === 'csv') {
      const text   = await file.text();
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      dispatchRows(parsed.data, file.name, buckets);
    } else if (ext === 'xlsx' || ext === 'xls') {
      const buf      = await file.arrayBuffer();
      const workbook = XLSX.read(buf, { type: 'array' });
      workbook.SheetNames.forEach(function (sn) {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sn], { defval: '' });
        dispatchRows(rows, file.name + ' → ' + sn, buckets);
      });
    } else {
      console.warn('Unsupported file type:', file.name);
    }
  }
  return buckets;
}

// ── Core aggregation ──────────────────────────────────────────
let allVMs = [];

function computeSummary(buckets) {
  const { vinfo, vhost, vds } = buckets;
  let totalVms = 0, activeVms = 0, totalVcpus = 0, vMemMiB = 0, storageProvMiB = 0;
  const perCluster = new Map(), perPower = new Map(), perOS = new Map(), perHW = new Map();
  const vmList = [];

  for (const row of vinfo) {
    totalVms++;
    const cpus    = num(row['CPUs']);
    const mem     = num(row['Memory'] != null ? row['Memory'] : row['Memory MiB']);
    const prov    = num(row['Provisioned MiB']);
    const hw      = safeStr(row['HW version'] != null ? row['HW version'] : row['HW Version']);
    const cluster = safeStr(row['Cluster']);
    const host    = safeStr(row['Host']);
    const power   = safeStr(row['Powerstate']);
    const osRaw   = safeStr(row['OS according to the VMware Tools'] != null
                      ? row['OS according to the VMware Tools']
                      : row['OS according to the configuration file']);
    const osShort = osRaw.length > 42 ? osRaw.slice(0, 40) + '…' : osRaw;

    totalVcpus    += cpus;
    vMemMiB       += mem;
    storageProvMiB += prov;
    if (isPoweredOn(row)) activeVms++;

    if (!perCluster.has(cluster)) {
      perCluster.set(cluster, { cluster, vm_count: 0, total_vcpus: 0, total_mem_mib: 0, pcores: 0, vm_on: 0 });
    }
    const cl = perCluster.get(cluster);
    cl.vm_count++;
    cl.total_vcpus  += cpus;
    cl.total_mem_mib += mem;
    if (isPoweredOn(row)) cl.vm_on++;

    perPower.set(power,   (perPower.get(power)   || 0) + 1);
    perOS.set(osShort,    (perOS.get(osShort)     || 0) + 1);
    perHW.set(hw,         (perHW.get(hw)          || 0) + 1);

    vmList.push({
      vm_name:    safeStr(row['VM']),
      powerstate: power,
      cpus,
      memory_gib:  (mem  / 1024).toFixed(1),
      storage_gib: (prov / 1024).toFixed(1),
      cluster,
      host,
      os:      osShort,
      hw,
      os_full: osRaw,
    });
  }

  let hosts = 0, pCores = 0, pMemMiB = 0;
  const hostRows = [];
  for (const row of vhost) {
    hosts++;
    const sockets = num(row['# CPU'] != null ? row['# CPU'] : row['CPU']);
    const cpc     = num(row['Cores per CPU']);
    const cores   = num(row['# Cores'] != null ? row['# Cores'] : row['Cores']) || (sockets * cpc);
    const mem     = num(row['# Memory'] != null ? row['# Memory'] : row['Memory']);
    const vcpusPl = num(row['# vCPUs'] != null ? row['# vCPUs'] : row['vCPUs']);
    const vmCount = num(row['# VMs'] != null ? row['# VMs'] : row['VMs']);
    const vmOn    = num(row['# VMs ON'] != null ? row['# VMs ON'] : (row['VMs ON'] != null ? row['VMs ON'] : row['# VMs']));
    const cluster = safeStr(row['Cluster']);
    pCores  += cores;
    pMemMiB += mem;
    if (perCluster.has(cluster)) perCluster.get(cluster).pcores += cores;
    hostRows.push({
      host_name:    safeStr(row['Host']),
      cluster,
      num_cpu:      sockets,
      total_cores:  cores,
      memory_gib:   (mem / 1024).toFixed(1),
      vcpus_placed: vcpusPl,
      vm_count:     vmCount,
      vm_on:        vmOn,
      esx_version:  safeStr(row['ESX Version'] != null ? row['ESX Version'] : row['Version']),
    });
  }

  let dsCapMiB = 0;
  for (const row of vds) dsCapMiB += num(row['Capacity MiB']);

  const top10 = [...vmList].sort(function (a, b) { return b.cpus - a.cpus; }).slice(0, 10);

  const byCluster = Array.from(perCluster.values())
    .map(function (c) {
      return Object.assign({}, c, {
        total_mem_gib:   (c.total_mem_mib / 1024).toFixed(1),
        vcpu_core_ratio: c.pcores ? (c.total_vcpus / c.pcores).toFixed(2) : '–',
      });
    })
    .sort(function (a, b) { return b.total_vcpus - a.total_vcpus; });

  const osList    = Array.from(perOS.entries()).map(function ([os, count])    { return { os, count }; }).sort(function (a, b) { return b.count - a.count; }).slice(0, 8);
  const powerList = Array.from(perPower.entries()).map(function ([state, count]) { return { state, count }; }).sort(function (a, b) { return b.count - a.count; });
  const hwList    = Array.from(perHW.entries()).map(function ([hw, count])    { return { hw, count }; }).sort(function (a, b) { return b.count - a.count; }).slice(0, 8);

  allVMs = vmList;

  return {
    kpi: {
      active_vms:              activeVms,
      total_vms:               totalVms,
      hosts,
      total_vcpus:             totalVcpus,
      physical_cores:          pCores,
      physical_memory_gib:     (pMemMiB / 1024).toFixed(1),
      virtual_memory_gib:      (vMemMiB / 1024).toFixed(1),
      storage_provisioned_tib: (storageProvMiB / 1048576).toFixed(2),
      storage_capacity_tib:    (dsCapMiB / 1048576).toFixed(2),
    },
    ratios: {
      core_to_vcpu: pCores  ? (totalVcpus / pCores).toFixed(2)  : '0',
      vram_to_pram: pMemMiB ? (vMemMiB / pMemMiB).toFixed(2)    : '0',
      vm_density:   hosts   ? (activeVms / hosts).toFixed(1)     : '0',
    },
    top10_vcpu:  top10,
    by_cluster:  byCluster,
    os_list:     osList,
    power_list:  powerList,
    hw_list:     hwList,
    host_rows:   hostRows,
    all_vms:     vmList,
  };
}

// ── Dashboard render ──────────────────────────────────────────
function renderDashboard(s) {
  const k = s.kpi, r = s.ratios;
  setText('kpi-active-vms',    k.active_vms.toLocaleString());
  setText('kpi-total-vms',     k.total_vms.toLocaleString() + ' total');
  setText('kpi-hosts',         k.hosts.toLocaleString());
  setText('kpi-vcpus',         k.total_vcpus.toLocaleString());
  setText('kpi-pcores',        k.physical_cores.toLocaleString() + ' physical cores');
  setText('kpi-pram',          k.physical_memory_gib + ' GiB');
  setText('kpi-vram',          k.virtual_memory_gib + ' GiB');
  setText('kpi-storage',       k.storage_provisioned_tib + ' TiB');
  setText('kpi-ds-cap',        k.storage_capacity_tib + ' TiB capacity');
  setText('ratio-core-vcpu',   r.core_to_vcpu + 'x');
  setText('ratio-vram-pram',   r.vram_to_pram + 'x');
  setText('ratio-vm-density',  r.vm_density);

  fillTable('tbl-power', s.power_list, [
    function (r) { return powerBadge(r.state); },
    function (r) { return r.count; },
    function (r) { return pct(r.count, k.total_vms); },
  ]);
  fillTable('tbl-top10', s.top10_vcpu, [
    function (r) { return r.vm_name; },
    function (r) { return r.cpus; },
    function (r) { return r.memory_gib; },
    function (r) { return r.storage_gib; },
    function (r) { return r.cluster; },
    function (r) { return powerBadge(r.powerstate); },
  ]);
  fillTable('tbl-os', s.os_list, [
    function (r) { return r.os; },
    function (r) { return r.count; },
    function (r) { return pct(r.count, k.total_vms); },
  ]);
  fillTable('tbl-hw', s.hw_list, [
    function (r) { return r.hw; },
    function (r) { return r.count; },
    function (r) { return pct(r.count, k.total_vms); },
  ]);
  fillTable('tbl-clusters', s.by_cluster, [
    function (r) { return r.cluster; },
    function (r) { return r.vm_count; },
    function (r) { return r.total_vcpus; },
    function (r) { return r.total_mem_gib; },
    function (r) { return r.pcores; },
    function (r) { return r.vcpu_core_ratio; },
  ]);
  fillTable('tbl-hosts', s.host_rows, [
    function (r) { return r.host_name; },
    function (r) { return r.cluster; },
    function (r) { return r.num_cpu; },
    function (r) { return r.total_cores; },
    function (r) { return r.memory_gib; },
    function (r) { return r.vcpus_placed; },
    function (r) { return r.vm_count; },
    function (r) { return r.esx_version; },
  ]);
  fillTable('tbl-clusters-full', s.by_cluster, [
    function (r) { return r.cluster; },
    function (r) { return r.vm_count; },
    function (r) { return r.total_vcpus; },
    function (r) { return r.total_mem_gib; },
    function (r) { return r.pcores; },
    function (r) { return r.vcpu_core_ratio; },
  ]);
  fillTable('tbl-hosts-full', s.host_rows, [
    function (r) { return r.host_name; },
    function (r) { return r.cluster; },
    function (r) { return r.num_cpu; },
    function (r) { return r.total_cores; },
    function (r) { return r.memory_gib; },
    function (r) { return r.vcpus_placed; },
    function (r) { return r.vm_count; },
    function (r) { return r.esx_version; },
  ]);
}

// ── VM search / filter ────────────────────────────────────────
function renderVMs(list) {
  setText('vm-count-badge', list.length.toLocaleString() + ' VMs');
  fillTable('tbl-vms', list, [
    function (r) { return r.vm_name; },
    function (r) { return powerBadge(r.powerstate); },
    function (r) { return r.cpus; },
    function (r) { return r.memory_gib; },
    function (r) { return r.storage_gib; },
    function (r) { return r.cluster; },
    function (r) { return r.host; },
    function (r) { return r.os; },
    function (r) { return r.hw; },
  ]);
}

function filterVMs() {
  const q     = (document.getElementById('vm-search')?.value || '').toLowerCase();
  const power = (document.getElementById('vm-power-filter')?.value || '').toLowerCase();
  const list  = allVMs.filter(function (vm) {
    const matchQ = !q || [vm.vm_name, vm.os, vm.cluster, vm.host].some(function (f) {
      return f.toLowerCase().includes(q);
    });
    const matchP = !power || vm.powerstate.toLowerCase() === power;
    return matchQ && matchP;
  });
  renderVMs(list);
}

// ── File badges ───────────────────────────────────────────────
function updateBadges(fileList) {
  const el = document.getElementById('file-badges');
  if (!el) return;
  el.innerHTML = Array.from(fileList)
    .map(function (f) { return '<span class="file-badge">' + f.name + '</span>'; }).join('');
}

// ── handleFiles — triggered ONLY by Analyse button ────────────
let _pendingFiles = null;

async function handleFiles(fileList) {
  if (!fileList || fileList.length === 0) return;
  const fileCount = fileList.length;
  const fileNames = Array.from(fileList).map(function (f) { return f.name; }).join(', ');

  const btnA = document.getElementById('btn-analyse');
  if (btnA) btnA.style.display = 'none';

  showLoading(
    'Analysing ' + fileCount + ' file' + (fileCount > 1 ? 's' : '') + '…',
    fileNames.length > 70 ? fileNames.slice(0, 68) + '…' : fileNames
  );

  try {
    updateLoading('Parsing sheets…', 'Reading ' + fileCount + ' file(s) — please wait');
    await new Promise(function (r) { setTimeout(r, 40); });

    const buckets = await parseFiles(fileList);

    updateLoading('Computing summary…', 'Aggregating VMs, hosts and clusters');
    await new Promise(function (r) { setTimeout(r, 40); });

    const summary = computeSummary(buckets);

    updateLoading('Rendering dashboards…', 'Building tables and charts');
    await new Promise(function (r) { setTimeout(r, 40); });

    window.APP_STATE = { buckets, summary, loaded: true };

    renderDashboard(summary);
    renderVMs(summary.all_vms);

    const vs = document.getElementById('vm-search');
    const vf = document.getElementById('vm-power-filter');
    if (vs) vs.addEventListener('input', filterVMs);
    if (vf) vf.addEventListener('change', filterVMs);

    const dz = document.getElementById('drop-zone');
    if (dz) dz.classList.add('hidden');

    document.dispatchEvent(new CustomEvent('rvtools:dataready', { detail: { buckets, summary } }));
    unlockNav();
    showView('dashboard');

  } catch (err) {
    console.error('handleFiles error:', err);
    alert('Failed to analyse files: ' + err.message);
    if (btnA) btnA.style.display = 'inline-flex';
  } finally {
    hideLoading();
  }
}

// ── Event bindings ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  const dropZone  = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const btnA      = document.getElementById('btn-analyse');
  const btnReset  = document.getElementById('btn-reset');
  const btnPDF    = document.getElementById('btn-export-pdf');

  // Drop zone drag/drop
  if (dropZone) {
    dropZone.addEventListener('dragover', function (e) {
      e.preventDefault(); dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', function () {
      dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', function (e) {
      e.preventDefault(); dropZone.classList.remove('drag-over');
      if (e.dataTransfer.files.length) {
        _pendingFiles = e.dataTransfer.files;
        updateBadges(_pendingFiles);
        if (btnA) btnA.style.display = 'inline-flex';
      }
    });
    dropZone.addEventListener('click', function () {
      if (fileInput) fileInput.click();
    });
  }

  // File picker — only show Analyse, never auto-analyse
  if (fileInput) {
    fileInput.addEventListener('change', function () {
      if (this.files && this.files.length > 0) {
        _pendingFiles = this.files;
        updateBadges(this.files);
        if (btnA) btnA.style.display = 'inline-flex';
      }
    });
  }

  // Analyse button
  if (btnA) {
    btnA.addEventListener('click', function () {
      if (_pendingFiles && _pendingFiles.length > 0) {
        handleFiles(_pendingFiles);
      } else {
        alert('Please select files first.');
      }
    });
  }

  // Reset
  if (btnReset) {
    btnReset.addEventListener('click', function () { location.reload(); });
  }

  // Export PDF
  if (btnPDF) {
    btnPDF.addEventListener('click', function () {
      if (window.exportCurrentViewPDF) window.exportCurrentViewPDF();
    });
  }

  // ESXi host row click → modal
  document.addEventListener('click', function (e) {
    const row = e.target.closest('#tbl-hosts tbody tr, #tbl-hosts-full tbody tr');
    if (!row || !window.APP_STATE.loaded) return;
    const hostName = row.cells[0]?.textContent?.trim();
    if (!hostName) return;
    const host = window.APP_STATE.summary.host_rows.find(function (h) { return h.host_name === hostName; });
    if (host) document.dispatchEvent(new CustomEvent('rvtools:hostclick', { detail: { host } }));
  });

  // Modal close
  const modalClose = document.getElementById('modal-host-close');
  if (modalClose) {
    modalClose.addEventListener('click', function () {
      const m = document.getElementById('modal-host');
      if (m) m.classList.add('hidden');
    });
  }
  const modalOverlay = document.getElementById('modal-host');
  if (modalOverlay) {
    modalOverlay.addEventListener('click', function (e) {
      if (e.target === modalOverlay) modalOverlay.classList.add('hidden');
    });
  }
});
