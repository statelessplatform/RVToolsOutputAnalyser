// app.js — Core Engine: Parsing · Aggregation · Navigation · Render

// ── Shared application state ───────────────────────────────────
window.APP_STATE = { buckets: null, summary: null, loaded: false };

// ── Utilities ──────────────────────────────────────────────────
function num(v) {
  if (v === null || v === undefined || v === '') return 0;
  var n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}
function pct(part, total) {
  if (!total) return '0%';
  return ((part / total) * 100).toFixed(1) + '%';
}
function isPoweredOn(row) {
  var p   = (row['Powerstate'] || '').toString().trim().toLowerCase();
  var tpl = (row['Template']   || '').toString().trim().toLowerCase();
  return p === 'poweredon' && tpl !== 'true';
}
function powerBadge(state) {
  var s = (state || '').toLowerCase();
  if (s === 'poweredon')  return '<span class="badge badge-on">On</span>';
  if (s === 'poweredoff') return '<span class="badge badge-off">Off</span>';
  return '<span class="badge badge-sus">' + (state || '-') + '</span>';
}
function safeStr(v) {
  if (v === null || v === undefined) return 'Unknown';
  var s = String(v).trim();
  return s === '' ? 'Unknown' : s;
}
function setText(id, v) {
  var el = document.getElementById(id);
  if (el) el.textContent = v;
}
function fillTable(tableId, rows, columns) {
  var tbody = document.querySelector('#' + tableId + ' tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="' + columns.length + '" style="text-align:center;color:var(--text-muted);padding:20px">No data</td></tr>';
    return;
  }
  rows.forEach(function(row) {
    var tr = document.createElement('tr');
    tr.innerHTML = columns.map(function(col) { return '<td>' + col(row) + '</td>'; }).join('');
    tbody.appendChild(tr);
  });
}

// ── Navigation ─────────────────────────────────────────────────
var VIEWS = ['dashboard','clusters','hosts','vms','globalview','statistics','storage','support','forecast','drp'];

function showView(name) {
  VIEWS.forEach(function(v) {
    var el = document.getElementById('view-' + v);
    if (el) el.classList.toggle('hidden', v !== name);  // null-safe
  });
  document.querySelectorAll('.nav-item').forEach(function(btn) {
    btn.classList.toggle('nav-item-active', btn.dataset.view === name);
  });
  var titles = {
    dashboard: 'Dashboard', clusters: 'Clusters', hosts: 'ESXi Hosts',
    vms: 'VM Inventory', globalview: 'Global View', statistics: 'Statistics',
    storage: 'Storage Analysis', support: 'End of Support',
    forecast: 'EoS Forecast', drp: 'DRP Simulator'
  };
  var titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = titles[name] || 'Dashboard';
  document.dispatchEvent(new CustomEvent('rvtools:viewchange', { detail: { view: name } }));
}

function unlockNav() {
  document.querySelectorAll('.nav-locked').forEach(function(btn) {
    btn.classList.remove('nav-locked');
  });
  document.querySelectorAll('.nav-item[data-view]').forEach(function(btn) {
    btn.addEventListener('click', function() { showView(btn.dataset.view); });
  });
  var btnReset = document.getElementById('btn-reset');
  var btnPdf   = document.getElementById('btn-export-pdf');
  if (btnReset) btnReset.style.display = '';
  if (btnPdf)   btnPdf.style.display   = '';
}

// ── Spinner / Progress ─────────────────────────────────────────
function showSpinner(msg) {
  var el = document.getElementById('analyse-spinner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'analyse-spinner';
    el.style.cssText = [
      'position:fixed','inset:0','z-index:9998',
      'background:rgba(15,25,35,0.75)',
      'display:flex','flex-direction:column',
      'align-items:center','justify-content:center',
      'color:#e1f1f6','font-family:inherit'
    ].join(';');
    el.innerHTML =
      '<div style="width:54px;height:54px;border:5px solid #1a2535;' +
        'border-top-color:#0072a3;border-radius:50%;animation:rvSpin 0.8s linear infinite;margin-bottom:18px"></div>' +
      '<div id="analyse-spinner-msg" style="font-size:15px;font-weight:600;color:#e1f1f6">Analysing...</div>' +
      '<div id="analyse-spinner-pct" style="font-size:28px;font-weight:700;color:#0092c8;margin-top:8px">0%</div>' +
      '<style>@keyframes rvSpin{to{transform:rotate(360deg)}}</style>';
    document.body.appendChild(el);
  }
  el.style.display = 'flex';
  setSpinnerMsg(msg || 'Analysing...', 0);
}
function setSpinnerMsg(msg, pct) {
  var msgEl = document.getElementById('analyse-spinner-msg');
  var pctEl = document.getElementById('analyse-spinner-pct');
  if (msgEl) msgEl.textContent = msg;
  if (pctEl) pctEl.textContent = (pct !== undefined ? Math.round(pct) + '%' : '');
}
function hideSpinner() {
  var el = document.getElementById('analyse-spinner');
  if (el) el.style.display = 'none';
}

