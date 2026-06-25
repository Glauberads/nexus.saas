-- ==============================================================================
-- NEXUS SAAS - FINANCIAL LOGS MIGRATION
-- Objetivo: Criar tabela para observabilidade de logs financeiros com RLS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.financial_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),

    -- Identificação do Evento
    event_type text NOT NULL,
    event_source text NOT NULL,

    -- Dados do Produto
    product_id uuid NULL,
    product_name text NULL,
    product_slug text NULL,

    -- Dados do Comprador
    customer_name text NULL,
    customer_email text NULL,
    customer_phone text NULL,
    customer_document text NULL,

    -- Dados Financeiros
    gateway text DEFAULT 'asaas',
    payment_id text NULL,
    charge_id text NULL,
    payment_status text NULL,
    payment_method text NULL,
    amount numeric(10,2) NULL,
    net_amount numeric(10,2) NULL,

    -- Split (Retrocompatibilidade)
    split_enabled boolean DEFAULT false,
    split_wallet_id text NULL,
    split_type text NULL,
    split_value numeric(10,2) NULL,

    -- Erros / Debug
    error_message text NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    request_payload jsonb DEFAULT '{}'::jsonb,
    response_payload jsonb DEFAULT '{}'::jsonb
);

-- ==========================================
-- ÍNDICES DE PERFORMANCE
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_financial_logs_created_at ON public.financial_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_logs_payment_status ON public.financial_logs(payment_status);
CREATE INDEX IF NOT EXISTS idx_financial_logs_event_type ON public.financial_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_financial_logs_product_id ON public.financial_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_financial_logs_payment_id ON public.financial_logs(payment_id);
CREATE INDEX IF NOT EXISTS idx_financial_logs_split_enabled ON public.financial_logs(split_enabled);

-- ==========================================
-- RLS (ROW LEVEL SECURITY)
-- ==========================================
ALTER TABLE public.financial_logs ENABLE ROW LEVEL SECURITY;

-- Limpar possíveis políticas antigas caso seja rodado novamente
DROP POLICY IF EXISTS "Admin tem acesso total aos logs financeiros" ON public.financial_logs;
DROP POLICY IF EXISTS "Anon não tem acesso aos logs" ON public.financial_logs;

-- Apenas Admin autenticado pode ler os logs. Backend com Service Role ignora o RLS e pode inserir à vontade.
CREATE POLICY "Admin tem acesso total aos logs financeiros" 
    ON public.financial_logs FOR ALL USING (public.is_admin());
