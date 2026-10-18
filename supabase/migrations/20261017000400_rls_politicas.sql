-- GENERADO por scripts/supabase/generar-esquema.mjs a partir de lib/backend/colecciones.json. NO editar a mano:
-- se cambia el generador (o scripts/supabase/plantillas/) y se vuelve a generar con `node scripts/supabase/generar-esquema.mjs`.
-- Políticas de RLS, una por comando, traducidas de firestore.rules. Denegar por defecto: lo que no figura acá no se lee ni se escribe.

-- Se borran TODAS las políticas del esquema public y se vuelven a crear en esta misma transacción: el resultado es exactamente lo de abajo,
-- aunque antes hubiera otra cosa, y no queda ninguna abierta por olvido.
do $$
declare
  r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- users
revoke all on table public."users" from anon, authenticated;
grant select on table public."users" to anon, authenticated;
grant insert, update, delete on table public."users" to authenticated;
create policy "users_leer" on public."users" for select to anon, authenticated
  using (interno."isMember"(clinic_id) or interno."isDemo"(clinic_id));
create policy "users_crear" on public."users" for insert to authenticated
  with check (interno."isAdmin"(clinic_id) or interno."isDemoRW"(clinic_id));
create policy "users_actualizar" on public."users" for update to authenticated
  using (interno."isAdmin"(clinic_id) or interno."isDemoRW"(clinic_id) or id = interno.mi_usuario(clinic_id))
  with check (interno."isAdmin"(clinic_id) or interno."isDemoRW"(clinic_id) or id = interno.mi_usuario(clinic_id));
create policy "users_borrar" on public."users" for delete to authenticated
  using (interno."isAdmin"(clinic_id) or interno."isDemoRW"(clinic_id));

-- patients
revoke all on table public."patients" from anon, authenticated;
grant select on table public."patients" to anon, authenticated;
grant insert, update, delete on table public."patients" to authenticated;
create policy "patients_leer" on public."patients" for select to anon, authenticated
  using (interno."isMember"(clinic_id) or interno."isDemo"(clinic_id));
create policy "patients_crear" on public."patients" for insert to authenticated
  with check (interno."isDemoRW"(clinic_id) or (interno."isMember"(clinic_id) and interno."subActive"(clinic_id) and (interno."isClinical"(clinic_id) or not (data ?| array['emr', 'odontogram', 'prescriptions', 'ortho', 'perio']))));
create policy "patients_actualizar" on public."patients" for update to authenticated
  using (interno."isDemoRW"(clinic_id) or (interno."isMember"(clinic_id) and interno."subActive"(clinic_id)))
  with check (interno."isDemoRW"(clinic_id) or (interno."isMember"(clinic_id) and interno."subActive"(clinic_id)));
create policy "patients_borrar" on public."patients" for delete to authenticated
  using (interno."isDemoRW"(clinic_id) or (interno."isAdmin"(clinic_id) and interno."subActive"(clinic_id)));

-- appointments
revoke all on table public."appointments" from anon, authenticated;
grant select on table public."appointments" to anon, authenticated;
grant insert, update, delete on table public."appointments" to authenticated;
create policy "appointments_leer" on public."appointments" for select to anon, authenticated
  using (interno."isMember"(clinic_id) or interno."isDemo"(clinic_id));
create policy "appointments_crear" on public."appointments" for insert to authenticated
  with check (interno."canWrite"(clinic_id));
create policy "appointments_actualizar" on public."appointments" for update to authenticated
  using (interno."canWrite"(clinic_id))
  with check (interno."canWrite"(clinic_id));
create policy "appointments_borrar" on public."appointments" for delete to authenticated
  using (interno."canWrite"(clinic_id));

-- billing
revoke all on table public."billing" from anon, authenticated;
grant select on table public."billing" to anon, authenticated;
grant insert, update, delete on table public."billing" to authenticated;
create policy "billing_leer" on public."billing" for select to anon, authenticated
  using (interno."isMember"(clinic_id) or interno."isDemo"(clinic_id));
create policy "billing_crear" on public."billing" for insert to authenticated
  with check (interno."canWrite"(clinic_id));
create policy "billing_actualizar" on public."billing" for update to authenticated
  using (interno."canWrite"(clinic_id))
  with check (interno."canWrite"(clinic_id));
create policy "billing_borrar" on public."billing" for delete to authenticated
  using (interno."canWrite"(clinic_id));

-- procedures
revoke all on table public."procedures" from anon, authenticated;
grant select on table public."procedures" to anon, authenticated;
grant insert, update, delete on table public."procedures" to authenticated;
create policy "procedures_leer" on public."procedures" for select to anon, authenticated
  using (interno."isMember"(clinic_id) or interno."isDemo"(clinic_id));
