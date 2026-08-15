
const state = {
  reg: "", vin: "", mileage: "", coords: null, photos: {}, submitted: false
};

const $ = id => document.getElementById(id);
const cleanReg = v => v.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,8);
const cleanVIN = v => v.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g,"").slice(0,17);

function status(el, kind, msg){
  el.className = "status " + kind;
  el.textContent = msg;
}
function updateSummary(){
  state.reg = cleanReg($("reg").value);
  state.vin = cleanVIN($("vin").value);
  state.mileage = $("mileage").value.replace(/\D/g,"").slice(0,8);
  $("reg").value = state.reg;
  $("vin").value = state.vin;
  $("mileage").value = state.mileage;
  const rows = [
    ["Registration", state.reg || "Not set"],
    ["VIN", state.vin || "Not confirmed"],
    ["Mileage", state.mileage ? Number(state.mileage).toLocaleString()+" miles" : "Not confirmed"],
    ["GPS", state.coords ? `${state.coords.lat.toFixed(6)}, ${state.coords.lon.toFixed(6)}` : "Not captured"],
    ["Photos", `${Object.keys(state.photos).length} / 3`],
  ];
  $("summary").innerHTML = rows.map(([a,b])=>`<div>${a}</div><div><b>${b}</b></div>`).join("");
}
["reg","vin","mileage"].forEach(id => $(id).addEventListener("input", updateSummary));

$("demoReg").onclick = () => {
  $("reg").value = "AB12CDE";
  state.reg = "AB12CDE";
  status($("vehicleStatus"), "good", "Demo vehicle loaded: AB12 CDE.");
  updateSummary();
};

$("scanPlate").onclick = () => {
  if (!state.reg) {
    status($("vehicleStatus"), "warn", "Prototype ANPR hook ready. For now, enter the registration manually or use Demo vehicle.");
  } else {
    status($("vehicleStatus"), "good", `Registration confirmed: ${state.reg}`);
  }
};

$("getLocation").onclick = () => {
  if (!navigator.geolocation) return status($("gpsStatus"), "bad", "Geolocation is not supported on this device.");
  status($("gpsStatus"), "warn", "Requesting location…");
  navigator.geolocation.getCurrentPosition(
    p => {
      state.coords = {lat:p.coords.latitude, lon:p.coords.longitude, acc:p.coords.accuracy};
      status($("gpsStatus"), "good", `GPS captured • ±${Math.round(p.coords.accuracy)} m`);
      updateSummary();
    },
    e => status($("gpsStatus"), "bad", "Location permission was not granted."),
    {enableHighAccuracy:true, timeout:12000, maximumAge:0}
  );
};

document.querySelectorAll("button[data-photo]").forEach(btn=>{
  btn.onclick = () => $("p"+btn.dataset.photo).click();
});

for(let n=1;n<=3;n++){
  $("p"+n).addEventListener("change", async e=>{
    const file = e.target.files[0]; if(!file) return;
    if(!state.coords){
      status($("gpsStatus"), "warn", "Capture GPS before final submission.");
    }
    const type = n===1 ? "VEHICLE" : n===2 ? "VIN" : "MILEAGE";
    const result = await watermark(file, type, n);
    state.photos[n] = result.blob;
    $("i"+n).src = result.url;
    $("i"+n).classList.remove("hidden");
    $("b"+n).classList.add("done");
    $("b"+n).textContent = "✓";

    if(n===2 && !$("vin").value){
      status($("vinStatus"), "warn", "VIN OCR hook ready. Enter/confirm the 17-character VIN for this browser prototype.");
    }
    if(n===3 && !$("mileage").value){
      status($("mileageStatus"), "warn", "Mileage OCR hook ready. Enter/confirm the odometer reading.");
    }
    updateSummary();
  });
}

