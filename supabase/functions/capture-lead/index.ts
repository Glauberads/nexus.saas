import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getCorsHeaders } from "../_shared/security.ts"
import { NexusSRE } from "../_shared/sre.ts"

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let body;
    try { body = await req.json(); } catch { return new Response('Invalid JSON', { status: 400 }); }
    
    const sre = new NexusSRE(supabase, 'capture-lead', req, body);
    const action = body.action;

    // AÇÃO 1: Criar Sessão de Checkout (quando carrega a página)
    if (action === 'create_checkout_session') {
      const { action: _, ...sessionData } = body;
      
      const allowedSessionKeys = [
        'lead_id', 'product_id', 'product_slug', 'status', 'payment_method', 
        'amount', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 
        'utm_term', 'fbclid', 'gclid', 'asaas_payment_id', 'expires_at', 'raw_payload'
      ];
      const safeSessionData: any = {};
      for (const key of allowedSessionKeys) {
        if (sessionData[key] !== undefined) safeSessionData[key] = sessionData[key];
      }
      
      const { data, error } = await supabase.from('checkout_sessions').insert([
        safeSessionData
      ]).select('id, session_token').single();

      if (error) throw error;
      return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // AÇÃO 2: Atualizar Sessão de Checkout (ao capturar lead no checkout)
    if (action === 'update_checkout_session') {
      const { session_id, session_token, lead_id, status } = body;
      
      const { error } = await supabase.from('checkout_sessions').update({
        lead_id,
        status: status || 'lead_captured'
      }).eq('id', session_id).eq('session_token', session_token);

      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // AÇÃO 3: Upsert Lead (chamado pelo tracking.js ou checkout-app.js)
    if (action === 'upsert_lead') {
      const leadData = body.leadData || {};
      
      const email = leadData.email || `anonymous_${Date.now()}@nexus.local`;
      const name = leadData.name || 'Visitante';
      const whatsapp = leadData.whatsapp || leadData.phone || '';

      const allowedLeadKeys = [
        'session_id', 'name', 'email', 'whatsapp', 'utm_source', 'utm_medium', 
        'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'device', 
        'city', 'state', 'external_id', 'em_hash', 'ph_hash', 'lead_score', 
        'lead_tier', 'lead_status', 'quiz_answers', 'ltv'
      ];
      
      const safeLeadData: any = { email, name, whatsapp };
      
      for (const key of allowedLeadKeys) {
        if (leadData[key] !== undefined && key !== 'email' && key !== 'name' && key !== 'whatsapp' && key !== 'phone') {
          safeLeadData[key] = leadData[key];
        }
      }
      
      const { data, error } = await supabase.from('leads').upsert(safeLeadData, { onConflict: 'email' }).select().single();
      
      if (error) throw error;
      return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // AÇÃO 4: Log de Eventos (Analytics)
    if (action === 'log_event') {
      const eventData = body.eventData || {};
      const allowedEventKeys = [
        'event_id', 'event_name', 'session_id', 'lead_score', 'params', 'device', 'url', 'referrer'
      ];
      const safeEventData: any = {};
      for (const key of allowedEventKeys) {
        if (eventData[key] !== undefined) safeEventData[key] = eventData[key];
      }

      const { error } = await supabase.from('events').insert([safeEventData]);
      if (error) console.error("Event log error", error);
      
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: corsHeaders });

  } catch (err: any) {
    console.error('Error in capture-lead edge function:', err);
    const supabase = createClient(Deno.env.get('SUPABASE_URL')||'', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');
    const sreFallback = new NexusSRE(supabase, 'capture-lead-fatal', req, {});
    await sreFallback.sendToDLQ({ error: err.message }, 'Fatal Error in capture-lead', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
})
