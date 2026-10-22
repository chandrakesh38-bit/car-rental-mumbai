// Loopback-only PostgreSQL. Never reads project credentials or connects remotely.
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {initdb,pg_ctl} from './node_modules/@embedded-postgres/windows-x64/dist/index.js';
const {Pool}=createRequire(import.meta.url)('pg');
const root=fileURLToPath(new URL('../../../',import.meta.url));
const cluster=path.join(root,'.test-output/coupon-postgres');
const connection={host:'127.0.0.1',port:55439,user:'postgres',connectionTimeoutMillis:3000};
const ident=s=>{if(!/^[a-z_][a-z0-9_]*$/.test(s))throw Error('Invalid test identifier');return '"'+s+'"';};
export async function createLocalDatabase(name) {
 if(execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8'}).trim()!=='testing'||!/^cwd_coupon_[a-z0-9_]+$/.test(name))throw Error('Local testing database required');
 await mkdir(path.dirname(cluster),{recursive:true});
 try{await access(path.join(cluster,'PG_VERSION'));}catch{execFileSync(initdb,['-D',cluster,'-U','postgres','-A','trust','--encoding=UTF8','--locale=C'],{windowsHide:true,stdio:'pipe'});}
 let admin=new Pool({...connection,database:'postgres'});
 try{await admin.query('select 1');}catch{
  await admin.end();
  execFileSync(pg_ctl,['-D',cluster,'-l',path.join(root,'.test-output/coupon-postgres.log'),'-o','-h 127.0.0.1 -p 55439','-w','start'],{windowsHide:true,stdio:'ignore'});
  admin=new Pool({...connection,database:'postgres'});
 }
 await admin.query(`do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if; end $$`);
 // Fresh uniquely named databases preserve prior test evidence; never drop data.
 await admin.query('create database '+ident(name));await admin.end();
 const setup=new Pool({...connection,database:name});
 await setup.query(`create table public.inquiries(booking_id text,customer_name text,customer_phone text,customer_email text,service_type text,trip_type text,car_name text,route text,booking_details text,fare_amount numeric,total_fare numeric,paid_amount numeric,payment_status text,booking_status text,inquiry_status text,created_at timestamptz default now(),updated_at timestamptz default now());
 create table public.booking_payments(id uuid default gen_random_uuid(),booking_id text,payment_type text,amount numeric,status text,razorpay_payment_id text unique,paid_at timestamptz,created_at timestamptz default now());
 create table public.cwd_vendor_allocations(booking_id text,status text,driver_name text,driver_mobile text,vehicle_number text,revoked_at timestamptz);
 grant usage on schema public to service_role;
 grant select,insert,update on public.inquiries,public.booking_payments,public.cwd_vendor_allocations to service_role;`);
 for(const file of ['supabase/migrations/20260921_otp_proof_uses.sql','supabase/migrations/20261019043000_customer_accounts.sql','supabase/drafts/customer_checkout.sql','supabase/drafts/login_coupon.sql','supabase/drafts/six_digit_booking_references.sql'])await setup.query(await readFile(path.join(root,file),'utf8'));
 await setup.query('grant select,insert on public.otp_proof_uses to service_role');
 const pool=new Pool({...connection,database:name,max:12,options:'-c role=service_role'});
 const fetchDatabase=async(u,method,body)=>{
  const name=u.pathname.split('/').pop();
  try{
   if(u.pathname.includes('/rpc/')){
    const keys=Object.keys(body),sql=`select public.${ident(name)}(${keys.map((k,i)=>ident(k)+' => $'+(i+1)).join(',')}) as value`;
    const {rows}=await pool.query(sql,keys.map(k=>body[k]));return Response.json(rows[0]?.value??null);
   }
   const values=[],where=[];
   for(const [key,value] of u.searchParams){if(['select','order','limit'].includes(key))continue;if(!value.startsWith('eq.'))throw Error('Unsupported local filter');values.push(value.slice(3));where.push(ident(key)+'=$'+values.length);}
   const filter=where.length?' where '+where.join(' and '):'';
   if(method==='GET'){
    const columns=u.searchParams.get('select')||'*';let sql='select '+(columns==='*'?'*':columns.split(',').map(ident).join(','))+' from public.'+ident(name)+filter;
    if(u.searchParams.has('order')){const [col,dir]=u.searchParams.get('order').split('.');sql+=' order by '+ident(col)+(dir==='desc'?' desc':' asc');}
    if(u.searchParams.has('limit')){values.push(Number(u.searchParams.get('limit')));sql+=' limit $'+values.length;}
    return Response.json((await pool.query(sql,values)).rows);
   }
   if(method==='PATCH'){
    const set=Object.keys(body).map(k=>{values.push(body[k]);return ident(k)+'=$'+values.length;});
    return Response.json((await pool.query('update public.'+ident(name)+' set '+set.join(',')+filter+' returning *',values)).rows);
   }
   if(method==='POST'){
    const keys=Object.keys(body);
    return Response.json((await pool.query('insert into public.'+ident(name)+' ('+keys.map(ident).join(',')+') values ('+keys.map((_,i)=>'$'+(i+1)).join(',')+') returning *',keys.map(k=>body[k]))).rows);
   }
   throw Error('Unsupported local method');
  }catch(e){return Response.json({message:e.message,code:e.code},{status:e.code==='PT409'||e.code==='23505'?409:400});}
 };
 return {pool,setup,fetchDatabase,name,close:async()=>{await pool.end();await setup.end();}};
}
