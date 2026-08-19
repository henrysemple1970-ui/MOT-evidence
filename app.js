
const S={plan:"basic",photos:{},coords:null,p1ok:false,vinVerified:false,mileageChecked:false};
const $=id=>document.getElementById(id);
const reg=v=>v.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,8);
const vin=v=>v.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g,"").slice(0,17);
function st(id,k,m){const e=$(id);e.className="status "+k;e.textContent=m}
function backend(){return ($("backend").value||"").replace(/\/$/,"")}
$("backend").value=localStorage.getItem("motBackend")||"";
$("saveBackend").onclick=()=>{localStorage.setItem("motBackend",backend());st("backendStatus","good","Backend saved on this device.")};

async function api(path,opt={}){
  if(!backend())throw new Error("Enter the secure backend URL first.");
  const r=await fetch(backend()+path,opt),txt=await r.text();let b={};try{b=JSON.parse(txt)}catch{b={message:txt}}
  if(!r.ok)throw new Error(b.error||b.message||`Request failed (${r.status})`);
  return b;
}

function setPlan(plan){
  S.plan=plan;
  const pro=plan==="pro";
  $("basicPlan").className=pro?"secondary":"secondary active-basic";
  $("proPlan").className=pro?"probtn active-pro":"probtn";
  ["proVehicle","proVin","proMileage","backendArea"].forEach(id=>$(id).classList.toggle("hidden",!pro));
  $("basicLinks").classList.toggle("hidden",pro);
  $("backendLocked").classList.toggle("hidden",pro);
  st("planStatus",pro?"warn":"good",pro?"Pro demo active — automated checks enabled where backend credentials exist.":"Basic mode active — no paid API services required.");
  update();
}
$("basicPlan").onclick=()=>setPlan("basic");
$("proPlan").onclick=()=>setPlan("pro");

function update(){
 $("reg").value=reg($("reg").value);$("vin").value=vin($("vin").value);$("mileage").value=$("mileage").value.replace(/\D/g,"").slice(0,8);
 $("summary").innerHTML=[
 ["Plan",S.plan==="pro"?"Pro":"Basic Free"],["Registration",$("reg").value||"Not set"],["Photo 1 reg",S.p1ok?"Verified":"Not verified"],["VIN",$("vin").value||"Not confirmed"],["VIN cross-check",S.plan==="pro"?(S.vinVerified?"Verified":"Not verified"):"Manual / local"],["Mileage",$("mileage").value||"Not confirmed"],["History check",S.plan==="pro"?(S.mileageChecked?"Checked":"Not checked"):"Manual GOV.UK"],["GPS",S.coords?`${S.coords.lat.toFixed(6)}, ${S.coords.lon.toFixed(6)}`:"Not captured"],["Photos",`${Object.keys(S.photos).length} / 3`]
 ].map(([a,b])=>`<div>${a}</div><div><b>${b}</b></div>`).join("");
}
["reg","vin","mileage"].forEach(x=>$(x).oninput=()=>{if(x==="reg")S.p1ok=false;update()});update();

$("gps").onclick=()=>navigator.geolocation.getCurrentPosition(p=>{S.coords={lat:p.coords.latitude,lon:p.coords.longitude};st("gpss","good","GPS captured.");update()},()=>st("gpss","bad","Location permission not granted."),{enableHighAccuracy:true});

document.querySelectorAll("button[data-p]").forEach(b=>b.onclick=()=>$("p"+b.dataset.p).click());
for(let n=1;n<=3;n++)$("p"+n).onchange=async e=>{
 const f=e.target.files[0];if(!f)return;
 if(n===1){
   if(!reg($("reg").value)){st("s1","bad","Enter the registration first.");return}
   st("s1","warn","Reading registration from Photo 1…");
   const r=await Tesseract.recognize(f,"eng");
   const text=(r.data.text||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
   S.p1ok=text.includes(reg($("reg").value));
   if(!S.p1ok){st("s1","bad","Registration in Photo 1 did not match the tester-entered registration.");e.target.value="";update();return}
   st("s1","good","Registration verified in Photo 1.");
 }
 if(n===2)st("s2","warn","VIN photo captured. Confirm the 17-character VIN below.");
 if(n===3)st("s3","warn","Mileage photo captured. Confirm the odometer reading below.");
 const out=await watermark(f,n);S.photos[n]=out.blob;$("i"+n).src=out.url;$("i"+n).classList.remove("hidden");$("b"+n).classList.add("done");$("b"+n).textContent="✓";update();
};

async function watermark(file,n){
 const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=URL.createObjectURL(file)});
 const c=document.createElement("canvas"),sc=Math.min(1,1800/img.width);c.width=img.width*sc;c.height=img.height*sc;const x=c.getContext("2d");x.drawImage(img,0,0,c.width,c.height);
 const kind=n===1?"VEHICLE":n===2?"VIN":"MILEAGE",gps=S.coords?`${S.coords.lat.toFixed(6)}, ${S.coords.lon.toFixed(6)}`:"GPS PENDING";
 const lines=["MOT PHOTO EVIDENCE",`REG: ${reg($("reg").value)||"NOT SET"}`,new Date().toLocaleString(),`GPS: ${gps}`,`PHOTO ${n} — ${kind}`];
 const fs=Math.max(24,Math.round(c.width/42)),lh=fs*1.25,pad=fs*.65,bh=lines.length*lh+pad*2;x.fillStyle="rgba(0,0,0,.68)";x.fillRect(0,c.height-bh,c.width,bh);x.fillStyle="white";x.font=`600 ${fs}px -apple-system`;lines.forEach((t,i)=>x.fillText(t,pad,c.height-bh+pad+fs+i*lh));
 const blob=await new Promise(r=>c.toBlob(r,"image/jpeg",.9));return{blob,url:URL.createObjectURL(blob)}
}

