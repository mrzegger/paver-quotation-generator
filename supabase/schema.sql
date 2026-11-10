-- =============================================================================
-- Kuma Concrete Paver Quotation Generator - Supabase Schema
-- =============================================================================
-- Run this script in your Supabase project's SQL Editor (Dashboard > SQL Editor)
-- It creates the quotations table, paver_catalog table, and Row Level Security policies.
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

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paver_catalog ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for quotations
-- Any authenticated user in your team can view quotations
CREATE POLICY "Allow authenticated users to read quotations"
    ON public.quotations
    FOR SELECT
    TO authenticated
    USING (true);

-- Authenticated users can insert quotations
CREATE POLICY "Allow authenticated users to insert quotations"
    ON public.quotations
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = created_by_user_id OR created_by_user_id IS NULL);

-- Authenticated users can update quotations
CREATE POLICY "Allow authenticated users to update quotations"
    ON public.quotations
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Authenticated users can delete quotations
CREATE POLICY "Allow authenticated users to delete quotations"
    ON public.quotations
    FOR DELETE
    TO authenticated
    USING (true);

-- 5. RLS Policies for paver_catalog
CREATE POLICY "Allow authenticated users to read paver catalog"
    ON public.paver_catalog
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated users to upsert paver catalog"
    ON public.paver_catalog
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Done!
