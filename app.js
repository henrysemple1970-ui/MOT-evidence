const S={
  photos:{},coords:null,driveToken:null,driveTokenExpiry:0,
  motVehicle:null,latestTest:null,regChecked:false,vinVerified:false,
  mileageChecked:false,mileageWarning:false
};
const $=id=>document.getElementById(id);
const cleanReg=v=>String(v||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,8);
const cleanVIN=v=>String(v||"").toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g,"").slice(0,17);

function status(id,kind,msg){const e=$(id);if(!e)return;e.className="status "+kind;e.textContent=msg}
function backend(){return (localStorage.getItem("motBackend")||"").trim().replace(/\/$/,"")}
function clientId(){return (localStorage.getItem("motGoogleClientId")||"").trim()}
function hasSetup(){return !!backend()&&!!clientId()}
function confirmations(){
  return {reg:$("confirmReg").checked,vin:$("confirmVin").checked,mileage:$("confirmMileage").checked};
}
function readyReasons(){
  const c=confirmations(), reasons=[];
  if(!cleanReg($("reg").value)) reasons.push("registration");
  if(!S.regChecked) reasons.push("DVSA registration check");
  if(!c.reg) reasons.push("registration confirmation");
  if(Object.keys(S.photos).length!==3) reasons.push("3 photos");
  if(cleanVIN($("vin").value).length!==17) reasons.push("17-character VIN");
  if(!c.vin) reasons.push("VIN confirmation");
  if(!S.vinVerified) reasons.push("DVSA VIN verification");
  if(!(Number($("mileage").value)>0)) reasons.push("mileage");
  if(!c.mileage) reasons.push("mileage confirmation");
  if(!S.mileageChecked) reasons.push("mileage comparison");
  if(!S.coords) reasons.push("GPS");
  if(!hasSetup()) reasons.push("app setup");
  return reasons;
}
function update(){
  $("reg").value=cleanReg($("reg").value);
  $("vin").value=cleanVIN($("vin").value);
  const reasons=readyReasons();
  const rs=$("readyStatus");
  if(reasons.length===0){
    rs.className="status good ready";rs.textContent=S.mileageWarning?"READY TO UPLOAD — MILEAGE WARNING RECORDED":"READY TO UPLOAD";
  }else{
    rs.className="status bad ready";rs.textContent="NOT READY — "+reasons.join(", ");
  }
  $("summary").innerHTML=[
    ["Registration",$("reg").value||"Not set"],
    ["Tester confirmation",confirmations().reg&&confirmations().vin&&confirmations().mileage?"All confirmed":"Incomplete"],
    ["Latest MOT",S.latestTest?`${S.latestTest.completedDate||"?"} • ${S.latestTest.testResult||"?"}`:"Not checked"],
    ["VIN check",S.vinVerified?"Verified":"Not verified"],
    ["Mileage check",S.mileageChecked?(S.mileageWarning?"WARNING recorded":"Checked"):"Not checked"],
    ["GPS",S.coords?`${S.coords.lat.toFixed(6)}, ${S.coords.lon.toFixed(6)}`:"Not captured"],
    ["Photos",`${Object.keys(S.photos).length} / 3`],
    ["Drive",S.driveToken?"Connected":"Connects when upload starts"]
  ].map(([a,b])=>`<div>${a}</div><div><b>${b}</b></div>`).join("");
  $("setupStatus").classList.toggle("hidden",hasSetup());
  $("uploadDrive").disabled=reasons.length>0;
}

["reg","vin","mileage","confirmReg","confirmVin","confirmMileage","allowDuplicate"].forEach(id=>$(id).addEventListener("input",()=>{
  if(id==="reg"){S.regChecked=false;S.vinVerified=false;S.mileageChecked=false}
  if(id==="vin")S.vinVerified=false;
  if(id==="mileage")S.mileageChecked=false;
  update();
}));

