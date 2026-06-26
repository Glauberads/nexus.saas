// ─── SEGURANÇA: Helper para prevenir XSS ─────────────────────────────────────
// SEMPRE usar esta função ao renderizar dados vindos do banco via innerHTML.
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}
function safeJsonDisplay(obj, maxLength = 200) {
  if (!obj) return '-';
  try {
    const str = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
    const truncated = str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
    return escapeHtml(truncated);
  } catch { return '[Erro ao exibir]'; }
}
/**
 * admin-app.js
 * Lida com o roteamento interno (SPA), proteÃ§Ã£o de autenticaÃ§Ã£o e renderizaÃ§Ã£o de dados reais do Supabase.
 */

let supabaseClient = null;
let currentModule = 'module-dashboard';
let trafficChartInstance = null;
let tempChartInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. AUTH GUARD
  await verifyAuth();

  // 2. INITIALIZE SPA ROUTER & UI
  initUI();
  
  // 3. LOAD DATA
  if (supabaseClient) {
    loadModuleData(currentModule);
    setupRealtime();
    
    // Filter listener
    const dateFilter = document.getElementById('global-date-filter');
    if (dateFilter) {
      dateFilter.addEventListener('change', () => {
        loadModuleData(currentModule);
      });
    }
  }
});

// ==========================================
// 1. AUTH GUARD
// ==========================================
async function verifyAuth() {
  if (window.supabase && window.NexusTracker && window.NexusTracker.config) {
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.NexusTracker.config;
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  if (!supabaseClient) {
    console.error("Supabase client could not be initialized.");
    window.location.href = 'admin-login.html';
    return;
  }
  
  const { data: { session } } = await supabaseClient.auth.getSession();
  
  // Verifica se nÃ£o hÃ¡ sessÃ£o ou se o e-mail nÃ£o Ã© o autorizado
  if (!session || session.user.email !== 'suporteglauberr@gmail.com') {
    if (session) {
      await supabaseClient.auth.signOut(); // forÃ§ar logout se logou com conta errada
    }
    window.location.href = 'admin-login.html';
    return;
  }
  
  // Update UI
  const profileName = document.getElementById('user-profile-name');
  if (profileName) profileName.textContent = 'Glauber';
  
  // Setup Logout
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async (e) => {
      e.preventDefault();
      await supabaseClient.auth.signOut();
      window.location.href = 'admin-login.html';
    });
  }
}

// ==========================================
// 2. UI & ROUTER (SPA)
// ==========================================
function initUI() {
  const mobileBtn = document.getElementById('mobile-menu-btn');
  const closeBtn = document.getElementById('mobile-close-btn');
  const sidebar = document.getElementById('sidebar');
  
  if (mobileBtn && sidebar) mobileBtn.addEventListener('click', () => sidebar.classList.add('active'));
  if (closeBtn && sidebar) closeBtn.addEventListener('click', () => sidebar.classList.remove('active'));

  const links = document.querySelectorAll('.sidebar-menu a[data-target]');
  const sections = document.querySelectorAll('.module-section');
  
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      
      links.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      
      sections.forEach(sec => sec.classList.remove('active'));
      
      currentModule = link.getAttribute('data-target');
      const targetSec = document.getElementById(currentModule);
      if (targetSec) targetSec.classList.add('active');
      
      if (window.innerWidth <= 768 && sidebar) sidebar.classList.remove('active');
      
      loadModuleData(currentModule);
    });
  });

  // Drawer
  const drawerCloseBtn = document.getElementById('drawer-close');
  const drawerOverlay = document.getElementById('drawer-overlay');
  
  if (drawerCloseBtn && drawerOverlay) {
    drawerCloseBtn.addEventListener('click', () => drawerOverlay.classList.remove('active'));
    drawerOverlay.addEventListener('click', (e) => {
      if (e.target === drawerOverlay) drawerOverlay.classList.remove('active');
    });
  }
}

// ==========================================
// DATE FILTER
// ==========================================
function getFilterDate() {
  const filter = document.getElementById('global-date-filter');
  const val = filter ? filter.value : 'tudo';
  
  if (val === 'tudo') return null;
  
  const d = new Date();
  if (val === 'hoje') {
    d.setHours(0,0,0,0);
  } else if (val === '7d') {
    d.setDate(d.getDate() - 7);
  } else if (val === '30d') {
    d.setDate(d.getDate() - 30);
  }
  return d.toISOString();
}

function applyDateFilter(query) {
  const d = getFilterDate();
  if (d) {
    return query.gte('created_at', d);
  }
  return query;
}

// --- MASKS LGPD ---
window.maskCpf = function(doc) {
  if (!doc) return '-';
  const d = doc.replace(/\D/g, '');
  if (d.length === 11) return `***.***.***-${d.slice(-2)}`;
  if (d.length === 14) return `**.***.***/****-${d.slice(-2)}`;
  return '***';
};
window.maskPhone = function(p) {
  if (!p) return '-';
  const d = p.replace(/\D/g, '');
  if (d.length >= 10) return `(${d.slice(0,2)}) ****-${d.slice(-4)}`;
  return '****';
};
window.maskEmail = function(e) {
  if (!e || !e.includes('@')) return '-';
  const parts = e.split('@');
  return `${parts[0].slice(0,3)}***@${parts[1]}`;
};

// ==========================================
// 3. DATA LOADING & RENDER
// ==========================================
async function loadModuleData(moduleId) {
  if (!supabaseClient) return;
  
  if (moduleId === 'module-dashboard') await loadDashboard();
  else if (moduleId === 'module-analytics') await loadAnalyticsModule();
  else if (moduleId === 'module-leads') await loadLeadsModule();
  else if (moduleId === 'module-funnel') await loadFunnelModule();
  else if (moduleId === 'module-events') await loadEventsModule();
  else if (moduleId === 'module-webhooks') await loadWebhooksModule();
  else if (moduleId === 'module-general-logs') await loadGeneralLogsModule();
  else if (moduleId === 'module-automations') await loadAutomationsModule();
  else if (moduleId === 'module-whatsapp-crm') await loadWhatsappCrmModule();
  else if (moduleId === 'module-ads') await loadAdsModule();
  else if (moduleId === 'module-gateways') await loadGatewaysModule();
  else if (moduleId === 'module-products') await loadProductsModule();
  else if (moduleId === 'module-members') await loadMembersModule();
  else if (moduleId === 'module-sre') await loadSreModule();
}

// --- DASHBOARD ---
async function loadDashboard() {
  try {
    // 1. Visitantes (Distinct Sessions)
    let qSessions = supabaseClient.from('sessions').select('session_id, utm_source');
    qSessions = applyDateFilter(qSessions);
    const { data: sessions } = await qSessions;
    
    const uniqueSessions = new Set((sessions || []).map(s => s.session_id));
    document.getElementById('kpi-visitors').textContent = uniqueSessions.size;

    // 2. Leads (Count)
    let qLeads = supabaseClient.from('leads').select('*');
    qLeads = applyDateFilter(qLeads);
    const { data: leads } = await qLeads;
    
    document.getElementById('kpi-leads').textContent = (leads || []).length;

    // 3. Leads Quentes
    const hotLeads = (leads || []).filter(l => l.lead_score >= 51 || ['quente', 'muito_quente'].includes(l.lead_tier));
    document.getElementById('kpi-hot').textContent = hotLeads.length;

    // 4. Receita & ROAS
    let qPurch = supabaseClient.from('purchases').select('amount');
    qPurch = applyDateFilter(qPurch);
    const { data: purchases } = await qPurch;
    
    let qAds = supabaseClient.from('ad_metrics').select('spend');
    qAds = applyDateFilter(qAds);
    const { data: adMetrics } = await qAds;

    const receita = (purchases || []).reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);
    const spend = (adMetrics || []).reduce((acc, a) => acc + (parseFloat(a.spend) || 0), 0);
    
    const globalRoas = spend > 0 ? (receita / spend) : 0;

    const roasEl = document.getElementById('kpi-roas');
    if (roasEl) {
      if (spend > 0) {
         roasEl.textContent = `${globalRoas.toFixed(2)}x`;
      } else {
         roasEl.textContent = `R$ ${receita.toLocaleString('pt-BR')}`;
      }
    }
    
    // WIDGET: Leads Quentes Agora
    const tbody = document.getElementById('hot-leads-tbody');
    if (tbody) {
      tbody.innerHTML = '';
      const topLeads = hotLeads.sort((a,b) => b.lead_score - a.lead_score).slice(0, 10);
      
      if (topLeads.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Nenhum lead quente encontrado neste perÃ­odo.</td></tr>';
      } else {
        topLeads.forEach(l => {
          const tr = document.createElement('tr');
          const badgeClass = escapeHtml(l.lead_tier ? l.lead_tier.toLowerCase().replace(' ', '-') : 'frio');
          tr.innerHTML = `
            <td>${escapeHtml(l.name || 'Desconhecido')}</td>
            <td>${escapeHtml(window.maskEmail(l.email))} <br> <span style="font-size:10px;color:var(--text-muted)">${escapeHtml(window.maskPhone(l.whatsapp))}</span></td>
            <td>${escapeHtml(l.utm_source || 'direto')}</td>
            <td><strong>${escapeHtml(String(l.lead_score || 0))}</strong></td>
            <td><span class="badge ${badgeClass}">${escapeHtml(l.lead_tier || '-')}</span></td>
            <td class="clickable" onclick="openLeadDrawer('${escapeHtml(l.id)}')">Ver &rarr;</td>
          `;
          tbody.appendChild(tr);
        });
      }
    }

    // WIDGET: GrÃ¡ficos Chart.js
    renderCharts(sessions, leads);

  } catch (err) {
    console.error("Erro ao carregar Dashboard:", err);
  }
}

