import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

import { getCorsHeaders, checkRateLimit } from "../_shared/security.ts"

async function getCryptoKey(secretString: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const secretKeyData = enc.encode(secretString);
  const hash = await crypto.subtle.digest('SHA-256', secretKeyData);
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function decryptData(encryptedBase64: string, secretString: string): Promise<string> {
  if (!encryptedBase64) return '';
  const parts = encryptedBase64.split(':');
  if (parts.length !== 2) throw new Error('Invalid encrypted format');
  const ivStr = atob(parts[0]);
  const cipherStr = atob(parts[1]);
  const iv = new Uint8Array(ivStr.length);
  for (let i = 0; i < ivStr.length; i++) iv[i] = ivStr.charCodeAt(i);
  const cipher = new Uint8Array(cipherStr.length);
  for (let i = 0; i < cipherStr.length; i++) cipher[i] = cipherStr.charCodeAt(i);
  const key = await getCryptoKey(secretString);
  const decryptedBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return new TextDecoder().decode(decryptedBuffer);
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let reqBody: any = {};
  let productData: any = null;
  let finalAmount = 0;
  let splitRulesGlob: any[] = [];
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const supabase = createClient(supabaseUrl, supabaseKey);

  // ── RATE LIMITING (5 requests / minuto / IP)
  const isAllowed = await checkRateLimit(supabase, req, 'asaas-create-payment', 5, 60);
  if (!isAllowed) {
    return new Response(JSON.stringify({ success: false, error: 'Too Many Requests' }), { 
      status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }

  try {
    reqBody = await req.json();
    const { lead_id, checkout_session_id, product_slug, name, email, cpfCnpj, phone, billingType, description, dueDate, installments, creditCard, creditCardHolderInfo } = reqBody;

    if (!email || !billingType || !product_slug) {
      throw new Error('Missing required fields: email, billingType, product_slug');
    }

    const encryptionSecret = Deno.env.get('GATEWAY_ENCRYPTION_SECRET');
    if (!encryptionSecret) throw new Error('Encryption secret not configured');

    const { data: settings } = await supabase.from('gateway_settings').select('*').eq('gateway_name', 'asaas').single();
    if (!settings || !settings.api_key_encrypted || !settings.is_active) {
      throw new Error('Gateway Asaas is not configured or disabled');
    }

    const asaasKey = await decryptData(settings.api_key_encrypted, encryptionSecret);
    const asaasEnv = settings.environment || 'sandbox';
    const baseUrl = asaasEnv === 'sandbox' ? 'https://sandbox.asaas.com/api/v3' : 'https://api.asaas.com/v3';

    // 0. Validar Produto e Obter Preço Real
    const { data: product, error: prodErr } = await supabase.from('products').select('*').eq('checkout_slug', product_slug).single();
    productData = product;
    
    if (prodErr || !product) throw new Error('Produto não encontrado.');
    if (product.status !== 'active' || !product.checkout_enabled) throw new Error('Produto não está disponível para venda.');
    
    // Regra Hierarquia de Preços
    const basePrice = parseFloat(product.price || 0);
    const salePrice = parseFloat(product.sale_price || 0);
    
    let realPrice = basePrice;
    if (salePrice > 0) {
      realPrice = salePrice;
    }

    if (realPrice <= 0) throw new Error('Valor inválido para o produto.');

    // 1. Procurar ou Criar Cliente no Asaas
    let customerId = null;
    const { data: existingCustomer } = await supabase.from('asaas_customers').select('asaas_customer_id').eq('email', email).single();
    
    if (existingCustomer) {
      customerId = existingCustomer.asaas_customer_id;
    } else {
      const custRes = await fetch(`${baseUrl}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'access_token': asaasKey },
        body: JSON.stringify({ name: name || 'Cliente Sem Nome', email, cpfCnpj, phone, mobilePhone: phone })
      });
      const custData = await custRes.json();
      if (!custRes.ok) throw new Error(`Asaas Customer Error: ${JSON.stringify(custData)}`);
      
      customerId = custData.id;

      await supabase.from('asaas_customers').insert([{
        lead_id, asaas_customer_id: customerId, name: name || 'Cliente Sem Nome', email, cpf_cnpj: cpfCnpj, phone: phone, mobile_phone: phone, raw_payload: custData
      }]);
    }

    // 2. Criar Cobrança
    let finalValue = realPrice;
    
    // Apply PIX Discount if applicable
    if (billingType === 'PIX' && product.pix_discount > 0) {
      const discountAmount = finalValue * (product.pix_discount / 100);
      finalValue = finalValue - discountAmount;
    }
    finalAmount = finalValue;
    
    const paymentPayload: any = {
      customer: customerId,
      billingType,
      value: finalValue,
      dueDate: dueDate || new Date(Date.now() + 86400000).toISOString().split('T')[0], // Amanhã
      description: description || `Compra: ${product.name}`,
      externalReference: checkout_session_id
    };

    if (billingType === 'CREDIT_CARD') {
      if (creditCard) paymentPayload.creditCard = creditCard;
      if (creditCardHolderInfo) paymentPayload.creditCardHolderInfo = creditCardHolderInfo;
      
      if (installments && installments > 1) {
        paymentPayload.installmentCount = Math.min(installments, product.max_installments || 12);
        paymentPayload.installmentValue = finalValue / paymentPayload.installmentCount;
      }
    }

    // Handle Split (Multiple Receivers)
    const splitConfig = product.checkout_config?.split;
    let splitRules = product.checkout_config?.split_rules || [];
    
    if (splitConfig && splitConfig.enabled) {
      // Backward compatibility with older single-receiver format
      if (splitRules.length === 0 && splitConfig.walletId) {
        splitRules = [{
          walletId: splitConfig.walletId,
          type: splitConfig.type || 'percentage',
          value: splitConfig.value
        }];
      }

      if (splitRules.length > 0) {
        const asaasSplitArray = [];
        let totalPercentage = 0;
        let totalFixed = 0;

        for (const rule of splitRules) {
          if (!rule.walletId || typeof rule.value !== 'number' || rule.value <= 0) {
            throw new Error('Configuração de split inválida: walletId e valor numérico maior que zero são obrigatórios para todos os recebedores.');
          }

          const splitObj: any = { walletId: rule.walletId };

          if (rule.type === 'percentage') {
            splitObj.percentualValue = rule.value;
            totalPercentage += rule.value;
          } else if (rule.type === 'fixed') {
            splitObj.fixedValue = rule.value;
            totalFixed += rule.value;
          } else {
             throw new Error('Configuração de split inválida: tipo de repasse desconhecido.');
          }

          asaasSplitArray.push(splitObj);
        }

        // Validação de limites
        if (totalPercentage > 100) {
          throw new Error('Configuração de split inválida: a soma das porcentagens ultrapassa 100%.');
        }
        if (totalFixed > finalValue) {
          throw new Error('Configuração de split inválida: a soma dos valores fixos ultrapassa o valor total da cobrança.');
        }

        paymentPayload.split = asaasSplitArray;
        splitRulesGlob = asaasSplitArray; // pra salvar nos logs financeiros
      }
    }

    const payRes = await fetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'access_token': asaasKey },
      body: JSON.stringify(paymentPayload)
    });
    const payData = await payRes.json();
    if (!payRes.ok) throw new Error(`Asaas Payment Error: ${JSON.stringify(payData)}`);

    // 3. Obter PIX QR Code
    let pixData = null;
    if (billingType === 'PIX') {
      const pRes = await fetch(`${baseUrl}/payments/${payData.id}/pixQrCode`, {
        headers: { 'access_token': asaasKey }
      });
      if (pRes.ok) {
        pixData = await pRes.json();
      }
    }

    // 4. Salvar logs internos e logs financeiros
    const safePayload = { ...paymentPayload };
    if (safePayload.creditCard) {
      safePayload.creditCard = { ...safePayload.creditCard, number: '****', ccv: '***', expiryMonth: '**', expiryYear: '****' };
    }
    // Remover creditCardHolderInfo do payload salvo (contém CPF, CEP, telefone)
    if (safePayload.creditCardHolderInfo) {
      safePayload.creditCardHolderInfo = { name: safePayload.creditCardHolderInfo.name || '***' };
    }

    // ─── Mascaramento de PII para LGPD ───────────────────────────────────────
    const maskCpf = (doc: string | undefined) => {
      if (!doc) return null;
      const d = doc.replace(/\D/g, '');
      if (d.length === 11) return `***.***.***-${d.slice(-2)}`; // CPF
      if (d.length === 14) return `**.***.***/****-${d.slice(-2)}`; // CNPJ
      return '***';
    };
    const maskPhone = (p: string | undefined) => {
      if (!p) return null;
      const d = p.replace(/\D/g, '');
      if (d.length >= 10) return `(${d.slice(0,2)}) ****-${d.slice(-4)}`;
      return '****';
    };
    const maskEmail = (e: string | undefined) => {
      if (!e || !e.includes('@')) return null;
      const [user, domain] = e.split('@');
      return `${user.slice(0,2)}***@${domain}`;
    };

    await supabase.from('payment_attempts').insert([{
      gateway: 'asaas', lead_id, attempt_type: `${billingType}_CREATED`, status: 'pending', amount: realPrice, payload: { payment_id: payData.id, status: payData.status, _applied_split: paymentPayload.split || [] }
    }]);

    await supabase.from('financial_logs').insert([{
      event_type: 'payment_created',
      event_source: 'asaas-create-payment',
      product_id: product.id,
      product_name: product.name,
      product_slug: product.checkout_slug,
      customer_name: name,
      customer_email: maskEmail(email),
      customer_phone: maskPhone(phone),
      customer_document: maskCpf(cpfCnpj),
      gateway: 'asaas',
      payment_id: payData.id,
      payment_status: payData.status,
      payment_method: billingType,
      amount: finalValue,
      net_amount: payData.netValue,
      split_enabled: splitRulesGlob.length > 0,
      metadata: { applied_splits: splitRulesGlob },
      request_payload: safePayload,
      response_payload: { id: payData.id, status: payData.status, value: payData.value, netValue: payData.netValue, billingType: payData.billingType, dueDate: payData.dueDate, invoiceUrl: payData.invoiceUrl }
    }]);

    await supabase.from('asaas_payments').insert([{
      asaas_payment_id: payData.id,
      asaas_customer_id: customerId,
      lead_id,
      billing_type: billingType,
      status: payData.status,
      value: payData.value,
      net_value: payData.netValue,
      due_date: payData.dueDate,
      invoice_url: payData.invoiceUrl,
      bank_slip_url: payData.bankSlipUrl,
      pix_qr_code: pixData ? pixData.encodedImage : null,
      pix_copy_paste: pixData ? pixData.payload : null,
      description: payData.description,
      external_reference: checkout_session_id,
      raw_payload: payData
    }]);

    // 5. Atualizar Checkout Session
    if (checkout_session_id) {
      await supabase.from('checkout_sessions').update({
        status: 'payment_created',
        payment_method: billingType,
        asaas_payment_id: payData.id,
        amount: realPrice
      }).eq('id', checkout_session_id);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      payment_id: payData.id, 
      invoiceUrl: payData.invoiceUrl,
      bankSlipUrl: payData.bankSlipUrl,
      pix: pixData 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error(error);
    
    // Sanitizar reqBody no log de erro
    const safeReqBody = { ...reqBody };
    if (safeReqBody.creditCard) {
       safeReqBody.creditCard = { ...safeReqBody.creditCard, number: '****', ccv: '***', expiryMonth: '**', expiryYear: '****' };
    }

    // ─── Mascaramento de PII no log de erro (LGPD) ───────────────────────────
    const maskCpfErr = (doc: string | undefined) => {
      if (!doc) return null;
      const d = doc.replace(/\D/g, '');
      if (d.length === 11) return `***.***.***-${d.slice(-2)}`;
      if (d.length === 14) return `**.***.***/****-${d.slice(-2)}`;
      return '***';
    };
    const maskPhoneErr = (p: string | undefined) => {
      if (!p) return null;
      const d = p.replace(/\D/g, '');
      if (d.length >= 10) return `(${d.slice(0,2)}) ****-${d.slice(-4)}`;
      return '****';
    };
    const maskEmailErr = (e: string | undefined) => {
      if (!e || !e.includes('@')) return null;
      const [user, domain] = e.split('@');
      return `${user.slice(0,2)}***@${domain}`;
    };

    // Log do erro em financial_logs — sem PII sensível
    try {
      await supabase.from('financial_logs').insert([{
        event_type: 'payment_failed',
        event_source: 'asaas-create-payment',
        product_id: productData?.id,
        product_name: productData?.name,
        product_slug: reqBody?.product_slug,
        customer_name: reqBody?.name,
        customer_email: maskEmailErr(reqBody?.email),
        customer_phone: maskPhoneErr(reqBody?.phone),
        customer_document: maskCpfErr(reqBody?.cpfCnpj),
        gateway: 'asaas',
        payment_method: reqBody?.billingType,
        amount: finalAmount,
        split_enabled: splitRulesGlob.length > 0,
        metadata: { applied_splits: splitRulesGlob },
        request_payload: safeReqBody,
        error_message: error.message || String(error)
      }]);
    } catch (logErr) {
       console.error("Failed to write to financial_logs:", logErr);
    }

    // Mapeamento de erros seguros (M-07)
    const userFriendlyErrors: Record<string, string> = {
      'Missing required fields: email, billingType, product_slug': 'Dados incompletos. Verifique o formulário.',
      'Produto não encontrado ou inativo': 'Este produto não está disponível no momento.'
    };
    const userMsg = userFriendlyErrors[error.message] || 'Erro ao processar pagamento. Tente novamente ou contate o suporte.';
    
    return new Response(JSON.stringify({ success: false, error: userMsg }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
})
