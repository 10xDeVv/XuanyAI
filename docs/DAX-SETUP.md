# Dax: set up iPhone signing

You are the paid Apple Developer account holder. Sign into Apple yourself when the EAS CLI prompts you; Expo creates and stores the distribution certificate and provisioning profile for this project. No Apple password needs to be shared.

## 1. Accept access and get the project

Accept the GitHub repository invitation and the separate Expo invitation using your own accounts. Expo **Developer** access is sufficient to manage build credentials. GitHub access alone does not grant Expo access.

Install Git and Node **22.16 or a newer supported LTS**, then run:

```sh
git clone https://github.com/10xDeVv/XuanyAI.git
cd XuanyAI
npm ci
npx eas-cli login
npx eas-cli whoami
npx eas-cli project:info
```

Use your own Expo login. The project is [@xuanyai/point-scan-solve](https://expo.dev/accounts/xuanyai/projects/point-scan-solve) in the **XuanyAI** organization. The project ID must be **2937eb1d-5969-4010-bb76-9cf8ded821fe**. Its bundle identifier is **com.xuanyai.pointscansolve**. The existing `app.json` is already linked; do not initialize a replacement Expo project. If access is denied, accept the Expo invitation and retry.

GitHub's **Code → Download ZIP** is an alternative to `git clone`. The cloud build needs the source folder, not the local `.tools`, `node_modules`, generated native directories, or cached SDKs. You do not need to install Xcode, OpenCV, or Emscripten to request this cloud build; its install hook prepares the native dependencies.

If you cloned earlier, run `git pull` and `npm ci` before building. The photo solver adds `expo-image-picker`, so it requires a new native development client. Earlier APKs do not contain that module. The browser update is available without installing an app.

## 2. Register the test iPhones

```sh
npx eas-cli device:create
```

Use the website registration option and open the supplied link on each iPhone that will install this development build. Complete the device-registration prompts. When EAS asks for Apple authentication, use your paid Apple Developer account and complete two-factor authentication yourself. Choose the correct paid Apple team if more than one is listed.

Device registration is needed for an ad hoc development build. A newly registered iPhone needs to be included in the provisioning profile before it can install the app.

## 3. Let EAS set up signing and build

```sh
npx eas-cli build --profile development --platform ios
```

When prompted:

- Sign into Apple and select your paid team.
- Allow EAS to register/use `com.xuanyai.pointscansolve` for this app.
- Allow EAS to generate an Apple Distribution certificate, or select a suitable existing certificate that includes its private key.
- Allow EAS to generate/update the ad hoc provisioning profile and include the registered test iPhones.
- Continue until the build has been submitted and the CLI shows its build URL.

If Apple asks you to accept a new agreement, complete that yourself in the Apple Developer portal, then rerun the build. If you reach Apple's certificate limit, inspect the existing certificates with the account owner before revoking anything used by another app.

The regular `development` profile uses **remote Expo credentials**. You do not need `credentials.json` for this path. To inspect or repair the setup independently, run `npx eas-cli credentials --platform ios` and select `development`.

## 4. Install and run

Open the completed EAS build's installation link on a registered iPhone. Follow the iPhone's developer-mode prompts if shown. This is a **development client**, so start the project server on your computer:

```sh
npm run build:workers
npx expo start --dev-client
```

Keep the computer and iPhone on the same network and open the development server from the installed app. Expo Go cannot load this project's custom camera module. The browser version is available independently at https://point-scan-solve-10xdevv--prototype.expo.app .

Send the project owner the **EAS build URL** and any non-secret error text. Do not send Apple passwords, two-factor codes, certificate passwords, or signing files through the GitHub repository. After signing is configured, authorized Expo teammates can use the stored credentials; when prompted, they can skip Apple login if no credential/device changes are needed.

The prototype still requires the real-device trials in [ACCEPTANCE.md](ACCEPTANCE.md). A successful build is not proof that camera recognition or overlay alignment passes acceptance.

References: [Expo internal distribution](https://docs.expo.dev/build/internal-distribution/), [managed credentials](https://docs.expo.dev/app-signing/managed-credentials/), [Apple signing permissions](https://docs.expo.dev/app-signing/apple-developer-program-roles-and-permissions/), [Expo account roles](https://docs.expo.dev/accounts/account-types/).