create policy "procedures_crear" on public."procedures" for insert to authenticated
  with check ((interno."isAdmin"(clinic_id) and interno."subActive"(clinic_id)) or interno."isDemoRW"(clinic_id));
create policy "procedures_actualizar" on public."procedures" for update to authenticated
  using ((interno."isAdmin"(clinic_id) and interno."subActive"(clinic_id)) or interno."isDemoRW"(clinic_id))
  with check ((interno."isAdmin"(clinic_id) and interno."subActive"(clinic_id)) or interno."isDemoRW"(clinic_id));
create policy "procedures_borrar" on public."procedures" for delete to authenticated
  using ((interno."isAdmin"(clinic_id) and interno."subActive"(clinic_id)) or interno."isDemoRW"(clinic_id));

-- budgets
revoke all on table public."budgets" from anon, authenticated;
grant select on table public."budgets" to anon, authenticated;
grant insert, update, delete on table public."budgets" to authenticated;
create policy "budgets_leer" on public."budgets" for select to anon, authenticated
  using (interno."isMember"(clinic_id) or interno."isDemo"(clinic_id));
create policy "budgets_crear" on public."budgets" for insert to authenticated
  with check (interno."canWrite"(clinic_id));
create policy "budgets_actualizar" on public."budgets" for update to authenticated
  using (interno."canWrite"(clinic_id))
  with check (interno."canWrite"(clinic_id));
create policy "budgets_borrar" on public."budgets" for delete to authenticated
  using (interno."canWrite"(clinic_id));

-- payments
revoke all on table public."payments" from anon, authenticated;
grant select on table public."payments" to anon, authenticated;
grant insert, update, delete on table public."payments" to authenticated;
create policy "payments_leer" on public."payments" for select to anon, authenticated
  using (interno."isMember"(clinic_id) or interno."isDemo"(clinic_id));
create policy "payments_crear" on public."payments" for insert to authenticated
  with check ((interno."isCaja"(clinic_id) and interno."subActive"(clinic_id)) or interno."isDemoRW"(clinic_id));
create policy "payments_actualizar" on public."payments" for update to authenticated
  using ((interno."isCaja"(clinic_id) and interno."subActive"(clinic_id)) or interno."isDemoRW"(clinic_id))
  with check ((interno."isCaja"(clinic_id) and interno."subActive"(clinic_id)) or interno."isDemoRW"(clinic_id));
create policy "payments_borrar" on public."payments" for delete to authenticated
  using ((interno."isCaja"(clinic_id) and interno."subActive"(clinic_id)) or interno."isDemoRW"(clinic_id));

-- expenses
revoke all on table public."expenses" from anon, authenticated;
grant select on table public."expenses" to authenticated;
grant insert, update, delete on table public."expenses" to authenticated;
create policy "expenses_leer" on public."expenses" for select to authenticated
  using (interno."puedeGastos"(clinic_id) or interno."isDemoRW"(clinic_id));
create policy "expenses_crear" on public."expenses" for insert to authenticated
  with check ((interno."puedeGastos"(clinic_id) and interno."subActive"(clinic_id)) or interno."isDemoRW"(clinic_id));
create policy "expenses_actualizar" on public."expenses" for update to authenticated
  using ((interno."puedeGastos"(clinic_id) and interno."subActive"(clinic_id)) or interno."isDemoRW"(clinic_id))
  with check ((interno."puedeGastos"(clinic_id) and interno."subActive"(clinic_id)) or interno."isDemoRW"(clinic_id));
create policy "expenses_borrar" on public."expenses" for delete to authenticated
  using ((interno."puedeGastos"(clinic_id) and interno."subActive"(clinic_id)) or interno."isDemoRW"(clinic_id));

-- stock
revoke all on table public."stock" from anon, authenticated;
grant select on table public."stock" to authenticated;
grant insert, update, delete on table public."stock" to authenticated;
create policy "stock_leer" on public."stock" for select to authenticated
  using (interno."isMember"(clinic_id) or interno."isDemoRW"(clinic_id));
create policy "stock_crear" on public."stock" for insert to authenticated
  with check (interno."canWritePremium"(clinic_id, array['clinica', 'cadena']));
create policy "stock_actualizar" on public."stock" for update to authenticated
  using (interno."canWritePremium"(clinic_id, array['clinica', 'cadena']))
  with check (interno."canWritePremium"(clinic_id, array['clinica', 'cadena']));
create policy "stock_borrar" on public."stock" for delete to authenticated
  using (interno."canWritePremium"(clinic_id, array['clinica', 'cadena']));

