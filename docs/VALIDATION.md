# Prototype validation record

Updated October 9, 2026 (America/Toronto). **Physical acceptance remains incomplete.** No Android/iPhone models or OS versions have been confirmed and no physical cube recording set has been collected. The requested 9/10 capture and solve rates, one-second p95 turn confirmation, and zero false confirmations are unmeasured.

## Checks completed

| Check | Result | Evidence / scope |
| --- | --- | --- |
| TypeScript | Pass | `tsc --noEmit`, strict project settings |
| Expo configuration/dependencies | 21/21 pass | `artifacts/build-logs/expo-doctor.log` |
| Automated tests | 19/19 pass | `artifacts/automated-tests.json` |
| Cube model and solver | Pass | All 18 legal turns compared with cubejs, inverse/invariant tests, 20 randomized solutions applied and verified |
| Capture and tracking | Pass on synthetic observations | Arbitrary views, adjacency/orientation assembly, invalid state reacquisition, layer-change invalidation, wrong turns, ambiguity, stale results, and fresh six-face completion. Completion rejects a hidden last-face turn and discards earlier checks after blur or a frame gap. |
| Compiled detector integration | Pass on synthetic pixels | Production C++/OpenCV WASM detects all three faces in four differently oriented views, reconstructs a known scramble, and identifies correct and alternative settled turns |
| Pixel fixtures | Pass | Frontal, perspective, narrow-seam, rotated faces; blank and obscured negatives. `artifacts/synthetic-detector-results.json` |
| Detector timing | 49–64 ms for the four positive pixel fixtures | Single desktop WASM samples, not phone p95 or end-to-end confirmation latency |
| Web export | Pass | Expo production export with workers and compiled WASM in `dist/` |
| HTTPS assets | Pass | App, workers, detector JS, and WASM return HTTP 200; WASM served as `application/wasm` |
| Browser interface | Partial pass | In-app Chromium preview at 390×844 and 1440×1000; setup, help, pause/restart, camera switch, and unanswered permission timeout/retry exercised. Camera permission did not resolve in this automated browser surface. No physical cube was observed. |

The synthetic pixel renderer uses known colored polygons. These tests catch geometry and state-machine regressions but do not establish recognition reliability in real lighting, on fingers/glare, or on stickerless plastic.

## Builds and access

- HTTPS preview: https://point-scan-solve-10xdevv--prototype.expo.app
- Expo project: https://expo.dev/accounts/10xdevv/projects/point-scan-solve
- Initial Android development build **compiled successfully**, including the C++ detector and all four CPU architectures: https://expo.dev/accounts/10xdevv/projects/point-scan-solve/builds/48ac67d4-71b9-4f04-890f-052686f2d2ed . It predates the color-region detector correction and is not the final acceptance binary.
- Updated detector development build **compiled successfully**: https://expo.dev/accounts/10xdevv/projects/point-scan-solve/builds/b2c66005-80ef-4459-a15a-d2c983828a7e . Use this build for Android trials. Development builds load the current JavaScript from the project's Metro server; physical camera behavior remains untested.
- Installable Android APK: https://expo.dev/artifacts/eas/WguMP74DmvDXvcZVb7wm5Fm_Uqc3KWcX51ho1IkQmrI.apk . Start `npm run build:workers` and `npx expo start --dev-client` on a computer reachable from the test phone.
- Native Android/iOS JavaScript and Hermes bytecode exports passed. A concurrent export encountered a Windows temporary-file permission error; sequential exports with a project-local temporary directory succeeded. Native exports alone do not prove native compilation or camera execution.
- iPhone device build cannot be signed yet. The user is coordinating credentials with the Apple Developer account holder; see [IOS-SIGNING.md](IOS-SIGNING.md).
- Local Android compilation was stopped by insufficient disk space while downloading the required NDK. Cloud compilation is being used instead.

## Remaining acceptance work

Run [ACCEPTANCE.md](ACCEPTANCE.md) on desktop Chrome, Android Chrome, iPhone Safari, Android native, and iPhone native. Record exact device models and OS/browser versions. Collect independent ground truth for every scramble and deliberate wrong turn. Verify preview-to-frame alignment and arrow direction on each camera, permission denial/retry, camera disconnection, background/resume, and worker initialization failure.

Recognition uses initial fixed HSV bands and geometric thresholds. Real-camera testing may require calibration and detector changes before the requested success rates are attainable. Native camera orientation/buffer transforms, the native background solver, and iOS OpenCV linking still need runtime/build verification.
