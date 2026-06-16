import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Helpers
function maskSensitiveData(payload: any): any {
  if (!payload || typeof payload !== 'object') return payload;
  const masked = { ...payload };
  
  const sensitiveKeys = ['cpf', 'document', 'card', 'credit_card', 'cc_number', 'address', 'zip_code', 'phone'];
  
  for (const key in masked) {
    if (typeof masked[key] === 'object') {
      masked[key] = maskSensitiveData(masked[key]);
    } else {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
        masked[key] = '***MASKED***';
      }
    }
  }
  return masked;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

serve(async (req) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const rawText = await req.text();
    let payload = {};
    try {
      payload = JSON.parse(rawText);
    } catch(e) {}

    // 1. SECURITY VALIDATION
    const envSecret = Deno.env.get('WEBHOOK_SECRET');
    const headerSecret = req.headers.get('x-webhook-secret');
    
    let isTest = payload.is_test === true || payload.event === 'test';
    let envType = payload.environment || 'production';
    
    if (envSecret && headerSecret !== envSecret) {
      if (!isTest) {
         // Fail if secret exists but doesn't match and it's not explicitly a test payload
         return new Response(JSON.stringify({ error: 'Unauthorized. Invalid x-webhook-secret.' }), { 
           status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
         });
      }
    }

    if (!envSecret) {
      // Allows testing easily
      isTest = true;
      envType = 'test';
    }

    // Extract Info
    const eventType = payload.event || payload.type || payload.event_type || 'unknown';
    const amount = payload.amount || payload.value || payload.transaction?.price || 0;
    const currency = payload.currency || 'BRL';
    const platform = payload.platform || 'api';
    
    // Buyer Info
    const buyer = payload.buyer || payload.customer || {};
    const buyerEmail = buyer.email || payload.email || null;
    const buyerName = buyer.name || payload.name || null;
    const buyerPhone = buyer.phone || null;
    const transactionId = payload.transaction_id || payload.order_id || payload.transaction?.id || null;

    // Supabase DB
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get IP
    const sourceIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const maskedPayload = maskSensitiveData(payload);

    // 2. LOG EVERY WEBHOOK
    const { error: logError } = await supabase
      .from('webhook_logs')
      .insert([{
        platform,
        event_type: eventType,
        status: 'received',
        amount: Number(amount) || 0,
        currency,
        buyer_name: buyerName,
        buyer_email: buyerEmail,
        buyer_phone: buyerPhone ? '***MASKED***' : null,
        transaction_id: transactionId,
        raw_payload: maskedPayload,
        response_status: 200,
        response_message: 'Success',
        source_ip: sourceIp,
        environment: envType,
        is_test: isTest
      }]);

    if (logError) {
      console.error("Error logging webhook:", logError);
    }

    // 3. ACTION HANDLERS
    const isPurchase = ['purchase.approved', 'paid', 'approved', 'compra_aprovada'].includes(eventType.toLowerCase());
    const isAbandonment = ['cart_abandoned', 'checkout_abandoned', 'abandoned_cart'].includes(eventType.toLowerCase());
    const isBoleto = ['billet_printed', 'boleto_gerado'].includes(eventType.toLowerCase());
    const isPix = ['pix_generated', 'pix_gerado'].includes(eventType.toLowerCase());

    if (isPurchase) {
      await supabase.from('purchases').insert([{ 
        order_id: transactionId, 
        email: buyerEmail, 
        value: amount || 497, 
        status: 'approved' 
      }]);
      
      if (buyerEmail) {
        await supabase.from('leads').update({ lead_status: 'purchased' }).eq('email', buyerEmail);
      }
    } 
    else if (isAbandonment && buyerEmail) {
      await supabase.from('leads').update({ lead_status: 'checkout_abandoned' }).eq('email', buyerEmail);
    }
    else if ((isBoleto || isPix) && buyerEmail) {
      await supabase.from('leads').update({ lead_status: 'waiting_payment' }).eq('email', buyerEmail);
    }

    return new Response(JSON.stringify({ success: true, message: 'Webhook processed successfully' }), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
})
