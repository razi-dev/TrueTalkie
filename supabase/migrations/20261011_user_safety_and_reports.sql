-- Supabase Migration: User Safety, Abuse Reporting & Moderation
-- Enables Google Play UGC Policy Compliance for True Talkie

CREATE TABLE IF NOT EXISTS public.user_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_device_id TEXT NOT NULL,
    reported_device_id TEXT NOT NULL,
    reported_name TEXT,
    channel_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'reviewed', 'action_taken', 'dismissed'
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

-- Allow anonymous app clients to submit abuse reports
DROP POLICY IF EXISTS "Allow anon to insert reports" ON public.user_reports;
CREATE POLICY "Allow anon to insert reports"
ON public.user_reports
FOR INSERT
TO anon
WITH CHECK (true);

-- Disallow public reads: only developer / service_role can view submitted reports
DROP POLICY IF EXISTS "Allow service_role full access" ON public.user_reports;
CREATE POLICY "Allow service_role full access"
ON public.user_reports
FOR ALL
TO service_role
USING (true);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_user_reports_reported_device ON public.user_reports(reported_device_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_created_at ON public.user_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_reports_status ON public.user_reports(status);