async function watermark(file, type, num){
  const img = await fileToImage(file);
  const maxW = 1800;
  const scale = Math.min(1, maxW / img.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img,0,0,canvas.width,canvas.height);

  const now = new Date();
  const gps = state.coords ? `${state.coords.lat.toFixed(6)}, ${state.coords.lon.toFixed(6)}` : "GPS PENDING";
  const lines = [
    "MOT PHOTO EVIDENCE",
    `REG: ${cleanReg($("reg").value) || "NOT SET"}`,
    `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`,
    `GPS: ${gps}`,
    `PHOTO ${num} — ${type}`
  ];

  const font = Math.max(24, Math.round(canvas.width/42));
  const pad = Math.round(font*.65), lineH = Math.round(font*1.25);
  const boxH = lines.length*lineH + pad*2;
  ctx.fillStyle="rgba(0,0,0,.65)";
  ctx.fillRect(0,canvas.height-boxH,canvas.width,boxH);
  ctx.font=`600 ${font}px -apple-system, sans-serif`;
  ctx.fillStyle="white";
  lines.forEach((t,i)=>ctx.fillText(t,pad,canvas.height-boxH+pad+font+i*lineH));
  const blob = await new Promise(r=>canvas.toBlob(r,"image/jpeg",0.9));
  return {blob, url:URL.createObjectURL(blob)};
}

function fileToImage(file){
  return new Promise((resolve,reject)=>{
    const img = new Image();
    img.onload=()=>resolve(img); img.onerror=reject;
    img.src=URL.createObjectURL(file);
  });
}

function validate(){
  updateSummary();
  const errors=[];
  if(!state.reg) errors.push("registration");
  if(Object.keys(state.photos).length!==3) errors.push("all three photos");
  if(state.vin.length!==17) errors.push("confirmed 17-character VIN");
  if(!state.mileage) errors.push("confirmed mileage");
  if(!state.coords) errors.push("GPS location");
  return errors;
}

$("submitBtn").onclick = async () => {
  const errors=validate();
  if(errors.length) return status($("submitStatus"),"bad","Cannot submit: missing "+errors.join(", ")+".");
  const endpoint = $("uploadUrl").value.trim();
  status($("submitStatus"),"warn","Submitting evidence…");

  try{
    let ref;
    if(endpoint){
      const fd = new FormData();
      fd.append("registration",state.reg);
      fd.append("vin",state.vin);
      fd.append("mileage",state.mileage);
      fd.append("latitude",state.coords.lat);
      fd.append("longitude",state.coords.lon);
      Object.entries(state.photos).forEach(([n,b])=>fd.append(`photo${n}`,b,`mot-photo-${n}.jpg`));
      const res = await fetch(endpoint,{method:"POST",body:fd});
      if(!res.ok) throw new Error("Upload failed");
      const body = await res.json().catch(()=>({}));
      ref = body.reference || body.id || "SERVER-CONFIRMED";
    }else{
      await new Promise(r=>setTimeout(r,700));
      ref = "DEMO-"+Date.now().toString().slice(-8);
    }

    state.submitted=true;
    clearPhotosOnly();
    status($("submitStatus"),"good",`Evidence successfully uploaded • Reference ${ref} • Local photographs removed.`);
    updateSummary();
  }catch(e){
    status($("submitStatus"),"bad","Upload was not confirmed. Local photographs have been retained for retry.");
  }
};

function clearPhotosOnly(){
  for(let n=1;n<=3;n++){
    if($("i"+n).src) URL.revokeObjectURL($("i"+n).src);
    $("i"+n).removeAttribute("src");
    $("i"+n).classList.add("hidden");
    $("p"+n).value="";
    $("b"+n).classList.remove("done");
    $("b"+n).textContent=n;
  }
  state.photos={};
}

$("clearBtn").onclick=()=>{
  clearPhotosOnly();
  state.vin=""; state.mileage="";
  $("vin").value=""; $("mileage").value="";
  status($("submitStatus"),"good","Local evidence cleared from this browser session.");
  updateSummary();
};

updateSummary();
