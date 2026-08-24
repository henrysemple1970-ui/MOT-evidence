# Native Camera + Location migration

Commercial V1 now uses Capacitor's native Camera and Geolocation plugins on iOS and Android, with browser fallbacks for development.

The five-photo workflow, mandatory GPS-before-photo rule, watermark, 1600 px longest-side processing, JPEG quality 82%, DVSA lookup and Drive archive logic are retained.

## Build
```
npm install
npm run build
npm run native:init
```

After the native projects are generated, iOS camera/location usage descriptions and Android location permissions must be declared in their platform projects. That is the next native-project milestone.

Google Drive OAuth is still the web OAuth implementation and must be migrated to a production mobile/system-browser OAuth flow before store release.
