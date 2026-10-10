# Point. Scan. Solve.

A local-first camera prototype for a standard six-color 3×3 cube. TypeScript, Expo Router, React Native Web, VisionCamera 5, and a shared C++ OpenCV detector. There is no backend, account flow, analytics, or image upload.

**Status:** implementation and automated checks are available; physical camera acceptance is not complete. Read [the validation record](docs/VALIDATION.md) before treating recognition reliability as established. Synthetic detections and simulated turn sequences do not establish phone performance.

**Dax / iPhone signing:** start with [the collaborator setup guide](docs/DAX-SETUP.md) to clone this repository, accept Expo access, register phones, and create the first signed iPhone build using your own Apple Developer account.

## Point the camera at a picture

Choose **Point camera at a picture**, then aim the back camera at a printed or screen-displayed six-face diagram. Keep all six 3×3 grids visible, with the top of the picture upright, and pause. The camera supports an unfolded net with **Up above Front, Left–Front–Right–Back across, and Down below Front**, as well as six panels in three columns by two rows (or two columns by three rows). The ordinary cube scan also recognizes these layouts automatically. No file selection or upload is required.

Detection uses the whole camera frame and retains separate panels even when their centers have the same color. The preview shows the whole processed frame, with aligned outlines. Capture requires four matching, clear observations over at least 450 ms; blur, missing panels, changes, movement, or a frame gap restart this pause. This is a prototype for reasonably straight-on diagrams with moderate tilt; glare, small panels, and extreme perspective can prevent recognition.

Picture scanning preserves frames up to 1280 pixels on the long side; physical cube tracking uses 640. The former 640-pixel picture limit lost faint white-square outlines when a landscape net was viewed through portrait video. Fill most of the camera width with the diagram while keeping every face visible; turning the phone sideways can help. Auto-detected pictures stay in picture mode until a new physical-cube scan is started.

After capture, check the displayed colors, face names, and rotations. In an unfolded net, geometry assigns Up, Left, Front, Right, Back, Down in reading order. Separate rectangular panels default to Up, Front, Right, Left, Down, Back. Text labels are not read automatically. A five-face net requests the missing face; no cropped squares are invented. A detected 4×4 grid receives an unsupported-size message instead of treating its 3×3 windows as a cube. Other cube sizes and other unfolded-net arrangements are outside this prototype.

Invalid diagrams are recognized but cannot be solved: for example, two white centers are not a valid six-color cube. A picture supplies a starting state; physical turn verification requires bringing the real cube into view.

The C++ detector changed, so native users need a new development build. Physical screen/paper camera tests on Android and iPhone remain outstanding; see the validation record.

## Choose a saved picture

The secondary **Or choose a saved picture** option imports one image with six separate, evenly spaced face panels: three columns by two rows, or two columns by three rows. Each panel must show a complete 3×3 grid. Processing stays on the device, using the same OpenCV detector as the camera.

Review the detected colors, face names, and rotations before continuing. The initial panel order is Up, Front, Right, Left, Down, Back (left to right, then top to bottom); labels can be changed. Text labels are not recognized automatically. Face orientation follows the outside-view URFDLB convention: Up is above Front/Right/Left/Back, Back is above Up, and Front is above Down. A single perspective photo cannot supply hidden faces. The saved-picture picker still uses rectangular panels; use the live camera for unfolded nets.

The importer checks unique centers, nine squares of each color, pieces, orientations, and permutation parity. Invalid images receive a specific explanation and cannot reach the solver. Valid images offer plain-language quarter-turn steps or a handoff to the camera guide. Manual steps never confirm physical turns or declare a physical cube solved. Fresh camera observations are still required.

The native picker uses `expo-image-picker`; install a new development build after pulling this update. Web photo import works without camera permission. Native photo decoding, the system picker, and camera handoff still need physical Android/iPhone tests.

## Run the browser app

Use Node 22.16 or newer supported LTS, Python 3, CMake, Ninja, and Emscripten **4.0.15**. Node 20.19.3 is too old for this Expo version.

```sh
npm ci
npm run build:workers
npm run build:vision
npm run web
```

`localhost` is a browser secure context. A phone visiting a computer's plain HTTP LAN address is not: use HTTPS for phone camera access.

The project-local toolchain used on this Windows machine is in `.tools` (ignored). To use its Node in PowerShell:

```powershell
$env:PATH = (Join-Path $PWD '.tools\emsdk\node\22.16.0_64bit\bin') + ';' + $env:PATH
npm run web
```

For a clean detector toolchain, install from the official Emscripten repository:

```sh
git clone --branch 4.0.15 --depth 1 https://github.com/emscripten-core/emsdk.git .tools/emsdk
python .tools/emsdk/emsdk.py install 4.0.15
python .tools/emsdk/emsdk.py activate 4.0.15
python -m pip install cmake ninja
npm run build:vision
```

The detector build downloads OpenCV 4.13.0 sources, builds only `core` and `imgproc`, and outputs `public/vision/cube-vision.{js,wasm}`. Expect a substantial first build; subsequent builds reuse the libraries. `EMSDK` can point to an existing installation. OpenCV's source `LICENSE` applies to the generated binary; cubejs's MIT license is retained in `vendor/cubejs/LICENSE`.

## HTTPS browser distribution

