-- =========================================================================================
-- FASE 12.3: CENTRAL FINANCEIRA E GATEWAYS
-- =========================================================================================

-- 1. TABELA DE CONFIGURAÇÕES DO GATEWAY
CREATE TABLE IF NOT EXISTS public.gateway_settings (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    gateway_name TEXT UNIQUE NOT NULL, -- ex: 'asaas'
    environment TEXT DEFAULT 'sandbox' CHECK (environment IN ('sandbox', 'production')),
    api_key_encrypted TEXT,
    webhook_token_encrypted TEXT,
    is_active BOOLEAN DEFAULT false,
    last_connection_test TIMESTAMPTZ,
    last_sync TIMESTAMPTZ
);

ALTER TABLE public.gateway_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access gateway_settings" ON public.gateway_settings FOR ALL USING (auth.jwt() ->> 'email' = 'suporteglauberr@gmail.com');

-- 2. ALTERAÇÕES NA TABELA PRODUCTS
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS max_installments INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS pix_discount NUMERIC(5, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS gateway TEXT DEFAULT 'asaas';

-- 3. ALTERAÇÕES NA TABELA DE EVENTOS DO GATEWAY (LOGS)
ALTER TABLE public.gateway_events
ADD COLUMN IF NOT EXISTS reviewed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS keep_forever BOOLEAN DEFAULT false;

-- Policy global para limpar logs não sensíveis
-- A remoção real será acionada pelo admin, via Supabase UI ou Edge Function
