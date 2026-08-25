const BUILD_VERSION="8.0.0";
const RECOVERY_DB="mot-evidence-recovery-v1";
const S={
  photos:{},coords:null,driveToken:null,driveTokenExpiry:0,
  motVehicle:null,latestTest:null,regChecked:false,
  emissions:{code:"UNKNOWN",label:"Check registration",reason:"Vehicle has not been checked yet.",photoRequired:true}
};
const $=id=>document.getElementById(id);
const cleanReg=v=>String(v||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,8);
const WIZARD_STEPS=["vehicle","photo1","photo2","photo3","photo4","photo5","review"];
let currentScreen="home",recoveryReady=false;
function showScreen(name){
  currentScreen=name;
  document.querySelectorAll(".screen").forEach(e=>e.classList.remove("active"));
  $("screen-"+name)?.classList.add("active");
  const i=WIZARD_STEPS.indexOf(name),p=$("progress");
  if(i>=0){p?.classList.remove("hidden");if($("progressFill"))$("progressFill").style.width=`${((i+1)/WIZARD_STEPS.length)*100}%`;if($("progressText"))$("progressText").textContent=`${i+1} of ${WIZARD_STEPS.length}`;}
  else p?.classList.add("hidden");
  $("testHeader")?.classList.toggle("hidden",i<0);
  updateHeader(name);
  if(recoveryReady && i>=0) saveRecovery();
  window.scrollTo({top:0,behavior:"smooth"});
}
function startNewTest(){resetForNextTest();clearRecovery();showScreen("vehicle");}

function openRecoveryDb(){return new Promise((resolve,reject)=>{const q=indexedDB.open(RECOVERY_DB,1);q.onupgradeneeded=()=>q.result.createObjectStore("tests");q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)})}
async function saveRecovery(){
  try{
    const db=await openRecoveryDb(),data={savedAt:new Date().toISOString(),screen:currentScreen,photos:S.photos,coords:S.coords,motVehicle:S.motVehicle,latestTest:S.latestTest,regChecked:S.regChecked,emissions:S.emissions,reg:cleanReg($("reg")?.value),checks:{confirmReg:!!$("confirmReg")?.checked,emissionsOther:!!$("emissionsOther")?.checked,brakeOther:!!$("brakeOther")?.checked,allowDuplicate:!!$("allowDuplicate")?.checked}};
    await new Promise((resolve,reject)=>{const t=db.transaction("tests","readwrite"),q=t.objectStore("tests").put(data,"active");q.onsuccess=resolve;q.onerror=()=>reject(q.error)});db.close();
  }catch(e){console.warn("Recovery save unavailable",e)}
}
async function clearRecovery(){try{const db=await openRecoveryDb();await new Promise((resolve,reject)=>{const q=db.transaction("tests","readwrite").objectStore("tests").delete("active");q.onsuccess=resolve;q.onerror=()=>reject(q.error)});db.close()}catch(e){console.warn("Recovery clear unavailable",e)}}
async function restoreRecovery(){
  try{
    const db=await openRecoveryDb(),data=await new Promise((resolve,reject)=>{const q=db.transaction("tests").objectStore("tests").get("active");q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});db.close();
    if(!data?.reg)return false;
    S.photos=data.photos||{};S.coords=data.coords||null;S.motVehicle=data.motVehicle||null;S.latestTest=data.latestTest||null;S.regChecked=!!data.regChecked;S.emissions=data.emissions||S.emissions;
    $("reg").value=data.reg;for(const [id,value] of Object.entries(data.checks||{}))if($(id))$(id).checked=!!value;
    for(let n=1;n<=5;n++)if(S.photos[n]){$("i"+n).src=URL.createObjectURL(S.photos[n]);$("i"+n).classList.remove("hidden");if(n<=3)$("next"+n)?.classList.remove("hidden");const b=document.querySelector(`button[data-p="${n}"]`);if(b)b.textContent=`Retake Photo ${n}`}
    if(S.regChecked){status("regCheckStatus","good",`${S.motVehicle?.make||""} ${S.motVehicle?.model||""} • recovered DVSA-checked vehicle.`);updateEmissionsUI()}
    status("uploadStatus","warn",`Recovered interrupted test saved ${new Date(data.savedAt).toLocaleString()}. Photos remain on this device until upload succeeds or you clear them.`);
    showScreen(WIZARD_STEPS.includes(data.screen)?data.screen:"review");return true;
  }catch(e){console.warn("Recovery restore unavailable",e);return false}
}
function updateHeader(screen=currentScreen){
  const reg=cleanReg($("reg")?.value),count=Object.keys(S.photos).length,i=WIZARD_STEPS.indexOf(screen);
  if($("headerReg"))$("headerReg").textContent=reg||"Registration not set";
  if($("headerVehicle"))$("headerVehicle").textContent=[S.motVehicle?.make,S.motVehicle?.model].filter(Boolean).join(" ")||"Vehicle details pending";
  if($("headerProgress"))$("headerProgress").textContent=i>=0?`Step ${i+1} of ${WIZARD_STEPS.length}`:"";
  if($("headerPhotoCount"))$("headerPhotoCount").textContent=`${count} / 5 photos`;
}


