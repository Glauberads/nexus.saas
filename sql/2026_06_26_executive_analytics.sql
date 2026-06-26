-- =================================================================================
-- NexusSaaS - Executive Analytics Database Migration (Otimizada V2)
-- Creates highly optimized RPCs to aggregate data for the Business Intelligence Dashboard
-- Inclui segurança, performance tuning e ordenação cronológica.
-- =================================================================================

-- 0. INDEXES PARA PERFORMANCE (Teste de Stress / Full Scans)
CREATE INDEX IF NOT EXISTS idx_purchases_status_created ON public.purchases (status, created_at);
CREATE INDEX IF NOT EXISTS idx_events_name_created ON public.events (event_name, created_at);
CREATE INDEX IF NOT EXISTS idx_leads_created ON public.leads (created_at);
CREATE INDEX IF NOT EXISTS idx_asaas_payments_status_created ON public.asaas_payments (status, created_at);

-- 1. Executive KPIs RPC
CREATE OR REPLACE FUNCTION public.get_executive_kpis(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start_date timestamptz := NOW() - (p_days || ' days')::interval;
  v_res jsonb;
  v_user_email text := auth.jwt()->>'email';
BEGIN
  -- Segurança: Apenas admins
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE email = v_user_email) THEN
    RAISE EXCEPTION 'Acesso Negado: Usuário não é administrador.';
  END IF;

  WITH kpis AS (
    SELECT
      -- Total geral
      COALESCE(SUM(value) FILTER (WHERE status IN ('paid', 'approved')), 0) as revenue_total,
      COUNT(*) FILTER (WHERE status IN ('paid', 'approved')) as purchases_total,
      
      -- Período filtrado
      COALESCE(SUM(value) FILTER (WHERE status IN ('paid', 'approved') AND created_at >= v_start_date), 0) as revenue_period,
      COUNT(*) FILTER (WHERE status IN ('paid', 'approved') AND created_at >= v_start_date) as purchases_period,
      COUNT(*) FILTER (WHERE status = 'pending' AND created_at >= v_start_date) as purchases_pending,
      COUNT(DISTINCT email) FILTER (WHERE status IN ('paid', 'approved') AND created_at >= v_start_date) as unique_customers,
      
      -- Hoje e 7d
      COALESCE(SUM(value) FILTER (WHERE status IN ('paid', 'approved') AND created_at >= date_trunc('day', NOW())), 0) as revenue_today,
      COALESCE(SUM(value) FILTER (WHERE status IN ('paid', 'approved') AND created_at >= NOW() - interval '7 days'), 0) as revenue_7d
    FROM purchases
  ),
  leads_data AS (
    SELECT
      COUNT(*) as leads_total,
      COUNT(*) FILTER (WHERE created_at >= v_start_date) as leads_period
    FROM leads
  )
  SELECT jsonb_build_object(
    'revenue_total', k.revenue_total,
    'revenue_period', k.revenue_period,
    'revenue_today', k.revenue_today,
    'revenue_7d', k.revenue_7d,
    'purchases_total', k.purchases_total,
    'purchases_period', k.purchases_period,
    'purchases_pending', k.purchases_pending,
    'unique_customers', k.unique_customers,
    'leads_total', l.leads_total,
    'leads_period', l.leads_period
  )
  FROM kpis k CROSS JOIN leads_data l
  INTO v_res;
  
  RETURN v_res;
END;
$$;

