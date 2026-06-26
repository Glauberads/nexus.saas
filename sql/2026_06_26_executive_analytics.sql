-- =================================================================================
-- NexusSaaS - Executive Analytics Database Migration
-- Creates highly optimized RPCs to aggregate data for the Business Intelligence Dashboard
-- =================================================================================

-- 1. Executive KPIs RPC
CREATE OR REPLACE FUNCTION public.get_executive_kpis(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start_date timestamptz := NOW() - (p_days || ' days')::interval;
  v_res jsonb;
BEGIN
  SELECT jsonb_build_object(
    'revenue_total', COALESCE((SELECT SUM(value) FROM purchases WHERE status IN ('paid', 'approved')), 0),
    'revenue_period', COALESCE((SELECT SUM(value) FROM purchases WHERE status IN ('paid', 'approved') AND created_at >= v_start_date), 0),
    'revenue_today', COALESCE((SELECT SUM(value) FROM purchases WHERE status IN ('paid', 'approved') AND created_at >= date_trunc('day', NOW())), 0),
    'revenue_7d', COALESCE((SELECT SUM(value) FROM purchases WHERE status IN ('paid', 'approved') AND created_at >= NOW() - interval '7 days'), 0),
    'purchases_total', (SELECT COUNT(*) FROM purchases WHERE status IN ('paid', 'approved')),
    'purchases_period', (SELECT COUNT(*) FROM purchases WHERE status IN ('paid', 'approved') AND created_at >= v_start_date),
    'purchases_pending', (SELECT COUNT(*) FROM purchases WHERE status = 'pending' AND created_at >= v_start_date),
    'leads_total', (SELECT COUNT(*) FROM leads),
    'leads_period', (SELECT COUNT(*) FROM leads WHERE created_at >= v_start_date),
    'unique_customers', (SELECT COUNT(DISTINCT email) FROM purchases WHERE status IN ('paid', 'approved') AND created_at >= v_start_date)
  ) INTO v_res;
  
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
BEGIN
  WITH funnel AS (
    SELECT
      COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'PageView') as page_views,
      COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'ViewContent') as view_items,
      COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'Lead') as generate_leads,
      COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'InitiateCheckout') as begin_checkouts,
      COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'Purchase') as purchases
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
BEGIN
  WITH utm_leads AS (
    SELECT COALESCE(utm_source, 'Direto') as source, COUNT(*) as leads
    FROM leads
    WHERE created_at >= v_start_date
    GROUP BY COALESCE(utm_source, 'Direto')
  )
  SELECT jsonb_agg(jsonb_build_object('source', source, 'leads', leads))
  FROM utm_leads INTO v_res;
  
  RETURN COALESCE(v_res, '[]'::jsonb);
END;
$$;

-- 4. Chart Data RPC
CREATE OR REPLACE FUNCTION public.get_charts_data(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start_date timestamptz := NOW() - (p_days || ' days')::interval;
  v_res jsonb;
BEGIN
  WITH daily_revenue AS (
    SELECT date_trunc('day', created_at)::date as day, SUM(value) as revenue
    FROM purchases
    WHERE status IN ('paid', 'approved') AND created_at >= v_start_date
    GROUP BY 1
  ),
  daily_leads AS (
    SELECT date_trunc('day', created_at)::date as day, COUNT(*) as leads
    FROM leads
    WHERE created_at >= v_start_date
    GROUP BY 1
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
BEGIN
  WITH methods AS (
    SELECT COALESCE(billing_type, 'UNDEFINED') as method, COUNT(*) as qty, SUM(value) as total
    FROM asaas_payments
    WHERE status IN ('RECEIVED', 'CONFIRMED') AND created_at >= v_start_date
    GROUP BY 1
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
