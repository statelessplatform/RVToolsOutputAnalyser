// modal-manager.js — NO wrappers, runs directly at bottom of body

// Close helpers
function _closeModal(id) {
  var el = document.getElementById(id);
  if (el) {
    el.classList.add('hidden');
    document.body.style.overflow = '';
    document.body.style.pointerEvents = '';
  }
}
function _openModal(id) {
  var el = document.getElementById(id);
  if (el) {
    el.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
}

// Wire ✕ buttons directly with onclick
var _esxClose = document.getElementById('modal-esx-close');
var _vmClose  = document.getElementById('modal-vm-close');
var _esxModal = document.getElementById('modal-esx');
var _vmModal  = document.getElementById('modal-vm');

console.log('[modal-manager] esx-close:', _esxClose);
console.log('[modal-manager] vm-close:', _vmClose);
console.log('[modal-manager] esx-modal:', _esxModal);
console.log('[modal-manager] vm-modal:', _vmModal);

if (_esxClose) {
  _esxClose.onclick = function(e) {
    e.stopPropagation();
    _closeModal('modal-esx');
  };
}
if (_vmClose) {
  _vmClose.onclick = function(e) {
    e.stopPropagation();
    _closeModal('modal-vm');
  };
}
if (_esxModal) {
  _esxModal.onclick = function(e) {
    if (e.target === _esxModal) _closeModal('modal-esx');
  };
}
if (_vmModal) {
  _vmModal.onclick = function(e) {
    if (e.target === _vmModal) _closeModal('modal-vm');
  };
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    _closeModal('modal-esx');
    _closeModal('modal-vm');
  }
});

