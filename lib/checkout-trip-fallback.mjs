export function checkoutTripFallback(data={}){
 const positive=value=>Number.isFinite(Number(value))&&Number(value)>0?Number(value):0;
 const date=value=>{if(!value)return null;const d=new Date(value);return Number.isFinite(d.getTime())?d.toISOString():null;};
 return {includedKm:positive(data.includedKm),days:positive(data.days),start:date(data.pickupAt),end:date(data.returnAt)};
}
