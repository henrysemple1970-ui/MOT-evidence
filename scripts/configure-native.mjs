import fs from "node:fs";

function mustRead(path){
  if(!fs.existsSync(path)) throw new Error(`Missing ${path}. Run npm run native:init after npm install.`);
  return fs.readFileSync(path,"utf8");
}
function write(path,text){ fs.writeFileSync(path,text); console.log("Configured",path); }

const plistPath="ios/App/App/Info.plist";
let plist=mustRead(plistPath);
const plistEntries=[
  ["NSCameraUsageDescription","MOT Evidence uses the camera to capture photographic evidence during an MOT test."],
  ["NSLocationWhenInUseUsageDescription","MOT Evidence uses your location to add GPS evidence to MOT photographs."]
];
for(const [key,value] of plistEntries){
  if(!plist.includes(`<key>${key}</key>`)){
    plist=plist.replace("</dict>",`\t<key>${key}</key>\n\t<string>${value}</string>\n</dict>`);
  }
}
write(plistPath,plist);

const manifestPath="android/app/src/main/AndroidManifest.xml";
let manifest=mustRead(manifestPath);
const permissions=[
  "android.permission.CAMERA",
  "android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.ACCESS_FINE_LOCATION"
];
for(const permission of permissions){
  if(!manifest.includes(`android:name="${permission}"`)){
    manifest=manifest.replace("<application",`<uses-permission android:name="${permission}" />\n\n    <application`);
  }
}
write(manifestPath,manifest);
