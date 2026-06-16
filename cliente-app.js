let supabaseClient = null;
let currentMemberId = null;
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Configurar Supabase
  if (window.NexusTracker && window.NexusTracker.config) {
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.NexusTracker.config;
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    initApp();
  } else {
    const script = document.createElement('script');
    script.src = 'nexus-tracker.js';
    script.onload = () => {
      const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.NexusTracker.config;
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      initApp();
    };
    document.head.appendChild(script);
  }
});

async function initApp() {
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  
  if (error || !session) {
    window.location.href = 'cliente-login.html';
    return;
  }
  
  currentUser = session.user;
  
  // Buscar perfil de membro
  const { data: member } = await supabaseClient.from('members')
    .select('*')
    .eq('auth_id', currentUser.id)
    .single();
    
  if (member) {
    currentMemberId = member.id;
    document.getElementById('user-name').textContent = member.name;
    document.getElementById('welcome-name').textContent = member.name.split(' ')[0];
    document.getElementById('avatar-letters').textContent = member.name.substring(0, 2).toUpperCase();
    
    // Log access
    await supabaseClient.from('member_access_logs').insert([{
      member_id: currentMemberId,
      action: 'login',
      ip_address: 'unknown',
      user_agent: navigator.userAgent
    }]);
    
    // Check onboarding
    if (!member.onboarding_completed) {
      await supabaseClient.from('members').update({ onboarding_completed: true }).eq('id', currentMemberId);
    }
  } else {
    // Member record not yet linked to auth (Should be linked by backend when auth is created)
    // For safety, fallback to email display
    document.getElementById('user-name').textContent = currentUser.email;
  }
  
  initRouter();
  await loadDashboard();
}

function initRouter() {
  const links = document.querySelectorAll('.sidebar-menu a[data-target]');
  const sections = document.querySelectorAll('.module-section');
  
  links.forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      links.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      sections.forEach(sec => sec.classList.remove('active'));
      
      const target = link.getAttribute('data-target');
      document.getElementById(target).classList.add('active');
      
      if (target === 'module-systems') await loadSystems();
      if (target === 'module-downloads') await loadDownloads();
      if (target === 'module-licenses') await loadLicenses();
    });
  });

  document.getElementById('btn-logout').addEventListener('click', async (e) => {
    e.preventDefault();
    if (currentMemberId) {
      await supabaseClient.from('member_access_logs').insert([{ member_id: currentMemberId, action: 'logout' }]);
    }
    await supabaseClient.auth.signOut();
    window.location.href = 'cliente-login.html';
  });
}

async function loadDashboard() {
  if (!currentMemberId) return;
  
  const [
    { data: products },
    { data: downloads },
    { data: licenses }
  ] = await Promise.all([
    supabaseClient.from('member_products').select('id'),
    supabaseClient.from('member_downloads').select('id'),
    supabaseClient.from('member_licenses').select('id')
  ]);
  
  document.getElementById('kpi-products').textContent = products ? products.length : 0;
  document.getElementById('kpi-downloads').textContent = downloads ? downloads.length : 0;
  document.getElementById('kpi-licenses').textContent = licenses ? licenses.length : 0;
}

async function loadSystems() {
  if (!currentMemberId) return;
  const grid = document.getElementById('systems-grid');
  grid.innerHTML = '<div style="color: var(--text-muted);">Carregando produtos...</div>';
  
  const { data: products } = await supabaseClient.from('member_products')
    .select('*')
    .eq('access_granted', true);
    
  grid.innerHTML = '';
  
  if (!products || products.length === 0) {
    grid.innerHTML = '<div style="color: var(--text-muted);">Nenhum sistema liberado ainda.</div>';
    return;
  }
  
  products.forEach(p => {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.innerHTML = `
      <div class="p-cover">📦</div>
      <div class="p-body">
        <div class="p-title">${p.product_name}</div>
        <div class="p-meta">
          <span>Versão: ${p.version || '1.0.0'}</span>
          <span style="color: var(--success);">Ativo</span>
        </div>
        <button class="btn-download" onclick="downloadProduct('${p.product_name}', '${p.download_url || '#'}')">Fazer Download</button>
      </div>
    `;
    grid.appendChild(card);
  });
}

window.downloadProduct = async function(productName, url) {
  if (!currentMemberId) return;
  try {
    await supabaseClient.from('member_downloads').insert([{
      member_id: currentMemberId,
      product_name: productName,
      user_agent: navigator.userAgent
    }]);
    
    // Add engagement points implicitly in background via edge functions, or local increment
    // Since we can't safely increment without an RPC, we just let it be.
    
    if (url && url !== '#') {
      window.open(url, '_blank');
    } else {
      alert('Link de download ainda não configurado pelo administrador.');
    }
  } catch (err) {
    console.error("Error logging download", err);
  }
}

async function loadDownloads() {
  if (!currentMemberId) return;
  const tbody = document.getElementById('downloads-tbody');
  tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">Carregando...</td></tr>';
  
  const { data: downloads } = await supabaseClient.from('member_downloads')
    .select('*')
    .order('downloaded_at', { ascending: false });
    
  tbody.innerHTML = '';
  if (!downloads || downloads.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">Nenhum download realizado.</td></tr>';
    return;
  }
  
  downloads.forEach(d => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(d.downloaded_at).toLocaleString('pt-BR')}</td>
      <td>${d.product_name}</td>
      <td style="font-family: monospace;">${d.ip_address || 'Oculto'}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function loadLicenses() {
  if (!currentMemberId) return;
  const tbody = document.getElementById('licenses-tbody');
  tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Carregando...</td></tr>';
  
  const { data: licenses } = await supabaseClient.from('member_licenses')
    .select('*')
    .order('created_at', { ascending: false });
    
  tbody.innerHTML = '';
  if (!licenses || licenses.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Nenhuma licença gerada ainda.</td></tr>';
    return;
  }
  
  licenses.forEach(l => {
    const tr = document.createElement('tr');
    const color = l.status === 'active' ? 'var(--success)' : 'var(--danger)';
    tr.innerHTML = `
      <td style="font-weight: 600;">${l.product_name}</td>
      <td>${l.domain || 'Não vinculado'}</td>
      <td style="font-family: monospace; letter-spacing: 1px;">${l.license_key}</td>
      <td style="color: ${color}; text-transform: capitalize;">${l.status}</td>
      <td><button style="background: none; border: 1px solid var(--border); color: var(--text-secondary); padding: 4px 8px; border-radius: 4px; cursor: pointer;" onclick="navigator.clipboard.writeText('${l.license_key}'); alert('Chave copiada!')">Copiar</button></td>
    `;
    tbody.appendChild(tr);
  });
}
