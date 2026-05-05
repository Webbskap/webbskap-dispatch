
INSERT INTO storage.buckets (id, name, public) VALUES ('shipment-labels', 'shipment-labels', false)
ON CONFLICT (id) DO NOTHING;

-- Only signed URLs / service role; clients cannot list directly
CREATE POLICY "labels_select_via_tenant" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'shipment-labels'
    AND public.has_tenant_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
