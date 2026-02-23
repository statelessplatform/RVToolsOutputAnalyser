// ════════════════════════════════════════════════════════════════
// app.js — Core Engine: Parsing · Aggregation · Navigation · Render
// ════════════════════════════════════════════════════════════════

// ── Shared application state ──────────────────────────────────
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
  const p = (row['Powerstate'] || '').toString().trim().toLowerCase();
  const tpl = (row['Template'] || '').toString().trim().toLowerCase();
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
    tbody.innerHTML = '<tr><td colspan="' + columns.length + '" style="text-align:center;color:var(--text-muted);padding:20px">No data available</td></tr>';
    return;
  }
  rows.forEach(function(row) {
    const tr = document.createElement('tr');
    tr.innerHTML = columns.map(function(col) { return '<td>' + col(row) + '</td>'; }).join('');
    tbody.appendChild(tr);
  });
}

// ── Navigation ─────────────────────────────────────────────────
const VIEWS = ['dashboard','clusters','hosts','vms','globalview','statistics','storage','support','forecast','drp'];

function showView(name) {
  VIEWS.forEach(function(v) {
    const el = document.getElementById('view-' + v);
    if (el) el.classList.toggle('hidden', v !== name);
  });
  document.querySelectorAll('.nav-item').forEach(function(btn) {
    btn.classList.toggle('nav-item-active', btn.dataset.view === name);
  });
  const titles = {
    dashboard:'Dashboard', clusters:'Clusters', hosts:'ESXi Hosts',
    vms:'VM Inventory', globalview:'Global View', statistics:'Statistics',
    storage:'Storage Analysis', support:'End of Support',
    forecast:'EoS Forecast', drp:'DRP Simulator'
  };
  setText('page-title', titles[name] || 'Dashboard');
  document.dispatchEvent(new CustomEvent('rvtools:viewchange', { detail: { view: name } }));
}

function unlockNav() {
  document.querySelectorAll('.nav-locked').forEach(function(btn) {
    btn.classList.remove('nav-locked');
    btn.disabled = false;
  });
  document.querySelectorAll('.nav-item[data-view]').forEach(function(btn) {
    btn.onclick = function() { showView(btn.dataset.view); };
  });
  document.getElementById('btn-reset').style.display = '';
  document.getElementById('btn-export-pdf').style.display = '';
}

// ── Sheet type detection ───────────────────────────────────────
function detectSheetType(cols) {
  const c = new Set(cols.map(function(s) { return s.trim(); }));
  return {
    isVInfo:    c.has('VM') && c.has('CPUs') && (c.has('Memory') || c.has('Memory MiB')),
    isVHost:    (c.has('# CPU') || c.has('#CPU')) && (c.has('# Cores') || c.has('Cores per CPU')),
    isVDisk:    c.has('VM') && (c.has('Disk') || c.has('Disk Key')) && c.has('Capacity MiB'),
    isVDS:      c.has('Capacity MiB') && !c.has('VM') && (c.has('Name') || c.has('Datastore') || c.has('Free space MiB')),
    isVCPU:     c.has('VM') && c.has('CPUs') && c.has('Sockets'),
    isVMem:     c.has('VM') && c.has('Size MiB') && !c.has('CPUs'),
    isVNetwork: c.has('VM') && (c.has('Network') || c.has('MAC Address')),
  };
}

function dispatchRows(rows, label, buckets) {
  if (!rows || rows.length === 0) return;
  const cols = Object.keys(rows[0] || {});
  const t = detectSheetType(cols);
  if      (t.isVInfo)    { console.log('[vInfo] ← ' + label + ' (' + rows.length + ')');    buckets.vinfo.push.apply(buckets.vinfo, rows); }
  else if (t.isVHost)    { console.log('[vHost] ← ' + label + ' (' + rows.length + ')');    buckets.vhost.push.apply(buckets.vhost, rows); }
  else if (t.isVDisk)    { console.log('[vDisk] ← ' + label + ' (' + rows.length + ')');    buckets.vdisk.push.apply(buckets.vdisk, rows); }
  else if (t.isVDS)      { console.log('[vDS] ← ' + label + ' (' + rows.length + ')');      buckets.vds.push.apply(buckets.vds, rows); }
  else if (t.isVCPU)     { console.log('[vCPU] ← ' + label + ' (' + rows.length + ')');     buckets.vcpu.push.apply(buckets.vcpu, rows); }
  else if (t.isVMem)     { console.log('[vMem] ← ' + label + ' (' + rows.length + ')');     buckets.vmem.push.apply(buckets.vmem, rows); }
  else if (t.isVNetwork) { console.log('[vNet] ← ' + label + ' (' + rows.length + ')');     buckets.vnetwork.push.apply(buckets.vnetwork, rows); }
  else { console.warn('[skip] ← ' + label, cols.slice(0, 8)); }
}

