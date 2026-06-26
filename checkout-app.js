let supabaseClient = null;
let currentProduct = null;
let currentLeadId = null;
let currentSessionId = null;
let selectedPaymentMethod = 'PIX';
let checkInterval = null;

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

  // Tracking
  if (window.NexusTracker && window.NexusTracker.trackEvent) {
    window.NexusTracker.trackEvent('Checkout_View', { product_slug: productSlug });
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

  // Preencher UI
  document.getElementById('product-name').textContent = product.name;
  document.getElementById('product-desc').textContent = product.description || '';
  
  const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: product.currency || 'BRL' });
  const basePrice = parseFloat(product.price || 0);
  const salePrice = parseFloat(product.sale_price || 0);
  
  const priceContainer = document.getElementById('product-price');
  
  if (salePrice > 0) {
    priceContainer.innerHTML = `
      <span style="font-size: 14px; text-decoration: line-through; color: var(--text-muted); display: block; margin-bottom: 4px;">De ${formatter.format(basePrice)}</span>
      <span style="font-size: 32px; font-weight: 800; color: var(--success);">Por ${formatter.format(salePrice)}</span>
    `;
    currentProduct.finalPrice = salePrice;
  } else {
    priceContainer.textContent = formatter.format(basePrice);
    currentProduct.finalPrice = basePrice;
  }

  if (product.thumbnail_url) {
    document.getElementById('product-cover').style.backgroundImage = `url('${product.thumbnail_url}')`;
  }

  // Capturar UTMs da URL
  const utms = {
    utm_source: urlParams.get('utm_source'),
    utm_medium: urlParams.get('utm_medium'),
    utm_campaign: urlParams.get('utm_campaign'),
    utm_content: urlParams.get('utm_content'),
    utm_term: urlParams.get('utm_term'),
    fbclid: urlParams.get('fbclid'),
    gclid: urlParams.get('gclid'),
  };

  // Inicializar Sessão Anônima via Edge Function Segura
  try {
    const res = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/capture-lead`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create_checkout_session',
        product_id: product.id,
        product_slug: product.checkout_slug,
        amount: product.price,
        status: 'started',
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
  const email = document.getElementById('c-email').value;
  const name = document.getElementById('c-name').value;
  const phone = document.getElementById('c-phone').value;

  if (!email || !email.includes('@')) return;

  // Cria ou atualiza lead
  try {
    // Tenta achar
    let { data: lead } = await supabaseClient.from('leads').select('id').eq('email', email).single();
    
    if (lead) {
      currentLeadId = lead.id;
      await supabaseClient.from('leads').update({ name, phone }).eq('id', lead.id);
    } else {
      const { data: newLead } = await supabaseClient.from('leads').insert([{
        email, name, phone, status: 'lead'
      }]).select('id').single();
      
      if (newLead) currentLeadId = newLead.id;
    }

    // Atualiza sessão via Edge Function
    if (currentSessionId && currentLeadId) {
      fetch(`${CONFIG.SUPABASE_URL}/functions/v1/capture-lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_checkout_session',
          session_id: currentSessionId,
          session_token: window.currentSessionToken,
          lead_id: currentLeadId,
          status: 'lead_captured'
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
    // Chamada para a Edge Function asaas-create-payment
    const { data: config } = await supabaseClient.from('app_config').select('value').eq('key', 'supabase_url').single();
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

    if (window.NexusTracker && window.NexusTracker.trackEvent) {
      window.NexusTracker.trackEvent('Payment_Created', { method: selectedPaymentMethod, payment_id: data.payment_id });
    }

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
      
      // Para boleto, podemos redirecionar após uns segundos para a Thank You Page de pendente
      setTimeout(() => redirectToThankYou('pending'), 10000);
    }

  } catch (err) {
    releasePayBtn();
    loader.style.display = 'none';
    alert('Erro: ' + err.message);
    if (window.NexusTracker && window.NexusTracker.trackEvent) {
      window.NexusTracker.trackEvent('Checkout_Error', { error: err.message });
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

  checkInterval = setInterval(async () => {
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
  const url = currentProduct.thank_you_url || `obrigado.html?status=${status}&product=${currentProduct.checkout_slug}`;
  window.location.href = url;
}
