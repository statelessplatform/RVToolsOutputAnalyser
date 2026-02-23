// ════════════════════════════════════════════════════════════════
// dashboard-drp.js  —  Disaster Recovery Plan Simulator
// ════════════════════════════════════════════════════════════════
(function() {
  let _activeScenario = 1;

  // Default DRP ratios per scenario (user-adjustable in future)
  const DRP_RATIOS = {
    1: { vcpu_limit: 2.0, vram_limit: 1.0 },
    2: { vcpu_limit: 1.5, vram_limit: 0.8 },
    3: { vcpu_limit: 1.0, vram_limit: 0.6 },
  };

  function render(summary, scenario) {
    _activeScenario = scenario;
    document.querySelectorAll('.drp-scenario-btn').forEach(b => {
      b.classList.toggle('drp-scenario-active', parseInt(b.dataset.scenario) === scenario);
    });

    const ratio = DRP_RATIOS[scenario];
    const { by_cluster, host_rows, all_vms, kpi } = summary;

    // Build cluster-level DRP data
    const rows = by_cluster.map((cl, i) => {
      const hosts   = host_rows.filter(h => h.cluster === cl.cluster);
      const esxCnt  = hosts.length;
      const realCores = hosts.reduce((s,h)=>s+h.total_cores,0);
      const vmOn    = cl.vm_on || 0;
      const totalVcpu = cl.total_vcpus;
      const effMemGb  = hosts.reduce((s,h)=>s+h.memory_gib,0);
      const vramGb  = cl.total_mem_gib || 0;

      const maxVcpuAfter  = Math.floor(realCores * ratio.vcpu_limit);
      const maxVramAfter  = +(effMemGb * ratio.vram_limit).toFixed(0);
      const vcpuRatio     = realCores ? +(totalVcpu / realCores).toFixed(2) : 0;
      const vramRatio     = effMemGb  ? +(vramGb / effMemGb).toFixed(2) : 0;

      const canAbsorb     = vcpuRatio <= ratio.vcpu_limit && vramRatio <= ratio.vram_limit;
      const slots         = realCores ? Math.floor(realCores / (totalVcpu / Math.max(vmOn,1))) : 0;

      return {
        num: i+1, cluster: cl.cluster, esx: esxCnt,
        vm_on_before: vmOn, real_cores: realCores,
        total_vcpu_before: totalVcpu, eff_mem_gb: effMemGb, vram_before: vramGb,
        vm_on_after: Math.round(vmOn * 1.2), vcpu_after: Math.min(maxVcpuAfter, totalVcpu * 1.2),
        vram_after: Math.round(vramGb * 1.1),
        vcpu_ratio: vcpuRatio, vram_ratio: vramRatio, can_absorb: canAbsorb, slots,
      };
    });

    // Main table
    fillTable('tbl-drp-main', rows, [
      r=>r.num, r=>r.cluster, r=>r.esx,
      r=>r.vm_on_before, r=>r.real_cores, r=>r.total_vcpu_before,
      r=>r.eff_mem_gb.toFixed(0), r=>r.vram_before.toFixed(0),
      r=>`<strong style="color:#4f46e5">${r.vm_on_after}</strong>`,
      r=>`<strong style="color:#4f46e5">${Math.round(r.vcpu_after)}</strong>`,
      r=>`<strong style="color:#4f46e5">${r.vram_after}</strong>`,
    ]);

    // Ratios table
    fillTable('tbl-drp-ratios', rows, [
      r=>r.num, r=>r.cluster,
      r=>(r.vm_on_before/Math.max(r.esx,1)).toFixed(2),
      r=>(r.vram_before/Math.max(r.esx,1)).toFixed(2),
      r=>r.slots,
      r=>`<span class="${r.vcpu_ratio>ratio.vcpu_limit?'status-ns-text':'status-ok-text'}">${r.vcpu_ratio}</span>`,
      r=>`<span class="status-ok-text">${ratio.vcpu_limit}</span>`,
      r=>`<span class="${r.vram_ratio>ratio.vram_limit?'status-tbu-text':'status-ok-text'}">${r.vram_ratio}</span>`,
      r=>`<span class="status-ok-text">${ratio.vram_limit}</span>`,
    ]);

    // Protected clusters
    fillTable('tbl-drp-protected', by_cluster.map((cl,i)=>({
      num:i+1, cluster:cl.cluster, location:'Site-A',
      esx: host_rows.filter(h=>h.cluster===cl.cluster).length,
      vm_on: cl.vm_on||0, vcpu: cl.total_vcpus, vram: cl.total_mem_gib||0
    })), [
      r=>r.num, r=>r.cluster, r=>r.location, r=>r.esx,
      r=>r.vm_on, r=>r.vcpu, r=>r.vram
    ]);
  }

  document.querySelectorAll('.drp-scenario-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (window.APP_STATE.loaded)
        render(window.APP_STATE.summary, parseInt(btn.dataset.scenario));
    });
  });

  document.addEventListener('rvtools:dataready', e => render(e.detail.summary, 1));
  document.addEventListener('rvtools:viewchange', e => {
    if (e.detail.view === 'drp' && window.APP_STATE.loaded)
      render(window.APP_STATE.summary, _activeScenario);
  });
})();