-- stockMoves
revoke all on table public."stockMoves" from anon, authenticated;
grant select on table public."stockMoves" to anon, authenticated;
grant insert, update, delete on table public."stockMoves" to authenticated;
create policy "stockMoves_leer" on public."stockMoves" for select to anon, authenticated
  using (interno."isMember"(clinic_id) or interno."isDemo"(clinic_id));
create policy "stockMoves_crear" on public."stockMoves" for insert to authenticated
  with check (interno."canWritePremium"(clinic_id, array['clinica', 'cadena']));
create policy "stockMoves_actualizar" on public."stockMoves" for update to authenticated
  using (interno."canWritePremium"(clinic_id, array['clinica', 'cadena']))
  with check (interno."canWritePremium"(clinic_id, array['clinica', 'cadena']));
create policy "stockMoves_borrar" on public."stockMoves" for delete to authenticated
  using (interno."canWritePremium"(clinic_id, array['clinica', 'cadena']));

-- waitlist
revoke all on table public."waitlist" from anon, authenticated;
grant select on table public."waitlist" to anon, authenticated;
grant insert, update, delete on table public."waitlist" to authenticated;
create policy "waitlist_leer" on public."waitlist" for select to anon, authenticated
  using (interno."isMember"(clinic_id) or interno."isDemo"(clinic_id));
create policy "waitlist_crear" on public."waitlist" for insert to authenticated
  with check (interno."canWrite"(clinic_id));
create policy "waitlist_actualizar" on public."waitlist" for update to authenticated
  using (interno."canWrite"(clinic_id))
  with check (interno."canWrite"(clinic_id));
create policy "waitlist_borrar" on public."waitlist" for delete to authenticated
  using (interno."canWrite"(clinic_id));

-- outbox
revoke all on table public."outbox" from anon, authenticated;
grant select on table public."outbox" to anon, authenticated;
grant insert, update, delete on table public."outbox" to authenticated;
create policy "outbox_leer" on public."outbox" for select to anon, authenticated
  using (interno."isMember"(clinic_id) or interno."isDemo"(clinic_id));
create policy "outbox_crear" on public."outbox" for insert to authenticated
  with check (interno."canWritePremium"(clinic_id, array['clinica', 'cadena']));
create policy "outbox_actualizar" on public."outbox" for update to authenticated
  using (interno."canWritePremium"(clinic_id, array['clinica', 'cadena']))
  with check (interno."canWritePremium"(clinic_id, array['clinica', 'cadena']));
create policy "outbox_borrar" on public."outbox" for delete to authenticated
  using (interno."canWritePremium"(clinic_id, array['clinica', 'cadena']));

-- slotLocks
revoke all on table public."slotLocks" from anon, authenticated;
grant select on table public."slotLocks" to anon, authenticated;
grant insert, update, delete on table public."slotLocks" to authenticated;
create policy "slotLocks_leer" on public."slotLocks" for select to anon, authenticated
  using (interno."isMember"(clinic_id) or interno."isDemo"(clinic_id));
create policy "slotLocks_crear" on public."slotLocks" for insert to authenticated
  with check (interno."canWrite"(clinic_id));
create policy "slotLocks_actualizar" on public."slotLocks" for update to authenticated
  using (interno."canWrite"(clinic_id))
  with check (interno."canWrite"(clinic_id));
create policy "slotLocks_borrar" on public."slotLocks" for delete to authenticated
  using (interno."canWrite"(clinic_id));

-- recoveryMonitors
revoke all on table public."recoveryMonitors" from anon, authenticated;
grant select on table public."recoveryMonitors" to anon, authenticated;
grant insert, update, delete on table public."recoveryMonitors" to authenticated;
create policy "recoveryMonitors_leer" on public."recoveryMonitors" for select to anon, authenticated
  using (interno."isMember"(clinic_id) or interno."isDemo"(clinic_id));
create policy "recoveryMonitors_crear" on public."recoveryMonitors" for insert to authenticated
  with check (interno."canWrite"(clinic_id));
create policy "recoveryMonitors_actualizar" on public."recoveryMonitors" for update to authenticated
  using (interno."canWrite"(clinic_id))
  with check (interno."canWrite"(clinic_id));
create policy "recoveryMonitors_borrar" on public."recoveryMonitors" for delete to authenticated
  using (interno."canWrite"(clinic_id));

-- radiographs
revoke all on table public."radiographs" from anon, authenticated;
grant select on table public."radiographs" to anon, authenticated;
grant insert, update, delete on table public."radiographs" to authenticated;
create policy "radiographs_leer" on public."radiographs" for select to anon, authenticated
  using (interno."isMember"(clinic_id) or interno."isDemo"(clinic_id));