// ── RVTools Column Normalizer ──────────────────────────────────
// Handles ALL RVTools versions transparently.
// Old-style (v3/v4): "VM", "CPUs", "Memory", "# CPU"
// New-style (v4.4+): "vInfoVMName", "vInfoCPUs", "vHostNumCpu"
// Old-style rows pass through unchanged (zero cost).

var _ALIAS = {
  // ── vInfo ──────────────────────────────────────────────────
  'vInfoVMName'                  : 'VM',
  'vInfoPowerstate'              : 'Powerstate',
  'vInfoTemplate'                : 'Template',
  'vInfoSRMPlaceHolder'          : 'SRM Placeholder',
  'vInfoSRMPlaceholder'          : 'SRM Placeholder',
  'vInfoCPUs'                    : 'CPUs',
  'vInfoMemory'                  : 'Memory',
  'vInfoProvisioned'             : 'Provisioned MiB',
  'vInfoInUse'                   : 'In Use MiB',
  'vInfoUnshared'                : 'Unshared MiB',
  'VInfoVersion'                 : 'HW version',   // capital V+I — RVTools quirk!
  'vInfoHWVersion'               : 'HW version',
  'vInfoHW version'              : 'HW version',
  'vInfoFirmware'                : 'Firmware',
  'vInfoHost'                    : 'Host',
  'vInfoCluster'                 : 'Cluster',
  'vInfoDataCenter'              : 'Datacenter',   // capital C — another RVTools quirk!
  'vInfoDatacenter'              : 'Datacenter',
  'vInfoResourcepool'            : 'Resource pool',
  'vInfoFolder'                  : 'Folder',
  'vInfoOS'                      : 'OS according to the configuration file',
  'vInfoOSTools'                 : 'OS according to the VMware Tools',
  'vInfoGuestHostName'           : 'DNS Name',
  'vInfoPrimaryIPAddress'        : 'Primary IP Address',
  'vInfoVISDKServer'             : 'VI SDK Server',
  'vInfoVISDKServerType'         : 'VI SDK Server type',
  'vInfoNumVirtualDisks'         : 'Disks',
  'vInfoTotalDiskCapacityMiB'    : 'Total disk capacity MiB',
  'vInfoHARestartPriority'       : 'HA Restart Priority',
  'vInfoNotes'                   : 'Annotation',
  'vInfoConnectionState'         : 'Connection state',
  'vInfoGuestState'              : 'Guest state',
  'vInfoCreateDate'              : 'Creation date',
  'vInfoConfigStatus'            : 'Config status',
  'vInfoNICs'                    : 'NICs',
  'vInfoObjectID'                : 'Object ID',
  'vInfoUUID'                    : 'UUID',
  'vInfoInstanceUUID'            : 'Instance UUID',

  // ── vCPU ───────────────────────────────────────────────────
  'vCPUVMName'                   : 'VM',
  'vCPUPowerstate'               : 'Powerstate',
  'vCPUTemplate'                 : 'Template',
  'vCPUSRMPlaceholder'           : 'SRM Placeholder',
  'vCPUCPUs'                     : 'CPUs',
  'vCPUSockets'                  : 'Sockets',
  'vCPUCoresPerSocket'           : 'Cores p/s',
  'vCPUMaxCpuUsage'              : 'Max',

  // ── vMemory ────────────────────────────────────────────────
  'vMemoryVMName'                : 'VM',
  'vMemoryPowerstate'            : 'Powerstate',
  'vMemoryTemplate'              : 'Template',
  'vMemorySRMPlaceholder'        : 'SRM Placeholder',
  'vMemorySizeMiB'               : 'Size MiB',
  'vMemoryReservationLockedToMax': 'Memory Reservation Locked To Max',
  'vMemoryOverhead'              : 'Overhead',
  'vMemoryMaxUsage'              : 'Max',
  'vMemoryHost'                  : 'Host',          // fallback VM->Host for old exports
  'vMemoryCluster'               : 'Cluster',
  'vMemoryDatacenter'            : 'Datacenter',
  'vMemoryOS'                    : 'OS according to the configuration file',
  'vMemoryOSTools'               : 'OS according to the VMware Tools',

  // ── vHost ──────────────────────────────────────────────────
  'vHostName'                    : 'Host',
  'vHostDatacenter'              : 'Datacenter',
  'vHostCluster'                 : 'Cluster',
  'vHostNumCpu'                  : '# CPU',
  'vHostCoresPerCPU'             : 'Cores per CPU',
  'vHostNumCpuCores'             : '# Cores',
  'vHostMemorySize'              : '# Memory',
  'vHostCpuModel'                : 'CPU Model',
  'vHostCpuMhz'                  : 'Speed',
  'vHostFullName'                : 'ESX Version',   // "VMware ESXi 8.0.3 build-24859861"
  'vHostBiosVersion'             : 'BIOS Version',  // was WRONGLY → 'ESX Version' before!
  'vHostBiosVendor'              : 'BIOS Vendor',
  'vHostNumNics'                 : '# NICs',
  'vHostNumHBAs'                 : '# HBAs',
  'vHostVMsTotal'                : '# VMs total',   // ALL VMs (all power states)
  'vHostVMs'                     : '# VMs',         // powered-ON VMs only
  'vHostvCPUs'                   : '# vCPUs',       // lowercase v — RVTools quirk!
  'vHostvRAM'                    : 'vRAM',
  'vHostVISDKServer'             : 'VI SDK Server',
  'vHostConfigStatus'            : 'Config status',
  'vHostVendor'                  : 'Vendor',
  'vHostModel'                   : 'Model',
  'vHostSerialNumber'            : 'Serial number',
  'vHostServiceTag'              : 'Service tag',
  'vHostOverallCpuUsage'         : 'CPU usage %',
  'vHostOverallMemoryUsage'      : 'Memory usage %',
  'vHostObjectID'                : 'Object ID',

  // ── vDatastore ─────────────────────────────────────────────
  'vDatastoreName'               : 'Name',
  'vDatastoreDatacenter'         : 'Datacenter',
  'vDatastoreCluster'            : 'Datastore Cluster',
  'vDatastoreCapacity'           : 'Capacity MiB',
  'vDatastoreFreeSpace'          : 'Free space MiB',
  'vDatastoreProvisioned'        : 'Provisioned MiB',
  'vDatastoreInUse'              : 'In Use MiB',
  'vDatastoreType'               : 'Type',
  'vDatastoreURL'                : 'URL',
  'vDatastoreAccessible'         : 'Accessible',

  // ── vDisk ──────────────────────────────────────────────────
  'vDiskVMName'                  : 'VM',
  'vDiskPowerstate'              : 'Powerstate',
  'vDiskTemplate'                : 'Template',
  'vDiskName'                    : 'Disk',
  'vDiskKey'                     : 'Disk Key',
  'vDiskCapacityMiB'             : 'Capacity MiB',
  'vDiskDiskMode'                : 'Disk Mode',

  // ── vNetwork ───────────────────────────────────────────────
  'vNetworkVMName'               : 'VM',
  'vNetworkPowerstate'           : 'Powerstate',
  'vNetworkTemplate'             : 'Template',
  'vNetworkName'                 : 'Network',
  'vNetworkMacAddress'           : 'MAC Address',
  'vNetworkAdapter'              : 'Adapter',
};