-- 2. Funnel Stats RPC
CREATE OR REPLACE FUNCTION public.get_funnel_stats(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start_date timestamptz := NOW() - (p_days || ' days')::interval;
  v_res jsonb;
  v_user_email text := auth.jwt()->>'email';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE email = v_user_email) THEN
    RAISE EXCEPTION 'Acesso Negado';
  END IF;

  WITH funnel AS (
    SELECT
      COUNT(DISTINCT COALESCE(session_id, id::text)) FILTER (WHERE event_name IN ('PageView', 'page_view')) as page_views,
      COUNT(DISTINCT COALESCE(session_id, id::text)) FILTER (WHERE event_name IN ('ViewContent', 'view_item')) as view_items,
      COUNT(DISTINCT COALESCE(session_id, id::text)) FILTER (WHERE event_name IN ('Lead', 'generate_lead')) as generate_leads,
      COUNT(DISTINCT COALESCE(session_id, id::text)) FILTER (WHERE event_name IN ('InitiateCheckout', 'begin_checkout')) as begin_checkouts,
      COUNT(DISTINCT COALESCE(session_id, id::text)) FILTER (WHERE event_name IN ('Purchase', 'purchase')) as purchases
    FROM events
    WHERE created_at >= v_start_date
  )
  SELECT jsonb_build_object(
    'page_view', page_views,
    'view_item', view_items,
    'generate_lead', generate_leads,
    'begin_checkout', begin_checkouts,
    'purchase', purchases
  ) FROM funnel INTO v_res;
  
  RETURN v_res;
END;
$$;

-- 3. UTM Acquisition RPC
CREATE OR REPLACE FUNCTION public.get_utm_acquisition(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start_date timestamptz := NOW() - (p_days || ' days')::interval;
  v_res jsonb;
  v_user_email text := auth.jwt()->>'email';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE email = v_user_email) THEN
    RAISE EXCEPTION 'Acesso Negado';
  END IF;

  WITH utm_leads AS (
    SELECT COALESCE(NULLIF(utm_source, ''), 'Direto') as source, COUNT(*) as leads
    FROM leads
    WHERE created_at >= v_start_date
    GROUP BY 1
    ORDER BY leads DESC
  )
  SELECT jsonb_agg(jsonb_build_object('source', source, 'leads', leads))
  FROM utm_leads INTO v_res;
  
  RETURN COALESCE(v_res, '[]'::jsonb);
END;
$$;

-- 4. Chart Data RPC (Chronological Order)
CREATE OR REPLACE FUNCTION public.get_charts_data(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start_date timestamptz := NOW() - (p_days || ' days')::interval;
  v_res jsonb;
  v_user_email text := auth.jwt()->>'email';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE email = v_user_email) THEN
    RAISE EXCEPTION 'Acesso Negado';
  END IF;

  WITH daily_revenue AS (
    SELECT date_trunc('day', created_at)::date as day, SUM(value) as revenue
    FROM purchases
    WHERE status IN ('paid', 'approved') AND created_at >= v_start_date
    GROUP BY 1
    ORDER BY 1 ASC
  ),
  daily_leads AS (
    SELECT date_trunc('day', created_at)::date as day, COUNT(*) as leads
    FROM leads
    WHERE created_at >= v_start_date
    GROUP BY 1
    ORDER BY 1 ASC
  )
  SELECT jsonb_build_object(
    'revenue', COALESCE((SELECT jsonb_agg(jsonb_build_object('day', day, 'value', revenue)) FROM daily_revenue), '[]'::jsonb),
    'leads', COALESCE((SELECT jsonb_agg(jsonb_build_object('day', day, 'value', leads)) FROM daily_leads), '[]'::jsonb)
  ) INTO v_res;
  
  RETURN v_res;
END;
$$;

-- 5. Payment Methods Split RPC
CREATE OR REPLACE FUNCTION public.get_financial_split(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start_date timestamptz := NOW() - (p_days || ' days')::interval;
  v_res jsonb;
  v_user_email text := auth.jwt()->>'email';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE email = v_user_email) THEN
    RAISE EXCEPTION 'Acesso Negado';
  END IF;

  WITH methods AS (
    SELECT COALESCE(billing_type, 'UNDEFINED') as method, COUNT(*) as qty, SUM(value) as total
    FROM asaas_payments
    WHERE status IN ('RECEIVED', 'CONFIRMED') AND created_at >= v_start_date
    GROUP BY 1
    ORDER BY total DESC
  )
  SELECT jsonb_agg(jsonb_build_object('method', method, 'qty', qty, 'total', COALESCE(total, 0)))
  FROM methods INTO v_res;
  
  RETURN COALESCE(v_res, '[]'::jsonb);
END;
$$;

-- Aplicar permissões para administradores
GRANT EXECUTE ON FUNCTION public.get_executive_kpis TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_funnel_stats TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_utm_acquisition TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_charts_data TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_financial_split TO authenticated;