function renderCharts(sessions, leads) {
  // TrÃ¡fego
  const sourceCount = {};
  (sessions || []).forEach(s => {
    const src = s.utm_source || 'Direto / Sem UTM';
    sourceCount[src] = (sourceCount[src] || 0) + 1;
  });
  
  const ctxTraffic = document.getElementById('trafficChart');
  if (ctxTraffic) {
    if (trafficChartInstance) trafficChartInstance.destroy();
    trafficChartInstance = new Chart(ctxTraffic, {
      type: 'bar',
      data: {
        labels: Object.keys(sourceCount),
        datasets: [{
          label: 'SessÃµes',
          data: Object.values(sourceCount),
          backgroundColor: '#FF6B00',
          borderRadius: 4
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { grid: { display: false } } }, plugins: { legend: { display: false } } }
    });
  }

  // Temperatura
  let frio=0, morno=0, quente=0;
  (leads || []).forEach(l => {
    if (l.lead_tier === 'frio' || l.lead_score <= 25) frio++;
    else if (l.lead_tier === 'morno' || (l.lead_score > 25 && l.lead_score <= 50)) morno++;
    else quente++;
  });
  
  const ctxTemp = document.getElementById('temperatureChart');
  if (ctxTemp) {
    if (tempChartInstance) tempChartInstance.destroy();
    tempChartInstance = new Chart(ctxTemp, {
      type: 'doughnut',
      data: {
        labels: ['Frio', 'Morno', 'Quente+'],
        datasets: [{
          data: [frio, morno, quente],
          backgroundColor: ['#3b82f6', '#f59e0b', '#ef4444'],
          borderWidth: 0
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { position: 'right', labels: { color: '#a1a1aa', font: { size: 11 } } } } }
    });
  }
}

// --- LEADS ---
async function loadLeadsModule() {
  let query = supabaseClient.from('leads').select('*').order('created_at', { ascending: false });
  query = applyDateFilter(query);
  const { data: leads } = await query;
  
  const tbody = document.getElementById('all-leads-tbody');
  if (tbody) {
    tbody.innerHTML = '';
    if (!leads || leads.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Nenhum lead encontrado neste perÃ­odo.</td></tr>';
      return;
    }
    
    leads.forEach(l => {
      const tr = document.createElement('tr');
      const badgeClass = escapeHtml(l.lead_tier ? l.lead_tier.toLowerCase().replace(' ', '-') : 'frio');
      tr.innerHTML = `
        <td>${escapeHtml(l.name || '-')}</td>
        <td>${escapeHtml(window.maskEmail(l.email))}</td>
        <td>${escapeHtml(window.maskPhone(l.whatsapp))}</td>
        <td><span class="badge ${badgeClass}">${escapeHtml(l.lead_tier || 'Frio')}</span></td>
        <td>${escapeHtml(new Date(l.created_at).toLocaleDateString('pt-BR'))}</td>
        <td class="clickable" onclick="openLeadDrawer('${escapeHtml(l.id)}')">Ver &rarr;</td>
      `;
      tbody.appendChild(tr);
    });
  }
}

// --- FUNNEL ---
async function loadFunnelModule() {
  let query = supabaseClient.from('events').select('session_id, event_name');
  query = applyDateFilter(query);
  const { data: events } = await query;
  
  if (!events) return;
  
  const funnel = {
    ViewContent: new Set(),
    Lead: new Set(),
    QualifiedLead: new Set(),
    ReadyToBuy: new Set(),
    InitiateCheckout: new Set(),
    Purchase: new Set(),
    UpsellAccept: new Set()
  };
  
  events.forEach(e => {
    if (funnel[e.event_name]) {
      funnel[e.event_name].add(e.session_id);
    }
  });
  
  const container = document.getElementById('funnel-metrics');
  if (container) {
    const vc = funnel.ViewContent.size;
    const leads = funnel.Lead.size;
    const pur = funnel.Purchase.size;
    
    document.getElementById('funnel-purchase').textContent = pur;
    
    container.innerHTML = `
      <strong>ConversÃ£o Global:</strong> ${vc > 0 ? ((pur/vc)*100).toFixed(2) : 0}%<br/>
      <strong>View â†’ Lead:</strong> ${vc > 0 ? ((leads/vc)*100).toFixed(2) : 0}%<br/>
      <strong>Lead â†’ Purchase:</strong> ${leads > 0 ? ((pur/leads)*100).toFixed(2) : 0}%<br/>
      <br/>
      (VisualizaÃ§Ã£o detalhada em breve)
    `;
  }
}

// --- EVENTS (FEED) ---
async function loadEventsModule() {
  let query = supabaseClient.from('events').select('*').order('created_at', { ascending: false }).limit(50);
  query = applyDateFilter(query);
  
  const { data: events } = await query;
  renderEventsFeed(events || []);
}

function renderEventsFeed(events) {
  const tbody = document.getElementById('realtime-feed');
  if (!tbody) return;
  
  if (events.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">Nenhum evento no perÃ­odo.</td></tr>';
    return;
  }
  
  tbody.innerHTML = '';
  events.forEach(evt => prependEventToFeed(evt, tbody));
}

function prependEventToFeed(evt, tbody) {
  const timeStr = new Date(evt.created_at).toLocaleTimeString('pt-BR');
  const payloadStr = evt.metadata ? JSON.stringify(evt.metadata).substring(0, 50) + '...' : '-';
  
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${timeStr}</td>
    <td><span class="badge" style="background: var(--bg-main); border: 1px solid var(--border);">${evt.event_name}</span></td>
    <td><span style="font-size: 11px; font-family: monospace; color: var(--text-muted);">${evt.session_id ? evt.session_id.substring(0,8) : 'N/A'}</span></td>
    <td style="font-size: 12px; color: var(--text-secondary);">${payloadStr}</td>
  `;
  tbody.prepend(tr);
  
  // AnimaÃ§Ã£o de entrada se for novo
  tr.animate([
    { backgroundColor: 'rgba(255, 107, 0, 0.2)' },
    { backgroundColor: 'transparent' }
  ], { duration: 2000 });
}


// ==========================================
// 4. DRAWER (LEAD DETAIL)
// ==========================================
async function openLeadDrawer(leadOrId) {
  const overlay = document.getElementById('drawer-overlay');
  overlay.classList.add('active');
  
  document.getElementById('drawer-name').textContent = "Carregando...";
  document.getElementById('drawer-email').textContent = "";
  document.getElementById('drawer-timeline').innerHTML = "";

  const leadId = typeof leadOrId === 'object' ? leadOrId.id : leadOrId;
  
  const { data: lead } = await supabaseClient.from('leads').select('*').eq('id', leadId).single();
  if (!lead) return;

  document.getElementById('drawer-name').textContent = lead.name || 'Lead AnÃ´nimo';
  document.getElementById('drawer-email').textContent = `${lead.email || ''} | ${lead.whatsapp || ''}`;
  
  // Buscar MÃºltiplas Fontes (Super Timeline)
  const [{ data: events }, { data: journey }, { data: msgs }, { data: purchases }] = await Promise.all([
    supabaseClient.from('events').select('*').eq('lead_id', leadId),
    supabaseClient.from('lead_journey').select('*').eq('lead_id', leadId),
    supabaseClient.from('crm_messages').select('*').eq('lead_id', leadId),
    supabaseClient.from('purchases').select('*').eq('lead_id', leadId)
  ]);

  let timeline = [];
  
  if (events) events.forEach(e => timeline.push({ time: new Date(e.created_at), type: 'Event', title: e.event_name, detail: JSON.stringify(e.payload), icon: 'âš¡', color: 'var(--text-muted)' }));
  if (journey) journey.forEach(j => timeline.push({ time: new Date(j.created_at), type: 'Journey', title: j.action_type, detail: JSON.stringify(j.action_details), icon: 'ðŸ“', color: 'var(--accent)' }));
  if (msgs) msgs.forEach(m => timeline.push({ time: new Date(m.created_at), type: 'WhatsApp', title: m.direction === 'inbound' ? 'Resposta Recebida' : 'Msg Enviada', detail: m.message || m.automation_name, icon: 'ðŸ’¬', color: m.direction === 'inbound' ? 'var(--success)' : '#25D366' }));
  if (purchases) purchases.forEach(p => timeline.push({ time: new Date(p.created_at), type: 'Purchase', title: 'Compra Aprovada', detail: `Valor: ${p.amount} (${p.payment_method})`, icon: 'ðŸ’°', color: '#10b981' }));

  // Ordenar cronologicamente
  timeline.sort((a, b) => a.time - b.time);

  const timelineContainer = document.getElementById('drawer-timeline');
  timelineContainer.innerHTML = '';
  
  if (timeline.length > 0) {
    timeline.forEach(item => {
      const timeStr = item.time.toLocaleString('pt-BR');
      const div = document.createElement('div');
      div.className = 'timeline-item';
      div.innerHTML = `
        <div class="timeline-time" style="font-size: 10px; color: var(--text-muted); margin-bottom: 2px;">${timeStr}</div>
        <div class="timeline-event" style="color: ${item.color}; font-weight: 600; display: flex; align-items: center; gap: 6px;">
          <span>${item.icon}</span> ${item.title}
        </div>
        <div class="timeline-desc" style="font-size: 11px; margin-top: 4px; padding: 6px; background: rgba(255,255,255,0.03); border-radius: 4px; word-break: break-all;">
          ${item.detail}
        </div>
      `;
      timelineContainer.appendChild(div);
    });
  } else {
    timelineContainer.innerHTML = '<div class="timeline-item"><div class="timeline-desc">Nenhuma aÃ§Ã£o registrada alÃ©m da criaÃ§Ã£o.</div></div>';
  }
}

// ==========================================
// 5. WEBHOOKS MODULE
// ==========================================
async function loadWebhooksModule() {
  let query = supabaseClient.from('webhook_logs').select('*').order('created_at', { ascending: false }).limit(100);
  query = applyDateFilter(query);
  
  const { data: logs } = await query;
  
  if (!logs) return;
  
  const total = logs.length;
  const approved = logs.filter(l => ['purchase.approved', 'paid', 'approved', 'compra_aprovada'].includes(l.event_type)).length;
  const pending = logs.filter(l => ['billet_printed', 'boleto_gerado', 'pix_generated', 'pix_gerado'].includes(l.event_type)).length;
  const abandoned = logs.filter(l => ['cart_abandoned', 'checkout_abandoned', 'abandoned_cart'].includes(l.event_type)).length;
  
  document.getElementById('wh-total').textContent = total;
  document.getElementById('wh-approved').textContent = approved;
  document.getElementById('wh-pending').textContent = pending;
  document.getElementById('wh-abandoned').textContent = abandoned;
  
  const tbody = document.getElementById('webhook-logs-tbody');
  if (tbody) {
    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Nenhum webhook recebido ainda.<br/>Configure a URL na sua plataforma de checkout.</td></tr>';
      return;
    }
    
    tbody.innerHTML = '';
    logs.forEach(log => prependWebhookLogToFeed(log, tbody, false));
  }
}

function prependWebhookLogToFeed(log, tbody, animate=true) {
  const timeStr = new Date(log.created_at).toLocaleString('pt-BR');
  const amountStr = Number(log.amount) > 0 ? `R$ ${Number(log.amount).toFixed(2)}` : '-';
  const buyerStr = log.buyer_name || log.buyer_email || 'Desconhecido';
  
  const statusBadge = log.response_status === 200 
    ? `<span class="badge success">200 OK</span>` 
    : `<span class="badge" style="background: var(--danger-bg); color: var(--danger);">${log.response_status} Falha</span>`;
    
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${timeStr}</td>
    <td><span class="badge" style="background: rgba(255,255,255,0.1); color: var(--text-primary);">${log.platform || 'API'}</span></td>
    <td><span style="font-weight: 600; color: var(--accent);">${log.event_type}</span></td>
    <td>${amountStr}</td>
    <td>${buyerStr}</td>
    <td>${statusBadge}</td>
  `;
  tbody.prepend(tr);
  
  if (animate) {
    tr.animate([
      { backgroundColor: 'rgba(255, 107, 0, 0.2)' },
      { backgroundColor: 'transparent' }
    ], { duration: 2000 });
  }
}

function copyWebhookUrl() {
  const url = document.getElementById('webhook-url').innerText.trim();
  navigator.clipboard.writeText(url);
  showToast("URL copiada com sucesso.");
}

async function testWebhook() {
  const url = document.getElementById('webhook-url').innerText.trim();
  const timestamp = Date.now();
  const payload = {
    event: "purchase.approved",
    product: "NexusSaaS",
    amount: 497,
    currency: "BRL",
    is_test: true,
    environment: "test",
    buyer: {
      name: "Lead Teste",
      email: "teste@nexussaas.com",
      phone: "11999999999"
    },
    transaction_id: "test_" + timestamp
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (res.ok) {
      showToast("Webhook testado com sucesso.");
      if (currentModule === 'module-webhooks') loadWebhooksModule();
    } else {
      const data = await res.json();
      showToast("Falha no Webhook: " + (data.error || res.status), true);
    }
  } catch (e) {
    showToast("Erro ao contatar Edge Function.", true);
  }
}

function showToast(msg, isError=false) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.style.background = isError ? 'var(--danger-bg)' : 'var(--success-bg)';
  toast.style.color = isError ? 'var(--danger)' : 'var(--success)';
  toast.style.border = `1px solid ${isError ? 'var(--danger)' : 'var(--success)'}`;
  toast.style.padding = '12px 24px';
  toast.style.borderRadius = 'var(--radius-sm)';
  toast.style.fontSize = '14px';
  toast.style.fontWeight = '600';
  toast.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.3)';
  toast.innerText = msg;
  
  container.appendChild(toast);
  
  toast.animate([
    { opacity: 0, transform: 'translateY(20px)' },
    { opacity: 1, transform: 'translateY(0)' }
  ], { duration: 300 });
  
  setTimeout(() => {
    toast.animate([
      { opacity: 1, transform: 'translateY(0)' },
      { opacity: 0, transform: 'translateY(20px)' }
    ], { duration: 300 }).onfinish = () => toast.remove();
  }, 4000);
}

// ==========================================
// 6. REALTIME FEED
// ==========================================
window.copyWebhookUrl = copyWebhookUrl;
window.testWebhook = testWebhook;

