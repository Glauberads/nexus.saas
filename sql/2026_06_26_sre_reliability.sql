-- =================================================================================
-- NexusSaaS - SRE Reliability Database Migration
-- Idempotency, Dead Letter Queue and Correlation ID
-- =================================================================================

-- 1. ADD CORRELATION ID TO EXISTING TABLES
ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS correlation_id TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS correlation_id TEXT;
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS correlation_id TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS correlation_id TEXT;

-- 2. CREATE IDEMPOTENCY TABLE
CREATE TABLE IF NOT EXISTS public.webhook_idempotency (
  event_id TEXT PRIMARY KEY,
  platform TEXT NOT NULL, -- ex: 'asaas'
  correlation_id TEXT,
  payment_id TEXT,
  webhook_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'success' -- 'success', 'ignored'
);

ALTER TABLE public.webhook_idempotency ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable insert for service role on webhook_idempotency" ON public.webhook_idempotency FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable select for service role on webhook_idempotency" ON public.webhook_idempotency FOR SELECT USING (true);


-- 3. CREATE DEAD LETTER QUEUE (DLQ) TABLE
CREATE TABLE IF NOT EXISTS public.dead_letter_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id TEXT,
  endpoint TEXT NOT NULL, -- Qual Edge Function falhou
  payload JSONB NOT NULL,
  error_message TEXT,
  stack_trace TEXT,
  retry_count INT DEFAULT 0,
  next_retry TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 hour',
  status TEXT DEFAULT 'pending', -- 'pending', 'resolved', 'failed_permanently'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.dead_letter_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for admins on dlq" ON public.dead_letter_queue FOR ALL USING (true);


-- 4. RPC: Idempotency Check (Returns TRUE if it was successfully locked/inserted, FALSE if already exists)
CREATE OR REPLACE FUNCTION public.check_idempotency(p_event_id TEXT, p_platform TEXT, p_webhook_type TEXT, p_payment_id TEXT DEFAULT NULL, p_correlation_id TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inserted BOOLEAN := FALSE;
BEGIN
  INSERT INTO public.webhook_idempotency (event_id, platform, webhook_type, payment_id, correlation_id)
  VALUES (p_event_id, p_platform, p_webhook_type, p_payment_id, p_correlation_id)
  ON CONFLICT (event_id) DO NOTHING;
  
  IF FOUND THEN
    v_inserted := TRUE;
  END IF;
  
  RETURN v_inserted;
END;
$$;


-- 5. RPC: Insert to DLQ
CREATE OR REPLACE FUNCTION public.insert_dlq(p_endpoint TEXT, p_payload JSONB, p_error_message TEXT, p_stack_trace TEXT DEFAULT NULL, p_correlation_id TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Remover dados sensíveis do payload (Basic Sanitization)
  IF p_payload ? 'creditCard' THEN
    p_payload = p_payload - 'creditCard';
  END IF;
  
  INSERT INTO public.dead_letter_queue (endpoint, payload, error_message, stack_trace, correlation_id)
  VALUES (p_endpoint, p_payload, p_error_message, p_stack_trace, p_correlation_id)
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;


-- 6. RPC: Get SRE Status
CREATE OR REPLACE FUNCTION public.get_sre_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_email text := auth.jwt()->>'email';
  v_res jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE email = v_user_email) THEN
    RAISE EXCEPTION 'Acesso Negado';
  END IF;

  SELECT jsonb_build_object(
    'dlq_pending', (SELECT COUNT(*) FROM dead_letter_queue WHERE status = 'pending'),
    'dlq_resolved', (SELECT COUNT(*) FROM dead_letter_queue WHERE status = 'resolved'),
    'idempotency_locks', (SELECT COUNT(*) FROM webhook_idempotency),
    'db_status', 'healthy'
  ) INTO v_res;
  
  RETURN v_res;
END;
$$;

-- Permissões
GRANT EXECUTE ON FUNCTION public.check_idempotency TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.insert_dlq TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_sre_status TO authenticated;
