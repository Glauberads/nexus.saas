-- ==============================================================================
-- NEXUS SAAS - LIVE ANALYTICS RPCS V3 (READ-ONLY)
-- Operations Center
-- ==============================================================================

-- 1. Visitantes Online V3
CREATE OR REPLACE FUNCTION public.rpc_live_visitors_v3()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result json;
    v_online_now int;
    v_desktop int;
    v_mobile int;
    v_tablet int;
    v_avg_time float;
    v_new_visitors int;
    v_returning_visitors int;
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Acesso negado.'; END IF;

    -- Ativos nos ultimos 5 minutos
    SELECT COUNT(id) INTO v_online_now FROM public.sessions WHERE last_active >= NOW() - INTERVAL '5 minutes' OR created_at >= NOW() - INTERVAL '5 minutes';
    
    -- Dispositivos
    SELECT 
        COUNT(*) FILTER (WHERE user_agent ILIKE '%Mobi%' OR user_agent ILIKE '%Android%'),
        COUNT(*) FILTER (WHERE user_agent ILIKE '%iPad%' OR user_agent ILIKE '%Tablet%')
    INTO v_mobile, v_tablet
    FROM public.sessions 
    WHERE last_active >= NOW() - INTERVAL '5 minutes' OR created_at >= NOW() - INTERVAL '5 minutes';
    
    v_desktop := GREATEST(v_online_now - COALESCE(v_mobile, 0) - COALESCE(v_tablet, 0), 0);

    -- Novos vs Recorrentes (simplificado: sessoes criadas nos ultimos 5 min vs ativas)
    SELECT COUNT(id) INTO v_new_visitors FROM public.sessions WHERE created_at >= NOW() - INTERVAL '5 minutes';
    v_returning_visitors := GREATEST(v_online_now - COALESCE(v_new_visitors, 0), 0);

    result := json_build_object(
        'online_now', COALESCE(v_online_now, 0),
        'desktop', COALESCE(v_desktop, 0),
        'mobile', COALESCE(v_mobile, 0),
        'tablet', COALESCE(v_tablet, 0),
        'new_visitors', COALESCE(v_new_visitors, 0),
        'returning_visitors', COALESCE(v_returning_visitors, 0)
    );
    RETURN result;
END;
$$;

-- 2. PIX Center V3
CREATE OR REPLACE FUNCTION public.rpc_live_pix_v3()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result json;
    v_issued int;
    v_paid int;
    v_pending int;
    v_total_value float;
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Acesso negado.'; END IF;

    -- Analytics PIX do dia
    SELECT 
        COUNT(id),
        COUNT(*) FILTER (WHERE status = 'CONFIRMED'),
        COUNT(*) FILTER (WHERE status = 'PENDING'),
        SUM(amount) FILTER (WHERE status = 'CONFIRMED')
    INTO v_issued, v_paid, v_pending, v_total_value
    FROM public.purchases 
    WHERE payment_method = 'PIX' AND created_at >= CURRENT_DATE;

    result := json_build_object(
        'issued', COALESCE(v_issued, 0),
        'paid', COALESCE(v_paid, 0),
        'pending', COALESCE(v_pending, 0),
        'total_value', COALESCE(v_total_value, 0)
    );

    RETURN result;
END;
$$;
