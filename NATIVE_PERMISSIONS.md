# Native permissions

The commercial app needs camera and foreground location access because evidence photographs are captured inside the app and GPS coordinates are burned into each evidence image.

## iOS

`npm run native:configure` adds:

- `NSCameraUsageDescription`
- `NSLocationWhenInUseUsageDescription`

The user-facing wording explains that the camera is used for MOT evidence and location is used to add GPS evidence to MOT photographs.

## Android

The configuration script adds:

- `android.permission.CAMERA`
- `android.permission.ACCESS_COARSE_LOCATION`
- `android.permission.ACCESS_FINE_LOCATION`

No background-location permission is requested. The app only needs the location while the tester is actively using the MOT evidence workflow.

## Build sequence

```sh
npm install
npm run native:init
```

The `native:init` command now generates iOS and Android projects, applies the required permission declarations and synchronises the Capacitor plugins.

For later changes use:

```sh
npm run cap:sync
```

which also reapplies the permission configuration idempotently.
