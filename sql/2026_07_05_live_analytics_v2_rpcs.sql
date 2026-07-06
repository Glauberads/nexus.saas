-- ==============================================================================
-- NEXUS SAAS - LIVE ANALYTICS RPCS V2 (READ-ONLY)
-- Procedures modulares e seguras exclusivas para o Control Center V2
-- ==============================================================================

-- 1. Visitantes Online (Últimos 5 minutos) e Dispositivos
CREATE OR REPLACE FUNCTION public.rpc_live_visitors_v2()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result json;
    v_online_now int;
    v_desktop int;
    v_mobile int;
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Acesso negado.'; END IF;

    -- Ativos nos últimos 5 minutos
    SELECT COUNT(id) INTO v_online_now FROM public.sessions WHERE created_at >= NOW() - INTERVAL '5 minutes' OR last_active >= NOW() - INTERVAL '5 minutes';
    
    -- Estimativa de dispositivos baseada na flag do user_agent ou na string (simples)
    SELECT COUNT(id) INTO v_mobile FROM public.sessions WHERE (created_at >= NOW() - INTERVAL '5 minutes' OR last_active >= NOW() - INTERVAL '5 minutes') AND (user_agent ILIKE '%Mobi%' OR user_agent ILIKE '%Android%');
    v_desktop := GREATEST(v_online_now - v_mobile, 0);

    result := json_build_object(
        'online_now', v_online_now,
        'desktop', v_desktop,
        'mobile', v_mobile
    );
    RETURN result;
END;
$$;


-- 2. Origem de Tráfego V2 (Baseado nas sessões de hoje)
CREATE OR REPLACE FUNCTION public.rpc_live_traffic_v2()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result json;
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Acesso negado.'; END IF;

    SELECT json_agg(row_to_json(t)) INTO result FROM (
        SELECT 
            COALESCE(utm_source, 'direto/organico') as source, 
            COUNT(id) as count 
        FROM public.sessions 
        WHERE created_at >= CURRENT_DATE 
        GROUP BY utm_source 
        ORDER BY count DESC 
        LIMIT 10
    ) t;

    RETURN COALESCE(result, '[]'::json);
END;
$$;


-- 3. PIX Pendentes V2
CREATE OR REPLACE FUNCTION public.rpc_live_pix_v2()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result json;
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Acesso negado.'; END IF;

    SELECT json_agg(row_to_json(t)) INTO result FROM (
        SELECT 
            id,
            buyer_name,
            amount,
            created_at,
            status
        FROM public.purchases 
        WHERE payment_method = 'PIX' AND status = 'PENDING' AND created_at >= NOW() - INTERVAL '24 hours'
        ORDER BY created_at DESC 
        LIMIT 15
    ) t;

    RETURN COALESCE(result, '[]'::json);
END;
$$;


-- 4. Tempo Médio do Funil V2
CREATE OR REPLACE FUNCTION public.rpc_live_funnel_time_v2()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result json;
    v_avg_seconds float;
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Acesso negado.'; END IF;

    -- Calcula a diferença média em segundos entre o primeiro PageView e a Compra para as compras de hoje
    WITH first_views AS (
        SELECT session_id, MIN(created_at) as view_time
        FROM public.events
        WHERE event_name = 'PageView' AND created_at >= CURRENT_DATE
        GROUP BY session_id
    ),
    purchases_events AS (
        SELECT session_id, MIN(created_at) as purchase_time
        FROM public.events
        WHERE event_name = 'Purchase' AND created_at >= CURRENT_DATE
        GROUP BY session_id
    )
    SELECT AVG(EXTRACT(EPOCH FROM (p.purchase_time - f.view_time))) INTO v_avg_seconds
    FROM first_views f
    JOIN purchases_events p ON f.session_id = p.session_id
    WHERE p.purchase_time >= f.view_time;

    result := json_build_object(
        'avg_funnel_seconds', COALESCE(v_avg_seconds, 0)
    );
    RETURN result;
END;
$$;


-- 5. Health Center Detalhado V2
CREATE OR REPLACE FUNCTION public.rpc_live_health_v2()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result json;
    v_dlq_pending int;
    v_last_webhook timestamp;
    v_last_event timestamp;
    v_last_purchase timestamp;
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Acesso negado.'; END IF;

    -- DLQ
    SELECT COUNT(*) INTO v_dlq_pending FROM public.dead_letter_queue WHERE status = 'pending';
    
    -- Ultimos pings
    SELECT MAX(created_at) INTO v_last_webhook FROM public.webhook_logs;
    SELECT MAX(created_at) INTO v_last_event FROM public.events;
    SELECT MAX(created_at) INTO v_last_purchase FROM public.purchases;

    result := json_build_object(
        'dlq_pending', v_dlq_pending,
        'last_webhook', v_last_webhook,
        'last_event', v_last_event,
        'last_purchase', v_last_purchase,
        'db_time', NOW()
    );

    RETURN result;
END;
$$;