function normalizeRows(rows) {
  if (!rows || rows.length === 0) return rows;
  var sample = Object.keys(rows[0] || {});
  // Fast-check: does any column start with a known RVTools v4.4+ prefix?
  var needsNorm = sample.some(function(k) {
    return /^v(Info|Host|Disk|Datastore|Cluster|Network|CPU|Memory)/i.test(k);
  });
  if (!needsNorm) return rows; // old-style: pass through unchanged

  return rows.map(function(row) {
    var out = {};
    var keys = Object.keys(row);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var canonical = _ALIAS[key];
      if (canonical) out[canonical] = row[key]; // add mapped name
      out[key] = row[key];                       // keep original too
    }
    return out;
  });
}

// ── Sheet type detection ───────────────────────────────────────
function detectSheetType(cols) {
  var c = new Set(cols.map(function(s) { return String(s).trim(); }));
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
  var normalized = normalizeRows(rows);
  var cols = Object.keys(normalized[0] || {});
  var t = detectSheetType(cols);
  if      (t.isVInfo)    { console.log('[vInfo] <- ' + label);    buckets.vinfo.push.apply(buckets.vinfo, normalized); }
  else if (t.isVHost)    { console.log('[vHost] <- ' + label);    buckets.vhost.push.apply(buckets.vhost, normalized); }
  else if (t.isVDisk)    { console.log('[vDisk] <- ' + label);    buckets.vdisk.push.apply(buckets.vdisk, normalized); }
  else if (t.isVDS)      { console.log('[vDS] <- '   + label);    buckets.vds.push.apply(buckets.vds, normalized);     }
  else if (t.isVCPU)     { console.log('[vCPU] <- '  + label);    buckets.vcpu.push.apply(buckets.vcpu, normalized);   }
  else if (t.isVMem)     { console.log('[vMem] <- '  + label);    buckets.vmem.push.apply(buckets.vmem, normalized);   }
  else if (t.isVNetwork) { console.log('[vNet] <- '  + label);    buckets.vnetwork.push.apply(buckets.vnetwork, normalized); }
  else { console.warn('[skip] <- ' + label, cols.slice(0, 8)); }
}

