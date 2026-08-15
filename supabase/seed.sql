-- Seed categories from updated-s-link (idempotent upsert).
-- Do not delete older category names that may still have FKs.

insert into public.service_categories (name, icon) values
  ('Plumbing', 'plumbing'),
  ('Electrical', 'electrical_services'),
  ('Cleaning', 'cleaning_services'),
  ('Appliance Repair', 'home_repair_service'),
  ('Salon & Beauty', 'spa'),
  ('Carpentry', 'carpenter'),
  ('Mechanic', 'car_repair'),
  ('Pest Control', 'pest_control'),
  ('Painting', 'format_paint'),
  ('Laundry', 'local_laundry_service')
on conflict (name) do update set icon = excluded.icon;