create policy "radiographs_crear" on public."radiographs" for insert to authenticated
  with check (interno."canWritePremium"(clinic_id, array['clinica', 'cadena']) and (interno."isClinical"(clinic_id) or interno."isDemoRW"(clinic_id)));
create policy "radiographs_actualizar" on public."radiographs" for update to authenticated
  using (interno."canWritePremium"(clinic_id, array['clinica', 'cadena']) and (interno."isClinical"(clinic_id) or interno."isDemoRW"(clinic_id)))
  with check (interno."canWritePremium"(clinic_id, array['clinica', 'cadena']) and (interno."isClinical"(clinic_id) or interno."isDemoRW"(clinic_id)));
create policy "radiographs_borrar" on public."radiographs" for delete to authenticated
  using (interno."canWritePremium"(clinic_id, array['clinica', 'cadena']) and (interno."isClinical"(clinic_id) or interno."isDemoRW"(clinic_id)));

-- signatures
revoke all on table public."signatures" from anon, authenticated;
grant select on table public."signatures" to anon, authenticated;
grant insert, update, delete on table public."signatures" to authenticated;
create policy "signatures_leer" on public."signatures" for select to anon, authenticated
  using (interno."isMember"(clinic_id) or interno."isDemo"(clinic_id));
create policy "signatures_crear" on public."signatures" for insert to authenticated
  with check (interno."canWritePremium"(clinic_id, array['clinica', 'cadena']) and (interno."isRecepcion"(clinic_id) or interno."isDemoRW"(clinic_id)));
create policy "signatures_actualizar" on public."signatures" for update to authenticated
  using (interno."canWritePremium"(clinic_id, array['clinica', 'cadena']) and (interno."isRecepcion"(clinic_id) or interno."isDemoRW"(clinic_id)))
  with check (interno."canWritePremium"(clinic_id, array['clinica', 'cadena']) and (interno."isRecepcion"(clinic_id) or interno."isDemoRW"(clinic_id)));
create policy "signatures_borrar" on public."signatures" for delete to authenticated
  using (interno."isDemoRW"(clinic_id));

-- crmCards
revoke all on table public."crmCards" from anon, authenticated;
grant select on table public."crmCards" to anon, authenticated;
grant insert, update, delete on table public."crmCards" to authenticated;
create policy "crmCards_leer" on public."crmCards" for select to anon, authenticated
  using (interno."isMember"(clinic_id) or interno."isDemo"(clinic_id));
create policy "crmCards_crear" on public."crmCards" for insert to authenticated
  with check (interno."canWritePremium"(clinic_id, array['cadena']));
create policy "crmCards_actualizar" on public."crmCards" for update to authenticated
  using (interno."canWritePremium"(clinic_id, array['cadena']))
  with check (interno."canWritePremium"(clinic_id, array['cadena']));
create policy "crmCards_borrar" on public."crmCards" for delete to authenticated
  using (interno."canWritePremium"(clinic_id, array['cadena']));

-- campaigns
revoke all on table public."campaigns" from anon, authenticated;
grant select on table public."campaigns" to anon, authenticated;
grant insert, update, delete on table public."campaigns" to authenticated;
create policy "campaigns_leer" on public."campaigns" for select to anon, authenticated
  using (interno."isMember"(clinic_id) or interno."isDemo"(clinic_id));
create policy "campaigns_crear" on public."campaigns" for insert to authenticated
  with check (interno."canWritePremium"(clinic_id, array['cadena']));
create policy "campaigns_actualizar" on public."campaigns" for update to authenticated
  using (interno."canWritePremium"(clinic_id, array['cadena']))
  with check (interno."canWritePremium"(clinic_id, array['cadena']));
create policy "campaigns_borrar" on public."campaigns" for delete to authenticated
  using (interno."canWritePremium"(clinic_id, array['cadena']));

-- labOrders
revoke all on table public."labOrders" from anon, authenticated;
grant select on table public."labOrders" to anon, authenticated;
grant insert, update, delete on table public."labOrders" to authenticated;
create policy "labOrders_leer" on public."labOrders" for select to anon, authenticated
  using (interno."isMember"(clinic_id) or interno."isDemo"(clinic_id));
create policy "labOrders_crear" on public."labOrders" for insert to authenticated
  with check (interno."canWritePremium"(clinic_id, array['clinica', 'cadena']));
create policy "labOrders_actualizar" on public."labOrders" for update to authenticated
  using (interno."canWritePremium"(clinic_id, array['clinica', 'cadena']))
  with check (interno."canWritePremium"(clinic_id, array['clinica', 'cadena']));
