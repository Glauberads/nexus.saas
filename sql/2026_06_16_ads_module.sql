-- =========================================================================================
-- FASE 11: META & GOOGLE ADS (ROAS TRACKER)
-- =========================================================================================

-- 1. Tabela de Métricas de Anúncios (ad_metrics)
CREATE TABLE IF NOT EXISTS public.ad_metrics (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    date DATE NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('meta', 'google', 'tiktok', 'other')),
    
    -- Granularidade
    campaign_id TEXT DEFAULT 'unknown',
    campaign_name TEXT DEFAULT 'Global',
    adset_name TEXT,
    ad_name TEXT,
    
    -- Métricas de Custo e Visualização
    spend NUMERIC(10, 2) DEFAULT 0.00,
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    
    -- Métricas Calculadas (se vierem da API)
    ctr NUMERIC(10, 4) DEFAULT 0,
    cpc NUMERIC(10, 2) DEFAULT 0,
    cpm NUMERIC(10, 2) DEFAULT 0,
    
    currency TEXT DEFAULT 'BRL',
    
    -- Constraint única para permitir UPSERT seguro via n8n
    UNIQUE(date, platform, campaign_id)
);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at() 
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_ad_metrics_updated_at ON public.ad_metrics;
CREATE TRIGGER set_ad_metrics_updated_at
BEFORE UPDATE ON public.ad_metrics
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- 2. Segurança (RLS)
ALTER TABLE public.ad_metrics ENABLE ROW LEVEL SECURITY;

-- Apenas o administrador (Dashboard) pode ler
DROP POLICY IF EXISTS "Admin full access ad_metrics" ON public.ad_metrics;
CREATE POLICY "Admin full access ad_metrics"
    ON public.ad_metrics
    FOR ALL
    USING (auth.jwt() ->> 'email' = 'suporteglauberr@gmail.com')
    WITH CHECK (auth.jwt() ->> 'email' = 'suporteglauberr@gmail.com');

-- A Edge Function usa a Service Role Key, que ignora o RLS (bypass RLS), 
-- então não precisamos de policy anônima para INSERT.

-- 3. Índices de performance
CREATE INDEX IF NOT EXISTS idx_ad_metrics_date ON public.ad_metrics(date);
CREATE INDEX IF NOT EXISTS idx_ad_metrics_platform ON public.ad_metrics(platform);
CREATE INDEX IF NOT EXISTS idx_ad_metrics_campaign ON public.ad_metrics(campaign_id);
