# Commercial build verification

The `commercial-v1` branch now has an automated build check.

For each push to the commercial branch, GitHub Actions:

1. installs the Node dependencies;
2. builds the Vite web bundle;
3. generates the Capacitor Android project;
4. applies the camera and foreground-location permissions;
5. synchronises Capacitor plugins;
6. compiles an Android debug APK;
7. stores that APK as a workflow artifact.

This is a development build only. It is not Play Store signed and should not be distributed to customers.

The iOS binary still needs a macOS/Xcode build and Apple signing. The repository configuration is shared, but iOS signing cannot be validated by the Ubuntu Android build job.
