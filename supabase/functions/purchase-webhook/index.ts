// ============================================================
// NexusSaaS — Purchase Webhook (Supabase Edge Function)
// Recebe webhook da plataforma de pagamento e dispara eventos
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const payload = await req.json()
    
    // Validar token da plataforma de checkout (ex: Kiwify, Hotmart)
    const token = req.headers.get('x-webhook-token') || new URL(req.url).searchParams.get('token')
    if (token !== Deno.env.get('WEBHOOK_SECRET')) {
      return new Response('Unauthorized', { status: 401 })
    }

    // Extrair dados da compra (adaptar para o formato da sua plataforma)
    const email = payload.email || payload.customer?.email
    const orderId = payload.order_id || payload.transaction?.id
    const value = payload.value || payload.transaction?.price || 600
    const status = payload.status || 'approved'
    
    if (status !== 'approved' && status !== 'paid') {
      return new Response('Ignored (not approved)', { status: 200 })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabase = createClient(supabaseUrl, supabaseKey)

    // 1. Atualizar CRM (lead_status = purchased)
    if (email) {
      await supabase
        .from('leads')
        .update({ lead_status: 'purchased' })
        .eq('email', email)
    }

    // 2. Registrar compra na tabela
    await supabase
      .from('purchases')
      .insert([{ order_id: orderId, email, value, status }])

    // 3. (Opcional) Disparar Meta CAPI de Purchase server-side
    // Requer as mesmas envs do capi-relay
    const pixelId = Deno.env.get('META_PIXEL_ID')
    const accessToken = Deno.env.get('META_CAPI_TOKEN')
    
    if (pixelId && accessToken && email) {
      const crypto = globalThis.crypto
      const encoder = new TextEncoder()
      const data = encoder.encode(email.toLowerCase().trim())
      const hashBuffer = await crypto.subtle.digest('SHA-256', data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const emHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

      const capiData = [{
        event_name: 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        user_data: { em: [emHash] },
        custom_data: { currency: 'BRL', value: value }
      }]

      await fetch(`https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: capiData })
      })
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 })
  }
})