create policy "labOrders_borrar" on public."labOrders" for delete to authenticated
  using (interno."canWritePremium"(clinic_id, array['clinica', 'cadena']));

-- settlements
revoke all on table public."settlements" from anon, authenticated;
grant select on table public."settlements" to anon, authenticated;
grant insert, update, delete on table public."settlements" to authenticated;
create policy "settlements_leer" on public."settlements" for select to anon, authenticated
  using (interno."puedeLiquidaciones"(clinic_id) or interno."isDemo"(clinic_id));
create policy "settlements_crear" on public."settlements" for insert to authenticated
  with check ((interno."puedeLiquidaciones"(clinic_id) and interno."canWritePremium"(clinic_id, array['clinica', 'cadena'])) or interno."isDemoRW"(clinic_id));
create policy "settlements_actualizar" on public."settlements" for update to authenticated
  using ((interno."puedeLiquidaciones"(clinic_id) and interno."canWritePremium"(clinic_id, array['clinica', 'cadena'])) or interno."isDemoRW"(clinic_id))
  with check ((interno."puedeLiquidaciones"(clinic_id) and interno."canWritePremium"(clinic_id, array['clinica', 'cadena'])) or interno."isDemoRW"(clinic_id));
create policy "settlements_borrar" on public."settlements" for delete to authenticated
  using ((interno."puedeLiquidaciones"(clinic_id) and interno."canWritePremium"(clinic_id, array['clinica', 'cadena'])) or interno."isDemoRW"(clinic_id));

-- boxes
revoke all on table public."boxes" from anon, authenticated;
grant select on table public."boxes" to anon, authenticated;
grant insert, update, delete on table public."boxes" to authenticated;
create policy "boxes_leer" on public."boxes" for select to anon, authenticated
  using (interno."isMember"(clinic_id) or interno."isDemo"(clinic_id));
create policy "boxes_crear" on public."boxes" for insert to authenticated
  with check (interno."canWritePremium"(clinic_id, array['clinica', 'cadena']));
create policy "boxes_actualizar" on public."boxes" for update to authenticated
  using (interno."canWritePremium"(clinic_id, array['clinica', 'cadena']))
  with check (interno."canWritePremium"(clinic_id, array['clinica', 'cadena']));
create policy "boxes_borrar" on public."boxes" for delete to authenticated
  using (interno."canWritePremium"(clinic_id, array['clinica', 'cadena']));

-- patientNotes
revoke all on table public."patientNotes" from anon, authenticated;
grant select on table public."patientNotes" to anon, authenticated;
grant insert, update, delete on table public."patientNotes" to authenticated;
create policy "patientNotes_leer" on public."patientNotes" for select to anon, authenticated
  using (interno."isMember"(clinic_id) or interno."isDemo"(clinic_id));
create policy "patientNotes_crear" on public."patientNotes" for insert to authenticated
  with check (interno."canWrite"(clinic_id));
create policy "patientNotes_actualizar" on public."patientNotes" for update to authenticated
  using (interno."canWrite"(clinic_id))
  with check (interno."canWrite"(clinic_id));
create policy "patientNotes_borrar" on public."patientNotes" for delete to authenticated
  using (interno."canWrite"(clinic_id));

-- fiscalDocs
revoke all on table public."fiscalDocs" from anon, authenticated;
grant select on table public."fiscalDocs" to anon, authenticated;
grant insert, update, delete on table public."fiscalDocs" to authenticated;
create policy "fiscalDocs_leer" on public."fiscalDocs" for select to anon, authenticated
  using (interno."isMember"(clinic_id) or interno."isDemo"(clinic_id));
create policy "fiscalDocs_crear" on public."fiscalDocs" for insert to authenticated
  with check ((interno."isCaja"(clinic_id) and interno."subActive"(clinic_id)) or interno."isDemoRW"(clinic_id));
create policy "fiscalDocs_actualizar" on public."fiscalDocs" for update to authenticated
  using ((interno."isCaja"(clinic_id) and interno."subActive"(clinic_id)) or interno."isDemoRW"(clinic_id))
  with check ((interno."isCaja"(clinic_id) and interno."subActive"(clinic_id)) or interno."isDemoRW"(clinic_id));
create policy "fiscalDocs_borrar" on public."fiscalDocs" for delete to authenticated
  using (interno."isAdmin"(clinic_id) or interno."isDemoRW"(clinic_id));

-- cashSessions
revoke all on table public."cashSessions" from anon, authenticated;
grant select on table public."cashSessions" to anon, authenticated;
grant insert, update, delete on table public."cashSessions" to authenticated;
create policy "cashSessions_leer" on public."cashSessions" for select to anon, authenticated
  using (interno."isMember"(clinic_id) or interno."isDemo"(clinic_id));