function setupRealtime() {
  if (!supabaseClient) return;
  
  supabaseClient.channel('public:events')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, payload => {
      
      // Update Event Feed if active
      if (currentModule === 'module-events') {
        const tbody = document.getElementById('realtime-feed');
        if (tbody) prependEventToFeed(payload.new, tbody);
      }
      
      // Recarrega Dashboard se for evento crucial e estiver no dash
      const eventName = payload.new.event_name;
      if (['Purchase', 'Lead', 'QualifiedLead', 'CheckoutAbandoned'].includes(eventName) && currentModule === 'module-dashboard') {
        loadDashboard();
      }
      
      if (currentModule === 'module-general-logs') {
        loadGeneralLogsModule();
      }
    })
    .subscribe();
    
  supabaseClient.channel('public:webhook_logs')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'webhook_logs' }, payload => {
      if (currentModule === 'module-webhooks') {
        const tbody = document.getElementById('webhook-logs-tbody');
        if (tbody) {
          if (tbody.innerHTML.includes('Aguardando eventos') || tbody.innerHTML.includes('Nenhum webhook recebido')) {
             tbody.innerHTML = '';
          }
          prependWebhookLogToFeed(payload.new, tbody, true);
        }
      }
      
      if (currentModule === 'module-general-logs') {
        loadGeneralLogsModule();
      }
    })
    .subscribe();

  // Escuta tabelas exclusivas do General Logs
  supabaseClient.channel('public:general_logs_extras')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'purchases' }, () => {
      if (currentModule === 'module-general-logs') loadGeneralLogsModule();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leads' }, () => {
      if (currentModule === 'module-general-logs') loadGeneralLogsModule();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lead_journey' }, () => {
      if (currentModule === 'module-general-logs') loadGeneralLogsModule();
    })
    .subscribe();

  supabaseClient.channel('public:automation_logs')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'automation_logs' }, payload => {
      if (currentModule === 'module-automations') {
        const tbody = document.getElementById('automations-tbody');
        if (tbody) {
          if (tbody.innerHTML.includes('Nenhuma automaÃ§Ã£o') || tbody.innerHTML.includes('Carregando')) {
             tbody.innerHTML = '';
          }
          prependAutomationLog(payload.new, tbody, true);
          
          // Increment KPIs
          const kpiToday = document.getElementById('kpi-automations-today');
          if (kpiToday) kpiToday.textContent = parseInt(kpiToday.textContent || '0') + 1;
          
          if (payload.new.status === 'failed') {
            const kpiFail = document.getElementById('kpi-automations-failures');
            if (kpiFail) kpiFail.textContent = parseInt(kpiFail.textContent || '0') + 1;
          }
          
          if (payload.new.automation_name === 'checkout_recovery' && payload.new.status === 'success') {
            const kpiLeads = document.getElementById('kpi-automations-leads');
            const kpiSales = document.getElementById('kpi-automations-sales');
            const newLeads = parseInt(kpiLeads.textContent || '0') + 1;
            if (kpiLeads) kpiLeads.textContent = newLeads;
            if (kpiSales) kpiSales.textContent = `R$ ${(newLeads * 497).toLocaleString('pt-BR')}`;
          }
        }
      }
    })
    .subscribe();

  // CRM Messages Listener
  supabaseClient.channel('public:crm_messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crm_messages' }, () => {
      if (currentModule === 'module-whatsapp-crm') loadWhatsappCrmModule();
    })
    .subscribe();

  // Notifications Listener
  supabaseClient.channel('public:notifications')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => {
      loadNotifications();
      // Animate Bell
      const bell = document.querySelector('.notification-center span:first-child');
      if (bell) {
        bell.style.transition = '0.2s';
        bell.style.transform = 'scale(1.3) rotate(15deg)';
        setTimeout(() => { bell.style.transform = 'scale(1) rotate(0deg)'; }, 200);
      }
    })
    .subscribe();
}

