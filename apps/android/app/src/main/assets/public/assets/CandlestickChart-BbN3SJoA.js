import{j as H}from"./index-BhRxU7_j.js";import{r as X}from"./icons-vendor-BJq6mJDH.js";import{V as Ye,I as Ze,c as Xe,d as Ie}from"./charts-vendor-DsHS2P-u.js";const J={basisType:"ALMA",basisLen:3,useRes:!0,intRes:4,offsetSigma:5,offsetALMA:.85,delayOffset:0,tradeType:"BOTH",useAtr1:!1,useAtr2:!1,useVol:!1,useEmaRsi:!1,useEma200:!0,useAdx:!0,adxVariant:"ORIGINAL",adxThreshold:18,useRsiCustom:!1,useBb:!1,useDemaAtr:!0,haCandles:!0,periodDema:7,periodAtr:14,factorAtr:1.5,tp1Pct:1.4,tp2Pct:2.8,tp3Pct:4.5,useTrail:!0,trailPct:1.2,trailAfterTp1:!0,beAfterTp1:!0,mainRibbonLen:180};function ot(e){if(!e)return{...J};const o=e;return Number(o.intRes)===18&&Number(o.basisLen)===2&&o.useEma200===!1&&o.useAdx===!1&&Number(o.adxThreshold)===25&&Number(o.factorAtr)===1.7&&Number(o.tp1Pct)===1.5&&Number(o.trailPct)===2?{...J}:{...J,...e,basisLen:Math.max(1,Number(o.basisLen??J.basisLen)),intRes:Math.max(1,Number(o.intRes??J.intRes)),offsetSigma:Math.max(1,Number(o.offsetSigma??J.offsetSigma)),offsetALMA:Number(o.offsetALMA??J.offsetALMA),delayOffset:Math.max(0,Number(o.delayOffset??J.delayOffset)),tp1Pct:Number(o.tp1Pct??J.tp1Pct),tp2Pct:Number(o.tp2Pct??J.tp2Pct),tp3Pct:Number(o.tp3Pct??J.tp3Pct),trailPct:Number(o.trailPct??J.trailPct),mainRibbonLen:Math.max(21,Number(o.mainRibbonLen??J.mainRibbonLen))}}function re(e,o){const l=Math.max(1,Math.round(o)),t=new Array(e.length).fill(NaN),n=l*(l+1)/2;for(let r=l-1;r<e.length;r++){let i=0;for(let a=0;a<l;a++)i+=(e[r-l+1+a]??0)*(a+1);t[r]=i/n}return t}function Je(e,o){const l=z(e,o),t=l.map((r,i)=>Number.isFinite(r)?r:e[i]??0),n=z(t,o);return l.map((r,i)=>Number.isFinite(r)&&Number.isFinite(n[i])?2*r-n[i]:NaN)}function nt(e,o){const l=z(e,o),t=l.map((a,s)=>Number.isFinite(a)?a:e[s]??0),n=z(t,o),r=n.map((a,s)=>Number.isFinite(a)?a:t[s]??0),i=z(r,o);return l.map((a,s)=>Number.isFinite(a)&&Number.isFinite(n[s])&&Number.isFinite(i[s])?3*(a-n[s])+i[s]:NaN)}function it(e,o,l){const t=Math.max(1,Math.round(l)),n=e.map((a,s)=>a*(o[s]??1)),r=Q(n,t),i=Q(o,t);return r.map((a,s)=>Number.isFinite(a)&&(i[s]??0)>0?a/i[s]:NaN)}function Oe(e,o){const l=Math.max(1,Math.round(o)),t=new Array(e.length).fill(NaN),n=Q(e,l);for(let r=0;r<e.length;r++)r<l-1||(r===l-1||!Number.isFinite(t[r-1])?t[r]=n[r]??e[r]??0:t[r]=(t[r-1]*(l-1)+(e[r]??0))/l);return t}function rt(e,o){const l=Math.max(2,Math.round(o)),t=re(e,Math.max(1,Math.round(l/2))),n=re(e,l),r=e.map((i,a)=>Number.isFinite(t[a])&&Number.isFinite(n[a])?2*t[a]-n[a]:e[a]??0);return re(r,Math.max(1,Math.round(Math.sqrt(l))))}function lt(e,o,l=0){const t=Math.max(2,Math.round(o)),n=new Array(e.length).fill(NaN);for(let r=t-1;r<e.length;r++){let i=0,a=0,s=0,h=0;for(let u=0;u<t;u++){const b=e[r-t+1+u]??0;i+=u,a+=b,s+=u*b,h+=u*u}const c=t*h-i*i,f=c===0?0:(t*s-i*a)/c,d=(a-f*i)/t;n[r]=d+f*(t-1-l)}return n}function et(e,o,l=.85,t=6){const n=Math.max(1,Math.round(o)),r=new Array(e.length).fill(NaN);if(n===1)return[...e];const i=Math.max(.1,t),a=l*(n-1),s=n/i,h=new Array(n);let c=0;for(let f=0;f<n;f++){const d=Math.exp(-((f-a)*(f-a))/(2*s*s));h[f]=d,c+=d}for(let f=n-1;f<e.length;f++){let d=0;for(let u=0;u<n;u++)d+=(e[f-n+1+u]??0)*h[u];r[f]=c>0?d/c:e[f]}return r}function at(e,o){const l=Math.max(2,Math.round(o)),t=new Array(e.length).fill(0),n=Math.exp(-1.414*Math.PI/l),i=2*n*Math.cos(1.414*Math.PI/l),a=-n*n,s=1-i-a;for(let h=0;h<e.length;h++){const c=e[h]??0,f=e[Math.max(0,h-1)]??c,d=t[Math.max(0,h-1)]??c,u=t[Math.max(0,h-2)]??c;t[h]=h<2?c:s*((c+f)/2)+i*d+a*u}return t}function Ee(e,o,l,t=5,n=.85,r){switch(e){case"EMA":return z(o,l);case"DEMA":return Je(o,l);case"TEMA":return nt(o,l);case"WMA":return re(o,l);case"VWMA":return it(o,r??o.map(()=>1),l);case"SMMA":return Oe(o,l);case"HullMA":return rt(o,l);case"LSMA":return lt(o,l,t);case"ALMA":return et(o,l,n,t);case"TMA":{const i=Q(o,l);return Q(i.map((a,s)=>Number.isFinite(a)?a:o[s]??0),l)}case"SSMA":return at(o,l);case"SMA":default:return Q(o,l)}}function st(e){const o=[];for(let l=0;l<e.length;l++){const t=e[l],n=(t.open+t.high+t.low+t.close)/4,r=l===0?(t.open+t.close)/2:(o[l-1].open+o[l-1].close)/2,i=Math.max(t.high,r,n),a=Math.min(t.low,r,n);o.push({timestamp:t.timestamp,open:r,high:i,low:a,close:n,volume:t.volume})}return o}function ct(e,o={}){if(!e.length)return[];const t=(o.haCandles!==!1?st(e):e).map(b=>b.close),n=Je(t,o.periodDema??7),r=Ve(e,o.periodAtr??14),i=o.factorAtr??1.5,a=[],s=Number.isFinite(n[0])?n[0]:t[0],h=Number.isFinite(r[0])?r[0]:s*.006;let c=s+h*i,f=s-h*i,d=s,u="BULL";for(let b=0;b<e.length;b++){const M=Number.isFinite(n[b])?n[b]:t[b],T=(Number.isFinite(r[b])?r[b]:M*.006)*i,V=M+T,E=M-T,I=b===0||V<c||d>c?V:c,U=b===0||E>f||d<f?E:f;b>0&&(u==="BEAR"&&M>c?u="BULL":u==="BULL"&&M<f&&(u="BEAR"));const le=u==="BULL"?U:I;c=I,f=U,d=M,a.push({time:Math.floor(e[b].timestamp/1e3),value:le,trend:u})}return a}function ht(e,o={}){if(e.length<15)return{bands:[],series:[],bullCross:!1,bearCross:!1};const l=1.61803398875,t=Math.max(21,Math.min(o.mainLen??180,Math.floor(e.length*.85))),n=o.offsetAlma??.85,r=o.sigmaAlma??6,i=e.map(T=>T.close),a=[t];for(let T=1;T<8;T++)a.push(Math.max(3,Math.round(a[T-1]/l)));const s=a.map(T=>et(i,T,n,r)),h=["#22c55e","#10b981","#14b8a6","#06b6d4","#3b82f6","#6366f1","#a855f7","#ec4899"],c=s.map((T,V)=>({label:`ALMA #${V+1} (${a[V]})`,color:h[V]??"#3b82f6",points:T.map((E,I)=>({time:Math.floor(e[I].timestamp/1e3),value:E})).filter(E=>Number.isFinite(E.value))})),f=s[7],d=s[6],u=e.length-1,b=Math.max(0,u-1),M=Number.isFinite(f[u])&&Number.isFinite(d[u])&&f[b]<=d[b]&&f[u]>d[u],L=Number.isFinite(f[u])&&Number.isFinite(d[u])&&f[b]>=d[b]&&f[u]<d[u];return{bands:c,series:s,bullCross:M,bearCross:L}}function ft(e,o,l,t){const n=e.length,r=new Array(n).fill(20);if(n<o+5)return r;let i=0,a=0,s=0;const h=new Array(n).fill(0);for(let f=1;f<n;f++){const d=e[f],u=e[f-1],b=Math.max(d.high-d.low,Math.abs(d.high-u.close),Math.abs(d.low-u.close)),M=d.high-u.high>u.low-d.low?Math.max(d.high-u.high,0):0,L=u.low-d.low>d.high-u.high?Math.max(u.low-d.low,0):0;i=i-i/o+b,a=a-a/o+M,s=s-s/o+L;const T=i>0?a/i*100:0,V=i>0?s/i*100:0,E=T+V;h[f]=E>0?Math.abs(T-V)/E*100:0}return t==="MASANAKAMURA"?Q(h,o).map(d=>Number.isFinite(d)?d:20):Oe(h,l).map(f=>Number.isFinite(f)?f:20)}function dt(e){return{"1m":6e4,"3m":18e4,"5m":3e5,"15m":9e5,"30m":18e5,"1h":36e5,"2h":72e5,"4h":144e5,"1d":864e5,"1w":6048e5}[e]??9e5}function xt(e,o="15m",l){var ue,pe;const t=ot(l);if(e.length<25)return{outputs:[],closeSeriesAlt:[],openSeriesAlt:[],demaAtr:[],almaRibbon:{bands:[],series:[],bullCross:!1,bearCross:!1},markers:[]};const n=dt(o),r=t.delayOffset,i=e.map((w,m)=>e[Math.max(0,m-r)].close),a=e.map((w,m)=>e[Math.max(0,m-r)].open),s=e.map(w=>w.volume),h=Ee(t.basisType,i,t.basisLen,t.offsetSigma,t.offsetALMA,s),c=Ee(t.basisType,a,t.basisLen,t.offsetSigma,t.offsetALMA,s);let f=[...h],d=[...c];if(t.useRes&&t.intRes>1){const w=Math.min(t.intRes,Math.max(2,Math.floor(e.length/Math.max(4,t.basisLen+2)))),m=[];for(let B=0;B+w-1<e.length;B+=w){const S=B+w-1;let y=0;for(let q=B;q<=S;q++)y+=e[q].volume;m.push({closeTimeIdx:S,open:e[Math.max(0,B-r)].open,close:e[Math.max(0,S-r)].close,volume:y})}if(m.length>=t.basisLen+1){const B=m.map(k=>k.open),S=m.map(k=>k.close),y=m.map(k=>k.volume),q=Ee(t.basisType,S,t.basisLen,t.offsetSigma,t.offsetALMA,y),F=Ee(t.basisType,B,t.basisLen,t.offsetSigma,t.offsetALMA,y);let R=-1;for(let k=0;k<e.length;k++){for(;R+1<m.length&&m[R+1].closeTimeIdx<=k;)R++;R>=0&&Number.isFinite(q[R])&&Number.isFinite(F[R])&&(f[k]=q[R],d[k]=F[R])}}}const u=e.map(w=>w.close),b=Ve(e,14),M=tt(u,14),L=z(M.map(w=>Number.isFinite(w)?w:50),20),T=z(u,20),V=z(u,Math.min(200,Math.max(20,Math.floor(e.length*.7)))),E=Q(s,14),I=mt(u,20,2),U=ft(e,14,14,t.adxVariant),le=ct(e,{haCandles:t.haCandles,periodDema:t.periodDema,periodAtr:t.periodAtr,factorAtr:t.factorAtr}),ne=ht(e,{mainLen:t.mainRibbonLen,offsetAlma:t.offsetALMA,sigmaAlma:6}),ve=u.map((w,m)=>m>0?Math.max(w-u[m-1],0):0),he=u.map((w,m)=>m>0?Math.max(u[m-1]-w,0):0),De=z(ve,14),ke=z(he,14),Fe=u.map((w,m)=>{const B=De[m]??1,S=ke[m]??1;return!Number.isFinite(B)||!Number.isFinite(S)||S<=0?50:100-100/(1+B/S)}),Le=z(Fe,30),fe=[],de=[],me=[],ae=[];for(let w=0;w<e.length;w++){const m=e[w],B=Math.floor(m.timestamp/1e3),S=f[w],y=d[w],q=w>0?f[w-1]:S,F=w>0?d[w-1]:y;Number.isFinite(S)&&Number.isFinite(y)&&(de.push({time:B,value:S}),me.push({time:B,value:y}));const R=Number.isFinite(b[w])?b[w]:m.close*.008,k=Number.isFinite(M[w])?M[w]:50,ge=le[w],se=w>1&&Number.isFinite(S)&&Number.isFinite(y)&&Number.isFinite(q)&&Number.isFinite(F)&&q<=F&&S>y,ee=w>1&&Number.isFinite(S)&&Number.isFinite(y)&&Number.isFinite(q)&&Number.isFinite(F)&&q>=F&&S<y;let G=se&&(t.tradeType==="BOTH"||t.tradeType==="LONG"),W=ee&&(t.tradeType==="BOTH"||t.tradeType==="SHORT");if(t.useAtr1&&w>=20){const v=b.slice(w-19,w+1).filter(Number.isFinite),K=v.length?Math.max(...v):R,ce=v.length?Math.min(...v):R,Ae=K>ce?(R-ce)/(K-ce):.5;Ae<=.2&&(G=!1),Ae<=.5&&(W=!1)}if(t.useAtr2&&w>=2){const v=b[w-2];Number.isFinite(v)&&!(R>v)&&(G=!1,W=!1)}if(t.useVol&&Number.isFinite(E[w])&&(m.volume>E[w]*1.5||(G=!1,W=!1)),t.useEmaRsi){const v=T[w]??m.close,K=L[w]??50;m.close>v&&k>60&&k>K||(G=!1),m.close<v&&k<40&&k<K||(W=!1)}if(t.useEma200){const v=V[w],K=V[Math.max(0,w-4)];Number.isFinite(v)&&(m.close>v&&(!Number.isFinite(K)||v>=K*.9995)||(G=!1),m.close<v&&(!Number.isFinite(K)||v<=K*1.0005)||(W=!1))}if(t.useAdx&&w>=1&&U[w]<t.adxThreshold&&(G=!1,W=!1),t.useRsiCustom){const v=Fe[w]??50,K=Le[w]??50;v>50||v>K||(G=!1),v<50||v<K||(W=!1)}t.useBb&&w>=1&&(Number.isFinite(I.upper[w])&&Number.isFinite(I.upper[w-1])&&!(I.upper[w]>I.upper[w-1])&&(G=!1),Number.isFinite(I.lower[w])&&Number.isFinite(I.lower[w-1])&&!(I.lower[w]<I.lower[w-1])&&(W=!1)),t.useDemaAtr&&ge&&(ge.trend!=="BULL"&&(G=!1),ge.trend!=="BEAR"&&(W=!1));const O=(ue=ne.series[7])==null?void 0:ue[w],te=(pe=ne.series[3])==null?void 0:pe[w],be=T[w]??m.close;Number.isFinite(O)&&Number.isFinite(te)&&(G&&O<te*.9985&&(G=!1),W&&O>te*1.0015&&(W=!1)),G&&(k>68||m.close-be>R*1.6)&&(G=!1),W&&(k<32||be-m.close>R*1.6)&&(W=!1);const Y=G?"LONG":W?"SHORT":"NONE",Te=Number.isFinite(S)&&Number.isFinite(y)?S>y?"BULLISH":S<y?"BEARISH":"NEUTRAL":"NEUTRAL",ie=Math.max(R*1.8,m.close*.0055),we=Math.max(ie*1.2,m.close*(t.tp1Pct/100)),xe=Math.max(ie*2.2,m.close*(t.tp2Pct/100)),Me=Math.max(ie*3.5,m.close*(t.tp3Pct/100)),_e=Y==="LONG"?m.close+we:Y==="SHORT"?m.close-we:void 0,Ce=Y==="LONG"?m.close+xe:Y==="SHORT"?m.close-xe:void 0,Be=Y==="LONG"?m.close+Me:Y==="SHORT"?m.close-Me:void 0,Pe=Y==="LONG"?m.close-ie:Y==="SHORT"?m.close+ie:void 0;Y==="LONG"?ae.push({time:B,position:"belowBar",color:"#27cd86",shape:"arrowUp",text:"خرید / BUY"}):Y==="SHORT"&&ae.push({time:B,position:"aboveBar",color:"#eb493d",shape:"arrowDown",text:"فروش / SELL"}),fe.push({timestamp:m.timestamp,closeTime:m.timestamp+n,trend:Te,signal:Y,reason:Y!=="NONE"?`KIYA BOT v11 (${t.basisType} HTF×${t.intRes}${t.useDemaAtr?" + DEMA ATR":""})`:"No crossover",price:m.close,atr:R,rsi:k,stopLoss:Pe,tp1:_e,tp2:Ce,tp3:Be})}return{outputs:fe,closeSeriesAlt:de,openSeriesAlt:me,demaAtr:le,almaRibbon:ne,markers:ae}}function Mt(e,o){const t=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((h,c)=>({dayIndex:c,dayName:h,openedTotal:0,openedWins:0,openedLosses:0,openedWinRate:0,closedTotal:0,closedWins:0,closedLosses:0,closedWinRate:0})),n=new Map;let r=o;const i=new Map,a=new Map;for(const h of e){const c=h.pnlUsd>0,f=new Date(h.entryTime).getUTCDay(),d=new Date(h.exitTime).getUTCDay(),u=t[f];u.openedTotal++,c?u.openedWins++:u.openedLosses++;const b=t[d];b.closedTotal++,c?b.closedWins++:b.closedLosses++;const M=new Date(h.exitTime),L=M.getUTCFullYear(),T=M.getUTCMonth()+1,V=`${L}-${T}`;i.has(L)||i.set(L,Math.max(1,r)),a.has(V)||a.set(V,Math.max(1,r)),n.has(L)||n.set(L,new Map);const E=n.get(L);E.set(T,(E.get(T)??0)+h.pnlUsd),r+=h.pnlUsd}for(const h of t)h.openedWinRate=h.openedTotal>0?Number((h.openedWins/h.openedTotal*100).toFixed(1)):0,h.closedWinRate=h.closedTotal>0?Number((h.closedWins/h.closedTotal*100).toFixed(1)):0;const s=[];for(const[h,c]of[...n.entries()].sort((f,d)=>f[0]-d[0])){const f={};let d=0;for(let b=1;b<=12;b++){const M=c.get(b)??0;d+=M;const L=a.get(`${h}-${b}`)??Math.max(1,o);f[b]=c.has(b)?Number((M/L*100).toFixed(2)):0}const u=i.get(h)??Math.max(1,o);s.push({year:h,months:f,yearPct:Number((d/u*100).toFixed(2))})}return{monthlyBreakdown:s,dayOfWeekStats:t}}function Q(e,o){const l=new Array(e.length).fill(NaN);if(o<=0)return l;let t=0;for(let n=0;n<e.length;n++)t+=e[n]??0,n>=o&&(t-=e[n-o]??0),n>=o-1&&(l[n]=t/o);return l}function z(e,o){const l=new Array(e.length).fill(NaN);if(o<=0||e.length<o)return l;const t=2/(o+1);let n=0;for(let i=0;i<o;i++)n+=e[i]??0;let r=n/o;l[o-1]=r;for(let i=o;i<e.length;i++)r=((e[i]??r)-r)*t+r,l[i]=r;return l}function Re(e,o){const l=new Array(e.length).fill(NaN);if(o<=0||e.length<o)return l;const t=1/o;let n=0;for(let i=0;i<o;i++)n+=e[i]??0;let r=n/o;l[o-1]=r;for(let i=o;i<e.length;i++){const a=e[i]??r;r=t*a+(1-t)*r,l[i]=r}return l}function At(e,o){const l=new Array(e.length).fill(NaN);if(o<2||e.length<o)return l;const t=Math.max(1,Math.floor(o/2)),n=Math.max(1,Math.round(Math.sqrt(o))),r=re(e,t),i=re(e,o),a=e.map((c,f)=>Number.isFinite(r[f])&&Number.isFinite(i[f])?2*r[f]-i[f]:NaN),s=a.findIndex(c=>Number.isFinite(c));if(s<0)return l;const h=re(a.slice(s),n);for(let c=0;c<h.length;c++)l[s+c]=h[c];return l}function Nt(e){const o=new Array(e.length).fill(NaN);let l=0,t=0,n=-1;for(let r=0;r<e.length;r++){const i=e[r],a=Math.floor(i.timestamp/864e5);a!==n&&(n=a,l=0,t=0);const s=(i.high+i.low+i.close)/3,h=Math.max(1e-4,i.volume);l+=s*h,t+=h,o[r]=t>0?l/t:s}return o}function tt(e,o=14){const l=new Array(e.length).fill(NaN);if(e.length<=o)return l;let t=0,n=0;for(let r=1;r<=o;r++){const i=(e[r]??0)-(e[r-1]??0);i>=0?t+=i:n+=Math.abs(i)}t/=o,n/=o,l[o]=n===0?100:100-100/(1+t/n);for(let r=o+1;r<e.length;r++){const i=(e[r]??0)-(e[r-1]??0),a=i>0?i:0,s=i<0?Math.abs(i):0;t=(t*(o-1)+a)/o,n=(n*(o-1)+s)/o,l[r]=n===0?100:100-100/(1+t/n)}return l}function St(e,o=12,l=26,t=9){const n=z(e,o),r=z(e,l),i=e.map((c,f)=>Number.isFinite(n[f])&&Number.isFinite(r[f])?n[f]-r[f]:NaN),a=i.findIndex(c=>Number.isFinite(c)),s=new Array(e.length).fill(NaN),h=new Array(e.length).fill(NaN);if(a>=0){const c=z(i.slice(a),t);for(let f=0;f<c.length;f++){const d=a+f;s[d]=c[f],Number.isFinite(s[d])&&Number.isFinite(i[d])&&(h[d]=i[d]-s[d])}}return{line:i,signal:s,histogram:h}}function yt(e,o=14,l=3,t=3){const n=new Array(e.length).fill(NaN);for(let s=o-1;s<e.length;s++){let h=-1/0,c=1/0;for(let d=s-o+1;d<=s;d++)h=Math.max(h,e[d].high),c=Math.min(c,e[d].low);const f=h-c;n[s]=f>0?(e[s].close-c)/f*100:50}const r=n.findIndex(s=>Number.isFinite(s)),i=new Array(e.length).fill(NaN),a=new Array(e.length).fill(NaN);if(r>=0){const s=Q(n.slice(r),l);for(let c=0;c<s.length;c++)i[r+c]=s[c];const h=i.findIndex(c=>Number.isFinite(c));if(h>=0){const c=Q(i.slice(h),t);for(let f=0;f<c.length;f++)a[h+f]=c[f]}}return{k:i,d:a}}function Ft(e,o=14,l=14,t=3,n=3){const r=tt(e,o),i=new Array(e.length).fill(NaN);for(let c=l-1;c<e.length;c++){let f=-1/0,d=1/0,u=!0;for(let b=c-l+1;b<=c;b++){if(!Number.isFinite(r[b])){u=!1;break}f=Math.max(f,r[b]),d=Math.min(d,r[b])}if(u){const b=f-d;i[c]=b>0?(r[c]-d)/b*100:50}}const a=i.findIndex(c=>Number.isFinite(c)),s=new Array(e.length).fill(NaN),h=new Array(e.length).fill(NaN);if(a>=0){const c=Q(i.slice(a),t);for(let d=0;d<c.length;d++)s[a+d]=c[d];const f=s.findIndex(d=>Number.isFinite(d));if(f>=0){const d=Q(s.slice(f),n);for(let u=0;u<d.length;u++)h[f+u]=d[u]}}return{k:s,d:h}}function Ve(e,o=14){const l=new Array(e.length).fill(NaN);if(e.length<=o)return l;const t=new Array(e.length).fill(0);for(let i=0;i<e.length;i++){const a=e[i];if(i===0)t[i]=a.high-a.low;else{const s=e[i-1].close;t[i]=Math.max(a.high-a.low,Math.abs(a.high-s),Math.abs(a.low-s))}}let n=0;for(let i=1;i<=o;i++)n+=t[i]??0;let r=n/o;l[o]=r;for(let i=o+1;i<e.length;i++)r=(r*(o-1)+(t[i]??0))/o,l[i]=r;return l}function Lt(e,o=14,l=14){const t=e.length,n=new Array(t).fill(NaN),r=new Array(t).fill(NaN),i=new Array(t).fill(NaN);if(t<=o*2)return{adx:i,plusDI:n,minusDI:r};const a=new Array(t).fill(0),s=new Array(t).fill(0),h=new Array(t).fill(0);for(let M=1;M<t;M++){const L=e[M],T=e[M-1];a[M]=Math.max(L.high-L.low,Math.abs(L.high-T.close),Math.abs(L.low-T.close));const V=L.high-T.high,E=T.low-L.low;s[M]=V>E&&V>0?V:0,h[M]=E>V&&E>0?E:0}const c=Re(a.slice(1),o),f=Re(s.slice(1),o),d=Re(h.slice(1),o),u=new Array(t).fill(NaN);for(let M=1;M<t;M++){const L=c[M-1],T=f[M-1],V=d[M-1];if(Number.isFinite(L)&&L>0&&Number.isFinite(T)&&Number.isFinite(V)){const E=100*T/L,I=100*V/L;n[M]=E,r[M]=I;const U=E+I;u[M]=U>0?100*Math.abs(E-I)/U:0}}const b=u.findIndex(M=>Number.isFinite(M));if(b>=0){const M=Re(u.slice(b),l);for(let L=0;L<M.length;L++)i[b+L]=M[L]}return{adx:i,plusDI:n,minusDI:r}}function mt(e,o=20,l=2){const t=Q(e,o),n=new Array(e.length).fill(NaN),r=new Array(e.length).fill(NaN);for(let i=o-1;i<e.length;i++){const a=t[i];let s=0;for(let c=i-o+1;c<=i;c++){const f=(e[c]??a)-a;s+=f*f}const h=Math.sqrt(s/o);n[i]=a+l*h,r[i]=a-l*h}return{upper:n,mid:t,lower:r}}function Tt(e,o=20,l=1.5,t=10){const n=e.map(h=>h.close),r=z(n,o),i=Ve(e,t),a=e.map((h,c)=>Number.isFinite(r[c])&&Number.isFinite(i[c])?r[c]+l*i[c]:NaN),s=e.map((h,c)=>Number.isFinite(r[c])&&Number.isFinite(i[c])?r[c]-l*i[c]:NaN);return{upper:a,mid:r,lower:s}}function _t(e,o=20){const l=new Array(e.length).fill(NaN),t=new Array(e.length).fill(NaN),n=new Array(e.length).fill(NaN);for(let r=o-1;r<e.length;r++){let i=-1/0,a=1/0;for(let s=r-o+1;s<=r;s++)i=Math.max(i,e[s].high),a=Math.min(a,e[s].low);l[r]=i,t[r]=a,n[r]=(i+a)/2}return{upper:l,mid:n,lower:t}}function Ct(e,o=3,l=10){const t=e.length,n=new Array(t).fill(NaN),r=new Array(t).fill(1),i=Ve(e,l);let a=NaN,s=NaN,h=1;for(let c=0;c<t;c++){if(!Number.isFinite(i[c]))continue;const f=e[c],d=(f.high+f.low)/2,u=d+o*i[c],b=d-o*i[c];if(!Number.isFinite(a)||!Number.isFinite(s))a=u,s=b,h=f.close>=d?1:-1;else{const M=e[c-1].close;s=b>s||M<s?b:s,a=u<a||M>a?u:a,h===1&&f.close<s?h=-1:h===-1&&f.close>a&&(h=1)}r[c]=h,n[c]=h===1?s:a}return{line:n,direction:r}}function Bt(e,o=9,l=26,t=52){const n=(h,c)=>{if(h<c-1)return NaN;let f=-1/0,d=1/0;for(let u=h-c+1;u<=h;u++)f=Math.max(f,e[u].high),d=Math.min(d,e[u].low);return(f+d)/2},r=e.map((h,c)=>n(c,o)),i=e.map((h,c)=>n(c,l)),a=e.map((h,c)=>Number.isFinite(r[c])&&Number.isFinite(i[c])?(r[c]+i[c])/2:NaN),s=e.map((h,c)=>n(c,t));return{tenkan:r,kijun:i,spanA:a,spanB:s}}function Pt(e,o=20){const l=e.map(r=>(r.high+r.low+r.close)/3),t=Q(l,o),n=new Array(e.length).fill(NaN);for(let r=o-1;r<e.length;r++){const i=t[r];let a=0;for(let h=r-o+1;h<=r;h++)a+=Math.abs(l[h]-i);const s=a/o;n[r]=s>0?(l[r]-i)/(.015*s):0}return n}function Et(e,o=14){const l=new Array(e.length).fill(NaN);if(e.length<=o)return l;const t=e.map(n=>(n.high+n.low+n.close)/3);for(let n=o;n<e.length;n++){let r=0,i=0;for(let a=n-o+1;a<=n;a++){const s=t[a]*Math.max(1e-4,e[a].volume);t[a]>t[a-1]?r+=s:t[a]<t[a-1]&&(i+=s)}i===0?l[n]=100:l[n]=100-100/(1+r/i)}return l}function Rt(e){const o=new Array(e.length).fill(0);for(let l=1;l<e.length;l++){const t=e[l],n=e[l-1];t.close>n.close?o[l]=o[l-1]+t.volume:t.close<n.close?o[l]=o[l-1]-t.volume:o[l]=o[l-1]}return o}function Vt(e,o=.02,l=.2){const t=e.length,n=new Array(t).fill(NaN);if(t<3)return n;let r=e[1].close>=e[0].close,i=o,a=r?e[1].high:e[1].low,s=r?e[0].low:e[0].high;n[1]=s;for(let h=2;h<t;h++){const c=e[h];s=s+i*(a-s),r?(s=Math.min(s,e[h-1].low,e[h-2].low),c.low<s?(r=!1,s=a,a=c.low,i=o):c.high>a&&(a=c.high,i=Math.min(l,i+o))):(s=Math.max(s,e[h-1].high,e[h-2].high),c.high>s?(r=!0,s=a,a=c.high,i=o):c.low<a&&(a=c.low,i=Math.min(l,i+o))),n[h]=s}return n}function vt(e,o=14){const l=new Array(e.length).fill(NaN);for(let t=o-1;t<e.length;t++){let n=-1/0,r=1/0;for(let a=t-o+1;a<=t;a++)n=Math.max(n,e[a].high),r=Math.min(r,e[a].low);const i=n-r;l[t]=i>0?(n-e[t].close)/i*-100:-50}return l}function Dt(e,o=9){const l=new Array(e.length).fill(NaN);for(let t=o;t<e.length;t++){const n=e[t-o]??0;l[t]=n!==0?((e[t]??0)-n)/n*100:0}return l}function kt(e,o,l){const t=(e+o+l)/3,n=2*t-o,r=2*t-e,i=t+(e-o),a=t-(e-o),s=e+2*(t-o),h=o-2*(e-t);return{pp:t,r1:n,r2:i,r3:s,s1:r,s2:a,s3:h}}function It(e,o=3,l=2){var a,s;const t=new Array(e.length).fill(NaN),n=new Array(e.length).fill(NaN);let r=NaN,i=NaN;for(let h=o+l;h<e.length;h++){const c=h-l,f=e[c];let d=!0,u=!0;for(let b=c-o;b<=h;b++)b!==c&&((((a=e[b])==null?void 0:a.high)??-1/0)>=f.high&&(d=!1),(((s=e[b])==null?void 0:s.low)??1/0)<=f.low&&(u=!1));d&&(r=f.high),u&&(i=f.low),t[h]=r,n[h]=i}return{confirmedHighs:t,confirmedLows:n}}const ut=new Map;function Ut(e){return ut.get(e)}const Wt=[{id:"pine_smc_orderblocks_hud",nameFa:"Pine v5: اسمارت مانی (SMC Order Blocks + FVG + Box/Label/Line/Table)",nameEn:"Pine v5: SMC Order Blocks + FVG + Full TV Graphics",descriptionFa:"نمونه کامل Pine Script v5 با رسم باکس‌های Order Block و FVG، خطوط BOS، لیبل‌ها و جدول HUD زنده روی چارت.",descriptionEn:"Full TradingView Pine v5 showcase using box.new, line.new, label.new, table.new, pivot structure & fill clouds.",language:"pine",category:"Smart Money v5",code:`//@version=5
strategy("SMC Order Blocks + FVG + TV HUD", overlay=true)

swingLen = input.int(5, title="Swing Pivot Length")
emaFast = ta.ema(close, 21)
emaSlow = ta.ema(close, 55)
rsiVal = ta.rsi(close, 14)
atrVal = ta.atr(14)

pFast = plot(emaFast, title="EMA 21", color=color.aqua, linewidth=2)
pSlow = plot(emaSlow, title="EMA 55", color=color.orange, linewidth=2)
fill(pFast, pSlow, color=emaFast >= emaSlow ? color.new(color.green, 84) : color.new(color.red, 84))

ph = ta.pivothigh(high, swingLen, swingLen)
pl = ta.pivotlow(low, swingLen, swingLen)

var float lastSwingHigh = na
var float lastSwingLow = na
var box bullOb = na
var box bearOb = na

if not na(ph)
    lastSwingHigh := ph
    label.new(bar_index - swingLen, ph, text="SH", style=label.style_label_down, color=color.new(color.red, 20), textcolor=color.white)

if not na(pl)
    lastSwingLow := pl
    label.new(bar_index - swingLen, pl, text="SL", style=label.style_label_up, color=color.new(color.green, 20), textcolor=color.white)

bullFvg = low > high[2] and (low - high[2]) > atrVal * 0.25
bearFvg = high < low[2] and (low[2] - high) > atrVal * 0.25

if bullFvg
    box.new(left=bar_index - 2, top=low, right=bar_index + 10, bottom=high[2], border_color=color.new(color.lime, 40), bgcolor=color.new(color.lime, 86), text="FVG+")

if bearFvg
    box.new(left=bar_index - 2, top=low[2], right=bar_index + 10, bottom=high, border_color=color.new(color.rose, 40), bgcolor=color.new(color.rose, 86), text="FVG-")

bosBull = not na(lastSwingHigh) and ta.crossover(close, lastSwingHigh)
bosBear = not na(lastSwingLow) and ta.crossunder(close, lastSwingLow)

if bosBull
    line.new(bar_index - 8, lastSwingHigh, bar_index + 2, lastSwingHigh, color=color.lime, style=line.style_dashed, width=2)
    label.new(bar_index, high + atrVal * 0.4, text="BOS ▲", style=label.style_label_down, color=color.lime, textcolor=color.black)
    bullOb := box.new(left=bar_index - 3, top=high[2], right=bar_index + 14, bottom=low[2], border_color=color.aqua, bgcolor=color.new(color.aqua, 84), text="Bull OB")

if bosBear
    line.new(bar_index - 8, lastSwingLow, bar_index + 2, lastSwingLow, color=color.red, style=line.style_dashed, width=2)
    label.new(bar_index, low - atrVal * 0.4, text="BOS ▼", style=label.style_label_up, color=color.red, textcolor=color.white)
    bearOb := box.new(left=bar_index - 3, top=high[2], right=bar_index + 14, bottom=low[2], border_color=color.orange, bgcolor=color.new(color.orange, 84), text="Bear OB")

var table hud = table.new(position.top_right, 2, 4, bgcolor=color.new(color.black, 20), border_color=color.new(color.aqua, 60))
if barstate.islast
    table.cell(hud, 0, 0, "Dollarino SMC v5", text_color=color.aqua, bgcolor=color.new(color.blue, 65))
    table.cell(hud, 1, 0, "LIVE", text_color=color.lime, bgcolor=color.new(color.green, 75))
    table.cell(hud, 0, 1, "Trend EMA", text_color=color.silver)
    table.cell(hud, 1, 1, emaFast >= emaSlow ? "BULLISH" : "BEARISH", text_color=emaFast >= emaSlow ? color.lime : color.red)
    table.cell(hud, 0, 2, "RSI (14)", text_color=color.silver)
    table.cell(hud, 1, 2, str.tostring(rsiVal, "#.##"), text_color=color.yellow)
    table.cell(hud, 0, 3, "ATR (14)", text_color=color.silver)
    table.cell(hud, 1, 3, str.tostring(atrVal, "#.##"), text_color=color.white)

longCond = bosBull or (ta.crossover(emaFast, emaSlow) and rsiVal > 45)
shortCond = bosBear or (ta.crossunder(emaFast, emaSlow) and rsiVal < 55)
strategy.entry("SMC Long", strategy.long, when=longCond)
strategy.entry("SMC Short", strategy.short, when=shortCond)
`},{id:"pine_ema_rsi_momentum",nameFa:"Pine v5: تقاطع EMA 9/21 + ابر رنگی + RSI",nameEn:"Pine v5: EMA 9/21 Cross + Cloud Fill + RSI",descriptionFa:"اسکریپت استاندارد TradingView با رسم ابر EMA، رنگ پس‌زمینه روند و فیلتر مومنتوم RSI.",descriptionEn:"TradingView Pine v5 script plotting dual EMAs with trend fill cloud and RSI momentum confirmation.",language:"pine",category:"Trend Momentum",code:`//@version=5
strategy("Dollarino EMA 9/21 + RSI Momentum", overlay=true)

fastLen = input.int(9, title="Fast EMA")
slowLen = input.int(21, title="Slow EMA")
rsiLen = input.int(14, title="RSI Length")

emaFast = ta.ema(close, fastLen)
emaSlow = ta.ema(close, slowLen)
rsiVal = ta.rsi(close, rsiLen)

p1 = plot(emaFast, title="EMA 9", color=color.aqua, linewidth=2)
p2 = plot(emaSlow, title="EMA 21", color=color.yellow, linewidth=2)
fill(p1, p2, color=emaFast >= emaSlow ? color.new(color.aqua, 86) : color.new(color.red, 86))

longCond = ta.crossover(emaFast, emaSlow) and rsiVal > 48
shortCond = ta.crossunder(emaFast, emaSlow) and rsiVal < 52

bgcolor(longCond ? color.new(color.green, 82) : shortCond ? color.new(color.red, 82) : na)

strategy.entry("Long", strategy.long, when=longCond)
strategy.entry("Short", strategy.short, when=shortCond)
`},{id:"pine_bb_mean_reversion",nameFa:"Pine v5: برگشت از باندهای بولینگر + پرکردن کانال",nameEn:"Pine v5: Bollinger Mean Reversion + Channel Fill",descriptionFa:"شناسایی اشباع خرید و فروش روی باند بولینگر ۲۰ با رنگ‌آمیزی کانال و فیلتر RSI.",descriptionEn:"Mean-reversion entries at Bollinger Bands extremes with shaded band fill and RSI 14.",language:"pine",category:"Mean Reversion",code:`//@version=5
strategy("Bollinger + RSI Reversal", overlay=true)

len = input.int(20, title="BB Period")
mult = input.float(2.0, title="Multiplier")
[bbMid, bbUpper, bbLower] = ta.bb(close, len, mult)
rsiVal = ta.rsi(close, 14)

pU = plot(bbUpper, title="BB Upper", color=color.red)
pM = plot(bbMid, title="BB Basis", color=color.blue)
pL = plot(bbLower, title="BB Lower", color=color.green)
fill(pU, pL, color=color.new(color.blue, 90))

longCond = ta.crossover(close, bbLower) and rsiVal < 40
shortCond = ta.crossunder(close, bbUpper) and rsiVal > 60

strategy.entry("BB Long", strategy.long, when=longCond)
strategy.entry("BB Short", strategy.short, when=shortCond)
`},{id:"pine_supertrend_breakout",nameFa:"Pine v5: سوپرترند ATR + فیلتر تایم‌فریم بالاتر (MTF)",nameEn:"Pine v5: SuperTrend ATR + MTF EMA 200",descriptionFa:"تشخیص تغییر روند قطعی با سوپرترند و همسو کردن معاملات با request.security روی تایم‌فریم ۱ ساعته.",descriptionEn:"Captures SuperTrend flips filtered by higher-timeframe request.security EMA.",language:"pine",category:"Trend Following",code:`//@version=5
strategy("SuperTrend ATR + MTF EMA", overlay=true)

[stLine, stDir] = ta.supertrend(3.0, 10)
htfEma = request.security(syminfo.tickerid, "60", ta.ema(close, 50))

plot(stLine, title="SuperTrend", color=stDir > 0 ? color.lime : color.red, linewidth=2)
plot(htfEma, title="1H EMA 50", color=color.orange, linewidth=2)

longCond = stDir > 0 and stDir[1] < 0 and close > htfEma
shortCond = stDir < 0 and stDir[1] > 0 and close < htfEma

strategy.entry("ST Long", strategy.long, when=longCond)
strategy.entry("ST Short", strategy.short, when=shortCond)
`},{id:"py_dorna_ema_pullback",nameFa:"Python: ربات روند EMA + ATR (سبک کوانت)",nameEn:"Python: Quant EMA Pullback + Bollinger",descriptionFa:"کد پایتون با ساختار Pandas-TA برای شکار پولبک روند و رسم خطوط روی چارت.",descriptionEn:"Pandas-style Python strategy computing EMAs and RSI with live chart overlays.",language:"python",category:"Python Quant",code:`# title: Python Quant EMA Pullback
import pandas as pd

def generate_signals(df):
    df['ema_fast'] = df['close'].ewm(span=12).mean()
    df['ema_slow'] = df['close'].ewm(span=26).mean()
    df['ema_trend'] = df['close'].ewm(span=100).mean()
    df['rsi'] = ta.rsi(df['close'], 14)

    plot("EMA 12", df['ema_fast'], "#38e1ff")
    plot("EMA 26", df['ema_slow'], "#e8c15a")
    plot("EMA 100", df['ema_trend'], "#a855f7")

    long_cond = crossover(df['ema_fast'], df['ema_slow']) & (df['close'] > df['ema_trend']) & (df['rsi'] > 45)
    short_cond = crossunder(df['ema_fast'], df['ema_slow']) & (df['close'] < df['ema_trend']) & (df['rsi'] < 55)

    df.loc[long_cond, 'signal'] = 1
    df.loc[short_cond, 'signal'] = -1
    return df
`},{id:"py_rsi_bb_scalper",nameFa:"Python: اسکلپر بولینگر و RSI",nameEn:"Python: Bollinger + RSI Scalper",descriptionFa:"اسکریپت پایتون برای شکار بازگشت قیمت از لبه‌های بولینگر در تایم‌فریم‌های سریع.",descriptionEn:"Fast Bollinger Band + RSI reversion Python bot.",language:"python",category:"Python Scalper",code:`# title: Python Bollinger & RSI Scalper
def generate_signals(df):
    bb_mid, bb_upper, bb_lower = ta.bbands(df['close'], 20, 2.0)
    df['rsi'] = ta.rsi(df['close'], 14)

    plot("BB Upper", bb_upper, "#ff4d6d")
    plot("BB Mid", bb_mid, "#2b74ff")
    plot("BB Lower", bb_lower, "#10d9a3")

    df.loc[(df['close'] < bb_lower) & (df['rsi'] < 35), 'signal'] = 1
    df.loc[(df['close'] > bb_upper) & (df['rsi'] > 65), 'signal'] = -1
    return df
`},{id:"py_donchian_breakout",nameFa:"Python: شکست کانال دونچیان (Breakout)",nameEn:"Python: Donchian Channel Breakout",descriptionFa:"استراتژی شکست سقف و کف ۲۰ کندل اخیر برای موج‌سواری روندهای قدرتمند.",descriptionEn:"Classic Turtle-style 20-bar Donchian high/low breakout Python strategy.",language:"python",category:"Breakout",code:`# title: Python Donchian Channel Breakout
def generate_signals(df):
    df['upper_ch'] = df['high'].rolling(20).max().shift(1)
    df['lower_ch'] = df['low'].rolling(20).min().shift(1)
    df['mid_ch'] = (df['upper_ch'] + df['lower_ch']) / 2

    plot("Donchian High", df['upper_ch'], "#10d9a3")
    plot("Donchian Low", df['lower_ch'], "#ff4d6d")

    df.loc[df['close'] > df['upper_ch'], 'signal'] = 1
    df.loc[df['close'] < df['lower_ch'], 'signal'] = -1
    return df
`},{id:"pine6_ichimoku_cloud",nameFa:"Pine v6: ابر ایچیموکو کامل + فیل رنگی + سیگنال کومو",nameEn:"Pine v6: Full Ichimoku Cloud + Kumo Twist Signals",descriptionFa:"اسکریپت کامل Pine Script v6 برای رسم تنکان‌سن، کیجون‌سن و ابر سبز/قرمز کومو با ورود در شکست ابر.",descriptionEn:"Pine Script v6 Ichimoku Cloud with Tenkan, Kijun, dynamic Kumo fill, and cloud breakout signals.",language:"pine",category:"Pine v6 Pro",code:`//@version=6
strategy("Ichimoku Cloud Breakout v6", overlay=true)

convLen = input.int(9, title="Tenkan-sen")
baseLen = input.int(26, title="Kijun-sen")
spanBLen = input.int(52, title="Senkou Span B")

tenkan = math.avg(ta.lowest(low, convLen), ta.highest(high, convLen))
kijun = math.avg(ta.lowest(low, baseLen), ta.highest(high, baseLen))
spanA = math.avg(tenkan, kijun)
spanB = math.avg(ta.lowest(low, spanBLen), ta.highest(high, spanBLen))

plot(tenkan, title="Tenkan-sen", color=color.aqua, linewidth=1)
plot(kijun, title="Kijun-sen", color=color.orange, linewidth=2)
pA = plot(spanA, title="Senkou A", color=color.new(color.green, 30), linewidth=1)
pB = plot(spanB, title="Senkou B", color=color.new(color.red, 30), linewidth=1)
fill(pA, pB, color=spanA >= spanB ? color.new(color.green, 80) : color.new(color.red, 80))

bullCloud = ta.crossover(tenkan, kijun) and close > math.max(spanA, spanB)
bearCloud = ta.crossunder(tenkan, kijun) and close < math.min(spanA, spanB)

if bullCloud
    label.new(bar_index, low, text="KUMO ▲", style=label.style_label_up, color=color.green, textcolor=color.white)
    log.info("Bullish Ichimoku Breakout @ {0}", close)
if bearCloud
    label.new(bar_index, high, text="KUMO ▼", style=label.style_label_down, color=color.red, textcolor=color.white)
    log.info("Bearish Ichimoku Breakout @ {0}", close)

strategy.entry("Ichimoku Long", strategy.long, when=bullCloud)
strategy.entry("Ichimoku Short", strategy.short, when=bearCloud)
`},{id:"pine6_vwap_bands",nameFa:"Pine v6: باندهای VWAP ± انحراف معیار + اسکلپ",nameEn:"Pine v6: VWAP ± StdDev Bands & Mean Reversion",descriptionFa:"اندیکاتور و استراتژی VWAP با باندهای ۱σ و ۲σ برای تشخیص نقاط اکسترمم و اسکلپ.",descriptionEn:"Pine v6 VWAP with 1-sigma and 2-sigma deviation bands and reversion alerts.",language:"pine",category:"Pine v6 Pro",code:`//@version=6
strategy("VWAP Deviation Bands v6", overlay=true)

mult = input.float(2.0, title="Band Multiplier")
vwapVal = ta.vwap(hlc3)
dev = ta.stdev(close, 20) * mult
upperBand = vwapVal + dev
lowerBand = vwapVal - dev

pV = plot(vwapVal, title="VWAP", color=color.yellow, linewidth=2)
pU = plot(upperBand, title="VWAP +2σ", color=color.new(color.red, 20), linewidth=1)
pL = plot(lowerBand, title="VWAP -2σ", color=color.new(color.lime, 20), linewidth=1)
fill(pV, pU, color=color.new(color.red, 90))
fill(pV, pL, color=color.new(color.green, 90))

rsiVal = ta.rsi(close, 14)
longSig = ta.crossover(close, lowerBand) and rsiVal < 42
shortSig = ta.crossunder(close, upperBand) and rsiVal > 58

strategy.entry("VWAP Long", strategy.long, when=longSig)
strategy.entry("VWAP Short", strategy.short, when=shortSig)
`},{id:"pine6_atr_trailing_stop",nameFa:"Pine v6: تریلینگ استاپ ATR پویا + var History",nameEn:"Pine v6: Dynamic ATR Trailing Stop (Stateful var)",descriptionFa:"اسکریپت پیشرفته Pine v6 با حافظه تاریخی کندل‌های قبل برای دنبال کردن روند با تریلینگ استاپ ATR.",descriptionEn:"Stateful Pine v6 ATR trailing stop using var historical tracking and trend flip barcolors.",language:"pine",category:"Pine v6 Pro",code:`//@version=6
strategy("ATR Trailing Stop Engine v6", overlay=true)

atrLen = input.int(14, title="ATR Length")
atrMult = input.float(2.5, title="Multiplier")

xAtr = ta.atr(atrLen) * atrMult
var float trail = na
var int dir = 1

prevTrail = nz(trail[1], close)
if close > prevTrail and close[1] > prevTrail
    trail := math.max(prevTrail, close - xAtr)
else if close < prevTrail and close[1] < prevTrail
    trail := math.min(prevTrail, close + xAtr)
else
    trail := close > prevTrail ? close - xAtr : close + xAtr

dir := close > trail ? 1 : -1

plot(trail, title="ATR Trail", color=dir > 0 ? color.lime : color.red, linewidth=2)
barcolor(dir > 0 ? color.new(color.lime, 25) : color.new(color.red, 25))

bullFlip = dir == 1 and dir[1] == -1
bearFlip = dir == -1 and dir[1] == 1

if bullFlip
    log.info("ATR Trail Flip LONG @ {0}", close)
if bearFlip
    log.warning("ATR Trail Flip SHORT @ {0}", close)

strategy.entry("Trail Long", strategy.long, when=bullFlip)
strategy.entry("Trail Short", strategy.short, when=bearFlip)
`},{id:"pine6_polyline_zigzag",nameFa:"Pine v6: زیگزاگ Polyline + خطوط پیوت حمایت و مقاومت",nameEn:"Pine v6: Polyline ZigZag + Auto Pivot Levels",descriptionFa:"استفاده از chart.point و polyline.new (ویژگی اختصاصی Pine v6) برای اتصال سقف‌ها و کف‌های بازار.",descriptionEn:"Pine Script v6 showcase using UDTs, arrays, chart.point.from_index, and polyline.new.",language:"pine",category:"Pine v6 Pro",code:`//@version=6
indicator("Polyline ZigZag & Pivot SR v6", overlay=true)

leftBars = input.int(6, title="Pivot Left")
rightBars = input.int(6, title="Pivot Right")

ph = ta.pivothigh(high, leftBars, rightBars)
pl = ta.pivotlow(low, leftBars, rightBars)

var pts = array.new<chart.point>()

if not na(ph)
    pts.push(chart.point.from_index(bar_index - rightBars, ph))
    line.new(bar_index - rightBars, ph, bar_index + 8, ph, color=color.new(color.red, 35), style=line.style_dotted)

if not na(pl)
    pts.push(chart.point.from_index(bar_index - rightBars, pl))
    line.new(bar_index - rightBars, pl, bar_index + 8, pl, color=color.new(color.lime, 35), style=line.style_dotted)

if barstate.islast and pts.size() >= 2
    polyline.new(pts, curved=false, closed=false, line_color=color.aqua, line_width=2)

plot(ta.kama(close, 14), title="KAMA (14)", color=color.yellow, linewidth=2)
`},{id:"pine6_macd_subpane",nameFa:"Pine v6: اسیلاتور MACD + RSI (پنل مجزا پایین چارت)",nameEn:"Pine v6: Dual Momentum Oscillator (Sub-Pane)",descriptionFa:"رسم اسیلاتور مستقل در پنجره مجزای پایین چارت (overlay=false) با هیستوگرام دو رنگ و خط صفر.",descriptionEn:"Sub-pane oscillator indicator (overlay=false) with MACD histogram, signal line, and hline thresholds.",language:"pine",category:"Oscillator v6",code:`//@version=6
strategy("MACD + TSI Sub-Pane v6", overlay=false)

[macdLine, sigLine, hist] = ta.macd(close, 12, 26, 9)
tsiVal = ta.tsi(close, 13, 25)

hline(0, title="Zero Line", color=color.gray, linestyle=hline.style_dashed)
plot(hist, title="MACD Hist", color=hist >= 0 ? color.lime : color.red, style=plot.style_histogram)
plot(macdLine, title="MACD", color=color.aqua, linewidth=2)
plot(sigLine, title="Signal", color=color.orange, linewidth=2)

longCond = ta.crossover(macdLine, sigLine) and tsiVal > -10
shortCond = ta.crossunder(macdLine, sigLine) and tsiVal < 10

strategy.entry("MACD Long", strategy.long, when=longCond)
strategy.entry("MACD Short", strategy.short, when=shortCond)
`},{id:"pine6_udt_dashboard",nameFa:"Pine v6: داشبورد چندتایم‌فریمی با Enum و Method",nameEn:"Pine v6: Multi-TF Matrix Dashboard (UDT + Enum + Method)",descriptionFa:"مثال مدرن Pine v6 با استفاده از type، enum، method و جدول تحلیلی همزمان روی ۳ تایم‌فریم.",descriptionEn:"Modern Pine v6 script demonstrating enum, UDT type/method, and MTF table HUD.",language:"pine",category:"Pine v6 Pro",code:`//@version=6
indicator("Multi-TF Trend Matrix v6", overlay=true)

enum Bias
    BULL = "BULLISH"
    BEAR = "BEARISH"

type TrendMetric
    string tfLabel
    float emaVal
    float rsiVal

method isBullish(TrendMetric self, float px) =>
    px > self.emaVal and self.rsiVal > 50

ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
rsi14 = ta.rsi(close, 14)

htf1h = request.security(syminfo.tickerid, "60", ta.ema(close, 50))
htf4h = request.security(syminfo.tickerid, "240", ta.ema(close, 50))

plot(ema50, title="EMA 50", color=color.aqua, linewidth=2)
plot(ema200, title="EMA 200", color=color.purple, linewidth=2)
plot(htf4h, title="4H EMA 50", color=color.orange, linewidth=2)

var table panel = table.new(position.top_right, 2, 4, bgcolor=color.new(color.black, 18), border_color=color.aqua)
if barstate.islast
    mCur = TrendMetric.new(timeframe.period, ema50, rsi14)
    table.cell(panel, 0, 0, "MTF Matrix v6", text_color=color.aqua, bgcolor=color.new(color.blue, 60))
    table.cell(panel, 1, 0, mCur.isBullish(close) ? Bias.BULL : Bias.BEAR, text_color=mCur.isBullish(close) ? color.lime : color.red)
    table.cell(panel, 0, 1, "1H EMA 50", text_color=color.silver)
    table.cell(panel, 1, 1, close > htf1h ? "ABOVE" : "BELOW", text_color=close > htf1h ? color.lime : color.red)
    table.cell(panel, 0, 2, "4H EMA 50", text_color=color.silver)
    table.cell(panel, 1, 2, close > htf4h ? "ABOVE" : "BELOW", text_color=close > htf4h ? color.lime : color.red)
    table.cell(panel, 0, 3, "RSI (14)", text_color=color.silver)
    table.cell(panel, 1, 3, str.tostring(rsi14, "#.##"), text_color=color.yellow)
`}];function Qe(e){return e==="dotted"?Ie.Dotted:e==="dashed"?Ie.Dashed:Ie.Solid}function Ue(e){if(e==="dashed")return"6 4";if(e==="dotted")return"2 3"}function pt(e){switch(e){case"top_left":return"top-2.5 left-2.5";case"bottom_left":return"bottom-8 left-2.5";case"bottom_right":return"bottom-8 right-16";case"top_center":return"top-2.5 left-1/2 -translate-x-1/2";case"bottom_center":return"bottom-8 left-1/2 -translate-x-1/2";case"middle_left":return"top-1/2 -translate-y-1/2 left-2.5";case"middle_right":return"top-1/2 -translate-y-1/2 right-16";default:return"top-2.5 right-16"}}function Ht({candles:e,levels:o,overlays:l,kbosOverlays:t,customOverlays:n,showVolume:r=!0,height:i=420}){var Le,fe,de,me,ae,ue,pe,w;const a=X.useRef(null),s=X.useRef(null),h=X.useRef(null),c=X.useRef(null),[f,d]=X.useState(()=>document.documentElement.classList.contains("theme-light")),[u,b]=X.useState(!0),[M,L]=X.useState(!0),[T,V]=X.useState(!0),[E,I]=X.useState(!1),[U,le]=X.useState(!0),[ne,ve]=X.useState(!0),[he,De]=X.useState(!0),ke=!!(U&&((Le=n==null?void 0:n.plots)!=null&&Le.some(m=>m.overlay===!1&&m.points.length)));X.useEffect(()=>{const m=new MutationObserver(()=>{d(document.documentElement.classList.contains("theme-light"))});return m.observe(document.documentElement,{attributes:!0,attributeFilter:["class"]}),()=>m.disconnect()},[]),X.useEffect(()=>{var Te,ie,we,xe,Me,_e,Ce,Be,Pe,v,K,ce,Ae,We,He,je,$e,qe,Ge,Ke,ze;const m=a.current;if(!m)return;const B=p=>{const g=new Map;for(const A of p){const D=Number(A.time);Number.isFinite(D)&&g.set(D,A)}return Array.from(g.entries()).sort((A,D)=>A[0]-D[0]).map(([,A])=>A)},S=Ye(m,{width:Math.max(280,m.clientWidth||600),height:i,layout:{background:{type:Ze.Solid,color:f?"#ffffff":"#060c1c"},textColor:f?"#4b6491":"#96a9cf"},grid:{vertLines:{color:f?"rgba(12, 68, 200, 0.06)":"rgba(120, 165, 255, 0.06)"},horzLines:{color:f?"rgba(12, 68, 200, 0.06)":"rgba(120, 165, 255, 0.06)"}},crosshair:{mode:1},timeScale:{timeVisible:!0,borderColor:f?"rgba(12, 68, 200, 0.14)":"rgba(120, 165, 255, 0.14)"},rightPriceScale:{borderColor:f?"rgba(12, 68, 200, 0.14)":"rgba(120, 165, 255, 0.14)",scaleMargins:{top:.08,bottom:r?.2:.08}}});c.current=S;const y=S.addCandlestickSeries({upColor:"#10D856",downColor:"#f43f5e",borderUpColor:"#10D856",borderDownColor:"#f43f5e",wickUpColor:"#10D856",wickDownColor:"#f43f5e"}),q=new Map;if(U&&((Te=n==null?void 0:n.barcolors)!=null&&Te.length))for(const p of n.barcolors)p.color&&q.set(p.time,p.color);let F=[];if(e.length>0){if(F=B(e.map(p=>({time:Math.floor(p.timestamp/1e3),open:p.open,high:p.high,low:p.low,close:p.close,volume:p.volume}))),y.setData(F.map(({time:p,open:g,high:A,low:D,close:j})=>{const $=q.get(Number(p));return $?{time:p,open:g,high:A,low:D,close:j,color:$,borderColor:$,wickColor:$}:{time:p,open:g,high:A,low:D,close:j}})),r){const p=S.addHistogramSeries({priceFormat:{type:"volume"},priceScaleId:""});p.priceScale().applyOptions({scaleMargins:{top:.84,bottom:0}}),p.setData(F.map(g=>({time:g.time,value:g.volume,color:g.close>=g.open?"rgba(16, 216, 86, 0.24)":"rgba(244, 63, 94, 0.24)"})))}if(he&&(U&&((ie=n==null?void 0:n.markers)!=null&&ie.length)||(we=t==null?void 0:t.markers)!=null&&we.length)){const p=U&&((xe=n==null?void 0:n.markers)!=null&&xe.length)?n.markers:(t==null?void 0:t.markers)??[],g=B(p.map(_=>({time:_.time,position:_.position,color:_.color,shape:_.shape,text:_.text.includes("BUY")?"BUY":_.text.includes("SELL")?"SELL":_.text.slice(0,10)}))),A=F.length>=2?Math.max(60,Number(F[1].time)-Number(F[0].time)):900,D=Number(((Me=F[0])==null?void 0:Me.time)??0),j=Number(((_e=F[F.length-1])==null?void 0:_e.time)??0),$=Math.max(0,j-D),x=Math.max(A*10,Math.floor($/12)),N=[];for(const _ of g){const C=N[N.length-1];!C||Number(_.time)-Number(C.time)>=x?N.push(_):N[N.length-1]=_}y.setMarkers(N)}S.timeScale().fitContent()}if(U&&((Ce=n==null?void 0:n.plots)!=null&&Ce.length))for(const p of n.plots)p.overlay===!1||!p.points.length||(p.style==="histogram"||p.style==="columns"?S.addHistogramSeries({color:p.color||"#38e1ff",priceLineVisible:!1,title:p.title}).setData(B(p.points.map(A=>({time:A.time,value:A.value,...A.color?{color:A.color}:{}})))):p.style==="area"?S.addAreaSeries({lineColor:p.color||"#38e1ff",topColor:"rgba(56,225,255,0.22)",bottomColor:"rgba(56,225,255,0.02)",lineWidth:p.linewidth||2,priceLineVisible:!1,title:p.title}).setData(B(p.points.map(A=>({time:A.time,value:A.value})))):S.addLineSeries({color:p.color||"#38e1ff",lineWidth:Math.max(1,Math.min(4,p.linewidth||2)),lineType:p.style==="stepline"?Xe.WithSteps:Xe.Simple,priceLineVisible:!1,title:p.title}).setData(B(p.points.map(A=>({time:A.time,value:A.value,...A.color?{color:A.color}:{}})))));if(U&&((Be=n==null?void 0:n.hlines)!=null&&Be.length))for(const p of n.hlines)p.overlay!==!1&&y.createPriceLine({price:p.price,color:p.color||"#94a3b8",lineWidth:Math.max(1,Math.min(4,p.linewidth||1)),lineStyle:Qe(p.linestyle),axisLabelVisible:!0,title:p.title});if((E||!t&&l)&&((Pe=l==null?void 0:l.ema20)!=null&&Pe.length&&S.addLineSeries({color:"#1464F6",lineWidth:1,priceLineVisible:!1,lastValueVisible:!1}).setData(B(l.ema20.map(g=>({time:g.time,value:g.value})))),(v=l==null?void 0:l.ema50)!=null&&v.length&&S.addLineSeries({color:"#FF8A00",lineWidth:1,priceLineVisible:!1,lastValueVisible:!1}).setData(B(l.ema50.map(g=>({time:g.time,value:g.value})))),(K=l==null?void 0:l.ema200)!=null&&K.length&&S.addLineSeries({color:"#8b5cf6",lineWidth:2,priceLineVisible:!1,lastValueVisible:!1}).setData(B(l.ema200.map(g=>({time:g.time,value:g.value}))))),u&&((ce=t==null?void 0:t.closeSeriesAlt)!=null&&ce.length)&&((Ae=t==null?void 0:t.openSeriesAlt)!=null&&Ae.length)&&(S.addLineSeries({color:"#10D856",lineWidth:2,priceLineVisible:!1,lastValueVisible:!1,title:"KBOs Close"}).setData(B(t.closeSeriesAlt.map(A=>({time:A.time,value:A.value})))),S.addLineSeries({color:"#f43f5e",lineWidth:2,priceLineVisible:!1,lastValueVisible:!1,title:"KBOs Open"}).setData(B(t.openSeriesAlt.map(A=>({time:A.time,value:A.value}))))),M&&((We=t==null?void 0:t.demaAtr)!=null&&We.length)&&S.addLineSeries({lineWidth:2,priceLineVisible:!1,lastValueVisible:!1,title:"DEMA ATR"}).setData(B(t.demaAtr.map(g=>({time:g.time,value:g.value,color:g.trend==="BULL"?"#10D856":"#f43f5e"})))),T&&((je=(He=t==null?void 0:t.almaRibbon)==null?void 0:He.bands)!=null&&je.length))for(const p of t.almaRibbon.bands){if(!p.points.length)continue;S.addLineSeries({color:p.color,lineWidth:1,priceLineVisible:!1,lastValueVisible:!1}).setData(B(p.points.map(A=>({time:A.time,value:A.value}))))}const R=(p,g,A)=>{!p||!Number.isFinite(p)||y.createPriceLine({price:p,color:A,lineWidth:2,lineStyle:2,axisLabelVisible:!0,title:g})};o&&(R(o.entry,"ENTRY","#1464F6"),R(o.stopLoss,"STOP LOSS","#f43f5e"),R(o.tp1,"TP1","#10D856"),R(o.tp2,"TP2","#FF8A00"),R(o.tp3,"TP3","#f97316"),($e=o.supports)==null||$e.forEach((p,g)=>R(p,`S${g+1}`,"#06b6d4")),(qe=o.resistances)==null||qe.forEach((p,g)=>R(p,`R${g+1}`,"#8b5cf6")));const k=F.length>=2?Math.max(60,Number(F[1].time)-Number(F[0].time)):900,ge=Number(((Ge=F[0])==null?void 0:Ge.time)??0),se=Number(((Ke=F[F.length-1])==null?void 0:Ke.time)??0),ee=(p,g)=>{const A=S.timeScale().timeToCoordinate(p);if(A!==null&&Number.isFinite(A))return A;if(F.length>=2){if(p>se){const D=S.timeScale().timeToCoordinate(se),j=S.timeScale().timeToCoordinate(se-k);if(D!==null&&j!==null){const $=Math.max(1,D-j);return D+(p-se)/k*$}return g-60}if(p<ge)return 0}return null},G=()=>{const p=s.current;if(!p)return;if(!U||!ne||!n){p.replaceChildren();return}const g=m.clientWidth||600,A=i;p.setAttribute("viewBox",`0 0 ${g} ${A}`);const D="http://www.w3.org/2000/svg",j=document.createDocumentFragment(),$=(x,N)=>{const _=document.createElementNS(D,x);for(const[C,P]of Object.entries(N))P!==void 0&&_.setAttribute(C,String(P));return _};for(const x of n.bgcolors||[]){const N=ee(x.time,g);N===null||N<-20||N>g||j.appendChild($("rect",{x:N-3,y:0,width:6,height:A,fill:x.color}))}for(const x of n.fills||[]){if(x.overlay===!1||x.points.length<2)continue;const N=[],_=[];for(const C of x.points){const P=ee(C.time,g),Z=y.priceToCoordinate(C.top),oe=y.priceToCoordinate(C.bottom);P===null||Z===null||oe===null||(N.push(`${P.toFixed(1)},${Z.toFixed(1)}`),_.unshift(`${P.toFixed(1)},${oe.toFixed(1)}`))}N.length>=2&&j.appendChild($("polygon",{points:[...N,..._].join(" "),fill:x.color}))}for(const x of n.boxes||[]){const N=y.priceToCoordinate(x.top),_=y.priceToCoordinate(x.bottom);if(N===null||_===null)continue;let C=ee(x.leftTime,g),P=ee(x.rightTime,g);(x.extend==="right"||x.extend==="both")&&(P=g-58),(x.extend==="left"||x.extend==="both")&&(C=0),C===null&&(C=0),P===null&&(P=Math.min(g-60,C+64));const Z=Math.min(C,P),oe=Math.max(8,Math.abs(P-C)),Ne=Math.min(N,_),Se=Math.max(4,Math.abs(_-N));if(!(Z+oe<0||Z>g)&&(j.appendChild($("rect",{x:Z.toFixed(1),y:Ne.toFixed(1),width:oe.toFixed(1),height:Se.toFixed(1),rx:3,fill:x.bgcolor||"rgba(43,116,255,0.16)",stroke:x.borderColor||"#2b74ff","stroke-width":x.borderWidth??1,"stroke-dasharray":Ue(x.borderStyle)})),x.text&&Se>=10&&oe>=24)){const ye=$("text",{x:(Z+5).toFixed(1),y:(Ne+Math.min(Se-3,12)).toFixed(1),fill:x.textColor||x.borderColor||"#e2e8f0","font-size":10,"font-weight":700});ye.textContent=x.text.slice(0,22),j.appendChild(ye)}}for(const x of n.lines||[]){const N=y.priceToCoordinate(x.y1),_=y.priceToCoordinate(x.y2);if(N===null||_===null)continue;let C=ee(x.x1Time,g),P=ee(x.x2Time,g);(x.extend==="right"||x.extend==="both")&&(P=g-58),(x.extend==="left"||x.extend==="both")&&(C=0),!(C===null||P===null)&&j.appendChild($("line",{x1:C.toFixed(1),y1:N.toFixed(1),x2:P.toFixed(1),y2:_.toFixed(1),stroke:x.color||"#38e1ff","stroke-width":x.width??2,"stroke-dasharray":Ue(x.style)}))}for(const x of n.polylines||[]){const N=[];for(const C of x.points){const P=ee(C.time,g),Z=y.priceToCoordinate(C.price);P!==null&&Z!==null&&N.push({x:P,y:Z})}if(N.length<2)continue;let _=`M ${N[0].x.toFixed(1)} ${N[0].y.toFixed(1)}`;if(x.curved&&N.length>=3){for(let P=1;P<N.length-1;P++){const Z=(N[P].x+N[P+1].x)/2,oe=(N[P].y+N[P+1].y)/2;_+=` Q ${N[P].x.toFixed(1)} ${N[P].y.toFixed(1)} ${Z.toFixed(1)} ${oe.toFixed(1)}`}const C=N[N.length-1];_+=` L ${C.x.toFixed(1)} ${C.y.toFixed(1)}`}else for(let C=1;C<N.length;C++)_+=` L ${N[C].x.toFixed(1)} ${N[C].y.toFixed(1)}`;x.closed&&(_+=" Z"),j.appendChild($("path",{d:_,fill:x.fillColor||(x.closed?"rgba(56,225,255,0.12)":"none"),stroke:(x.width??2)>0?x.color||"#38e1ff":"none","stroke-width":x.width??2,"stroke-dasharray":Ue(x.style),"stroke-linejoin":"round","stroke-linecap":"round"}))}for(const x of n.labels||[]){const N=ee(x.time,g),_=y.priceToCoordinate(x.price);if(N===null||_===null||N<4||N>g-40)continue;const C=(x.text||"").slice(0,18);if(!C)continue;const P=Math.max(26,C.length*6.5+10),Z=16,Ne=x.style==="label_up"||x.yloc==="belowbar"?_+5:_-Z-5,Se=N-P/2;j.appendChild($("rect",{x:Se.toFixed(1),y:Ne.toFixed(1),width:P.toFixed(1),height:Z,rx:4,fill:x.color||"#2b74ff"}));const ye=$("text",{x:N.toFixed(1),y:(Ne+11.5).toFixed(1),"text-anchor":"middle",fill:x.textcolor||"#ffffff","font-size":9.5,"font-weight":800});ye.textContent=C,j.appendChild(ye)}p.replaceChildren(j)},W=()=>requestAnimationFrame(G);W(),S.timeScale().subscribeVisibleTimeRangeChange(W);let O=null;const te=h.current,be=((n==null?void 0:n.plots)||[]).filter(p=>p.overlay===!1&&p.points.length);if(U&&te&&be.length>0){O=Ye(te,{width:Math.max(280,te.clientWidth||600),height:135,layout:{background:{type:Ze.Solid,color:f?"#f8fafc":"#050915"},textColor:f?"#4b6491":"#96a9cf"},grid:{vertLines:{color:f?"rgba(12, 68, 200, 0.05)":"rgba(120, 165, 255, 0.05)"},horzLines:{color:f?"rgba(12, 68, 200, 0.05)":"rgba(120, 165, 255, 0.05)"}},timeScale:{timeVisible:!0,borderColor:"rgba(120,165,255,0.12)"},rightPriceScale:{borderColor:"rgba(120,165,255,0.12)"}});let p=null;for(const g of be)if(g.style==="histogram"||g.style==="columns"){const A=O.addHistogramSeries({color:g.color||"#38e1ff",title:g.title});A.setData(B(g.points.map(D=>({time:D.time,value:D.value,...D.color?{color:D.color}:{}})))),p||(p=A)}else{const A=O.addLineSeries({color:g.color||"#38e1ff",lineWidth:2,title:g.title});A.setData(B(g.points.map(D=>({time:D.time,value:D.value})))),p||(p=A)}if(p&&((ze=n==null?void 0:n.hlines)!=null&&ze.length))for(const g of n.hlines)p.createPriceLine({price:g.price,color:g.color||"#94a3b8",lineWidth:1,lineStyle:Qe(g.linestyle),axisLabelVisible:!0,title:g.title});O.timeScale().fitContent()}const Y=new ResizeObserver(()=>{m&&m.clientWidth>0&&(S.applyOptions({width:m.clientWidth}),W()),te&&O&&te.clientWidth>0&&O.applyOptions({width:te.clientWidth})});return Y.observe(m),()=>{Y.disconnect();try{S.timeScale().unsubscribeVisibleTimeRangeChange(W)}catch{}try{S.remove()}catch{}if(O)try{O.remove()}catch{}}},[e,o,l,t,n,r,i,u,M,T,E,U,ne,he,f]);const Fe=!!(n&&((((fe=n.boxes)==null?void 0:fe.length)||0)>0||(((de=n.lines)==null?void 0:de.length)||0)>0||(((me=n.labels)==null?void 0:me.length)||0)>0||(((ae=n.fills)==null?void 0:ae.length)||0)>0||(((ue=n.polylines)==null?void 0:ue.length)||0)>0||(((pe=n.tables)==null?void 0:pe.length)||0)>0));return H.jsxs("div",{className:"space-y-2",children:[(t||n)&&H.jsxs("div",{className:"flex flex-wrap items-center gap-1.5 text-[10px]",children:[n&&H.jsxs("button",{type:"button",onClick:()=>le(m=>!m),className:`px-2.5 py-1 rounded-lg border font-bold transition ${U?"btn-lime":"surface-soft text-dim"}`,children:[n.language?`${n.language.toUpperCase()} · `:"",n.title]}),Fe&&H.jsx("button",{type:"button",onClick:()=>ve(m=>!m),className:`px-2.5 py-1 rounded-lg border font-bold transition ${ne?"btn-cobalt":"surface-soft text-dim"}`,children:"TV Graphics (Box/Label/Table)"}),H.jsx("button",{type:"button",onClick:()=>b(m=>!m),className:`px-2.5 py-1 rounded-lg border font-bold transition ${u?"btn-emerald":"surface-soft text-dim"}`,children:"KBOs HTF"}),H.jsx("button",{type:"button",onClick:()=>L(m=>!m),className:`px-2.5 py-1 rounded-lg border font-bold transition ${M?"btn-cobalt":"surface-soft text-dim"}`,children:"DEMA ATR"}),H.jsx("button",{type:"button",onClick:()=>V(m=>!m),className:`px-2.5 py-1 rounded-lg border font-bold transition ${T?"banner-cobalt-soft text-brand":"surface-soft text-dim"}`,children:"RLA MA Ribbon"}),H.jsx("button",{type:"button",onClick:()=>De(m=>!m),className:`px-2.5 py-1 rounded-lg border font-bold transition ${he?"btn-cobalt":"surface-soft text-dim"}`,children:"BUY/SELL Arrows"}),l&&H.jsx("button",{type:"button",onClick:()=>I(m=>!m),className:`px-2.5 py-1 rounded-lg border font-bold transition ${E?"bg-[#FF8A00]/15 text-flame border-[#FF8A00]/40":"surface-soft text-dim"}`,children:"EMA 20/50/200"})]}),H.jsxs("div",{className:"relative w-full rounded-2xl overflow-hidden border",children:[H.jsx("div",{ref:a,className:"w-full"}),H.jsx("svg",{ref:s,className:"pointer-events-none absolute inset-0 w-full h-full z-10"}),U&&ne&&((w=n==null?void 0:n.tables)==null?void 0:w.map((m,B)=>{const S=Array.from({length:m.rows},()=>Array.from({length:m.columns},()=>{}));for(const y of m.cells)y.row>=0&&y.row<m.rows&&y.col>=0&&y.col<m.columns&&(S[y.row][y.col]=y);return H.jsx("div",{dir:"ltr",style:{background:m.bgcolor,borderColor:m.borderColor,borderWidth:m.borderWidth??1},className:`pointer-events-none absolute z-20 rounded-xl border backdrop-blur-md shadow-lg overflow-hidden text-[10px] font-mono ${pt(m.position)}`,children:H.jsx("table",{className:"border-collapse",children:H.jsx("tbody",{children:S.map((y,q)=>H.jsx("tr",{children:y.map((F,R)=>H.jsx("td",{style:{background:F!=null&&F.bgcolor&&F.bgcolor!=="transparent"?F.bgcolor:void 0,color:(F==null?void 0:F.textColor)||"#e2e8f0",borderColor:m.borderColor},className:"px-2 py-1 border border-white/10 whitespace-nowrap font-bold",children:(F==null?void 0:F.text)??""},R))},q))})})},`tv_tbl_${B}`)}))]}),ke&&H.jsx("div",{className:"w-full rounded-2xl overflow-hidden border",children:H.jsx("div",{ref:h,className:"w-full"})})]})}export{Dt as A,Et as B,Ht as C,J as D,Rt as E,Wt as S,Ve as a,mt as b,xt as c,It as d,z as e,Mt as f,Ut as g,At as h,Re as i,et as j,Ct as k,Bt as l,kt as m,Tt as n,_t as o,Vt as p,St as q,tt as r,Q as s,yt as t,Ft as u,Nt as v,re as w,Lt as x,Pt as y,vt as z};
