-- Demo: add a test user app_metadata.tenant_id for local testing
-- Replace the email below with your demo account email before running in Supabase SQL editor

UPDATE auth.users
SET app_metadata = jsonb_set(COALESCE(app_metadata, '{}'), '{tenant_id}', '"00000000-0000-0000-0000-000000000001"', true)
WHERE email = 'your-demo-email@example.com';
