# Commercial App V1

This branch is the native-store development line for MOT Evidence. The current GitHub Pages/PWA on `main` remains untouched while the commercial app is developed.

## Foundation created

- Capacitor 8 project configuration for iOS and Android.
- Current guided MOT workflow copied into `www/` as the native web bundle.
- Native Camera and Geolocation packages declared for the next migration step.
- Existing DVSA lookup, five-photo workflow, GPS watermarking, 1600px/82% image processing, emissions logic, previous MOT mileage display, Google Drive archive structure, duplicate handling and evidence JSON retained in the web bundle.
- Provisional application identifier: `uk.co.motevidence.app`. Confirm the final company/domain identity before App Store / Play production signing.

## Local bootstrap

Requires Node.js/npm. iOS compilation additionally requires macOS with Xcode. Android compilation requires Android Studio/JDK.

1. `npm install`
2. `npm run native:init`
3. `npm run cap:sync`
4. `npm run ios` or `npm run android`

## Production work still required before customer release

1. Replace browser camera/file capture with Capacitor Camera and explicit native permission handling.
2. Replace browser geolocation with Capacitor Geolocation and native permission handling.
3. Replace Google Identity Services embedded-web OAuth with a production mobile OAuth/system-browser flow. Google Drive remains the first storage provider.
4. Move all customer configuration to a production onboarding/account flow; no DVSA secret may be shipped in the app.
5. Add customer/company/tester identity and licensing/subscription controls.
6. Add privacy policy, terms, support URL, App Store privacy declarations and Google Play Data Safety declarations.
7. Add production app icons/splash assets and store screenshots.
8. Add automated tests, device testing, crash/error reporting and release signing.
9. Confirm DVSA API use/branding wording for the commercial service.

## Architecture

Native iOS / Android app
→ MOT Evidence guided workflow
→ secure backend for DVSA/API operations
→ customer-owned storage provider (Google Drive first)

The native branch should not be merged to `main` until it has been tested independently.
