# Prototype validation record

Updated October 10, 2026 (America/Toronto). **Physical acceptance remains incomplete.** No Android/iPhone models or OS versions have been confirmed and no physical cube recording set has been collected. The requested 9/10 capture and solve rates, one-second p95 turn confirmation, and zero false confirmations are unmeasured.

## Checks completed

| Check | Result | Evidence / scope |
| --- | --- | --- |
| TypeScript | Pass | `tsc --noEmit`, strict project settings |
| Expo configuration/dependencies | 21/21 pass | `artifacts/build-logs/expo-doctor.log` |
| Automated tests | 52/52 pass | Vitest; includes physical cube regressions, rectangular diagrams, separated and joined unfolded nets, missing-face hints, cropped Back rejection, larger-grid rejection, and portrait frame-resolution regression through compiled WASM |
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

## Live camera pointed at pictures

The detector retains up to six spatially distinct grids from one live frame. A new diagram capture path orders coplanar panels in 3×2 or 2×3 arrangements and requires four clear, identical observations over at least 450 ms. Spatial stability, all 54 colors, frame continuity, and panel geometry must agree. Separate-panel lattices that skip sticker rows are rejected using cell-to-sticker size checks. The initial implementation reset on every missing panel; the temporal stability correction below supersedes that behavior.

The start screen's **Point camera at a picture** action selects the back camera; complete diagrams are also recognized during ordinary cube scanning. Capture opens review directly, without the file picker. Names and rotations require review because text labels are not read. The camera preview uses contain scaling with the same transformation for overlays. Six-panel observations cannot verify physical turns or completion.

Nine new tests cover both panel arrangements with perspective, ordering independent of detector order, settling, low confidence, missing panels, blur, color changes, movement, gaps, duplicate centers, physical-cube regression, completion guards, and preview positioning. The production worker receives full 640×480 or 480×640 RGBA `frame` messages in the pixel tests; these do not use the photo-cropping path.

A local browser test streamed picture pixels with `canvas.captureStream(10)` into the actual `CameraSurface.web` component, production WASM worker, Session, and review UI. No photo import adapter was used. The user's example captured all 54 colors correctly and blocked solving with the duplicate-white-center warning. Generated valid 3×2 and 2×3 pictures both captured; the 3×2 case also auto-detected through the ordinary cube start action and produced 22 verified quarter-turn instructions. Retake resumed the video flow. The review screen was visually checked at a measured 390×844 CSS viewport. Evidence: `artifacts/live-picture-captured.jpg`, `artifacts/live-picture-solution.jpg`, `artifacts/live-picture-mobile-review.jpg`. This simulated MediaStream does not test camera optics, paper/screen glare, or iOS video processing. The test harness and supplied image were kept local and are not in the published app.

Real iPhone/Android camera trials against paper and screens remain required. These changes do not establish that the previously reported iPhone camera failure is resolved.

The live-camera update passed strict TypeScript, production web export, and sequential Android/iOS Hermes exports. The published prototype shows the new camera action; its worker, detector JS/WASM, and solver worker match the tested export byte-for-byte and return HTTP 200 with appropriate MIME types. Detector asset version: `9d98b12074473541`. Browser proof: `artifacts/published-live-picture-scan.jpg`.

## Unfolded 3×3 nets

The camera now recognizes the upright U / L F R B / D net. Planar grid geometry supplies the face labels; color identity is not used to guess net positions and OCR is not required. A confident five-face layout requests the missing named face, while all six complete grids are required to reach review. Other net topologies are not implemented.

The user's cropped light-background screenshot initially produced a false sixth grid spanning neighboring faces. The detector now rejects overlapping grid candidates; the direct 640×605 test reads five complete faces and requests the full Back face. No missing Back colors are inferred. Browser resampling produces different incomplete-grid hints, as recorded below. The user's first screenshot contains 4×4 faces and now produces a larger-grid warning instead of 3×3 subgrids. The user confirmed the requested scope remains 3×3.

Thirteen additional tests cover full and perspective nets, the exact known state and its verified solution, each missing face, incomplete-to-complete settling, larger-grid resets, light-colored panel backgrounds, a cropped Back face through production camera frame messages, eight-region extrapolation rejection, multiple unclear faces, and a generated 4×4 negative. Strict TypeScript and the complete 49-test suite passed. The two supplied screenshots were also run locally through the compiled detector and diagram scanner; originals remain private local test material. Physical paper/screen camera testing remains outstanding.

