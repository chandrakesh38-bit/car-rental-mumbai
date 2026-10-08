const IST = 19800000;
export const moneyRound = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const amount = v => Number(String(v ?? '').replace(/[^0-9.-]/g, '')) || 0;
export const isSelfDrive = b => /self/i.test(String(b.service_type || '')) || /self drive/i.test(String(b.trip_type || ''));
export function field(details, name) {
  const line = String(details || '').split(/\r?\n/).find(x => x.trim().toLowerCase().startsWith(name.toLowerCase() + ':'));
  return line ? line.slice(line.indexOf(':') + 1).trim() : '';
}

const IST_MS = 330 * 60 * 1000;
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function istDate(y,m,d,h,min) {
  const ms=Date.UTC(y,m-1,d,h,min)-IST_MS, check=new Date(ms+IST_MS);
  return check.getUTCFullYear()===y&&check.getUTCMonth()===m-1&&check.getUTCDate()===d&&check.getUTCHours()===h&&check.getUTCMinutes()===min ? new Date(ms):null;
}
export function parseLocal(s) {
  const m=String(s||'').match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)$/);
  return m?istDate(+m[1],+m[2],+m[3],+m[4],+m[5]):null;
}
export const localValue=date=>date&&Number.isFinite(date.getTime())?new Date(date.getTime()+IST_MS).toISOString().slice(0,16):'';
export function parseDate(s) {
  s=String(s||'').trim();
  if(/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:?\d\d)$/i.test(s)){
    const d=new Date(s);return Number.isFinite(d.getTime())?d:null;
  }
  let m=s.match(/^(\d{4})-(\d\d)-(\d\d)[ T](\d{1,2}):(\d\d)(?::\d\d)?\s*(AM|PM)?$/i);
  if(m){const h=+m[4];return istDate(+m[1],+m[2],+m[3],m[6]?(h%12)+(m[6].toUpperCase()==='PM'?12:0):h,+m[5]);}
  m=s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\s+(\d{4}),?\s+(\d{1,2}):(\d\d)\s*(AM|PM)$/i);
  if(!m)return null;
  const month=MONTHS.findIndex(x=>x.toLowerCase()===m[2].slice(0,3).toLowerCase())+1;
  return month?istDate(+m[3],month,+m[1],(+m[4]%12)+(m[6].toUpperCase()==='PM'?12:0),+m[5]):null;
}
export function humanDate(d) {
  const date=new Date(d.getTime()+IST_MS),day=date.getUTCDate(),hour=date.getUTCHours();
  const suffix=day%100>=11&&day%100<=13?'th':day%10===1?'st':day%10===2?'nd':day%10===3?'rd':'th';
  return day+suffix+' '+MONTHS[date.getUTCMonth()]+' '+date.getUTCFullYear()+', '+String(hour%12||12).padStart(2,'0')+':'+String(date.getUTCMinutes()).padStart(2,'0')+' '+(hour>=12?'PM':'AM');
}
export const tripDays=(a,b)=>a&&b?Math.max(1,Math.round((Date.parse(localValue(b).slice(0,10)) - Date.parse(localValue(a).slice(0,10)))/86400000)+1):0;
export const extras=b=>moneyRound(['extra_km_charge','night_charge','toll_charge','parking_charge','state_tax_charge','other_charge'].reduce((sum,k)=>sum+Number(b[k]||0),0));
export const history=details=>String(details||'').split(/\r?\n/).filter(x=>x.startsWith('CWD Modification: ')).map(x=>{try{return JSON.parse(x.slice('CWD Modification: '.length));}catch{return null;}}).filter(Boolean).reverse();

