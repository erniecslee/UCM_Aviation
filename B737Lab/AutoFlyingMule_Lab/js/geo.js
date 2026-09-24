'use strict';
/* Geometry, units and small helpers for AutoFlyingMule Lab.
   The world is lat/lon (from the FMC database). Distances are nautical miles, altitudes feet, speeds knots.
   Internally the airplane's heading/track are TRUE; everything the pilot sees (MCP, PFD, ND) is MAGNETIC. */
const D2R=Math.PI/180, clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const wrap180=a=>((a%360)+540)%360-180, wrap360=a=>((a%360)+360)%360;
const FS="'B612',system-ui,sans-serif", FM="'B612 Mono',ui-monospace,monospace";
const C={grn:'#2fe27f',cyn:'#41d3ea',mag:'#ff4fe0',amb:'#f4b73a',red:'#f0524f',wht:'#f4f6f8'};
const $q=s=>document.querySelector(s), $$q=s=>[...document.querySelectorAll(s)];

/* local tangent-plane offsets (east, north) in NM of p relative to ref */
function llXY(p,ref){ return {x:(p.lon-ref.lon)*60*Math.cos(ref.lat*D2R), y:(p.lat-ref.lat)*60}; }
function xyMove(p,eastNm,northNm){ p.lat+=northNm/60; p.lon+=eastNm/(60*Math.cos(p.lat*D2R)); }
function magVarAt(p,altFt){ try{ return FMC_MAGVAR(p.lat,p.lon,altFt||0); }catch(err){ return 0; } }
const toMag=(trueDeg,mv)=>wrap360(trueDeg-mv), toTrue=(magDeg,mv)=>wrap360(magDeg+mv);

/* atmosphere-lite (ISA-ish), used for IAS/TAS/Mach conversions */
const tasOf=(ias,alt)=>ias*(1+alt/1000*0.019);
const iasOf=(tas,alt)=>tas/(1+alt/1000*0.019);
const sonic=alt=>661-alt*0.00245;
const machOf=(ias,alt)=>tasOf(ias,alt)/sonic(alt);
const iasOfMach=(m,alt)=>iasOf(m*sonic(alt),alt);
const fmtH=v=>String(Math.round(v)%360===0?360:Math.round(v)%360).padStart(3,'0');
const fmtZ=min=>{ const t=((min%1440)+1440)%1440, hh=Math.floor(t/60), mm=Math.floor(t%60); return String(hh).padStart(2,'0')+String(mm).padStart(2,'0')+'Z'; };