Picture capture and review now require all nine independent sticker regions to support each face. The physical-cube detector's eight-region recovery fit is retained, but it cannot complete a diagram. Thin outlines around white squares can disappear at reduced camera resolution, so a visible face may still need reacquisition at a larger scale. This remains a recognition limitation, not an inferred successful capture.

The browser MediaStream test captured a generated, known-valid net, assigned U/L/F/R/B/D correctly, validated all 54 colors, and generated 22 quarter-turn instructions (`artifacts/net-captured-review.jpg`, `artifacts/net-solution-camera.jpg`). The supplied cropped screenshot remained in scanning when streamed with padding at 640×480; the app requested clearer Front and Down grids because those faint white-square boundaries were incomplete at that scale (`artifacts/net-cropped-camera.jpg`). The direct 640×605 detector test requested Back instead. These differing requests demonstrate resolution sensitivity, not successful capture of the cropped example. Browser console reported no errors. Production web and both native Hermes exports passed; physical device camera testing is still pending.

The unfolded-net update is published at the prototype alias. Its worker, detector JavaScript/WASM, and solver worker match the tested export byte-for-byte, return HTTP 200, and use the appropriate MIME types. Detector asset version: `753713471457fab2`. The refreshed published home screen loads without console errors. The generated complete test net is available locally at `artifacts/valid-net.png` for a paper/screen camera trial.

## Portrait camera capture correction

The user subsequently confirmed that the complete test net also stalls with some faces detected, fewer than six. This is another failed real-camera trial, despite the previous landscape MediaStream test. A local reproduction places the same `artifacts/valid-net.png` at 80% of the width of a 720×1280 portrait video. The original camera component downsized it to 360×640, erasing faint sticker boundaries; the actual browser camera flow remained at **2/6** clear panels (`artifacts/portrait-camera-before.jpg`).

Picture mode now retains up to 1280 pixels on the long side without upscaling the source. Physical cube frames retain their 640-pixel limit. Auto-detection locks the session into picture mode so partial subsequent frames cannot repeatedly lower resolution. Native frame output requests 1280 for pictures, and the native C++ wrapper no longer reduces those frames back to 640; this requires a new native build. Preview coordinates continue to use the dimensions actually sent to detection. The detector, nine-region requirement, confidence limits, and settling checks are unchanged.

With that correction, the same browser MediaStream reaches six clear panels, review, a valid 54-square state, and 22 verified solution steps (`artifacts/portrait-camera-after.jpg`). This is a controlled before/after browser test, not an iPhone camera recording. Two added tests exercise portrait pixel data through the production worker and verify both exact state capture and rejection after covering the Back column, plus retention of picture mode through partial frames. Strict TypeScript, all 51 automated tests, production web export, and sequential iOS/Android Hermes exports pass. Native picture mode disables the preview-sized-buffer option and uses stable resolution objects to avoid rebuilding frame output during every observation. Actual iPhone retesting, including latency from the larger frames, remains required. A distant diagram can still be too small; all six faces should fill most of the camera width.

Published application bundle `entry-770f545a6ad911d89ff88e29ea14f64b.js` matches the tested export byte-for-byte. The worker, detector JS/WASM, and solver worker also match; their detector version remains `753713471457fab2` because this browser fix changes frame acquisition, not the detector. The fresh immutable URL was supplied for the user's iPhone retest; its result is pending.

## Joined-face net correction

The user reported a further 4/6 failure and supplied a black-background unfolded net with equal sticker spacing across face boundaries. The exact 757×567 image reproduced four clear grids, including windows displaced one column across the intended face boundaries. Merely retaining higher frame resolution did not resolve this grouping problem.

The shared C++ detector now fits the entire joined net from 54 distinct observed sticker regions before selecting its six faces. It refines one common projective transform, checks residuals, rejects extra adjacent rows/columns, and samples each face only after the complete layout is established. Partial layouts fall back to the existing conservative grid path; no colors are inferred. The TypeScript arrangement check permits touching face boundaries and normalizes horizontal and vertical dimensions separately to handle perspective.

