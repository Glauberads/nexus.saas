import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, checkRateLimit } from "../_shared/security.ts";

// Configurações do CAPI
const CAPI_VERSION = "v21.0";
const PIXEL_ID = Deno.env.get("META_PIXEL_ID");
const ACCESS_TOKEN = Deno.env.get("META_CAPI_TOKEN");

// Supabase Client
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // ── RATE LIMITING (10 requests / minuto / IP)
  const isAllowed = await checkRateLimit(supabase, req, 'abandonment-recovery', 10, 60);
  if (!isAllowed) {
    return new Response(JSON.stringify({ error: 'Too Many Requests' }), { 
      status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }

  // ── WEBHOOK SECRET VALIDATION (A-06)
  const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
  if (webhookSecret) {
    const providedSecret = req.headers.get("x-webhook-secret");
    if (providedSecret !== webhookSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { 
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }
  }

  try {
    const payload = await req.json();
    
    // Identificar formato de webhook (Kiwify/Hotmart)
    // Exemplo genérico: status === 'abandoned' ou event === 'cart_abandoned'
    const isAbandoned = payload.status === 'abandoned' || payload.event === 'cart_abandoned' || payload.status === 'canceled';
    
    if (!isAbandoned) {
      return new Response(JSON.stringify({ msg: "Ignored event" }), { status: 200, headers: corsHeaders });
    }

    const email = payload.email || payload.buyer?.email || payload.customer?.email;
    const phone = payload.phone || payload.buyer?.phone || payload.customer?.phone;
    const firstName = payload.first_name || payload.buyer?.first_name || "Lead";

    if (!email) {
      return new Response(JSON.stringify({ error: "Missing email" }), { status: 400, headers: corsHeaders });
    }

    // 1. Atualizar o Status do Lead no Supabase
    const { data: lead, error } = await supabase
      .from('leads')
      .update({ lead_status: 'checkout_abandoned' })
      .eq('email', email)
      .select('session_id, em_hash, ph_hash, fbc, fbp')
      .single();

    if (error) console.error("Erro Supabase Update:", error);

    // 2. Disparar evento para Meta CAPI (Remarketing Carrinho Abandonado)
    if (PIXEL_ID && ACCESS_TOKEN && lead) {
      const fbPayload = {
        data: [{
          event_name: 'CheckoutAbandoned',
          event_time: Math.floor(Date.now() / 1000),
          action_source: "website",
          user_data: {
            em: lead.em_hash ? [lead.em_hash] : undefined,
            ph: lead.ph_hash ? [lead.ph_hash] : undefined,
            fbc: lead.fbc,
            fbp: lead.fbp,
          },
          custom_data: {
            currency: "BRL",
            value: 600
          }
        }]
      };

      await fetch(`https://graph.facebook.com/${CAPI_VERSION}/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fbPayload),
      });
    }

    // 3. (Futuro) Enviar para n8n Webhook / ActiveCampaign
    const n8nWebhookUrl = Deno.env.get("N8N_WEBHOOK_URL");
    if (n8nWebhookUrl) {
      await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, phone, firstName, event: 'abandonment' })
      }).catch(e => console.error("n8n Webhook error:", e));

      return new Response(JSON.stringify({ msg: "Recovery process started (with n8n)" }), { status: 200, headers: corsHeaders });
    }
    
    return new Response(JSON.stringify({ success: true, msg: "Recovery process started" }), { status: 200, headers: corsHeaders });
    
  } catch (err: any) {
    console.error("Error processing recovery:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
