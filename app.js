
const S={photos:{},coords:null,driveToken:null,driveTokenExpiry:0};
const $=id=>document.getElementById(id);
const cleanReg=v=>String(v||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,8);
const cleanVIN=v=>String(v||"").toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g,"").slice(0,17);
function status(id,kind,msg){const el=$(id);if(!el)return;el.className="status "+kind;el.textContent=msg}

$("googleClientId").value=localStorage.getItem("motGoogleClientId")||"";
$("saveGoogleClient").onclick=()=>{localStorage.setItem("motGoogleClientId",$("googleClientId").value.trim());status("driveStatus","good","Google client ID saved on this device.")};

function update(){
  $("reg").value=cleanReg($("reg").value);
  $("vin").value=cleanVIN($("vin").value);
  $("mileage").value=String($("mileage").value||"").replace(/\D/g,"").slice(0,8);
  $("summary").innerHTML=[
    ["Registration",$("reg").value||"Not set"],["VIN",$("vin").value||"Not entered"],["Mileage",$("mileage").value||"Not entered"],
    ["GPS",S.coords?`${S.coords.lat.toFixed(6)}, ${S.coords.lon.toFixed(6)}`:"Not captured"],
    ["Photos",`${Object.keys(S.photos).length} / 3`],["Google Drive",S.driveToken?"Connected":"Not connected"]
  ].map(([a,b])=>`<div>${a}</div><div><b>${b}</b></div>`).join("");
}
["reg","vin","mileage"].forEach(id=>$(id).addEventListener("input",update));update();

$("gps").onclick=()=>{
  if(!navigator.geolocation)return status("gpsStatus","bad","Geolocation is unavailable.");
  status("gpsStatus","warn","Requesting location…");
  navigator.geolocation.getCurrentPosition(
    p=>{S.coords={lat:p.coords.latitude,lon:p.coords.longitude,accuracy:p.coords.accuracy};status("gpsStatus","good",`GPS captured • ±${Math.round(p.coords.accuracy)} m`);update()},
    ()=>status("gpsStatus","bad","Location permission was not granted."),
    {enableHighAccuracy:true,timeout:12000,maximumAge:0}
  );
};

document.querySelectorAll("button[data-p]").forEach(btn=>btn.onclick=()=>$("p"+btn.dataset.p).click());
for(let n=1;n<=3;n++){
  $("p"+n).addEventListener("change",async e=>{
    const file=e.target.files[0]; if(!file)return;
    if(!cleanReg($("reg").value)){e.target.value="";alert("Enter the vehicle registration before taking evidence photos.");return}
    const processed=await watermark(file,n);
    S.photos[n]=processed.blob;$("i"+n).src=processed.url;$("i"+n).classList.remove("hidden");$("b"+n).classList.add("done");$("b"+n).textContent="✓";update();
  });
}

async function fileToImage(file){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=URL.createObjectURL(file)})}
async function watermark(file,n){
  const img=await fileToImage(file),maxWidth=1800,scale=Math.min(1,maxWidth/img.width);
  const canvas=document.createElement("canvas");canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);
  const ctx=canvas.getContext("2d");ctx.drawImage(img,0,0,canvas.width,canvas.height);
  const type=n===1?"VEHICLE":n===2?"VIN":"MILEAGE";
  const gps=S.coords?`${S.coords.lat.toFixed(6)}, ${S.coords.lon.toFixed(6)}`:"GPS NOT CAPTURED";
  const lines=["MOT PHOTO EVIDENCE",`REG: ${cleanReg($("reg").value)}`,new Date().toLocaleString(),`GPS: ${gps}`,`PHOTO ${n} — ${type}`];
  const font=Math.max(24,Math.round(canvas.width/42)),lineHeight=Math.round(font*1.25),pad=Math.round(font*.65),boxHeight=lines.length*lineHeight+pad*2;
  ctx.fillStyle="rgba(0,0,0,.68)";ctx.fillRect(0,canvas.height-boxHeight,canvas.width,boxHeight);ctx.fillStyle="white";ctx.font=`600 ${font}px -apple-system, sans-serif`;
  lines.forEach((line,i)=>ctx.fillText(line,pad,canvas.height-boxHeight+pad+font+i*lineHeight));
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.9));
  return {blob,url:URL.createObjectURL(blob)};
}