Current test deployment: **https://point-scan-solve-10xdevv--prototype.expo.app**. This is a prototype preview; see the validation record for measured results and outstanding phone trials.

```sh
npm run build:web
```

Deploy the resulting **entire `dist` directory** to an HTTPS static host at the domain root. `/solver.worker.js`, `/vision.worker.js`, and `/vision/cube-vision.wasm` must be served as files, not the app's HTML fallback. WASM uses the `application/wasm` MIME type. No backend or cross-origin isolation is required. Builds fail early if the detector binary is absent.

This project is connected to Expo Hosting. After exporting, `npx eas-cli deploy --alias prototype --environment preview` updates the stable test URL. Keep `dist/licenses/` in the deployment with the bundled libraries' notices.

For an existing trusted development certificate:

```powershell
$env:TLS_CERT = 'C:\path\to\certificate.pem'
$env:TLS_KEY = 'C:\path\to\private-key.pem'
$env:HOST = '0.0.0.0' # only when testing from another device on your LAN
npm run web:https
```

The certificate must cover the hostname and be trusted on each test device. The server defaults to loopback and port 8443; it does not install certificates or bypass browser security. Keep private keys outside the repository.

## Android and iPhone development builds

Expo Go cannot load this native camera module. Use a development build.

```sh
npm run build:workers
npm run native:generate
python scripts/prepare-native.py --platform android
npx expo prebuild --platform android
npx expo run:android
```

For cloud builds (the recommended iPhone route from Windows):

```sh
npx eas-cli login
npx eas-cli build:configure
npx eas-cli device:create       # register the physical iPhone
npx eas-cli build --profile development --platform ios
npx eas-cli build --profile development --platform android
npm start
```

The EAS post-install hook regenerates the local solver bundle and Nitro bindings and retrieves the pinned official OpenCV SDK for the build platform, checking the release asset's size and SHA-256 when supplied by GitHub. Apple development signing and registered device access are required. `eas.json` also includes an Android preview APK profile and an iOS simulator profile. Cloud project creation/signing is interactive until the Expo account is connected. Do not put account credentials in source or chat.

Using your friend's Apple Developer membership? Follow [the signing handoff guide](docs/IOS-SIGNING.md). A `credentials.example.json` template and `development-local` profile are included; a JSON file alone cannot replace the certificate's private key and provisioning profile.

Android local builds need Java 17+, Android SDK 36 and NDK 27.1.12297006 plus several GB of available disk space. The generated `android/` and `ios/` directories are disposable Expo outputs; application configuration lives in `app.json`.

## How the prototype works

- **Capture:** camera frames are reduced to at most 640 pixels on their longest side. Web transfers one RGBA buffer to a worker; native uses VisionCamera's asynchronous frame runner and a Nitro C++ module. Busy frames are dropped. Front camera previews are unmirrored.
- **Detect:** OpenCV finds quadrilateral sticker/color regions, fits a 3×3 projective lattice, samples inner squares, and returns six-color confidence, glare, sharpness, and face corners. It does not use a remote model. Classification is currently fixed HSV bands and requires real-cube calibration/testing.
- **Assemble:** settled views are associated by center color and shared face edges. Adjacency constraints establish the center map and each face's rotation without prescribing scan order or physical white-up orientation. Color counts, piece uniqueness, edge/corner orientation, chirality, and permutation parity must pass. Conflicting counts request reacquisition; a detected layer twist invalidates the scan.
- **Solve:** vendored cubejs 1.3.2 implements Kociemba. Initialization and search happen in a Web Worker or a dedicated native worklet runtime. Every returned solution is applied to the input state to verify it. Half turns become two separate quarter turns. Revisions and session epochs reject obsolete results.
- **Guide:** homography projects an animated curved arrow onto the observed target face. Hidden faces request a whole-cube rotation. Tracking compares the previous state and all 18 legal face turns; only one distinguishable, settled candidate can advance. A different legal move triggers replanning. Ambiguous views hide the arrow; sustained mismatch leads to scanning.
- **Finish:** the logical solution is followed by fresh, settled observations of all six solved faces. Each view must distinguish the unchanged cube from a legal turn; a uniform face alone is insufficient. Blur, ambiguity, or frame gaps invalidate earlier completion checks. Camera pause, switch, or app backgrounding requires a new scan because unseen turns may have occurred.

Core contracts are in `src/core/types.ts`. `CubeState` and camera orientation are separate. `src/session/Session.ts` owns the application state machine. The camera transforms and arrow geometry are in `src/core/geometry.ts`.

## Check and measure

```sh
npm run typecheck
npm test
npm run test:vision  # requires the compiled WASM detector
```

The core suite checks cube invariants, all legal moves against cubejs, inverse round trips, randomized verified solutions, arbitrary scan views, hidden-turn ambiguity, wrong-turn replanning, stale results, background recovery, and perspective projection. The pixel fixture suite uses the **compiled production WASM detector** on synthetic front/tilted/rotated/narrow-seam images plus blank and obscured negatives. Its report is `artifacts/synthetic-detector-results.json`.

Follow [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md) for real recordings, expected results, device metadata, and trial scoring. The acceptance targets are goals, not measured claims. Real Android/iPhone recordings, native binary validation, and lighting/stickerless reliability remain required before calling this a working cross-platform camera product.
