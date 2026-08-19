
const S={
  plan:"basic",
  photos:{},
  coords:null,
  p1ok:false,
  vinVerified:false,
  mileageChecked:false
};

const $=id=>document.getElementById(id);

const reg=v=>String(v||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,8);
const vin=v=>String(v||"").toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g,"").slice(0,17);

function st(id,k,m){
  const e=$(id);
  if(!e)return;
  e.className="status "+k;
  e.textContent=m;
}

function backend(){ return (($("backend")?.value)||"").replace(/\/$/,""); }

if($("backend")) $("backend").value=localStorage.getItem("motBackend")||"";
if($("saveBackend")){
  $("saveBackend").onclick=()=>{
    localStorage.setItem("motBackend",backend());
    st("backendStatus","good","Backend saved on this device.");
  };
}

async function api(path,opt={}){
  if(!backend())throw new Error("Enter the secure backend URL first.");
  const r=await fetch(backend()+path,opt);
  const txt=await r.text();
  let b={}; try{b=JSON.parse(txt)}catch{b={message:txt}}
  if(!r.ok)throw new Error(b.error||b.message||`Request failed (${r.status})`);
  return b;
}

function setPlan(plan){
  S.plan=plan;
  const pro=plan==="pro";

  if($("basicPlan"))$("basicPlan").className=pro?"secondary":"secondary active-basic";
  if($("proPlan"))$("proPlan").className=pro?"probtn active-pro":"probtn";

  ["proVehicle","proVin","proMileage","backendArea"].forEach(id=>{
    if($(id))$(id).classList.toggle("hidden",!pro);
  });

  if($("basicLinks"))$("basicLinks").classList.toggle("hidden",pro);
  if($("backendLocked"))$("backendLocked").classList.toggle("hidden",pro);

  st("planStatus",pro?"warn":"good",
    pro
      ?"Pro demo active — automated checks enabled where backend credentials exist."
      :"Basic mode active — no paid API services required.");

  update();
}

if($("basicPlan"))$("basicPlan").onclick=()=>setPlan("basic");
if($("proPlan"))$("proPlan").onclick=()=>setPlan("pro");

function update(){
  if($("reg"))$("reg").value=reg($("reg").value);
  if($("vin"))$("vin").value=vin($("vin").value);
  if($("mileage"))$("mileage").value=String($("mileage").value||"").replace(/\D/g,"").slice(0,8);

  if(!$("summary"))return;

  $("summary").innerHTML=[
    ["Plan",S.plan==="pro"?"Pro":"Basic Free"],
    ["Registration",$("reg")?.value||"Not set"],
    ["Photo 1 reg",S.p1ok?"Verified":"Not verified"],
    ["VIN",$("vin")?.value||"Not confirmed"],
    ["VIN cross-check",S.plan==="pro"?(S.vinVerified?"Verified":"Not verified"):"Manual / local"],
    ["Mileage",$("mileage")?.value||"Not confirmed"],
    ["History check",S.plan==="pro"?(S.mileageChecked?"Checked":"Not checked"):"Manual GOV.UK"],
    ["GPS",S.coords?`${S.coords.lat.toFixed(6)}, ${S.coords.lon.toFixed(6)}`:"Not captured"],
    ["Photos",`${Object.keys(S.photos).length} / 3`]
  ].map(([a,b])=>`<div>${a}</div><div><b>${b}</b></div>`).join("");
}

["reg","vin","mileage"].forEach(x=>{
  if($(x)){
    $(x).oninput=()=>{
      if(x==="reg")S.p1ok=false;
      update();
    };
  }
});

update();

/* ---------------- UK PLATE OCR ---------------- */

