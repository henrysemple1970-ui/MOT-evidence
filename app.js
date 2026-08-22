const S={photos:{},photoLocations:{},coords:null,driveToken:null,driveTokenExpiry:0,motVehicle:null,latestTest:null,regChecked:false};
const $=id=>document.getElementById(id);
const cleanReg=v=>String(v||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,8);
function status(id,kind,msg){const e=$(id);if(!e)return;e.className="status "+kind;e.textContent=msg}
function backend(){return ($("backend")?.value||"").trim().replace(/\/$/,"")}
function hasAllPhotos(){return [1,2,3].every(n=>S.photos[n] instanceof Blob)}
function hasAllPhotoLocations(){return [1,2,3].every(n=>S.photoLocations[n])}
function readyReasons(){
  const reasons=[];
  if(!cleanReg($("reg").value))reasons.push("registration");
  if(!S.regChecked)reasons.push("DVSA registration check");
  if(!$("confirmReg").checked)reasons.push("registration confirmation");
  if(!hasAllPhotos())reasons.push("3 photos");
  if(!hasAllPhotoLocations())reasons.push("GPS for every photo");
  if(!backend())reasons.push("backend configuration");
  if(!clientId())reasons.push("Drive configuration");
  return reasons;
}
function update(){
  if(S.coords)S.coords={...S.coords,photoLocations:{...S.photoLocations}};
  $("reg").value=cleanReg($("reg").value);
  const reasons=readyReasons(),rs=$("readyStatus");
  if(!reasons.length){rs.className="status good ready";rs.textContent="READY TO UPLOAD"}
  else{rs.className="status bad ready";rs.textContent="NOT READY — "+reasons.join(", ")}
  $("summary").innerHTML=[
    ["Registration",$("reg").value||"Not set"],["Registration check",S.regChecked?"DVSA checked":"Not checked"],
    ["Registration confirmed",$("confirmReg").checked?"Confirmed":"Not confirmed"],
    ["Latest MOT",S.latestTest?`${S.latestTest.completedDate||"?"} • ${S.latestTest.testResult||"?"}`:"Not checked"],
    ["Photo 1 — Vehicle",photoSummary(1)],["Photo 2 — VIN image",photoSummary(2)],
    ["Photo 3 — Mileage image",photoSummary(3)],
    ["Latest GPS",S.coords?`${S.coords.lat.toFixed(6)}, ${S.coords.lon.toFixed(6)}`:"Not captured"],
    ["Drive",S.driveToken?"Connected":"Connects during upload"]
  ].map(([a,b])=>`<div>${a}</div><div><b>${b}</b></div>`).join("");
  $("uploadDrive").disabled=reasons.length>0;
}
function photoSummary(n){const loc=S.photoLocations[n];if(!S.photos[n])return"Missing";return loc?`Present • ${loc.lat.toFixed(6)}, ${loc.lon.toFixed(6)}`:"Present • GPS missing"}
$("backend").value=localStorage.getItem("motBackend")||"";
$("googleClientId").value=localStorage.getItem("motGoogleClientId")||"";
$("saveBackend").onclick=()=>{localStorage.setItem("motBackend",backend());status("connectionStatus","good","Backend URL saved.");update()};
$("saveGoogleClient").onclick=()=>{localStorage.setItem("motGoogleClientId",clientId());status("connectionStatus","good","Google Client ID saved.");update()};
$("reg").addEventListener("input",()=>{S.regChecked=false;S.motVehicle=null;S.latestTest=null;$("confirmReg").checked=false;$("motSummary").innerHTML="";update()});
$("confirmReg").addEventListener("input",update);$("allowDuplicate").addEventListener("input",update);
async function api(path){
  if(!backend())throw new Error("The secure backend is not configured.");
  const r=await fetch(backend()+path),text=await r.text();let b={};try{b=JSON.parse(text)}catch{b={message:text}}
  if(!r.ok)throw new Error(b.error||b.message||`Backend error ${r.status}`);return b;
}
function vehicleFromResponse(out){if(Array.isArray(out))return out[0]||null;if(out?.vehicles&&Array.isArray(out.vehicles))return out.vehicles[0]||null;return out||null}
function latestUsableTest(vehicle){const tests=[...(vehicle?.motTests||[])];tests.sort((a,b)=>String(b.completedDate||"").localeCompare(String(a.completedDate||"")));return tests.find(t=>String(t.odometerValue||"").match(/\d/))||tests[0]||null}
$("checkReg").onclick=async()=>{
  const reg=cleanReg($("reg").value);if(!reg)return status("regCheckStatus","bad","Enter a registration.");
  try{status("regCheckStatus","warn","Checking DVSA MOT history…");const vehicle=vehicleFromResponse(await api(`/mot/registration/${encodeURIComponent(reg)}`));if(!vehicle)throw new Error("No vehicle returned by DVSA.");
    S.motVehicle=vehicle;S.latestTest=latestUsableTest(vehicle);S.regChecked=true;
    status("regCheckStatus","good",`${vehicle.make||""} ${vehicle.model||""} • registration found in MOT History.`);
    $("motSummary").innerHTML=[["Make / model",`${vehicle.make||""} ${vehicle.model||""}`.trim()||"—"],["Colour",vehicle.primaryColour||"—"],["Last MOT",S.latestTest?.completedDate||vehicle.lastMotTestDate||"—"],["Result",S.latestTest?.testResult||"—"],["Recorded mileage",S.latestTest?.odometerValue?`${S.latestTest.odometerValue} ${S.latestTest.odometerUnit||""}`:"—"]].map(([a,b])=>`<div>${a}</div><div><b>${b}</b></div>`).join("");
  }catch(e){S.regChecked=false;status("regCheckStatus","bad",e.message)}update();
};
function getFreshGps(){return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(p=>resolve({lat:p.coords.latitude,lon:p.coords.longitude,accuracy:p.coords.accuracy,capturedAt:new Date().toISOString()}),reject,{enableHighAccuracy:true,timeout:12000,maximumAge:0}))}
document.querySelectorAll("button[data-p]").forEach(b=>b.onclick=()=>$("p"+b.dataset.p).click());
for(let n=1;n<=3;n++)$("p"+n).onchange=async e=>{const f=e.target.files[0];if(!f)return;if(!cleanReg($("reg").value)){e.target.value="";return alert("Enter the registration first.")}try{status(`p${n}Gps`,"warn","Getting a fresh GPS location for this photo…");const loc=await getFreshGps();S.coords=loc;const out=await watermark(f,n,loc);S.photos[n]=out.blob;S.photoLocations[n]=loc;if($("i"+n).src)URL.revokeObjectURL($("i"+n).src);$("i"+n).src=out.url;$("i"+n).classList.remove("hidden");status(`p${n}Gps`,"good",`Photo GPS • ${loc.lat.toFixed(6)}, ${loc.lon.toFixed(6)} • ±${Math.round(loc.accuracy)} m`);status("gpsStatus","good",`Latest GPS captured with Photo ${n} • ±${Math.round(loc.accuracy)} m`);update()}catch{delete S.photos[n];delete S.photoLocations[n];e.target.value="";status(`p${n}Gps`,"bad","A fresh GPS location could not be captured. Allow location access and take this photo again.");update()}};
async function fileToImage(file){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=URL.createObjectURL(file)})}
async function watermark(file,n,loc){const img=await fileToImage(file),sc=Math.min(1,1800/img.width),c=document.createElement("canvas");c.width=Math.round(img.width*sc);c.height=Math.round(img.height*sc);const x=c.getContext("2d");x.drawImage(img,0,0,c.width,c.height);const kind=n===1?"VEHICLE":n===2?"VIN IMAGE":"MILEAGE IMAGE",gps=`${loc.lat.toFixed(6)}, ${loc.lon.toFixed(6)}`,lines=["MOT PHOTO EVIDENCE",`REG: ${cleanReg($("reg").value)}`,new Date(loc.capturedAt).toLocaleString(),`GPS: ${gps} (±${Math.round(loc.accuracy)} m)`,`PHOTO ${n} — ${kind}`],fs=Math.max(24,Math.round(c.width/42)),lh=fs*1.25,pad=fs*.65,bh=lines.length*lh+pad*2;x.fillStyle="rgba(0,0,0,.68)";x.fillRect(0,c.height-bh,c.width,bh);x.fillStyle="white";x.font=`600 ${fs}px -apple-system`;lines.forEach((t,i)=>x.fillText(t,pad,c.height-bh+pad+fs+i*lh));const blob=await new Promise(r=>c.toBlob(r,"image/jpeg",.9));return{blob,url:URL.createObjectURL(blob)}}
function clientId(){return ($("googleClientId")?.value||"").trim()}
async function connectDrive(){if(!clientId())throw new Error("Google Drive is not configured.");if(!window.google?.accounts?.oauth2)throw new Error("Google sign-in is still loading. Wait a moment and try again.");return new Promise((resolve,reject)=>{const c=google.accounts.oauth2.initTokenClient({client_id:clientId(),scope:"https://www.googleapis.com/auth/drive.file",callback:r=>{if(r.error)return reject(new Error(r.error_description||r.error));S.driveToken=r.access_token;S.driveTokenExpiry=Date.now()+((r.expires_in||3600)*1000);status("connectionStatus","good","Google Drive connected.");update();resolve(r.access_token)}});c.requestAccessToken({prompt:"consent"})})}
$("connectDrive").onclick=async()=>{try{await connectDrive()}catch(e){status("connectionStatus","bad",e.message)}};
async function ensureToken(){if(S.driveToken&&Date.now()<S.driveTokenExpiry-60000)return S.driveToken;return connectDrive()}
async function driveFetch(url,opt={}){const token=await ensureToken(),h=new Headers(opt.headers||{});h.set("Authorization",`Bearer ${token}`);const r=await fetch(url,{...opt,headers:h}),t=await r.text();let b={};try{b=JSON.parse(t)}catch{b={message:t}}if(!r.ok)throw new Error(b?.error?.message||b.message||`Drive error ${r.status}`);return b}
function escQ(s){return String(s).replace(/\\/g,"\\\\").replace(/'/g,"\\'")}
async function findFolder(name,parentId){const q=`name='${escQ(name)}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;return(await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`)).files?.[0]||null}
async function findVehicleFolders(reg,parentId){const q=`mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,files=(await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`)).files||[];return files.filter(f=>f.name===reg||f.name.startsWith(reg+" - Attempt "))}
async function createFolder(name,parentId){return driveFetch("https://www.googleapis.com/drive/v3/files?fields=id,name",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,mimeType:"application/vnd.google-apps.folder",parents:[parentId]})})}
async function getFolder(name,parentId){return await findFolder(name,parentId)||await createFolder(name,parentId)}
async function uploadBlob(blob,filename,parentId,mimeType){const metadata={name:filename,parents:[parentId],mimeType},boundary="mot_"+crypto.randomUUID().replace(/-/g,""),enc=new TextEncoder(),start=enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),end=enc.encode(`\r\n--${boundary}--`),payload=new Blob([start,new Uint8Array(await blob.arrayBuffer()),end],{type:`multipart/related; boundary=${boundary}`});return driveFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name",{method:"POST",headers:{"Content-Type":`multipart/related; boundary=${boundary}`},body:payload})}
function dateFolder(){const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
async function nextAttemptName(base,parentId){const existing=await findVehicleFolders(base,parentId);if(!existing.length)return base;if(!$("allowDuplicate").checked)throw new Error(`This registration already has evidence archived today (${existing[0].name}). Tick "Create another attempt" only if a second record is required.`);let n=2,name=`${base} - Attempt ${n}`;const names=new Set(existing.map(x=>x.name));while(names.has(name)){n++;name=`${base} - Attempt ${n}`}return name}
$("uploadDrive").onclick=async()=>{update();const reasons=readyReasons();if(reasons.length)return status("uploadStatus","bad","Not ready: "+reasons.join(", "));const reg=cleanReg($("reg").value);try{status("uploadStatus","warn","Connecting to Google Drive…");await ensureToken();status("uploadStatus","warn","Checking today's archive…");const root=await getFolder("MOT Evidence","root"),day=await getFolder(dateFolder(),root.id),folderName=await nextAttemptName(reg,day.id),vehicle=await createFolder(folderName,day.id),names={1:"01-Vehicle.jpg",2:"02-VIN.jpg",3:"03-Mileage.jpg"};for(let n=1;n<=3;n++){status("uploadStatus","warn",`Uploading ${names[n]}…`);await uploadBlob(S.photos[n],names[n],vehicle.id,"image/jpeg")}const metadata={registration:reg,testerConfirmed:{registration:true},evidencePhotos:{photo1VehicleImage:true,photo2VinImage:true,photo3MileageImage:true},capturedAt:new Date().toISOString(),gps:S.coords,dvsa:{make:S.motVehicle?.make||null,model:S.motVehicle?.model||null,primaryColour:S.motVehicle?.primaryColour||null,latestMotDate:S.latestTest?.completedDate||null,latestMotResult:S.latestTest?.testResult||null,previousOdometerValue:S.latestTest?.odometerValue||null,previousOdometerUnit:S.latestTest?.odometerUnit||null,registrationChecked:S.regChecked},archive:{folder:folderName,duplicateAttempt:folderName!==reg}};await uploadBlob(new Blob([JSON.stringify(metadata,null,2)],{type:"application/json"}),"04-Evidence-Summary.json",vehicle.id,"application/json");resetTest();status("uploadStatus","good",`Upload complete: MOT Evidence / ${dateFolder()} / ${folderName}. Ready for the next test.`);update()}catch(e){status("uploadStatus","bad",`Upload stopped: ${e.message} Local photos retained.`)}};
function clearPhotos(){for(let n=1;n<=3;n++){if($("i"+n)?.src)URL.revokeObjectURL($("i"+n).src);$("i"+n).removeAttribute("src");$("i"+n).classList.add("hidden");$("p"+n).value="";$("p"+n+"Gps").className="status hidden"}S.photos={};S.photoLocations={}}
function resetTest(){clearPhotos();S.coords=null;S.motVehicle=null;S.latestTest=null;S.regChecked=false;$("reg").value="";$("confirmReg").checked=false;$("allowDuplicate").checked=false;$("motSummary").innerHTML="";$("regCheckStatus").className="status hidden"}
$("clear").onclick=()=>{clearPhotos();status("uploadStatus","good","Local photos cleared.");update()};update();