The exact supplied image now yields six correctly grouped faces and a valid cube. All 54 colors match the independently transcribed example. The same state is captured at a 640-pixel image width and in six 720×1280 portrait variants (60%, 80%, and 95% coverage, each with and without 0.5-pixel Gaussian blur). Single desktop detector samples were approximately 32–81 ms after the change, versus 280–415 ms for the old incomplete grouping; these are not iPhone latency measurements. The original image remains local and is not published or committed.

The added compiled-worker regression uses independently labeled colors from the example with generated geometry. It checks exact capture and a verified solve for straight/tilted and landscape/portrait versions, plus rejection of covered faces and a covered sticker. All 52 tests, strict TypeScript, and the existing compiled-detector pixel suite pass. Real iPhone camera behavior remains unverified for this patch.

A local browser MediaStream streamed the exact supplied image at 80% width in a 720×1280 portrait frame through the production camera component, worker, Session, and review. It captured all six faces with the correct 54 colors and produced **32 verified quarter-turn steps**. No file picker was used, and the browser console reported no errors. Evidence: `artifacts/joined-net-camera-review.jpg` and `artifacts/joined-net-camera-solution.jpg`. Production web and sequential iOS/Android Hermes exports passed. The detector version is `821a256600d6f983`.

The published application bundle, frame worker, detector JavaScript/WASM, and solver worker all match the tested export byte-for-byte and return HTTP 200 with the appropriate MIME types. The fresh immutable deployment URL was provided for an iPhone retest; that result remains pending.

## Photo import

