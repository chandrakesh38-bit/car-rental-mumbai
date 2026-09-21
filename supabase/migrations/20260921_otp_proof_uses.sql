create table if not exists public.otp_proof_uses (
  nonce text primary key,
  purpose text not null check (purpose in ('booking','partner')),
  mobile text not null,
  expires_at timestamptz not null,
  used_at timestamptz not null default now()
);
alter table public.otp_proof_uses enable row level security;
revoke all on public.otp_proof_uses from anon, authenticated;
comment on table public.otp_proof_uses is 'Server-only one-time OTP proof consumption ledger.';