create policy "cashSessions_crear" on public."cashSessions" for insert to authenticated
  with check ((interno."isCaja"(clinic_id) and interno."subActive"(clinic_id) and interno."effectivePlan"(clinic_id) = any (array['clinica', 'cadena'])) or interno."isDemoRW"(clinic_id));
create policy "cashSessions_actualizar" on public."cashSessions" for update to authenticated
  using ((interno."isCaja"(clinic_id) and interno."subActive"(clinic_id) and interno."effectivePlan"(clinic_id) = any (array['clinica', 'cadena'])) or interno."isDemoRW"(clinic_id))
  with check ((interno."isCaja"(clinic_id) and interno."subActive"(clinic_id) and interno."effectivePlan"(clinic_id) = any (array['clinica', 'cadena'])) or interno."isDemoRW"(clinic_id));
create policy "cashSessions_borrar" on public."cashSessions" for delete to authenticated
  using ((interno."isCaja"(clinic_id) and interno."subActive"(clinic_id) and interno."effectivePlan"(clinic_id) = any (array['clinica', 'cadena'])) or interno."isDemoRW"(clinic_id));

-- sterilizationCycles
revoke all on table public."sterilizationCycles" from anon, authenticated;
grant select on table public."sterilizationCycles" to anon, authenticated;
grant insert, update, delete on table public."sterilizationCycles" to authenticated;
create policy "sterilizationCycles_leer" on public."sterilizationCycles" for select to anon, authenticated
  using (interno."isMember"(clinic_id) or interno."isDemo"(clinic_id));
create policy "sterilizationCycles_crear" on public."sterilizationCycles" for insert to authenticated
  with check (interno."canWrite"(clinic_id));
create policy "sterilizationCycles_actualizar" on public."sterilizationCycles" for update to authenticated
  using (interno."canWrite"(clinic_id))
  with check (interno."canWrite"(clinic_id));
create policy "sterilizationCycles_borrar" on public."sterilizationCycles" for delete to authenticated
  using (interno."canWrite"(clinic_id));

-- teamMessages
revoke all on table public."teamMessages" from anon, authenticated;
grant select on table public."teamMessages" to anon, authenticated;
grant insert, update, delete on table public."teamMessages" to authenticated;
create policy "teamMessages_leer" on public."teamMessages" for select to anon, authenticated
  using (interno."isMember"(clinic_id) or interno."isDemo"(clinic_id));
create policy "teamMessages_crear" on public."teamMessages" for insert to authenticated
  with check (interno."canWrite"(clinic_id));
create policy "teamMessages_actualizar" on public."teamMessages" for update to authenticated
  using (interno."canWrite"(clinic_id))
  with check (interno."canWrite"(clinic_id));
create policy "teamMessages_borrar" on public."teamMessages" for delete to authenticated
  using (interno."canWrite"(clinic_id));

-- surveys
revoke all on table public."surveys" from anon, authenticated;
grant select on table public."surveys" to anon, authenticated;
grant insert, update, delete on table public."surveys" to authenticated;
create policy "surveys_leer" on public."surveys" for select to anon, authenticated
  using (interno."isMember"(clinic_id) or interno."isDemo"(clinic_id));
create policy "surveys_crear" on public."surveys" for insert to authenticated
  with check (interno."canWrite"(clinic_id));
create policy "surveys_actualizar" on public."surveys" for update to authenticated
  using (interno."canWrite"(clinic_id))
  with check (interno."canWrite"(clinic_id));
create policy "surveys_borrar" on public."surveys" for delete to authenticated
  using (interno."canWrite"(clinic_id));

-- surveyResponses
revoke all on table public."surveyResponses" from anon, authenticated;
grant select on table public."surveyResponses" to anon, authenticated;
grant insert, update, delete on table public."surveyResponses" to authenticated;
create policy "surveyResponses_leer" on public."surveyResponses" for select to anon, authenticated
  using (interno."isMember"(clinic_id) or interno."isDemo"(clinic_id));
create policy "surveyResponses_crear" on public."surveyResponses" for insert to authenticated
  with check (interno."isDemoRW"(clinic_id));
create policy "surveyResponses_actualizar" on public."surveyResponses" for update to authenticated
  using (interno."isDemoRW"(clinic_id))
  with check (interno."isDemoRW"(clinic_id));
create policy "surveyResponses_borrar" on public."surveyResponses" for delete to authenticated
  using (interno."isDemoRW"(clinic_id));

