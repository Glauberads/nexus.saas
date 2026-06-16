import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getCryptoKey(secretString: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const secretKeyData = enc.encode(secretString);
  const hash = await crypto.subtle.digest('SHA-256', secretKeyData);
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function decryptData(encryptedBase64: string, secretString: string): Promise<string> {
  if (!encryptedBase64) return '';
  const parts = encryptedBase64.split(':');
  if (parts.length !== 2) throw new Error('Invalid encrypted format');
  
  const ivStr = atob(parts[0]);
  const cipherStr = atob(parts[1]);
  
  const iv = new Uint8Array(ivStr.length);
  for (let i = 0; i < ivStr.length; i++) iv[i] = ivStr.charCodeAt(i);
  
  const cipher = new Uint8Array(cipherStr.length);
  for (let i = 0; i < cipherStr.length; i++) cipher[i] = cipherStr.charCodeAt(i);

  const key = await getCryptoKey(secretString);
  const decryptedBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  
  return new TextDecoder().decode(decryptedBuffer);
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

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user || user.email !== 'suporteglauberr@gmail.com') throw new Error('Unauthorized Admin Access');

    const { gateway } = await req.json();
    if (gateway !== 'asaas') throw new Error('Gateway not supported for test yet');

    const encryptionSecret = Deno.env.get('GATEWAY_ENCRYPTION_SECRET');
    if (!encryptionSecret) throw new Error('Encryption secret not configured');

    const { data: settings, error: setErr } = await supabase.from('gateway_settings').select('*').eq('gateway_name', gateway).single();
    if (setErr || !settings || !settings.api_key_encrypted) throw new Error('Gateway API Key not found');

    const apiKey = await decryptData(settings.api_key_encrypted, encryptionSecret);
    const baseUrl = settings.environment === 'sandbox' ? 'https://sandbox.asaas.com/api/v3' : 'https://api.asaas.com/v3';

    // Test request to Asaas
    const res = await fetch(`${baseUrl}/customers?limit=1`, {
      method: 'GET',
      headers: { 'access_token': apiKey }
    });

    if (!res.ok) {
      throw new Error(`Asaas API Error: ${res.status} ${res.statusText}`);
    }

    // Update last connection test
    await supabase.from('gateway_settings').update({ last_connection_test: new Date().toISOString() }).eq('id', settings.id);

    return new Response(JSON.stringify({ success: true, message: 'Conectado com sucesso!' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ success: false, error: error.message }), { 
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
})
