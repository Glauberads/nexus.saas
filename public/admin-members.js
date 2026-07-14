/**
 * admin-members.js
 * Módulo 12: Gestão Manual de Membros
 * Injeta o HTML do módulo e toda a lógica de negócio via admin-members-api.
 * NUNCA usa service_role. Todas as operações sensíveis vão para a Edge Function.
 */

(function () {
  'use strict';

  // ── Constante da Edge Function ──────────────────────────────────────────────
  const API_URL = `${window.SUPABASE_URL || window._env_?.SUPABASE_URL || ''}/functions/v1/admin-members-api`;

  // ── Estado do módulo ────────────────────────────────────────────────────────
  let _supabase         = null;
  let _allMembers       = [];
  let _lastCreatedEmail = '';
  let _lastCreatedLink  = '';
  let _drawerMemberId   = null;
  let _drawerMemberEmail = null;
  let _drawerTab        = 'overview';
  let _products         = [];

  // ── Injeção do HTML do módulo na sidebar e no conteúdo ──────────────────────
  function injectHTML() {
    // 1. Adicionar item na sidebar se não existir
    const sidebar = document.querySelector('.sidebar-menu');
    if (sidebar && !document.querySelector('[data-target="module-members"]')) {
      const li = document.createElement('li');
      li.innerHTML = `<a href="#" data-target="module-members" style="color: #8B5CF6; font-weight: 600;">🎓 Área de Membros</a>`;
      sidebar.appendChild(li);
    }

    // 2. Injetar section no content area
    const contentArea = document.querySelector('.content-area');
    const mount = document.getElementById('members-module-mount');
    const target = mount || contentArea;
    if (!target || document.getElementById('module-members')) return;

    target.insertAdjacentHTML('beforeend', `
      <!-- MODULE 12: AREA DE MEMBROS -->
      <section id="module-members" class="module-section">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
          <div>
            <h2>🎓 Área de Membros (Gestão)</h2>
            <p style="color:var(--text-secondary);">Controle de acessos, downloads, licenças e retenção.</p>
          </div>
          <button onclick="window.open('cliente-login.html','_blank')" style="background:rgba(139,92,246,0.15);color:#8B5CF6;border:1px solid rgba(139,92,246,0.3);padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px;">Acessar Portal ↗</button>
        </div>

        <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin-bottom:24px;">
          <div class="kpi-card" style="border-top:3px solid #8B5CF6;"><h3 style="font-size:11px;">Membros Ativos</h3><div class="kpi-value" id="kpi-members-active" style="font-size:28px;color:#8B5CF6;">0</div></div>
          <div class="kpi-card"><h3 style="font-size:11px;">Total</h3><div class="kpi-value" id="kpi-members-total" style="font-size:28px;">0</div></div>
          <div class="kpi-card"><h3 style="font-size:11px;">Taxa de Ativação</h3><div class="kpi-value" id="kpi-members-activation" style="font-size:28px;">0%</div><div style="color:var(--text-muted);font-size:10px;margin-top:4px;">Onboarding Completo</div></div>
          <div class="kpi-card"><h3 style="font-size:11px;">Downloads</h3><div class="kpi-value" id="kpi-members-downloads" style="font-size:28px;">0</div></div>
          <div class="kpi-card"><h3 style="font-size:11px;">Licenças Ativas</h3><div class="kpi-value" id="kpi-members-licenses" style="font-size:28px;">0</div></div>
          <div class="kpi-card"><h3 style="font-size:11px;">MRR / Receita</h3><div class="kpi-value" id="kpi-members-mrr" style="font-size:22px;color:var(--success);">R$ 0</div></div>
        </div>

        <div class="table-card">
          <div class="table-header" style="flex-wrap:wrap;gap:12px;">
            <h3 style="margin-bottom:0;">Gestão de Acessos</h3>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
              <input type="text" id="search-members" placeholder="Nome, e-mail, CPF..." style="width:200px;" oninput="window.filterMembersTable&&window.filterMembersTable()">
              <select id="filter-members-status" onchange="window.filterMembersTable&&window.filterMembersTable()">
                <option value="">Todos os Status</option>
                <option value="active">Ativo</option>
                <option value="suspended">Suspenso</option>
                <option value="canceled">Cancelado</option>
              </select>
              <select id="filter-members-origin" onchange="window.filterMembersTable&&window.filterMembersTable()">
                <option value="">Todas as Origens</option>
                <option value="checkout">Checkout</option>
                <option value="manual_whatsapp">WhatsApp</option>
                <option value="manual">Manual</option>
              </select>
              <button id="btn-new-member" onclick="window.openNewMemberModal&&window.openNewMemberModal()" style="background:#8B5CF6;color:white;padding:8px 16px;border:none;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px;white-space:nowrap;">＋ Novo Membro</button>
            </div>
          </div>
          <table style="font-size:13px;">
            <thead>
              <tr>
                <th>Membro</th>
                <th>Contato</th>
                <th>Produtos</th>
                <th>Origem</th>
                <th>Valor Pago</th>
                <th>Status</th>
                <th>Validade</th>
                <th>Último Login</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody id="members-tbody">
              <tr><td colspan="9" style="text-align:center;color:var(--text-muted);">Carregando membros...</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- MODAL NOVO MEMBRO -->
      <div id="modal-new-member" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(6px);z-index:1000;overflow-y:auto;padding:40px 20px;">
        <div style="background:#1A1A1A;border:1px solid rgba(139,92,246,0.35);border-radius:16px;width:100%;max-width:680px;margin:0 auto;">
          <div style="padding:24px 28px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:18px;font-weight:800;">＋ Novo Membro Manual</div>
              <div style="font-size:13px;color:#71717A;margin-top:4px;">Acesso criado automaticamente no portal.</div>
            </div>
            <button onclick="window.closeNewMemberModal&&window.closeNewMemberModal()" style="background:none;border:none;color:#A1A1AA;font-size:24px;cursor:pointer;padding:4px;">✕</button>
          </div>
          <div style="padding:28px;">
            <div id="modal-member-feedback" style="display:none;padding:12px 16px;border-radius:8px;font-size:13px;font-weight:600;margin-bottom:20px;"></div>
            <form id="form-new-member" onsubmit="window.submitNewMember&&window.submitNewMember(event)">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
                <div><label style="display:block;font-size:11px;font-weight:700;color:#A1A1AA;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;">Nome Completo *</label><input id="nm-name" type="text" required placeholder="Nome do comprador" style="width:100%;padding:10px 14px;background:#0A0A0A;border:1px solid rgba(255,255,255,0.08);color:#EDEDED;border-radius:8px;font-size:14px;font-family:inherit;outline:none;"></div>
                <div><label style="display:block;font-size:11px;font-weight:700;color:#A1A1AA;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;">E-mail *</label><input id="nm-email" type="email" required placeholder="email@exemplo.com" style="width:100%;padding:10px 14px;background:#0A0A0A;border:1px solid rgba(255,255,255,0.08);color:#EDEDED;border-radius:8px;font-size:14px;font-family:inherit;outline:none;"></div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
                <div><label style="display:block;font-size:11px;font-weight:700;color:#A1A1AA;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;">WhatsApp *</label><input id="nm-phone" type="text" required placeholder="(22) 99999-9999" style="width:100%;padding:10px 14px;background:#0A0A0A;border:1px solid rgba(255,255,255,0.08);color:#EDEDED;border-radius:8px;font-size:14px;font-family:inherit;outline:none;"></div>
                <div><label style="display:block;font-size:11px;font-weight:700;color:#A1A1AA;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;">CPF (opcional)</label><input id="nm-cpf" type="text" placeholder="000.000.000-00" style="width:100%;padding:10px 14px;background:#0A0A0A;border:1px solid rgba(255,255,255,0.08);color:#EDEDED;border-radius:8px;font-size:14px;font-family:inherit;outline:none;"></div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
                <div><label style="display:block;font-size:11px;font-weight:700;color:#A1A1AA;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;">Produto *</label><select id="nm-product" required style="width:100%;padding:10px 14px;background:#0A0A0A;border:1px solid rgba(255,255,255,0.08);color:#EDEDED;border-radius:8px;font-size:14px;font-family:inherit;outline:none;"><option value="">Selecione...</option></select></div>
                <div><label style="display:block;font-size:11px;font-weight:700;color:#A1A1AA;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;">Plano</label><select id="nm-plan" style="width:100%;padding:10px 14px;background:#0A0A0A;border:1px solid rgba(255,255,255,0.08);color:#EDEDED;border-radius:8px;font-size:14px;font-family:inherit;outline:none;"><option value="standard">Standard</option><option value="premium">Premium</option><option value="vip">VIP</option><option value="lifetime">Lifetime</option></select></div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
                <div><label style="display:block;font-size:11px;font-weight:700;color:#A1A1AA;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;">Valor Pago (R$)</label><input id="nm-amount" type="number" step="0.01" min="0" placeholder="0.00" style="width:100%;padding:10px 14px;background:#0A0A0A;border:1px solid rgba(255,255,255,0.08);color:#EDEDED;border-radius:8px;font-size:14px;font-family:inherit;outline:none;"></div>
                <div><label style="display:block;font-size:11px;font-weight:700;color:#A1A1AA;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;">Pagamento</label><select id="nm-payment-method" style="width:100%;padding:10px 14px;background:#0A0A0A;border:1px solid rgba(255,255,255,0.08);color:#EDEDED;border-radius:8px;font-size:14px;font-family:inherit;outline:none;"><option value="pix_manual">PIX Manual</option><option value="cartao">Cartão</option><option value="transferencia">Transferência</option><option value="dinheiro">Dinheiro</option><option value="outro">Outro</option></select></div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:16px;">
                <div><label style="display:block;font-size:11px;font-weight:700;color:#A1A1AA;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;">Data da Compra</label><input id="nm-purchased-at" type="date" style="width:100%;padding:10px 14px;background:#0A0A0A;border:1px solid rgba(255,255,255,0.08);color:#EDEDED;border-radius:8px;font-size:14px;font-family:inherit;outline:none;"></div>
                <div><label style="display:block;font-size:11px;font-weight:700;color:#A1A1AA;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;">Origem</label><select id="nm-origin" style="width:100%;padding:10px 14px;background:#0A0A0A;border:1px solid rgba(255,255,255,0.08);color:#EDEDED;border-radius:8px;font-size:14px;font-family:inherit;outline:none;"><option value="manual_whatsapp">WhatsApp</option><option value="manual_instagram">Instagram</option><option value="manual_facebook">Facebook</option><option value="manual_indicacao">Indicação</option><option value="manual">Venda Interna</option><option value="outro">Outro</option></select></div>
                <div><label style="display:block;font-size:11px;font-weight:700;color:#A1A1AA;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;">Validade (dias)</label><input id="nm-access-days" type="number" min="1" value="365" style="width:100%;padding:10px 14px;background:#0A0A0A;border:1px solid rgba(255,255,255,0.08);color:#EDEDED;border-radius:8px;font-size:14px;font-family:inherit;outline:none;"></div>
              </div>
              <div style="margin-bottom:24px;"><label style="display:block;font-size:11px;font-weight:700;color:#A1A1AA;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;">Observações</label><textarea id="nm-notes" rows="3" placeholder="Ex: Pagou via Pix direto..." style="width:100%;padding:10px 14px;background:#0A0A0A;border:1px solid rgba(255,255,255,0.08);color:#EDEDED;border-radius:8px;font-size:14px;font-family:inherit;outline:none;resize:vertical;"></textarea></div>
              <div style="display:flex;gap:12px;justify-content:flex-end;">
                <button type="button" onclick="window.closeNewMemberModal&&window.closeNewMemberModal()" style="padding:12px 20px;background:none;border:1px solid rgba(255,255,255,0.08);color:#A1A1AA;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">Cancelar</button>
                <button type="submit" id="btn-submit-member" style="padding:12px 24px;background:#8B5CF6;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:700;"><span id="btn-submit-member-text">Cadastrar e Gerar Acesso</span></button>
              </div>
            </form>
            <div id="member-created-result" style="display:none;margin-top:20px;">
              <div style="background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:12px;padding:20px;">
                <div style="font-size:15px;font-weight:700;color:#22C55E;margin-bottom:8px;">✓ Membro cadastrado com sucesso!</div>
                <div style="font-size:13px;color:#A1A1AA;margin-bottom:16px;" id="member-created-info"></div>
                <div style="display:flex;gap:10px;flex-wrap:wrap;">
                  <button onclick="window.copyAccessLink&&window.copyAccessLink()" id="btn-copy-link" style="padding:10px 16px;background:rgba(139,92,246,0.2);border:1px solid rgba(139,92,246,0.4);color:#8B5CF6;border-radius:8px;cursor:pointer;font-weight:700;font-size:13px;">📋 Copiar Link</button>
                  <button onclick="window.sendAccessEmailResult&&window.sendAccessEmailResult()" style="padding:10px 16px;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);color:#3B82F6;border-radius:8px;cursor:pointer;font-weight:700;font-size:13px;">📧 Enviar E-mail</button>
                  <button onclick="window.openWhatsAppAccess&&window.openWhatsAppAccess()" style="padding:10px 16px;background:rgba(37,211,102,0.15);border:1px solid rgba(37,211,102,0.3);color:#25D366;border-radius:8px;cursor:pointer;font-weight:700;font-size:13px;">💬 WhatsApp</button>
                  <button onclick="window.resetNewMemberForm&&window.resetNewMemberForm()" style="padding:10px 16px;background:none;border:1px solid rgba(255,255,255,0.08);color:#A1A1AA;border-radius:8px;cursor:pointer;font-size:13px;">Cadastrar Outro</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- DRAWER 360° MEMBRO -->
      <div class="drawer-overlay" id="drawer-member" onclick="if(event.target===this)window.closeMemberDrawer&&window.closeMemberDrawer()">
        <div class="drawer-panel" style="width:560px;">
          <div class="drawer-header">
            <div>
              <div class="drawer-title" id="drawer-member-name">Membro</div>
              <div class="drawer-subtitle" id="drawer-member-email">—</div>
            </div>
            <button class="drawer-close" onclick="window.closeMemberDrawer&&window.closeMemberDrawer()">✕</button>
          </div>
          <div style="padding:16px 24px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;gap:8px;flex-wrap:wrap;">
            <button onclick="window.drawerSendAccess&&window.drawerSendAccess()" style="padding:6px 12px;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);color:#3B82F6;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;">📧 Enviar Acesso</button>
            <button onclick="window.drawerGenerateLink&&window.drawerGenerateLink()" style="padding:6px 12px;background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:#8B5CF6;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;">🔗 Gerar Link</button>
            <button onclick="window.drawerSuspend&&window.drawerSuspend()" style="padding:6px 12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#EF4444;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;">🔒 Suspender</button>
            <button onclick="window.drawerReactivate&&window.drawerReactivate()" style="padding:6px 12px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);color:#22C55E;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;">🔓 Reativar</button>
            <button onclick="window.drawerAddProduct&&window.drawerAddProduct()" style="padding:6px 12px;background:rgba(255,107,0,0.15);border:1px solid rgba(255,107,0,0.3);color:#FF6B00;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;">＋ Produto</button>
          </div>
          <div style="display:flex;border-bottom:1px solid rgba(255,255,255,0.08);padding:0 24px;overflow-x:auto;">
            <button class="drawer-tab-btn" data-tab="overview" onclick="window.switchDrawerTab&&window.switchDrawerTab('overview',this)" style="padding:12px 14px;background:none;border:none;border-bottom:2px solid #8B5CF6;color:#8B5CF6;cursor:pointer;font-size:13px;font-weight:600;white-space:nowrap;transition:all .2s;">Visão Geral</button>
            <button class="drawer-tab-btn" data-tab="products" onclick="window.switchDrawerTab&&window.switchDrawerTab('products',this)" style="padding:12px 14px;background:none;border:none;border-bottom:2px solid transparent;color:#A1A1AA;cursor:pointer;font-size:13px;font-weight:600;white-space:nowrap;transition:all .2s;">Produtos</button>
            <button class="drawer-tab-btn" data-tab="licenses" onclick="window.switchDrawerTab&&window.switchDrawerTab('licenses',this)" style="padding:12px 14px;background:none;border:none;border-bottom:2px solid transparent;color:#A1A1AA;cursor:pointer;font-size:13px;font-weight:600;white-space:nowrap;transition:all .2s;">Licenças</button>
            <button class="drawer-tab-btn" data-tab="history" onclick="window.switchDrawerTab&&window.switchDrawerTab('history',this)" style="padding:12px 14px;background:none;border:none;border-bottom:2px solid transparent;color:#A1A1AA;cursor:pointer;font-size:13px;font-weight:600;white-space:nowrap;transition:all .2s;">Histórico</button>
            <button class="drawer-tab-btn" data-tab="audit" onclick="window.switchDrawerTab&&window.switchDrawerTab('audit',this)" style="padding:12px 14px;background:none;border:none;border-bottom:2px solid transparent;color:#A1A1AA;cursor:pointer;font-size:13px;font-weight:600;white-space:nowrap;transition:all .2s;">Auditoria</button>
          </div>
          <div class="drawer-body" id="drawer-member-body">
            <div style="text-align:center;color:#71717A;padding:40px;">Selecione um membro.</div>
          </div>
        </div>
      </div>
    `);
  }

  // ── Helper: chamar a Edge Function ───────────────────────────────────────────
  async function callApi(payload) {
    const sb = window.supabaseClient || _supabase;
    if (!sb) throw new Error('Supabase não inicializado.');
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error('Sessão expirada.');

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': window.SUPABASE_ANON_KEY || window._env_?.SUPABASE_ANON_KEY || '',
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error || 'Erro desconhecido na API.');
    return json;
  }

  // ── Carregar membros ─────────────────────────────────────────────────────────
  async function loadMembersModule() {
    try {
      const res = await callApi({ action: 'get_members', limit: 500, offset: 0 });
      if (res.module_not_installed) {
        document.getElementById('members-tbody').innerHTML = '<tr><td colspan="9" style="text-align:center;color:#EF4444;padding:32px;font-weight:600;">Módulo administrativo ainda não instalado. Por favor, execute a migration SQL.</td></tr>';
        return;
      }

      const members = res.members || [];
      _allMembers = members;

      const active  = members.filter(m => m.status === 'active');
      const onboard = members.filter(m => m.onboarding_completed);
      const activeLic = []; // Simplified for KPI, can't easily fetch all licenses here without RPC change
      const activationRate = members.length > 0 ? (onboard.length / members.length * 100).toFixed(1) : 0;

      const totalSpent = members.reduce((acc, m) => acc + (parseFloat(m.total_spent) || 0), 0);

      const el = id => document.getElementById(id);
      if (el('kpi-members-active'))     el('kpi-members-active').textContent    = active.length;
      if (el('kpi-members-total'))      el('kpi-members-total').textContent     = members.length;
      if (el('kpi-members-activation')) el('kpi-members-activation').textContent = `${activationRate}%`;
      // if (el('kpi-members-downloads'))  el('kpi-members-downloads').textContent  = (downloads || []).length;
      // if (el('kpi-members-licenses'))   el('kpi-members-licenses').textContent   = activeLic.length;
      if (el('kpi-members-mrr'))        el('kpi-members-mrr').textContent        = `R$ ${totalSpent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

      renderMembersTable(members);

      // Carregar lista de produtos para o modal
    try {
      const res = await callApi({ action: 'get_products_list' });
      _products = res.products || [];
      const sel = document.getElementById('nm-product');
      if (sel && _products.length) {
        sel.innerHTML = '<option value="">Selecione...</option>' +
          _products.map(p => `<option value="${escHtml(p.name)}" data-slug="${escHtml(p.checkout_slug || '')}">${escHtml(p.name)}</option>`).join('');
      }
    } catch (_) { /* produtos não críticos */ }
  }

  // ── Renderizar tabela ────────────────────────────────────────────────────────
  function renderMembersTable(members) {
    const tbody = document.getElementById('members-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!members || members.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:32px;">Nenhum membro encontrado.</td></tr>';
      return;
    }

    const sorted = [...members].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    sorted.forEach(m => {
      const statusColor  = m.status === 'active' ? '#22C55E' : m.status === 'suspended' ? '#F59E0B' : '#EF4444';
      const originLabel  = { checkout: '🛒 Checkout', manual_whatsapp: '💬 WhatsApp', manual: '👤 Manual' }[m.origin] || m.origin || '—';
      const lastLogin    = m.last_login_at  ? new Date(m.last_login_at).toLocaleDateString('pt-BR')  : 'Nunca';
      const expiresAt    = m.expires_at     ? new Date(m.expires_at).toLocaleDateString('pt-BR')     : '—';
      const totalSpent   = parseFloat(m.total_spent || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const productCount = parseInt(m.product_count || 0);

      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.onclick = () => openMemberDrawer(m);
      tr.innerHTML = `
        <td>
          <div style="font-weight:600;">${escHtml(m.name)}</div>
          <div style="font-size:11px;color:var(--text-muted);">${escHtml(m.id.substring(0, 8))}...</div>
        </td>
        <td>
          <div>${escHtml(m.email)}</div>
          ${m.phone ? `<div style="font-size:11px;color:var(--text-muted);">${escHtml(m.phone)}</div>` : ''}
        </td>
        <td><span style="background:rgba(139,92,246,0.15);color:#8B5CF6;padding:3px 10px;border-radius:100px;font-size:12px;font-weight:700;">${productCount} produto${productCount !== 1 ? 's' : ''}</span></td>
        <td><span style="font-size:12px;">${originLabel}</span></td>
        <td>${totalSpent}</td>
        <td><span style="color:${statusColor};font-weight:700;text-transform:capitalize;">${m.status}</span></td>
        <td>${expiresAt}</td>
        <td>${lastLogin}</td>
        <td onclick="event.stopPropagation()">
          <div style="display:flex;gap:6px;">
            <button onclick="window.openMemberDrawer&&window.openMemberDrawer(${JSON.stringify(m).split('"').join("'")})" style="padding:4px 10px;background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:#8B5CF6;border-radius:4px;cursor:pointer;font-size:11px;font-weight:700;">360°</button>
            <button onclick="window.quickSendAccess('${escHtml(m.email)}','${escHtml(m.id)}')" style="padding:4px 10px;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);color:#3B82F6;border-radius:4px;cursor:pointer;font-size:11px;font-weight:700;">Acesso</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ── Filtro local ─────────────────────────────────────────────────────────────
  window.filterMembersTable = function () {
    const search = (document.getElementById('search-members')?.value || '').toLowerCase();
    const status = document.getElementById('filter-members-status')?.value || '';
    const origin = document.getElementById('filter-members-origin')?.value || '';

    const filtered = _allMembers.filter(m => {
      const matchSearch = !search ||
        (m.name  || '').toLowerCase().includes(search) ||
        (m.email || '').toLowerCase().includes(search) ||
        (m.phone || '').toLowerCase().includes(search) ||
        (m.cpf   || '').toLowerCase().includes(search);
      const matchStatus = !status || m.status === status;
      const matchOrigin = !origin || (m.origin || '').startsWith(origin);
      return matchSearch && matchStatus && matchOrigin;
    });

    renderMembersTable(filtered);
  };

  // ── Modal Novo Membro ────────────────────────────────────────────────────────
  window.openNewMemberModal = function () {
    const modal = document.getElementById('modal-new-member');
    if (!modal) return;
    window.resetNewMemberForm();
    // Data padrão: hoje
    const today = new Date().toISOString().split('T')[0];
    const el = document.getElementById('nm-purchased-at');
    if (el) el.value = today;
    modal.style.display = 'block';
  };

  window.closeNewMemberModal = function () {
    const modal = document.getElementById('modal-new-member');
    if (modal) modal.style.display = 'none';
  };

  window.resetNewMemberForm = function () {
    const form = document.getElementById('form-new-member');
    if (form) form.reset();
    const fb = document.getElementById('modal-member-feedback');
    if (fb) { fb.style.display = 'none'; fb.textContent = ''; }
    const result = document.getElementById('member-created-result');
    if (result) result.style.display = 'none';
    if (form) form.style.display = '';
    const btnText = document.getElementById('btn-submit-member-text');
    if (btnText) btnText.textContent = 'Cadastrar e Gerar Acesso';
    const btn = document.getElementById('btn-submit-member');
    if (btn) btn.disabled = false;
  };

  function showModalFeedback(msg, isError = false) {
    const fb = document.getElementById('modal-member-feedback');
    if (!fb) return;
    fb.textContent = msg;
    fb.style.display = 'block';
    fb.style.background = isError ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)';
    fb.style.border = isError ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(34,197,94,0.3)';
    fb.style.color = isError ? '#EF4444' : '#22C55E';
  }

  window.submitNewMember = async function (e) {
    e.preventDefault();
    const btn     = document.getElementById('btn-submit-member');
    const btnText = document.getElementById('btn-submit-member-text');
    if (!btn) return;

    btn.disabled = true;
    if (btnText) btnText.textContent = 'Cadastrando...';
    showModalFeedback('Processando...', false);

    const productSel  = document.getElementById('nm-product');
    const productName = productSel?.value || '';
    const productSlug = productSel?.selectedOptions[0]?.dataset?.slug || '';

    try {
      const result = await callApi({
        action:          'create_manual_member',
        name:            document.getElementById('nm-name')?.value || '',
        email:           document.getElementById('nm-email')?.value || '',
        phone:           document.getElementById('nm-phone')?.value || '',
        cpf:             document.getElementById('nm-cpf')?.value || '',
        product_name:    productName,
        product_slug:    productSlug,
        plan:            document.getElementById('nm-plan')?.value || 'standard',
        amount_paid:     document.getElementById('nm-amount')?.value || '0',
        payment_method:  document.getElementById('nm-payment-method')?.value || 'pix_manual',
        purchased_at:    document.getElementById('nm-purchased-at')?.value || '',
        origin:          document.getElementById('nm-origin')?.value || 'manual_whatsapp',
        access_days:     document.getElementById('nm-access-days')?.value || '365',
        notes:           document.getElementById('nm-notes')?.value || '',
      });

      _lastCreatedEmail = document.getElementById('nm-email')?.value || '';
      _lastCreatedLink  = result.access_link || '';

      // Esconder form, mostrar resultado
      const form = document.getElementById('form-new-member');
      if (form) form.style.display = 'none';
      const resultEl = document.getElementById('member-created-result');
      if (resultEl) resultEl.style.display = 'block';

      const expiresAt = result.expires_at ? new Date(result.expires_at).toLocaleDateString('pt-BR') : '';
      const info = document.getElementById('member-created-info');
      if (info) {
        info.innerHTML = `
          <strong>${_lastCreatedEmail}</strong><br>
          Licença: <code>${result.license_key || '—'}</code><br>
          Usuário Auth: ${result.auth_created ? '✅ Novo' : '♻️ Reutilizado'}<br>
          Validade: ${expiresAt}<br>
          ${result.access_link ? '🔗 Link de acesso gerado.' : '⚠️ Link de acesso não disponível agora.'}
        `;
      }

      // Recarregar lista
      await loadMembersModule();
    } catch (err) {
      showModalFeedback(err.message, true);
      if (btnText) btnText.textContent = 'Cadastrar e Gerar Acesso';
      btn.disabled = false;
    }
  };

  // ── Ações pós-criação ────────────────────────────────────────────────────────
  window.copyAccessLink = function () {
    if (!_lastCreatedLink) {
      alert('Link não disponível. Gere um novo link pelo painel 360°.');
      return;
    }
    navigator.clipboard.writeText(_lastCreatedLink).then(() => {
      const btn = document.getElementById('btn-copy-link');
      if (btn) { const orig = btn.textContent; btn.textContent = '✓ Copiado!'; setTimeout(() => { btn.textContent = orig; }, 2000); }
    });
  };

  window.sendAccessEmailResult = async function () {
    if (!_lastCreatedEmail) return;
    try {
      await callApi({ action: 'send_access_email', email: _lastCreatedEmail });
      alert(`✓ E-mail de acesso enviado para ${_lastCreatedEmail}`);
    } catch (err) {
      alert(`Erro ao enviar: ${err.message}`);
    }
  };

  window.openWhatsAppAccess = function () {
    const phone = (document.getElementById('nm-phone')?.value || '').replace(/\D/g, '');
    const link  = _lastCreatedLink || '';
    const msg   = encodeURIComponent(`Olá! Seu acesso foi criado. Clique no link para definir sua senha e entrar:\n\n${link || 'Link em breve.'}`);
    const wNumber = phone.startsWith('55') ? phone : `55${phone}`;
    window.open(`https://wa.me/${wNumber}?text=${msg}`, '_blank');
  };

  // ── Quick action da tabela ───────────────────────────────────────────────────
  window.quickSendAccess = async function (email, memberId) {
    if (!confirm(`Enviar link de acesso para ${email}?`)) return;
    try {
      await callApi({ action: 'send_access_email', email, member_id: memberId });
      alert(`✓ Acesso enviado para ${email}`);
    } catch (err) {
      alert(`Erro: ${err.message}`);
    }
  };

  // ── Drawer 360° ──────────────────────────────────────────────────────────────
  window.openMemberDrawer = function (member) {
    if (typeof member === 'string') {
      try { member = JSON.parse(member.replace(/'/g, '"')); } catch (_) { return; }
    }
    _drawerMemberId    = member.id;
    _drawerMemberEmail = member.email;

    document.getElementById('drawer-member-name').textContent  = member.name || '—';
    document.getElementById('drawer-member-email').textContent = member.email || '—';
    document.getElementById('drawer-member').classList.add('active');

    // Reset tabs
    document.querySelectorAll('.drawer-tab-btn').forEach(b => {
      b.style.borderBottom = '2px solid transparent';
      b.style.color = '#A1A1AA';
    });
    const firstTab = document.querySelector('.drawer-tab-btn[data-tab="overview"]');
    if (firstTab) { firstTab.style.borderBottom = '2px solid #8B5CF6'; firstTab.style.color = '#8B5CF6'; }

    loadDrawerTab('overview', member);
  };

  window.closeMemberDrawer = function () {
    document.getElementById('drawer-member').classList.remove('active');
    _drawerMemberId = null;
  };

  window.switchDrawerTab = function (tab, btn) {
    _drawerTab = tab;
    document.querySelectorAll('.drawer-tab-btn').forEach(b => {
      b.style.borderBottom = '2px solid transparent';
      b.style.color = '#A1A1AA';
    });
    btn.style.borderBottom = '2px solid #8B5CF6';
    btn.style.color = '#8B5CF6';
    if (_drawerMemberId) loadDrawerTab(tab);
  };

  async function loadDrawerTab(tab, memberData) {
    const body = document.getElementById('drawer-member-body');
    if (!body) return;
    body.innerHTML = '<div style="text-align:center;color:#71717A;padding:40px;">Carregando...</div>';

    try {
      const res  = await callApi({ action: 'get_member_detail', member_id: _drawerMemberId });
      const data = res.detail || {};

      if (data.module_not_installed) {
        body.innerHTML = '<div style="color:#EF4444;text-align:center;padding:40px;font-weight:600;">Módulo administrativo ainda não instalado.</div>';
        return;
      }

      const m    = memberData || data.member || {};
      const products  = data.products  || [];
      const licenses  = data.licenses  || [];
      const downloads = data.downloads || [];
      const accesses  = data.accesses  || [];
      const purchases = data.purchases || [];
      const audit     = data.audit     || [];
      
      const hasHistoryConfigured = data.history_configured !== false;

      if (tab === 'overview') {
        const expires = m.expires_at ? new Date(m.expires_at).toLocaleDateString('pt-BR') : '—';
        const lastLogin = m.last_login_at ? new Date(m.last_login_at).toLocaleString('pt-BR') : 'Nunca';
        body.innerHTML = `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:14px;">
              <div style="font-size:11px;color:#71717A;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">Status</div>
              <div style="font-weight:700;color:${m.status==='active'?'#22C55E':'#EF4444'};text-transform:capitalize;">${m.status||'—'}</div>
            </div>
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:14px;">
              <div style="font-size:11px;color:#71717A;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">Validade</div>
              <div style="font-weight:700;">${expires}</div>
            </div>
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:14px;">
              <div style="font-size:11px;color:#71717A;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">Plano</div>
              <div style="font-weight:700;">${m.plan||'standard'}</div>
            </div>
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:14px;">
              <div style="font-size:11px;color:#71717A;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">Último Login</div>
              <div style="font-weight:700;font-size:12px;">${lastLogin}</div>
            </div>
          </div>
          <div style="margin-bottom:16px;">
            <div style="font-size:12px;font-weight:700;color:#A1A1AA;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Dados Pessoais</div>
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:14px;display:grid;gap:6px;font-size:13px;">
              <div><span style="color:#71717A;">Nome:</span> <strong>${escHtml(m.name||'—')}</strong></div>
              <div><span style="color:#71717A;">E-mail:</span> ${escHtml(m.email||'—')}</div>
              <div><span style="color:#71717A;">Telefone:</span> ${escHtml(m.phone||'—')}</div>
              <div><span style="color:#71717A;">CPF:</span> ${escHtml(m.cpf||'—')}</div>
              <div><span style="color:#71717A;">Origem:</span> ${escHtml(m.origin||'—')}</div>
            </div>
          </div>
          ${purchases.length ? `
          <div>
            <div style="font-size:12px;font-weight:700;color:#A1A1AA;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Compras (${purchases.length})</div>
            ${purchases.slice(0,5).map(p => `<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:12px;margin-bottom:6px;font-size:13px;display:flex;justify-content:space-between;align-items:center;">
              <div><div style="font-weight:600;">${escHtml(p.product_name||'—')}</div><div style="color:#71717A;font-size:11px;">${p.created_at?new Date(p.created_at).toLocaleDateString('pt-BR'):''} · ${escHtml(p.source||'checkout')}</div></div>
              <div style="color:#22C55E;font-weight:700;">R$ ${parseFloat(p.amount||0).toFixed(2)}</div>
            </div>`).join('')}
          </div>` : ''}
        `;
      } else if (tab === "products") {
        try {
        body.innerHTML = products.length ? products.map(p => `
          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-weight:700;">${escHtml(p.product_name||'—')}</div>
              <div style="font-size:11px;color:#71717A;">Versão: ${escHtml(p.version||'—')} · Expira: ${p.expires_at?new Date(p.expires_at).toLocaleDateString('pt-BR'):'Sem expiração'}</div>
            </div>
            <div style="display:flex;gap:6px;align-items:center;">
              <span style="font-size:11px;font-weight:700;padding:3px 8px;border-radius:100px;background:${p.access_granted?'rgba(34,197,94,0.15)':'rgba(239,68,68,0.15)'};color:${p.access_granted?'#22C55E':'#EF4444'};">${p.access_granted?'Ativo':'Suspenso'}</span>
              <button onclick="window.drawerRemoveProduct('${escHtml(p.product_name||'')}')" style="padding:3px 8px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#EF4444;border-radius:4px;cursor:pointer;font-size:11px;">Remover</button>
            </div>
          </div>
        `).join('') : '<div style="color:#71717A;text-align:center;padding:32px;">Nenhum produto concedido.</div>';
      } catch(e){ body.innerHTML="<div style=\"color:#EF4444;text-align:center;padding:32px;\">Erro ao carregar produtos.</div>" }
      } else if (tab === "licenses") {
        try {
        body.innerHTML = licenses.length ? licenses.map(l => `
          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:14px;margin-bottom:8px;">
            <div style="font-weight:700;margin-bottom:4px;">${escHtml(l.product_name||'—')}</div>
            <div style="font-family:monospace;font-size:12px;color:#8B5CF6;margin-bottom:6px;">${escHtml(l.license_key||'—')}</div>
            <div style="font-size:11px;color:#71717A;">Status: ${l.status} · Expira: ${l.expires_at?new Date(l.expires_at).toLocaleDateString('pt-BR'):'—'}</div>
            <div style="display:flex;gap:6px;margin-top:8px;">
              <button onclick="navigator.clipboard.writeText('${escHtml(l.license_key||'')}');alert('Chave copiada!')" style="padding:3px 8px;background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.3);color:#8B5CF6;border-radius:4px;cursor:pointer;font-size:11px;">Copiar</button>
              <button onclick="window.drawerRenewLicense('${escHtml(l.product_name||'')}')" style="padding:3px 8px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);color:#22C55E;border-radius:4px;cursor:pointer;font-size:11px;">Renovar</button>
            </div>
          </div>
        `).join('') : '<div style="color:#71717A;text-align:center;padding:32px;">Nenhuma licença.</div>';
      } catch(e){ body.innerHTML="<div style=\"color:#EF4444;text-align:center;padding:32px;\">Erro ao carregar licenças.</div>" }
      } else if (tab === "history") {
        try {
        if (!hasHistoryConfigured && accesses.length === 0) {
          body.innerHTML = '<div style="color:#71717A;text-align:center;padding:32px;">Histórico de acessos ainda não configurado.</div>';
        } else {
          const items = [...accesses.slice(0, 10), ...downloads.slice(0, 10)].sort((a, b) =>
            new Date(b.created_at || b.downloaded_at) - new Date(a.created_at || a.downloaded_at));
          body.innerHTML = items.length ? `<div class="timeline">${items.map(item => `
            <div class="timeline-item">
              <div class="timeline-time">${new Date(item.created_at||item.downloaded_at).toLocaleString('pt-BR')}</div>
              <div class="timeline-event">${item.action ? `🔑 ${escHtml(item.action)}` : `📥 Download: ${escHtml(item.product_name||'—')}`}</div>
              ${item.ip_address ? `<div class="timeline-desc">IP: ${escHtml(item.ip_address)}</div>` : ''}
            </div>`).join('')}</div>` : '<div style="color:#71717A;text-align:center;padding:32px;">Sem histórico.</div>';
        }
      } catch(e){ body.innerHTML="<div style=\"color:#EF4444;text-align:center;padding:32px;\">Erro ao carregar histórico.</div>" }
      } else if (tab === "audit") {
        try {
        body.innerHTML = audit.length ? audit.map(a => `
          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:12px;margin-bottom:6px;font-size:12px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
              <span style="font-weight:700;color:#8B5CF6;">${escHtml(a.action||'—')}</span>
              <span style="color:#71717A;">${new Date(a.created_at).toLocaleString('pt-BR')}</span>
            </div>
            <div style="color:#71717A;">IP: ${escHtml(a.ip_address||'—')}</div>
          </div>
        `).join('') : '<div style="color:#71717A;text-align:center;padding:32px;">Nenhum registro de auditoria.</div>';
      } catch(e){ body.innerHTML="<div style=\"color:#EF4444;text-align:center;padding:32px;\">Erro ao carregar auditoria.</div>" }
      }
    } catch (err) {
      body.innerHTML = `<div style="color:#EF4444;padding:32px;text-align:center;">Erro: ${escHtml(err.message)}</div>`;
    }
  }

  // ── Ações do Drawer ──────────────────────────────────────────────────────────
  window.drawerSendAccess = async function () {
    if (!_drawerMemberEmail) return;
    try {
      await callApi({ action: 'send_access_email', email: _drawerMemberEmail, member_id: _drawerMemberId });
      alert(`✓ Link de acesso enviado para ${_drawerMemberEmail}`);
    } catch (err) { alert(`Erro: ${err.message}`); }
  };

  window.drawerGenerateLink = async function () {
    if (!_drawerMemberEmail) return;
    try {
      const res = await callApi({ action: 'generate_access_link', email: _drawerMemberEmail, member_id: _drawerMemberId });
      if (res.access_link) {
        navigator.clipboard.writeText(res.access_link);
        alert(`✓ Link copiado!\n\n${res.access_link}`);
      } else {
        alert('Não foi possível gerar o link.');
      } catch(e){ body.innerHTML="<div style=\"color:#EF4444;text-align:center;padding:32px;\">Erro ao carregar auditoria.</div>" }
      }
    } catch (err) { alert(`Erro: ${err.message}`); }
  };

  window.drawerSuspend = async function () {
    if (!_drawerMemberId || !confirm('Suspender este membro? Todos os produtos serão bloqueados.')) return;
    try {
      await callApi({ action: 'update_member_status', member_id: _drawerMemberId, status: 'suspended' });
      alert('✓ Membro suspenso.');
      closeMemberDrawer();
      await loadMembersModule();
    } catch (err) { alert(`Erro: ${err.message}`); }
  };

  window.drawerReactivate = async function () {
    if (!_drawerMemberId || !confirm('Reativar este membro?')) return;
    try {
      await callApi({ action: 'update_member_status', member_id: _drawerMemberId, status: 'active' });
      alert('✓ Membro reativado.');
      closeMemberDrawer();
      await loadMembersModule();
    } catch (err) { alert(`Erro: ${err.message}`); }
  };

  window.drawerAddProduct = async function () {
    if (!_drawerMemberId) return;
    const name = prompt('Nome do produto a adicionar:');
    if (!name) return;
    const days = parseInt(prompt('Validade em dias (padrão 365):') || '365', 10);
    try {
      await callApi({ action: 'add_product', member_id: _drawerMemberId, product_name: name, access_days: days });
      alert(`✓ Produto "${name}" adicionado!`);
      loadDrawerTab(_drawerTab);
      await loadMembersModule();
    } catch (err) { alert(`Erro: ${err.message}`); }
  };

  window.drawerRemoveProduct = async function (productName) {
    if (!_drawerMemberId || !confirm(`Remover produto "${productName}"?`)) return;
    try {
      await callApi({ action: 'remove_product', member_id: _drawerMemberId, product_name: productName });
      alert(`✓ Produto removido.`);
      loadDrawerTab(_drawerTab);
      await loadMembersModule();
    } catch (err) { alert(`Erro: ${err.message}`); }
  };

  window.drawerRenewLicense = async function (productName) {
    if (!_drawerMemberId) return;
    const days = parseInt(prompt('Renovar por quantos dias? (padrão 365):') || '365', 10);
    try {
      await callApi({ action: 'renew_license', member_id: _drawerMemberId, product_name: productName, access_days: days });
      alert(`✓ Licença renovada!`);
      loadDrawerTab(_drawerTab);
    } catch (err) { alert(`Erro: ${err.message}`); }
  };

  // ── Helper: escape HTML ──────────────────────────────────────────────────────
  function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Init: aguardar o router do admin-app.js ──────────────────────────────────
  function init() {
    _supabase = window.supabaseClient;

    injectHTML();

    // Registrar a section no router do admin-app.js (ele usa data-target)
    // Adicionar listener no link da sidebar
    document.querySelectorAll('[data-target="module-members"]').forEach(link => {
      link.addEventListener('click', async (e) => {
        e.preventDefault();
        // Esconder todas as sections
        document.querySelectorAll('.module-section').forEach(s => s.classList.remove('active'));
        // Ativar a section members
        const sec = document.getElementById('module-members');
        if (sec) sec.classList.add('active');
        // Desativar links
        document.querySelectorAll('.sidebar-menu a').forEach(a => a.classList.remove('active'));
        link.classList.add('active');
        // Carregar dados
        await loadMembersModule();
      });
    });

    // Sobrescrever a função loadMembersModule do admin-app.js (manter compatibilidade)
    window.loadMembersModule = loadMembersModule;
  }

  // Aguardar DOM + admin-app.js estar carregado
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 100); // Aguardar admin-app.js inicializar supabaseClient
  }

})();
