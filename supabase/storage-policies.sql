-- Lensbnb v0.1 — storage buckets and public-read policies.
-- v0.1 is a local-only single-user demo. All three buckets are PUBLIC for simplicity:
-- the pipeline already round-trips intermediates via fetch(publicUrl), and the browser
-- needs public access for <video> and <img> tags. UUID-keyed paths make guessing
-- non-trivial. Tighten before any deploy.

-- Buckets — upsert to fix any prior conflicting rows.
insert into storage.buckets (id, name, public)
values
  ('listing-photos', 'listing-photos', true),
  ('reels',          'reels',          true),
  ('intermediates',  'intermediates',  true)
on conflict (id) do update set public = excluded.public;

-- Public read on all three. Postgres lacks `CREATE POLICY IF NOT EXISTS` —
-- use DROP+CREATE for idempotency.
drop policy if exists "public read listing-photos" on storage.objects;
drop policy if exists "public read reels"          on storage.objects;
drop policy if exists "public read intermediates"  on storage.objects;

create policy "public read listing-photos" on storage.objects
  for select using (bucket_id = 'listing-photos');
create policy "public read reels" on storage.objects
  for select using (bucket_id = 'reels');
create policy "public read intermediates" on storage.objects
  for select using (bucket_id = 'intermediates');