function status(id,kind,msg){const e=$(id);if(!e)return;e.className="status "+kind;e.textContent=msg}
function backend(){
  const el=$("backend");
  return String(el?.value || localStorage.getItem("motBackend") || "").trim().replace(/\/$/,"");
}
function clientId(){
  const el=$("googleClientId");
  return String(el?.value || localStorage.getItem("motGoogleClientId") || "").trim();
}
function confirmations(){return {reg:!!$("confirmReg")?.checked};}

function vehicleDate(vehicle){
  return vehicle?.firstUsedDate || vehicle?.registrationDate || vehicle?.manufactureDate || "";
}
function before(date,threshold){return !!date && String(date).slice(0,10) < threshold}
function classifyEmissions(vehicle){
  const fuel=String(vehicle?.fuelType||"").trim();
  const f=fuel.toLowerCase();
  const first=vehicleDate(vehicle);

  // Clear DVSA exemptions.
  if(f==="electric"){
    return {code:"NOT_REQUIRED",label:"NOT REQUIRED",reason:"Electric vehicle — no combustion-engine emissions test.",photoRequired:false};
  }
  if(f.includes("hybrid") || f==="electric diesel"){
    return {code:"NOT_REQUIRED",label:"NOT REQUIRED",reason:"Hybrid/electric-combustion vehicle — DVSA emissions/opacity test exemption.",photoRequired:false};
  }
  if(f.includes("fuel cell")){
    return {code:"NOT_REQUIRED",label:"NOT REQUIRED",reason:"Hydrogen fuel-cell vehicle — DVSA emissions test exemption.",photoRequired:false};
  }

  // Compression ignition / diesel threshold.
  if(f==="diesel" || f==="gas diesel"){
    if(!first){
      return {code:"MANUAL_REVIEW",label:"CHECK MANUALLY",reason:"Diesel-type fuel returned but no usable first-use date was supplied.",photoRequired:true};
    }
    if(before(first,"1980-01-01")){
      return {code:"VISUAL_ONLY",label:"VISUAL ONLY",reason:"Compression-ignition vehicle first used before 1 January 1980 — no instrumented smoke-meter test required.",photoRequired:false};
    }
    return {code:"REQUIRED",label:"SMOKE TEST REQUIRED",reason:"Compression-ignition vehicle first used on/after 1 January 1980.",photoRequired:true};
  }

  // Common spark ignition fuels.
  const sparkFuels=["petrol","gas","gas bi-fuel","lpg","cng","lng"];
  if(sparkFuels.includes(f)){
    if(!first){
      return {code:"MANUAL_REVIEW",label:"CHECK MANUALLY",reason:"Spark-ignition fuel returned but no usable first-use date was supplied.",photoRequired:true};
    }
    if(before(first,"1975-08-01")){
      return {code:"VISUAL_ONLY",label:"VISUAL ONLY",reason:"Spark-ignition vehicle first used before 1 August 1975 — normal metered emissions test does not apply.",photoRequired:false};
    }
    return {code:"REQUIRED",label:"EMISSIONS TEST REQUIRED",reason:"Spark-ignition vehicle first used on/after 1 August 1975.",photoRequired:true};
  }

  // Avoid guessing on uncommon fuel classifications or special vehicle cases.
  return {code:"MANUAL_REVIEW",label:"CHECK MANUALLY",reason:`Fuel type "${fuel||"not supplied"}" needs tester judgement. Use Photo 4 or select Other if a DVSA exception applies.`,photoRequired:true};
}

