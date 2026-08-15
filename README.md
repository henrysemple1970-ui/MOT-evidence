# MOT Photo Evidence — Installable iPhone Prototype

This is a Progressive Web App (PWA). It can be installed on an iPhone from Safari after it is hosted on an HTTPS website.

## What works in this prototype
- iPhone camera capture for three MOT evidence photos
- GPS capture
- Date/time/GPS/registration watermark burned into captured images
- VIN and mileage confirmation fields
- Demo-mode submission
- Optional real upload endpoint
- Photos are kept in memory during the workflow and cleared after a confirmed upload
- Failed uploads retain the photos for retry
- Home Screen / standalone PWA support

## Prototype hooks
The UI includes placeholders/hooks for:
- ANPR
- VIN OCR
- mileage OCR
- DVLA vehicle lookup
- DVSA MOT history / VIN-registration matching

For a production deployment, API credentials should live on a secure backend, not in the browser.

## Install on iPhone
1. Host this folder on any HTTPS static host.
2. Open the HTTPS address in Safari on the iPhone.
3. Tap Share.
4. Tap Add to Home Screen.
5. Open MOT Evidence from the Home Screen.

## Quick hosting options
Any normal HTTPS static host will work, including GitHub Pages, Netlify, Cloudflare Pages, or your own web server.

## Important
This is a prototype and is not an official DVSA app or an approved DVSA submission client.
