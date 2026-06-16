-- ============================================================
-- NexusSaaS — Supabase Schema
-- Tabelas para Analytics, CRM e CAPI
-- ============================================================

-- Tabela de Leads (CRM Simplificado)
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  session_id TEXT,
  name TEXT,
  email TEXT,
  whatsapp TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  fbclid TEXT,
  gclid TEXT,
  device TEXT,
  city TEXT,
  state TEXT,
  external_id TEXT,  -- SHA-256 do email para CAPI
  em_hash TEXT,
  ph_hash TEXT,
  lead_score INTEGER DEFAULT 0,
  lead_tier TEXT DEFAULT 'Frio',
  lead_status TEXT DEFAULT 'new', -- new, quiz_completed, hot_lead, checkout_abandoned, purchased, upsell_purchased
  quiz_answers JSONB,
  ltv NUMERIC DEFAULT 0,
  UNIQUE(email)
);

-- Tabela de Sessões (UTM Persistence e Analytics)
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  session_id TEXT UNIQUE,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  fbclid TEXT,
  gclid TEXT,
  ttclid TEXT,
  msclkid TEXT,
  referrer TEXT,
  landing_url TEXT,
  device TEXT,
  user_agent TEXT
);

-- Tabela de Eventos (Analytics Detalhado)
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  event_id TEXT UNIQUE,
  event_name TEXT,
  session_id TEXT,
  lead_score INTEGER,
  params JSONB,
  device TEXT,
  url TEXT,
  referrer TEXT
);

-- Tabela de Compras (Webhook)
CREATE TABLE purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  order_id TEXT UNIQUE,
  email TEXT,
  value NUMERIC,
  session_id TEXT,
  status TEXT
);

-- Tabela da Jornada do Lead (Timeline)
CREATE TABLE lead_journey (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  session_id TEXT,
  email TEXT,
  action_type TEXT, -- view, quiz, abandon, purchase, upsell
  action_details JSONB,
  lead_score_at_time INTEGER
);

-- Tabela de Atribuição Avançada (Multi-touch)
CREATE TABLE attribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  email TEXT,
  first_touch_utm_source TEXT,
  first_touch_utm_medium TEXT,
  last_touch_utm_source TEXT,
  last_touch_utm_medium TEXT,
  time_to_purchase INTERVAL,
  total_touchpoints INTEGER DEFAULT 1
);