function requiredPhoto4(){
  return !!S.emissions.photoRequired && !$("emissionsOther")?.checked;
}
function requiredPhoto5(){
  return !$("brakeOther")?.checked;
}
function readyReasons(){
  const reasons=[];
  if(!cleanReg($("reg")?.value)) reasons.push("registration");
  if(!S.regChecked) reasons.push("DVSA registration check");
  if(!confirmations().reg) reasons.push("registration confirmation");
  for(const n of [1,2,3]) if(!S.photos[n]) reasons.push(`Photo ${n}`);
  if(requiredPhoto4() && !S.photos[4]) reasons.push("Photo 4 emissions");
  if(requiredPhoto5() && !S.photos[5]) reasons.push("Photo 5 brake test");
  if(!S.coords) reasons.push("GPS");
  return reasons;
}
function updateEmissionsUI(){
  const e=S.emissions;
  const kind=e.code==="REQUIRED"?"warn":e.code==="MANUAL_REVIEW"?"warn":"good";
  status("emissionsRuleStatus",kind,`Emissions evidence: ${e.label}. ${e.reason}`);
  if($("emissionsPhotoHelp")){
    $("emissionsPhotoHelp").className="status "+kind;
    $("emissionsPhotoHelp").textContent =
      e.code==="REQUIRED" ? "Photo 4 is required unless the tester selects Other for a valid special circumstance." :
      e.code==="MANUAL_REVIEW" ? "Photo 4 is required unless the tester confirms a valid DVSA exception using Other." :
      `${e.label}: Photo 4 is optional. You may still take one for additional evidence.`;
  }
}
function update(){
  if($("reg")) $("reg").value=cleanReg($("reg").value);
  const reasons=readyReasons(),rs=$("readyStatus");
  if(reasons.length===0){
    rs.className="status good ready";rs.textContent="READY TO UPLOAD";
  }else{
    rs.className="status bad ready";rs.textContent="NOT READY — "+reasons.join(", ");
  }
  const pcount=Object.keys(S.photos).length;
  updateHeader();renderReviewPhotos();
  $("summary").innerHTML=[
    ["Registration",$("reg").value||"Not set"],
    ["Registration check",S.regChecked?"DVSA checked":"Not checked"],
    ["Fuel type",S.motVehicle?.fuelType||"—"],
    ["First used",vehicleDate(S.motVehicle)||"—"],
    ["Emissions evidence",S.emissions.label],
    ["Photo 4",S.photos[4]?"Captured":($("emissionsOther")?.checked?"Other selected":(requiredPhoto4()?"Required":"Optional / N/A"))],
    ["Photo 5",S.photos[5]?"Captured":($("brakeOther")?.checked?"Other selected":"Required")],
    ["GPS",S.coords?`${S.coords.lat.toFixed(6)}, ${S.coords.lon.toFixed(6)}`:"Not captured"],
    ["Photos captured",`${pcount} / 5`]
  ].map(([a,b])=>`<div>${a}</div><div><b>${b}</b></div>`).join("");
  $("uploadDrive").disabled=reasons.length>0;
  if($("vehicleNext")) $("vehicleNext").disabled=!(S.regChecked && confirmations().reg && S.coords);
  if($("previousMileage")) $("previousMileage").textContent=latestMileage(S.latestTest);
  for(let n=1;n<=3;n++) $("next"+n)?.classList.toggle("hidden",!S.photos[n]);
}
function renderReviewPhotos(){
  const box=$("reviewPhotos");if(!box)return;
  const labels=["Vehicle","VIN","Mileage","Emissions","Brake test"];
  box.innerHTML=labels.map((label,i)=>{const n=i+1,src=$("i"+n)?.src;if(!S.photos[n])return `<button class="reviewPhoto missing" data-retake="${n}">Photo ${n}<br>${label}<br>Not captured — tap to add</button>`;return `<button class="reviewPhoto" data-retake="${n}"><img src="${src}" alt="Photo ${n}: ${label}"><span>Photo ${n} — ${label}<br><b>Tap to retake</b></span></button>`}).join("");
  box.querySelectorAll("[data-retake]").forEach(b=>b.onclick=()=>showScreen("photo"+b.dataset.retake));
}