async function api(path){
  if(!backend())throw new Error("App setup required. Ask the administrator to configure this device.");
  const r=await fetch(backend()+path);
  const text=await r.text();let b={};try{b=JSON.parse(text)}catch{b={message:text}}
  if(!r.ok)throw new Error(b.error||b.message||`Backend error ${r.status}`);
  return b;
}
function vehicleFromResponse(out){
  if(Array.isArray(out))return out[0]||null;
  if(out?.vehicles&&Array.isArray(out.vehicles))return out.vehicles[0]||null;
  return out||null;
}
function latestUsableTest(vehicle){
  const tests=[...(vehicle?.motTests||[])];
  tests.sort((a,b)=>String(b.completedDate||"").localeCompare(String(a.completedDate||"")));
  return tests.find(t=>String(t.odometerValue||"").match(/\d/))||tests[0]||null;
}

$("checkReg").onclick=async()=>{
  const r=cleanReg($("reg").value);
  if(!r)return status("regCheckStatus","bad","Enter a registration.");
  try{
    status("regCheckStatus","warn","Checking DVSA MOT history…");
    const vehicle=vehicleFromResponse(await api(`/mot/registration/${encodeURIComponent(r)}`));
    if(!vehicle)throw new Error("No vehicle returned by DVSA.");
    S.motVehicle=vehicle;S.latestTest=latestUsableTest(vehicle);S.regChecked=true;
    status("regCheckStatus","good",`${vehicle.make||""} ${vehicle.model||""} • registration found in MOT History.`);
    $("motSummary").innerHTML=[
      ["Make / model",`${vehicle.make||""} ${vehicle.model||""}`.trim()||"—"],
      ["Colour",vehicle.primaryColour||"—"],
      ["Last MOT",S.latestTest?.completedDate||vehicle.lastMotTestDate||"—"],
      ["Result",S.latestTest?.testResult||"—"],
      ["Recorded mileage",S.latestTest?.odometerValue?`${S.latestTest.odometerValue} ${S.latestTest.odometerUnit||""}`:"—"]
    ].map(([a,b])=>`<div>${a}</div><div><b>${b}</b></div>`).join("");
  }catch(e){
    S.regChecked=false;status("regCheckStatus","bad",e.message);
  }update();
};

$("checkVin").onclick=async()=>{
  const v=cleanVIN($("vin").value),r=cleanReg($("reg").value);
  if(!$("confirmVin").checked)return status("vinStatus","bad","Confirm the VIN first.");
  if(v.length!==17)return status("vinStatus","bad","VIN must be 17 valid characters (I, O and Q are not used).");
  if(!r)return status("vinStatus","bad","Enter the registration first.");
  try{
    status("vinStatus","warn","Checking VIN with DVSA…");
    const vehicle=vehicleFromResponse(await api(`/mot/vin/${encodeURIComponent(v)}`));
    const found=cleanReg(vehicle?.registration||vehicle?.registrationNumber||"");
    S.vinVerified=!!found&&found===r;
    status("vinStatus",S.vinVerified?"good":"bad",
      S.vinVerified?`VIN verified against registration ${r}.`:`VIN verification failed. DVSA returned ${found||"no matching registration"}.`);
  }catch(e){S.vinVerified=false;status("vinStatus","bad",e.message)}
  update();
};

$("checkMileage").onclick=async()=>{
  const r=cleanReg($("reg").value),current=Number($("mileage").value);
  if(!$("confirmMileage").checked)return status("mileageStatus","bad","Confirm the mileage first.");
  if(!r||!(current>0))return status("mileageStatus","bad","Enter registration and mileage.");
  try{
    status("mileageStatus","warn","Comparing with DVSA MOT history…");
    if(!S.motVehicle)S.motVehicle=vehicleFromResponse(await api(`/mot/registration/${encodeURIComponent(r)}`));
    S.latestTest=latestUsableTest(S.motVehicle);
    if(!S.latestTest?.odometerValue){
      S.mileageChecked=true;S.mileageWarning=false;
      status("mileageStatus","warn","No usable previous mileage was returned. Manual mileage is recorded.");
      update();return;
    }
    let previous=Number(String(S.latestTest.odometerValue).replace(/\D/g,""));
    const unit=String(S.latestTest.odometerUnit||"MI").toUpperCase();
    if(unit==="KM")previous=Math.round(previous*0.621371);
    const diff=current-previous;
    S.mileageChecked=true;S.mileageWarning=diff<0;
    status("mileageStatus",diff<0?"bad":"good",
      diff<0
        ?`WARNING: current mileage is ${Math.abs(diff).toLocaleString()} miles LOWER than previous MOT (${previous.toLocaleString()} mi). This warning will be stored with the evidence.`
        :`Previous MOT: ${previous.toLocaleString()} mi • current reading is ${diff.toLocaleString()} mi higher.`);
  }catch(e){S.mileageChecked=false;status("mileageStatus","bad",e.message)}
  update();
};

