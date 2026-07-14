let supabaseClient = null;
const urlParams = new URLSearchParams(window.location.search);
let productId = urlParams.get('product_id');
const productSlug = urlParams.get('product');

let currentBuilderState = null;

if (!productId && !productSlug) {
  alert("Product ID ou Slug não fornecido na URL.");
  window.location.href = 'admin-dashboard.html';
}

document.addEventListener('DOMContentLoaded', async () => {
  if (window.NexusTracker && window.NexusTracker.config) {
    supabaseClient = window.supabase.createClient(
      window.NexusTracker.config.SUPABASE_URL, 
      window.NexusTracker.config.SUPABASE_ANON_KEY
    );
  }

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    alert("Acesso negado. Faça login no Painel Admin.");
    window.location.href = 'admin-login.html';
    return;
  }

  if (!productId && productSlug) {
    const { data } = await supabaseClient.from('products').select('id').eq('checkout_slug', productSlug).single();
    if (data) {
      productId = data.id;
    } else {
      alert("Produto não encontrado.");
      window.location.href = 'admin-dashboard.html';
      return;
    }
  }

  const iframe = document.getElementById('checkout-preview-frame');
  iframe.src = `checkout.html?preview=1&product_id=${productId}&product=${productSlug}`;

  // Tabs de navegação
  document.querySelectorAll('.builder-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.builder-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });

  // Botões de dispositivo
  document.querySelectorAll('.device-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.device-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      iframe.className = `iframe-${btn.dataset.device}`;
    });
  });

  // Sincronizar input type=color e input type=text
  const colorPicker = document.getElementById('b-theme-color');
  const colorHex = document.getElementById('b-theme-color-hex');
  
  colorPicker.addEventListener('input', (e) => {
    colorHex.value = e.target.value.toUpperCase();
    sendPreviewUpdate();
    markUnsavedChanges();
  });
  colorHex.addEventListener('input', (e) => {
    colorPicker.value = e.target.value;
    sendPreviewUpdate();
    markUnsavedChanges();
  });

  // Listeners para Inputs
  const inputs = [
    'b-button-text', 'b-guarantee-title', 'b-benefits-list', 
    'b-timer-enabled', 'b-timer-minutes', 'b-social-proof-enabled'
  ];
  inputs.forEach(id => {
    document.getElementById(id).addEventListener('input', () => { sendPreviewUpdate(); markUnsavedChanges(); });
    document.getElementById(id).addEventListener('change', () => { sendPreviewUpdate(); markUnsavedChanges(); });
  });

  await loadBuilderState();

  iframe.onload = () => {
    setTimeout(sendPreviewUpdate, 500);
  };
});

function markUnsavedChanges() {
  document.getElementById('save-status').textContent = "Alterações não salvas";
  document.getElementById('save-status').style.color = "var(--accent)";
}

// Normaliza o formato legado para o novo JSON
function normalizeCheckoutConfig(data) {
  if (!data) return buildEmptyConfig();
  if (data.schemaVersion === 1) return data; // já no formato novo

  // Fallback do formato legado
  const theme = data.theme_config || {};
  const content = data.content_config || {};
  const conv = data.conversion_config || {};

  return {
    schemaVersion: 1,
    theme: {
      primaryColor: theme.theme_color || '#FF6B00',
      backgroundColor: '#0A0A0A',
      textColor: '#EDEDED'
    },
    buttons: {
      text: content.button_text || '⚡ QUERO MEU ACESSO AGORA'
    },
    blocks: [
      { type: 'guarantee', title: content.guarantee_title || 'Garantia de 7 Dias' },
      { type: 'benefits', items: content.benefits_list || [] }
    ],
    countdown: {
      enabled: conv.timer_enabled || false,
      minutes: conv.timer_minutes || 15
    },
    socialProof: {
      enabled: conv.social_proof_enabled || false
    }
  };
}

function buildEmptyConfig() {
  return {
    schemaVersion: 1,
    theme: { primaryColor: '#FF6B00', backgroundColor: '#0A0A0A', textColor: '#EDEDED' },
    buttons: { text: '⚡ QUERO MEU ACESSO AGORA' },
    blocks: [{ type: 'guarantee', title: 'Garantia de 7 Dias' }, { type: 'benefits', items: [] }],
    countdown: { enabled: false, minutes: 15 },
    socialProof: { enabled: false }
  };
}

