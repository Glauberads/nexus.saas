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
    script.src = 'nexus-tracker.js';
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

  // Carregar Produto (Usa a policy pública que criamos)
  const { data: product, error } = await supabaseClient.from('products')
    .select('*')
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

  // Inicializar Sessão Anônima no Banco
  const { data: session } = await supabaseClient.from('checkout_sessions').insert([{
    product_id: product.id,
    product_slug: product.checkout_slug,
    status: 'started',
    amount: product.price,
    ...utms
  }]).select('id').single();

  if (session) {
    currentSessionId = session.id;
  }
}

function setPaymentMethod(method, element) {
  if (method === 'CREDIT_CARD') {
    // Apenas seleciona visualmente, mas impede avançar por enquanto
  }
  
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

    // Atualiza sessão
    if (currentSessionId && currentLeadId) {
      await supabaseClient.from('checkout_sessions').update({
        lead_id: currentLeadId,
        status: 'lead_captured'
      }).eq('id', currentSessionId);
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

  // Garantir que lead tá atualizado
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
      billingType: selectedPaymentMethod
    };

    const res = await fetch(edgeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    loader.style.display = 'none';

    if (!res.ok || !data.success) {
      throw new Error(data.error || "Falha ao gerar pagamento");
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
    loader.style.display = 'none';
    alert("Erro: " + err.message);
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
    // Consulta status do checkout session no nosso banco
    const { data } = await supabaseClient.from('checkout_sessions').select('status').eq('id', currentSessionId).single();
    if (data && data.status === 'paid') {
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
