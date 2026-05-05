
-- =========================================================
-- Postnord Portal — initial schema
-- =========================================================

-- Roles enum
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'staff');

-- Order status enum
CREATE TYPE public.order_status AS ENUM ('pending', 'shipped', 'completed', 'canceled', 'archived');

-- Draft / shipment status
CREATE TYPE public.draft_status AS ENUM ('draft', 'ready', 'booked', 'cancelled', 'error');
CREATE TYPE public.shipment_status AS ENUM ('booked', 'in_transit', 'delivered', 'returned', 'cancelled', 'unknown');

-- =========================================================
-- TENANTS  (1 per Webbskap website)
-- =========================================================
CREATE TABLE public.tenants (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_customer_id text NOT NULL,
  website_id         text,
  project_id         text,
  subdomain          text,
  display_name       text,
  owner_email        text,
  owner_name         text,
  active             boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (external_customer_id, website_id)
);

CREATE INDEX idx_tenants_external_customer ON public.tenants(external_customer_id);
CREATE INDEX idx_tenants_website ON public.tenants(website_id);

-- =========================================================
-- USER ROLES  (link auth users to tenants)
-- =========================================================
CREATE TABLE public.user_roles (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role      public.app_role NOT NULL DEFAULT 'owner',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id, role)
);

CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_tenant ON public.user_roles(tenant_id);

-- Security definer helper: does user have any role on tenant?
CREATE OR REPLACE FUNCTION public.has_tenant_access(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND tenant_id = _tenant_id
  )
$$;

CREATE OR REPLACE FUNCTION public.current_tenant_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()
$$;

-- =========================================================
-- TENANT WEBBSKAP CONFIG (per-site API key + webhook secret)
-- Service role only — never readable from client
-- =========================================================
CREATE TABLE public.tenant_webbskap_config (
  tenant_id        uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  website_api_key  text,            -- per-site Bearer key from Webbskap
  webhook_secret   text,            -- HMAC-SHA512 secret for order_created
  webhook_url_set  boolean NOT NULL DEFAULT false,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- =========================================================
-- TENANT POSTNORD CONFIG (per-tenant credentials & sender)
-- =========================================================
CREATE TABLE public.tenant_postnord_config (
  tenant_id           uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  api_key             text,
  customer_number     text,
  default_service_code text,
  sender_name         text,
  sender_company      text,
  sender_address      text,
  sender_zip          text,
  sender_city         text,
  sender_country      text DEFAULT 'SE',
  sender_phone        text,
  sender_email        text,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- =========================================================
-- ORDERS  (mirror of Webbskap order_created webhook)
-- =========================================================
CREATE TABLE public.orders (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  webbskap_order_id   text NOT NULL,
  invoice_no          text,
  customer_name       text,
  customer_email      text,
  shipping_address    jsonb,
  billing_address     jsonb,
  items               jsonb NOT NULL DEFAULT '[]'::jsonb,
  weight              numeric,
  weight_unit         text DEFAULT 'kg',
  sub_total           numeric,
  total               numeric,
  currency            text,
  shipping_name       text,
  shipping_amount     numeric,
  paid                boolean DEFAULT false,
  status              public.order_status NOT NULL DEFAULT 'pending',
  raw                 jsonb,
  webbskap_created_at timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, webbskap_order_id)
);

CREATE INDEX idx_orders_tenant_created ON public.orders(tenant_id, created_at DESC);
CREATE INDEX idx_orders_status ON public.orders(tenant_id, status);

-- =========================================================
-- SHIPMENT DRAFTS (editable before booking)
-- =========================================================
CREATE TABLE public.shipment_drafts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id            uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  service_code        text,
  parcels             integer NOT NULL DEFAULT 1,
  weight_kg           numeric,
  length_cm           numeric,
  width_cm            numeric,
  height_cm           numeric,
  receiver_override   jsonb,
  sender_override     jsonb,
  additional_services jsonb DEFAULT '[]'::jsonb,
  notes               text,
  status              public.draft_status NOT NULL DEFAULT 'draft',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id)
);

CREATE INDEX idx_drafts_tenant ON public.shipment_drafts(tenant_id);

-- =========================================================
-- SHIPMENTS (after PostNord booking)
-- =========================================================
CREATE TABLE public.shipments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  draft_id            uuid REFERENCES public.shipment_drafts(id) ON DELETE SET NULL,
  order_id            uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  tracking_no         text,
  pdf_storage_path    text,
  booked_at           timestamptz NOT NULL DEFAULT now(),
  postnord_response   jsonb,
  status              public.shipment_status NOT NULL DEFAULT 'booked',
  last_status_check   timestamptz,
  status_history      jsonb DEFAULT '[]'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_shipments_tenant ON public.shipments(tenant_id);