if($("backend")) $("backend").value=localStorage.getItem("motBackend")||"";
if($("googleClientId")) $("googleClientId").value=localStorage.getItem("motGoogleClientId")||"";
if($("saveBackend")) $("saveBackend").onclick=()=>{localStorage.setItem("motBackend",backend());status("connectionStatus","good","Backend URL saved.")};
if($("saveGoogleClient")) $("saveGoogleClient").onclick=()=>{localStorage.setItem("motGoogleClientId",clientId());status("connectionStatus","good","Google Client ID saved.")};

$("reg").addEventListener("input",()=>{
  S.regChecked=false;S.motVehicle=null;S.latestTest=null;
  S.emissions={code:"UNKNOWN",label:"Check registration",reason:"Vehicle has not been checked yet.",photoRequired:true};
  if($("emissionsRuleStatus")) $("emissionsRuleStatus").className="status hidden";
  updateEmissionsUI();update();if(recoveryReady)saveRecovery();
});
["confirmReg","emissionsOther","brakeOther","allowDuplicate"].forEach(id=>$(id)?.addEventListener("input",()=>{update();if(recoveryReady)saveRecovery()}));
$("startTest")?.addEventListener("click",startNewTest);
$("startNextTest")?.addEventListener("click",startNewTest);
document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>showScreen(b.dataset.go)));
document.querySelectorAll("[data-back]").forEach(b=>b.addEventListener("click",()=>showScreen(b.dataset.back)));
$("vehicleNext")?.addEventListener("click",()=>{if(S.regChecked&&confirmations().reg&&S.coords)showScreen("photo1")});
$("next4")?.addEventListener("click",()=>{if(requiredPhoto4()&&!S.photos[4])return alert("Take the emissions evidence photo, or select Other if a valid DVSA circumstance applies.");showScreen("photo5")});
$("next5")?.addEventListener("click",()=>{if(requiredPhoto5()&&!S.photos[5])return alert("Take the brake test evidence photo, or select Other if an approved alternative applies.");showScreen("review")});


async function api(path){
  if(!backend())throw new Error("Secure backend is not configured.");
  const r=await fetch(backend()+path);
  const text=await r.text();let b={};try{b=JSON.parse(text)}catch{b={message:text}}
  if(!r.ok)throw new Error(b.error||b.message||`Backend error ${r.status}`);
  return b;
}
function vehicleFromResponse(out){
  if(Array.isArray(out))return out[0]||null;
  if(Array.isArray(out?.vehicles))return out.vehicles[0]||null;
  return out||null;
}
function latestUsableTest(vehicle){
  const tests=[...(vehicle?.motTests||[])];
  tests.sort((a,b)=>String(b.completedDate||"").localeCompare(String(a.completedDate||"")));
  return tests[0]||null;
}
function latestMileage(test){
  const value=test?.odometerValue;
  if(value===undefined || value===null || value==="") return "—";
  const n=Number(String(value).replace(/,/g,""));
  const shown=Number.isFinite(n)?n.toLocaleString("en-GB"):String(value);
  const unit=String(test?.odometerUnit||"").trim();
  return unit?shown+" "+unit:shown;
}

