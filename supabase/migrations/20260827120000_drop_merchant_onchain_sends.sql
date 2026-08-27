-- Rollback of the Bitcoin Send experiment (see migration 20260826150000 and
-- commit 3717b9d, reverted).
--
-- Product decision: Hachisu is Bitcoin merchant payments software connected to
-- a merchant-controlled wallet — it is not the merchant's spending wallet. The
-- non-custodial PSBT send flow was proven end-to-end but its external-signing
-- workflow doesn't fit the intended merchant UX, so the feature was removed.
-- The applied creation migration is kept in history as it happened; this
-- FORWARD migration removes the Send objects.
--
-- Dropping the table also drops its indexes, constraints, trigger, and RLS
-- policy (all are owned by the table). public.set_updated_at() is shared by
-- every other merchant table and MUST remain.

drop table if exists public.merchant_onchain_sends;
