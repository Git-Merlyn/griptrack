-- WP15 / audit L12: equipment_items.reserve_min can never be negative.
-- quantity already has CHECK (quantity >= 0); reserve_min had no check, so a
-- negative value typed on the web (or pasted on Android) was stored as-is.
--
-- Clamp any existing negatives first so the constraint validates. On a clean
-- database this UPDATE touches no rows (and so fires no audit trigger).
update public.equipment_items
   set reserve_min = 0
 where reserve_min < 0;

alter table public.equipment_items
  add constraint equipment_items_reserve_min_check check (reserve_min >= 0);
