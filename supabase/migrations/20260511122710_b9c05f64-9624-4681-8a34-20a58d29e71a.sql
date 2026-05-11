CREATE TABLE IF NOT EXISTS public.pickup_bookings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pickup_id             text,
  booking_id            text,
  tracking_url          text,
  pickup_date           date NOT NULL,
  pickup_type           text NOT NULL DEFAULT 'p2'
    CHECK (pickup_type IN ('p1', 'p2', 'p3', 'p4')),
  instruction           text NOT NULL,
  parcels               integer NOT NULL DEFAULT 1 CHECK (parcels >= 1),
  total_weight_kg       numeric(8,3) NOT NULL CHECK (total_weight_kg > 0),
  reference             text,
  pickup_name           text NOT NULL,
  pickup_company        text,
  pickup_address        text NOT NULL,
  pickup_zip            text NOT NULL,
  pickup_city           text NOT NULL,
  pickup_country        text NOT NULL DEFAULT 'SE',
  pickup_phone          text,
  pickup_email          text,
  status                text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'booked', 'cancelled', 'failed')),
  error                 text,
  postnord_request      jsonb,
  postnord_response     jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pickup_bookings_tenant_date
  ON public.pickup_bookings(tenant_id, pickup_date DESC);
CREATE INDEX IF NOT EXISTS idx_pickup_bookings_tenant_created
  ON public.pickup_bookings(tenant_id, created_at DESC);

DROP TRIGGER IF EXISTS pickup_bookings_updated_at ON public.pickup_bookings;
CREATE TRIGGER pickup_bookings_updated_at
  BEFORE UPDATE ON public.pickup_bookings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS pickup_booking_id uuid
    REFERENCES public.pickup_bookings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_shipments_pickup_booking
  ON public.shipments(pickup_booking_id)
  WHERE pickup_booking_id IS NOT NULL;

ALTER TABLE public.pickup_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pickup_bookings_select_own ON public.pickup_bookings;
CREATE POLICY pickup_bookings_select_own ON public.pickup_bookings
  FOR SELECT TO authenticated
  USING (public.has_tenant_access(auth.uid(), tenant_id));