$("checkReg").onclick=async()=>{
  const r=cleanReg($("reg").value);
  if(!r)return status("regCheckStatus","bad","Enter a registration.");
  try{
    status("regCheckStatus","warn","Checking DVSA MOT history…");
    const vehicle=vehicleFromResponse(await api(`/mot/registration/${encodeURIComponent(r)}`));
    if(!vehicle)throw new Error("No vehicle returned by DVSA.");
    S.motVehicle=vehicle;S.latestTest=latestUsableTest(vehicle);S.regChecked=true;
    S.emissions=classifyEmissions(vehicle);
    status("regCheckStatus","good",`${vehicle.make||""} ${vehicle.model||""} • registration found in MOT History.`);
    $("motSummary").innerHTML=[
      ["Make / model",`${vehicle.make||""} ${vehicle.model||""}`.trim()||"—"],
      ["Colour",vehicle.primaryColour||"—"],
      ["Fuel",vehicle.fuelType||"—"],
      ["First used",vehicleDate(vehicle)||"—"],
      ["Last MOT",S.latestTest?.completedDate||vehicle.lastMotTestDate||"—"],
      ["Last recorded MOT mileage",latestMileage(S.latestTest)],
      ["Result",S.latestTest?.testResult||"—"]
    ].map(([a,b])=>`<div>${a}</div><div><b>${b}</b></div>`).join("");
    updateEmissionsUI();if(recoveryReady)saveRecovery();
  }catch(e){
    S.regChecked=false;status("regCheckStatus","bad",e.message);
  }
  update();
};

function captureLocation(){
  if(!navigator.geolocation){
    S.coords=null;status("gpsStatus","bad","GPS unavailable on this device. Location is required for evidence watermarks.");update();
    return;
  }
  status("gpsStatus","warn","GPS: requesting a precise location…");
  navigator.geolocation.getCurrentPosition(
    p=>{S.coords={lat:p.coords.latitude,lon:p.coords.longitude,accuracy:p.coords.accuracy};status("gpsStatus","good",`GPS ready • ${S.coords.lat.toFixed(5)}, ${S.coords.lon.toFixed(5)} • accuracy ±${Math.round(p.coords.accuracy)} m`);if($("homeGps")) $("homeGps").textContent="GPS ready";update();if(recoveryReady)saveRecovery()},
    ()=>{S.coords=null;status("gpsStatus","bad","GPS not captured. Allow Location access, then tap this message to retry.");$("gpsStatus").onclick=captureLocation;if($("homeGps")) $("homeGps").textContent="Location permission required — start the test to retry";update()},
    {enableHighAccuracy:true,timeout:12000,maximumAge:0}
  );
}

document.querySelectorAll("button[data-p]").forEach(b=>b.onclick=()=>{
  if(!S.coords){
    captureLocation();
    alert("GPS location is required for the photo watermark. Allow location access, then tap the photo button again.");
    return;
  }
  $("p"+b.dataset.p).click();
});
for(let n=1;n<=5;n++){
  $("p"+n).onchange=async e=>{
    const f=e.target.files[0];if(!f)return;
    if(!cleanReg($("reg").value)){e.target.value="";return alert("Enter the registration first.");}
    const out=await watermark(f,n);S.photos[n]=out.blob;
    $("i"+n).src=out.url;$("i"+n).classList.remove("hidden");
    const captureButton=document.querySelector(`button[data-p="${n}"]`);if(captureButton)captureButton.textContent=`Retake Photo ${n}`;
    if(n===4 && $("emissionsOther").checked) $("emissionsOther").checked=false;
    if(n===5 && $("brakeOther").checked) $("brakeOther").checked=false;
    if(n<=3) $("next"+n)?.classList.remove("hidden");
    update();saveRecovery();
  };
}
async function fileToImage(file){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=URL.createObjectURL(file)})}
async function watermark(file,n){
  const img=await fileToImage(file),sc=Math.min(1,1600/Math.max(img.width,img.height)),c=document.createElement("canvas");
  c.width=Math.round(img.width*sc);c.height=Math.round(img.height*sc);
  const x=c.getContext("2d");x.drawImage(img,0,0,c.width,c.height);
  const kinds={1:"VEHICLE",2:"VIN",3:"MILEAGE",4:"EMISSIONS TEST",5:"BRAKE TEST"};
  const gps=S.coords?`${S.coords.lat.toFixed(6)}, ${S.coords.lon.toFixed(6)}`:"GPS NOT CAPTURED";
  const lines=["MOT PHOTO EVIDENCE",`REG: ${cleanReg($("reg").value)}`,new Date().toLocaleString(),`GPS: ${gps}`,`PHOTO ${n} — ${kinds[n]}`];
  const fs=Math.max(24,Math.round(c.width/42)),lh=fs*1.25,pad=fs*.65,bh=lines.length*lh+pad*2;
  x.fillStyle="rgba(0,0,0,.68)";x.fillRect(0,c.height-bh,c.width,bh);x.fillStyle="white";x.font=`600 ${fs}px -apple-system`;
  lines.forEach((t,i)=>x.fillText(t,pad,c.height-bh+pad+fs+i*lh));
  const blob=await new Promise(r=>c.toBlob(r,"image/jpeg",.82));
  return{blob,url:URL.createObjectURL(blob)}
}