// ESX Modal content
window.openESXModal = function(host) {
  var titleEl = document.getElementById('modal-esx-title');
  var bodyEl  = document.getElementById('modal-esx-body');
  if (!titleEl || !bodyEl) { console.error('ESX modal elements missing'); return; }

  titleEl.textContent = 'ESX: ' + host.host_name;

  var allVMs = (window.APP_STATE && window.APP_STATE.summary)
    ? (window.APP_STATE.summary.all_vms || []) : [];
  var vmsOnHost = allVMs.filter(function(v) { return v.host === host.host_name; });
  var vmOnCount  = vmsOnHost.filter(function(v) { return v.powerstate.toLowerCase() === 'poweredon'; }).length;
  var vmOffCount = vmsOnHost.length - vmOnCount;
  var totalVRAM = vmsOnHost.reduce(function (s, v) {
  var mem = parseFloat(v.memory_gib);
  if (isNaN(mem)) mem = 0;
  return s + mem;
}, 0).toFixed(0);
  var vcpuPerCore = host.total_cores ? (host.vcpus_placed / host.total_cores).toFixed(2) : '—';

  var vmRows = vmsOnHost.map(function(v, i) {
    var bc = v.powerstate.toLowerCase() === 'poweredon' ? 'badge-on' : 'badge-off';
    var bl = v.powerstate.toLowerCase() === 'poweredon' ? 'On' : 'Off';
    return '<tr><td>'+(i+1)+'</td><td><strong>'+v.vm_name+'</strong></td><td>'+v.os+'</td>'
      +'<td><span class="badge '+bc+'">'+bl+'</span></td>'
      +'<td>'+v.cpus+'</td><td>'+v.memory_gib+' GiB</td><td>'+v.storage_gib+' GiB</td></tr>';
  }).join('');

  bodyEl.innerHTML =
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:18px">'
      +'<div>'
        +'<div class="panel-title" style="margin-bottom:10px;color:#0072a3">Host Details</div>'
        +'<table class="table"><tbody>'
          +'<tr><td style="color:var(--text-muted);width:140px">Host Name</td><td><strong>'+host.host_name+'</strong></td></tr>'
          +'<tr><td style="color:var(--text-muted)">Cluster</td><td>'+host.cluster+'</td></tr>'
          +'<tr><td style="color:var(--text-muted)">ESXi Version</td><td>'+host.esx_version+'</td></tr>'
          +'<tr><td style="color:var(--text-muted)">CPU Sockets</td><td>'+host.num_cpu+'</td></tr>'
          +'<tr><td style="color:var(--text-muted)">Total Cores</td><td>'+host.total_cores+'</td></tr>'
          +'<tr><td style="color:var(--text-muted)">Physical RAM</td><td>'+host.memory_gib+' GiB</td></tr>'
          +'<tr><td style="color:var(--text-muted)">VMs Hosted</td><td>'+host.vm_count+'</td></tr>'
          +'<tr><td style="color:var(--text-muted)">vCPUs Placed</td><td>'+host.vcpus_placed+'</td></tr>'
        +'</tbody></table>'
      +'</div>'
      +'<div>'
        +'<div class="panel-title" style="margin-bottom:10px;color:#0072a3">Utilisation</div>'
        +'<div class="metric-grid" style="grid-template-columns:repeat(2,1fr)">'
          +'<div class="metric-card"><div class="metric-label">VM ON</div><div class="metric-value" style="color:#22c55e">'+vmOnCount+'</div></div>'
          +'<div class="metric-card"><div class="metric-label">VM OFF</div><div class="metric-value" style="color:#ef4444">'+vmOffCount+'</div></div>'
          +'<div class="metric-card"><div class="metric-label">vCPU/Core</div><div class="metric-value">'+vcpuPerCore+'</div></div>'
          +'<div class="metric-card"><div class="metric-label">Total vRAM</div><div class="metric-value">'+totalVRAM+' <small>GiB</small></div></div>'
        +'</div>'
      +'</div>'
    +'</div>'
    +'<div class="panel-title" style="margin-bottom:8px">VMs on this host '
      +'<span class="vm-count-badge" style="margin-left:8px">'+vmsOnHost.length+' VMs</span>'
    +'</div>'
    +'<div class="table-wrap" style="max-height:300px;overflow-y:auto">'
      +'<table class="table">'
        +'<thead><tr><th>#</th><th>VM Name</th><th>OS</th><th>Power</th><th>vCPU</th><th>vRAM</th><th>Storage</th></tr></thead>'
        +'<tbody>'+(vmRows || '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:16px">No VMs on this host</td></tr>')+'</tbody>'
      +'</table>'
    +'</div>';

  _openModal('modal-esx');
};

