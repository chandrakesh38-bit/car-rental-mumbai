// Optional isolated PostgreSQL/WASM test. Never connects to Supabase.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const pg=await PGlite.create();
try {
  await pg.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;');
  await pg.exec(await readFile(new URL('../supabase/migrations/20261019043000_customer_accounts.sql',import.meta.url),'utf8'));
  for(const role of ['anon','authenticated']) {
    await pg.exec(`set role ${role}`);
    for(const table of ['cwd_customers','cwd_customer_sessions','cwd_customer_login_uses'])
      await assert.rejects(pg.query(`select * from public.${table}`),/permission denied/);
    await assert.rejects(pg.query("select public.cwd_customer_login('12345678901234567890','919999999999',now()+interval '5 minutes',repeat('a',64),now()+interval '7 days')"),/permission denied/);
    await pg.exec('reset role');
  }
  await pg.exec('set role service_role');
  const login=(nonce,token='a'.repeat(64),mobile='919999999999')=>pg.query(
    "select public.cwd_customer_login($1,$2,now()+interval '5 minutes',$3,now()+interval '7 days') as account",[nonce,mobile,token]);
  const first=(await login('first-proof-123456789012345')).rows[0].account;
  await assert.rejects(login('first-proof-123456789012345','b'.repeat(64)),/duplicate key/);
  const again=(await login('fresh-proof-123456789012345','c'.repeat(64))).rows[0].account;
  assert.equal(again.id,first.id);
  await assert.rejects(login('failed-proof-123456789012345','invalid-session'),/check constraint/);
  assert.equal((await pg.query("select count(*)::int as n from public.cwd_customer_login_uses where nonce='failed-proof-123456789012345'")).rows[0].n,0,'failed session insert rolls back proof consumption');
  const other=(await login('other-proof-123456789012345','d'.repeat(64),'918888888888')).rows[0].account;
  assert.notEqual(other.id,first.id);
  await assert.rejects(pg.query("select public.cwd_customer_login('expired-proof-1234567890','919999999999',now()-interval '1 minute',repeat('e',64),now()+interval '7 days')"),/Invalid login parameters/);
  assert.equal((await pg.query('select count(*)::int as n from public.cwd_customers')).rows[0].n,2);
  assert.equal((await pg.query('select count(*)::int as n from public.cwd_customer_sessions')).rows[0].n,3);
  console.log('PASS: migration, anonymous/authenticated access denied, service-only RPC, replay rejection, stable account identity, transactional rollback and expiry.');
} finally {await pg.close();}