function normalisePlateText(value){
  return String(value||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
}

const OCR_EQUIVALENTS={
  "0":["0","O","Q","D"],
  "O":["O","0","Q","D"],
  "1":["1","I","L"],
  "I":["I","1","L"],
  "L":["L","1","I"],
  "2":["2","Z"],
  "Z":["Z","2"],
  "5":["5","S"],
  "S":["S","5"],
  "6":["6","G"],
  "G":["G","6"],
  "8":["8","B"],
  "B":["B","8"]
};

function charsEquivalent(a,b){
  if(a===b)return true;
  return (OCR_EQUIVALENTS[a]||[a]).includes(b) ||
         (OCR_EQUIVALENTS[b]||[b]).includes(a);
}

function weightedPlateScore(expected,candidate){
  expected=normalisePlateText(expected);
  candidate=normalisePlateText(candidate);

  if(!expected||!candidate)return 0;
  if(expected===candidate)return 1;

  if(expected.length===candidate.length){
    let score=0;
    for(let i=0;i<expected.length;i++){
      if(expected[i]===candidate[i])score+=1;
      else if(charsEquivalent(expected[i],candidate[i]))score+=0.85;
    }
    return score/expected.length;
  }

  return 0;
}

function extractCandidates(rawText,expectedLength){
  const upper=String(rawText||"").toUpperCase();
  const compact=normalisePlateText(upper);
  const out=new Set();

  const tokens=(upper.match(/[A-Z0-9]{2,8}/g)||[]).map(normalisePlateText);
  tokens.forEach(t=>out.add(t));

  for(let i=0;i<tokens.length;i++){
    for(let j=i+1;j<=Math.min(i+2,tokens.length-1);j++){
      const joined=tokens.slice(i,j+1).join("");
      if(joined.length===expectedLength)out.add(joined);
    }
  }

  for(let i=0;i+expectedLength<=compact.length;i++){
    out.add(compact.slice(i,i+expectedLength));
  }

  return [...out];
}

function fileToImage(file){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=reject;
    img.src=URL.createObjectURL(file);
  });
}

function cropCanvas(img,mode){
  let sx=0,sy=0,sw=img.width,sh=img.height;

  if(mode==="plate-wide"){
    sx=Math.round(img.width*0.12);
    sy=Math.round(img.height*0.46);
    sw=Math.round(img.width*0.76);
    sh=Math.round(img.height*0.30);
  }

  if(mode==="plate-tight"){
    sx=Math.round(img.width*0.22);
    sy=Math.round(img.height*0.52);
    sw=Math.round(img.width*0.56);
    sh=Math.round(img.height*0.20);
  }

  const maxW=1800;
  const scale=Math.min(1,maxW/sw);

  const c=document.createElement("canvas");
  c.width=Math.max(1,Math.round(sw*scale));
  c.height=Math.max(1,Math.round(sh*scale));

  const ctx=c.getContext("2d",{willReadFrequently:true});
  ctx.drawImage(img,sx,sy,sw,sh,0,0,c.width,c.height);

  return c;
}

function preprocessCanvas(source,threshold){
  const c=document.createElement("canvas");
  c.width=source.width;
  c.height=source.height;

  const ctx=c.getContext("2d",{willReadFrequently:true});
  ctx.drawImage(source,0,0);

  const img=ctx.getImageData(0,0,c.width,c.height);
  const d=img.data;

  for(let i=0;i<d.length;i+=4){
    const gray=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];

    let v=(gray-128)*2.1+128;
    v=Math.max(0,Math.min(255,v));

    if(threshold!==null){
      v=v>=threshold?255:0;
    }

    d[i]=d[i+1]=d[i+2]=v;
  }

  ctx.putImageData(img,0,0);
  return c;
}

async function runPlateOCR(source){
  if(typeof Tesseract==="undefined"){
    throw new Error("OCR library is not available.");
  }

  const result=await Tesseract.recognize(
    source,
    "eng",
    {
      logger:()=>{},
      tessedit_char_whitelist:"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
      preserve_interword_spaces:"1"
    }
  );

  return result?.data?.text||"";
}

async function verifyRegistrationInPhoto(file,enteredRegistration){
  const expected=normalisePlateText(enteredRegistration);
  if(!expected)return {ok:false,reason:"Enter registration first."};

  const img=await fileToImage(file);

  const regions=[
    cropCanvas(img,"plate-wide"),
    cropCanvas(img,"plate-tight"),
    cropCanvas(img,"full")
  ];

  const passes=[];

  for(const region of regions){
    passes.push(region);
    passes.push(preprocessCanvas(region,null));
    passes.push(preprocessCanvas(region,110));
    passes.push(preprocessCanvas(region,140));
    passes.push(preprocessCanvas(region,170));
  }

  const texts=[];
  for(const p of passes){
    try{
      const t=await runPlateOCR(p);
      if(t)texts.push(t);
    }catch{}
  }

  const candidates=[];
  for(const t of texts){
    candidates.push(...extractCandidates(t,expected.length));
  }

  let best={candidate:"",score:0};

  for(const c of [...new Set(candidates)]){
    const score=weightedPlateScore(expected,c);
    if(score>best.score)best={candidate:c,score};
  }

  return {
    ok:best.score>=0.80,
    expected,
    detected:best.candidate,
    score:best.score,
    raw:texts.join(" | ")
  };
}

