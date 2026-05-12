ALTER TABLE public.shipment_drafts ADD COLUMN IF NOT EXISTS service_point_hours jsonb;
ALTER TABLE public.shipments ADD COLUMN IF NOT EXISTS service_point_hours jsonb;