// ── File parsing with progress ─────────────────────────────────
async function parseFiles(fileList, onProgress) {
  var buckets = { vinfo:[], vhost:[], vdisk:[], vds:[], vcpu:[], vmem:[], vnetwork:[] };
  var files = Array.from(fileList);
  for (var fi = 0; fi < files.length; fi++) {
    var file = files[fi];
    var ext = file.name.toLowerCase().split('.').pop();
    var basePct = (fi / files.length) * 100;
    if (onProgress) onProgress('Reading: ' + file.name, basePct);
    // yield to browser so spinner renders
    await new Promise(function(r){ setTimeout(r, 0); });

    if (ext === 'csv') {
      var text = await file.text();
      var parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      dispatchRows(parsed.data, file.name, buckets);
    } else if (ext === 'xlsx' || ext === 'xls') {
      var buf = await file.arrayBuffer();
      var workbook = XLSX.read(buf, { type: 'array', cellDates: true, sheetRows: 0 });
      var sheetNames = workbook.SheetNames;
      for (var si = 0; si < sheetNames.length; si++) {
        var sheetName = sheetNames[si];
        var sheetPct = basePct + ((si / sheetNames.length) * (100 / files.length));
        if (onProgress) onProgress('Sheet: ' + sheetName, sheetPct);
        await new Promise(function(r){ setTimeout(r, 0); });
        var rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { 
    defval: '',
    raw:    false,
    range:  0       // ← THIS is what overrides the _FilterDatabase boundary
});
        dispatchRows(rows, file.name + ' -> ' + sheetName, buckets);
      }
    } else {
      console.warn('Unsupported:', file.name);
    }
  }
  if (onProgress) onProgress('Computing summary...', 95);
  await new Promise(function(r){ setTimeout(r, 0); });
  return buckets;
}

// ── Core aggregation ───────────────────────────────────────────
var _allVMs = [];