// ==========================================
// 7. EXPORT CSV
// ==========================================
window.exportLeadsToCSV = async function() {
  if (!supabaseClient) return;

  try {
    showToast("Preparando exportaÃ§Ã£o...");
    
    // Puxa todos os leads respeitando o filtro de data atual
    let query = supabaseClient.from('leads').select('*').order('created_at', { ascending: false });
    query = applyDateFilter(query);
    
    const { data: leads, error } = await query;
    
    if (error) throw error;
    if (!leads || leads.length === 0) {
      showToast("Nenhum lead encontrado para exportar.", true);
      return;
    }
    
    // CabeÃ§alhos do CSV
    const headers = ['Nome', 'Email', 'WhatsApp', 'Origem', 'Campanha', 'Score', 'Temperatura', 'Status', 'Data de CriaÃ§Ã£o'];
    
    // Converte os dados
    const csvRows = [];
    csvRows.push(headers.join(',')); // Adiciona cabeÃ§alhos
    
    leads.forEach(l => {
      const row = [
        `"${l.name || ''}"`,
        `"${l.email || ''}"`,
        `"${l.whatsapp || ''}"`,
        `"${l.utm_source || ''}"`,
        `"${l.utm_campaign || ''}"`,
        l.lead_score || 0,
        `"${l.lead_tier || 'frio'}"`,
        `"${l.lead_status || 'new'}"`,
        `"${new Date(l.created_at).toLocaleString('pt-BR')}"`
      ];
      csvRows.push(row.join(','));
    });
    
    // Gera o Blob e o Link de Download
    const csvString = csvRows.join('\n');
    const blob = new Blob(["\uFEFF" + csvString], { type: 'text/csv;charset=utf-8;' }); // \uFEFF para suportar UTF-8 Excel
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    const d = new Date();
    const dateStr = `${d.getFullYear()}_${(d.getMonth()+1).toString().padStart(2, '0')}_${d.getDate().toString().padStart(2, '0')}`;
    
    link.setAttribute("href", url);
    link.setAttribute("download", `nexus_leads_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast("ExportaÃ§Ã£o concluÃ­da com sucesso!");
    
  } catch (err) {
    console.error("Erro ao exportar:", err);
    showToast("Erro ao gerar CSV.", true);
  }
};

// ==========================================
// 8. GENERAL LOGS (BATCAVE)
// ==========================================
let generalLogsOffset = 0;
const GENERAL_LOGS_LIMIT = 100;
let generalLogsActiveFilter = 'all';

async function loadGeneralLogsModule(isLoadMore = false) {
  if (!supabaseClient) return;

  if (!isLoadMore) {
    generalLogsOffset = 0;
    const tbody = document.getElementById('general-logs-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Carregando logs do sistema...</td></tr>';
  }

  try {
    // Busca em paralelo
    const [resEvents, resWebhooks, resJourney, resPurchases, resLeads] = await Promise.all([
      supabaseClient.from('events').select('*').order('created_at', { ascending: false }).limit(GENERAL_LOGS_LIMIT),
      supabaseClient.from('webhook_logs').select('*').order('created_at', { ascending: false }).limit(GENERAL_LOGS_LIMIT),
      supabaseClient.from('lead_journey').select('*').order('created_at', { ascending: false }).limit(GENERAL_LOGS_LIMIT),
      supabaseClient.from('purchases').select('*').order('created_at', { ascending: false }).limit(GENERAL_LOGS_LIMIT),
      supabaseClient.from('leads').select('*').order('created_at', { ascending: false }).limit(GENERAL_LOGS_LIMIT)
    ]);

    let unifiedLogs = [];

    // NormalizaÃ§Ã£o: events
    (resEvents.data || []).forEach(e => {
      unifiedLogs.push({
        id: e.id, time: e.created_at, origin: 'Frontend', originClass: 'src-frontend', type: 'Event: ' + e.event_name, category: 'frontend',
        desc: `SessÃ£o: ${e.session_id ? e.session_id.substring(0,8) : 'N/A'} | Page: ${e.url || '-'}`,
        status: '200 OK', json: e.params || {}
      });
    });

    // NormalizaÃ§Ã£o: webhook_logs
    (resWebhooks.data || []).forEach(w => {
      const isErr = w.response_status !== 200;
      unifiedLogs.push({
        id: w.id, time: w.created_at, origin: w.platform || 'Webhook', originClass: 'src-webhook', type: w.event_type, category: isErr ? 'error' : 'webhook',
        desc: `Valor: R$${w.amount || 0} | Comprador: ${w.buyer_name || w.buyer_email || 'N/A'}`,
        status: isErr ? `ERR ${w.response_status}` : '200 OK', json: w.raw_payload || {}
      });
    });

    // NormalizaÃ§Ã£o: lead_journey
    (resJourney.data || []).forEach(j => {
      unifiedLogs.push({
        id: j.id, time: j.created_at, origin: 'Database', originClass: 'src-db', type: 'Journey: ' + j.action_type, category: 'lead',
        desc: `Lead: ${j.email || 'N/A'}`,
        status: 'Registrado', json: j.action_details || {}
      });
    });

    // NormalizaÃ§Ã£o: purchases
    (resPurchases.data || []).forEach(p => {
      unifiedLogs.push({
        id: p.id, time: p.created_at, origin: 'Backend', originClass: 'src-db', type: 'Purchase Insert', category: 'purchase',
        desc: `Order: ${p.order_id || 'N/A'} | Email: ${p.email || 'N/A'}`,
        status: p.status || 'OK', json: p
      });
    });

    // NormalizaÃ§Ã£o: leads
    (resLeads.data || []).forEach(l => {
      unifiedLogs.push({
        id: l.id, time: l.created_at, origin: 'CRM', originClass: 'src-db', type: 'New Lead', category: 'lead',
        desc: `Nome: ${l.name || '-'} | Email: ${l.email || '-'} | Tier: ${l.lead_tier || 'frio'}`,
        status: 'Criado', json: l
      });
    });

    // OrdenaÃ§Ã£o global
    unifiedLogs.sort((a, b) => new Date(b.time) - new Date(a.time));

    renderGeneralLogs(unifiedLogs, isLoadMore);

  } catch (err) {
    console.error("Erro ao carregar logs gerais:", err);
  }
}

function renderGeneralLogs(logs, append = false) {
  const tbody = document.getElementById('general-logs-tbody');
  if (!tbody) return;

  if (!append) tbody.innerHTML = '';

  let filteredLogs = logs;
  if (generalLogsActiveFilter !== 'all') {
    filteredLogs = logs.filter(l => l.category === generalLogsActiveFilter || (generalLogsActiveFilter === 'error' && String(l.status).includes('ERR')));
  }

  if (filteredLogs.length === 0 && !append) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Nenhum log encontrado.</td></tr>';
    return;
  }

  filteredLogs.forEach(log => {
    const timeStr = new Date(log.time).toLocaleString('pt-BR');
    const tr = document.createElement('tr');
    tr.className = 'log-row';
    
    let statusHtml = `<span style="color: var(--text-muted); font-size: 12px;">${log.status}</span>`;
    if (String(log.status).includes('ERR')) statusHtml = `<span style="color: var(--danger); font-size: 12px; font-weight: 600;">${log.status}</span>`;
    else if (String(log.status).includes('200')) statusHtml = `<span style="color: var(--success); font-size: 12px; font-weight: 600;">${log.status}</span>`;

    const jsonId = 'json-' + Math.random().toString(36).substr(2, 9);

    tr.innerHTML = `
      <td class="log-time">${timeStr}</td>
      <td><span class="log-src ${log.originClass}">${log.origin}</span></td>
      <td class="log-type">${log.type}</td>
      <td>
        <div class="log-desc">${log.desc}</div>
        <button class="btn-json" onclick="document.getElementById('${jsonId}').classList.toggle('visible')">Ver Payload JSON</button>
        <div id="${jsonId}" class="log-json">${JSON.stringify(log.json, null, 2)}</div>
      </td>
      <td>${statusHtml}</td>
    `;
    tbody.appendChild(tr);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // Configurar Filtros
  const filters = document.querySelectorAll('#module-general-logs .btn-filter');
  filters.forEach(btn => {
    btn.addEventListener('click', (e) => {
      filters.forEach(f => f.classList.remove('active'));
      e.target.classList.add('active');
      generalLogsActiveFilter = e.target.getAttribute('data-filter');
      // Recarrega do zero ao mudar filtro
      loadGeneralLogsModule();
    });
  });

  // Configurar BotÃ£o Load More
  const btnLoadMore = document.getElementById('btn-load-more-logs');
  if (btnLoadMore) {
    btnLoadMore.addEventListener('click', () => {
      generalLogsOffset += GENERAL_LOGS_LIMIT;
      // Nota: numa implementaÃ§Ã£o real, generalLogsOffset entraria no .range(offset, offset + limit)
      // Como o design aprovado pediu "apenas os ultimos 100", o load more estÃ¡ como placeholder visual
      showToast("Carregar histÃ³rico profundo requer paginaÃ§Ã£o avanÃ§ada.");
    });
  }
});

// ==========================================
// 9. AUTOMATIONS (n8n + WhatsApp)
// ==========================================
async function loadAutomationsModule() {
  if (!supabaseClient) return;

  // Carrega configuraÃ§Ãµes salvas de webhooks do n8n
  document.getElementById('input-n8n-hotlead').value = localStorage.getItem('n8n_webhook_hot_lead') || '';
  document.getElementById('input-n8n-recovery').value = localStorage.getItem('n8n_webhook_recovery') || '';
  document.getElementById('input-n8n-purchase').value = localStorage.getItem('n8n_webhook_purchase') || '';

  // Busca histÃ³rico de execuÃ§Ãµes
  let query = supabaseClient.from('automation_logs').select('*').order('created_at', { ascending: false }).limit(50);
  query = applyDateFilter(query);
  const { data: logs, error } = await query;
  
  if (error) {
    console.error("Erro ao carregar automaÃ§Ãµes:", error);
    return;
  }

  // Preenche KPIs
  const todayStart = new Date();
  todayStart.setHours(0,0,0,0);
  const logsToday = logs.filter(l => new Date(l.created_at) >= todayStart);
  
  const leadsRec = logs.filter(l => l.automation_name === 'checkout_recovery' && l.status === 'success').length;
  const vendasRec = leadsRec * 497; // Valor figurativo baseado no produto principal

  document.getElementById('kpi-automations-today').textContent = logsToday.length;
  document.getElementById('kpi-automations-leads').textContent = leadsRec;
  document.getElementById('kpi-automations-sales').textContent = `R$ ${vendasRec.toLocaleString('pt-BR')}`;
  document.getElementById('kpi-automations-failures').textContent = logs.filter(l => l.status === 'failed').length;

  // Preenche Tabela
  const tbody = document.getElementById('automations-tbody');
  if (!tbody) return;

  if (!logs || logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Nenhuma automaÃ§Ã£o disparada ainda.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  logs.forEach(log => prependAutomationLog(log, tbody, false));
}

function prependAutomationLog(log, tbody, animate = true) {
  const timeStr = new Date(log.created_at).toLocaleString('pt-BR');
  
  let statusBadge = '';
  if (log.status === 'success') statusBadge = `<span class="badge success">Enviado</span>`;
  else if (log.status === 'failed') statusBadge = `<span class="badge" style="background: var(--danger-bg); color: var(--danger);">Falha</span>`;
  else statusBadge = `<span class="badge">${log.status}</span>`;

  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${timeStr}</td>
    <td><strong>${log.automation_name}</strong></td>
    <td><span style="font-size: 12px; color: var(--text-muted);">${log.trigger_type}</span></td>
    <td><span style="font-size: 11px; font-family: monospace; color: var(--text-muted);">${log.destination ? log.destination.substring(0,30)+'...' : '-'}</span></td>
    <td>${statusBadge}</td>
  `;
  tbody.prepend(tr);

  if (animate) {
    tr.animate([
      { backgroundColor: 'rgba(16, 185, 129, 0.2)' },
      { backgroundColor: 'transparent' }
    ], { duration: 2000 });
  }
}

window.saveN8nWebhooks = function() {
  const hotLead = document.getElementById('input-n8n-hotlead').value.trim();
  const recovery = document.getElementById('input-n8n-recovery').value.trim();
  const purchase = document.getElementById('input-n8n-purchase').value.trim();

  localStorage.setItem('n8n_webhook_hot_lead', hotLead);
  localStorage.setItem('n8n_webhook_recovery', recovery);
  localStorage.setItem('n8n_webhook_purchase', purchase);

  showToast("URLs de Webhook salvas com sucesso!");
};

window.testAutomation = async function() {
  const type = document.getElementById('test-automation-type').value;
  
  let webhookUrl = '';
  if (type === 'hot_lead') webhookUrl = localStorage.getItem('n8n_webhook_hot_lead');
  if (type === 'checkout_recovery') webhookUrl = localStorage.getItem('n8n_webhook_recovery');
  if (type === 'purchase_onboarding') webhookUrl = localStorage.getItem('n8n_webhook_purchase');

  if (!webhookUrl) {
    showToast("Por favor, configure e salve a URL do Webhook primeiro.", true);
    return;
  }

  showToast("Enviando teste de automaÃ§Ã£o...");

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.NexusTracker.config;

  const payload = {
    automation_type: type,
    n8n_webhook_url: webhookUrl,
    payload: {
      type: type,
      name: "Lead Teste",
      whatsapp: "22999999999",
      score: 91,
      tier: "muito_quente",
      utm_source: "teste_manual",
      utm_campaign: "teste_interno",
      is_test: true
    }
  };

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/automation-dispatcher`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok && data.success) {
      if (data.skipped) showToast("AutomaÃ§Ã£o pulada (PrevenÃ§Ã£o de Duplicidade)");
      else showToast("AutomaÃ§Ã£o disparada com sucesso para o n8n!");
    } else {
      showToast("Falha ao disparar automaÃ§Ã£o: " + (data.error || res.statusText), true);
    }
  } catch (err) {
    console.error("Erro disparando edge function:", err);
    showToast("Erro de rede ao contatar Edge Function.", true);
  }
};

// ==========================================
// 10. WHATSAPP CRM (Kanban & Mensagens)
// ==========================================
let crmLeads = [];
let crmFilter = 'tudo';

async function loadWhatsappCrmModule() {
  if (!supabaseClient) return;

  // Carregar Leads para o Kanban (Ãšltimos 30 dias ou max 200)
  const date30d = new Date();
  date30d.setDate(date30d.getDate() - 30);

  let query = supabaseClient.from('leads')
    .select('*, crm_messages(id, status)')
    .gte('created_at', date30d.toISOString())
    .order('last_activity_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(200);

  const { data: leads, error } = await query;
  if (error) {
    console.error("Erro ao carregar CRM:", error);
    return;
  }

  crmLeads = leads || [];
  
  // Buscar Mensagens para KPIs
  const { data: msgs } = await supabaseClient.from('crm_messages').select('direction, lead_id');
  
  const outbound = msgs ? msgs.filter(m => m.direction === 'outbound').length : 0;
  const inbound = msgs ? msgs.filter(m => m.direction === 'inbound').length : 0;
  const rate = outbound > 0 ? Math.round((inbound / outbound) * 100) : 0;
  const sales = crmLeads.filter(l => l.lead_status === 'purchased').length;

  document.getElementById('kpi-crm-sent').textContent = outbound;
  document.getElementById('kpi-crm-replies').textContent = inbound;
  document.getElementById('kpi-crm-rate').textContent = `${rate}%`;
  document.getElementById('kpi-crm-sales').textContent = sales;

  renderKanban();
  setupKanbanDragAndDrop();
}

window.filterCrm = function(filter, btnElement) {
  document.querySelectorAll('#module-whatsapp-crm .btn-filter').forEach(b => b.classList.remove('active'));
  btnElement.classList.add('active');
  crmFilter = filter;
  renderKanban();
};

function renderKanban() {
  const cols = document.querySelectorAll('.kanban-col');
  cols.forEach(col => {
    const container = col.querySelector('.kanban-cards');
    container.innerHTML = ''; // Limpar coluna
    const badge = col.querySelector('.badge');
    badge.textContent = '0';
  });

  const filtered = crmFilter === 'quentes' 
    ? crmLeads.filter(l => l.lead_tier === 'quente' || l.lead_tier === 'muito_quente')
    : crmLeads;

  filtered.forEach(lead => {
    const status = lead.lead_status || 'new';
    const col = document.querySelector(`.kanban-col[data-status="${status}"]`);
    if (col) {
      const container = col.querySelector('.kanban-cards');
      const card = createKanbanCard(lead);
      container.appendChild(card);
      
      const badge = col.querySelector('.badge');
      badge.textContent = parseInt(badge.textContent) + 1;
    }
  });
}

function createKanbanCard(lead) {
  const card = document.createElement('div');
  card.className = 'kanban-card';
  card.draggable = true;
  card.dataset.id = lead.id;

  const scoreBadge = lead.lead_score > 75 
    ? `<span class="k-score-badge hot">ðŸ”¥ ${lead.lead_score}</span>` 
    : `<span class="k-score-badge">â­ ${lead.lead_score || 0}</span>`;

  card.innerHTML = `
    <div class="k-card-title">
      <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;">${lead.name || 'Lead AnÃ´nimo'}</span>
      ${scoreBadge}
    </div>
    <div class="k-card-sub">${lead.whatsapp || lead.email || 'Sem contato'}</div>
    <div class="k-card-meta">
      <span>${lead.utm_source || 'orgÃ¢nico'}</span>
      <span>${new Date(lead.last_activity_at || lead.created_at).toLocaleDateString('pt-BR')}</span>
    </div>
  `;

  card.addEventListener('click', () => openLeadDrawer(lead));
  return card;
}

// --- Drag and Drop Vanilla JS ---
let draggedCard = null;

function setupKanbanDragAndDrop() {
  const board = document.getElementById('kanban-board');
  
  board.addEventListener('dragstart', e => {
    if (e.target.classList.contains('kanban-card')) {
      draggedCard = e.target;
      setTimeout(() => e.target.classList.add('dragging'), 0);
    }
  });

  board.addEventListener('dragend', e => {
    if (e.target.classList.contains('kanban-card')) {
      e.target.classList.remove('dragging');
      draggedCard = null;
      document.querySelectorAll('.kanban-col').forEach(c => c.classList.remove('drag-over'));
    }
  });

  const cols = document.querySelectorAll('.kanban-col');
  cols.forEach(col => {
    col.addEventListener('dragover', e => {
      e.preventDefault();
      col.classList.add('drag-over');
    });

    col.addEventListener('dragleave', e => {
      col.classList.remove('drag-over');
    });

    col.addEventListener('drop', async e => {
      e.preventDefault();
      col.classList.remove('drag-over');
      
      if (draggedCard) {
        const newStatus = col.dataset.status;
        const leadId = draggedCard.dataset.id;
        const container = col.querySelector('.kanban-cards');
        container.appendChild(draggedCard); // Move visualmente

        // Recalcular Badges visuais
        renderKanbanBadges();

        // Atualizar Banco de Dados
        try {
          const leadData = crmLeads.find(l => l.id === leadId);
          const oldStatus = leadData.lead_status || 'new';
          leadData.lead_status = newStatus;

          if (oldStatus !== newStatus) {
             await supabaseClient.from('leads').update({ lead_status: newStatus }).eq('id', leadId);
             
             // Registrar na Jornada
             await supabaseClient.from('lead_journey').insert([{
               lead_id: leadId,
               action_type: 'crm_status_changed',
               action_details: { from: oldStatus, to: newStatus }
             }]);
          }
        } catch (err) {
          console.error("Erro ao mover lead:", err);
          showToast("Erro ao salvar mudanÃ§a no banco.", true);
        }
      }
    });
  });
}

function renderKanbanBadges() {
  document.querySelectorAll('.kanban-col').forEach(col => {
    const count = col.querySelectorAll('.kanban-card').length;
    col.querySelector('.badge').textContent = count;
  });
}

// ==========================================
// 11. ADS & ROAS (Meta & Google)
// ==========================================
let adsSpendChartInstance = null;
let adsPlatformChartInstance = null;

async function loadAdsModule() {
  if (!supabaseClient) return;

  const dateFilter = getFilterDate();
  
  let qMetrics = supabaseClient.from('ad_metrics').select('*');
  let qPurchases = supabaseClient.from('purchases').select('*');
  let qLeads = supabaseClient.from('leads').select('id, created_at, utm_source');

  if (dateFilter) {
    qMetrics = qMetrics.gte('date', dateFilter);
    qPurchases = qPurchases.gte('created_at', dateFilter);
    qLeads = qLeads.gte('created_at', dateFilter);
  }

  const [{ data: metrics }, { data: purchases }, { data: leads }] = await Promise.all([
    qMetrics, qPurchases, qLeads
  ]);

  if (!metrics) return;

  // KPIs
  const totalSpend = metrics.reduce((acc, m) => acc + (parseFloat(m.spend) || 0), 0);
  const totalClicks = metrics.reduce((acc, m) => acc + (m.clicks || 0), 0);
  const totalImpressions = metrics.reduce((acc, m) => acc + (m.impressions || 0), 0);
  
  const totalRevenue = (purchases || []).reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);
  const totalLeads = leads ? leads.length : 0;
  const totalPurchases = purchases ? purchases.length : 0;

  const roas = totalSpend > 0 ? (totalRevenue / totalSpend) : 0;
  const cpl = totalLeads > 0 ? (totalSpend / totalLeads) : 0;
  const cpa = totalPurchases > 0 ? (totalSpend / totalPurchases) : 0;
  const ctr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100) : 0;
  const cpc = totalClicks > 0 ? (totalSpend / totalClicks) : 0;
  const cpm = totalImpressions > 0 ? ((totalSpend / totalImpressions) * 1000) : 0;

  document.getElementById('kpi-ads-spend').textContent = `R$ ${totalSpend.toLocaleString('pt-BR', {minimumFractionDigits:2})}`;
  document.getElementById('kpi-ads-revenue').textContent = `R$ ${totalRevenue.toLocaleString('pt-BR', {minimumFractionDigits:2})}`;
  document.getElementById('kpi-ads-roas').textContent = `${roas.toFixed(2)}x`;
  document.getElementById('kpi-ads-cpl').textContent = `R$ ${cpl.toFixed(2)}`;
  document.getElementById('kpi-ads-cpa').textContent = `R$ ${cpa.toFixed(2)}`;
  document.getElementById('kpi-ads-clicks').textContent = totalClicks.toLocaleString('pt-BR');
  document.getElementById('kpi-ads-leads').textContent = totalLeads;
  document.getElementById('kpi-ads-purchases').textContent = totalPurchases;
  document.getElementById('kpi-ads-ctr').textContent = `${ctr.toFixed(2)}%`;
  document.getElementById('kpi-ads-cpc').textContent = `R$ ${cpc.toFixed(2)}`;
  document.getElementById('kpi-ads-cpm').textContent = `R$ ${cpm.toFixed(2)}`;

  // Agrupamentos
  const byPlatform = {};
  const byDate = {};
  
  metrics.forEach(m => {
    // Por plataforma
    if (!byPlatform[m.platform]) byPlatform[m.platform] = { spend: 0, clicks: 0 };
    byPlatform[m.platform].spend += parseFloat(m.spend);
    byPlatform[m.platform].clicks += m.clicks;
    
    // Por Data
    const dateStr = m.date;
    if (!byDate[dateStr]) byDate[dateStr] = { spend: 0, revenue: 0 };
    byDate[dateStr].spend += parseFloat(m.spend);
  });

  if (purchases) {
    purchases.forEach(p => {
      const dateStr = p.created_at.split('T')[0];
      if (!byDate[dateStr]) byDate[dateStr] = { spend: 0, revenue: 0 };
      byDate[dateStr].revenue += parseFloat(p.amount);
    });
  }

  // Ordenar datas
  const sortedDates = Object.keys(byDate).sort();
  const spendData = sortedDates.map(d => byDate[d].spend);
  const revenueData = sortedDates.map(d => byDate[d].revenue);

  // Render Charts
  const ctxSpend = document.getElementById('adsSpendChart');
  if (ctxSpend) {
    if (adsSpendChartInstance) adsSpendChartInstance.destroy();
    adsSpendChartInstance = new Chart(ctxSpend.getContext('2d'), {
      type: 'bar',
      data: {
        labels: sortedDates.map(d => new Date(d).toLocaleDateString('pt-BR')),
        datasets: [
          { label: 'Gasto', data: spendData, backgroundColor: 'rgba(239, 68, 68, 0.5)', borderColor: 'var(--danger)', borderWidth: 1 },
          { label: 'Receita', data: revenueData, backgroundColor: 'rgba(34, 197, 94, 0.5)', borderColor: 'var(--success)', borderWidth: 1 }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  const platforms = Object.keys(byPlatform);
  const platformSpends = platforms.map(p => byPlatform[p].spend);
  const ctxPlat = document.getElementById('adsPlatformChart');
  if (ctxPlat) {
    if (adsPlatformChartInstance) adsPlatformChartInstance.destroy();
    adsPlatformChartInstance = new Chart(ctxPlat.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: platforms.map(p => p.toUpperCase()),
        datasets: [{
          data: platformSpends,
          backgroundColor: platforms.map(p => p === 'meta' ? '#1877F2' : (p === 'google' ? '#EA4335' : '#888'))
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  // Tabelas
  const tbodyPlat = document.getElementById('ads-platform-tbody');
  tbodyPlat.innerHTML = '';
  if (platforms.length === 0) {
    tbodyPlat.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Nenhum custo importado ainda.</td></tr>';
  } else {
    platforms.forEach(p => {
      const platSpend = byPlatform[p].spend;
      const platClicks = byPlatform[p].clicks;
      const platCpc = platClicks > 0 ? (platSpend / platClicks) : 0;
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="text-transform: capitalize; font-weight: 600;">${p}</td>
        <td>R$ ${platSpend.toFixed(2)}</td>
        <td style="color: var(--text-muted);">N/A (Requer UTM)</td>
        <td style="color: var(--text-muted);">N/A</td>
        <td>${platClicks.toLocaleString('pt-BR')}</td>
        <td>R$ ${platCpc.toFixed(2)}</td>
      `;
      tbodyPlat.appendChild(tr);
    });
  }

  const tbodyCamp = document.getElementById('ads-campaigns-tbody');
  tbodyCamp.innerHTML = '';
  if (metrics.length === 0) {
    tbodyCamp.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Nenhum custo importado ainda.</td></tr>';
  } else {
    metrics.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 50).forEach(m => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${new Date(m.date).toLocaleDateString('pt-BR')}</td>
        <td style="text-transform: capitalize;">${m.platform}</td>
        <td style="font-family: monospace; font-size: 11px; color: var(--text-muted);">${m.campaign_id}</td>
        <td>${m.campaign_name || 'Global'}</td>
        <td style="color: var(--danger);">R$ ${parseFloat(m.spend).toFixed(2)}</td>
        <td>${m.clicks || 0}</td>
        <td>${m.impressions || 0}</td>
      `;
      tbodyCamp.appendChild(tr);
    });
  }
}

// ==========================================
// 12.2. GATEWAYS DISPONÃVEIS (ENTERPRISE)
// ==========================================
async function loadGatewaysModule() {
  if (!supabaseClient) return;

  // KPIs Simulados/BÃ¡sicos para demonstraÃ§Ã£o inicial (serÃ¡ enriquecido depois)
  const { data: events } = await supabaseClient.from('gateway_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  const { data: refunds } = await supabaseClient.from('refunds').select('id');
  const { data: subscriptions } = await supabaseClient.from('subscriptions').select('amount').eq('status', 'ACTIVE');
  
  let mrr = 0;
  if (subscriptions) {
    subscriptions.forEach(s => mrr += parseFloat(s.amount));
  }

  document.getElementById('kpi-gw-mrr').textContent = 'R$ ' + mrr.toFixed(2);
  document.getElementById('kpi-gw-refunds').textContent = refunds ? refunds.length : 0;

  const tbody = document.getElementById('gw-events-tbody');
  tbody.innerHTML = '';

  if (!events || events.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Nenhum evento registrado ainda.</td></tr>';
  } else {
    events.forEach(e => {
      const tr = document.createElement('tr');
      const color = e.status === 'processed' ? 'var(--success)' : (e.status === 'failed' ? 'var(--danger)' : '#F59E0B');
      tr.innerHTML = `
        <td>${new Date(e.created_at).toLocaleString('pt-BR')}</td>
        <td style="text-transform: capitalize;">${e.gateway}</td>
        <td style="font-family: monospace; font-size: 11px;">${e.event_type}</td>
        <td style="color: ${color}; font-weight: 600;">${e.status === 'processed' ? 'Sim' : 'NÃ£o'}</td>
        <td>
          <button style="background: none; border: 1px solid var(--border); color: var(--text-secondary); padding: 4px 8px; border-radius: 4px; cursor: pointer;" onclick="alert('Payload:\\n' + JSON.stringify(${JSON.stringify(e.payload).replace(/'/g, "\\'")}, null, 2))">Ver Payload</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Call loadProductsModule as it is now part of Central Financeira
  await loadProductsModule();
  
  // Load Gateway Settings to update badges
  const { data: settings } = await supabaseClient.from('gateway_settings').select('*');
  if (settings) {
    const asaas = settings.find(s => s.gateway_name === 'asaas');
    const badge = document.getElementById('gw-asaas-badge');
    if (asaas && badge) {
      if (asaas.is_active) {
        badge.textContent = 'Online';
        badge.style.background = 'rgba(16,185,129,0.1)';
        badge.style.color = '#10B981';
      } else {
        badge.textContent = 'Inativo';
        badge.style.background = 'rgba(255,255,255,0.1)';
        badge.style.color = 'var(--text-muted)';
      }
    }
  }
}