async function connectDrive(){
  if(!clientId())throw new Error("Google Drive is not configured.");
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
    c.requestAccessToken({prompt:""});
  });
}
if($("connectDrive")) $("connectDrive").onclick=async()=>{try{await connectDrive()}catch(e){status("connectionStatus","bad",e.message)}};
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
  return files.filter(f=>f.name===reg||f.name.startsWith(reg+" - Attempt "));
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
async function nextAttemptName(reg,parentId){
  const existing=await findVehicleFolders(reg,parentId);
  if(existing.length===0)return reg;
  if(!$("allowDuplicate").checked)throw new Error(`This registration already has evidence archived today (${existing[0].name}). Tick "Create another attempt" only if a second record is required.`);
  let n=2,name=`${reg} - Attempt ${n}`,names=new Set(existing.map(x=>x.name));
  while(names.has(name)){n++;name=`${reg} - Attempt ${n}`}
  return name;
}
function evidenceSummary(){
  return {
    schemaVersion:"mot-evidence-v5-photo-1",
    createdAt:new Date().toISOString(),
    registration:cleanReg($("reg").value),
    registrationConfirmed:!!$("confirmReg").checked,
    dvsaRegistrationChecked:S.regChecked,
    vehicle:{
      make:S.motVehicle?.make||null,
      model:S.motVehicle?.model||null,
      primaryColour:S.motVehicle?.primaryColour||null,
      fuelType:S.motVehicle?.fuelType||null,
      firstUsedDate:S.motVehicle?.firstUsedDate||null,
      registrationDate:S.motVehicle?.registrationDate||null,
      manufactureDate:S.motVehicle?.manufactureDate||null
    },
    emissionsEvidence:{
      rule:S.emissions.code,
      label:S.emissions.label,
      reason:S.emissions.reason,
      photoRequired:S.emissions.photoRequired,
      photoCaptured:!!S.photos[4],
      testerOtherSelected:!!$("emissionsOther").checked
    },
    brakeEvidence:{
      photoCaptured:!!S.photos[5],
      testerOtherSelected:!!$("brakeOther").checked
    },
    photos:{
      vehicle:!!S.photos[1],
      vin:!!S.photos[2],
      mileage:!!S.photos[3],
      emissions:!!S.photos[4],
      brakeTest:!!S.photos[5]
    },
    gps:S.coords,
    motLatest:S.latestTest?{
      completedDate:S.latestTest.completedDate||null,
      testResult:S.latestTest.testResult||null,
      expiryDate:S.latestTest.expiryDate||null,
      odometerValue:S.latestTest.odometerValue??null,
      odometerUnit:S.latestTest.odometerUnit||null,
      odometerResultType:S.latestTest.odometerResultType||null
    }:null
  };
}

