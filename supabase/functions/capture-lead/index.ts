import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getCorsHeaders } from "../_shared/security.ts"

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

    const body = await req.json();
    const action = body.action;

    // AÇÃO 1: Criar Sessão de Checkout (quando carrega a página)
    if (action === 'create_checkout_session') {
      const { action: _, ...sessionData } = body;
      
      const { data, error } = await supabase.from('checkout_sessions').insert([
        sessionData
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

    // AÇÃO 3: Upsert Lead (chamado pelo tracking.js)
    if (action === 'upsert_lead') {
      const { leadData } = body;
      
      const { data, error } = await supabase.from('leads').upsert(leadData, { onConflict: 'email' }).select().single();
      
      if (error) throw error;
      return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: corsHeaders });

  } catch (error: any) {
    console.error('Error in funnel edge function:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
})