// ==========================================
// CENTRAL FINANCEIRA: GATEWAYS (FUNCTIONS)
// ==========================================
window.openGatewayModal = async function(gatewayName) {
  document.getElementById('gw-name').value = gatewayName;
  document.getElementById('modal-gateway-title').textContent = `Configurar Gateway: ${gatewayName.toUpperCase()}`;
  
  // Reset
  document.getElementById('gw-api-key').value = '';
  document.getElementById('gw-webhook-token').value = '';
  
  const { data } = await supabaseClient.from('gateway_settings').select('*').eq('gateway_name', gatewayName).single();
  if (data) {
    document.getElementById('gw-env').value = data.environment || 'sandbox';
    document.getElementById('gw-active').value = data.is_active ? 'true' : 'false';
    if (data.api_key_encrypted) document.getElementById('gw-api-key').placeholder = '******** (Preenchida)';
    if (data.webhook_token_encrypted) document.getElementById('gw-webhook-token').placeholder = '******** (Preenchida)';
  } else {
    document.getElementById('gw-env').value = 'sandbox';
    document.getElementById('gw-active').value = 'false';
    document.getElementById('gw-api-key').placeholder = 'Cole a sua API Key aqui';
    document.getElementById('gw-webhook-token').placeholder = 'Cole o token do Webhook';
  }
  
  document.getElementById('modal-gateway-settings').style.display = 'flex';
}

window.saveGatewaySettings = async function() {
  const gateway = document.getElementById('gw-name').value;
  const environment = document.getElementById('gw-env').value;
  const isActive = document.getElementById('gw-active').value === 'true';
  const apiKey = document.getElementById('gw-api-key').value;
  const webhookToken = document.getElementById('gw-webhook-token').value;

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const res = await fetch('https://wkomsnqucatqepabepje.supabase.co/functions/v1/gateway-settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ gateway, environment, isActive, apiKey, webhookToken })
    });
    
    const result = await res.json();
    if (result.success) {
      alert('ConfiguraÃ§Ãµes salvas com sucesso!');
      document.getElementById('modal-gateway-settings').style.display = 'none';
      await loadGatewaysModule();
    } else {
      alert('Erro: ' + result.error);
    }
  } catch (err) {
    alert('Erro ao salvar configuraÃ§Ãµes.');
  }
}