function computeSummary(buckets) {
  var vinfo = buckets.vinfo;
  var vhost = buckets.vhost;
  var vds   = buckets.vds;

  var totalVms=0, activeVms=0, totalVcpus=0, vMemMiB=0, storageProvMiB=0;
  var perCluster=new Map(), perPower=new Map(), perOS=new Map(), perHW=new Map();
  var vmList=[];
  
    // Build VM->Host fallback map from vMemory sheet
  // Old-style exports don't have Host in vInfo but DO have it in vMemory
  var vmHostFallback = new Map();
  var vmClusterFallback = new Map();
  for (var mi = 0; mi < buckets.vmem.length; mi++) {
    var mr = buckets.vmem[mi];
    var vmKey = String(mr['VM'] || '').trim();
    if (!vmKey) continue;
    var mHost    = String(mr['Host']    || '').trim();
    var mCluster = String(mr['Cluster'] || '').trim();
    if (mHost)    vmHostFallback.set(vmKey, mHost);
    if (mCluster) vmClusterFallback.set(vmKey, mCluster);
  }




  for (var i = 0; i < vinfo.length; i++) {
    var row   = vinfo[i];
    totalVms++;
    var cpus    = num(row['CPUs']);
    var mem     = num(row['Memory'] !== undefined ? row['Memory'] : row['Memory MiB']);
    var prov    = num(row['Provisioned MiB']);
    var hw      = safeStr(row['HW version'] !== undefined ? row['HW version'] : (row['HW Version'] || ''));
    var vmName  = safeStr(row['VM']);
    var host    = safeStr(row['Host']) !== 'Unknown'
                    ? safeStr(row['Host'])
                    : (vmHostFallback.get(vmName) || 'Unknown');
    var cluster = safeStr(row['Cluster']) !== 'Unknown'
                    ? safeStr(row['Cluster'])
                    : (vmClusterFallback.get(vmName) || 'Unknown');
    var power   = safeStr(row['Powerstate']);
    var os      = safeStr(
      row['OS according to the VMware Tools'] !== undefined ? row['OS according to the VMware Tools'] :
      (row['OS according to the configuration file'] || '')
    );
    var osShort = os.length > 42 ? os.slice(0,40) + '...' : os;

    totalVcpus += cpus;
    vMemMiB    += mem;
    storageProvMiB += prov;
    if (isPoweredOn(row)) activeVms++;

    if (!perCluster.has(cluster)) {
      perCluster.set(cluster, { cluster:cluster, vm_count:0, total_vcpus:0, total_mem_mib:0, p_cores:0, vm_on:0 });
    }
    var cl = perCluster.get(cluster);
    cl.vm_count++;
    cl.total_vcpus += cpus;
    cl.total_mem_mib += mem;
    if (isPoweredOn(row)) cl.vm_on++;

    perPower.set(power, (perPower.get(power)||0) + 1);
    perOS.set(osShort,  (perOS.get(osShort) ||0) + 1);
    perHW.set(hw,       (perHW.get(hw)      ||0) + 1);

    vmList.push({
      vm_name:    vmName,
      powerstate: power,
      cpus:       cpus,
      memory_gib: +(mem/1024).toFixed(1),
      storage_gib:+(prov/1024).toFixed(1),
      cluster:    cluster,
      host:       host,
      os:         osShort,
      hw:         hw,
      os_full:    os,
    });
  }

  var hosts=0, pCores=0, pMemMiB=0;
  var hostRows=[];

  for (var j = 0; j < vhost.length; j++) {
    var hrow    = vhost[j];
    hosts++;
    var sockets = num(hrow['# CPU']);
    var cpc     = num(hrow['Cores per CPU']);
    var cores   = num(hrow['# Cores']) || (sockets * cpc);
    var hmem    = num(hrow['# Memory']);
    var vcpusPl = num(hrow['# vCPUs']);
    // vm_count: prefer vInfo-derived count if vHost column is 0/missing
    var vmCountRaw = num(hrow['# VMs total'] !== undefined && hrow['# VMs total'] !== ''
                     ? hrow['# VMs total'] : hrow['# VMs']);
    var vmOnRaw    = num(hrow['# VMs ON'] !== undefined && hrow['# VMs ON'] !== '' ? hrow['# VMs ON'] : hrow['# VMs']);
    var hcluster   = safeStr(hrow['Cluster']);
    var hname      = safeStr(hrow['Host']);

    pCores  += cores;
    pMemMiB += hmem;
    if (perCluster.has(hcluster)) perCluster.get(hcluster).p_cores += cores;

    // Count VMs from vInfo for this host (more reliable across versions)
    var vmCountActual = vmList.filter(function(v) { return v.host === hname; }).length;

    hostRows.push({
      host_name:    hname,
      cluster:      hcluster,
      num_cpu:      sockets,
      total_cores:  cores,
      memory_gib:   +(hmem/1024).toFixed(1),
      vcpus_placed: vcpusPl,
      // Use actual count from vInfo if available, fall back to vHost column
      vm_count:     vmCountActual > 0 ? vmCountActual : vmCountRaw,
      vm_on:        vmOnRaw,
      esx_version:  safeStr(hrow['ESX Version']),
    });
  }

  var dsCapMiB = 0;
  for (var k = 0; k < vds.length; k++) dsCapMiB += num(vds[k]['Capacity MiB']);

  var top10     = vmList.slice().sort(function(a,b){return b.cpus - a.cpus;}).slice(0,10);
  var byCluster = Array.from(perCluster.values())
    .map(function(c) {
      return Object.assign({}, c, {
        total_mem_gib: +(c.total_mem_mib/1024).toFixed(1),
        vcpu_core_ratio: c.p_cores ? +(c.total_vcpus/c.p_cores).toFixed(2) : '-'
      });
    })
    .sort(function(a,b){ return b.total_vcpus - a.total_vcpus; });
  var osList    = Array.from(perOS.entries()).map(function(e){ return {os:e[0], count:e[1]}; })
    .sort(function(a,b){ return b.count-a.count; }).slice(0,8);
  var powerList = Array.from(perPower.entries()).map(function(e){ return {state:e[0], count:e[1]}; })
    .sort(function(a,b){ return b.count-a.count; });
  var hwList    = Array.from(perHW.entries()).map(function(e){ return {hw:e[0], count:e[1]}; })
    .sort(function(a,b){ return b.count-a.count; }).slice(0,8);

  _allVMs = vmList;

  return {
    kpi: {
      active_vms:              activeVms,
      total_vms:               totalVms,
      hosts:                   hosts,
      total_vcpus:             totalVcpus,
      physical_cores:          pCores,
      physical_memory_gib:     +(pMemMiB/1024).toFixed(1),
      virtual_memory_gib:      +(vMemMiB/1024).toFixed(1),
      storage_provisioned_tib: +(storageProvMiB/1048576).toFixed(2),
      storage_capacity_tib:    +(dsCapMiB/1048576).toFixed(2),
    },
    ratios: {
      core_to_vcpu: pCores   ? +(totalVcpus/pCores).toFixed(2)  : 0,
      vram_to_pram: pMemMiB  ? +(vMemMiB/pMemMiB).toFixed(2)    : 0,
      vm_density:   hosts    ? +(activeVms/hosts).toFixed(1)     : 0,
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
  var k = s.kpi, r = s.ratios;
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

  fillTable('tbl-power', s.power_list, [
    function(r){ return powerBadge(r.state); },
    function(r){ return r.count; },
    function(r){ return pct(r.count, k.total_vms); }
  ]);
  fillTable('tbl-top10', s.top10_vcpu, [
    function(r){ return r.vm_name; },
    function(r){ return r.cpus; },
    function(r){ return r.memory_gib; },
    function(r){ return r.storage_gib; },
    function(r){ return r.cluster; },
    function(r){ return powerBadge(r.powerstate); }
  ]);
  fillTable('tbl-os', s.os_list, [
    function(r){ return r.os; },
    function(r){ return r.count; },
    function(r){ return pct(r.count, k.total_vms); }
  ]);
  fillTable('tbl-hw', s.hw_list, [
    function(r){ return r.hw; },
    function(r){ return r.count; },
    function(r){ return pct(r.count, k.total_vms); }
  ]);
  fillTable('tbl-clusters', s.by_cluster, [
    function(r){ return r.cluster; },
    function(r){ return r.vm_count; },
    function(r){ return r.total_vcpus; },
    function(r){ return r.total_mem_gib; },
    function(r){ return r.p_cores; },
    function(r){ return r.vcpu_core_ratio; }
  ]);
  fillTable('tbl-hosts', s.host_rows, [
    function(r){ return r.host_name; },
    function(r){ return r.cluster; },
    function(r){ return r.num_cpu; },
    function(r){ return r.total_cores; },
    function(r){ return r.memory_gib; },
    function(r){ return r.vcpus_placed; },
    function(r){ return r.vm_count; },
    function(r){ return r.esx_version; }
  ]);
  fillTable('tbl-clusters-full', s.by_cluster, [
    function(r){ return r.cluster; },
    function(r){ return r.vm_count; },
    function(r){ return r.total_vcpus; },
    function(r){ return r.total_mem_gib; },
    function(r){ return r.p_cores; },
    function(r){ return r.vcpu_core_ratio; }
  ]);
  fillTable('tbl-hosts-full', s.host_rows, [
    function(r){ return r.host_name; },
    function(r){ return r.cluster; },
    function(r){ return r.num_cpu; },
    function(r){ return r.total_cores; },
    function(r){ return r.memory_gib; },
    function(r){ return r.vcpus_placed; },
    function(r){ return r.vm_count; },
    function(r){ return r.esx_version; }
  ]);
}

// ── VM search & filter ─────────────────────────────────────────
function renderVMs(list) {
  var total = list.length;
  setText('vm-count-badge', total.toLocaleString() + ' VMs');
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
  var q     = ((document.getElementById('vm-search')       || {}).value || '').toLowerCase();
  var power = ((document.getElementById('vm-power-filter') || {}).value || '').toLowerCase();
  var list  = _allVMs.filter(function(vm) {
    var matchQ = !q     || [vm.vm_name, vm.os, vm.cluster, vm.host].some(function(f){ return f.toLowerCase().includes(q); });
    var matchP = !power || vm.powerstate.toLowerCase() === power;
    return matchQ && matchP;
  });
  renderVMs(list);
}

// ── File drop & load orchestration ────────────────────────────
async function handleFiles(fileList) {
  if (!fileList || fileList.length === 0) return;

  // Show Analyse button first
  var analyseBtn = document.getElementById('btn-analyse');
  if (analyseBtn) {
    // Update file badges
    var badgesEl = document.getElementById('file-badges');
    if (badgesEl) {
      badgesEl.innerHTML = Array.from(fileList).map(function(f) {
        return '<span class="file-badge">' + f.name + '</span>';
      }).join('');
    }
    // Store fileList for when Analyse is clicked
    analyseBtn._pendingFiles = fileList;
    analyseBtn.style.display = '';
    analyseBtn.disabled = false;
    analyseBtn.textContent = 'Analyse (' + fileList.length + ' file' + (fileList.length > 1 ? 's' : '') + ')';
    return; // wait for user to click Analyse
  }

  // No Analyse button — run immediately (legacy mode)
  await _runAnalysis(fileList);
}

async function _runAnalysis(fileList) {
  showSpinner('Reading files...', 0);

  try {
    var buckets = await parseFiles(fileList, function(msg, p) {
      setSpinnerMsg(msg, p);
    });

    setSpinnerMsg('Computing summary...', 96);
    await new Promise(function(r){ setTimeout(r, 0); });

    var summary = computeSummary(buckets);

    setSpinnerMsg('Rendering dashboard...', 99);
    await new Promise(function(r){ setTimeout(r, 0); });

    window.APP_STATE = { buckets: buckets, summary: summary, loaded: true };

    var dz = document.getElementById('drop-zone');
    if (dz) dz.classList.add('hidden');

    renderDashboard(summary);
    renderVMs(summary.all_vms);

    var vmSearch = document.getElementById('vm-search');
    var vmPower  = document.getElementById('vm-power-filter');
    if (vmSearch) vmSearch.addEventListener('input',  filterVMs);
    if (vmPower)  vmPower.addEventListener('change', filterVMs);

    document.dispatchEvent(new CustomEvent('rvtools:dataready', { detail: { buckets: buckets, summary: summary } }));

    hideSpinner();
    unlockNav();
    showView('dashboard');

  } catch (err) {
    hideSpinner();
    console.error('[RVTools] Analysis failed:', err);
    alert('Error analysing files: ' + err.message);
  }
}

// ── Event bindings ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  var dropZone  = document.getElementById('drop-zone');
  var fileInput = document.getElementById('file-input');

  if (dropZone) {
    dropZone.addEventListener('dragover', function(e) {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', function() {
      dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', function(e) {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      handleFiles(e.dataTransfer.files);
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', function() {
      handleFiles(fileInput.files);
    });
  }

  var btnReset = document.getElementById('btn-reset');
  if (btnReset) btnReset.addEventListener('click', function() { location.reload(); });

  var btnPdf = document.getElementById('btn-export-pdf');
  if (btnPdf) btnPdf.addEventListener('click', function() {
    if (window.exportCurrentViewPDF) exportCurrentViewPDF();
  });

  // Analyse button — shown after file selection
  var btnAnalyse = document.getElementById('btn-analyse');
  if (btnAnalyse) {
    btnAnalyse.style.display = 'none'; // hidden until files chosen
    btnAnalyse.addEventListener('click', function() {
      var files = btnAnalyse._pendingFiles;
      if (!files || files.length === 0) return;
      btnAnalyse.style.display = 'none';
      _runAnalysis(files);
    });
  }
});
