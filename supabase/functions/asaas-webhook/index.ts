import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, asaas-access-token',
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
    const asaasToken = req.headers.get('asaas-access-token');

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const encryptionSecret = Deno.env.get('GATEWAY_ENCRYPTION_SECRET');
    if (!encryptionSecret) throw new Error('Encryption secret not configured');

    const { data: settings } = await supabase.from('gateway_settings').select('webhook_token_encrypted').eq('gateway_name', 'asaas').single();
    let expectedToken = null;
    if (settings && settings.webhook_token_encrypted) {
      expectedToken = await decryptData(settings.webhook_token_encrypted, encryptionSecret);
    }

    if (expectedToken && asaasToken !== expectedToken) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const payload = await req.json();
    const eventType = payload.event;
    const payment = payload.payment;
    
    if (!payment) {
      return new Response('Ignored', { status: 200, headers: corsHeaders });
    }

    const criticalEvents = ['PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_CHARGEBACK_DISPUTE', 'PAYMENT_FAILED', 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED'];
    const keepForever = criticalEvents.includes(eventType);

    // 1. Idempotência usando UNIQUE CONSTRAINT em gateway_events
    const { error: insertError } = await supabase.from('gateway_events').insert([{
      gateway: 'asaas',
      event_type: eventType,
      status: 'processed',
      payload: payload,
      event_id: payload.id, // Este campo é UNIQUE
      keep_forever: keepForever
    }]);

    // Se violar o UNIQUE (código 23505 no Postgres), já processamos. Ignora com 200 pro Asaas parar de mandar.
    if (insertError && insertError.code === '23505') {
      console.log(`Duplicate event ${payload.id} ignored.`);
      return new Response(JSON.stringify({ ignored_duplicate: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2. Localizar cobrança interna
    const { data: internalPayment } = await supabase.from('asaas_payments').select('id, lead_id, member_id, purchase_id').eq('asaas_payment_id', payment.id).single();

    // 3. Roteamento de Ação
    if (eventType === 'PAYMENT_CONFIRMED' || eventType === 'PAYMENT_RECEIVED') {
      // Atualizar payment
      await supabase.from('asaas_payments').update({
        status: payment.status,
        payment_date: payment.paymentDate,
        confirmed_date: payment.confirmedDate,
        net_value: payment.netValue
      }).eq('asaas_payment_id', payment.id);

      // Se não houver purchase_id vinculada, vamos criar na tabela purchases para consolidar a receita.
      if (internalPayment && !internalPayment.purchase_id && internalPayment.lead_id) {
        let checkoutSessionId = payment.externalReference || null;
        let productName = payment.description || 'Produto Asaas';
        
        if (checkoutSessionId) {
          // Atualiza status do checkout session
          await supabase.from('checkout_sessions').update({ status: 'paid' }).eq('id', checkoutSessionId);
          
          // Tenta buscar o nome do produto da checkout session
          const { data: sessionData } = await supabase.from('checkout_sessions').select('product_slug').eq('id', checkoutSessionId).single();
          if (sessionData && sessionData.product_slug) {
            const { data: prodData } = await supabase.from('products').select('name').eq('checkout_slug', sessionData.product_slug).single();
            if (prodData) productName = prodData.name;
          }
        }

        const { data: newPurchase } = await supabase.from('purchases').insert([{
          lead_id: internalPayment.lead_id,
          product_name: productName,
          amount: payment.value,
          status: 'approved',
          gateway: 'asaas',
          gateway_payment_id: payment.id,
          gateway_customer_id: payment.customer
        }]).select('id').single();

        if (newPurchase) {
          await supabase.from('asaas_payments').update({ purchase_id: newPurchase.id }).eq('asaas_payment_id', payment.id);
        }
      }
    } 
    else if (eventType === 'PAYMENT_REFUNDED') {
      await supabase.from('asaas_payments').update({ status: 'refunded' }).eq('asaas_payment_id', payment.id);
      if (internalPayment && internalPayment.purchase_id) {
        // Criar refund na tabela global e a Trigger do banco revogará o acesso
        await supabase.from('refunds').insert([{
          purchase_id: internalPayment.purchase_id,
          gateway: 'asaas',
          gateway_refund_id: payment.id + '_refund',
          amount: payment.value,
          status: 'processed'
        }]);
      }
    }
    else if (eventType === 'PAYMENT_OVERDUE' || eventType === 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED') {
      await supabase.from('asaas_payments').update({ status: payment.status }).eq('asaas_payment_id', payment.id);
      await supabase.from('payment_attempts').insert([{
        gateway: 'asaas', lead_id: internalPayment?.lead_id, attempt_type: eventType, status: 'failed', amount: payment.value, payload: payment
      }]);
    }
    // 3.5 Inserir Log Financeiro (Observabilidade)
    try {
      await supabase.from('financial_logs').insert([{
        event_type: eventType.toLowerCase(),
        event_source: 'asaas-webhook',
        gateway: 'asaas',
        payment_id: payment.id,
        payment_status: payment.status,
        payment_method: payment.billingType,
        amount: payment.value,
        net_amount: payment.netValue,
        response_payload: payload
      }]);
    } catch (logErr) {
      console.error("Failed to write to financial_logs via webhook:", logErr);
    }

    // 4. Disparar webhook global do n8n (Opcional/Assíncrono)
    try {
      const { data: config } = await supabase.from('app_config').select('value').eq('key', 'n8n_webhook_url').single();
      if (config && config.value) {
        fetch(config.value, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'event': `asaas_${eventType.toLowerCase()}` },
          body: JSON.stringify(payload)
        }).catch(e => console.error("N8n dispatch failed", e));
      }
    } catch (e) {
      // Ignorar erro do n8n para não falhar o webhook do Asaas
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ success: false, error: error.message }), { 
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
})
