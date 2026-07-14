let supabaseClient = null;
let currentProduct = null;
let currentLeadId = null;
let currentSessionId = null;
let selectedPaymentMethod = 'PIX';
let checkInterval = null;

const isPreview = new URLSearchParams(window.location.search).get('preview') === '1';

function getPersistedAttribution() {
  const params = new URLSearchParams(window.location.search);
  const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'ttclid', 'msclkid'];
  const result = {};

  const sanitize = (value) => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    if (!normalized || normalized.toLowerCase() === 'null' || normalized.toLowerCase() === 'undefined') {
      return null;
    }
    return normalized;
  };

  keys.forEach(k => {
    const val = sanitize(params.get(k));
    if (val) result[k] = val;
  });

  try {
    const stored = localStorage.getItem('nexus_utms');
    if (stored) {
      const parsed = JSON.parse(stored);
      keys.forEach(k => {
        const val = sanitize(parsed[k]);
        if (!result[k] && val) result[k] = val;
      });
    }
  } catch (error) {
    if (window.ENV && window.ENV.DEBUG_TRACKING) {
      console.warn('[NexusUTM] Falha ao ler localStorage:', error);
    }
  }

  try {
    const cookies = document.cookie.split(';');
    const cookieData = {};
    cookies.forEach(c => {
      const match = c.trim().match(/^nexus_([^=]+)=(.+)$/);
      if (match) cookieData[match[1]] = decodeURIComponent(match[2]);
    });
    keys.forEach(k => {
      const val = sanitize(cookieData[k]);
      if (!result[k] && val) result[k] = val;
    });
  } catch (error) {
    if (window.ENV && window.ENV.DEBUG_TRACKING) {
      console.warn('[NexusUTM] Falha ao ler cookies:', error);
    }
  }

  return result;
}

document.addEventListener('DOMContentLoaded', async () => {
  if (window.NexusTracker && window.NexusTracker.config) {
    initCheckout(window.NexusTracker.config);
  } else {
    const script = document.createElement('script');
    script.src = 'tracking.js';
    script.onload = () => initCheckout(window.NexusTracker.config);
    document.head.appendChild(script);
  }
});

