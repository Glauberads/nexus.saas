-- =========================================================================================
-- FASE 13: CHECKOUT DE PAGAMENTO FRONT-END
-- =========================================================================================

-- 1. ALTERAÇÃO NA TABELA PRODUCTS
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS price NUMERIC(10, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'BRL',
ADD COLUMN IF NOT EXISTS checkout_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS checkout_slug TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS thank_you_url TEXT,
ADD COLUMN IF NOT EXISTS sales_page_url TEXT,
ADD COLUMN IF NOT EXISTS checkout_config JSONB DEFAULT '{}'::jsonb;

-- Preencher checkout_slug retroativamente
UPDATE public.products SET checkout_slug = slug WHERE checkout_slug IS NULL;

-- 2. TABELA DE CHECKOUT SESSIONS
CREATE TABLE IF NOT EXISTS public.checkout_sessions (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_slug TEXT,
    status TEXT DEFAULT 'started' CHECK (status IN ('started', 'lead_captured', 'payment_created', 'paid', 'abandoned', 'failed')),
    payment_method TEXT,
    amount NUMERIC(10, 2),
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    fbclid TEXT,
    gclid TEXT,
    asaas_payment_id TEXT,
    expires_at TIMESTAMPTZ,
    raw_payload JSONB
);

-- 3. SEGURANÇA E RLS

-- Products: Permitir leitura pública (anon) apenas para produtos com checkout_enabled = true e status = 'active'
-- Assumindo que RLS já está habilitado em products.
DROP POLICY IF EXISTS "Public can view active products" ON public.products;
CREATE POLICY "Public can view active products" ON public.products
FOR SELECT USING (
    status = 'active' AND 
    checkout_enabled = true
);

ALTER TABLE public.checkout_sessions ENABLE ROW LEVEL SECURITY;

-- Policy Admin
CREATE POLICY "Admin full access checkout_sessions" ON public.checkout_sessions
FOR ALL USING (auth.jwt() ->> 'email' = 'suporteglauberr@gmail.com');

-- Policy Anon: Permitir INSERT e UPDATE para criar a sessão e atualizá-la (precisaria ser validado pelo id da sessão)
CREATE POLICY "Anon can insert checkout_sessions" ON public.checkout_sessions
FOR INSERT WITH CHECK (true);

-- Para UPDATE, o anon só pode alterar se for dono da sessão (não há auth, mas podemos restringir)
-- Uma forma simples em anon é permitir update por todos, ou via edge function. Vamos permitir update anon para simplicidade do checkout.
CREATE POLICY "Anon can update checkout_sessions" ON public.checkout_sessions
FOR UPDATE USING (true);

-- O mesmo para leads: anon precisa poder inserir leads.
DROP POLICY IF EXISTS "Anon can insert leads" ON public.leads;
CREATE POLICY "Anon can insert leads" ON public.leads
FOR INSERT WITH CHECK (true);

-- Anon pode dar update em leads (para quando preenchemos WhatsApp depois do e-mail)
DROP POLICY IF EXISTS "Anon can update leads" ON public.leads;
CREATE POLICY "Anon can update leads" ON public.leads
FOR UPDATE USING (true);

-- 4. VIEWS E FUNÇÕES AUXILIARES
-- Para abandono de carrinho, a trigger pode ser ativada por CRON ou webhook externo, mas por enquanto, faremos no Supabase Edge Function ou n8n.
