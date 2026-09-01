-- 101_portal_write.sql — Portal klienta Faza 1: pierwsza ścieżka ZAPISU.
-- Addytywne polityki portal (scoped przez current_portal_client_id()) na
-- client_contact_methods + client_delivery_points. Owner-policy (ALL) bez zmian.
-- clients CELOWO bez UPDATE-polityki — pozostaje read-only dla portalu.

BEGIN;

-- ── client_delivery_points ── SELECT + INSERT + UPDATE (soft-delete = UPDATE is_active)
drop policy if exists cdp_portal_select on client_delivery_points;
create policy cdp_portal_select on client_delivery_points
  for select using (client_id = current_portal_client_id());

drop policy if exists cdp_portal_insert on client_delivery_points;
create policy cdp_portal_insert on client_delivery_points
  for insert with check (client_id = current_portal_client_id());

drop policy if exists cdp_portal_update on client_delivery_points;
create policy cdp_portal_update on client_delivery_points
  for update using (client_id = current_portal_client_id())
  with check (client_id = current_portal_client_id());
-- BEZ DELETE-polityki — twardego usuwania nie ma (ochrona order_delivery_points).

-- ── client_contact_methods ── SELECT + INSERT + UPDATE + DELETE
drop policy if exists ccm_portal_select on client_contact_methods;
create policy ccm_portal_select on client_contact_methods
  for select using (client_id = current_portal_client_id());

drop policy if exists ccm_portal_insert on client_contact_methods;
create policy ccm_portal_insert on client_contact_methods
  for insert with check (client_id = current_portal_client_id());

drop policy if exists ccm_portal_update on client_contact_methods;
create policy ccm_portal_update on client_contact_methods
  for update using (client_id = current_portal_client_id())
  with check (client_id = current_portal_client_id());

drop policy if exists ccm_portal_delete on client_contact_methods;
create policy ccm_portal_delete on client_contact_methods
  for delete using (client_id = current_portal_client_id());

COMMIT;