$("gps").onclick=()=>navigator.geolocation.getCurrentPosition(
  p=>{S.coords={lat:p.coords.latitude,lon:p.coords.longitude,accuracy:p.coords.accuracy};status("gpsStatus","good",`GPS captured • ±${Math.round(p.coords.accuracy)} m`);update()},
  ()=>status("gpsStatus","bad","Location permission not granted."),
  {enableHighAccuracy:true,timeout:12000,maximumAge:0}
);

document.querySelectorAll("button[data-p]").forEach(b=>b.onclick=()=>$("p"+b.dataset.p).click());
for(let n=1;n<=3;n++){
  $("p"+n).onchange=async e=>{
    const f=e.target.files[0];if(!f)return;
    if(!cleanReg($("reg").value)){e.target.value="";return alert("Enter the registration first.");}
    const out=await watermark(f,n);S.photos[n]=out.blob;
    $("i"+n).src=out.url;$("i"+n).classList.remove("hidden");update();
  };
}
async function fileToImage(file){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=URL.createObjectURL(file)})}
async function watermark(file,n){
  const img=await fileToImage(file),sc=Math.min(1,1800/img.width),c=document.createElement("canvas");
  c.width=Math.round(img.width*sc);c.height=Math.round(img.height*sc);
  const x=c.getContext("2d");x.drawImage(img,0,0,c.width,c.height);
  const kind=n===1?"VEHICLE":n===2?"VIN":"MILEAGE";
  const gps=S.coords?`${S.coords.lat.toFixed(6)}, ${S.coords.lon.toFixed(6)}`:"GPS NOT CAPTURED";
  const lines=["MOT PHOTO EVIDENCE",`REG: ${cleanReg($("reg").value)}`,new Date().toLocaleString(),`GPS: ${gps}`,`PHOTO ${n} — ${kind}`];
  const fs=Math.max(24,Math.round(c.width/42)),lh=fs*1.25,pad=fs*.65,bh=lines.length*lh+pad*2;
  x.fillStyle="rgba(0,0,0,.68)";x.fillRect(0,c.height-bh,c.width,bh);x.fillStyle="white";x.font=`600 ${fs}px -apple-system`;
  lines.forEach((t,i)=>x.fillText(t,pad,c.height-bh+pad+fs+i*lh));
  const blob=await new Promise(r=>c.toBlob(r,"image/jpeg",.9));
  return{blob,url:URL.createObjectURL(blob)}
}

