-- =========================================================================================
-- CORREÇÃO FASE 13: GESTÃO DE PREÇOS NO ADMIN
-- =========================================================================================

-- Adiciona a coluna de preço promocional
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS sale_price NUMERIC(10, 2) DEFAULT 0.00;

-- Garante que valores nulls fiquem como 0 por segurança
UPDATE public.products SET sale_price = 0.00 WHERE sale_price IS NULL;
UPDATE public.products SET price = 0.00 WHERE price IS NULL;