/* ---------------- GPS ---------------- */

if($("gps")){
  $("gps").onclick=()=>{
    if(!navigator.geolocation){
      return st("gpss","bad","Location is not supported on this device.");
    }

    navigator.geolocation.getCurrentPosition(
      p=>{
        S.coords={lat:p.coords.latitude,lon:p.coords.longitude};
        st("gpss","good","GPS captured.");
        update();
      },
      ()=>st("gpss","bad","Location permission not granted."),
      {enableHighAccuracy:true}
    );
  };
}

/* ---------------- PHOTO CAPTURE ---------------- */

document.querySelectorAll("button[data-p]").forEach(b=>{
  b.onclick=()=>{
    const input=$("p"+b.dataset.p);
    if(input)input.click();
  };
});

for(let n=1;n<=3;n++){
  const input=$("p"+n);
  if(!input)continue;

  input.onchange=async e=>{
    const f=e.target.files[0];
    if(!f)return;

    if(n===1){
      const entered=normalisePlateText($("reg")?.value);

      if(!entered){
        st("s1","bad","Enter the registration before taking Photo 1.");
        e.target.value="";
        return;
      }

      st("s1","warn","Reading registration from Photo 1…");

      try{
        const check=await verifyRegistrationInPhoto(f,entered);
        S.p1ok=check.ok;

        if(!check.ok){
          st(
            "s1",
            "bad",
            `Registration not verified. Entered: ${check.expected}. `+
            `Best OCR reading: ${check.detected||"none"}. `+
            `Match: ${Math.round(check.score*100)}%.`
          );
          e.target.value="";
          update();
          return;
        }

        if(check.detected!==check.expected){
          st(
            "s1",
            "good",
            `Registration verified: ${check.expected}. `+
            `OCR read ${check.detected} (${Math.round(check.score*100)}% match).`
          );
        }else{
          st("s1","good",`Registration verified in Photo 1: ${check.expected}.`);
        }

      }catch(err){
        S.p1ok=false;
        st("s1","bad",`OCR failed: ${err.message||"could not read plate"}.`);
        e.target.value="";
        update();
        return;
      }
    }

    if(n===2)st("s2","warn","VIN photo captured. Confirm the 17-character VIN below.");
    if(n===3)st("s3","warn","Mileage photo captured. Confirm the odometer reading below.");

    try{
      const out=await watermark(f,n);
      S.photos[n]=out.blob;

      if($("i"+n)){
        $("i"+n).src=out.url;
        $("i"+n).classList.remove("hidden");
      }

      if($("b"+n)){
        $("b"+n).classList.add("done");
        $("b"+n).textContent="✓";
      }

      update();
    }catch(err){
      st("s"+n,"bad","Photo could not be processed. Please retake it.");
      e.target.value="";
    }
  };
}

async function watermark(file,n){
  const img=await fileToImage(file);
  const c=document.createElement("canvas");
  const sc=Math.min(1,1800/img.width);

  c.width=Math.round(img.width*sc);
  c.height=Math.round(img.height*sc);

  const x=c.getContext("2d");
  x.drawImage(img,0,0,c.width,c.height);

  const kind=n===1?"VEHICLE":n===2?"VIN":"MILEAGE";
  const gps=S.coords
    ?`${S.coords.lat.toFixed(6)}, ${S.coords.lon.toFixed(6)}`
    :"GPS PENDING";

  const lines=[
    "MOT PHOTO EVIDENCE",
    `REG: ${reg($("reg")?.value)||"NOT SET"}`,
    new Date().toLocaleString(),
    `GPS: ${gps}`,
    `PHOTO ${n} — ${kind}`
  ];

  const fs=Math.max(24,Math.round(c.width/42));
  const lh=fs*1.25;
  const pad=fs*.65;
  const bh=lines.length*lh+pad*2;

  x.fillStyle="rgba(0,0,0,.68)";
  x.fillRect(0,c.height-bh,c.width,bh);

  x.fillStyle="white";
  x.font=`600 ${fs}px -apple-system`;

  lines.forEach((t,i)=>x.fillText(t,pad,c.height-bh+pad+fs+i*lh));

  const blob=await new Promise(r=>c.toBlob(r,"image/jpeg",.9));
  return{blob,url:URL.createObjectURL(blob)};
}

/* ---------------- PRO FEATURES ---------------- */

if($("scanPlate")){
  $("scanPlate").onclick=()=>{
    st("vehicleStatus","warn","ANPR remains a Pro backend feature.");
  };
}

