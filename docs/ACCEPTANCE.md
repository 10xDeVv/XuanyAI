# Physical-camera acceptance protocol

Test desktop Chrome, Android Chrome, iPhone Safari, Android native development build, and iPhone native development build. Record exact device model, OS, browser/app version, build identifier, front/rear camera, cube type, lighting, and date. Keep the phone propped up, turn slowly, and pause between turns. Use a standard six-color 3×3 with one color per center; no manual color entry.

## Recordings and ground truth

Keep recordings locally in `artifacts/recordings/<platform>/<trial>/`. No recording is uploaded by the app. Use device screen recording plus an independent overhead recording that shows every actual layer turn and the final six faces. Record or photograph the starting six faces independently, then label the starting state in URFDLB order and the center mapping. Keep frame timestamps and expected visible grids in `observations.json` using `CubeObservation` from `src/core/types.ts`. Synthetic fixtures must stay labeled synthetic.

For pixel regression, save representative camera frames as RGBA bytes or PNG with timestamp, expected quad corners, grid colors, quality label (`good`, `blur`, `glare`, `occluded`, `missing`), and known logical state. A human should verify labels against the independently recorded scramble. Include stickered and stickerless cubes, arbitrary scan orders, in-plane rotations, whole-cube rotations, correct/wrong turns, partial fingers, blur, glare, repeated same-color squares, camera loss, and multiple missed turns.

## Ten capture trials per phone/surface

For the October 14 six-face stall, scan each face individually in a varied order and orientation. After 6/6, require either a valid solution opening automatically or an explicit request for a named center and neighboring side together. For ambiguous states, show the requested neighboring view and continue until the reconstruction is unique. Confirm saved faces remain at 6/6 through brief blur/missing frames, and that the first 3D state matches the real cube up to rotation. Reset or show a contradictory color pattern while reconstruction is pending; an obsolete result must not open a solution. Record the time from the sixth saved face to the solution separately from total capture time.

For the October 12 two-face failure, first retain a 20–30 second screen recording of the actual failed scan and use **Help → Save a camera photo** on each uncaptured face. Record the camera in use and cube type. On the updated build, confirm that individual uncertain squares are marked, saved views request rotation, and frame processing at 960 pixels stays within the physical one-second deadline. Repeat with a small cube in portrait, brief confidence dips, and whole-cube rotations. A permanently uncertain square must remain unconfirmed; a real layer twist must still trigger rechecking.

Use ten different legal known scrambles. Vary which face appears first and the order of whole-cube rotations. Begin timing at the first clear cube view. Stop at “Cube captured.” Compare the reconstructed state with ground truth up to whole-cube rotation. A timed-out, rejected, or incorrect state is a failed trial. Target: at least 9/10 correct captures within 30 seconds on each phone.

## Ten complete solves per platform

Also start from an independently confirmed solved cube and make one or two known outer face turns. Scan fresh with a different first face and in-plane orientation. A single quarter turn must produce one 90-degree step; two quarter turns must need at most two, allowing cancellation. Half turns count as two 90-degree steps, so two half turns need at most four. Follow the displayed moves and confirm the physical cube is solved. Repeat with an already solved cube, which may require a three-sided view to establish its center orientation but must produce zero solution steps. Do not judge optimality from the step count unless the exact starting moves and state are recorded.

Every trial includes one deliberate incorrect quarter turn, whose identity and time are labeled independently. Follow the remaining arrows. Record whether the wrong turn is identified and replanned without manual color input, whether recovery is needed, and whether the final physical cube is solved. Target: at least 9/10 full solves for each platform. Do not exclude inconvenient failures.

For every settled turn, label the instant the layer stops moving and the instant the confirmation appears. Report nearest-rank p95 latency across all labeled settled turns; target ≤1,000 ms. Record false confirmations separately even if the solve later recovers. **Any false move confirmation or false solved declaration fails acceptance for that recording set.** A hidden/ambiguous turn must request a new angle, not guess.

## Camera pointed at a picture

On each phone/surface, test a known valid six-panel diagram printed on paper and displayed on another screen. Test both 3×2 and 2×3 arrangements, first with **Point camera at a picture**, then with the ordinary cube start action. Keep all panels visible and text upright. Record the actual camera frames, all 54 ground-truth colors, capture time, panel order, and review result. Include moderate tilt, glare, a covered panel, camera switch/background/resume, and a changed diagram during capture. Partial or unstable diagrams must not silently fill missing faces.

Verify that a repeated center color is captured spatially but rejected by cube validation, and that a valid diagram yields a solution which solves the independently labeled state. Face names and rotations require review; automatic OCR is not implemented. A static diagram must never count as physical turn or solved-state evidence. These trials are separate from physical-cube acceptance and remain unmeasured.

Also test the upright unfolded net U / L F R B / D on paper and a screen. Check that geometry assigns the correct face names and orientations. Crop or cover each face in turn; a confident five-face layout should request that face and never proceed to a solution. Repeat the reported case with the rightmost Back column cut off. Bring the full Back face back into view and require a new stable capture. Point at a 4×4 net and check that the app requests a 3×3 diagram rather than capturing a 3×3 subgrid.

Repeat the complete test net in portrait and landscape phone orientations, with the sheet occupying roughly 60%, 80%, and 95% of the frame width. Record source and processed pixel dimensions and processing latency. The previous 640-pixel long-side limit erased white-square boundaries in portrait video. Picture frames now retain up to 1280 pixels; verify that all nine squares of every face remain independently visible. An auto-detected diagram must stay in picture mode through temporarily partial views, without switching back to lower-resolution cube scanning.

Include a joined net with identical spacing between every sticker, including across face boundaries. Compare all 54 colors with ground truth; outlines must not shift one column into neighboring faces. Repeat with tilt, a covered square, a covered face, and additional rows/columns that do not form the supported net. The supplied black-background joined net previously detected only four incorrectly grouped windows and must now form the correct six faces.

## Failure handling

- Deny camera access, then grant it and retry.
- Remove camera access or disconnect the webcam during scanning and guidance.
- Pause/resume, switch cameras, and background/resume while scanning, solving, and verifying.
- Hide a target face; rotate the whole cube; confirm arrow direction and face alignment after every orientation change.
- Remove/rename the deployed WASM or worker file; verify a clear initialization error and a usable retry path.
- Make two unobserved layer turns and show the cube again; expect reacquisition, never a false confirmation.
- Obscure a changed face near the solved state; require additional views, never inferred success.

## Trial record

Copy this record for each platform and trial. `null` means unmeasured, never passed.

```json
{
  "kind": "physical", "device": null, "os": null, "surface": null,
  "version": null, "build": null, "date": null, "camera": "front",
  "cube": null, "lighting": null, "trial": 1,
  "scramble": null, "startingFacelets": null, "centers": null,
  "captureMs": null, "captureCorrect": null,
  "wrongMove": null, "wrongMoveRecognized": null,
  "settledToConfirmedMs": [], "falseConfirmations": null,
  "physicalCubeSolved": null, "falseSolved": null,
  "recordingPath": null, "limitations": []
}
```

No physical recording set has been supplied or collected in the current workspace. Real-device acceptance cannot be inferred from unit tests or responsive browser screenshots.
