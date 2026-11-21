-- =============================================================================
-- Kuma Concrete Paver Quotation Generator - Supabase Schema
-- =============================================================================
-- Run this entire script in your Supabase SQL Editor.
-- Make sure the entire script is selected or nothing is highlighted when running.
-- =============================================================================

-- 1. Create quotations table
CREATE TABLE IF NOT EXISTS public.quotations (
    id TEXT PRIMARY KEY,
    quotation_number TEXT NOT NULL,
    date TEXT,
    client_name TEXT,
    company_name TEXT,
    project_name TEXT,
    project_location TEXT,
    table_header_title TEXT DEFAULT 'Paver (Delivered)',
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    discount JSONB NOT NULL DEFAULT '{"enabled": false, "type": "percentage", "value": 0, "amount": 0, "label": ""}'::jsonb,
    delivery JSONB NOT NULL DEFAULT '{"enabled": false, "description": "", "deliveriesCount": "", "amount": 0}'::jsonb,
    terms_page1 TEXT,
    terms_page2 TEXT,
    payment_details JSONB,
    signatory JSONB,
    created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by_email TEXT,
    created_by_name TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Indexes for speedy queries and searches
CREATE INDEX IF NOT EXISTS idx_quotations_created_by ON public.quotations(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_quotations_number ON public.quotations(quotation_number);
CREATE INDEX IF NOT EXISTS idx_quotations_updated_at ON public.quotations(updated_at DESC);

-- 2. Create paver_catalog table (for shared custom price lists)
CREATE TABLE IF NOT EXISTS public.paver_catalog (
    id TEXT PRIMARY KEY DEFAULT 'default',
    catalog_data JSONB NOT NULL,
    updated_by_email TEXT,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. Create allowed_emails whitelist table (for restricted Google / email access)
CREATE TABLE IF NOT EXISTS public.allowed_emails (
    email TEXT PRIMARY KEY,
    name TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Helper function to enforce the email whitelist in RLS policies
CREATE OR REPLACE FUNCTION public.is_allowed_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.allowed_emails
        WHERE LOWER(email) = LOWER(COALESCE(auth.jwt() ->> 'email', ''))
    );
$$;

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paver_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allowed_emails ENABLE ROW LEVEL SECURITY;

-- 5. Clean existing policies (allows safe re-running)
DROP POLICY IF EXISTS "Allow authenticated users to read quotations" ON public.quotations;
DROP POLICY IF EXISTS "Allow authenticated users to insert quotations" ON public.quotations;
DROP POLICY IF EXISTS "Allow authenticated users to update quotations" ON public.quotations;
DROP POLICY IF EXISTS "Allow authenticated users to delete quotations" ON public.quotations;

DROP POLICY IF EXISTS "Allow authenticated users to read paver catalog" ON public.paver_catalog;
DROP POLICY IF EXISTS "Allow authenticated users to upsert paver catalog" ON public.paver_catalog;

DROP POLICY IF EXISTS "Allow users to check their own email whitelist entry" ON public.allowed_emails;

-- 6. RLS Policies for allowed_emails (users can only check their own email)
CREATE POLICY "Allow users to check their own email whitelist entry"
    ON public.allowed_emails
    FOR SELECT
    TO authenticated
    USING (LOWER(email) = LOWER(COALESCE(auth.jwt() ->> 'email', '')));

-- 7. RLS Policies for quotations (restricted to whitelisted users)
CREATE POLICY "Allow authenticated users to read quotations"
    ON public.quotations
    FOR SELECT
    TO authenticated
    USING (public.is_allowed_user());

CREATE POLICY "Allow authenticated users to insert quotations"
    ON public.quotations
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_allowed_user() AND (auth.uid() = created_by_user_id OR created_by_user_id IS NULL));

CREATE POLICY "Allow authenticated users to update quotations"
    ON public.quotations
    FOR UPDATE
    TO authenticated
    USING (public.is_allowed_user())
    WITH CHECK (public.is_allowed_user());

CREATE POLICY "Allow authenticated users to delete quotations"
    ON public.quotations
    FOR DELETE
    TO authenticated
    USING (public.is_allowed_user());

-- 8. RLS Policies for paver_catalog (restricted to whitelisted users)
CREATE POLICY "Allow authenticated users to read paver catalog"
    ON public.paver_catalog
    FOR SELECT
    TO authenticated
    USING (public.is_allowed_user());

CREATE POLICY "Allow authenticated users to upsert paver catalog"
    ON public.paver_catalog
    FOR ALL
    TO authenticated
    USING (public.is_allowed_user())
    WITH CHECK (public.is_allowed_user());

-- 9. Seed your authorized Gmail accounts below (uncomment and edit as needed):
-- INSERT INTO public.allowed_emails (email, name)
-- VALUES
--     ('your-email@gmail.com', 'Your Name')
-- ON CONFLICT (email) DO NOTHING;

-- Success!
