ALTER TABLE public.shipment_drafts
  ADD COLUMN IF NOT EXISTS service_point_id text,
  ADD COLUMN IF NOT EXISTS service_point_name text,
  ADD COLUMN IF NOT EXISTS service_point_address text;

ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS service_point_id text,
  ADD COLUMN IF NOT EXISTS service_point_name text,
  ADD COLUMN IF NOT EXISTS service_point_address text;