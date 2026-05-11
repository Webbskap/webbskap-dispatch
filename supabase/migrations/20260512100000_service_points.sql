-- Service Points support for Service 19 (MyPack Collect) bookings.
-- When the recipient picks an utlämningsställe, we snapshot the id and a
-- human-readable name/address on the draft so the order detail view can
-- show it without re-fetching from PostNord.
ALTER TABLE public.shipment_drafts
  ADD COLUMN IF NOT EXISTS service_point_id text,
  ADD COLUMN IF NOT EXISTS service_point_name text,
  ADD COLUMN IF NOT EXISTS service_point_address text;

-- Also keep them on the booked shipment so it's available for display
-- after booking even if the draft is deleted.
ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS service_point_id text,
  ADD COLUMN IF NOT EXISTS service_point_name text,
  ADD COLUMN IF NOT EXISTS service_point_address text;
