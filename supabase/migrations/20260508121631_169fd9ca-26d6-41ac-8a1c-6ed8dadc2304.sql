ALTER TABLE public.tenant_postnord_config
  ADD COLUMN IF NOT EXISTS default_additional_services jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.create_draft_for_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg_service text;
  cfg_addls jsonb;
BEGIN
  IF NEW.requires_shipping IS DISTINCT FROM false THEN
    SELECT default_service_code, default_additional_services
      INTO cfg_service, cfg_addls
      FROM public.tenant_postnord_config
      WHERE tenant_id = NEW.tenant_id;

    INSERT INTO public.shipment_drafts (
      tenant_id, order_id, weight_kg, service_code, additional_services
    )
    VALUES (
      NEW.tenant_id,
      NEW.id,
      COALESCE(NULLIF(NEW.weight, 0), 1),
      cfg_service,
      COALESCE(cfg_addls, '[]'::jsonb)
    )
    ON CONFLICT (order_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_draft_for_order() FROM PUBLIC, anon, authenticated;

UPDATE public.tenant_postnord_config
SET default_additional_services = '["C7"]'::jsonb
WHERE default_service_code = '17'
  AND (default_additional_services IS NULL OR default_additional_services = '[]'::jsonb);