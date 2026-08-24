import fs from "node:fs";

function readIfPresent(path){
  return fs.existsSync(path) ? fs.readFileSync(path,"utf8") : null;
}
function write(path,text){ fs.writeFileSync(path,text); console.log("Configured",path); }

const plistPath="ios/App/App/Info.plist";
let plist=readIfPresent(plistPath);
const plistEntries=[
  ["NSCameraUsageDescription","MOT Evidence uses the camera to capture photographic evidence during an MOT test."],
  ["NSLocationWhenInUseUsageDescription","MOT Evidence uses your location to add GPS evidence to MOT photographs."]
];
if(plist){
  for(const [key,value] of plistEntries){
    if(!plist.includes(`<key>${key}</key>`)){
      plist=plist.replace("</dict>",`\t<key>${key}</key>\n\t<string>${value}</string>\n</dict>`);
    }
  }
  write(plistPath,plist);
}

const manifestPath="android/app/src/main/AndroidManifest.xml";
let manifest=readIfPresent(manifestPath);
const permissions=[
  "android.permission.CAMERA",
  "android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.ACCESS_FINE_LOCATION"
];
if(manifest){
  for(const permission of permissions){
    if(!manifest.includes(`android:name="${permission}"`)){
      manifest=manifest.replace("<application",`<uses-permission android:name="${permission}" />\n\n    <application`);
    }
  }
  write(manifestPath,manifest);
}
if(!plist && !manifest) throw new Error("No native platform project found. Run npx cap add ios and/or npx cap add android first.");
