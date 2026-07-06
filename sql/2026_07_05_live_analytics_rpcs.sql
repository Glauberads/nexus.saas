-- ==============================================================================
-- NEXUS SAAS - LIVE ANALYTICS RPCS (READ-ONLY)
-- Criação de procedures modulares e seguras para a sincronização silenciosa
-- ==============================================================================

-- 1. Dashboard Inicial (KPIs do Dia)
CREATE OR REPLACE FUNCTION public.rpc_live_dashboard()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result json;
    v_visitors int;
    v_leads int;
    v_purchases int;
    v_revenue numeric;
BEGIN
    -- Validar Admin
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acesso negado. Apenas administradores podem acessar o Live Analytics.';
    END IF;

    -- Visitantes (Sessões)
    SELECT COUNT(id) INTO v_visitors FROM public.sessions WHERE created_at >= CURRENT_DATE;
    
    -- Leads gerados
    SELECT COUNT(id) INTO v_leads FROM public.leads WHERE created_at >= CURRENT_DATE;

    -- Compras aprovadas
    SELECT COUNT(id) INTO v_purchases FROM public.purchases WHERE created_at >= CURRENT_DATE AND status = 'CONFIRMED';
    
    -- Receita
    SELECT COALESCE(SUM(value), 0) INTO v_revenue FROM public.purchases WHERE created_at >= CURRENT_DATE AND status = 'CONFIRMED';

    -- Montar JSON
    result := json_build_object(
        'visitors', v_visitors,
        'leads', v_leads,
        'purchases', v_purchases,
        'revenue', v_revenue
    );

    RETURN result;
END;
$$;


-- 2. Funil ao Vivo
CREATE OR REPLACE FUNCTION public.rpc_live_funnel()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result json;
    v_view int;
    v_init_checkout int;
    v_pix_generated int;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acesso negado.';
    END IF;

    -- Visitors -> Leads -> Checkout -> Pix -> Compra
    SELECT COUNT(*) INTO v_view FROM public.events WHERE event_name = 'PageView' AND created_at >= CURRENT_DATE;
    SELECT COUNT(*) INTO v_init_checkout FROM public.events WHERE event_name = 'InitiateCheckout' AND created_at >= CURRENT_DATE;
    SELECT COUNT(*) INTO v_pix_generated FROM public.events WHERE event_name = 'PixGenerated' AND created_at >= CURRENT_DATE;
    
    result := json_build_object(
        'views', v_view,
        'checkout', v_init_checkout,
        'pix', v_pix_generated
    );

    RETURN result;
END;
$$;


-- 3. Health Status
CREATE OR REPLACE FUNCTION public.rpc_live_health()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result json;
    v_dlq_pending int;
    v_webhooks_today int;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acesso negado.';
    END IF;

    -- Verificar tamanho da fila DLQ pendente (se a tabela existir e tiver status 'pending')
    -- Como pode ou não ter status 'pending' exato, puxamos uma contagem simples de falhas
    SELECT COUNT(*) INTO v_dlq_pending FROM public.dead_letter_queue WHERE status = 'pending';
    
    -- Verificar webhooks
    SELECT COUNT(*) INTO v_webhooks_today FROM public.webhook_logs WHERE created_at >= CURRENT_DATE;

    result := json_build_object(
        'dlq_pending', v_dlq_pending,
        'webhooks_today', v_webhooks_today,
        'db_time', NOW()
    );

    RETURN result;
END;
$$;
