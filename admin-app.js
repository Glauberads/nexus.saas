/**
 * admin-app.js
 * Lida com o roteamento interno (SPA), proteção de autenticação e renderização de dados do Supabase.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. AUTH GUARD
  await verifyAuth();

  // 2. INITIALIZE SPA ROUTER & UI
  initUI();
  
  // 3. LOAD DATA
  if (window.NexusDB) {
    loadDashboard();
    setupRealtime();
  }
});

// ==========================================
// 1. AUTH GUARD
// ==========================================
async function verifyAuth() {
  if (!window.supabase) {
    console.error("Supabase client not found.");
    return;
  }
  
  const { data: { session } } = await window.supabase.auth.getSession();
  
  // Verifica se não há sessão ou se o e-mail não é o autorizado
  if (!session || session.user.email !== 'suporteglauberr@gmail.com') {
    if (session) {
      await window.supabase.auth.signOut(); // forçar logout se logou com conta errada
    }
    window.location.href = 'admin-login.html';
    return;
  }
  
  // Update UI with user info
  const profileName = document.getElementById('user-profile-name');
  if (profileName) profileName.textContent = 'Glauber';
  
  // Setup Logout Button
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async (e) => {
      e.preventDefault();
      await window.supabase.auth.signOut();
      window.location.href = 'admin-login.html';
    });
  }
}

// ==========================================
// 2. UI & ROUTER (SPA)
// ==========================================
function initUI() {
  // Mobile Menu Toggle
  const mobileBtn = document.getElementById('mobile-menu-btn');
  const closeBtn = document.getElementById('mobile-close-btn');
  const sidebar = document.getElementById('sidebar');
  
  if (mobileBtn && sidebar) {
    mobileBtn.addEventListener('click', () => sidebar.classList.add('active'));
  }
  if (closeBtn && sidebar) {
    closeBtn.addEventListener('click', () => sidebar.classList.remove('active'));
  }

  // SPA Router
  const links = document.querySelectorAll('.sidebar-menu a[data-target]');
  const sections = document.querySelectorAll('.module-section');
  
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Update Active State
      links.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      
      // Hide all sections
      sections.forEach(sec => sec.classList.remove('active'));
      
      // Show target section
      const targetId = link.getAttribute('data-target');
      const targetSec = document.getElementById(targetId);
      if (targetSec) targetSec.classList.add('active');
      
      // Close mobile sidebar if open
      if (window.innerWidth <= 768 && sidebar) {
        sidebar.classList.remove('active');
      }
      
      // Load specific data for module
      loadModuleData(targetId);
    });
  });

  // Drawer Close logic
  const drawerCloseBtn = document.getElementById('drawer-close');
  const drawerOverlay = document.getElementById('drawer-overlay');
  
  if (drawerCloseBtn && drawerOverlay) {
    drawerCloseBtn.addEventListener('click', () => {
      drawerOverlay.classList.remove('active');
    });
    drawerOverlay.addEventListener('click', (e) => {
      if (e.target === drawerOverlay) drawerOverlay.classList.remove('active');
    });
  }
}

// ==========================================
// 3. DATA LOADING & RENDER
// ==========================================
async function loadModuleData(moduleId) {
  if (moduleId === 'module-dashboard') await loadDashboard();
  if (moduleId === 'module-leads') await loadLeadsModule();
  // if (moduleId === 'module-vendas') await loadVendasModule();
  // ... expand as needed
}

async function loadDashboard() {
  const kpis = await window.NexusDB.getKPIs();
  
  // Update KPIs
  document.getElementById('kpi-visitors').textContent = kpis.sessions || 0;
  document.getElementById('kpi-leads').textContent = kpis.totalLeads || 0;
  document.getElementById('kpi-hot').textContent = kpis.hotLeads || 0;
  document.getElementById('kpi-roas').textContent = "Calculando..."; // Mock
  
  // Carrega Widget de Leads Quentes Agora
  const leads = await window.NexusDB.getLeads(10, 0);
  const tbody = document.getElementById('hot-leads-tbody');
  if (tbody) {
    tbody.innerHTML = '';
    const hotLeads = leads.filter(l => l.lead_score >= 51).sort((a,b) => b.lead_score - a.lead_score).slice(0, 5);
    
    if (hotLeads.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Nenhum lead quente recente.</td></tr>';
    } else {
      hotLeads.forEach(l => {
        const tr = document.createElement('tr');
        const badgeClass = l.lead_tier.toLowerCase().replace(' ', '-');
        tr.innerHTML = `
          <td>${l.name || 'Desconhecido'}</td>
          <td>${l.email || l.whatsapp || '-'}</td>
          <td>${l.utm_source || 'orgânico'} / ${l.utm_campaign || '-'}</td>
          <td><strong>${l.lead_score}</strong></td>
          <td><span class="badge ${badgeClass}">${l.lead_tier}</span></td>
          <td class="clickable" onclick="openLeadDrawer('${l.id}')">Ver →</td>
        `;
        tbody.appendChild(tr);
      });
    }
  }

  // O Chart.js render pode ser adicionado aqui
}

async function loadLeadsModule() {
  const leads = await window.NexusDB.getLeads(50, 0);
  const tbody = document.getElementById('all-leads-tbody');
  if (tbody) {
    tbody.innerHTML = '';
    leads.forEach(l => {
      const tr = document.createElement('tr');
      const badgeClass = l.lead_tier ? l.lead_tier.toLowerCase().replace(' ', '-') : 'frio';
      tr.innerHTML = `
        <td>${l.name || '-'}</td>
        <td>${l.email || '-'}</td>
        <td>${l.whatsapp || '-'}</td>
        <td><span class="badge ${badgeClass}">${l.lead_tier || 'Frio'}</span></td>
        <td>${new Date(l.created_at).toLocaleDateString()}</td>
        <td class="clickable" onclick="openLeadDrawer('${l.id}')">Detalhes</td>
      `;
      tbody.appendChild(tr);
    });
  }
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

  const { data: lead, error } = await window.supabase.from('leads').select('*').eq('id', leadId).single();
  if (!lead) return;

  document.getElementById('drawer-name').textContent = lead.name || 'Lead Anônimo';
  document.getElementById('drawer-email').textContent = `${lead.email || ''} | ${lead.whatsapp || ''}`;
  
  // Buscar Jornada
  const { data: journey } = await window.supabase.from('lead_journey').select('*').eq('lead_id', leadId).order('created_at', { ascending: true });
  
  const timelineContainer = document.getElementById('drawer-timeline');
  timelineContainer.innerHTML = '';
  
  if (journey && journey.length > 0) {
    journey.forEach(evt => {
      const timeStr = new Date(evt.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
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
  if (!window.supabase) return;
  
  window.supabase.channel('public:events')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, payload => {
      const eventName = payload.new.event_name;
      // Recarrega Dashboard se for evento crucial
      if (['Purchase', 'Lead', 'QualifiedLead', 'CheckoutAbandoned'].includes(eventName)) {
        loadDashboard();
      }
    })
    .subscribe();
}
