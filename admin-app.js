/**
 * admin-app.js
 * Lida com o roteamento interno (SPA), proteção de autenticação e renderização de dados reais do Supabase.
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
  
  // Verifica se não há sessão ou se o e-mail não é o autorizado
  if (!session || session.user.email !== 'suporteglauberr@gmail.com') {
    if (session) {
      await supabaseClient.auth.signOut(); // forçar logout se logou com conta errada
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

// ==========================================
// 3. DATA LOADING & RENDER
// ==========================================
async function loadModuleData(moduleId) {
  if (!supabaseClient) return;
  
  if (moduleId === 'module-dashboard') await loadDashboard();
  else if (moduleId === 'module-leads') await loadLeadsModule();
  else if (moduleId === 'module-funnel') await loadFunnelModule();
  else if (moduleId === 'module-events') await loadEventsModule();
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
    
    const receita = (purchases || []).reduce((acc, p) => acc + (p.amount || 497), 0);
    // Para o ROAS Global, se não houver tabela de custo ainda, exibimos a Receita e aviso
    document.getElementById('kpi-roas').textContent = `R$ ${receita.toLocaleString('pt-BR')}`;
    
    // WIDGET: Leads Quentes Agora
    const tbody = document.getElementById('hot-leads-tbody');
    if (tbody) {
      tbody.innerHTML = '';
      const topLeads = hotLeads.sort((a,b) => b.lead_score - a.lead_score).slice(0, 10);
      
      if (topLeads.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Nenhum lead quente encontrado neste período.</td></tr>';
      } else {
        topLeads.forEach(l => {
          const tr = document.createElement('tr');
          const badgeClass = l.lead_tier ? l.lead_tier.toLowerCase().replace(' ', '-') : 'frio';
          tr.innerHTML = `
            <td>${l.name || 'Desconhecido'}</td>
            <td>${l.email || l.whatsapp || '-'}</td>
            <td>${l.utm_source || 'direto'}</td>
            <td><strong>${l.lead_score || 0}</strong></td>
            <td><span class="badge ${badgeClass}">${l.lead_tier || '-'}</span></td>
            <td class="clickable" onclick="openLeadDrawer('${l.id}')">Ver →</td>
          `;
          tbody.appendChild(tr);
        });
      }
    }

    // WIDGET: Gráficos Chart.js
    renderCharts(sessions, leads);

  } catch (err) {
    console.error("Erro ao carregar Dashboard:", err);
  }
}

function renderCharts(sessions, leads) {
  // Tráfego
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
          label: 'Sessões',
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
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Nenhum lead encontrado neste período.</td></tr>';
      return;
    }
    
    leads.forEach(l => {
      const tr = document.createElement('tr');
      const badgeClass = l.lead_tier ? l.lead_tier.toLowerCase().replace(' ', '-') : 'frio';
      tr.innerHTML = `
        <td>${l.name || '-'}</td>
        <td>${l.email || '-'}</td>
        <td>${l.whatsapp || '-'}</td>
        <td><span class="badge ${badgeClass}">${l.lead_tier || 'Frio'}</span></td>
        <td>${new Date(l.created_at).toLocaleDateString('pt-BR')}</td>
        <td class="clickable" onclick="openLeadDrawer('${l.id}')">Ver →</td>
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
      <strong>Conversão Global:</strong> ${vc > 0 ? ((pur/vc)*100).toFixed(2) : 0}%<br/>
      <strong>View → Lead:</strong> ${vc > 0 ? ((leads/vc)*100).toFixed(2) : 0}%<br/>
      <strong>Lead → Purchase:</strong> ${leads > 0 ? ((pur/leads)*100).toFixed(2) : 0}%<br/>
      <br/>
      (Visualização detalhada em breve)
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
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">Nenhum evento no período.</td></tr>';
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
  
  // Animação de entrada se for novo
  tr.animate([
    { backgroundColor: 'rgba(255, 107, 0, 0.2)' },
    { backgroundColor: 'transparent' }
  ], { duration: 2000 });
}


// ==========================================
// 4. DRAWER (LEAD DETAIL)
// ==========================================
async function openLeadDrawer(leadId) {
  const overlay = document.getElementById('drawer-overlay');
  overlay.classList.add('active');
  
  document.getElementById('drawer-name').textContent = "Carregando...";
  document.getElementById('drawer-email').textContent = "";
  document.getElementById('drawer-timeline').innerHTML = "";

  const { data: lead } = await supabaseClient.from('leads').select('*').eq('id', leadId).single();
  if (!lead) return;

  document.getElementById('drawer-name').textContent = lead.name || 'Lead Anônimo';
  document.getElementById('drawer-email').textContent = `${lead.email || ''} | ${lead.whatsapp || ''}`;
  
  const { data: journey } = await supabaseClient.from('lead_journey').select('*').eq('lead_id', leadId).order('created_at', { ascending: true });
  const timelineContainer = document.getElementById('drawer-timeline');
  timelineContainer.innerHTML = '';
  
  if (journey && journey.length > 0) {
    journey.forEach(evt => {
      const timeStr = new Date(evt.created_at).toLocaleString('pt-BR');
      const div = document.createElement('div');
      div.className = 'timeline-item';
      div.innerHTML = `
        <div class="timeline-time">${timeStr}</div>
        <div class="timeline-event">${evt.event_name}</div>
        <div class="timeline-desc">${evt.metadata ? JSON.stringify(evt.metadata) : ''}</div>
      `;
      timelineContainer.appendChild(div);
    });
  } else {
    timelineContainer.innerHTML = '<div class="timeline-item"><div class="timeline-desc">Nenhuma ação registrada além da criação.</div></div>';
  }
}

// ==========================================
// 5. REALTIME FEED
// ==========================================
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
    })
    .subscribe();
}
