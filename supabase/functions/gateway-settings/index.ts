import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Utilitário para derivar uma chave de 256-bit (32 bytes) a partir da string secreta usando SHA-256
async function getCryptoKey(secretString: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const secretKeyData = enc.encode(secretString);
  const hash = await crypto.subtle.digest('SHA-256', secretKeyData);
  return crypto.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

// Criptografar (retorna iv:ciphertext em base64)
async function encryptData(text: string, secretString: string): Promise<string> {
  if (!text) return '';
  const key = await getCryptoKey(secretString);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encodedText = new TextEncoder().encode(text);
  
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encodedText
  );
  
  // Combine IV e Ciphertext
  const cipherArray = Array.from(new Uint8Array(cipherBuffer));
  const ivArray = Array.from(iv);
  
  // Converte para base64
  const cipherBase64 = btoa(String.fromCharCode(...cipherArray));
  const ivBase64 = btoa(String.fromCharCode(...ivArray));
  
  return `${ivBase64}:${cipherBase64}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Unauthorized');

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Validação de Admin
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user || user.email !== 'suporteglauberr@gmail.com') {
      throw new Error('Unauthorized Admin Access');
    }

    const { gateway, environment, apiKey, webhookToken, isActive } = await req.json();

    if (!gateway) throw new Error('Gateway name required');

    const encryptionSecret = Deno.env.get('GATEWAY_ENCRYPTION_SECRET');
    if (!encryptionSecret) throw new Error('Encryption secret not configured');

    const updatePayload: any = { environment, is_active: isActive };
    
    // Apenas criptografar se os valores não estiverem vazios/mascarados
    if (apiKey && apiKey !== '********') {
      updatePayload.api_key_encrypted = await encryptData(apiKey, encryptionSecret);
    }
    
    if (webhookToken && webhookToken !== '********') {
      updatePayload.webhook_token_encrypted = await encryptData(webhookToken, encryptionSecret);
    }

    const { data, error } = await supabase.from('gateway_settings').upsert({
      gateway_name: gateway,
      ...updatePayload
    }, { onConflict: 'gateway_name' }).select();

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ success: false, error: error.message }), { 
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
})