// ── File parsing ───────────────────────────────────────────────
async function parseFiles(fileList) {
  const buckets = { vinfo:[], vhost:[], vdisk:[], vds:[], vcpu:[], vmem:[], vnetwork:[] };
  for (const file of Array.from(fileList)) {
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext === 'csv') {
      const text = await file.text();
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      dispatchRows(parsed.data, file.name, buckets);
    } else if (ext === 'xlsx' || ext === 'xls') {
      const buf = await file.arrayBuffer();
      const workbook = XLSX.read(buf, { type: 'array' });
      workbook.SheetNames.forEach(function(sheetName) {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
        dispatchRows(rows, file.name + ' → ' + sheetName, buckets);
      });
    } else {
      console.warn('Unsupported file:', file.name);
    }
  }
  return buckets;
}

// ── Core aggregation ───────────────────────────────────────────
let _allVMs = [];

function computeSummary(buckets) {
  const { vinfo, vhost, vds } = buckets;
  let totalVms=0, activeVms=0, totalVcpus=0, vMemMiB=0, storageProvMiB=0;
  const perCluster=new Map(), perPower=new Map(), perOS=new Map(), perHW=new Map();
  const vmList=[];

  for (const row of vinfo) {
    totalVms++;
    const cpus    = num(row['CPUs']);
    const mem     = num(row['Memory'] != null ? row['Memory'] : row['Memory MiB']);
    const prov    = num(row['Provisioned MiB']);
    const hw      = safeStr(row['HW version'] != null ? row['HW version'] : (row['HW Version'] != null ? row['HW Version'] : ''));
    const cluster = safeStr(row['Cluster']);
    const host    = safeStr(row['Host']);
    const power   = safeStr(row['Powerstate']);
    const os      = safeStr(row['OS according to the VMware Tools'] != null
      ? row['OS according to the VMware Tools']
      : (row['OS according to the configuration file'] != null ? row['OS according to the configuration file'] : ''));
    const osShort = os.length > 42 ? os.slice(0, 40) + '…' : os;

    totalVcpus += cpus;
    vMemMiB    += mem;
    storageProvMiB += prov;
    if (isPoweredOn(row)) activeVms++;

    if (!perCluster.has(cluster)) {
      perCluster.set(cluster, { cluster, vm_count:0, total_vcpus:0, total_mem_mib:0, p_cores:0, vm_on:0 });
    }
    const cl = perCluster.get(cluster);
    cl.vm_count++;
    cl.total_vcpus += cpus;
    cl.total_mem_mib += mem;
    if (isPoweredOn(row)) cl.vm_on++;

    perPower.set(power, (perPower.get(power) || 0) + 1);
    perOS.set(osShort, (perOS.get(osShort) || 0) + 1);
    perHW.set(hw, (perHW.get(hw) || 0) + 1);

    vmList.push({
      vm_name:    safeStr(row['VM']),
      powerstate: power,
      cpus,
      memory_gib:  +(mem / 1024).toFixed(1),
      storage_gib: +(prov / 1024).toFixed(1),
      cluster, host,
      os: osShort,
      os_full: os,
      hw,
    });
  }

  let hosts=0, pCores=0, pMemMiB=0;
  const hostRows=[];
  for (const row of vhost) {
    hosts++;
    const sockets  = num(row['# CPU']);
    const cpc      = num(row['Cores per CPU']);
    const cores    = num(row['# Cores']) || (sockets * cpc);
    const mem      = num(row['# Memory']);
    const vcpusPl  = num(row['# vCPUs']);
    const vmCount  = num(row['# VMs']);
    const cluster  = safeStr(row['Cluster']);
    pCores  += cores;
    pMemMiB += mem;
    if (perCluster.has(cluster)) perCluster.get(cluster).p_cores += cores;
    hostRows.push({
      host_name:    safeStr(row['Host']),
      cluster,
      num_cpu:      sockets,
      total_cores:  cores,
      memory_gib:   +(mem / 1024).toFixed(1),
      vcpus_placed: vcpusPl,
      vm_count:     vmCount,
      esx_version:  safeStr(row['ESX Version']),
    });
  }

  let dsCapMiB = 0;
  for (const row of vds) dsCapMiB += num(row['Capacity MiB']);

  const top10     = [...vmList].sort(function(a,b){ return b.cpus - a.cpus; }).slice(0, 10);
  const byCluster = Array.from(perCluster.values())
    .map(function(c) {
      return Object.assign({}, c, {
        total_mem_gib: +(c.total_mem_mib / 1024).toFixed(1),
        vcpu_core_ratio: c.p_cores ? +(c.total_vcpus / c.p_cores).toFixed(2) : '–'
      });
    })
    .sort(function(a,b){ return b.total_vcpus - a.total_vcpus; });
  const osList    = Array.from(perOS.entries()).map(function([os,count]){ return {os,count}; }).sort(function(a,b){ return b.count-a.count; }).slice(0,8);
  const powerList = Array.from(perPower.entries()).map(function([state,count]){ return {state,count}; }).sort(function(a,b){ return b.count-a.count; });
  const hwList    = Array.from(perHW.entries()).map(function([hw,count]){ return {hw,count}; }).sort(function(a,b){ return b.count-a.count; }).slice(0,8);

  _allVMs = vmList;

  return {
    kpi: {
      active_vms: activeVms, total_vms: totalVms, hosts,
      total_vcpus: totalVcpus, physical_cores: pCores,
      physical_memory_gib:     +(pMemMiB / 1024).toFixed(1),
      virtual_memory_gib:      +(vMemMiB / 1024).toFixed(1),
      storage_provisioned_tib: +(storageProvMiB / 1048576).toFixed(2),
      storage_capacity_tib:    +(dsCapMiB / 1048576).toFixed(2),
    },
    ratios: {
      core_to_vcpu: pCores  ? +(totalVcpus / pCores).toFixed(2)  : 0,
      vram_to_pram: pMemMiB ? +(vMemMiB / pMemMiB).toFixed(2)    : 0,
      vm_density:   hosts   ? +(activeVms / hosts).toFixed(1)     : 0,
    },
    top10_vcpu: top10,
    by_cluster: byCluster,
    os_list:    osList,
    power_list: powerList,
    hw_list:    hwList,
    host_rows:  hostRows,
    all_vms:    vmList,
  };
}

