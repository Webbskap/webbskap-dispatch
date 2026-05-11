-- =========================================================
-- PICKUP BOOKINGS (PostNord /v3/pickups)
-- =========================================================
-- A pickup is an independent thing in PostNord's world: "come collect N
-- parcels from this address on date X". It is not tied 1-to-1 with a
-- shipment. Multiple shipments can be picked up by the same pickup.
-- We allow both flows:
--   * Standalone pickup: created from the Upphämtning tab
--   * Per-order pickup: created from the order detail view after a
--     shipment has been booked; we then link them via
--     shipments.pickup_booking_id so the order detail can show "scheduled
--     for pickup on …"

CREATE TABLE IF NOT EXISTS public.pickup_bookings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- PostNord identifiers
  pickup_id             text,                -- from response idInformation.ids[*idType=pickupId]
  booking_id            text,                -- from response.bookingId
  tracking_url          text,                -- from response idInformation.urls[*type=TRACKING]

  -- Booking input (so we can show the booking back to the user without re-fetching)
  pickup_date           date NOT NULL,        -- the requested earliestPickupDate (date part)
  pickup_type           text NOT NULL DEFAULT 'p2'
    CHECK (pickup_type IN ('p1', 'p2', 'p3', 'p4')), -- p1=biz, p2=private, p3=labels-by-pn, p4=timeslot
  instruction           text NOT NULL,        -- the ADS freeText sent to PostNord
  parcels               integer NOT NULL DEFAULT 1 CHECK (parcels >= 1),
  total_weight_kg       numeric(8,3) NOT NULL CHECK (total_weight_kg > 0),
  reference             text,                 -- optional CU reference

  -- Pickup address (snapshot at booking time so later config edits don't change history)
  pickup_name           text NOT NULL,
  pickup_company        text,
  pickup_address        text NOT NULL,
  pickup_zip            text NOT NULL,
  pickup_city           text NOT NULL,
  pickup_country        text NOT NULL DEFAULT 'SE',
  pickup_phone          text,
  pickup_email          text,

  -- Status (mirrors PostNord state)
  status                text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'booked', 'cancelled', 'failed')),
  error                 text,                 -- PostNord error message if status=failed

  -- Raw PostNord response for diagnostics
  postnord_request      jsonb,
  postnord_response     jsonb,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pickup_bookings_tenant_date
  ON public.pickup_bookings(tenant_id, pickup_date DESC);
CREATE INDEX IF NOT EXISTS idx_pickup_bookings_tenant_created
  ON public.pickup_bookings(tenant_id, created_at DESC);

-- updated_at trigger
DROP TRIGGER IF EXISTS pickup_bookings_updated_at ON public.pickup_bookings;
CREATE TRIGGER pickup_bookings_updated_at
  BEFORE UPDATE ON public.pickup_bookings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- LINK shipments to pickup_bookings (nullable)
-- =========================================================
ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS pickup_booking_id uuid
    REFERENCES public.pickup_bookings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_shipments_pickup_booking
  ON public.shipments(pickup_booking_id)
  WHERE pickup_booking_id IS NOT NULL;

-- =========================================================
-- RLS — mirror the policy pattern used by shipments
-- =========================================================
ALTER TABLE public.pickup_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pickup_bookings_select_own ON public.pickup_bookings;
CREATE POLICY pickup_bookings_select_own ON public.pickup_bookings
  FOR SELECT TO authenticated
  USING (public.has_tenant_access(auth.uid(), tenant_id));

-- No INSERT/UPDATE/DELETE policies for the client — pickup writes go through
-- the book-pickup edge function (service role).