window.testGatewayConnection = async function() {
  const gateway = document.getElementById('gw-name').value;
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const res = await fetch('https://wkomsnqucatqepabepje.supabase.co/functions/v1/gateway-test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ gateway })
    });
    
    const result = await res.json();
    if (result.success) {
      alert('âœ… ' + result.message);
    } else {
      alert('âŒ Erro: ' + result.error);
    }
  } catch (err) {
    alert('Erro ao testar conexÃ£o.');
  }
}

window.cleanOldLogs = async function() {
  if (!confirm('Deseja limpar todos os logs de webhooks com mais de 30 dias? Eventos crÃ­ticos (pagamentos falhos, estornos) serÃ£o mantidos se marcados no banco.')) return;
  
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { error } = await supabaseClient.from('gateway_events')
      .delete()
      .lt('created_at', thirtyDaysAgo.toISOString())
      .eq('keep_forever', false);
      
    if (error) throw error;
    alert('Logs antigos limpos com sucesso!');
    await loadGatewaysModule();
  } catch (err) {
    console.error(err);
    alert('Erro ao limpar logs.');
  }
}

// ==========================================
// 12.1. PRODUTOS (CMS) E PREÃ‡OS
// ==========================================
let currentEditingProductId = null;

async function loadProductsModule() {
  if (!supabaseClient) return;

  const { data: products, error: pErr } = await supabaseClient.from('products').select('*').order('created_at', { ascending: true });
  if (pErr) {
    alert("Erro ao carregar produtos do banco de dados: " + pErr.message);
    console.error("Products error:", pErr);
    return;
  }
  
  const { data: versions, error: vErr } = await supabaseClient.from('product_versions').select('*');
  if (vErr) console.warn("Aviso: Tabela product_versions ausente. " + vErr.message);
  
  const { data: downloads, error: dErr } = await supabaseClient.from('member_downloads').select('id');
  if (dErr) console.warn("Aviso: Tabela member_downloads ausente. " + dErr.message);

  const active = products ? products.filter(p => p.status === 'active') : [];
  const bonus = products ? products.filter(p => p.is_bonus && p.status === 'active') : [];
  
  let potentialRevenue = 0;
  active.forEach(p => {
    const pPrice = parseFloat(p.price || 0);
    const sPrice = parseFloat(p.sale_price || 0);
    potentialRevenue += (sPrice > 0 ? sPrice : pPrice);
  });

  if(document.getElementById('kpi-products-active')) document.getElementById('kpi-products-active').textContent = active.length;
  if(document.getElementById('kpi-products-versions')) document.getElementById('kpi-products-versions').textContent = versions ? versions.length : 0;
  if(document.getElementById('kpi-products-downloads')) document.getElementById('kpi-products-downloads').textContent = downloads ? downloads.length : 0;
  if(document.getElementById('kpi-products-revenue')) document.getElementById('kpi-products-revenue').textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(potentialRevenue);
  if(document.getElementById('kpi-products-bonus')) document.getElementById('kpi-products-bonus').textContent = bonus.length;

  const tbody = document.getElementById('products-tbody');
  tbody.innerHTML = '';

  if (!products || products.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Nenhum produto cadastrado.</td></tr>';
    return;
  }

  products.forEach(p => {
    const tr = document.createElement('tr');
    const statusColor = p.status === 'active' ? 'var(--success)' : (p.status === 'draft' ? '#F59E0B' : 'var(--danger)');
    
    const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: p.currency || 'BRL' });
    const pPrice = parseFloat(p.price || 0);
    const sPrice = parseFloat(p.sale_price || 0);

    const pVersions = versions ? versions.filter(v => v.product_id === p.id) : [];
    const currentV = pVersions.find(v => v.is_current) || pVersions[0];
    const vText = currentV ? currentV.version : 'Sem versÃ£o';

    tr.innerHTML = `
      <td>
        <img src="${p.thumbnail_url || 'https://via.placeholder.com/60x60/161616/8B5CF6?text=' + p.name.charAt(0)}" style="width: 50px; height: 50px; border-radius: 8px; object-fit: cover; border: 1px solid var(--border);">
      </td>
      <td>
        <div style="font-weight: 600;">${p.name} ${p.is_featured ? 'â­' : ''}</div>
        <div style="font-size: 11px; color: var(--text-muted); font-family: monospace;">/${p.slug}</div>
      </td>
      <td style="font-weight: 600;">${formatter.format(pPrice)}</td>
      <td style="color: var(--success); font-weight: 600;">${sPrice > 0 ? formatter.format(sPrice) : '-'}</td>
      <td>
        <span style="display: block; font-size: 12px; font-weight: 600;">${vText}</span>
        <span class="badge" style="background: rgba(245, 158, 11, 0.1); color: #F59E0B; text-transform: uppercase; font-size: 9px;">${p.access_type || 'core'}</span>
      </td>
      <td style="color: ${statusColor}; font-weight: 600; text-transform: capitalize;">${p.status}</td>
      <td>
        <div style="display: flex; gap: 4px; flex-wrap: wrap; max-width: 200px;">
          <button onclick="window.editProduct('${p.id}')" style="background: none; border: 1px solid var(--border); color: var(--text-primary); padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;">âœï¸ Editar</button>
          <button onclick="window.openQuickPrice('${p.id}', ${pPrice}, ${sPrice})" style="background: none; border: 1px solid var(--border); color: var(--success); padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;">ðŸ’° PreÃ§o</button>
          <button onclick="window.openVersionsModal('${p.id}', '${p.name.replace(/'/g, "\\'")}')" style="background: none; border: 1px solid var(--border); color: #8B5CF6; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;">ðŸ“¦ VersÃµes</button>
          <button onclick="window.open('checkout.html?product=${p.checkout_slug || p.slug}', '_blank')" style="background: none; border: 1px solid var(--border); color: #3B82F6; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;">ðŸš€ Checkout</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.openQuickPrice = function(id, basePrice, salePrice) {
  document.getElementById('quick-price-id').value = id;
  document.getElementById('quick-price-base').value = basePrice;
  document.getElementById('quick-price-sale').value = salePrice > 0 ? salePrice : '';
  document.getElementById('modal-quick-price').style.display = 'flex';
}

window.saveQuickPrice = async function() {
  const id = document.getElementById('quick-price-id').value;
  const basePrice = document.getElementById('quick-price-base').value || 0;
  const salePrice = document.getElementById('quick-price-sale').value || 0;

  if (!id) return;
  
  await supabaseClient.from('products').update({
    price: parseFloat(basePrice),
    sale_price: parseFloat(salePrice)
  }).eq('id', id);

  document.getElementById('modal-quick-price').style.display = 'none';
  loadProductsModule();
}

window.openProductModal = function() {
  currentEditingProductId = null;
  document.getElementById('modal-product-title').textContent = 'Novo Produto';
  
  // Clear fields
  ['prod-name', 'prod-slug', 'prod-desc', 'prod-cat', 'prod-thumb', 'prod-video', 'prod-doc', 'prod-price', 'prod-sale-price', 'prod-pix-discount', 'prod-max-installments', 'prod-thank-you', 'prod-sales-page'].forEach(id => {
    if(document.getElementById(id)) document.getElementById(id).value = '';
  });
  
  if(document.getElementById('prod-type')) document.getElementById('prod-type').value = 'core';
  if(document.getElementById('prod-status')) document.getElementById('prod-status').value = 'active';
  if(document.getElementById('prod-license')) document.getElementById('prod-license').value = 'true';
  if(document.getElementById('prod-featured')) document.getElementById('prod-featured').value = 'false';
  if(document.getElementById('prod-checkout-enabled')) document.getElementById('prod-checkout-enabled').value = 'true';
  if(document.getElementById('prod-max-installments')) document.getElementById('prod-max-installments').value = '12';
  
  document.getElementById('modal-product').style.display = 'flex';
}

window.uploadProductImage = async function(input) {
  const file = input.files[0];
  if (!file) return;

  const btnLabel = input.previousElementSibling;
  const originalText = btnLabel.innerHTML;
  btnLabel.innerHTML = 'â³ Enviando...';
  document.getElementById('prod-thumb-status').style.display = 'none';
  
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `covers/${fileName}`;
    
    const { data, error } = await supabaseClient.storage.from('images').upload(filePath, file, { upsert: true });
    
    if (error) {
      alert("Erro ao subir imagem: " + error.message + "\n\nSe o bucket 'images' nÃ£o existir, crie um bucket pÃºblico com esse nome no painel do Supabase Storage.");
      btnLabel.innerHTML = originalText;
      return;
    }
    
    const { data: publicUrlData } = supabaseClient.storage.from('images').getPublicUrl(filePath);
    
    // Atualiza o input com a URL pÃºblica
    document.getElementById('prod-thumb').value = publicUrlData.publicUrl;
    document.getElementById('prod-thumb-status').style.display = 'block';
    
    input.value = ''; // reseta
    btnLabel.innerHTML = originalText;
  } catch (err) {
    console.error(err);
    alert('Erro inesperado no upload.');
    btnLabel.innerHTML = originalText;
  }
}

window.uploadUpsellImage = async function(input) {
  const file = input.files[0];
  if (!file) return;

  const btnLabel = input.previousElementSibling;
  const originalText = btnLabel.innerHTML;
  btnLabel.innerHTML = 'Enviando...';
  
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-upsell-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `upsells/${fileName}`;
    
    const { data, error } = await supabaseClient.storage.from('images').upload(filePath, file, { upsert: true });
    
    if (error) {
      alert("Erro ao subir imagem de upsell: " + error.message);
      btnLabel.innerHTML = originalText;
      return;
    }
    
    const { data: publicUrlData } = supabaseClient.storage.from('images').getPublicUrl(filePath);
    
    document.getElementById('prod-upsell-image').value = publicUrlData.publicUrl;
    btnLabel.innerHTML = originalText;
    input.value = ''; // reseta
  } catch (err) {
    alert("Erro interno: " + err.message);
    btnLabel.innerHTML = originalText;
  }
}

window.addSplitRow = function(walletId = '', type = 'percentage', value = '') {
  const container = document.getElementById('split-receivers-container');
  const div = document.createElement('div');
  div.className = 'split-row';
  div.style.display = 'grid';
  div.style.gridTemplateColumns = '2fr 1fr 1fr auto';
  div.style.gap = '8px';
  div.style.alignItems = 'end';
  
  div.innerHTML = `
    <div>
      <label style="display: block; font-size: 11px; color: var(--text-secondary); margin-bottom: 2px;">Wallet ID</label>
      <input type="text" class="split-wallet-input" value="${walletId}" style="width: 100%; padding: 6px; background: rgba(0,0,0,0.2); border: 1px solid var(--border); color: white; border-radius: 4px;" placeholder="Ex: c8ed23a1...">
    </div>
    <div>
      <label style="display: block; font-size: 11px; color: var(--text-secondary); margin-bottom: 2px;">Tipo</label>
      <select class="split-type-input" style="width: 100%; padding: 6px; background: rgba(0,0,0,0.2); border: 1px solid var(--border); color: white; border-radius: 4px;">
        <option value="percentage" ${type === 'percentage' ? 'selected' : ''}>%</option>
        <option value="fixed" ${type === 'fixed' ? 'selected' : ''}>R$</option>
      </select>
    </div>
    <div>
      <label style="display: block; font-size: 11px; color: var(--text-secondary); margin-bottom: 2px;">Valor</label>
      <input type="number" step="0.01" class="split-value-input" value="${value}" style="width: 100%; padding: 6px; background: rgba(0,0,0,0.2); border: 1px solid var(--border); color: white; border-radius: 4px;" placeholder="0.00">
    </div>
    <button type="button" onclick="this.parentElement.remove()" style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; padding: 6px; border-radius: 4px; cursor: pointer; height: 31px; display: flex; align-items: center; justify-content: center;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
    </button>
  `;
  if (container) container.appendChild(div);
};

window.editProduct = async function(id) {
  currentEditingProductId = id;
  document.getElementById('modal-product-title').textContent = 'Editar Produto';
  
  const { data: p } = await supabaseClient.from('products').select('*').eq('id', id).single();
  if (p) {
    if(document.getElementById('prod-name')) document.getElementById('prod-name').value = p.name || '';
    if(document.getElementById('prod-slug')) document.getElementById('prod-slug').value = p.slug || '';
    if(document.getElementById('prod-desc')) document.getElementById('prod-desc').value = p.description || '';
    if(document.getElementById('prod-cat')) document.getElementById('prod-cat').value = p.category || '';
    if(document.getElementById('prod-type')) document.getElementById('prod-type').value = p.access_type || 'core';
    if(document.getElementById('prod-status')) document.getElementById('prod-status').value = p.status || 'active';
    if(document.getElementById('prod-license')) document.getElementById('prod-license').value = p.requires_license ? 'true' : 'false';
    if(document.getElementById('prod-featured')) document.getElementById('prod-featured').value = p.is_featured ? 'true' : 'false';
    if(document.getElementById('prod-thumb')) document.getElementById('prod-thumb').value = p.thumbnail_url || '';
    if(document.getElementById('prod-video')) document.getElementById('prod-video').value = p.video_url || '';
    if(document.getElementById('prod-doc')) document.getElementById('prod-doc').value = p.documentation_url || '';
    
    // Novos campos
    if(document.getElementById('prod-price')) document.getElementById('prod-price').value = p.price || '';
    if(document.getElementById('prod-sale-price')) document.getElementById('prod-sale-price').value = p.sale_price || '';
    if(document.getElementById('prod-thank-you')) document.getElementById('prod-thank-you').value = p.thank_you_url || '';
    if(document.getElementById('prod-sales-page')) document.getElementById('prod-sales-page').value = p.sales_page_url || '';
    if(document.getElementById('prod-checkout-enabled')) document.getElementById('prod-checkout-enabled').value = p.checkout_enabled ? 'true' : 'false';
    if(document.getElementById('prod-pix-discount')) document.getElementById('prod-pix-discount').value = p.pix_discount || '';
    if(document.getElementById('prod-max-installments')) document.getElementById('prod-max-installments').value = p.max_installments || 12;
    
    // Upsell Config
    const uc = p.checkout_config || {};
    if(document.getElementById('prod-upsell-enabled')) document.getElementById('prod-upsell-enabled').checked = !!uc.upsell_enabled;
    if(document.getElementById('prod-upsell-title')) document.getElementById('prod-upsell-title').value = uc.upsell_title || '';
    if(document.getElementById('prod-upsell-link')) document.getElementById('prod-upsell-link').value = uc.upsell_link || '';
    if(document.getElementById('prod-upsell-desc')) document.getElementById('prod-upsell-desc').value = uc.upsell_desc || '';
    if(document.getElementById('prod-upsell-old-price')) document.getElementById('prod-upsell-old-price').value = uc.upsell_old_price || '';
    if(document.getElementById('prod-upsell-new-price')) document.getElementById('prod-upsell-new-price').value = uc.upsell_new_price || '';
    if(document.getElementById('prod-upsell-benefits')) document.getElementById('prod-upsell-benefits').value = (uc.upsell_benefits || []).join('\n');
    if(document.getElementById('prod-upsell-video')) document.getElementById('prod-upsell-video').value = uc.upsell_video_url || '';
    if(document.getElementById('prod-upsell-image')) document.getElementById('prod-upsell-image').value = uc.upsell_image_url || '';

    // Split Config
    const container = document.getElementById('split-receivers-container');
    if (container) container.innerHTML = ''; // clear old rows
    
    let splitRules = uc.split_rules || [];
    
    // Backward compatibility with single split config
    if (!uc.split_rules && uc.split && uc.split.walletId) {
      splitRules = [{
        walletId: uc.split.walletId,
        type: uc.split.type || 'percentage',
        value: uc.split.value || 0
      }];
    }
    
    const splitEnabled = uc.split ? !!uc.split.enabled : (uc.split_rules && uc.split_rules.length > 0);
    if(document.getElementById('prod-split-enabled')) document.getElementById('prod-split-enabled').checked = splitEnabled;

    splitRules.forEach(r => window.addSplitRow(r.walletId, r.type, r.value));

    document.getElementById('modal-product').style.display = 'flex';
  }
}

window.saveProduct = async function() {
  const getVal = (id, def = '') => { const el = document.getElementById(id); return el ? el.value : def; };

  const payload = {
    name: getVal('prod-name'),
    slug: getVal('prod-slug'),
    description: getVal('prod-desc'),
    category: getVal('prod-cat'),
    access_type: getVal('prod-type', 'core'),
    status: getVal('prod-status', 'active'),
    requires_license: getVal('prod-license', 'false') === 'true',
    is_featured: getVal('prod-featured', 'false') === 'true',
    is_bonus: getVal('prod-type') === 'bonus',
    thumbnail_url: getVal('prod-thumb'),
    video_url: getVal('prod-video'),
    documentation_url: getVal('prod-doc'),
  };

  if(document.getElementById('prod-price')) payload.price = parseFloat(getVal('prod-price', '0') || 0);
  if(document.getElementById('prod-sale-price')) payload.sale_price = parseFloat(getVal('prod-sale-price', '0') || 0);
  if(document.getElementById('prod-thank-you')) payload.thank_you_url = getVal('prod-thank-you');
  if(document.getElementById('prod-sales-page')) payload.sales_page_url = getVal('prod-sales-page');
  if(document.getElementById('prod-checkout-enabled')) payload.checkout_enabled = getVal('prod-checkout-enabled', 'false') === 'true';
  if(document.getElementById('prod-pix-discount')) payload.pix_discount = parseFloat(getVal('prod-pix-discount', '0') || 0);
  if(document.getElementById('prod-max-installments')) payload.max_installments = parseInt(getVal('prod-max-installments', '12') || 12);
  
  // Atualizar checkout_config com os dados do Upsell e Split
  const upsellEnabled = document.getElementById('prod-upsell-enabled') ? document.getElementById('prod-upsell-enabled').checked : false;
  const benefitsText = getVal('prod-upsell-benefits', '');
  const benefitsArray = benefitsText.split('\n').map(b => b.trim()).filter(b => b.length > 0);

  const splitEnabled = document.getElementById('prod-split-enabled') ? document.getElementById('prod-split-enabled').checked : false;
  
  const splitRules = [];
  let totalPercentage = 0;
  let totalFixed = 0;
  
  const splitRows = document.querySelectorAll('.split-row');
  for (let row of splitRows) {
    const wallet = row.querySelector('.split-wallet-input').value.trim();
    const type = row.querySelector('.split-type-input').value;
    const value = parseFloat(row.querySelector('.split-value-input').value || 0);
    
    if (!wallet) {
      alert('Existem recebedores com Wallet ID em branco no Split. Remova ou preencha.');
      return;
    }
    if (value <= 0) {
      alert('Os valores de split devem ser maiores que zero.');
      return;
    }
    
    if (type === 'percentage') totalPercentage += value;
    if (type === 'fixed') totalFixed += value;
    
    splitRules.push({ walletId: wallet, type, value });
  }
  
  if (totalPercentage > 100) {
    alert('A soma das porcentagens do Split nÃ£o pode ultrapassar 100%.');
    return;
  }
  
  const currentPrice = parseFloat(getVal('prod-sale-price', '0')) || parseFloat(getVal('prod-price', '0')) || 0;
  if (totalFixed > currentPrice && currentPrice > 0) {
    alert('A soma dos valores fixos do Split nÃ£o pode ser maior que o valor do produto.');
    return;
  }
  
  payload.checkout_config = {
    upsell_enabled: upsellEnabled,
    upsell_title: getVal('prod-upsell-title'),
    upsell_link: getVal('prod-upsell-link'),
    upsell_desc: getVal('prod-upsell-desc'),
    upsell_old_price: getVal('prod-upsell-old-price'),
    upsell_new_price: getVal('prod-upsell-new-price'),
    upsell_benefits: benefitsArray,
    upsell_video_url: getVal('prod-upsell-video'),
    upsell_image_url: getVal('prod-upsell-image'),
    split: {
      enabled: splitEnabled
    },
    split_rules: splitRules
  };

  if (!payload.name || !payload.slug) {
    alert("Nome e Slug sÃ£o obrigatÃ³rios.");
    return;
  }

  // Preencher checkout_slug automaticamente na criaÃ§Ã£o
  if (!currentEditingProductId) {
    payload.checkout_slug = payload.slug;
  }

  if (currentEditingProductId) {
    const { error } = await supabaseClient.from('products').update(payload).eq('id', currentEditingProductId);
    if (error) {
      alert("Erro ao atualizar produto: " + error.message);
      return;
    }
  } else {
    const { error } = await supabaseClient.from('products').insert([payload]);
    if (error) {
      alert("Erro ao criar produto no banco de dados: " + error.message);
      return;
    }
  }
  
  document.getElementById('modal-product').style.display = 'none';
  loadProductsModule();
}

let currentVersionProductId = null;
window.openVersionsModal = async function(id, name) {
  currentVersionProductId = id;
  document.getElementById('v-prod-name').textContent = name;
  document.getElementById('modal-versions').style.display = 'flex';
  await loadVersionsList();
}

async function loadVersionsList() {
  const tbody = document.getElementById('versions-tbody');
  tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">Carregando...</td></tr>';
  
  const { data: versions } = await supabaseClient.from('product_versions')
    .select('*').eq('product_id', currentVersionProductId)
    .order('created_at', { ascending: false });
    
  tbody.innerHTML = '';
  if (!versions || versions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">Nenhuma versÃ£o cadastrada.</td></tr>';
    return;
  }
  
  versions.forEach(v => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span style="font-weight: bold;">v${v.version}</span> ${v.is_current ? '<span class="badge" style="background:var(--success);color:#000;">Atual</span>' : ''}</td>
      <td>${new Date(v.created_at).toLocaleDateString('pt-BR')}</td>
      <td style="font-size: 11px; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${v.changelog || ''}</td>
      <td>
        <button style="background:none; border:none; color: var(--danger); cursor:pointer;" onclick="alert('Funcionalidade em desenvolvimento')">ðŸ—‘ï¸</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.saveVersion = async function() {
  const version = document.getElementById('v-version').value;
  const download_url = document.getElementById('v-download').value;
  const file_size = document.getElementById('v-size').value;
  const changelog = document.getElementById('v-changelog').value;
  
  if (!version) return alert("VersÃ£o Ã© obrigatÃ³ria.");
  
  // Mark others as not current
  await supabaseClient.from('product_versions').update({ is_current: false }).eq('product_id', currentVersionProductId);
  
  // Insert new
  await supabaseClient.from('product_versions').insert([{
    product_id: currentVersionProductId,
    version,
    download_url,
    file_size,
    changelog,
    is_current: true
  }]);
  
  // Update parent product download_url as fallback
  await supabaseClient.from('products').update({ download_url }).eq('id', currentVersionProductId);
  
  document.getElementById('v-version').value = '';
  document.getElementById('v-download').value = '';
  document.getElementById('v-size').value = '';
  document.getElementById('v-changelog').value = '';
  
  loadVersionsList();
}

// ==========================================
// 12. ÃREA DE MEMBROS
// ==========================================
async function loadMembersModule() {
  if (!supabaseClient) return;

  const dateFilter = getFilterDate();
  
  let qMembers = supabaseClient.from('members').select('*');
  let qProducts = supabaseClient.from('member_products').select('*');
  let qDownloads = supabaseClient.from('member_downloads').select('*');
  let qLicenses = supabaseClient.from('member_licenses').select('*');

  if (dateFilter) {
    qMembers = qMembers.gte('created_at', dateFilter);
  }

  const [{ data: members }, { data: products }, { data: downloads }, { data: licenses }] = await Promise.all([
    qMembers, qProducts, qDownloads, qLicenses
  ]);

  if (!members) return;

  const activeMembers = members.filter(m => m.status === 'active');
  const onboarded = members.filter(m => m.onboarding_completed);
  
  const activationRate = members.length > 0 ? (onboarded.length / members.length) * 100 : 0;
  
  document.getElementById('kpi-members-active').textContent = activeMembers.length;
  document.getElementById('kpi-members-activation').textContent = `${activationRate.toFixed(1)}%`;
  document.getElementById('kpi-members-downloads').textContent = downloads ? downloads.length : 0;
  document.getElementById('kpi-members-licenses').textContent = licenses ? licenses.filter(l => l.status === 'active').length : 0;
  
  // Simulated MRR based on active members * average price
  const estimatedMrr = activeMembers.length * 97.00; 
  document.getElementById('kpi-members-mrr').textContent = `R$ ${estimatedMrr.toLocaleString('pt-BR', {minimumFractionDigits:2})}`;

  const tbody = document.getElementById('members-tbody');
  tbody.innerHTML = '';
  
  if (members.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Nenhum membro encontrado.</td></tr>';
  } else {
    members.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).forEach(m => {
      const tr = document.createElement('tr');
      const statusColor = m.status === 'active' ? 'var(--success)' : 'var(--danger)';
      const lastAccess = m.last_login_at ? new Date(m.last_login_at).toLocaleDateString('pt-BR') : 'Nunca';
      
      tr.innerHTML = `
        <td>
          <div style="font-weight: 600;">${m.name}</div>
          <div style="font-size: 11px; color: var(--text-muted);">${m.id}</div>
        </td>
        <td>${escapeHtml(window.maskEmail(m.email))}</td>
        <td style="color: ${statusColor}; font-weight: 600; text-transform: capitalize;">${m.status}</td>
        <td>${lastAccess}</td>
        <td><span class="badge ${m.engagement_score > 50 ? 'quente' : 'frio'}">${m.engagement_score} pts</span></td>
        <td>
          <button style="background: none; border: 1px solid var(--border); color: var(--text-secondary); padding: 4px 8px; border-radius: 4px; cursor: pointer;" onclick="alert('Funcionalidade em desenvolvimento')">Gerenciar</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }
}

