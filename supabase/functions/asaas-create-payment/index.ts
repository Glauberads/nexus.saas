import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { lead_id, checkout_session_id, product_slug, name, email, cpfCnpj, phone, billingType, description, dueDate } = await req.json();

    if (!email || !billingType || !product_slug) {
      throw new Error('Missing required fields: email, billingType, product_slug');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const asaasKey = Deno.env.get('ASAAS_API_KEY');
    const asaasEnv = Deno.env.get('ASAAS_ENVIRONMENT') || 'sandbox';
    const baseUrl = asaasEnv === 'sandbox' ? 'https://sandbox.asaas.com/api/v3' : 'https://api.asaas.com/v3';

    if (!asaasKey) throw new Error('ASAAS_API_KEY not configured');

    // 0. Validar Produto e Obter Preço Real
    const { data: product, error: prodErr } = await supabase.from('products').select('*').eq('checkout_slug', product_slug).single();
    
    if (prodErr || !product) throw new Error('Produto não encontrado.');
    if (product.status !== 'active' || !product.checkout_enabled) throw new Error('Produto não está disponível para venda.');
    if (product.price <= 0) throw new Error('Valor inválido para o produto.');

    const realPrice = product.price;

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
    const paymentPayload = {
      customer: customerId,
      billingType,
      value: realPrice,
      dueDate: dueDate || new Date(Date.now() + 86400000).toISOString().split('T')[0], // Amanhã
      description: description || `Compra: ${product.name}`,
      externalReference: checkout_session_id
    };

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
