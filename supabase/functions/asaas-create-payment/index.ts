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
    const { lead_id, name, email, cpfCnpj, value, billingType, description, dueDate } = await req.json();

    if (!email || !value || !billingType) {
      throw new Error('Missing required fields: email, value, billingType');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const asaasKey = Deno.env.get('ASAAS_API_KEY');
    const asaasEnv = Deno.env.get('ASAAS_ENVIRONMENT') || 'sandbox';
    const baseUrl = asaasEnv === 'sandbox' ? 'https://sandbox.asaas.com/api/v3' : 'https://api.asaas.com/v3';

    if (!asaasKey) throw new Error('ASAAS_API_KEY not configured');

    // 1. Procurar ou Criar Cliente no Asaas
    let customerId = null;
    const { data: existingCustomer } = await supabase.from('asaas_customers').select('asaas_customer_id').eq('email', email).single();
    
    if (existingCustomer) {
      customerId = existingCustomer.asaas_customer_id;
    } else {
      // Criar no Asaas
      const custRes = await fetch(`${baseUrl}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'access_token': asaasKey },
        body: JSON.stringify({ name: name || 'Cliente Sem Nome', email, cpfCnpj })
      });
      const custData = await custRes.json();
      if (!custRes.ok) throw new Error(`Asaas Customer Error: ${JSON.stringify(custData)}`);
      
      customerId = custData.id;

      // Salvar espelho
      await supabase.from('asaas_customers').insert([{
        lead_id, asaas_customer_id: customerId, name: name || 'Cliente Sem Nome', email, cpf_cnpj: cpfCnpj, raw_payload: custData
      }]);
    }

    // 2. Criar Cobrança
    const paymentPayload = {
      customer: customerId,
      billingType,
      value,
      dueDate: dueDate || new Date(Date.now() + 86400000).toISOString().split('T')[0], // Tomorrow
      description: description || 'Compra NexusSaaS'
    };

    const payRes = await fetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'access_token': asaasKey },
      body: JSON.stringify(paymentPayload)
    });
    const payData = await payRes.json();
    if (!payRes.ok) throw new Error(`Asaas Payment Error: ${JSON.stringify(payData)}`);

    // 3. Obter PIX QR Code (se for PIX)
    let pixData = null;
    if (billingType === 'PIX') {
      const pRes = await fetch(`${baseUrl}/payments/${payData.id}/pixQrCode`, {
        headers: { 'access_token': asaasKey }
      });
      if (pRes.ok) {
        pixData = await pRes.json();
      }
    }

    // 4. Salvar log tático (payment_attempts) e na asaas_payments
    await supabase.from('payment_attempts').insert([{
      gateway: 'asaas', lead_id, attempt_type: `${billingType}_CREATED`, status: 'pending', amount: value, payload: payData
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
      raw_payload: payData
    }]);

    return new Response(JSON.stringify({ 
      success: true, 
      payment_id: payData.id, 
      invoiceUrl: payData.invoiceUrl,
      bankSlipUrl: payData.bankSlipUrl,
      pix: pixData 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { 
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
})
