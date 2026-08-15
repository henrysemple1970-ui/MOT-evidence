
const S={photos:{},coords:null,vehicle:null,vinVerified:false,mileageChecked:false};
const $=id=>document.getElementById(id);
const regClean=v=>v.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,8);
const vinClean=v=>v.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g,"").slice(0,17);
function st(el,k,m){el.className="status "+k;el.textContent=m}
function backend(){return ($("backend").value||"").replace(/\/$/,"")}
function save(){localStorage.setItem("motBackend",backend());st($("backendStatus"),"good","Backend saved on this device.")}
$("backend").value=localStorage.getItem("motBackend")||"";
$("saveBackend").onclick=save;

async function api(path,opt={}){
  if(!backend()) throw new Error("Enter the secure backend URL first.");
  const r=await fetch(backend()+path,opt);
  const txt=await r.text(); let body={}; try{body=JSON.parse(txt)}catch{body={message:txt}}
  if(!r.ok) throw new Error(body.error||body.message||`Request failed (${r.status})`);
  return body;
}
function summary(){
  $("reg").value=regClean($("reg").value); $("vin").value=vinClean($("vin").value); $("mileage").value=$("mileage").value.replace(/\D/g,"").slice(0,8);
  const rows=[["Registration",$("reg").value||"Not set"],["VIN",$("vin").value||"Not confirmed"],["Mileage",$("mileage").value?Number($("mileage").value).toLocaleString()+" miles":"Not confirmed"],["VIN check",S.vinVerified?"Verified":"Not verified"],["MOT mileage check",S.mileageChecked?"Checked":"Not checked"],["GPS",S.coords?`${S.coords.lat.toFixed(6)}, ${S.coords.lon.toFixed(6)}`:"Not captured"],["Photos",`${Object.keys(S.photos).length} / 3`]];
  $("summary").innerHTML=rows.map(([a,b])=>`<div>${a}</div><div><b>${b}</b></div>`).join("");
}
["reg","vin","mileage"].forEach(x=>$(x).addEventListener("input",summary)); summary();

$("scanPlate").onclick=()=>$("plateInput").click();
$("plateInput").onchange=async e=>{
  const f=e.target.files[0]; if(!f)return;
  try{
    st($("vehicleStatus"),"warn","Recognising plate…");
    const fd=new FormData();fd.append("image",f,"plate.jpg");
    const out=await api("/anpr",{method:"POST",body:fd});
    $("reg").value=regClean(out.registration||"");
    st($("vehicleStatus"),out.confidence>=85?"good":"warn",`ANPR: ${out.registration||"No plate"} • confidence ${out.confidence??"?"}%`);
    if(out.vehicle){
      S.vehicle=out.vehicle;
      $("vehicleDetails").innerHTML=Object.entries(out.vehicle).slice(0,8).map(([a,b])=>`<div>${a}</div><div><b>${b??""}</b></div>`).join("");
    }
    summary();
  }catch(err){st($("vehicleStatus"),"bad",err.message)}
};

$("getLocation").onclick=()=>{
 if(!navigator.geolocation)return st($("gpsStatus"),"bad","Geolocation unavailable.");
 st($("gpsStatus"),"warn","Requesting location…");
 navigator.geolocation.getCurrentPosition(p=>{S.coords={lat:p.coords.latitude,lon:p.coords.longitude,acc:p.coords.accuracy};st($("gpsStatus"),"good",`GPS captured • ±${Math.round(p.coords.accuracy)} m`);summary()},()=>st($("gpsStatus"),"bad","Location permission not granted."),{enableHighAccuracy:true,maximumAge:0,timeout:12000});
};

