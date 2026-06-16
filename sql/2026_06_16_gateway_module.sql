-- =========================================================================================
-- FASE 12.2: ARQUITETURA ENTERPRISE MULTI-GATEWAY & ASAAS
-- =========================================================================================

-- 1. TABELAS DE CONTROLE MULTI-GATEWAY
CREATE TABLE IF NOT EXISTS public.payment_gateways (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    environment TEXT DEFAULT 'sandbox' CHECK (environment IN ('sandbox', 'production')),
    is_default BOOLEAN DEFAULT false,
    config_json JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.gateway_events (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    gateway TEXT NOT NULL,
    event_type TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed', 'ignored')),
    payload JSONB NOT NULL,
    processed_at TIMESTAMPTZ,
    retry_count INTEGER DEFAULT 0,
    last_retry_at TIMESTAMPTZ,
    event_id TEXT UNIQUE -- GARANTIA DE IDEMPOTÊNCIA GLOBAL (UNIQUE CONSTRAINT)
);

CREATE TABLE IF NOT EXISTS public.payment_attempts (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    gateway TEXT NOT NULL,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
    purchase_id UUID REFERENCES public.purchases(id) ON DELETE SET NULL,
    attempt_type TEXT NOT NULL, -- PIX_CREATED, CARD_DECLINED, etc
    status TEXT NOT NULL,
    amount NUMERIC(10, 2),
    payload JSONB
);

-- 2. TABELAS FINANCEIRAS GLOBAIS (Recorrência e Estornos)
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    member_id UUID REFERENCES public.members(id) ON DELETE CASCADE,
    gateway TEXT NOT NULL,
    gateway_subscription_id TEXT UNIQUE NOT NULL,
    plan_name TEXT,
    amount NUMERIC(10, 2) NOT NULL,
    billing_cycle TEXT DEFAULT 'MONTHLY' CHECK (billing_cycle IN ('MONTHLY', 'QUARTERLY', 'SEMIANNUALLY', 'YEARLY')),
    status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'OVERDUE', 'CANCELLED', 'EXPIRED')),
    next_due_date TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ
);

CREATE TRIGGER set_subscriptions_updated_at
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.refunds (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    purchase_id UUID REFERENCES public.purchases(id) ON DELETE CASCADE,
    gateway TEXT NOT NULL,
    gateway_refund_id TEXT UNIQUE NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    reason TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
    processed_at TIMESTAMPTZ
);

-- 3. TABELAS ESPECÍFICAS DO ASAAS
CREATE TABLE IF NOT EXISTS public.asaas_customers (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
    asaas_customer_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    cpf_cnpj TEXT,
    phone TEXT,
    mobile_phone TEXT,
    raw_payload JSONB
);

CREATE TABLE IF NOT EXISTS public.asaas_payments (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    gateway TEXT DEFAULT 'asaas',
    asaas_payment_id TEXT UNIQUE NOT NULL,
    asaas_customer_id TEXT REFERENCES public.asaas_customers(asaas_customer_id) ON DELETE SET NULL,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
    purchase_id UUID REFERENCES public.purchases(id) ON DELETE SET NULL,
    billing_type TEXT NOT NULL, -- PIX, BOLETO, CREDIT_CARD
    status TEXT NOT NULL,
    value NUMERIC(10, 2) NOT NULL,
    net_value NUMERIC(10, 2),
    due_date DATE,
    payment_date DATE,
    confirmed_date TIMESTAMPTZ,
    invoice_url TEXT,
    bank_slip_url TEXT,
    pix_qr_code TEXT,
    pix_copy_paste TEXT,
    description TEXT,
    external_reference TEXT,
    raw_payload JSONB
);

-- 4. ALTERAÇÕES EM PURCHASES E MEMBER_PRODUCTS
ALTER TABLE public.purchases
ADD COLUMN IF NOT EXISTS gateway TEXT,
ADD COLUMN IF NOT EXISTS gateway_payment_id TEXT,
ADD COLUMN IF NOT EXISTS gateway_customer_id TEXT,
ADD COLUMN IF NOT EXISTS gateway_subscription_id TEXT;