async function connectDrive(){
  if(!clientId())throw new Error("App setup required. Ask the administrator to configure this device.");
  if(!window.google?.accounts?.oauth2)throw new Error("Google sign-in is still loading.");
  return new Promise((resolve,reject)=>{
    const c=google.accounts.oauth2.initTokenClient({
      client_id:clientId(),scope:"https://www.googleapis.com/auth/drive.file",
      callback:r=>{
        if(r.error)return reject(new Error(r.error_description||r.error));
        S.driveToken=r.access_token;S.driveTokenExpiry=Date.now()+((r.expires_in||3600)*1000);
        update();resolve(r.access_token);
      }
    });
    c.requestAccessToken({prompt:"consent"});
  });
}
async function ensureToken(){if(S.driveToken&&Date.now()<S.driveTokenExpiry-60000)return S.driveToken;return connectDrive()}
async function driveFetch(url,opt={}){
  const token=await ensureToken(),h=new Headers(opt.headers||{});h.set("Authorization",`Bearer ${token}`);
  const r=await fetch(url,{...opt,headers:h}),t=await r.text();let b={};try{b=JSON.parse(t)}catch{b={message:t}}
  if(!r.ok)throw new Error(b?.error?.message||b.message||`Drive error ${r.status}`);return b;
}
function escQ(s){return String(s).replace(/\\/g,"\\\\").replace(/'/g,"\\'")}
async function findFolder(name,parentId){
  const q=`name='${escQ(name)}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  return (await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`)).files?.[0]||null;
}
async function findVehicleFolders(reg,parentId){
  const q=`mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const files=(await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`)).files||[];
  return files.filter(f=>f.name===reg||f.name.startsWith(reg+" - "));
}
async function createFolder(name,parentId){return driveFetch("https://www.googleapis.com/drive/v3/files?fields=id,name",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,mimeType:"application/vnd.google-apps.folder",parents:[parentId]})})}
async function getFolder(name,parentId){return await findFolder(name,parentId)||await createFolder(name,parentId)}
async function uploadBlob(blob,filename,parentId,mimeType){
  const metadata={name:filename,parents:[parentId],mimeType},boundary="mot_"+crypto.randomUUID().replace(/-/g,""),enc=new TextEncoder();
  const start=enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`);
  const end=enc.encode(`\r\n--${boundary}--`);
  const payload=new Blob([start,new Uint8Array(await blob.arrayBuffer()),end],{type:`multipart/related; boundary=${boundary}`});
  return driveFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name",{method:"POST",headers:{"Content-Type":`multipart/related; boundary=${boundary}`},body:payload});
}
function dateFolder(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
async function nextAttemptName(base,parentId){
  const existing=await findVehicleFolders(cleanReg($("reg").value),parentId);
  if(existing.length===0)return base;
  if(!$("allowDuplicate").checked)throw new Error(`This registration already has evidence archived today (${existing[0].name}). Tick "Create another attempt" only if a second record is required.`);
  let n=2,name=`${base} - Attempt ${n}`;
  const names=new Set(existing.map(x=>x.name));
  while(names.has(name)){n++;name=`${base} - Attempt ${n}`}
  return name;
}

$("uploadDrive").onclick=async()=>{
  update();const reasons=readyReasons();if(reasons.length)return status("uploadStatus","bad","Not ready: "+reasons.join(", "));
  const reg=cleanReg($("reg").value),mileage=Number($("mileage").value);
  try{
    status("uploadStatus","warn","Checking today's archive…");
    const root=await getFolder("MOT Evidence","root"),day=await getFolder(dateFolder(),root.id);
    const base=`${reg} - ${mileage}mi`;
    const folderName=await nextAttemptName(base,day.id);
    const vehicle=await createFolder(folderName,day.id);
    const names={1:"01-Vehicle.jpg",2:"02-VIN.jpg",3:"03-Mileage.jpg"};
    for(let n=1;n<=3;n++){status("uploadStatus","warn",`Uploading ${names[n]}…`);await uploadBlob(S.photos[n],names[n],vehicle.id,"image/jpeg")}
    const metadata={
      registration:reg,vin:cleanVIN($("vin").value),currentMileageMiles:mileage,
      testerConfirmed:{registration:true,vin:true,mileage:true},
      capturedAt:new Date().toISOString(),gps:S.coords,
      dvsa:{make:S.motVehicle?.make||null,model:S.motVehicle?.model||null,primaryColour:S.motVehicle?.primaryColour||null,
        latestMotDate:S.latestTest?.completedDate||null,latestMotResult:S.latestTest?.testResult||null,
        previousOdometerValue:S.latestTest?.odometerValue||null,previousOdometerUnit:S.latestTest?.odometerUnit||null,
        registrationChecked:S.regChecked,vinVerified:S.vinVerified,mileageChecked:S.mileageChecked,mileageWarning:S.mileageWarning},
      archive:{folder:folderName,duplicateAttempt:folderName!==base}
    };
    await uploadBlob(new Blob([JSON.stringify(metadata,null,2)],{type:"application/json"}),"04-Evidence-Summary.json",vehicle.id,"application/json");
    clearPhotos();
    status("uploadStatus","good",`Complete: MOT Evidence / ${dateFolder()} / ${folderName}. Local photos removed.`);
    update();
  }catch(e){status("uploadStatus","bad",`Upload stopped: ${e.message} Local photos retained.`)}
};

function clearPhotos(){
  for(let n=1;n<=3;n++){
    if($("i"+n)?.src)URL.revokeObjectURL($("i"+n).src);
    $("i"+n).removeAttribute("src");$("i"+n).classList.add("hidden");$("p"+n).value="";
  }
  S.photos={};
}
$("clear").onclick=()=>{clearPhotos();status("uploadStatus","good","Local photos cleared.");update()};
update();