function googleClientId(){return $("googleClientId").value.trim()}
async function connectDrive(){
  if(!googleClientId())throw new Error("Enter your Google OAuth Client ID first.");
  if(!window.google?.accounts?.oauth2)throw new Error("Google sign-in library is still loading. Try again in a moment.");
  return new Promise((resolve,reject)=>{
    const client=google.accounts.oauth2.initTokenClient({
      client_id:googleClientId(),
      scope:"https://www.googleapis.com/auth/drive.file",
      callback:(response)=>{
        if(response.error){reject(new Error(response.error_description||response.error));return}
        S.driveToken=response.access_token;S.driveTokenExpiry=Date.now()+((response.expires_in||3600)*1000);
        status("driveStatus","good","Google Drive connected.");update();resolve(response.access_token);
      }
    });
    client.requestAccessToken({prompt:"consent"});
  });
}
$("connectDrive").onclick=async()=>{try{status("driveStatus","warn","Connecting to Google Drive…");await connectDrive()}catch(e){status("driveStatus","bad",e.message)}};

async function ensureDriveToken(){if(S.driveToken&&Date.now()<S.driveTokenExpiry-60000)return S.driveToken;return connectDrive()}
async function driveFetch(url,opt={}){
  const token=await ensureDriveToken(),headers=new Headers(opt.headers||{});headers.set("Authorization",`Bearer ${token}`);
  const res=await fetch(url,{...opt,headers}),text=await res.text();let body={};try{body=JSON.parse(text)}catch{body={message:text}}
  if(!res.ok)throw new Error(body?.error?.message||body.message||`Google Drive error ${res.status}`);
  return body;
}

function escQ(s){return String(s).replace(/\\/g,"\\\\").replace(/'/g,"\\'")}
async function findFolder(name,parentId){
  const q=`name='${escQ(name)}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  return (await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`)).files?.[0]||null;
}
async function createFolder(name,parentId){
  return driveFetch("https://www.googleapis.com/drive/v3/files?fields=id,name",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,mimeType:"application/vnd.google-apps.folder",parents:[parentId]})});
}
async function getOrCreateFolder(name,parentId){return await findFolder(name,parentId)||await createFolder(name,parentId)}

async function uploadJpeg(blob,filename,parentId){
  const metadata={name:filename,parents:[parentId],mimeType:"image/jpeg"};
  const boundary="mot_"+crypto.randomUUID().replace(/-/g,""),enc=new TextEncoder();
  const start=enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`);
  const end=enc.encode(`\r\n--${boundary}--`);
  const payload=new Blob([start,new Uint8Array(await blob.arrayBuffer()),end],{type:`multipart/related; boundary=${boundary}`});
  return driveFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",{method:"POST",headers:{"Content-Type":`multipart/related; boundary=${boundary}`},body:payload});
}
function todayFolder(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}

$("uploadDrive").onclick=async()=>{
  update();const registration=cleanReg($("reg").value),missing=[];
  if(!registration)missing.push("registration");if(Object.keys(S.photos).length!==3)missing.push("all 3 photos");if(!S.coords)missing.push("GPS");
  if(missing.length)return status("uploadStatus","bad","Missing: "+missing.join(", "));
  try{
    status("uploadStatus","warn","Connecting to Drive and creating folders…");await ensureDriveToken();
    const root=await getOrCreateFolder("MOT Evidence","root");
    const day=await getOrCreateFolder(todayFolder(),root.id);
    const vehicle=await getOrCreateFolder(registration,day.id);
    const names={1:"01-Vehicle.jpg",2:"02-VIN.jpg",3:"03-Mileage.jpg"};
    for(let n=1;n<=3;n++){status("uploadStatus","warn",`Uploading ${names[n]}…`);await uploadJpeg(S.photos[n],names[n],vehicle.id)}
    status("uploadStatus","good",`Upload complete: MOT Evidence / ${todayFolder()} / ${registration}. Local photos have been removed.`);
    clearLocalPhotos();update();
  }catch(e){status("uploadStatus","bad",`Upload failed: ${e.message}. Local photos have been kept for retry.`)}
};

function clearLocalPhotos(){
  for(let n=1;n<=3;n++){
    const img=$("i"+n);if(img?.src){URL.revokeObjectURL(img.src);img.removeAttribute("src");img.classList.add("hidden")}
    $("p"+n).value="";$("b"+n).classList.remove("done");$("b"+n).textContent=n;
  }
  S.photos={};
}
$("clear").onclick=()=>{clearLocalPhotos();status("uploadStatus","good","Local photos cleared.");update()};
