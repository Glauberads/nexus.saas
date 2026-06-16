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
    const body = await req.json()
    const { automation_type, n8n_webhook_url, payload, lead_id, event_id } = body;

    if (!automation_type || !n8n_webhook_url || !payload) {
      throw new Error('Missing required fields: automation_type, n8n_webhook_url, payload')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Evitar Duplicidade
    let timeFilter = null;
    if (automation_type === 'hot_lead') {
      // Hot lead: 1x por dia por lead
      const date = new Date();
      date.setHours(date.getHours() - 24);
      timeFilter = date.toISOString();
    }

    if (lead_id || event_id) {
      let query = supabase.from('automation_logs')
        .select('id')
        .eq('automation_name', automation_type)
        .eq('status', 'success');

      if (lead_id) query = query.eq('lead_id', lead_id);
      if (event_id) query = query.eq('event_id', event_id);
      if (timeFilter) query = query.gte('created_at', timeFilter);

      const { data: existing } = await query;
      if (existing && existing.length > 0) {
        return new Response(JSON.stringify({ success: true, skipped: true, message: 'Automation already executed recently.' }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }
    }

    // 2. Disparar para o n8n
    const n8nSecret = Deno.env.get('N8N_WEBHOOK_SECRET') || 'NEXUS_N8N_SECRET_123';
    
    let n8nResponseData = {};
    let n8nStatus = 'failed';
    let errorMessage = null;

    try {
      const n8nReq = await fetch(n8n_webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-nexus-secret': n8nSecret
        },
        body: JSON.stringify(payload)
      });
      
      n8nStatus = n8nReq.ok ? 'success' : 'failed';
      try { n8nResponseData = await n8nReq.json(); } catch(e) { n8nResponseData = { text: await n8nReq.text() }; }
      if (!n8nReq.ok) errorMessage = `n8n returned status ${n8nReq.status}`;

    } catch (fetchErr) {
      errorMessage = fetchErr.message;
    }

    // 3. Registrar Log
    await supabase.from('automation_logs').insert([{
      automation_name: automation_type,
      trigger_type: 'api',
      lead_id: lead_id || null,
      event_id: event_id || null,
      status: n8nStatus,
      destination: n8n_webhook_url,
      payload: payload,
      response: n8nResponseData,
      error_message: errorMessage
    }]);

    if (n8nStatus === 'failed') {
      throw new Error(errorMessage || 'Unknown n8n error');
    }

    return new Response(JSON.stringify({ success: true, message: 'Automation dispatched' }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { 
      status: 400, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
})