// ── Dashboard render ───────────────────────────────────────────
function renderDashboard(s) {
  const k = s.kpi, r = s.ratios;
  setText('kpi-active-vms', k.active_vms.toLocaleString());
  setText('kpi-total-vms',  k.total_vms.toLocaleString() + ' total');
  setText('kpi-hosts',      k.hosts.toLocaleString());
  setText('kpi-vcpus',      k.total_vcpus.toLocaleString());
  setText('kpi-pcores',     k.physical_cores.toLocaleString() + ' physical cores');
  setText('kpi-pram',       k.physical_memory_gib.toLocaleString() + ' GiB');
  setText('kpi-vram',       k.virtual_memory_gib.toLocaleString() + ' GiB');
  setText('kpi-storage',    k.storage_provisioned_tib + ' TiB');
  setText('kpi-ds-cap',     k.storage_capacity_tib + ' TiB capacity');
  setText('ratio-core-vcpu',  r.core_to_vcpu + 'x');
  setText('ratio-vram-pram',  r.vram_to_pram + 'x');
  setText('ratio-vm-density', r.vm_density);

  fillTable('tbl-power',    s.power_list, [function(r){ return powerBadge(r.state); }, function(r){ return r.count; }, function(r){ return pct(r.count, k.total_vms); }]);
  fillTable('tbl-top10',    s.top10_vcpu, [function(r){ return r.vm_name; }, function(r){ return r.cpus; }, function(r){ return r.memory_gib; }, function(r){ return r.storage_gib; }, function(r){ return r.cluster; }, function(r){ return powerBadge(r.powerstate); }]);
  fillTable('tbl-os',       s.os_list,    [function(r){ return r.os; }, function(r){ return r.count; }, function(r){ return pct(r.count, k.total_vms); }]);
  fillTable('tbl-hw',       s.hw_list,    [function(r){ return r.hw; }, function(r){ return r.count; }, function(r){ return pct(r.count, k.total_vms); }]);
  fillTable('tbl-clusters', s.by_cluster, [function(r){ return r.cluster; }, function(r){ return r.vm_count; }, function(r){ return r.total_vcpus; }, function(r){ return r.total_mem_gib; }, function(r){ return r.p_cores; }, function(r){ return r.vcpu_core_ratio; }]);
  fillTable('tbl-hosts',    s.host_rows,  [function(r){ return r.host_name; }, function(r){ return r.cluster; }, function(r){ return r.num_cpu; }, function(r){ return r.total_cores; }, function(r){ return r.memory_gib; }, function(r){ return r.vcpus_placed; }, function(r){ return r.vm_count; }, function(r){ return r.esx_version; }]);

  fillTable('tbl-clusters-full', s.by_cluster, [function(r){ return r.cluster; }, function(r){ return r.vm_count; }, function(r){ return r.total_vcpus; }, function(r){ return r.total_mem_gib; }, function(r){ return r.p_cores; }, function(r){ return r.vcpu_core_ratio; }]);
  fillTable('tbl-hosts-full',    s.host_rows,  [function(r){ return r.host_name; }, function(r){ return r.cluster; }, function(r){ return r.num_cpu; }, function(r){ return r.total_cores; }, function(r){ return r.memory_gib; }, function(r){ return r.vcpus_placed; }, function(r){ return r.vm_count; }, function(r){ return r.esx_version; }]);
}

