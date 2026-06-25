// ==========================================
// MÓDULO: LOGS FINANCEIROS
// ==========================================
let allFinLogs = [];

window.loadFinancialLogs = async function() {
  try {
    const { data, error } = await supabaseClient
      .from('financial_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw error;
    allFinLogs = data || [];
    window.renderFinancialLogs();
  } catch (err) {
    console.error('Erro ao carregar logs financeiros', err);
    document.getElementById('fin-logs-tbody').innerHTML = '<tr><td colspan=\"7\" style=\"text-align:center; color: var(--danger);\">Erro ao carregar logs.</td></tr>';
  }
};

window.renderFinancialLogs = function() {
  const tbody = document.getElementById('fin-logs-tbody');
  if (!tbody) return;
  
  const statusFilter = document.getElementById('fin-filter-status').value;
  const search = document.getElementById('search-fin-logs').value.toLowerCase();
  
  let filtered = allFinLogs.filter(log => {
    let matchStatus = true;
    if (statusFilter !== 'all') {
      matchStatus = (log.payment_status || '').toUpperCase() === statusFilter.toUpperCase();
    }
    
    let matchSearch = true;
    if (search) {
      matchSearch = 
        (log.customer_name || '').toLowerCase().includes(search) ||
        (log.customer_email || '').toLowerCase().includes(search) ||
        (log.payment_id || '').toLowerCase().includes(search);
    }
    return matchStatus && matchSearch;
  });

  // Calculate KPIs
  let totalCharges = allFinLogs.length;
  let approvedCount = 0;
  let failedCount = 0;
  let splitCount = 0;
  
  allFinLogs.forEach(log => {
    const status = (log.payment_status || '').toUpperCase();
    if (['RECEIVED', 'CONFIRMED'].includes(status)) approvedCount++;
    if (['OVERDUE', 'FAILED', 'REFUNDED', 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED'].includes(status)) failedCount++;
    if (log.split_enabled) splitCount++;
  });

  document.getElementById('kpi-fin-total-charges').innerText = totalCharges;
  document.getElementById('kpi-fin-approved').innerText = approvedCount;
  document.getElementById('kpi-fin-failed').innerText = failedCount;
  document.getElementById('kpi-fin-splits').innerText = splitCount;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan=\"7\" style=\"text-align: center; padding: 24px; color: var(--text-muted);\">Nenhum log encontrado.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(log => {
    const d = new Date(log.created_at).toLocaleString('pt-BR');
    const badgeColor = 
      ['RECEIVED', 'CONFIRMED'].includes(log.payment_status?.toUpperCase()) ? 'var(--success)' : 
      ['PENDING'].includes(log.payment_status?.toUpperCase()) ? '#F59E0B' : 
      'var(--danger)';
      
    const splitBadge = log.split_enabled 
      ? '<span style=\"background: rgba(16,185,129,0.1); color: #10B981; padding: 2px 6px; border-radius: 4px; font-size: 10px;\">Sim</span>' 
      : '<span style=\"background: rgba(255,255,255,0.05); color: var(--text-muted); padding: 2px 6px; border-radius: 4px; font-size: 10px;\">Não</span>';
      
    const val = log.amount ? parseFloat(log.amount).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'}) : '-';

    return `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
        <td style="padding: 12px;">${d}</td>
        <td style="padding: 12px;">
          <div style="font-weight: 600;">${log.product_name || 'Desconhecido'}</div>
          <div style="color: var(--text-muted); font-size: 10px;">${log.event_type}</div>
        </td>
        <td style="padding: 12px;">
          <div>${log.customer_name || '-'}</div>
          <div style="color: var(--text-muted); font-size: 10px;">${log.customer_email || '-'}</div>
        </td>
        <td style="padding: 12px;">${val}</td>
        <td style="padding: 12px;">
          <span style="color: ${badgeColor}; font-weight: 600;">${log.payment_status || log.event_type}</span>
        </td>
        <td style="padding: 12px;">${splitBadge}</td>
        <td style="padding: 12px;">
          <button onclick="window.openFinDrawer('${log.id}')" style="background: rgba(255,255,255,0.1); border: none; color: white; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 11px;">Detalhes</button>
        </td>
      </tr>
    `;
  }).join('');
};

window.openFinDrawer = function(id) {
  const log = allFinLogs.find(l => l.id === id);
  if (!log) return;
  
  document.getElementById('drawer-fin-overlay').style.display = 'block';
  setTimeout(() => {
    document.getElementById('drawer-fin-panel').style.right = '0px';
  }, 10);
  
  document.getElementById('dfin-title').innerText = `Log: ${log.payment_id || 'N/A'}`;
  document.getElementById('dfin-subtitle').innerText = `Evento: ${log.event_type} | Origem: ${log.event_source}`;
  
  let splitHtml = '<div style="color: var(--text-muted);">Split não aplicado.</div>';
  if (log.split_enabled) {
    const splits = log.metadata?.applied_splits || [];
    if (splits.length > 0) {
      splitHtml = splits.map(s => `
        <div style="background: rgba(0,0,0,0.2); padding: 8px; border-radius: 4px; margin-bottom: 8px; border: 1px solid var(--border);">
          <div><strong>Wallet:</strong> ${s.walletId}</div>
          <div><strong>Comissão:</strong> ${s.percentualValue ? s.percentualValue + '%' : 'R$ ' + s.fixedValue}</div>
        </div>
      `).join('');
    } else {
       splitHtml = `
        <div style="background: rgba(0,0,0,0.2); padding: 8px; border-radius: 4px; border: 1px solid var(--border);">
          <div><strong>Wallet:</strong> ${log.split_wallet_id || '-'}</div>
          <div><strong>Tipo:</strong> ${log.split_type || '-'}</div>
          <div><strong>Valor:</strong> ${log.split_value || '-'}</div>
        </div>
      `;
    }
  }

  const errHtml = log.error_message ? `
    <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; padding: 12px; border-radius: 4px; margin-bottom: 16px;">
      <strong>Erro:</strong> ${log.error_message}
    </div>
  ` : '';

  const jsonStr = (obj) => JSON.stringify(obj, null, 2);

  document.getElementById('dfin-body').innerHTML = `
    ${errHtml}
    
    <div style="border: 1px solid var(--border); border-radius: 6px; overflow: hidden;">
      <div style="background: rgba(255,255,255,0.02); padding: 8px 12px; border-bottom: 1px solid var(--border); font-weight: 600;">Dados do Cliente</div>
      <div style="padding: 12px;">
        <div><strong>Nome:</strong> ${log.customer_name || '-'}</div>
        <div><strong>Email:</strong> ${log.customer_email || '-'}</div>
        <div><strong>Doc:</strong> ${log.customer_document ? '***' + log.customer_document.slice(-4) : '-'}</div>
      </div>
    </div>
    
    <div style="border: 1px solid var(--border); border-radius: 6px; overflow: hidden;">
      <div style="background: rgba(255,255,255,0.02); padding: 8px 12px; border-bottom: 1px solid var(--border); font-weight: 600;">Dados da Cobrança</div>
      <div style="padding: 12px;">
        <div><strong>Produto:</strong> ${log.product_name || '-'}</div>
        <div><strong>Valor Bruto:</strong> R$ ${log.amount || '-'}</div>
        <div><strong>Líquido Asaas:</strong> ${log.net_amount ? 'R$ ' + log.net_amount : '-'}</div>
        <div><strong>Método:</strong> ${log.payment_method || '-'}</div>
        <div><strong>Status:</strong> ${log.payment_status || '-'}</div>
      </div>
    </div>

    <div style="border: 1px solid var(--border); border-radius: 6px; overflow: hidden;">
      <div style="background: rgba(255,255,255,0.02); padding: 8px 12px; border-bottom: 1px solid var(--border); font-weight: 600;">Repasse (Split)</div>
      <div style="padding: 12px;">
        ${splitHtml}
      </div>
    </div>
    
    <div style="border: 1px solid var(--border); border-radius: 6px; overflow: hidden;">
      <div style="background: rgba(255,255,255,0.02); padding: 8px 12px; border-bottom: 1px solid var(--border); font-weight: 600; display: flex; justify-content: space-between;">
        <span>Payload Técnico (Debug)</span>
      </div>
      <div style="padding: 12px; background: #000; overflow-x: auto;">
        <pre style="margin: 0; font-family: monospace; font-size: 10px; color: #10B981;">${jsonStr(log.response_payload || log.request_payload)}</pre>
      </div>
    </div>
  `;
};

window.closeFinDrawer = function() {
  document.getElementById('drawer-fin-panel').style.right = '-500px';
  setTimeout(() => {
    document.getElementById('drawer-fin-overlay').style.display = 'none';
  }, 300);
};

// Hook into filters
document.getElementById('fin-filter-status')?.addEventListener('change', window.renderFinancialLogs);
document.getElementById('search-fin-logs')?.addEventListener('input', window.renderFinancialLogs);

// Intercept module change to refresh logs if needed
document.querySelectorAll('.sidebar-menu a').forEach(el => {
  el.addEventListener('click', (e) => {
    if(e.currentTarget.dataset.target === 'module-fin-logs') {
      window.loadFinancialLogs();
    }
  });
});
