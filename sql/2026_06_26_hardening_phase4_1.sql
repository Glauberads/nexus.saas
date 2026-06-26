-- ==============================================================================
-- SPRINT DE HARDENING - FASE 4 (BLOCO 1 E 5)
-- Objetivo: Controle de admin baseado em UUID e Retenção LGPD
-- ==============================================================================

-- 1. Criar tabela de admin_users
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

-- Habilitar RLS
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Policy: Admin só vê ele mesmo (por enquanto, se quiser listar todos os admins depois, ajustamos)
DROP POLICY IF EXISTS "Admins can view admin_users" ON public.admin_users;
CREATE POLICY "Admins can view admin_users" ON public.admin_users FOR SELECT USING (auth.uid() = user_id);

-- Migrar o admin atual de forma segura (se ele já existir no auth.users)
INSERT INTO public.admin_users (user_id, notes)
SELECT id, 'System Admin (Migrated)' FROM auth.users WHERE email = 'suporteglauberr@gmail.com'
ON CONFLICT DO NOTHING;

-- 2. Reescrever public.is_admin() para usar a nova tabela
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- BLOCO 5: RETENÇÃO LGPD (CRON / FUNCTION)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_old_logs()
RETURNS VOID AS $$
BEGIN
  -- 1. Events: excluir após 90 dias
  DELETE FROM public.events WHERE created_at < NOW() - INTERVAL '90 days';
  
  -- 2. Webhook Logs: excluir após 90 dias
  DELETE FROM public.webhook_logs WHERE created_at < NOW() - INTERVAL '90 days';
  
  -- 3. Sessions: anonimizar/excluir após 90 dias (vamos excluir para não deixar rastro de device)
  DELETE FROM public.sessions WHERE created_at < NOW() - INTERVAL '90 days';
  
  -- 4. Lead Journey: excluir após 180 dias
  DELETE FROM public.lead_journey WHERE created_at < NOW() - INTERVAL '180 days';
  
  -- 5. Financial Logs: manter para financeiro, mas anonimizar após 12 meses
  UPDATE public.financial_logs
  SET customer_name = 'anon',
      customer_email = 'anon@domain.com',
      customer_phone = 'anon',
      customer_document = 'anon',
      request_payload = '{}'::jsonb
  WHERE created_at < NOW() - INTERVAL '12 months'
    AND customer_email != 'anon@domain.com';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
