-- ==============================================================================
-- NEXUS SAAS — HARDENING FASE 3 (Rate Limiting)
-- Data: 2026-06-26
-- Objetivo: Criar tabela e função para Rate Limiting de Edge Functions por IP
-- ==============================================================================

-- 1. Criar tabela de rate limits
CREATE TABLE IF NOT EXISTS public.rate_limits (
  ip_address TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  request_count INT DEFAULT 1,
  last_request TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ip_address, endpoint)
);

-- 2. Habilitar RLS (Segurança)
-- Esta tabela será acessada APENAS pela função SECURITY DEFINER ou Service Role.
-- Nenhuma chamada de API anônima ou autenticada de front-end deve ter acesso direto.
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny all public access to rate_limits" ON public.rate_limits;
CREATE POLICY "Deny all public access to rate_limits" 
  ON public.rate_limits 
  FOR ALL 
  USING (false);

-- 3. Função RPC para checar e incrementar rate limit
-- PL/pgSQL function que age de forma atômica
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_ip_address TEXT,
  p_endpoint TEXT,
  p_limit INT,
  p_window_seconds INT
) RETURNS BOOLEAN AS $$
DECLARE
  v_count INT;
BEGIN
  -- 1. Limpeza de registros expirados para aquele IP/Endpoint
  -- Mantém a tabela leve e reinicia a janela de contagem
  DELETE FROM public.rate_limits 
  WHERE ip_address = p_ip_address 
    AND endpoint = p_endpoint
    AND last_request < NOW() - (p_window_seconds || ' seconds')::INTERVAL;
  
  -- 2. Upsert (Inserir ou Atualizar)
  INSERT INTO public.rate_limits (ip_address, endpoint, request_count, last_request)
  VALUES (p_ip_address, p_endpoint, 1, NOW())
  ON CONFLICT (ip_address, endpoint) DO UPDATE
  SET request_count = rate_limits.request_count + 1,
      last_request = NOW()
  RETURNING request_count INTO v_count;
  
  -- 3. Validação
  IF v_count > p_limit THEN
    RETURN FALSE; -- Estourou o limite
  END IF;
  
  RETURN TRUE; -- Dentro do limite
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
