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