async function loadBuilderState() {
  try {
    const { data, error } = await supabaseClient.rpc('rpc_checkout_get_builder_state', { p_product_id: productId });
    if (error) throw error;
    
    currentBuilderState = data;
    
    let configToLoad = null;
    let badgeText = "NOVO";
    let badgeClass = "badge-archived";
    
    if (data.draft) {
      configToLoad = data.draft.config_json;
      badgeText = `Rascunho V${data.draft.version_number}`;
      badgeClass = "badge-draft";
    } else if (data.published) {
      configToLoad = data.published.config_json;
      badgeText = `Publicado V${data.published.version_number}`;
      badgeClass = "badge-published";
    } else {
      // Legacy fallback loading for UI if nothing in versions yet
      const { data: legacyData } = await supabaseClient.rpc('rpc_admin_get_checkout_config', { p_product_id: productId });
      if (legacyData) {
        configToLoad = normalizeCheckoutConfig(legacyData);
      } else {
        configToLoad = buildEmptyConfig();
      }
    }

    const badge = document.getElementById('current-version-badge');
    badge.textContent = badgeText;
    badge.className = `badge ${badgeClass}`;

    populateUI(configToLoad);
    document.getElementById('save-status').textContent = "Sincronizado";
    document.getElementById('save-status').style.color = "var(--text-muted)";
    sendPreviewUpdate();
  } catch (err) {
    console.error("Erro ao carregar estado do builder:", err);
  }
}

function populateUI(config) {
  if (!config) return;
  const norm = normalizeCheckoutConfig(config);
  
  const color = norm.theme.primaryColor;
  document.getElementById('b-theme-color').value = color;
  document.getElementById('b-theme-color-hex').value = color.toUpperCase();
  
  document.getElementById('b-button-text').value = norm.buttons.text;
  
  const guaranteeBlock = norm.blocks.find(b => b.type === 'guarantee');
  if (guaranteeBlock) document.getElementById('b-guarantee-title').value = guaranteeBlock.title;
  
  const benefitsBlock = norm.blocks.find(b => b.type === 'benefits');
  if (benefitsBlock && benefitsBlock.items) {
    document.getElementById('b-benefits-list').value = benefitsBlock.items.join('\n');
  }

  document.getElementById('b-timer-enabled').checked = norm.countdown.enabled;
  document.getElementById('b-timer-minutes').value = norm.countdown.minutes;
  document.getElementById('b-social-proof-enabled').checked = norm.socialProof.enabled;
}

function getFormData() {
  return {
    schemaVersion: 1,
    theme: {
      primaryColor: document.getElementById('b-theme-color').value,
      backgroundColor: '#0A0A0A',
      textColor: '#EDEDED'
    },
    buttons: {
      text: document.getElementById('b-button-text').value
    },
    blocks: [
      { type: 'guarantee', title: document.getElementById('b-guarantee-title').value },
      { type: 'benefits', items: document.getElementById('b-benefits-list').value.split('\n').filter(b => b.trim() !== '') }
    ],
    countdown: {
      enabled: document.getElementById('b-timer-enabled').checked,
      minutes: parseInt(document.getElementById('b-timer-minutes').value) || 15
    },
    socialProof: {
      enabled: document.getElementById('b-social-proof-enabled').checked
    }
  };
}

function sendPreviewUpdate() {
  const iframe = document.getElementById('checkout-preview-frame');
  if (!iframe.contentWindow) return;
  
  // Enviamos sempre no formato normalizado para o iframe
  iframe.contentWindow.postMessage({
    type: "NEXUS_CHECKOUT_PREVIEW_UPDATE",
    payload: getFormData()
  }, "*"); 
}

