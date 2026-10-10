# Prototype validation record

Updated October 9, 2026 (America/Toronto). **Physical acceptance remains incomplete.** No Android/iPhone models or OS versions have been confirmed and no physical cube recording set has been collected. The requested 9/10 capture and solve rates, one-second p95 turn confirmation, and zero false confirmations are unmeasured.

## Checks completed

| Check | Result | Evidence / scope |
| --- | --- | --- |
| TypeScript | Pass | `tsc --noEmit`, strict project settings |
| Expo configuration/dependencies | 21/21 pass | `artifacts/build-logs/expo-doctor.log` |
| Automated tests | 27/27 pass | Vitest; includes rounded-sticker capture, covered-grid rejection, labeled picture assembly and both six-panel layouts through the compiled production worker |
| Cube model and solver | Pass | All 18 legal turns compared with cubejs, inverse/invariant tests, 20 randomized solutions applied and verified |
| Capture and tracking | Pass on synthetic observations | Arbitrary views, adjacency/orientation assembly, invalid state reacquisition, layer-change invalidation, wrong turns, ambiguity, stale results, and fresh six-face completion. Completion rejects a hidden last-face turn and discards earlier checks after blur or a frame gap. |
| Compiled detector integration | Pass on synthetic pixels | Production C++/OpenCV WASM detects all three faces in four differently oriented views, reconstructs a known scramble, and identifies correct and alternative settled turns |
| Pixel fixtures | Pass | Frontal, perspective, narrow-seam, rotated faces; blank and obscured negatives. `artifacts/synthetic-detector-results.json` |
| Detector timing | 13–25 ms for the four positive pixel fixtures after the scanning patch | Single desktop WASM samples, not phone p95 or end-to-end confirmation latency |
| Web export | Pass | Expo production export with workers and compiled WASM in `dist/` |
| HTTPS assets | Pass | App, workers, detector JS, and WASM return HTTP 200; WASM served as `application/wasm` |
| Browser interface | Partial pass | In-app Chromium preview at 390×844 and 1440×1000; setup, help, pause/restart, camera switch, and unanswered permission timeout/retry exercised. Camera permission did not resolve in this automated browser surface. No physical cube was observed. |

The synthetic pixel renderer uses known colored polygons. These tests catch geometry and state-machine regressions but do not establish recognition reliability in real lighting, on fingers/glare, or on stickerless plastic.

## Reported iPhone scanning failure

The user reported that the camera opens but no faces are captured in both Chrome and Safari on an iPhone. The device model, OS version, and actual camera frame are still unavailable. This is an unresolved physical acceptance failure, not a passed trial.

The follow-up patch adds a sticker-center lattice fit for rounded/small stickers, checks fitted cell axes against sticker edges to reject sheared grids, and avoids repeatedly sampling equivalent candidates. Three rounded synthetic cases that returned no face before the patch now capture the correct face; covered versions remain rejected. The exported production worker initialized and passed six frame checks in browser Chromium (`artifacts/browser-check/result.txt`). This does not establish iOS performance.

Live worker responses had `Cache-Control: public, max-age=3600`. Worker, detector JavaScript, and WASM requests now share a content-derived version so an update cannot silently retain the previous detector for an hour. The app distinguishes missing grids, unclear colors, a detected face awaiting a pause, and processing that is too slow. While the camera is active, **Help → Save a camera photo** saves a local JPEG for voluntary debugging; nothing is uploaded.

