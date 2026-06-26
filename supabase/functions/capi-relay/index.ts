// ============================================================
// NexusSaaS — Meta CAPI Relay (Supabase Edge Function)
// Recebe eventos do front e repassa para Graph API Server-side
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getCorsHeaders, checkRateLimit } from "../_shared/security.ts"

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const supabase = createClient(supabaseUrl, supabaseKey);

  // ── RATE LIMITING (30 requests / minuto / IP)
  const isAllowed = await checkRateLimit(supabase, req, 'capi-relay', 30, 60);
  if (!isAllowed) {
    return new Response(JSON.stringify({ error: 'Too Many Requests' }), { 
      status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }

  try {
    const payload = await req.json()
    const {
      event_name, event_id, event_source_url,
      fbp, fbc, fbclid, em, ph, external_id, user_agent,
      currency, value
    } = payload

    const pixelId = payload.pixel_id || Deno.env.get('META_PIXEL_ID')
    const accessToken = Deno.env.get('META_CAPI_TOKEN')

    if (!pixelId || !accessToken) {
      return new Response(JSON.stringify({ error: 'Missing Meta credentials in Edge Function envs.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 })
    }

    // IP Extraction
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1'

    const capiData = [{
      event_name,
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_id,
      event_source_url,
      user_data: {
        client_ip_address: ip,
        client_user_agent: user_agent || req.headers.get('user-agent'),
        fbc: fbc || (fbclid ? `fb.1.${Date.now()}.${fbclid}` : undefined),
        fbp,
        em: em ? [em] : undefined,
        ph: ph ? [ph] : undefined,
        external_id: external_id ? [external_id] : undefined
      },
      custom_data: {
        currency: currency || 'BRL',
        value: value || 0
      }
    }]

    const response = await fetch(`https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: capiData })
    })

    const fbData = await response.json()

    return new Response(JSON.stringify(fbData), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error: any) {
    console.error('CAPI Relay error:', error)
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
  }
})