document.querySelectorAll("button[data-p]").forEach(b=>b.onclick=()=>$("p"+b.dataset.p).click());
for(let n=1;n<=3;n++) $("p"+n).onchange=async e=>{
 const f=e.target.files[0];if(!f)return;
 const kind=n===1?"VEHICLE":n===2?"VIN":"MILEAGE";
 const wm=await watermark(f,kind,n);S.photos[n]=wm.blob;$("i"+n).src=wm.url;$("i"+n).classList.remove("hidden");$("b"+n).classList.add("done");$("b"+n).textContent="✓";summary();
};
async function watermark(file,kind,num){
 const img=await toImg(file), max=1800, sc=Math.min(1,max/img.width), c=document.createElement("canvas");c.width=Math.round(img.width*sc);c.height=Math.round(img.height*sc);const x=c.getContext("2d");x.drawImage(img,0,0,c.width,c.height);
 const gps=S.coords?`${S.coords.lat.toFixed(6)}, ${S.coords.lon.toFixed(6)}`:"GPS PENDING";const lines=["MOT PHOTO EVIDENCE",`REG: ${regClean($("reg").value)||"NOT SET"}`,`${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,`GPS: ${gps}`,`PHOTO ${num} — ${kind}`];
 const fs=Math.max(24,Math.round(c.width/42)),pad=Math.round(fs*.65),lh=Math.round(fs*1.25),bh=lines.length*lh+pad*2;x.fillStyle="rgba(0,0,0,.68)";x.fillRect(0,c.height-bh,c.width,bh);x.font=`600 ${fs}px -apple-system,sans-serif`;x.fillStyle="#fff";lines.forEach((t,i)=>x.fillText(t,pad,c.height-bh+pad+fs+i*lh));
 const blob=await new Promise(r=>c.toBlob(r,"image/jpeg",.9));return{blob,url:URL.createObjectURL(blob)}
}
function toImg(f){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=URL.createObjectURL(f)})}

$("verifyVin").onclick=async()=>{
 const vin=vinClean($("vin").value),reg=regClean($("reg").value);if(vin.length!==17)return st($("vinStatus"),"bad","VIN must contain 17 valid characters.");
 try{st($("vinStatus"),"warn","Checking VIN against MOT records…");const out=await api(`/mot/vin/${encodeURIComponent(vin)}`);const found=regClean(out.registration||out.registrationNumber||out.vehicle?.registration||"");S.vinVerified=!!found&&found===reg;st($("vinStatus"),S.vinVerified?"good":"bad",S.vinVerified?`VIN verified for ${reg}.`:`Possible wrong vehicle: VIN record shows ${found||"no registration returned"}.`);summary()}catch(e){S.vinVerified=false;st($("vinStatus"),"bad",e.message);summary()}
};

$("checkMileage").onclick=async()=>{
 const reg=regClean($("reg").value),cur=Number($("mileage").value);if(!reg||!cur)return st($("mileageStatus"),"bad","Enter registration and confirmed mileage.");
 try{st($("mileageStatus"),"warn","Checking previous MOT mileage…");const out=await api(`/mot/registration/${encodeURIComponent(reg)}`);const tests=out.motTests||out.motTestDueDate&&out.motTests||out.vehicle?.motTests||[];const vals=(tests||[]).map(t=>({v:Number(String(t.odometerValue??t.odometer?.value??"").replace(/\D/g,"")),u:(t.odometerUnit??t.odometer?.unit??"mi").toLowerCase(),d:t.completedDate??t.testDate??""})).filter(x=>x.v>0);vals.sort((a,b)=>String(b.d).localeCompare(String(a.d)));if(!vals.length){S.mileageChecked=true;st($("mileageStatus"),"warn","No usable previous MOT mileage was returned.");summary();return}let prev=vals[0].v;if(vals[0].u.startsWith("km"))prev=Math.round(prev*0.621371);const diff=cur-prev;S.mileageChecked=true;st($("mileageStatus"),diff>=0?"good":"bad",diff>=0?`Previous ${prev.toLocaleString()} mi • current is ${diff.toLocaleString()} mi higher.`:`WARNING: current mileage is ${Math.abs(diff).toLocaleString()} mi LOWER than the previous MOT reading (${prev.toLocaleString()} mi).`);summary()}catch(e){S.mileageChecked=false;st($("mileageStatus"),"bad",e.message);summary()}
};

$("submit").onclick=async()=>{
 summary();const missing=[];if(!regClean($("reg").value))missing.push("registration");if(Object.keys(S.photos).length!==3)missing.push("3 photos");if(vinClean($("vin").value).length!==17)missing.push("VIN");if(!$("mileage").value)missing.push("mileage");if(!S.coords)missing.push("GPS");if(missing.length)return st($("submitStatus"),"bad","Missing: "+missing.join(", "));
 try{st($("submitStatus"),"warn","Uploading evidence…");const fd=new FormData();fd.append("registration",regClean($("reg").value));fd.append("vin",vinClean($("vin").value));fd.append("mileage",$("mileage").value);fd.append("latitude",S.coords.lat);fd.append("longitude",S.coords.lon);Object.entries(S.photos).forEach(([n,b])=>fd.append("photo"+n,b,`mot-photo-${n}.jpg`));const out=await api("/submit",{method:"POST",body:fd});if(!out.confirmed)throw new Error("Server did not confirm receipt.");clearPhotos();st($("submitStatus"),"good",`Evidence confirmed • reference ${out.reference||"CONFIRMED"} • local photos removed.`);summary()}catch(e){st($("submitStatus"),"bad",`Upload not confirmed: ${e.message}. Local photos retained for retry.`)}
};
function clearPhotos(){for(let n=1;n<=3;n++){if($("i"+n).src)URL.revokeObjectURL($("i"+n).src);$("i"+n).removeAttribute("src");$("i"+n).classList.add("hidden");$("p"+n).value="";$("b"+n).classList.remove("done");$("b"+n).textContent=n}S.photos={}}
$("clear").onclick=()=>{clearPhotos();st($("submitStatus"),"good","Local photos cleared.");summary()}