if($("vehicleLookup")){
  $("vehicleLookup").onclick=async()=>{
    try{
      const out=await api("/dvla",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({registrationNumber:reg($("reg")?.value)})
      });

      st("vehicleStatus","good",
        `Vehicle lookup returned ${out.make||"vehicle"} ${out.colour||""}.`);
    }catch(e){
      st("vehicleStatus","bad",e.message);
    }
  };
}

if($("verifyVin")){
  $("verifyVin").onclick=async()=>{
    const enteredVin=vin($("vin")?.value);

    if(enteredVin.length!==17){
      return st("vinProStatus","bad","VIN must contain 17 valid characters.");
    }

    try{
      const out=await api(`/mot/vin/${encodeURIComponent(enteredVin)}`);

      const found=reg(
        out.registration ||
        out.registrationNumber ||
        out.vehicle?.registration ||
        ""
      );

      S.vinVerified=!!found && found===reg($("reg")?.value);

      st(
        "vinProStatus",
        S.vinVerified?"good":"bad",
        S.vinVerified
          ?"VIN verified against registration."
          :`VIN did not verify against entered registration${found?` (record shows ${found})`:""}.`
      );

      update();
    }catch(e){
      S.vinVerified=false;
      st("vinProStatus","bad",e.message);
      update();
    }
  };
}

if($("checkMileage")){
  $("checkMileage").onclick=async()=>{
    try{
      const out=await api(
        `/mot/registration/${encodeURIComponent(reg($("reg")?.value))}`
      );

      const tests=out.motTests||out.vehicle?.motTests||[];

      const vals=tests
        .map(t=>({
          v:Number(String(t.odometerValue??t.odometer?.value??"").replace(/\D/g,"")),
          u:(t.odometerUnit??t.odometer?.unit??"mi").toLowerCase(),
          d:t.completedDate??t.testDate??""
        }))
        .filter(x=>x.v>0)
        .sort((a,b)=>String(b.d).localeCompare(String(a.d)));

      if(!vals.length){
        S.mileageChecked=true;
        st("mileageProStatus","warn","No usable previous MOT mileage returned.");
        update();
        return;
      }

      let prev=vals[0].v;
      if(vals[0].u.startsWith("km"))prev=Math.round(prev*.621371);

      const cur=Number($("mileage")?.value);
      const diff=cur-prev;

      S.mileageChecked=true;

      st(
        "mileageProStatus",
        diff>=0?"good":"bad",
        diff>=0
          ?`Previous ${prev.toLocaleString()} mi • current +${diff.toLocaleString()} mi.`
          :`WARNING: current is ${Math.abs(diff).toLocaleString()} mi lower than previous.`
      );

      update();
    }catch(e){
      S.mileageChecked=false;
      st("mileageProStatus","bad",e.message);
      update();
    }
  };
}

/* ---------------- REVIEW ---------------- */

if($("complete")){
  $("complete").onclick=()=>{
    update();

    const miss=[];
    if(!reg($("reg")?.value))miss.push("registration");
    if(!S.p1ok)miss.push("Photo 1 registration verification");
    if(vin($("vin")?.value).length!==17)miss.push("valid VIN");
    if(!$("mileage")?.value)miss.push("mileage");
    if(!S.coords)miss.push("GPS");
    if(Object.keys(S.photos).length!==3)miss.push("all 3 photos");

    if(miss.length){
      return st("submitStatus","bad","Missing: "+miss.join(", "));
    }

    if(S.plan==="pro" && (!S.vinVerified || !S.mileageChecked)){
      return st("submitStatus","warn",
        "Core evidence is complete. Pro verification is still incomplete.");
    }

    st("submitStatus","good",
      S.plan==="pro"
        ?"Pro evidence checks complete."
        :"Basic evidence checks complete. Use GOV.UK links for manual vehicle and mileage cross-checks.");
  };
}

if($("clear")){
  $("clear").onclick=()=>{
    S.photos={};
    S.p1ok=false;
    S.vinVerified=false;
    S.mileageChecked=false;

    for(let n=1;n<=3;n++){
      if($("i"+n)?.src)URL.revokeObjectURL($("i"+n).src);

      if($("i"+n)){
        $("i"+n).removeAttribute("src");
        $("i"+n).classList.add("hidden");
      }

      if($("p"+n))$("p"+n).value="";

      if($("b"+n)){
        $("b"+n).classList.remove("done");
        $("b"+n).textContent=n;
      }
    }

    update();
    st("submitStatus","good","Local evidence cleared.");
  };
}

setPlan("basic");