Independent exploratory photos from [rubiks-cube-tracker](https://github.com/dwalton76/rubiks-cube-tracker/tree/master/test-data/3x3x3-random-01) and the [Rubick-s-Cube-Dataset sample montage](https://github.com/eyeeco/Rubick-s-Cube-Dataset) still expose color/lighting failures. In particular, the overexposed R photograph remains rejected. These images were used locally and are not bundled. Do not claim that the user's iPhone failure is fixed until their actual camera trial succeeds.

## Photo import

The picture importer reads six panels in 3×2 or 2×3 layouts, then requires face-name and orientation review. Recognition runs in the production browser WASM worker or the native detector on a separate worklet runtime. Native image decoding/cropping uses asynchronous Nitro Image operations; an explicit render applies iOS image orientation before cropping. Expo ImagePicker supplies the system selection UI ([official API documentation](https://docs.expo.dev/versions/latest/sdk/imagepicker/)).

- The user's supplied 1448×1086 diagram was selected through the browser's real file chooser. All 54 detected colors match the visible image. Up and Back both contain white centers, and no face has a blue center. The UI identifies this conflict and disables solution/camera import. The source image is not published or committed. `artifacts/photo-invalid-centers.jpg` records the local result.
- Generated known-scramble diagrams exercise both supported layouts in the production worker with the actual compiled detector. All grids, labels, and reconstructed facelets are checked. A valid assembled scramble is solved and the returned moves are applied back to the exact input state.
- Browser UI: a generated valid diagram was selected with the real file chooser, all six grids were read correctly, and the solver produced 22 verified quarter turns. Tapping through all steps ends at “Instructions complete” and asks for a camera check, without a physical-solve claim. Browser console reported no errors. `artifacts/photo-manual-completion.jpg` records the result. This was desktop Chromium; physical mobile picker testing remains open.
- The published deployment passed the same valid-image import and solver check. Review cards and turn controls fit a 390×844 browser viewport; `artifacts/published-photo-mobile.jpg` records the instructions. This is responsive layout testing, not a physical iPhone trial. The two-column image also became valid after selecting the matching layout, without choosing the image again.
- Strict TypeScript, production web export, and sequential native Android/iOS Hermes exports passed after adding photo import. Exports do not establish native execution or signing.
- Unit tests cover all four detector corner origins, arbitrary face label order and rotations, missing/unclear faces, duplicate names/centers, incorrect color counts, and impossible pieces. A solved picture enters camera verification instead of declaring the physical cube solved.
- Manual picture steps are explicitly unverified. Switching to the camera uses the state after the turns the user marked complete; ambiguous or inconsistent observations follow existing recovery/rescan behavior.
- Native photo import is implemented but has not been exercised on a physical Android phone or iPhone. Existing Android APKs predate the new picker dependency and need rebuilding. Neither screenshot imports nor synthetic fixtures resolve the reported iPhone live-camera failure above.

## Builds and access

- HTTPS preview: https://point-scan-solve-10xdevv--prototype.expo.app
- Immutable photo-import deployment: https://point-scan-solve-10xdevv--w3m8o1jwzl.expo.app (source commit `fbb0a0d`).
- Photo-import Android development build: https://expo.dev/accounts/xuanyai/projects/point-scan-solve/builds/7deadbec-56ed-4150-ac1d-5cd52c21c758 (submitted; native compilation in progress when this entry was written).
- Expo project: https://expo.dev/accounts/xuanyai/projects/point-scan-solve
- Initial Android development build **compiled successfully**, including the C++ detector and all four CPU architectures: https://expo.dev/accounts/xuanyai/projects/point-scan-solve/builds/48ac67d4-71b9-4f04-890f-052686f2d2ed . It predates the color-region detector correction and is not the final acceptance binary.
- Android development build **compiled successfully**: https://expo.dev/accounts/xuanyai/projects/point-scan-solve/builds/b2c66005-80ef-4459-a15a-d2c983828a7e . It includes the earlier color-region correction but predates the latest sticker-center lattice patch; a new native build is needed to test that C++ change. Development builds load the current JavaScript from the project's Metro server; physical camera behavior remains untested.
- Installable Android APK: https://expo.dev/artifacts/eas/WguMP74DmvDXvcZVb7wm5Fm_Uqc3KWcX51ho1IkQmrI.apk . Start `npm run build:workers` and `npx expo start --dev-client` on a computer reachable from the test phone.
- Native Android/iOS JavaScript and Hermes bytecode exports passed. A concurrent export encountered a Windows temporary-file permission error; sequential exports with a project-local temporary directory succeeded. Native exports alone do not prove native compilation or camera execution.
- The project was transferred to the XuanyAI Expo organization. The owner retains Owner access and Dax accepted Developer access. The iPhone device build still requires Dax to configure Apple signing; see [DAX-SETUP.md](DAX-SETUP.md).
- Local Android compilation was stopped by insufficient disk space while downloading the required NDK. Cloud compilation is being used instead.

## Remaining acceptance work

Run [ACCEPTANCE.md](ACCEPTANCE.md) on desktop Chrome, Android Chrome, iPhone Safari, Android native, and iPhone native. Record exact device models and OS/browser versions. Collect independent ground truth for every scramble and deliberate wrong turn. Verify preview-to-frame alignment and arrow direction on each camera, permission denial/retry, camera disconnection, background/resume, and worker initialization failure.

Recognition uses initial fixed HSV bands and geometric thresholds. Real-camera testing may require calibration and detector changes before the requested success rates are attainable. Native camera orientation/buffer transforms, the native background solver, and iOS OpenCV linking still need runtime/build verification.
