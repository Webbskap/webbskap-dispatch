-- Add requires_shipping + currency on orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS requires_shipping boolean NOT NULL DEFAULT true;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS currency text;

-- Update auto-draft trigger: skip non-shipping orders, NULLIF zero weight
CREATE OR REPLACE FUNCTION public.create_draft_for_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.requires_shipping THEN
    INSERT INTO public.shipment_drafts (tenant_id, order_id, weight_kg)
    VALUES (NEW.tenant_id, NEW.id, COALESCE(NULLIF(NEW.weight, 0), 1))
    ON CONFLICT (order_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

-- Allow tenant owners to UPDATE their own tenant (for subdomain field)
DROP POLICY IF EXISTS "tenants_update_owner" ON public.tenants;
CREATE POLICY "tenants_update_owner" ON public.tenants
  FOR UPDATE TO authenticated
  USING (public.has_tenant_access(auth.uid(), id))
  WITH CHECK (public.has_tenant_access(auth.uid(), id));

-- Race-condition fix: unique tenant per user when website_id IS NULL
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tenant_per_user_no_website
  ON public.tenants (external_customer_id)
  WHERE website_id IS NULL;