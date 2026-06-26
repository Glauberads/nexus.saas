const ALLOWED_ORIGINS = [
  'https://glauberads.com.br',
  'https://www.glauberads.com.br',
  'https://membros.glauberads.com.br',
  'https://nexussaas.glauberads.com.br',
  'http://localhost:8080',
  'http://localhost:5173',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:5173'
];

/**
 * Retorna os headers CORS configurados com base na origem da requisição.
 * Se a origem for permitida, reflete-a; caso contrário, retorna Access-Control-Allow-Origin vazia/não permitida.
 */
export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin');
  const allowOrigin = (origin && ALLOWED_ORIGINS.includes(origin)) ? origin : '';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
    'Access-Control-Allow-Credentials': 'true',
  };
}

/**
 * Extrai o IP do cliente dos headers da requisição.
 */
export function getClientIp(req: Request): string {
  // O Supabase/Cloudflare repassa o IP real no header x-forwarded-for ou cf-connecting-ip
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() 
      || req.headers.get('cf-connecting-ip') 
      || '127.0.0.1';
}

/**
 * Função utilitária para verificar o rate limit.
 * Chama a procedure `check_rate_limit` via RPC.
 */
export async function checkRateLimit(supabase: any, req: Request, endpoint: string, limit: number, windowSeconds: number): Promise<boolean> {
  const ip = getClientIp(req);
  
  const { data, error } = await supabase.rpc('check_rate_limit', {
    p_ip_address: ip,
    p_endpoint: endpoint,
    p_limit: limit,
    p_window_seconds: windowSeconds
  });

  if (error) {
    console.error(`[RateLimit] Error checking limit for ${endpoint}:`, error);
    // Fail-open ou Fail-closed? Por segurança, fail-closed temporário se o banco falhar, 
    // mas se for erro leve, vamos considerar false para bloquear.
    return false; 
  }

  return data as boolean;
}