export function snapshot(b, paidOverride) {
  const details=String(b.booking_details||''),self=isSelfDrive(b),trip=String(b.trip_type||'').toLowerCase();
  const deposit=self?amount(field(details,'Security Deposit')):0;
  const delivery=self?amount(field(details,'Delivery Charge')):0;
  const base=Number(b.original_fare??b.fare_amount??b.total_fare??0);
  const markedRent=field(details,'Rental Amount')||field(details,'Base Rental Fare');
  const rental=self?(markedRent?amount(markedRent):Math.max(0,base-deposit-delivery)):base;
  const rows=details.split(/\r?\n/);
  let pick=null,ret=null,days=null,km=null;
  if(self){pick=parseDate(field(details,'Pickup'));ret=parseDate(field(details,'Return'));}
  else if(trip==='outstation'){
    const start=rows.find(x=>/^\s*📅\s*Start\s*:/i.test(x))||'';
    const end=rows.find(x=>/^\s*📅\s*Final Drop\s*:/i.test(x))||'';
    pick=parseDate(start.replace(/^\s*📅\s*Start\s*:\s*/i,''));
    ret=parseDate(end.replace(/^\s*📅\s*Final Drop\s*:\s*/i,''));
    const dur=rows.find(x=>/^\s*⏱/.test(x))||'';
    days=Number(dur.match(/(\d+)\s*Days?/i)?.[1]||0)||null;
    const found=dur.match(/([\d,]+)\s*km included/i);km=found?amount(found[1]):null;
  }else if(trip==='local'){
    const pair=(rows.find(x=>/^\s*📅\s/.test(x))||'').replace(/^\s*📅\s*/,'').split(/\s+[–-]\s+/);
    pick=parseDate(pair[0]);ret=parseDate(pair[1]);
  }else if(trip==='airport'){
    const line=rows.find(x=>/^\s*📅\s/.test(x))||'';
    pick=parseDate(line.replace(/^\s*📅\s*/,''));
  }
  const datesSupported=!!(pick&&(trip==='airport'||ret));
  const total=moneyRound(Number(b.total_fare??b.fare_amount??0));
  const paid=moneyRound(paidOverride===undefined?Number(b.paid_amount||0):paidOverride);
  const status=String(b.booking_status||'').toLowerCase();
  return {
    is_self_drive:self,trip_type:trip,booking_status:status,
    eligible:['received','availability_confirmed','confirmed','ongoing'].includes(status),
    dates_supported:datesSupported,supports_return:trip!=='airport',
    pickup_at:datesSupported?localValue(pick):'',return_at:datesSupported&&ret?localValue(ret):'',
    rental_amount:moneyRound(rental),security_deposit:moneyRound(deposit),delivery_charge:moneyRound(delivery),
    extras_amount:extras(b),included_km:km,trip_days:days,
    total_fare:total,paid_amount:paid,
    balance:Math.max(0,moneyRound(total-paid)),excess_paid:Math.max(0,moneyRound(paid-total)),
    deposit_refunded:/Security Deposit Refund Issued:/i.test(details),updated_at:b.updated_at||null
  };
}

export function updateDetails(booking,old,next,entry) {
  const rows=String(booking.booking_details||'').split(/\r?\n/);
  function replace(label,value) {
    const idx=rows.findIndex(x=>x.trim().toLowerCase().startsWith(label.toLowerCase()+':'));
    if(idx<0){const i=rows.findIndex(x=>x.startsWith('CWD Modification: '));rows.splice(i<0?rows.length:i,0,label+': '+value);}
    else rows[idx]=label+': '+value;
  }
  function setLine(reg,value) {
    const idx=rows.findIndex(x=>reg.test(x.trim()));
    if(idx<0)throw new Error('Existing date format cannot be updated safely.');
    rows[idx]=value;
  }
  const formatted=n=>'₹'+Number(n).toLocaleString('en-IN',{maximumFractionDigits:2});
  if(old.is_self_drive){
    if(next.pickup)replace('Pickup',next.pickup.toISOString());
    if(next.returnDate)replace('Return',next.returnDate.toISOString());
    if(next.pickup&&next.returnDate){
      const hours=(next.returnDate-next.pickup)/3600000;
      replace('Duration',(Number.isInteger(hours)?String(hours):hours.toFixed(1))+' hours');
    }
    replace(field(rows.join('\n'),'Rental Amount')?'Rental Amount':'Base Rental Fare',formatted(next.rental));
    replace('Security Deposit',formatted(next.deposit));
    replace('Delivery Charge',formatted(next.delivery));
    replace('Total Amount',formatted(next.base));
  }else{
    if(old.dates_supported&&next.pickup){
      const p=humanDate(next.pickup),r=next.returnDate?humanDate(next.returnDate):'';
      if(old.trip_type==='outstation'){
        setLine(/^📅\s*Start\s*:/i,'📅 Start: '+p);
        setLine(/^📅\s*Final Drop\s*:/i,'📅 Final Drop: '+r);
        const i=rows.findIndex(x=>/^\s*⏱/.test(x));
        if(i>=0){
          rows[i]=rows[i].replace(/(\d+)\s*Days?/i,String(next.days)+' Day'+(next.days===1?'':'s'));
          if(next.km!==null)rows[i]=rows[i].replace(/[\d,]+\s*km included/i,Number(next.km).toLocaleString('en-IN')+' km included');
        }
      }else if(old.trip_type==='local')setLine(/^📅\s/,'📅 '+p+' – '+r);
      else if(old.trip_type==='airport')setLine(/^📅\s/,'📅 '+p);
    }
    const i=rows.findIndex(x=>/^\s*🚗.*\|\s*₹\s*[\d,]+/.test(x));
    if(i>=0)rows[i]=rows[i].replace(/(\|\s*₹)\s*[\d,]+(?:\.\d+)?/,(_m,p)=>p+Number(next.base).toLocaleString('en-IN',{maximumFractionDigits:2}));
  }
  rows.push('CWD Modification: '+JSON.stringify(entry));
  return rows.join('\n').trim();
}
