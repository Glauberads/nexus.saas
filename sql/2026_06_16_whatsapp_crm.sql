-- ==============================================================================
-- NEXUS SAAS - FASE 10: WHATSAPP CRM
-- Atualização da tabela leads, criação de crm_messages e notifications
-- ==============================================================================

-- 1. Atualizar Tabela Leads
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT now(),
ADD COLUMN IF NOT EXISTS assigned_to TEXT,
ADD COLUMN IF NOT EXISTS follow_up_date TIMESTAMPTZ;

-- 2. Tabela CRM Messages
CREATE TABLE IF NOT EXISTS public.crm_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
    direction TEXT NOT NULL, -- 'inbound' ou 'outbound'
    channel TEXT DEFAULT 'whatsapp',
    message TEXT,
    status TEXT,
    response JSONB,
    automation_name TEXT,
    source TEXT, -- 'n8n', 'evolution_api', 'manual', 'system'
    external_message_id TEXT UNIQUE
);

ALTER TABLE public.crm_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin tem acesso total em crm_messages" ON public.crm_messages;
CREATE POLICY "Admin tem acesso total em crm_messages" 
    ON public.crm_messages FOR ALL USING (public.is_admin());

-- 3. Tabela Notifications (Centro de Notificações)
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    type TEXT NOT NULL, -- 'whatsapp_reply', 'hot_lead', 'purchase', 'webhook_error', etc.
    title TEXT,
    message TEXT,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    is_read BOOLEAN DEFAULT false,
    payload JSONB
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin tem acesso total em notifications" ON public.notifications;
CREATE POLICY "Admin tem acesso total em notifications" 
    ON public.notifications FOR ALL USING (public.is_admin());
