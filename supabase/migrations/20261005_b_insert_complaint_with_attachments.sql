-- Persiste el reclamo y todos sus metadatos de adjuntos en una sola transacción.
-- Los objetos de Storage se cargan antes; si esta RPC falla, Postgres revierte
-- ambas tablas y el servicio intenta limpiar esos objetos.
CREATE OR REPLACE FUNCTION public.insert_complaint_with_attachments(
  p_id uuid,
  p_business_id uuid,
  p_origin_type text,
  p_branch_profile_id uuid,
  p_branch_name_snapshot text,
  p_customer_email text,
  p_customer_name text,
  p_customer_phone text,
  p_description text,
  p_attachments jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_complaint public.complaints%ROWTYPE;
  v_attachment jsonb;
  v_attachments jsonb := COALESCE(p_attachments, '[]'::jsonb);
BEGIN
  IF jsonb_typeof(v_attachments) <> 'array' THEN
    RAISE EXCEPTION 'p_attachments must be a JSON array';
  END IF;

  INSERT INTO public.complaints (
    id,
    business_id,
    origin_type,
    branch_profile_id,
    branch_name_snapshot,
    customer_email,
    customer_name,
    customer_phone,
    description
  ) VALUES (
    p_id,
    p_business_id,
    p_origin_type,
    p_branch_profile_id,
    p_branch_name_snapshot,
    p_customer_email,
    p_customer_name,
    p_customer_phone,
    p_description
  ) RETURNING * INTO v_complaint;

  FOR v_attachment IN SELECT value FROM jsonb_array_elements(v_attachments)
  LOOP
    INSERT INTO public.complaint_attachments (
      id,
      complaint_id,
      storage_path,
      original_name,
      mime_type,
      size_bytes
    ) VALUES (
      (v_attachment ->> 'id')::uuid,
      p_id,
      v_attachment ->> 'storage_path',
      v_attachment ->> 'original_name',
      v_attachment ->> 'mime_type',
      (v_attachment ->> 'size_bytes')::bigint
    );
  END LOOP;

  RETURN jsonb_build_object(
    'id', v_complaint.id,
    'case_number', v_complaint.case_number,
    'created_at', v_complaint.created_at,
    'origin_type', v_complaint.origin_type,
    'branch_name_snapshot', v_complaint.branch_name_snapshot,
    'customer_email', v_complaint.customer_email,
    'customer_name', v_complaint.customer_name,
    'customer_phone', v_complaint.customer_phone,
    'description', v_complaint.description,
    'attachment_count', jsonb_array_length(v_attachments)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.insert_complaint_with_attachments(
  uuid, uuid, text, uuid, text, text, text, text, text, jsonb
) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.insert_complaint_with_attachments(
  uuid, uuid, text, uuid, text, text, text, text, text, jsonb
) TO service_role;