$("uploadDrive").onclick=async()=>{
  update();const reasons=readyReasons();if(reasons.length)return status("uploadStatus","bad","Complete: "+reasons.join(", "));
  try{
    status("uploadStatus","warn","Connecting to Google Drive…");
    await ensureToken();
    const root=await getFolder("MOT Evidence","root");
    const day=await getFolder(dateFolder(),root.id);
    const reg=cleanReg($("reg").value),vehicleFolderName=await nextAttemptName(reg,day.id);
    const vf=await createFolder(vehicleFolderName,day.id);

    const files=[
      [1,"01-Vehicle.jpg"],[2,"02-VIN.jpg"],[3,"03-Mileage.jpg"],
      [4,"04-Emissions.jpg"],[5,"05-Brake-Test.jpg"]
    ].filter(([n])=>!!S.photos[n]);

    for(const [n,name] of files){
      status("uploadStatus","warn",`Uploading ${name}…`);
      await uploadBlob(S.photos[n],name,vf.id,"image/jpeg");
    }
    const summaryBlob=new Blob([JSON.stringify(evidenceSummary(),null,2)],{type:"application/json"});
    status("uploadStatus","warn","Uploading evidence summary…");
    await uploadBlob(summaryBlob,"06-Evidence-Summary.json",vf.id,"application/json");

    const archivedPath=`MOT Evidence / ${dateFolder()} / ${vehicleFolderName}`;
    const completedAt=new Date(),evidenceCount=files.length,makeModel=[S.motVehicle?.make,S.motVehicle?.model].filter(Boolean).join(" ")||"—";
    if($("completeDetails")) $("completeDetails").innerHTML=[
      ["Registration",reg],["Vehicle",makeModel],["Evidence photos",String(evidenceCount)],["Drive folder",vehicleFolderName],["Completed",completedAt.toLocaleString()]
    ].map(([a,b])=>`<div>${a}</div><div><b>${b}</b></div>`).join("");
    if($("completePath")) $("completePath").textContent=archivedPath;
    await clearRecovery();resetForNextTest();
    showScreen("complete");
  }catch(e){
    status("uploadStatus","bad",`${e.message} Local photos have been retained for retry.`);
  }
};

function clearLocalPhotos(showStatus=true){
  S.photos={};
  for(let n=1;n<=5;n++){
    $("p"+n).value="";
    $("i"+n).removeAttribute("src");
    $("i"+n).classList.add("hidden");
    const captureButton=document.querySelector(`button[data-p="${n}"]`);if(captureButton){const labels=["","Vehicle","VIN","Mileage","Emissions Evidence","Brake Test"];captureButton.textContent=`Take ${labels[n]} Photo`}
  }
  if(showStatus) status("uploadStatus","warn","Local photos cleared.");
  update();if(showStatus)clearRecovery();
}
function resetForNextTest(){
  clearLocalPhotos(false);
  S.coords=null;
  S.motVehicle=null;
  S.latestTest=null;
  S.regChecked=false;
  S.emissions={code:"UNKNOWN",label:"Check registration",reason:"Vehicle has not been checked yet.",photoRequired:true};

  if($("reg")) $("reg").value="";
  ["confirmReg","emissionsOther","brakeOther","allowDuplicate"].forEach(id=>{if($(id)) $(id).checked=false;});
  for(let n=1;n<=3;n++) $("next"+n)?.classList.add("hidden");
  if($("previousMileage")) $("previousMileage").textContent="—";
  if($("motSummary")) $("motSummary").innerHTML="";
  if($("regCheckStatus")) $("regCheckStatus").className="status hidden";
  updateEmissionsUI();
  update();
  captureLocation();
}
$("clear").onclick=()=>clearLocalPhotos(true);

if($("buildVersion"))$("buildVersion").textContent=`Build v${BUILD_VERSION}`;
(async()=>{
  updateEmissionsUI();update();
  const restored=await restoreRecovery();
  recoveryReady=true;
  if(!restored)showScreen("home");
  captureLocation();
})();

