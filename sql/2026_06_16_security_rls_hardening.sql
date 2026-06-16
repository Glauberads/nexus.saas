-- ==============================================================================
-- NEXUS SAAS - SECURITY HARDENING & RLS POLICIES
-- Data: 16 de Junho de 2026
-- Objetivo: Proteger dados sensíveis bloqueando acesso público de leitura e 
-- garantindo que apenas usuários anônimos possam Inserir, e apenas o Admin possa Ler/Deletar.
-- ==============================================================================

-- 1. Habilitar RLS em todas as tabelas
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_journey ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- 2. Limpar políticas antigas/permissivas (Prevenção)
DROP POLICY IF EXISTS "Enable read access for all users on webhook_logs" ON public.webhook_logs;
DROP POLICY IF EXISTS "Enable insert for all users on webhook_logs" ON public.webhook_logs;

-- 3. Criar Função Helper: is_admin()
-- Checa de forma segura se a requisição atual vem de um token JWT logado com o email do admin.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    (current_setting('request.jwt.claims', true)::jsonb ->> 'email') = 'suporteglauberr@gmail.com'
    OR auth.email() = 'suporteglauberr@gmail.com'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==========================================
-- 4. APLICAÇÃO DAS POLÍTICAS (POLICIES)
-- ==========================================

-- ------------------------------------------
-- TABELA: leads
-- ------------------------------------------
-- Visitantes anônimos (Landing Page) podem apenas inserir novos leads.
CREATE POLICY "Anon pode apenas inserir leads" 
    ON public.leads FOR INSERT WITH CHECK (true);

-- Admin autenticado pode fazer tudo (Ler, Atualizar, Deletar).
CREATE POLICY "Admin tem acesso total em leads" 
    ON public.leads FOR ALL USING (public.is_admin());

-- ------------------------------------------
-- TABELA: sessions
-- ------------------------------------------
CREATE POLICY "Anon pode apenas inserir sessions" 
    ON public.sessions FOR INSERT WITH CHECK (true);

CREATE POLICY "Admin tem acesso total em sessions" 
    ON public.sessions FOR ALL USING (public.is_admin());

-- ------------------------------------------
-- TABELA: events
-- ------------------------------------------
CREATE POLICY "Anon pode apenas inserir events" 
    ON public.events FOR INSERT WITH CHECK (true);

CREATE POLICY "Admin tem acesso total em events" 
    ON public.events FOR ALL USING (public.is_admin());

-- ------------------------------------------
-- TABELA: lead_journey
-- ------------------------------------------
CREATE POLICY "Anon pode apenas inserir lead_journey" 
    ON public.lead_journey FOR INSERT WITH CHECK (true);

CREATE POLICY "Admin tem acesso total em lead_journey" 
    ON public.lead_journey FOR ALL USING (public.is_admin());

-- ------------------------------------------
-- TABELA: attribution
-- ------------------------------------------
CREATE POLICY "Anon pode apenas inserir attribution" 
    ON public.attribution FOR INSERT WITH CHECK (true);

CREATE POLICY "Admin tem acesso total em attribution" 
    ON public.attribution FOR ALL USING (public.is_admin());

-- ------------------------------------------
-- TABELA: webhook_logs
-- ------------------------------------------
-- Visitantes não podem fazer absolutamente nada aqui.
-- Admin tem acesso total (SELECT/DELETE) para ver o dashboard de webhooks.
CREATE POLICY "Admin tem acesso total em webhook_logs" 
    ON public.webhook_logs FOR ALL USING (public.is_admin());

-- ------------------------------------------
-- TABELA: purchases
-- ------------------------------------------
-- Visitantes não podem fazer INSERT nem SELECT. 
-- Apenas a Edge Function (via Service Role que bypassa o RLS naturalmente) pode inserir.
-- E o Admin precisa ler para renderizar os cards de Vendas do dashboard.
CREATE POLICY "Admin tem acesso total em purchases" 
    ON public.purchases FOR ALL USING (public.is_admin());

-- ==============================================================================
-- FIM DA BLINDAGEM
-- Observação: Requisições com SUPABASE_SERVICE_ROLE_KEY (como as das Edge 
-- Functions de Webhook) ignoram essas regras e sempre possuem permissão total, 
-- garantindo que a infraestrutura backend não quebre.
-- ==============================================================================