CREATE INDEX idx_shipments_order ON public.shipments(order_id);
CREATE INDEX idx_shipments_tracking ON public.shipments(tracking_no);

-- =========================================================
-- WEBHOOK EVENTS (audit log)
-- =========================================================
CREATE TABLE public.webhook_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  source      text NOT NULL,        -- 'webbskap_site' | 'webbskap_platform'
  topic       text NOT NULL,
  payload     jsonb,
  signature   text,
  verified    boolean NOT NULL DEFAULT false,
  processed   boolean NOT NULL DEFAULT false,
  error       text,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_events_tenant ON public.webhook_events(tenant_id, received_at DESC);

-- =========================================================
-- updated_at triggers
-- =========================================================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_drafts_updated BEFORE UPDATE ON public.shipment_drafts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_shipments_updated BEFORE UPDATE ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_webbskap_cfg_updated BEFORE UPDATE ON public.tenant_webbskap_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_postnord_cfg_updated BEFORE UPDATE ON public.tenant_postnord_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- ENABLE RLS
-- =========================================================
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_webbskap_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_postnord_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- POLICIES
-- =========================================================

-- tenants: members can view, no client write (service role only)
CREATE POLICY "tenants_select_own" ON public.tenants
  FOR SELECT TO authenticated
  USING (public.has_tenant_access(auth.uid(), id));

-- user_roles: user can see their own rows
CREATE POLICY "user_roles_select_own" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- POSTNORD CONFIG — owners can read & write
CREATE POLICY "postnord_cfg_select" ON public.tenant_postnord_config
  FOR SELECT TO authenticated
  USING (public.has_tenant_access(auth.uid(), tenant_id));
CREATE POLICY "postnord_cfg_insert" ON public.tenant_postnord_config
  FOR INSERT TO authenticated
  WITH CHECK (public.has_tenant_access(auth.uid(), tenant_id));
CREATE POLICY "postnord_cfg_update" ON public.tenant_postnord_config
  FOR UPDATE TO authenticated
  USING (public.has_tenant_access(auth.uid(), tenant_id));

-- WEBBSKAP CONFIG — owners can read & write (api key + webhook secret)
CREATE POLICY "webbskap_cfg_select" ON public.tenant_webbskap_config
  FOR SELECT TO authenticated
  USING (public.has_tenant_access(auth.uid(), tenant_id));
CREATE POLICY "webbskap_cfg_insert" ON public.tenant_webbskap_config
  FOR INSERT TO authenticated
  WITH CHECK (public.has_tenant_access(auth.uid(), tenant_id));
CREATE POLICY "webbskap_cfg_update" ON public.tenant_webbskap_config
  FOR UPDATE TO authenticated
  USING (public.has_tenant_access(auth.uid(), tenant_id));

-- ORDERS — read for tenant members; writes via service role only
CREATE POLICY "orders_select" ON public.orders
  FOR SELECT TO authenticated
  USING (public.has_tenant_access(auth.uid(), tenant_id));

-- DRAFTS — full crud for tenant members
CREATE POLICY "drafts_select" ON public.shipment_drafts
  FOR SELECT TO authenticated
  USING (public.has_tenant_access(auth.uid(), tenant_id));
CREATE POLICY "drafts_update" ON public.shipment_drafts
  FOR UPDATE TO authenticated
  USING (public.has_tenant_access(auth.uid(), tenant_id));
CREATE POLICY "drafts_insert" ON public.shipment_drafts
  FOR INSERT TO authenticated
  WITH CHECK (public.has_tenant_access(auth.uid(), tenant_id));
CREATE POLICY "drafts_delete" ON public.shipment_drafts
  FOR DELETE TO authenticated
  USING (public.has_tenant_access(auth.uid(), tenant_id));

-- SHIPMENTS — read only from client; writes via service role
CREATE POLICY "shipments_select" ON public.shipments
  FOR SELECT TO authenticated
  USING (public.has_tenant_access(auth.uid(), tenant_id));

-- WEBHOOK EVENTS — read for tenant members
CREATE POLICY "webhook_events_select" ON public.webhook_events
  FOR SELECT TO authenticated
  USING (tenant_id IS NOT NULL AND public.has_tenant_access(auth.uid(), tenant_id));

-- =========================================================
-- Auto-create draft when a new order is inserted
-- =========================================================
CREATE OR REPLACE FUNCTION public.create_draft_for_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.shipment_drafts (tenant_id, order_id, weight_kg)
  VALUES (NEW.tenant_id, NEW.id, COALESCE(NEW.weight, 1))
  ON CONFLICT (order_id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_orders_create_draft
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.create_draft_for_order();

-- =========================================================
-- Realtime
-- =========================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shipment_drafts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shipments;
