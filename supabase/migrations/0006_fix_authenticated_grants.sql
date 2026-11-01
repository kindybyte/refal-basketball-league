-- =============================================================================
-- REFAL Basketball League
-- Migration 0006: FIX — restore table privileges for the `authenticated` role.
--
-- Migration 0003 mistakenly revoked privileges from `authenticated` as well as
-- `anon` on the sensitive tables. Admins/operators act under `authenticated`,
-- and RLS only takes effect when the role still holds the base GRANT — so the
-- over-revoke produced "permission denied for table players" on admin writes.
--
-- Here we restore the grants. Access stays correctly restricted by the RLS
-- policies from 0003 (admin-all, operator-scoped reads). `anon` remains revoked.
-- Safe to run on any database (idempotent).
-- =============================================================================

grant select, insert, update, delete on public.players                 to authenticated;
grant select, insert, update, delete on public.private_player_contacts to authenticated;
grant select, insert, update, delete on public.consent_tokens          to authenticated;
grant select, insert, update, delete on public.consent_records         to authenticated;
grant select, insert, update, delete on public.audit_logs              to authenticated;

-- Keep anon locked out of these tables (defense in depth; RLS also blocks).
revoke all on public.players                 from anon;
revoke all on public.private_player_contacts from anon;
revoke all on public.consent_tokens          from anon;
revoke all on public.consent_records         from anon;
revoke all on public.audit_logs              from anon;
