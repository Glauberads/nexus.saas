/**
 * admin-experiments.js
 * Controlador do Dashboard de A/B Testing
 * Isola toda a lógica matemática, cache e visualização em Chart.js.
 */

window.NexusExperimentsDashboard = (function() {
  let cache = {};
  let charts = {};
  
  function getHeaders() {
    return {
      'Content-Type': 'application/json',
      'apikey': window.SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + window.supabaseAccessToken
    };
  }

  async function fetchWithCache(rpcName, params, ttl = 60000) {
    const cacheKey = rpcName + JSON.stringify(params);
    if (cache[cacheKey] && (Date.now() - cache[cacheKey].timestamp < ttl)) {
      return cache[cacheKey].data;
    }

    const res = await fetch(`${window.SUPABASE_URL}/rest/v1/rpc/${rpcName}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(params)
    });

    if (!res.ok) {
      throw new Error(`RPC Error: ${res.statusText}`);
    }

    const data = await res.json();
    cache[cacheKey] = { timestamp: Date.now(), data };
    return data;
  }

  // Elementos do DOM
  let rootElement;
  
  // Estado
  let currentExperimentId = null;
  let currentFilters = {
    date_from: null,
    date_to: null
  };

  async function loadExperimentsList() {
    try {
      const res = await fetchWithCache('rpc_admin_list_checkout_experiments', { p_limit: 100, p_offset: 0 }, 10000);
      return res;
    } catch (e) {
      console.error(e);
      return [];
    }
  }

  async function loadExperimentOverview() {
    if (!currentExperimentId) return null;
    return await fetchWithCache('rpc_admin_experiment_overview', {
      p_experiment_id: currentExperimentId,
      p_date_from: currentFilters.date_from,
      p_date_to: currentFilters.date_to
    });
  }

  async function loadTimeseries() {
    if (!currentExperimentId) return [];
    return await fetchWithCache('rpc_admin_experiment_timeseries', {
      p_experiment_id: currentExperimentId,
      p_date_from: currentFilters.date_from,
      p_date_to: currentFilters.date_to
    });
  }

  async function loadFunnel() {
    if (!currentExperimentId) return [];
    return await fetchWithCache('rpc_admin_experiment_funnel', {
      p_experiment_id: currentExperimentId,
      p_date_from: currentFilters.date_from,
      p_date_to: currentFilters.date_to
    });
  }

  function formatMoney(val) {
    if (val === null || val === undefined) return '-';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  }

  function formatPercent(val) {
    if (val === null || val === undefined) return '-';
    return new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2 }).format(val);
  }

  function renderList(experiments) {
    if (!experiments || experiments.length === 0) {
      return `<p>Nenhum experimento encontrado.</p>`;
    }
    
    let html = `<div class="experiment-list" style="margin-bottom: 20px;">
      <select id="exp-selector" style="width: 100%; padding: 10px; border-radius: 8px; background: #1f1f22; color: #fff; border: 1px solid #27272a;">
        <option value="">-- Selecione um Experimento --</option>`;
    
    experiments.forEach(e => {
      const isSelected = e.id === currentExperimentId ? 'selected' : '';
      html += `<option value="${e.id}" ${isSelected}>${e.name} (${e.status})</option>`;
    });

    html += `</select></div>`;
    return html;
  }

  function determineWinnerCandidate(variants) {
    let candidate = null;
    let maxLift = 0;
    for (const v of variants) {
      if (v.is_control) continue;
      // Critérios rigorosos
      if (v.exposures >= 100 && v.conversions >= 10 && v.stats && v.stats.statistically_significant && v.stats.relative_lift > 0) {
        if (v.stats.relative_lift > maxLift) {
          maxLift = v.stats.relative_lift;
          candidate = v;
        }
      }
    }
    return candidate;
  }

  function renderOverview(data) {
    if (!data) return '';
    const exp = data.experiment;
    const variants = data.variants || [];
    
    let srmHtml = '';
    if (data.srm && data.srm.status === 'ok') {
       if (data.srm.has_srm) {
         srmHtml = `<div style="background: rgba(239,68,68,0.1); color: #EF4444; padding: 12px; border-radius: 8px; margin-bottom: 20px; border: 1px solid rgba(239,68,68,0.3);">
           <strong>⚠️ Possível Sample Ratio Mismatch (SRM) Detectado!</strong><br>
           A distribuição real de tráfego difere estatisticamente dos pesos configurados (p-value: ${data.srm.p_value.toFixed(4)}). Isso pode indicar um bug de redirecionamento ou bloqueadores de anúncios afetando uma variante específica. Não declare um vencedor até investigar.
         </div>`;
       } else {
         srmHtml = `<div style="background: rgba(16,185,129,0.1); color: #10B981; padding: 12px; border-radius: 8px; margin-bottom: 20px; border: 1px solid rgba(16,185,129,0.3);">
           <strong>✅ Tráfego Saudável</strong><br>
           Nenhum SRM detectado. A distribuição está ocorrendo conforme os pesos configurados.
         </div>`;
       }
    } else if (data.srm && data.srm.status === 'insufficient_data') {
       srmHtml = `<div style="background: rgba(245,158,11,0.1); color: #F59E0B; padding: 12px; border-radius: 8px; margin-bottom: 20px; border: 1px solid rgba(245,158,11,0.3);">
           <strong>⏳ Dados Insuficientes para SRM</strong><br>
           Aguarde mais tráfego para validar a saúde da distribuição (${data.srm.reason}).
         </div>`;
    }

    let winnerCandidate = null;
    let winnerHtml = '';
    
    if (!data.srm || !data.srm.has_srm) {
       winnerCandidate = determineWinnerCandidate(variants);
       if (winnerCandidate) {
         winnerHtml = `<div style="background: rgba(16,185,129,0.1); color: #10B981; padding: 16px; border-radius: 8px; margin-bottom: 20px; border: 1px solid rgba(16,185,129,0.5);">
           <strong style="font-size: 16px;">🏆 Candidata a Vencedora Encontrada!</strong><br>
           A variante <strong>${winnerCandidate.variant_key}</strong> possui significância estatística, amostra mínima e lift positivo de ${formatPercent(winnerCandidate.stats.relative_lift)} na conversão.
         </div>`;
       } else {
         winnerHtml = `<div style="background: rgba(255,255,255,0.05); color: #A1A1AA; padding: 12px; border-radius: 8px; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.1);">
           <strong>⏳ Teste Inconclusivo ou Dados Insuficientes</strong><br>
           Ainda não há dados suficientes com 95% de confiança estatística (Mín. 100 exposições e 10 vendas).
         </div>`;
       }
    } else {
       winnerHtml = `<div style="background: rgba(239,68,68,0.1); color: #EF4444; padding: 12px; border-radius: 8px; margin-bottom: 20px; border: 1px solid rgba(239,68,68,0.3);">
           <strong>⛔ Sugestão de Vencedor Bloqueada</strong><br>
           O Alerta SRM bloqueou a leitura de resultados. Corrija o tráfego antes de declarar um vencedor.
         </div>`;
    }

    let varRows = '';
    variants.forEach(v => {
      const conf = v.stats ? formatPercent(v.stats.confidence_level) : '-';
      const sig = v.stats ? (v.stats.statistically_significant ? '✅ Sim' : '⏳ Não') : '-';
      const lift = v.revenue_lift !== null ? formatPercent(v.revenue_lift) : '-';
      
      varRows += `<tr>
        <td>${v.variant_key} ${v.is_control ? '<span style="color:#60A5FA">(Controle)</span>' : ''}</td>
        <td>${v.weight}%</td>
        <td>${v.exposures}</td>
        <td>${v.conversions}</td>
        <td>${formatPercent(v.conversion_rate)}</td>
        <td>${formatMoney(v.gross_revenue)}</td>
        <td>${formatMoney(v.aov)}</td>
        <td>${formatMoney(v.rpv)}</td>
        <td style="color: ${v.revenue_lift > 0 ? '#10B981' : (v.revenue_lift < 0 ? '#EF4444' : '#fff')}">${lift}</td>
        <td>${conf}</td>
        <td>${sig}</td>
      </tr>`;
    });

    return `
      <div style="font-size: 12px; color: #9CA3AF; margin-bottom: 10px;">
        💡 Importante: ${data.notice}
      </div>
      ${srmHtml}
      ${winnerHtml}
      
      <div style="background: #121214; border: 1px solid #27272a; border-radius: 8px; overflow: hidden; margin-bottom: 20px;">
        <table style="width: 100%; text-align: left; border-collapse: collapse;">
          <thead style="background: rgba(255,255,255,0.05);">
            <tr>
              <th style="padding: 12px; border-bottom: 1px solid #27272a;">Variante</th>
              <th style="padding: 12px; border-bottom: 1px solid #27272a;">Peso</th>
              <th style="padding: 12px; border-bottom: 1px solid #27272a;">Exposições</th>
              <th style="padding: 12px; border-bottom: 1px solid #27272a;">Conversões</th>
              <th style="padding: 12px; border-bottom: 1px solid #27272a;">Taxa Conv.</th>
              <th style="padding: 12px; border-bottom: 1px solid #27272a;">Receita Bruta</th>
              <th style="padding: 12px; border-bottom: 1px solid #27272a;">Ticket Médio</th>
              <th style="padding: 12px; border-bottom: 1px solid #27272a;">RPV</th>
              <th style="padding: 12px; border-bottom: 1px solid #27272a;">Lift (RPV)</th>
              <th style="padding: 12px; border-bottom: 1px solid #27272a;">Confiança</th>
              <th style="padding: 12px; border-bottom: 1px solid #27272a;">Significância</th>
            </tr>
          </thead>
          <tbody>
            ${varRows}
          </tbody>
        </table>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
        <div style="background: #121214; border: 1px solid #27272a; border-radius: 8px; padding: 16px;">
          <h3 style="margin-top: 0; margin-bottom: 16px;">Evolução de Conversões</h3>
          <canvas id="chart-timeseries-conv"></canvas>
        </div>
        <div style="background: #121214; border: 1px solid #27272a; border-radius: 8px; padding: 16px;">
          <h3 style="margin-top: 0; margin-bottom: 16px;">Funil de A/B Testing</h3>
          <canvas id="chart-funnel"></canvas>
        </div>
      </div>
    `;
  }

  function renderCharts(tsData, funnelData, variantsData) {
    if (charts['ts']) charts['ts'].destroy();
    if (charts['funnel']) charts['funnel'].destroy();

    const variantsMap = {};
    if (variantsData) {
      variantsData.forEach(v => { variantsMap[v.variant_id] = v.variant_key; });
    }

    if (tsData && tsData.length > 0) {
      const dates = [...new Set(tsData.map(d => new Date(d.date).toLocaleDateString()))];
      const datasets = [];
      const colors = ['#60A5FA', '#F472B6', '#10B981', '#F59E0B'];
      
      const variantsInTs = [...new Set(tsData.map(d => d.variant_id))];
      
      variantsInTs.forEach((vid, idx) => {
        const vKey = variantsMap[vid] || vid;
        const data = dates.map(dt => {
          const match = tsData.find(d => new Date(d.date).toLocaleDateString() === dt && d.variant_id === vid);
          return match ? match.conversions : 0;
        });
        
        datasets.push({
          label: `Var ${vKey} - Conversões`,
          data: data,
          borderColor: colors[idx % colors.length],
          backgroundColor: colors[idx % colors.length] + '33',
          tension: 0.4,
          fill: true
        });
      });

      const ctxTs = document.getElementById('chart-timeseries-conv');
      if (ctxTs) {
        charts['ts'] = new Chart(ctxTs, {
          type: 'line',
          data: { labels: dates, datasets },
          options: { responsive: true, plugins: { legend: { labels: { color: '#fff' } } }, scales: { y: { beginAtZero: true, grid: { color: '#27272a' }, ticks: { color: '#9CA3AF' } }, x: { grid: { color: '#27272a' }, ticks: { color: '#9CA3AF' } } } }
        });
      }
    }

    if (funnelData && funnelData.length > 0) {
      const labels = ['Exposição', 'Carregamento', 'Pagamento Criado', 'Convertido'];
      const datasets = [];
      const colors = ['#60A5FA', '#F472B6', '#10B981', '#F59E0B'];
      
      funnelData.forEach((f, idx) => {
        const vKey = variantsMap[f.variant_id] || f.variant_id;
        datasets.push({
          label: `Var ${vKey}`,
          data: [f.step_exposed, f.step_checkout_loaded, f.step_payment_created, f.step_converted],
          backgroundColor: colors[idx % colors.length],
        });
      });

      const ctxFnl = document.getElementById('chart-funnel');
      if (ctxFnl) {
        charts['funnel'] = new Chart(ctxFnl, {
          type: 'bar',
          data: { labels, datasets },
          options: { responsive: true, plugins: { legend: { labels: { color: '#fff' } } }, scales: { y: { beginAtZero: true, grid: { color: '#27272a' }, ticks: { color: '#9CA3AF' } }, x: { grid: { color: '#27272a' }, ticks: { color: '#9CA3AF' } } } }
        });
      }
    }
  }

  async function render() {
    if (!rootElement) return;
    
    rootElement.innerHTML = `<div style="padding: 40px; text-align: center; color: #9CA3AF;">Carregando painel analítico...</div>`;
    
    try {
      const experiments = await loadExperimentsList();
      
      let topHtml = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <div style="flex: 1; margin-right: 20px;">${renderList(experiments)}</div>
          <div style="display: flex; gap: 10px;">
            <button id="btn-refresh-cache" style="padding: 10px 16px; background: #374151; color: white; border: none; border-radius: 8px; cursor: pointer;">🔄 Atualizar Dados</button>
          </div>
        </div>
      `;

      if (!currentExperimentId && experiments && experiments.length > 0) {
        currentExperimentId = experiments[0].id;
      }

      if (!currentExperimentId) {
        rootElement.innerHTML = topHtml + `<p>Nenhum experimento selecionado ou disponível.</p>`;
        return;
      }

      const [overviewData, tsData, funnelData] = await Promise.all([
        loadExperimentOverview(),
        loadTimeseries(),
        loadFunnel()
      ]);

      const mainHtml = renderOverview(overviewData);

      rootElement.innerHTML = topHtml + mainHtml;

      const sel = document.getElementById('exp-selector');
      if (sel) {
        sel.addEventListener('change', (e) => {
          currentExperimentId = e.target.value;
          render();
        });
      }

      const btnRefresh = document.getElementById('btn-refresh-cache');
      if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
          clearCache();
          render();
        });
      }

      renderCharts(tsData, funnelData, overviewData ? overviewData.variants : null);

    } catch (e) {
      console.error(e);
      rootElement.innerHTML = `<div style="color: #EF4444; padding: 20px;">Erro ao carregar dados do experimento: ${e.message}</div>`;
    }
  }

  function clearCache() {
    cache = {};
    console.log('[A/B Testing] Cache cleared.');
  }

  return {
    init: function(rootId) {
      rootElement = document.getElementById(rootId);
      render();
    },
    destroy: function() {
      Object.keys(charts).forEach(k => charts[k].destroy());
      charts = {};
      if (rootElement) rootElement.innerHTML = '';
      currentExperimentId = null;
    },
    clearCache
  };
})();