// ==========================================
// 12. CENTRO DE NOTIFICAÃ‡Ã•ES (Sino)
// ==========================================
async function loadNotifications() {
  if (!supabaseClient) return;

  const { data: notifs } = await supabaseClient.from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  const badge = document.getElementById('notif-badge');
  const list = document.getElementById('notif-list');
  
  if (!notifs || notifs.length === 0) {
    list.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 12px;">Nenhuma notificaÃ§Ã£o nova.</div>';
    badge.style.display = 'none';
    return;
  }

  const unread = notifs.filter(n => !n.is_read).length;
  if (unread > 0) {
    badge.textContent = unread;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }

  list.innerHTML = '';
  notifs.forEach(n => {
    const div = document.createElement('div');
    div.className = `notif-item ${!n.is_read ? 'unread' : ''}`;
    
    let icon = 'ðŸ””';
    if (n.type === 'whatsapp_reply') icon = 'ðŸ’¬';
    if (n.type === 'hot_lead') icon = 'ðŸ”¥';
    if (n.type === 'purchase') icon = 'ðŸ’°';

    div.innerHTML = `
      <div style="display: flex; gap: 8px;">
        <span style="font-size: 16px;">${icon}</span>
        <div>
          <div style="font-weight: 600; color: #fff; margin-bottom: 2px;">${n.title}</div>
          <div style="color: var(--text-secondary);">${n.message}</div>
          <div style="font-size: 10px; color: var(--text-muted); margin-top: 4px;">${new Date(n.created_at).toLocaleTimeString('pt-BR')}</div>
        </div>
      </div>
    `;

    div.onclick = async () => {
      if (!n.is_read) {
        await supabaseClient.from('notifications').update({ is_read: true }).eq('id', n.id);
        div.classList.remove('unread');
        const count = parseInt(badge.textContent) - 1;
        if (count <= 0) badge.style.display = 'none';
        else badge.textContent = count;
      }
      if (n.lead_id) {
        const { data: leadData } = await supabaseClient.from('leads').select('*').eq('id', n.lead_id).single();
        if (leadData) openLeadDrawer(leadData);
      }
      document.getElementById('notif-dropdown').classList.remove('active');
    };

    list.appendChild(div);
  });
}

