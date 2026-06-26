-- ==============================================================================
-- SPRINT DE HARDENING - FASE 4 (BLOCO 2 E 4)
-- Objetivo: Endurecimento do Checkout e Leads, Remoção de acessos anônimos
-- ==============================================================================

-- 1. Adicionar token seguro em checkout_sessions para não depender apenas do ID
ALTER TABLE public.checkout_sessions
ADD COLUMN IF NOT EXISTS session_token UUID DEFAULT extensions.uuid_generate_v4();

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_token ON public.checkout_sessions(session_token);

-- 2. Criar RPC segura para consultar status do checkout sem expor a tabela
CREATE OR REPLACE FUNCTION public.get_checkout_status(p_session_id UUID, p_session_token UUID)
RETURNS TEXT AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status 
  FROM public.checkout_sessions 
  WHERE id = p_session_id AND session_token = p_session_token;
  
  RETURN v_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Revogar permissões públicas (Anon) de INSERT e UPDATE sensíveis
-- Agora tudo isso passará pela Edge Function `capture-lead`

-- Remover de checkout_sessions
DROP POLICY IF EXISTS "Anon can insert checkout_sessions" ON public.checkout_sessions;
DROP POLICY IF EXISTS "Anon pode inserir checkout_sessions" ON public.checkout_sessions;
DROP POLICY IF EXISTS "Anon can update checkout_sessions" ON public.checkout_sessions;
DROP POLICY IF EXISTS "Anon pode atualizar propria checkout_session" ON public.checkout_sessions;
DROP POLICY IF EXISTS "Anon can select checkout_sessions" ON public.checkout_sessions;
DROP POLICY IF EXISTS "Anon pode ler checkout_sessions" ON public.checkout_sessions;
DROP POLICY IF EXISTS "Anon public select checkout_sessions" ON public.checkout_sessions;

-- Remover de leads
DROP POLICY IF EXISTS "Anon can insert leads" ON public.leads;
DROP POLICY IF EXISTS "Anon pode inserir leads" ON public.leads;
DROP POLICY IF EXISTS "Anon can update leads" ON public.leads;
DROP POLICY IF EXISTS "Anon pode atualizar leads" ON public.leads;
DROP POLICY IF EXISTS "Anon pode atualizar proprio lead via session_id" ON public.leads;
