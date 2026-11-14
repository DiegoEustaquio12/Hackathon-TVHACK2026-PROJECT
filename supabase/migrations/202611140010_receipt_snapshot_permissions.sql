-- Supabase default privileges may grant service_role INSERT/UPDATE on new public tables.
-- Snapshot insertion and classification must go through the controlled SECURITY DEFINER RPCs.
revoke insert,update,truncate on public.receipt_reviews from service_role;
grant select,delete on public.receipt_reviews to service_role;
