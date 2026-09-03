-- Añade website y NIT a customers (si la tabla ya existía sin esos campos)
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS nit text;
