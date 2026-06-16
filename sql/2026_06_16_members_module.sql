-- =========================================================================================
-- FASE 12: ÁREA DE MEMBROS (MEMBER PORTAL)
-- =========================================================================================

-- 1. Tabela members
CREATE TABLE IF NOT EXISTS public.members (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    auth_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Vínculo com Supabase Auth
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'canceled')),
    access_level TEXT DEFAULT 'standard',
    
    avatar_url TEXT,
    last_login_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    
    onboarding_completed BOOLEAN DEFAULT false,
    engagement_score INTEGER DEFAULT 0
);

-- Trigger para updated_at
CREATE TRIGGER set_members_updated_at
BEFORE UPDATE ON public.members
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- 2. Tabela member_products
CREATE TABLE IF NOT EXISTS public.member_products (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    member_id UUID REFERENCES public.members(id) ON DELETE CASCADE,
    
    product_name TEXT NOT NULL,
    product_slug TEXT,
    version TEXT DEFAULT '1.0.0',
    
    access_granted BOOLEAN DEFAULT true,
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'active',
    
    download_url TEXT,
    is_private_storage BOOLEAN DEFAULT false,
    storage_path TEXT,

    UNIQUE(member_id, product_name)
);

-- 3. Tabela member_downloads
CREATE TABLE IF NOT EXISTS public.member_downloads (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    member_id UUID REFERENCES public.members(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    downloaded_at TIMESTAMPTZ DEFAULT NOW(),
    ip_address TEXT,
    user_agent TEXT
);

-- 4. Tabela member_licenses
CREATE TABLE IF NOT EXISTS public.member_licenses (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    member_id UUID REFERENCES public.members(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    domain TEXT,
    license_key TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Tabela member_access_logs
CREATE TABLE IF NOT EXISTS public.member_access_logs (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    member_id UUID REFERENCES public.members(id) ON DELETE CASCADE,
    action TEXT NOT NULL, -- 'login', 'logout', 'view_product', 'help_center'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    ip_address TEXT,
    user_agent TEXT
);

-- ==========================================
-- RLS (Row Level Security)
-- ==========================================
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_downloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_access_logs ENABLE ROW LEVEL SECURITY;

-- ADMIN POLICY (Dashboard tem acesso a tudo via suporglauberr@gmail.com)
CREATE POLICY "Admin full access members" ON public.members FOR ALL USING (auth.jwt() ->> 'email' = 'suporteglauberr@gmail.com') WITH CHECK (auth.jwt() ->> 'email' = 'suporteglauberr@gmail.com');
CREATE POLICY "Admin full access member_products" ON public.member_products FOR ALL USING (auth.jwt() ->> 'email' = 'suporteglauberr@gmail.com') WITH CHECK (auth.jwt() ->> 'email' = 'suporteglauberr@gmail.com');
CREATE POLICY "Admin full access member_downloads" ON public.member_downloads FOR ALL USING (auth.jwt() ->> 'email' = 'suporteglauberr@gmail.com') WITH CHECK (auth.jwt() ->> 'email' = 'suporteglauberr@gmail.com');
CREATE POLICY "Admin full access member_licenses" ON public.member_licenses FOR ALL USING (auth.jwt() ->> 'email' = 'suporteglauberr@gmail.com') WITH CHECK (auth.jwt() ->> 'email' = 'suporteglauberr@gmail.com');
CREATE POLICY "Admin full access member_access_logs" ON public.member_access_logs FOR ALL USING (auth.jwt() ->> 'email' = 'suporteglauberr@gmail.com') WITH CHECK (auth.jwt() ->> 'email' = 'suporteglauberr@gmail.com');

-- CLIENT POLICY (O próprio membro pode ver seus dados baseado no auth.uid())
CREATE POLICY "Member can view own profile" ON public.members FOR SELECT USING (auth_id = auth.uid());
CREATE POLICY "Member can update own profile" ON public.members FOR UPDATE USING (auth_id = auth.uid()) WITH CHECK (auth_id = auth.uid());

CREATE POLICY "Member can view own products" ON public.member_products FOR SELECT USING (member_id IN (SELECT id FROM public.members WHERE auth_id = auth.uid()));
CREATE POLICY "Member can view own downloads" ON public.member_downloads FOR SELECT USING (member_id IN (SELECT id FROM public.members WHERE auth_id = auth.uid()));
CREATE POLICY "Member can insert own downloads" ON public.member_downloads FOR INSERT WITH CHECK (member_id IN (SELECT id FROM public.members WHERE auth_id = auth.uid()));

CREATE POLICY "Member can view own licenses" ON public.member_licenses FOR SELECT USING (member_id IN (SELECT id FROM public.members WHERE auth_id = auth.uid()));
CREATE POLICY "Member can update own licenses" ON public.member_licenses FOR UPDATE USING (member_id IN (SELECT id FROM public.members WHERE auth_id = auth.uid())) WITH CHECK (member_id IN (SELECT id FROM public.members WHERE auth_id = auth.uid()));
CREATE POLICY "Member can insert own licenses" ON public.member_licenses FOR INSERT WITH CHECK (member_id IN (SELECT id FROM public.members WHERE auth_id = auth.uid()));

CREATE POLICY "Member can insert own access logs" ON public.member_access_logs FOR INSERT WITH CHECK (member_id IN (SELECT id FROM public.members WHERE auth_id = auth.uid()));
CREATE POLICY "Member can view own access logs" ON public.member_access_logs FOR SELECT USING (member_id IN (SELECT id FROM public.members WHERE auth_id = auth.uid()));


-- ==========================================
-- TRIGGER DE COMPRA APROVADA -> CRIAÇÃO DE MEMBRO
-- ==========================================
-- Como a inserção no auth.users via Trigger requer uso de extensões ou chamadas HTTP (Edge Functions),
-- a trigger no banco criará o registro APENAS na tabela `members`.
-- Posteriormente, quando o usuário tentar logar ou fizer o signup, vinculamos o auth_id.
-- Melhor ainda: a Edge Function de webhook de pagamento (n8n ou Kiwify) deve ser a responsável 
-- por chamar supabase.auth.admin.createUser().
-- Por segurança, vamos apenas criar a base do membro.

CREATE OR REPLACE FUNCTION public.handle_new_purchase()
RETURNS TRIGGER AS $$
DECLARE
    v_member_id UUID;
BEGIN
    IF NEW.status = 'approved' THEN
        -- Verifica se já existe um membro com este email
        SELECT id INTO v_member_id FROM public.members WHERE email = NEW.customer_email;
        
        -- Se não existe, cria
        IF v_member_id IS NULL THEN
            INSERT INTO public.members (name, email, lead_id)
            VALUES (NEW.customer_name, NEW.customer_email, NEW.lead_id)
            RETURNING id INTO v_member_id;
            
            -- Dispara log para webhook_logs (simulando evento member_created)
            INSERT INTO public.webhook_logs (origin, status, details, payload)
            VALUES ('system:member_created', 'success', 'Member created from purchase', jsonb_build_object('member_id', v_member_id, 'email', NEW.customer_email, 'name', NEW.customer_name));
        END IF;

        -- Libera o produto para o membro
        INSERT INTO public.member_products (member_id, product_name, product_slug)
        VALUES (v_member_id, NEW.product_name, lower(regexp_replace(NEW.product_name, '\s+', '-', 'g')))
        ON CONFLICT (member_id, product_name) DO NOTHING;
        
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_purchase_approved ON public.purchases;
CREATE TRIGGER on_purchase_approved
AFTER INSERT OR UPDATE OF status ON public.purchases
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_purchase();
