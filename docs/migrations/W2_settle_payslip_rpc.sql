-- W2: Atomic settlement RPC
-- Run this entire script in the Supabase SQL editor.
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE).

-- ── 1. New columns on payslips ────────────────────────────────────────────────
alter table payslips
  add column if not exists pending_transactions jsonb,
  add column if not exists credit_delta         integer default 0;

-- ── 2. Unique index: one draft per member per period (also used by W3) ────────
create unique index if not exists payslips_member_period_uniq
  on payslips (member_id, period_start)
  where status = 'draft';

-- ── 3. settle_payslip RPC ─────────────────────────────────────────────────────
create or replace function settle_payslip(p_payslip_id text)
returns jsonb
language plpgsql
security definer
as $$
declare
  ps            record;
  m             record;
  rec           record;
  p_tax_total   numeric;
  tax_entry     jsonb;
  settled_score integer;
begin
  -- 1. Lock payslip row; idempotency guard
  select * into ps from payslips where id = p_payslip_id for update;
  if not found then raise exception 'Payslip not found'; end if;
  if ps.status = 'settled' then raise exception 'Payslip already settled'; end if;

  -- 2. Lock member row
  select * into m from members where id = ps.member_id for update;
  if not found then raise exception 'Member not found'; end if;

  -- 3. Update member accounts from precomputed balances_after
  update members
    set accounts = ps.balances_after
    where id = ps.member_id;

  -- 4. Tax fund: atomic increment + append history entry
  p_tax_total := coalesce((ps.deductions->>'tax')::numeric, 0)
               + coalesce((ps.deductions->>'interestTax')::numeric, 0);

  if p_tax_total > 0 then
    tax_entry := jsonb_build_object(
      'id',          gen_random_uuid()::text,
      'memberId',    ps.member_id,
      'amount',      p_tax_total,
      'type',        'credit',
      'description', 'Tax — ' || m.name || ' (' || ps.period_end || ')',
      'date',        ps.period_end
    );
    update families
      set tax_fund_balance = coalesce(tax_fund_balance, 0) + p_tax_total,
          tax_fund_history = coalesce(tax_fund_history, '[]'::jsonb)
                          || jsonb_build_array(tax_entry)
      where id = m.family_id;
  end if;

  -- 5. Insert transactions from pending_transactions
  for rec in
    select value as tx
      from jsonb_array_elements(coalesce(ps.pending_transactions, '[]'::jsonb))
  loop
    insert into transactions (id, member_id, type, amount, description, date, related_id)
    values (
      gen_random_uuid()::text,
      ps.member_id,
      rec.tx->>'type',
      (rec.tx->>'amount')::numeric,
      rec.tx->>'description',
      ps.period_end,
      rec.tx->>'relatedId'
    );
  end loop;

  -- 6. Credit score: clamped atomic update
  settled_score := greatest(300, least(850,
    m.credit_score + coalesce(ps.credit_delta, 0)
  ));
  update members
    set credit_score = settled_score
    where id = ps.member_id;

  -- 7. Mark payslip settled, stamp the settled credit score
  update payslips
    set status       = 'settled',
        credit_score = settled_score
    where id = p_payslip_id;

  return jsonb_build_object(
    'settledScore',  settled_score,
    'newBalances',   ps.balances_after
  );
end $$;