-- mgmtTasks
revoke all on table public."mgmtTasks" from anon, authenticated;
grant select on table public."mgmtTasks" to anon, authenticated;
grant insert, update, delete on table public."mgmtTasks" to authenticated;
create policy "mgmtTasks_leer" on public."mgmtTasks" for select to anon, authenticated
  using (interno."isMember"(clinic_id) or interno."isDemo"(clinic_id));
create policy "mgmtTasks_crear" on public."mgmtTasks" for insert to authenticated
  with check (interno."canWrite"(clinic_id));
create policy "mgmtTasks_actualizar" on public."mgmtTasks" for update to authenticated
  using (interno."canWrite"(clinic_id))
  with check (interno."canWrite"(clinic_id));
create policy "mgmtTasks_borrar" on public."mgmtTasks" for delete to authenticated
  using (interno."canWrite"(clinic_id));

-- environmentalLogs
revoke all on table public."environmentalLogs" from anon, authenticated;
grant select on table public."environmentalLogs" to anon, authenticated;
grant insert, update, delete on table public."environmentalLogs" to authenticated;
create policy "environmentalLogs_leer" on public."environmentalLogs" for select to anon, authenticated
  using (interno."isMember"(clinic_id) or interno."isDemo"(clinic_id));
create policy "environmentalLogs_crear" on public."environmentalLogs" for insert to authenticated
  with check (interno."canWrite"(clinic_id));
create policy "environmentalLogs_actualizar" on public."environmentalLogs" for update to authenticated
  using (interno."canWrite"(clinic_id))
  with check (interno."canWrite"(clinic_id));
create policy "environmentalLogs_borrar" on public."environmentalLogs" for delete to authenticated
  using (interno."canWrite"(clinic_id));

-- eduVideos
revoke all on table public."eduVideos" from anon, authenticated;
grant select on table public."eduVideos" to anon, authenticated;
grant insert, update, delete on table public."eduVideos" to authenticated;
create policy "eduVideos_leer" on public."eduVideos" for select to anon, authenticated
  using (interno."isMember"(clinic_id) or interno."isDemo"(clinic_id));
create policy "eduVideos_crear" on public."eduVideos" for insert to authenticated
  with check (interno."canWrite"(clinic_id));
create policy "eduVideos_actualizar" on public."eduVideos" for update to authenticated
  using (interno."canWrite"(clinic_id))
  with check (interno."canWrite"(clinic_id));
create policy "eduVideos_borrar" on public."eduVideos" for delete to authenticated
  using (interno."canWrite"(clinic_id));

-- branches
revoke all on table public."branches" from anon, authenticated;
grant select on table public."branches" to anon, authenticated;
grant insert, update, delete on table public."branches" to authenticated;
create policy "branches_leer" on public."branches" for select to anon, authenticated
  using (interno."isMember"(clinic_id) or interno."isDemo"(clinic_id));
create policy "branches_crear" on public."branches" for insert to authenticated
  with check (interno."canWrite"(clinic_id));
create policy "branches_actualizar" on public."branches" for update to authenticated
  using (interno."canWrite"(clinic_id))
  with check (interno."canWrite"(clinic_id));
create policy "branches_borrar" on public."branches" for delete to authenticated
  using (interno."canWrite"(clinic_id));

-- directMessages
revoke all on table public."directMessages" from anon, authenticated;
grant select on table public."directMessages" to anon, authenticated;
grant insert, update, delete on table public."directMessages" to authenticated;
create policy "directMessages_leer" on public."directMessages" for select to anon, authenticated
  using (interno."isDemo"(clinic_id) or (interno."isMember"(clinic_id) and ((data -> 'participants') ? interno.mi_usuario(clinic_id) or interno."isAdmin"(clinic_id))));
create policy "directMessages_crear" on public."directMessages" for insert to authenticated
  with check (interno."isDemoRW"(clinic_id) or (interno."isMember"(clinic_id) and interno."subActive"(clinic_id)));
create policy "directMessages_actualizar" on public."directMessages" for update to authenticated
  using (interno."isDemoRW"(clinic_id) or (interno."isMember"(clinic_id) and interno.mi_usuario(clinic_id) = (data ->> 'toId')))
  with check (interno."isDemoRW"(clinic_id) or (interno."isMember"(clinic_id) and interno.mi_usuario(clinic_id) = (data ->> 'toId')));
create policy "directMessages_borrar" on public."directMessages" for delete to authenticated
  using (interno."isDemoRW"(clinic_id));

-- clinicalDocs
revoke all on table public."clinicalDocs" from anon, authenticated;
grant select on table public."clinicalDocs" to anon, authenticated;
grant insert, update, delete on table public."clinicalDocs" to authenticated;
create policy "clinicalDocs_leer" on public."clinicalDocs" for select to anon, authenticated
  using (interno."isMember"(clinic_id) or interno."isDemo"(clinic_id));
