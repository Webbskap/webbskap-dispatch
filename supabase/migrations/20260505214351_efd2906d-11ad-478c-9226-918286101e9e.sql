
-- Set search_path on touch_updated_at + create_draft_for_order (already had on others; redo all to be safe)
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- Revoke EXECUTE from public/anon/authenticated on internal SECURITY DEFINER helpers
REVOKE EXECUTE ON FUNCTION public.has_tenant_access(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_tenant_ids() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_draft_for_order() FROM PUBLIC, anon, authenticated;
-- has_tenant_access must remain callable by authenticated (used in RLS policies)
GRANT EXECUTE ON FUNCTION public.has_tenant_access(uuid, uuid) TO authenticated;