async function initCheckout(config) {
  supabaseClient = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
  
  const urlParams = new URLSearchParams(window.location.search);
  const productSlug = urlParams.get('product');

  if (!productSlug) {
    alert("Produto não especificado.");
    return;
  }

  if (isPreview) {
    console.log("[PREVIEW MODE] Checkout em modo de visualização. Funções financeiras desabilitadas.");
  }

  // Load public config
  const { data: publishedConfig } = await supabaseClient.rpc('rpc_public_get_published_version', { p_product_slug: productSlug });
  let finalConfig = null;
  
  if (publishedConfig) {
    finalConfig = normalizeCheckoutConfig(publishedConfig);
  } else {
    // Fallback para a legada
    const { data: legacyConfig } = await supabaseClient.rpc('rpc_public_get_checkout_config', { p_product_slug: productSlug });
    if (legacyConfig) {
      finalConfig = normalizeCheckoutConfig(legacyConfig);
    }
  }

  // A/B Testing: Intercepta a configuração visual passivamente
  if (finalConfig && window.NexusExperiments && window.NexusTracker && window.NexusTracker.sessionId) {
    finalConfig = await window.NexusExperiments.resolveVariant(productSlug, window.NexusTracker.sessionId, finalConfig);
  }

  if (finalConfig) {
    applyCheckoutConfig(finalConfig);
  }

  // Tracking
  if (window.NexusTracker && window.NexusTracker.trackEvent) {
    // will track after product load
  }

  // Carregar Produto — seleção explícita de colunas públicas apenas.
  // NUNCA trazer checkout_config (contém split_rules, walletId, configs de gateway).
  const { data: product, error } = await supabaseClient.from('products')
    .select('id, name, description, price, sale_price, currency, thumbnail_url, checkout_slug, checkout_enabled, status, pix_discount, thank_you_url, max_installments')
    .eq('checkout_slug', productSlug)
    .single();

  if (error || !product) {
    document.querySelector('.container').innerHTML = `<div style="text-align:center; padding:50px;"><h2>Produto não encontrado ou indisponível.</h2></div>`;
    return;
  }

  currentProduct = product;
  
  // Tracking
  if (!isPreview && window.NexusTracker && window.NexusTracker.track) {
    const finalPrice = parseFloat(product.sale_price || product.price || 0);
    window.NexusTracker.track('InitiateCheckout', { 
      product_slug: productSlug, 
      value: finalPrice, 
      currency: product.currency || 'BRL',
      items: [{
        item_id: productSlug,
        item_name: product.name,
        item_category: 'SaaS',
        price: finalPrice,
        quantity: 1
      }]
    });
  }

  // Preencher UI
  document.getElementById('product-name').textContent = product.name;
  document.getElementById('product-desc').textContent = product.description || '';
  
  const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: product.currency || 'BRL' });
  const basePrice = parseFloat(product.price || 0);
  const salePrice = parseFloat(product.sale_price || 0);
  
  const priceContainer = document.getElementById('product-price');
  
  // Calculate final price correctly
  currentProduct.finalPrice = salePrice > 0 ? salePrice : basePrice;
  
  const installmentValue = currentProduct.finalPrice / 12;
  const formattedInstallment = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: product.currency || 'BRL' }).format(installmentValue);
  const formattedFullPrice = formatter.format(currentProduct.finalPrice);

  const dailyValue = currentProduct.finalPrice / 365;
  const formattedDaily = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: product.currency || 'BRL' }).format(dailyValue);

  priceContainer.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 4px;">
      <span style="font-size: 13px; color: var(--text-secondary); text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;">Por apenas</span>
      <span style="font-size: 42px; font-weight: 900; color: var(--success); line-height: 1.1; letter-spacing: -1px; text-shadow: 0 4px 16px rgba(34,197,94,0.3);">12x de ${formattedInstallment}</span>
      <span style="font-size: 14px; color: var(--text-muted); margin-top: 4px;">ou ${formattedFullPrice} à vista</span>
      
      <div style="display: inline-flex; align-items: center; justify-content: center; background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.2); padding: 6px 12px; border-radius: 6px; margin-top: 12px; max-width: fit-content;">
        <span style="font-size: 12px; font-weight: 600; color: var(--success);">🎯 Menos de ${formattedDaily} por dia</span>
      </div>
    </div>
  `;

  if (product.thumbnail_url) {
    document.getElementById('product-cover').style.backgroundImage = `url('${product.thumbnail_url}')`;
  }

  // Capturar UTMs persistidas (URL > LocalStorage > Cookies)
  const utms = getPersistedAttribution();

  // Inicializar Sessão Anônima via Edge Function Segura
  if (!isPreview) {
    try {
    const res = await fetch(`${window.NexusTracker.config.SUPABASE_URL}/functions/v1/capture-lead`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create_checkout_session',
        product_id: product.id,
        product_slug: product.checkout_slug,
        amount: product.price,
        status: 'started',
        // correlation_id foi removido pois a tabela checkout_sessions não o possui
        ...utms
      })
    });
    const session = await res.json();
    if (session && session.id) {
      currentSessionId = session.id;
      window.currentSessionToken = session.session_token; // Guardar o token
    }
    } catch (err) {
      console.error("Erro ao criar sessão:", err);
    }
  }

  // Preencher parcelas se max_installments estiver configurado no produto
  const maxInst = product.max_installments || 12;
  const instSelect = document.getElementById('cc-installments');
  if (instSelect) {
    instSelect.innerHTML = '<option value="1">1x (Sem juros) - ' + formatter.format(currentProduct.finalPrice) + '</option>';
    for (let i = 2; i <= maxInst; i++) {
      let val = currentProduct.finalPrice / i;
      instSelect.innerHTML += '<option value="' + i + '">' + i + 'x de ' + formatter.format(val) + '</option>';
    }
  }
}

function setPaymentMethod(method, element) {
  
  selectedPaymentMethod = method;
  
  // Atualiza Tabs UI
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  element.classList.add('active');

  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
  document.getElementById(`tab-${method}`).classList.add('active');

  if (window.NexusTracker && window.NexusTracker.trackEvent) {
    window.NexusTracker.trackEvent('Payment_Method_Selected', { method });
  }
}

async function captureLead() {
  if (isPreview) return;
  const email = document.getElementById('c-email').value;
  const name = document.getElementById('c-name').value;
  const phone = document.getElementById('c-phone').value;

  if (!email || !email.includes('@')) return;

  // Cria ou atualiza lead
  try {
    // Tenta achar ou criar via Edge Function (Seguro)
    const res = await fetch(`${window.NexusTracker.config.SUPABASE_URL}/functions/v1/capture-lead`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'upsert_lead',
        leadData: { email, name, phone, status: 'lead', ...getPersistedAttribution() }
      })
    });
    const leadDataResp = await res.json();
    if (leadDataResp && leadDataResp.id) {
      currentLeadId = leadDataResp.id;
    }

    // Atualiza sessão via Edge Function
    if (currentSessionId && currentLeadId) {
      fetch(`${window.NexusTracker.config.SUPABASE_URL}/functions/v1/capture-lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_checkout_session',
          session_id: currentSessionId,
          session_token: window.currentSessionToken,
          lead_id: currentLeadId,
          status: 'lead_captured',
          correlation_id: sessionStorage.getItem('nexus_correlation_id')
        })
      }).catch(console.error);
    }

    if (window.NexusTracker && window.NexusTracker.trackEvent && !window._leadCapturedTracked) {
      window.NexusTracker.trackEvent('Checkout_Lead_Captured', { email });
      window._leadCapturedTracked = true;
    }
  } catch (err) {
    console.error("Lead capture err", err);
  }
}

