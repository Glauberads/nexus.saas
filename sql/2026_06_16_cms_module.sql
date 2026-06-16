-- =========================================================================================
-- FASE 12.1: CMS DE PRODUTOS E VERSIONAMENTO
-- =========================================================================================

-- 1. Tabela products
CREATE TABLE IF NOT EXISTS public.products (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    category TEXT,
    
    thumbnail_url TEXT,
    download_url TEXT, -- Link externo genérico para arquivos simples ou instaladores
    documentation_url TEXT,
    video_url TEXT,
    
    price NUMERIC(10, 2) DEFAULT 0.00,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'draft')),
    
    is_featured BOOLEAN DEFAULT false,
    is_bonus BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    
    -- Novos campos aprovados na Fase 12.1
    storage_path TEXT,
    requires_license BOOLEAN DEFAULT true,
    access_type TEXT DEFAULT 'core' CHECK (access_type IN ('core', 'bonus', 'upsell', 'service'))
);

-- Trigger para updated_at na products
CREATE TRIGGER set_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- 2. Tabela product_versions
CREATE TABLE IF NOT EXISTS public.product_versions (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    version TEXT NOT NULL,
    download_url TEXT,
    storage_path TEXT,
    file_size TEXT,
    
    changelog TEXT,
    release_notes TEXT,
    
    is_current BOOLEAN DEFAULT false
);

-- 3. Ajuste em member_products (Adicionar product_id e FK)
-- Como a tabela foi recém-criada na Fase 12, podemos dar um ADD COLUMN com referências.
ALTER TABLE public.member_products 
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE CASCADE;

-- Criar a constraint de unicidade atualizada se precisar (opcional, já tem unique(member_id, product_name))
-- Mas o ideal é usar unique(member_id, product_id).
ALTER TABLE public.member_products ADD CONSTRAINT unique_member_product_id UNIQUE (member_id, product_id);

-- 4. Ajuste em member_downloads (Adicionar version_id e FK)
ALTER TABLE public.member_downloads
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS version_id UUID REFERENCES public.product_versions(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS version_name TEXT;


-- ==========================================
-- RLS (Row Level Security)
-- ==========================================
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_versions ENABLE ROW LEVEL SECURITY;

-- ADMIN POLICY
CREATE POLICY "Admin full access products" ON public.products FOR ALL USING (auth.jwt() ->> 'email' = 'suporteglauberr@gmail.com') WITH CHECK (auth.jwt() ->> 'email' = 'suporteglauberr@gmail.com');
CREATE POLICY "Admin full access product_versions" ON public.product_versions FOR ALL USING (auth.jwt() ->> 'email' = 'suporteglauberr@gmail.com') WITH CHECK (auth.jwt() ->> 'email' = 'suporteglauberr@gmail.com');

-- CLIENT POLICY (Leitura apenas de produtos e versões ativos)
CREATE POLICY "Members can view active products" ON public.products FOR SELECT USING (status = 'active');
CREATE POLICY "Members can view active product versions" ON public.product_versions FOR SELECT USING (true); -- Controle real feito no frontend e via access_granted
