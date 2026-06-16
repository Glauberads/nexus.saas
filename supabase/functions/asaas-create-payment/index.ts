import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { lead_id, checkout_session_id, product_slug, name, email, cpfCnpj, phone, billingType, description, dueDate, installments } = await req.json();

    if (!email || !billingType || !product_slug) {
      throw new Error('Missing required fields: email, billingType, product_slug');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

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
    
    const paymentPayload: any = {
      customer: customerId,
      billingType,
      value: finalValue,
      dueDate: dueDate || new Date(Date.now() + 86400000).toISOString().split('T')[0], // Amanhã
      description: description || `Compra: ${product.name}`,
      externalReference: checkout_session_id
    };

    // Handle installments if CREDIT_CARD
    if (billingType === 'CREDIT_CARD' && installments > 1) {
       // Asaas has a different endpoint for installments but for simplification of this MVP
       paymentPayload.installmentCount = Math.min(installments, product.max_installments || 12);
       paymentPayload.installmentValue = finalValue / paymentPayload.installmentCount;
       // We'll let Asaas handle the exact breakdown if we were using the full installment API, 
       // but assuming standard payment payload handles basic fields.
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

    // 4. Salvar logs internos
    await supabase.from('payment_attempts').insert([{
      gateway: 'asaas', lead_id, attempt_type: `${billingType}_CREATED`, status: 'pending', amount: realPrice, payload: payData
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
    return new Response(JSON.stringify({ success: false, error: error.message }), { 
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
})