// VM Modal content
window.openVMModal = function(vm) {
  var titleEl = document.getElementById('modal-vm-title');
  var bodyEl  = document.getElementById('modal-vm-body');
  if (!titleEl || !bodyEl) { console.error('VM modal elements missing'); return; }

  titleEl.textContent = 'VM: ' + vm.vm_name;

  var disks = (window.APP_STATE && window.APP_STATE.buckets)
    ? (window.APP_STATE.buckets.vdisk || []).filter(function(d){
        return String(d['VM']).trim() === vm.vm_name;
      }) : [];

  var diskRows = disks.map(function(d, i) {
    var cap = (parseFloat(d['Capacity MiB']||0)/1024).toFixed(1);
    return '<tr><td>'+(i+1)+'</td><td>'+(d['Disk']||d['Disk Key']||i)+'</td>'
      +'<td>'+cap+' GiB</td><td>'+(d['Disk Type']||d['Type']||'—')+'</td>'
      +'<td>'+(d['Thin Provisioned']||'—')+'</td></tr>';
  }).join('');

  var bc = vm.powerstate.toLowerCase() === 'poweredon' ? 'badge-on' : 'badge-off';
  var bl = vm.powerstate.toLowerCase() === 'poweredon' ? 'On' : 'Off';

  bodyEl.innerHTML =
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:18px">'
      +'<div>'
        +'<div class="panel-title" style="margin-bottom:10px;color:#0072a3">VM Details</div>'
        +'<table class="table"><tbody>'
          +'<tr><td style="color:var(--text-muted);width:130px">VM Name</td><td><strong>'+vm.vm_name+'</strong></td></tr>'
          +'<tr><td style="color:var(--text-muted)">Power</td><td><span class="badge '+bc+'">'+bl+'</span></td></tr>'
          +'<tr><td style="color:var(--text-muted)">Cluster</td><td>'+vm.cluster+'</td></tr>'
          +'<tr><td style="color:var(--text-muted)">Host</td><td>'+vm.host+'</td></tr>'
          +'<tr><td style="color:var(--text-muted)">vCPUs</td><td>'+vm.cpus+'</td></tr>'
          +'<tr><td style="color:var(--text-muted)">vRAM</td><td>'+vm.memory_gib+' GiB</td></tr>'
          +'<tr><td style="color:var(--text-muted)">Provisioned</td><td>'+vm.storage_gib+' GiB</td></tr>'
          +'<tr><td style="color:var(--text-muted)">HW Version</td><td>'+vm.hw+'</td></tr>'
          +'<tr><td style="color:var(--text-muted)">OS</td><td>'+vm.os+'</td></tr>'
        +'</tbody></table>'
      +'</div>'
      +'<div>'
        +'<div class="panel-title" style="margin-bottom:10px;color:#0072a3">Resources</div>'
        +'<div class="metric-grid" style="grid-template-columns:repeat(2,1fr)">'
          +'<div class="metric-card"><div class="metric-label">vCPUs</div><div class="metric-value">'+vm.cpus+'</div></div>'
          +'<div class="metric-card"><div class="metric-label">vRAM</div><div class="metric-value">'+vm.memory_gib+' <small>GiB</small></div></div>'
          +'<div class="metric-card"><div class="metric-label">Storage</div><div class="metric-value">'+vm.storage_gib+' <small>GiB</small></div></div>'
          +'<div class="metric-card"><div class="metric-label">Disks</div><div class="metric-value">'+disks.length+'</div></div>'
        +'</div>'
      +'</div>'
    +'</div>'
    +'<div class="panel-title" style="margin-bottom:8px">Disk Inventory</div>'
    +'<div class="table-wrap">'
      +'<table class="table">'
        +'<thead><tr><th>#</th><th>Disk</th><th>Capacity</th><th>Type</th><th>Thin</th></tr></thead>'
        +'<tbody>'+(diskRows||'<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:16px">No disk data — load vDisk sheet</td></tr>')+'</tbody>'
      +'</table>'
    +'</div>';

  _openModal('modal-vm');
};

// Wire table row clicks after data loads
document.addEventListener('rvtools:dataready', function() {
  ['tbl-hosts','tbl-hosts-full'].forEach(function(id) {
    var tbody = document.querySelector('#'+id+' tbody');
    if (!tbody) return;
    tbody.style.cursor = 'pointer';
    tbody.addEventListener('click', function(e) {
      var tr = e.target.closest('tr');
      if (!tr || !tr.cells[0]) return;
      var hostName = tr.cells[0].textContent.trim();
      var host = window.APP_STATE.summary.host_rows.find(function(h){ return h.host_name === hostName; });
      if (host) window.openESXModal(host);
    });
  });

  ['tbl-vms','tbl-top10'].forEach(function(id) {
    var tbody = document.querySelector('#'+id+' tbody');
    if (!tbody) return;
    tbody.style.cursor = 'pointer';
    tbody.addEventListener('click', function(e) {
      var tr = e.target.closest('tr');
      if (!tr || !tr.cells[0]) return;
      var vmName = tr.cells[0].textContent.trim();
      var vm = window.APP_STATE.summary.all_vms.find(function(v){ return v.vm_name === vmName; });
      if (vm) window.openVMModal(vm);
    });
  });
});

console.log('[modal-manager] loaded OK');
