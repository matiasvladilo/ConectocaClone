-- Sistema de reclamos con QR global.
-- El acceso a estas tablas y al bucket queda exclusivamente en la Edge Function
-- de reclamos, que usa service_role.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE public.complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_serial bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  case_number text NOT NULL UNIQUE,
  business_id uuid NOT NULL,
  origin_type text NOT NULL CHECK (origin_type IN ('branch', 'production', 'other')),
  branch_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  branch_name_snapshot text,
  customer_email text NOT NULL CHECK (char_length(customer_email) BETWEEN 3 AND 254),
  customer_name text CHECK (customer_name IS NULL OR char_length(customer_name) <= 120),
  customer_phone text CHECK (customer_phone IS NULL OR char_length(customer_phone) <= 40),
  description text NOT NULL CHECK (char_length(description) BETWEEN 20 AND 5000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'attended')),
  confirmation_email_status text NOT NULL DEFAULT 'pending'
    CHECK (confirmation_email_status IN ('pending', 'sending', 'sent', 'failed')),
  notification_email_status text NOT NULL DEFAULT 'pending'
    CHECK (notification_email_status IN ('pending', 'sending', 'sent', 'failed')),
  confirmation_sent_at timestamptz,
  notification_sent_at timestamptz,
  confirmation_email_error text,
  notification_email_error text,
  attended_at timestamptz,
  attended_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (origin_type = 'branch' AND branch_name_snapshot IS NOT NULL)
    OR (origin_type <> 'branch' AND branch_profile_id IS NULL AND branch_name_snapshot IS NULL)
  ),
  CHECK (
    (status = 'pending' AND attended_at IS NULL AND attended_by IS NULL)
    OR (status = 'attended' AND attended_at IS NOT NULL AND attended_by IS NOT NULL)
  )
);

CREATE TABLE public.complaint_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  original_name text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.complaint_rate_limits (
  key_hash text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  submission_count integer NOT NULL CHECK (submission_count > 0),
  expires_at timestamptz NOT NULL
);

CREATE OR REPLACE FUNCTION public.set_complaint_case_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.case_number := format(
    'REC-%s-%s',
    to_char(current_date, 'YYYY'),
    lpad(NEW.case_serial::text, 6, '0')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER complaints_set_case_number
  BEFORE INSERT ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.set_complaint_case_number();

CREATE OR REPLACE FUNCTION public.set_complaint_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER complaints_set_updated_at
  BEFORE UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.set_complaint_updated_at();

CREATE INDEX complaints_business_status_created_at_idx
  ON public.complaints (business_id, status, created_at DESC);

CREATE INDEX complaints_business_origin_created_at_idx
  ON public.complaints (business_id, origin_type, created_at DESC);

CREATE INDEX complaints_business_branch_created_at_idx
  ON public.complaints (business_id, branch_profile_id, created_at DESC);

CREATE INDEX complaints_search_idx
  ON public.complaints
  USING gin (
    lower(concat_ws(' ', case_number, customer_email, customer_name, description)) gin_trgm_ops
  );

ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaint_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaint_rate_limits ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public)
VALUES ('complaint-evidence', 'complaint-evidence', false)
ON CONFLICT (id) DO UPDATE SET public = false;

CREATE OR REPLACE FUNCTION public.consume_complaint_rate_limit(
  p_key_hash text,
  p_limit integer DEFAULT 5
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.complaint_rate_limits
    (key_hash, window_started_at, submission_count, expires_at)
  VALUES (p_key_hash, now(), 1, now() + interval '1 hour')
  ON CONFLICT (key_hash) DO UPDATE SET
    window_started_at = CASE
      WHEN complaint_rate_limits.expires_at <= now() THEN now()
      ELSE complaint_rate_limits.window_started_at
    END,
    submission_count = CASE
      WHEN complaint_rate_limits.expires_at <= now() THEN 1
      ELSE complaint_rate_limits.submission_count + 1
    END,
    expires_at = CASE
      WHEN complaint_rate_limits.expires_at <= now() THEN now() + interval '1 hour'
      ELSE complaint_rate_limits.expires_at
    END
  RETURNING submission_count INTO v_count;

  RETURN v_count <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_complaint_rate_limit(text, integer)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_complaint_rate_limit(text, integer)
  TO service_role;