async function saveDraft() {
  const btn = document.getElementById('btn-save-draft');
  const originalText = btn.innerHTML;
  btn.innerHTML = "Salvando...";
  btn.disabled = true;

  try {
    const { data, error } = await supabaseClient.rpc('rpc_checkout_save_draft', {
      p_product_id: productId,
      p_config_json: getFormData(),
      p_notes: 'Atualização via Builder'
    });
    if (error) throw error;
    await loadBuilderState();
  } catch (err) {
    console.error("Erro ao salvar rascunho:", err);
    alert("Erro ao salvar rascunho.");
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

async function publishDraft() {
  if (!currentBuilderState || !currentBuilderState.draft) {
    alert("Não há rascunho ativo para publicar. Salve um rascunho primeiro.");
    return;
  }
  
  if (!confirm("Tem certeza que deseja publicar esta versão? Ela substituirá a atual no checkout público.")) return;

  const btn = document.getElementById('btn-publish');
  const originalText = btn.innerHTML;
  btn.innerHTML = "Publicando...";
  btn.disabled = true;

  try {
    const { data, error } = await supabaseClient.rpc('rpc_checkout_publish_draft', {
      p_product_id: productId
    });
    if (error) throw error;
    alert("Versão publicada com sucesso!");
    await loadBuilderState();
  } catch (err) {
    console.error("Erro ao publicar:", err);
    alert("Erro ao publicar versão.");
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

function openHistoryModal() {
  const modal = document.getElementById('modal-history');
  const list = document.getElementById('history-list');
  list.innerHTML = '';

  if (!currentBuilderState || !currentBuilderState.history || currentBuilderState.history.length === 0) {
    list.innerHTML = '<p style="color: var(--text-muted);">Nenhum histórico encontrado.</p>';
  } else {
    currentBuilderState.history.forEach(v => {
      const item = document.createElement('div');
      item.className = `history-item ${v.status}`;
      
      const statusLabel = v.status === 'published' ? 'Publicado' : (v.status === 'draft' ? 'Rascunho' : 'Arquivado');
      
      item.innerHTML = `
        <div>
          <div style="font-weight: bold; margin-bottom: 4px;">Versão ${v.version_number} <span class="badge badge-${v.status}">${statusLabel}</span></div>
          <div style="font-size: 11px; color: var(--text-muted);">${new Date(v.created_at).toLocaleString()}</div>
        </div>
        <div style="display:flex; gap: 8px;">
          ${v.status !== 'draft' ? `<button onclick="restoreVersion('${v.id}')" style="background:transparent; border:1px solid var(--border); color:var(--text-primary); padding:4px 8px; border-radius:4px; cursor:pointer;">Restaurar</button>` : ''}
          ${v.status === 'draft' ? `<button onclick="deleteDraft()" style="background:transparent; border:1px solid var(--danger); color:var(--danger); padding:4px 8px; border-radius:4px; cursor:pointer;">Excluir</button>` : ''}
        </div>
      `;
      list.appendChild(item);
    });
  }
  
  modal.style.display = 'flex';
}

async function restoreVersion(versionId) {
  if (!confirm("Restaurar criará um NOVO rascunho baseado nesta versão. Deseja continuar?")) return;
  try {
    const { error } = await supabaseClient.rpc('rpc_checkout_restore_version', {
      p_product_id: productId,
      p_version_id: versionId
    });
    if (error) throw error;
    document.getElementById('modal-history').style.display = 'none';
    await loadBuilderState();
    alert("Versão restaurada como novo rascunho!");
  } catch (err) {
    alert("Erro ao restaurar: " + err.message);
  }
}

async function deleteDraft() {
  if (!confirm("Excluir este rascunho permanentemente?")) return;
  try {
    const { error } = await supabaseClient.rpc('rpc_checkout_delete_draft', {
      p_product_id: productId
    });
    if (error) throw error;
    document.getElementById('modal-history').style.display = 'none';
    await loadBuilderState();
  } catch (err) {
    alert("Erro ao excluir: " + err.message);
  }
}

async function openTemplatesModal() {
  const modal = document.getElementById('modal-templates');
  const list = document.getElementById('templates-list');
  list.innerHTML = 'Carregando...';
  modal.style.display = 'flex';

  try {
    const { data, error } = await supabaseClient.rpc('rpc_checkout_list_templates');
    if (error) throw error;

    list.innerHTML = '';
    if (!data || data.length === 0) {
      list.innerHTML = '<p>Nenhum template disponível.</p>';
      return;
    }

    data.forEach(t => {
      const card = document.createElement('div');
      card.className = 'template-card';
      card.innerHTML = `
        <div style="font-size:14px; font-weight:bold; margin-bottom:4px; color:var(--accent);">${t.name}</div>
        <div style="font-size:11px; color:var(--text-muted); margin-bottom:12px;">Categoria: ${t.category}</div>
        <button onclick="applyTemplate('${t.id}')" style="width:100%; background:rgba(255,107,0,0.1); border:1px solid var(--accent); color:var(--accent); padding:8px; border-radius:4px; cursor:pointer;">Aplicar Template</button>
      `;
      list.appendChild(card);
    });
  } catch (err) {
    list.innerHTML = 'Erro ao carregar templates.';
  }
}

async function applyTemplate(templateId) {
  if (!confirm("Aplicar este template substituirá seu rascunho atual. Deseja continuar?")) return;
  try {
    const { error } = await supabaseClient.rpc('rpc_checkout_apply_template', {
      p_product_id: productId,
      p_template_id: templateId
    });
    if (error) throw error;
    document.getElementById('modal-templates').style.display = 'none';
    await loadBuilderState();
    alert("Template aplicado! Você está visualizando um novo rascunho.");
  } catch (err) {
    alert("Erro ao aplicar template: " + err.message);
  }
}