create policy "clinicalDocs_crear" on public."clinicalDocs" for insert to authenticated
  with check (interno."isDemoRW"(clinic_id) or (interno."subActive"(clinic_id) and (interno."isRecepcion"(clinic_id) or interno."isClinical"(clinic_id))));
create policy "clinicalDocs_actualizar" on public."clinicalDocs" for update to authenticated
  using (interno."isDemoRW"(clinic_id) or (interno."subActive"(clinic_id) and (interno."isRecepcion"(clinic_id) or interno."isClinical"(clinic_id))))
  with check (interno."isDemoRW"(clinic_id) or (interno."subActive"(clinic_id) and (interno."isRecepcion"(clinic_id) or interno."isClinical"(clinic_id))));
create policy "clinicalDocs_borrar" on public."clinicalDocs" for delete to authenticated
  using (interno."isDemoRW"(clinic_id));

-- routineChecks
revoke all on table public."routineChecks" from anon, authenticated;
grant select on table public."routineChecks" to anon, authenticated;
grant insert, update, delete on table public."routineChecks" to authenticated;
create policy "routineChecks_leer" on public."routineChecks" for select to anon, authenticated
  using (interno."isMember"(clinic_id) or interno."isDemo"(clinic_id));
create policy "routineChecks_crear" on public."routineChecks" for insert to authenticated
  with check (interno."isDemoRW"(clinic_id) or (interno."isAdmin"(clinic_id) and interno."subActive"(clinic_id)));
create policy "routineChecks_actualizar" on public."routineChecks" for update to authenticated
  using (interno."isDemoRW"(clinic_id) or (interno."isAdmin"(clinic_id) and interno."subActive"(clinic_id)))
  with check (interno."isDemoRW"(clinic_id) or (interno."isAdmin"(clinic_id) and interno."subActive"(clinic_id)));
create policy "routineChecks_borrar" on public."routineChecks" for delete to authenticated
  using (interno."isDemoRW"(clinic_id) or (interno."isAdmin"(clinic_id) and interno."subActive"(clinic_id)));

-- agendaBlocks
revoke all on table public."agendaBlocks" from anon, authenticated;
grant select on table public."agendaBlocks" to anon, authenticated;
grant insert, update, delete on table public."agendaBlocks" to authenticated;
create policy "agendaBlocks_leer" on public."agendaBlocks" for select to anon, authenticated
  using (interno."isMember"(clinic_id) or interno."isDemo"(clinic_id));
create policy "agendaBlocks_crear" on public."agendaBlocks" for insert to authenticated
  with check (interno."canWrite"(clinic_id));
create policy "agendaBlocks_actualizar" on public."agendaBlocks" for update to authenticated
  using (interno."canWrite"(clinic_id))
  with check (interno."canWrite"(clinic_id));
create policy "agendaBlocks_borrar" on public."agendaBlocks" for delete to authenticated
  using (interno."canWrite"(clinic_id));

-- clinics
revoke all on table public."clinics" from anon, authenticated;
grant select on table public."clinics" to anon, authenticated;
grant insert, update, delete on table public."clinics" to authenticated;
create policy "clinics_leer" on public."clinics" for select to anon, authenticated
  using (interno."isMember"(id) or interno."isDemo"(id));
create policy "clinics_crear" on public."clinics" for insert to authenticated
  with check (interno."isDemoRW"(id));
create policy "clinics_actualizar" on public."clinics" for update to authenticated
  using (interno."isAdmin"(id) or interno."isDemoRW"(id))
  with check (interno."isAdmin"(id) or interno."isDemoRW"(id));
create policy "clinics_borrar" on public."clinics" for delete to authenticated
  using (interno."isDemoRW"(id));

-- subscriptions
revoke all on table public."subscriptions" from anon, authenticated;
grant select on table public."subscriptions" to anon, authenticated;
create policy "subscriptions_leer" on public."subscriptions" for select to anon, authenticated
  using (interno."isMember"(id) or interno."isDemo"(id));

-- webhookEvents: solo el servidor (service_role). Sin políticas y sin permisos para anon ni authenticated.
revoke all on table public."webhookEvents" from anon, authenticated;

-- leads: solo el servidor (service_role). Sin políticas y sin permisos para anon ni authenticated.
revoke all on table public."leads" from anon, authenticated;

-- checkoutTokens: solo el servidor (service_role). Sin políticas y sin permisos para anon ni authenticated.
revoke all on table public."checkoutTokens" from anon, authenticated;
