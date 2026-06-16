import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-nexus-secret',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const secret = req.headers.get('x-nexus-secret');
    const validSecret = Deno.env.get('N8N_WEBHOOK_SECRET') || 'NEXUS_N8N_SECRET_123';
    
    if (secret !== validSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const body = await req.json()
    const { lead_id, whatsapp, message, external_message_id, source } = body;

    if (!lead_id && !whatsapp) {
      throw new Error('Missing lead_id or whatsapp');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Identificar o Lead
    let targetLeadId = lead_id;
    let leadName = 'Desconhecido';

    if (!targetLeadId && whatsapp) {
      const { data: leads } = await supabase.from('leads').select('id, name').eq('whatsapp', whatsapp).limit(1);
      if (leads && leads.length > 0) {
        targetLeadId = leads[0].id;
        leadName = leads[0].name || whatsapp;
      } else {
        throw new Error('Lead not found for provided whatsapp');
      }
    } else if (targetLeadId) {
      const { data: l } = await supabase.from('leads').select('name').eq('id', targetLeadId).single();
      if (l) leadName = l.name;
    }

    // Gravar Mensagem
    const { error: msgErr } = await supabase.from('crm_messages').insert([{
      lead_id: targetLeadId,
      direction: 'inbound',
      channel: 'whatsapp',
      message: message || '',
      status: 'received',
      source: source || 'n8n',
      external_message_id: external_message_id || null
    }]);

    if (msgErr) {
      // Ignora erro de duplicidade se for a mesma mensagem, mas continua o fluxo
      if (!msgErr.message.includes('unique constraint')) {
         throw msgErr;
      }
    }

    // Atualizar Lead (Status = replied)
    await supabase.from('leads').update({
      lead_status: 'replied',
      last_activity_at: new Date().toISOString()
    }).eq('id', targetLeadId);

    // Gravar Jornada
    await supabase.from('lead_journey').insert([{
      lead_id: targetLeadId,
      action_type: 'whatsapp_reply',
      action_details: { message: message ? message.substring(0, 50) + '...' : '' }
    }]);

    // Disparar Notificação para o Sino
    await supabase.from('notifications').insert([{
      type: 'whatsapp_reply',
      title: 'Nova Resposta no WhatsApp',
      message: `${leadName} respondeu no WhatsApp.`,
      lead_id: targetLeadId,
      payload: { message }
    }]);

    return new Response(JSON.stringify({ success: true }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { 
      status: 400, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
})