async function processPayment() {
  if (isPreview) {
    alert("[PREVIEW MODE] Pagamento simulado com sucesso. Nenhuma cobrança real foi gerada.");
    return;
  }

  const name = document.getElementById('c-name').value;
  const email = document.getElementById('c-email').value;
  const cpfCnpj = document.getElementById('c-cpf').value;
  const phone = document.getElementById('c-phone').value;

  if (!email || !name || !cpfCnpj) {
    alert("Preencha Nome, E-mail e CPF/CNPJ para continuar.");
    return;
  }

  let creditCardObj = null;
  let creditCardHolderInfoObj = null;
  let installments = 1;

  if (selectedPaymentMethod === 'CREDIT_CARD') {
    const ccNum = document.getElementById('cc-number').value.replace(/\s/g, '');
    const ccName = document.getElementById('cc-name').value;
    const ccExpiry = document.getElementById('cc-expiry').value;
    const ccCvv = document.getElementById('cc-cvv').value;
    const cep = document.getElementById('c-cep').value;
    const addressNum = document.getElementById('c-number').value;

    if (!ccNum || !ccName || !ccExpiry || !ccCvv || !cep || !addressNum) {
      alert("Preencha todos os dados do cartão e endereço de faturamento.");
      return;
    }

    if (ccExpiry.length !== 5 || !ccExpiry.includes('/')) {
      alert("Validade inválida. Use MM/AA.");
      return;
    }

    const [expMonth, expYear] = ccExpiry.split('/');
    
    creditCardObj = {
      holderName: ccName,
      number: ccNum,
      expiryMonth: expMonth,
      expiryYear: expYear,
      ccv: ccCvv
    };

    creditCardHolderInfoObj = {
      name: name,
      email: email,
      cpfCnpj: cpfCnpj.replace(/\D/g, ''),
      postalCode: cep.replace(/\D/g, ''),
      addressNumber: addressNum,
      phone: phone.replace(/\D/g, ''),
      mobilePhone: phone.replace(/\D/g, '')
    };

    installments = parseInt(document.getElementById('cc-installments').value) || 1;
  }

  // ─── PROTEÇÃO CONTRA DUPLA SUBMISSÃO ────────────────────────────────
  // Impede criação de cobranças duplicadas por double-click ou submit múltiplo.
  const payBtn = document.getElementById('btn-pay');
  if (payBtn && payBtn._isProcessing) {
    console.warn('[Checkout] Pagamento já em andamento. Ignorando clique duplo.');
    return;
  }
  if (payBtn) {
    payBtn._isProcessing = true;
    payBtn.disabled = true;
    payBtn.style.opacity = '0.7';
    payBtn.style.cursor = 'not-allowed';
    const originalText = payBtn.innerHTML;
    payBtn.innerHTML = '<span>Processando...</span>';
    payBtn._originalText = originalText;
  }

  // Helper para reabilitar o botão em caso de erro
  const releasePayBtn = () => {
    if (payBtn) {
      payBtn._isProcessing = false;
      payBtn.disabled = false;
      payBtn.style.opacity = '';
      payBtn.style.cursor = '';
      payBtn.innerHTML = payBtn._originalText || 'Finalizar Pagamento';
    }
  };

  await captureLead();

  const loader = document.getElementById('loader');
  loader.style.display = 'flex';

  try {
    // Alternativamente podemos usar window.NexusTracker.config.SUPABASE_URL
    const edgeUrl = `${window.NexusTracker.config.SUPABASE_URL}/functions/v1/asaas-create-payment`;

    // Aqui não passamos o preço. O backend busca.
    const payload = {
      lead_id: currentLeadId,
      checkout_session_id: currentSessionId,
      product_slug: currentProduct.checkout_slug,
      name,
      email,
      phone,
      cpfCnpj: cpfCnpj.replace(/\D/g, ''),
      billingType: selectedPaymentMethod,
      installments,
      correlation_id: sessionStorage.getItem('nexus_correlation_id'),
      ...(creditCardObj && { creditCard: creditCardObj }),
      ...(creditCardHolderInfoObj && { creditCardHolderInfo: creditCardHolderInfoObj })
    };

    const res = await fetch(edgeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    loader.style.display = 'none';

    if (!res.ok || !data.success) {
      let errorMsg = data.error || "Falha ao gerar pagamento";
      if (errorMsg.includes('invalid_billingType') && (errorMsg.includes('chave Pix') || errorMsg.includes('Pix'))) {
         errorMsg = "Atenção: Sua conta do Asaas (Sandbox ou Produção) ainda não tem uma Chave PIX cadastrada. Para resolver, acesse o painel do Asaas, vá em 'Minha Conta > Chaves Pix' e clique em 'Gerar chave aleatória'.";
      }
      throw new Error(errorMsg);
    }

    if (window.NexusTracker) {
      const finalPrice = parseFloat(currentProduct.sale_price || currentProduct.price || 0);
      window.NexusTracker.track('Payment_Created', {
        method: selectedPaymentMethod,
        payment_id: data.payment_id,
        value: finalPrice,
        currency: currentProduct.currency || 'BRL',
        ...getPersistedAttribution()
      });
      // Se for BOLETO, adiciona score
      if (selectedPaymentMethod === 'BOLETO') {
        window.LeadScore && window.LeadScore.add('PaymentCreated');
      }
    }

    window._asaasPaymentId = data.payment_id;

    if (selectedPaymentMethod === 'PIX' && data.pix) {
      document.getElementById('tab-PIX').style.display = 'none';
      document.getElementById('pix-area').style.display = 'block';
      document.getElementById('pix-img-container').innerHTML = `<img src="data:image/png;base64,${data.pix.encodedImage}">`;
      document.getElementById('pix-copy-text').textContent = data.pix.payload;
      
      // Iniciar Polling
      startPolling(data.payment_id);

    } else if (selectedPaymentMethod === 'BOLETO' && data.bankSlipUrl) {
      document.getElementById('tab-BOLETO').style.display = 'none';
      const bArea = document.getElementById('boleto-area');
      bArea.style.display = 'block';
      document.getElementById('btn-open-boleto').onclick = () => window.open(data.bankSlipUrl, '_blank');
      
      // Para boleto, não redirecionamos automaticamente para não expulsar o usuário.
      let btnContinue = document.getElementById('btn-continue-boleto');
      if (!btnContinue) {
        btnContinue = document.createElement('button');
        btnContinue.id = 'btn-continue-boleto';
        btnContinue.className = 'btn-secondary';
        btnContinue.style.marginTop = '15px';
        btnContinue.style.width = '100%';
        btnContinue.innerText = 'Já copiei/baixei meu boleto, continuar';
        btnContinue.onclick = () => redirectToThankYou('pending');
        bArea.appendChild(btnContinue);
      }
    }

  } catch (err) {
    releasePayBtn();
    loader.style.display = 'none';
    alert('Erro: ' + err.message);
    if (window.NexusTracker && window.NexusTracker.track) {
      window.NexusTracker.track('Checkout_Error', { error: err.message });
    }
  }
}

function copyPix() {
  const text = document.getElementById('pix-copy-text').textContent;
  navigator.clipboard.writeText(text).then(() => {
    alert("Código copiado!");
  });
}

function startPolling(asaasPaymentId) {
  if (checkInterval) clearInterval(checkInterval);

  let attempts = 0;
  const MAX_ATTEMPTS = 360; // 360 * 5s = 30 minutos

  checkInterval = setInterval(async () => {
    attempts++;
    
    if (attempts >= MAX_ATTEMPTS) {
      clearInterval(checkInterval);
      alert("O tempo para pagamento do PIX expirou. Por favor, recarregue a página e gere um novo pedido.");
      return;
    }

    // Consulta status do checkout session via RPC segura com token
    const { data: status } = await supabaseClient.rpc('get_checkout_status', { 
      p_session_id: currentSessionId,
      p_session_token: window.currentSessionToken
    });
    
    if (status === 'paid') {
      clearInterval(checkInterval);
      redirectToThankYou('paid');
    }
  }, 5000); // Consulta a cada 5s
}

function redirectToThankYou(status) {
  // Se o produto tiver thank_you_url customizada, podemos ir pra lá
  // Se não, criamos a obrigado.html genérica
  const finalPrice = parseFloat(currentProduct.sale_price || currentProduct.price || 0);
  const currency = currentProduct.currency || 'BRL';
  const txid = window.currentSessionToken || 'no_id';
  
  const paymentId = window._asaasPaymentId || '';
  const eid = paymentId ? `purchase_${paymentId}` : '';
  
  const query = `status=${status}&product=${currentProduct.checkout_slug}&val=${finalPrice}&cur=${currency}&txid=${txid}&eid=${eid}`;
  const url = currentProduct.thank_you_url 
    ? `${currentProduct.thank_you_url}?${query}`
    : `obrigado.html?${query}`;
    
  window.location.href = url;
}

// ==========================================
// CONFIGURAÇÃO DINÂMICA (BUILDER / PREVIEW)
// ==========================================
function normalizeCheckoutConfig(data) {
  if (!data) return null;
  if (data.schemaVersion === 1) return data; 

  const theme = data.theme_config || {};
  const content = data.content_config || {};
  const conv = data.conversion_config || {};

  return {
    schemaVersion: 1,
    theme: {
      primaryColor: theme.theme_color || '#FF6B00',
    },
    buttons: {
      text: content.button_text || ''
    },
    blocks: [
      { type: 'guarantee', title: content.guarantee_title || '' },
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

function applyCheckoutConfig(config) {
  if (!config) return;

  // Theme Color
  if (config.theme && config.theme.primaryColor) {
    document.documentElement.style.setProperty('--accent', config.theme.primaryColor);
  }

  // Content
  if (config.buttons && config.buttons.text) {
    const btns = document.querySelectorAll('.btn-submit');
    btns.forEach(btn => {
      const textNode = Array.from(btn.childNodes).find(n => n.nodeType === 3 && n.textContent.trim().length > 0);
      if (textNode) {
        textNode.textContent = ' ' + config.buttons.text;
      }
    });
  }
  
  const guaranteeBlock = config.blocks && config.blocks.find(b => b.type === 'guarantee');
  if (guaranteeBlock && guaranteeBlock.title) {
    const titleEl = document.querySelector('.guarantee-badge h4');
    if (titleEl) {
      const textNode = Array.from(titleEl.childNodes).find(n => n.nodeType === 3 && n.textContent.trim().length > 0);
      if (textNode) {
        textNode.textContent = ' ' + guaranteeBlock.title;
      } else {
        titleEl.appendChild(document.createTextNode(' ' + guaranteeBlock.title));
      }
    }
  }

  const benefitsBlock = config.blocks && config.blocks.find(b => b.type === 'benefits');
  if (benefitsBlock && Array.isArray(benefitsBlock.items)) {
    const ul = document.querySelector('.benefits-list');
    if (ul) {
      ul.innerHTML = '';
      benefitsBlock.items.forEach(ben => {
        const li = document.createElement('li');
        li.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> `;
        li.appendChild(document.createTextNode(ben));
        ul.appendChild(li);
      });
    }
  }

  // Conversion
  if (config.countdown) {
    const timerBar = document.querySelector('.timer-bar');
    if (timerBar) {
      timerBar.style.display = config.countdown.enabled ? 'flex' : 'none';
      if (config.countdown.enabled && config.countdown.minutes) {
        const display = document.querySelector('#countdown-timer');
        if (display && !window._timerStarted) {
           startTimer(config.countdown.minutes * 60, display);
           window._timerStarted = true;
        }
      }
    }
  }

  if (config.socialProof) {
    const proof = document.querySelector('.social-proof');
    if (proof) {
      proof.style.display = config.socialProof.enabled ? 'block' : 'none';
    }
  }
}

window.addEventListener('message', (event) => {
  // Em produção, validar event.origin
  if (event.data && event.data.type === 'NEXUS_CHECKOUT_PREVIEW_UPDATE') {
    applyCheckoutConfig(event.data.payload);
  }
});

let timerInterval;
function startTimer(duration, display) {
  let timer = duration;
  clearInterval(timerInterval);
  timerInterval = setInterval(function () {
    let minutes = parseInt(timer / 60, 10);
    let seconds = parseInt(timer % 60, 10);

    minutes = minutes < 10 ? "0" + minutes : minutes;
    seconds = seconds < 10 ? "0" + seconds : seconds;

    display.textContent = minutes + ":" + seconds;

    if (--timer < 0) {
      timer = 0;
      clearInterval(timerInterval);
    }
  }, 1000);
}