The picture importer reads six panels in 3×2 or 2×3 layouts, then requires face-name and orientation review. Recognition runs in the production browser WASM worker or the native detector on a separate worklet runtime. Native image decoding/cropping uses asynchronous Nitro Image operations; an explicit render applies iOS image orientation before cropping. Expo ImagePicker supplies the system selection UI ([official API documentation](https://docs.expo.dev/versions/latest/sdk/imagepicker/)).

- The user's supplied 1448×1086 diagram was selected through the browser's real file chooser. All 54 detected colors match the visible image. Up and Back both contain white centers, and no face has a blue center. The UI identifies this conflict and disables solution/camera import. The source image is not published or committed. `artifacts/photo-invalid-centers.jpg` records the local result.
- Generated known-scramble diagrams exercise both supported layouts in the production worker with the actual compiled detector. All grids, labels, and reconstructed facelets are checked. A valid assembled scramble is solved and the returned moves are applied back to the exact input state.
- Browser UI: a generated valid diagram was selected with the real file chooser, all six grids were read correctly, and the solver produced 22 verified quarter turns. Tapping through all steps ends at “Instructions complete” and asks for a camera check, without a physical-solve claim. Browser console reported no errors. `artifacts/photo-manual-completion.jpg` records the result. This was desktop Chromium; physical mobile picker testing remains open.
- The published deployment passed the same valid-image import and solver check. Review cards and turn controls fit a 390×844 browser viewport; `artifacts/published-photo-mobile.jpg` records the instructions. This is responsive layout testing, not a physical iPhone trial. The two-column image also became valid after selecting the matching layout, without choosing the image again.
- Strict TypeScript, production web export, and sequential native Android/iOS Hermes exports passed after adding photo import. Exports do not establish native execution or signing.
- Unit tests cover all four detector corner origins, arbitrary face label order and rotations, missing/unclear faces, duplicate names/centers, incorrect color counts, and impossible pieces. A solved picture enters camera verification instead of declaring the physical cube solved.
- Manual picture steps are explicitly unverified. Switching to the camera uses the state after the turns the user marked complete; ambiguous or inconsistent observations follow existing recovery/rescan behavior.
- Native photo import is implemented and the photo-import Android build compiled successfully, but neither it nor the iPhone implementation has been exercised on a physical phone. The subsequent six-panel live-camera C++ change needs a newer native build. Neither screenshot imports nor synthetic fixtures resolve the reported iPhone live-camera failure above.

## Temporal stability correction

The user reported repeated 6/6 → 5/6 oscillation. `DiagramScanner` discarded its entire candidate whenever a single face fell below confidence, making four consecutive complete detections necessary. The web camera footer independently displayed the instantaneous face count.

Capture now preserves a complete candidate through brief four- or five-face observations only when every clear face uniquely matches its geometry and colors. Partial frames never add confirmations or fill missing squares. Four complete matching observations are still required, and the final observation must contain all 54 reliable squares. A visible color conflict, substantial movement, blur, larger grid, transform change, or major loss resets the candidate. Duplicate/out-of-order observations cannot count. Candidates expire after 1.5 seconds without a complete observation or five seconds in total; a gap of 800 ms in processed observations also resets them. The longer complete-view deadline allows alternating detections at two processed frames per second without an immediate reset.

The interface shows matching-view progress after finding a complete picture, retaining that progress and instruction during compatible dropouts. It does not present remembered faces as currently clear. The web camera footer no longer changes its face count every frame in picture mode. Physical-cube scanning and turn-verification thresholds are unchanged.

Regression coverage includes alternating 6/5 and 6/4 observations, low-confidence and eight-region faces, prolonged loss, changed visible and previously hidden colors, geometry/frame changes, repeated timestamps, session suspension, and slow processing. Pixel tests run the compiled detector against six covered-face sequences and a joined net whose orange hue repeatedly crosses the confidence threshold. These reproduce 6/5 oscillation and capture the exact known state only on the fourth complete view. Fully covered faces in a joined net can still break grid grouping and require reacquisition; this correction does not claim to resolve every detector failure.

A local browser MediaStream replay of the supplied joined-net image, at 720×1280 with fluctuating orange confidence, produced the observed sequence `6:1, 5:1, 5:1, 5:1, 6:2, 6:3, 5:3, 5:3, 5:3, 5:3 → captured` (clear faces : matching views). All 54 review colors matched the source and the cube passed validation. Evidence: `artifacts/stability-camera-review.jpg` and `artifacts/stability-camera-trace.txt`. Browser console reported no errors. The original image and local replay harness are not published. Physical iPhone/Android camera acceptance remains pending.

All 63 tests pass (the stability group was rerun after updating its expiration fixture for the new deadline), along with strict TypeScript, the production web export, and sequential iOS/Android Hermes exports. This correction changes shared JavaScript and the web interface; it does not change the C++ detector. Native development clients with the joined-net detector can load the updated JavaScript through Metro.

## Builds and access

- HTTPS preview: https://point-scan-solve-10xdevv--prototype.expo.app
- Immutable capture-stability correction: https://point-scan-solve-10xdevv--8owurkn8o3.expo.app (source commit `247b8a2`).
- Immutable joined-net correction: https://point-scan-solve-10xdevv--hfh248gc94.expo.app (source commit `cbe4583`).
- Joined-net Android development build: https://expo.dev/accounts/xuanyai/projects/point-scan-solve/builds/82046d8c-c5e1-4c56-b514-41d8fc80d7e1 (submitted; completion and runtime testing pending).
- Immutable portrait-camera correction: https://point-scan-solve-10xdevv--8hi1su9chu.expo.app (source commit `3233ab1`).
- Portrait-camera Android development build: https://expo.dev/accounts/xuanyai/projects/point-scan-solve/builds/41eb5539-205d-4108-9fd9-25a8ab20e55d (submitted; completion and runtime testing pending).
- Immutable unfolded-net deployment: https://point-scan-solve-10xdevv--mi91jas0ij.expo.app (source commit `20cb311`).
- Unfolded-net Android development build: https://expo.dev/accounts/xuanyai/projects/point-scan-solve/builds/d4e42edd-d4de-4879-bde7-e1fc6b18b0f5 (submitted; completion and runtime testing pending).
- Immutable live-picture camera deployment: https://point-scan-solve-10xdevv--pmt7tl5pkm.expo.app (source commit `abe86eb`).
- Live-picture Android development build: https://expo.dev/accounts/xuanyai/projects/point-scan-solve/builds/23607da4-caab-44b4-a413-d392975dcf35 (submitted; completion and runtime testing pending).
- Immutable photo-import deployment: https://point-scan-solve-10xdevv--w3m8o1jwzl.expo.app (source commit `fbb0a0d`).
- Photo-import Android development build: https://expo.dev/accounts/xuanyai/projects/point-scan-solve/builds/7deadbec-56ed-4150-ac1d-5cd52c21c758 (**finished successfully**; predates six-panel live camera detection).
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
