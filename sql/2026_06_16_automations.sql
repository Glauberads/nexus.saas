-- ==============================================================================
-- NEXUS SAAS - FASE 9: AUTOMAÇÕES E N8N
-- Tabela para registro de execuções do Automation Dispatcher
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.automation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    automation_name TEXT,
    trigger_type TEXT,
    lead_id UUID NULL,
    event_id TEXT NULL,
    status TEXT,
    destination TEXT,
    payload JSONB,
    response JSONB,
    error_message TEXT,
    executed_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;

-- Limpar policies antigas (Prevenção)
DROP POLICY IF EXISTS "Admin tem acesso total em automation_logs" ON public.automation_logs;

-- Criar Policy segura usando is_admin() construída na Fase 7
-- Anônimos não podem inserir ou ler logs de automação
CREATE POLICY "Admin tem acesso total em automation_logs" 
    ON public.automation_logs FOR ALL USING (public.is_admin());