// ── VM filter & render ─────────────────────────────────────────
function renderVMs(list) {
  setText('vm-count-badge', list.length.toLocaleString() + ' VMs');
  fillTable('tbl-vms', list, [
    function(r){ return r.vm_name; },
    function(r){ return powerBadge(r.powerstate); },
    function(r){ return r.cpus; },
    function(r){ return r.memory_gib; },
    function(r){ return r.storage_gib; },
    function(r){ return r.cluster; },
    function(r){ return r.host; },
    function(r){ return r.os; },
    function(r){ return r.hw; }
  ]);
}
function filterVMs() {
  const q     = (document.getElementById('vm-search').value || '').toLowerCase();
  const power = (document.getElementById('vm-power-filter').value || '').toLowerCase();
  const list  = _allVMs.filter(function(vm) {
    const matchQ = !q || [vm.vm_name, vm.os, vm.cluster, vm.host].some(function(f){ return f.toLowerCase().includes(q); });
    const matchP = !power || vm.powerstate.toLowerCase() === power;
    return matchQ && matchP;
  });
  renderVMs(list);
}

// ── File handling orchestration ────────────────────────────────
async function handleFiles(fileList) {
  if (!fileList || fileList.length === 0) return;

  const badgesEl = document.getElementById('file-badges');
  badgesEl.innerHTML = Array.from(fileList).map(function(f){
    return '<span class="file-badge">' + f.name + '</span>';
  }).join('');

  const buckets = await parseFiles(fileList);
  const summary = computeSummary(buckets);

  window.APP_STATE = { buckets: buckets, summary: summary, loaded: true };

  document.getElementById('drop-zone').classList.add('hidden');
  renderDashboard(summary);
  renderVMs(summary.all_vms);

  document.getElementById('vm-search').addEventListener('input', filterVMs);
  document.getElementById('vm-power-filter').addEventListener('change', filterVMs);

  document.dispatchEvent(new CustomEvent('rvtools:dataready', { detail: { buckets: buckets, summary: summary } }));

  unlockNav();
  showView('dashboard');
}

// ── Boot: event bindings ───────────────────────────────────────
// No DOMContentLoaded needed — script is at bottom of <body>
var dropZone  = document.getElementById('drop-zone');
var fileInput = document.getElementById('file-input');

dropZone.addEventListener('dragover', function(e){
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', function(){
  dropZone.classList.remove('drag-over');
});
dropZone.addEventListener('drop', function(e){
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  handleFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', function(){
  handleFiles(fileInput.files);
});

dropZone.addEventListener('click', function() {
  fileInput.click();
});

document.getElementById('btn-reset').addEventListener('click', function(){
  location.reload();
});
document.getElementById('btn-export-pdf').addEventListener('click', function(){
  if (window.exportCurrentViewPDF) window.exportCurrentViewPDF();
});