$("scanPlate").onclick=()=>st("vehicleStatus","warn","ANPR remains a Pro backend feature. Connect a compatible backend/provider to enable live plate recognition.");
$("vehicleLookup").onclick=async()=>{
 try{const out=await api("/dvla",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({registrationNumber:reg($("reg").value)})});st("vehicleStatus","good",`Vehicle lookup returned ${out.make||"vehicle"} ${out.colour||""}.`)}
 catch(e){st("vehicleStatus","bad",e.message)}
};
$("verifyVin").onclick=async()=>{
 try{const out=await api(`/mot/vin/${encodeURIComponent(vin($("vin").value))}`);const found=reg(out.registration||out.registrationNumber||out.vehicle?.registration||"");S.vinVerified=!!found&&found===reg($("reg").value);st("vinProStatus",S.vinVerified?"good":"bad",S.vinVerified?"VIN verified against registration.":`VIN did not verify against entered registration${found?` (record shows ${found})`:""}.`);update()}
 catch(e){S.vinVerified=false;st("vinProStatus","bad",e.message);update()}
};
$("checkMileage").onclick=async()=>{
 try{const out=await api(`/mot/registration/${encodeURIComponent(reg($("reg").value))}`);const tests=out.motTests||out.vehicle?.motTests||[];const vals=tests.map(t=>({v:Number(String(t.odometerValue??t.odometer?.value??"").replace(/\D/g,"")),u:(t.odometerUnit??t.odometer?.unit??"mi").toLowerCase(),d:t.completedDate??t.testDate??""})).filter(x=>x.v>0).sort((a,b)=>String(b.d).localeCompare(String(a.d)));if(!vals.length){S.mileageChecked=true;st("mileageProStatus","warn","No usable previous MOT mileage returned.");update();return}let prev=vals[0].v;if(vals[0].u.startsWith("km"))prev=Math.round(prev*.621371);const cur=Number($("mileage").value),diff=cur-prev;S.mileageChecked=true;st("mileageProStatus",diff>=0?"good":"bad",diff>=0?`Previous ${prev.toLocaleString()} mi • current +${diff.toLocaleString()} mi.`:`WARNING: current is ${Math.abs(diff).toLocaleString()} mi lower than previous.`);update()}
 catch(e){S.mileageChecked=false;st("mileageProStatus","bad",e.message);update()}
};

$("complete").onclick=()=>{
 update();const miss=[];if(!reg($("reg").value))miss.push("registration");if(!S.p1ok)miss.push("Photo 1 registration verification");if(vin($("vin").value).length!==17)miss.push("valid VIN");if(!$("mileage").value)miss.push("mileage");if(!S.coords)miss.push("GPS");if(Object.keys(S.photos).length!==3)miss.push("all 3 photos");
 if(miss.length)return st("submitStatus","bad","Missing: "+miss.join(", "));
 if(S.plan==="pro"&&(!S.vinVerified||!S.mileageChecked))return st("submitStatus","warn","Core evidence is complete. Pro verification is still incomplete.");
 st("submitStatus","good",S.plan==="pro"?"Pro evidence checks complete.":"Basic evidence checks complete. Use GOV.UK links for manual vehicle and mileage cross-checks.");
};
$("clear").onclick=()=>{S.photos={};S.p1ok=false;S.vinVerified=false;S.mileageChecked=false;for(let n=1;n<=3;n++){if($("i"+n).src)URL.revokeObjectURL($("i"+n).src);$("i"+n).classList.add("hidden");$("p"+n).value="";$("b"+n).classList.remove("done");$("b"+n).textContent=n}update();st("submitStatus","good","Local evidence cleared.")};
setPlan("basic");