-- 5. TRIGGER DE REVOGAÇÃO DE ACESSO (REEMBOLSO/CANCELAMENTO)
CREATE OR REPLACE FUNCTION public.handle_access_revocation()
RETURNS TRIGGER AS $$
BEGIN
    -- Se for tabela REFUNDS (Compra única reembolsada)
    IF TG_TABLE_NAME = 'refunds' THEN
        IF NEW.status = 'processed' THEN
            -- Localiza o member_id e revoga todos os produtos atrelados a essa purchase
            -- Como purchase ainda não tem vínculo N:N de produtos explícito, revogamos os produtos que o webhook informou,
            -- Ou, por segurança corporativa, bloqueamos o acesso aos member_products com data de granted_at parecida, 
            -- ou exigiremos que 'purchase_id' seja salvo em member_products no futuro.
            -- Para já, vamos suspender a purchase
            UPDATE public.purchases SET status = 'refunded' WHERE id = NEW.purchase_id;
            
            -- Registrar evento em gateway_events
            INSERT INTO public.webhook_logs (origin, status, details) 
            VALUES ('system:access_revoked', 'success', 'Refund processed for purchase ' || NEW.purchase_id);
        END IF;
    
    -- Se for tabela SUBSCRIPTIONS (Assinatura cancelada)
    ELSIF TG_TABLE_NAME = 'subscriptions' THEN
        IF NEW.status IN ('CANCELLED', 'EXPIRED') THEN
            -- Revoga todos os acessos vinculados a este membro originados por assinatura (simplificado)
            -- Como não temos o vínculo exato do produto da assinatura ainda (até a Fase 13),
            -- Apenas bloqueamos se o usuário tiver acesso.
            UPDATE public.member_products 
            SET access_granted = false, status = 'suspended'
            WHERE member_id = NEW.member_id;
            
            INSERT INTO public.webhook_logs (origin, status, details) 
            VALUES ('system:access_revoked', 'success', 'Subscription cancelled for member ' || NEW.member_id);
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_refund_processed ON public.refunds;
CREATE TRIGGER on_refund_processed
AFTER INSERT OR UPDATE OF status ON public.refunds
FOR EACH ROW EXECUTE FUNCTION public.handle_access_revocation();

DROP TRIGGER IF EXISTS on_subscription_cancelled ON public.subscriptions;
CREATE TRIGGER on_subscription_cancelled
AFTER INSERT OR UPDATE OF status ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.handle_access_revocation();


-- 6. SEGURANÇA E RLS
ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gateway_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asaas_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asaas_payments ENABLE ROW LEVEL SECURITY;

-- POLICIES (Admin Only)
CREATE POLICY "Admin full access payment_gateways" ON public.payment_gateways FOR ALL USING (auth.jwt() ->> 'email' = 'suporteglauberr@gmail.com');
CREATE POLICY "Admin full access gateway_events" ON public.gateway_events FOR ALL USING (auth.jwt() ->> 'email' = 'suporteglauberr@gmail.com');
CREATE POLICY "Admin full access payment_attempts" ON public.payment_attempts FOR ALL USING (auth.jwt() ->> 'email' = 'suporteglauberr@gmail.com');
CREATE POLICY "Admin full access subscriptions" ON public.subscriptions FOR ALL USING (auth.jwt() ->> 'email' = 'suporteglauberr@gmail.com');
CREATE POLICY "Admin full access refunds" ON public.refunds FOR ALL USING (auth.jwt() ->> 'email' = 'suporteglauberr@gmail.com');
CREATE POLICY "Admin full access asaas_customers" ON public.asaas_customers FOR ALL USING (auth.jwt() ->> 'email' = 'suporteglauberr@gmail.com');
CREATE POLICY "Admin full access asaas_payments" ON public.asaas_payments FOR ALL USING (auth.jwt() ->> 'email' = 'suporteglauberr@gmail.com');

-- INSERT INICIAL DO GATEWAY DEFAULT
INSERT INTO public.payment_gateways (name, slug, environment, is_default, config_json)
VALUES ('Asaas', 'asaas', 'sandbox', true, '{"webhook_enabled": true}'::jsonb)
ON CONFLICT (slug) DO NOTHING;