// Inicializa NotificaÃ§Ãµes no start
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => { if (supabaseClient) loadNotifications(); }, 2000);
});

// ==========================================
// MODULE: ANALYTICS EXECUTIVO
// ==========================================
let analyticsChartInstance = null;

function getFilterDays() {
  const filter = document.getElementById('global-date-filter');
  const val = filter ? filter.value : '30d';
  if (val === 'hoje') return 1;
  if (val === '7d') return 7;
  if (val === '30d') return 30;
  if (val === '90d') return 90;
  if (val === '12m') return 365;
  return 3650; // tudo (10 anos)
}

async function fetchAnalyticsRPC(rpcName, days, forceRefresh = false) {
  const cacheKey = `analytics_${rpcName}_${days}`;
  if (!forceRefresh) {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  }
  const { data, error } = await supabaseClient.rpc(rpcName, { p_days: days });
  if (!error && data) sessionStorage.setItem(cacheKey, JSON.stringify(data));
  return data;
}

async function loadAnalyticsModule(forceRefresh = false) {
  const days = getFilterDays();
  
  // 1. Fetch KPIs
  const kpiData = await fetchAnalyticsRPC('get_executive_kpis', days, forceRefresh);
  if (kpiData) {
    document.getElementById('kpi-rev-period').textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(kpiData.revenue_period || 0);
    document.getElementById('kpi-rev-today').textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(kpiData.revenue_today || 0);
    const avgTicket = (kpiData.revenue_period || 0) / (kpiData.purchases_period || 1);
    document.getElementById('kpi-rev-ticket').textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(avgTicket);
    document.getElementById('kpi-rev-purchases').textContent = kpiData.purchases_period || 0;
    document.getElementById('kpi-rev-leads').textContent = kpiData.leads_period || 0;
    document.getElementById('kpi-rev-pending').textContent = kpiData.purchases_pending || 0;
    
    const conv1 = kpiData.leads_period > 0 ? ((kpiData.purchases_period / kpiData.leads_period) * 100).toFixed(2) : 0;
    document.getElementById('kpi-rev-conv1').textContent = conv1 + '%';
    
    // Assumiremos uma base de 20% para a demonstração ou cruzar com checkouts
    document.getElementById('kpi-rev-conv2').textContent = '--';
  }

  // 2. Fetch Funnel
  const funnelData = await fetchAnalyticsRPC('get_funnel_stats', days, forceRefresh);
  if (funnelData) {
    const fBody = document.getElementById('analytics-funnel-body');
    let html = '';
    const steps = [
      { id: 'page_view', name: 'Visitas (Landing)' },
      { id: 'generate_lead', name: 'Leads Gerados' },
      { id: 'begin_checkout', name: 'Início de Checkout' },
      { id: 'purchase', name: 'Compras' }
    ];
    let previousVal = funnelData.page_view || 0;
    steps.forEach(step => {
      const val = funnelData[step.id] || 0;
      const conv = previousVal > 0 ? ((val / previousVal) * 100).toFixed(1) : 0;
      html += `<tr><td>${step.name}</td><td>${val}</td><td>${step.id === 'page_view' ? '-' : conv + '%'}</td></tr>`;
      previousVal = val;
      if (step.id === 'begin_checkout' && kpiData) {
        const convCheckout = val > 0 ? ((kpiData.purchases_period / val) * 100).toFixed(2) : 0;
        document.getElementById('kpi-rev-conv2').textContent = convCheckout + '%';
      }
    });
    fBody.innerHTML = html;
  }

  // 3. Fetch UTMs
  const utmData = await fetchAnalyticsRPC('get_utm_acquisition', days, forceRefresh);
  if (utmData) {
    const uBody = document.getElementById('analytics-utm-body');
    if (utmData.length === 0 || !utmData[0].source) uBody.innerHTML = '<tr><td colspan="2">Sem dados</td></tr>';
    else uBody.innerHTML = utmData.map(u => `<tr><td>${escapeHtml(u.source)}</td><td>${u.leads}</td></tr>`).join('');
  }

  // 4. Fetch Payments Split
  const payData = await fetchAnalyticsRPC('get_financial_split', days, forceRefresh);
  if (payData) {
    const pBody = document.getElementById('analytics-payment-body');
    if (payData.length === 0 || !payData[0].method) pBody.innerHTML = '<tr><td colspan="3">Sem dados</td></tr>';
    else pBody.innerHTML = payData.map(p => `<tr><td>${escapeHtml(p.method)}</td><td>${p.qty}</td><td>${new Intl.NumberFormat('pt-BR', {style:'currency',currency:'BRL'}).format(p.total)}</td></tr>`).join('');
  }

  // 5. Fetch Chart Data
  const chartData = await fetchAnalyticsRPC('get_charts_data', days, forceRefresh);
  if (chartData && chartData.revenue && chartData.leads) {
    const ctx = document.getElementById('analyticsEvolutionChart');
    if (ctx) {
      if (analyticsChartInstance) analyticsChartInstance.destroy();
      const labels = chartData.revenue.map(d => d.day);
      const revData = chartData.revenue.map(d => d.value);
      const leadsData = chartData.leads.map(d => d.value);
      analyticsChartInstance = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            { label: 'Receita (R$)', data: revData, borderColor: '#10b981', tension: 0.4, yAxisID: 'y' },
            { label: 'Leads', data: leadsData, borderColor: '#FF6B00', tension: 0.4, yAxisID: 'y1' }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: {
            y: { type: 'linear', display: true, position: 'left' },
            y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false } }
          }
        }
      });
    }
  }
}

// Binds export
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-refresh-analytics')?.addEventListener('click', () => loadAnalyticsModule(true));
  document.getElementById('btn-export-pdf')?.addEventListener('click', () => window.print());
  document.getElementById('btn-export-csv')?.addEventListener('click', async () => {
    // Generate simple CSV
    const days = getFilterDays();
    const { data: kpiData } = await supabaseClient.rpc('get_executive_kpis', { p_days: days });
    let csv = '\uFEFFReceita Total,Receita Hoje,Ticket Medio,Total Compras,Leads\n';
    if(kpiData) {
      csv += `${kpiData.revenue_period},${kpiData.revenue_today},${kpiData.revenue_period/kpiData.purchases_period},${kpiData.purchases_period},${kpiData.leads_period}\n`;
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics_${days}d.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  });
});

// ==========================================
// 15. SRE STATUS MODULE
// ==========================================
async function loadSreModule() {
  const { data, error } = await supabaseClient.rpc('get_sre_status');
  if (data && !error) {
    document.getElementById('sre-dlq-pending').textContent = data.dlq_pending || 0;
    document.getElementById('sre-dlq-resolved').textContent = data.dlq_resolved || 0;
    document.getElementById('sre-idempotency').textContent = data.idempotency_locks || 0;
    document.getElementById('sre-db-status').textContent = data.db_status || 'ok';
  }

  // Load DLQ
  const { data: dlq, error: dlqErr } = await supabaseClient.from('dead_letter_queue').select('*').order('created_at', { ascending: false }).limit(50);
  const tbody = document.getElementById('sre-dlq-body');
  if (tbody) {
    if (dlqErr || !dlq || dlq.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5">Fila vazia. Tudo limpo! 🎉</td></tr>';
    } else {
      let html = '';
      dlq.forEach(d => {
        html += `<tr>
          <td>${escapeHtml(d.endpoint)}</td>
          <td style="color:#EF4444; font-size:12px;">${escapeHtml(d.error_message)}</td>
          <td style="font-size:11px; color:#9CA3AF;">${escapeHtml(d.correlation_id || '-')}</td>
          <td>${d.retry_count}</td>
          <td>${escapeHtml(d.status)}</td>
        </tr>`;
      });
      tbody.innerHTML = html;
    }
  }
}

window.loadSreModule = loadSreModule;

async function reprocessDLQ() {
  const conf = confirm('Tem certeza que deseja forçar o reprocessamento da DLQ? O sistema pulará eventos já confirmados na Idempotência.');
  if (conf) {
    alert('Sinal de reprocessamento enviado para as Edge Functions / Cron!');
    await loadSreModule();
  }
}
window.reprocessDLQ = reprocessDLQ;
