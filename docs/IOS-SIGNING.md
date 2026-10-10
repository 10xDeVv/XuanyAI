# Use your friend's Apple signing credentials

An Apple account login and `credentials.json` are different things. The JSON only tells EAS where to find existing signing files. It cannot create a certificate, supply its missing private key, or grant Apple Developer access.

Your friend, as the authorized Apple account holder, must set up:

1. An **Apple Distribution certificate with its private key**, exported as a password-protected `.p12` file. A `.cer` file by itself is insufficient.
2. An **ad hoc provisioning profile** for bundle ID `com.xuanyai.pointscansolve`, using that certificate and including the UDIDs of the iPhones that will install the development build.

If he already has access to this Expo project, he can use `npx eas-cli credentials --platform ios` to set up build credentials. Expo's credentials menu can download managed credentials to `credentials.json`. Once the project's valid credentials are stored remotely, teammates with the required Expo access can build without Apple login. An individual Apple Developer membership only lets the account holder generate credentials; organization memberships support additional authorized roles.

The project is `@10xdevv/point-scan-solve`, project ID `2937eb1d-5969-4010-bb76-9cf8ded821fe`. He needs a copy of this project and authorized Expo project access, in addition to his Apple Developer access. In the credentials menu, select the `development` profile and set up the build credentials. Register the installing iPhone with `npx eas-cli device:create` before creating or updating its ad hoc profile.

To download credentials that have already been created, select **Credentials.json: Upload/Download credentials between EAS servers and your local json**, then **Download credentials from EAS to credentials.json**. The download includes the referenced signing files; keep those files together with the JSON. If the credentials are stored remotely, the ordinary `development` profile is enough and downloading them is optional.

If he supplies the files directly through your existing secure file-sharing method:

1. Put them at `certs/distribution.p12` and `certs/point-scan-solve.mobileprovision` in this project.
2. Copy `credentials.example.json` to `credentials.json`.
3. Edit only the **local** `credentials.json` to insert the `.p12` export password and adjust the paths if needed.
4. Run:

```sh
npx eas-cli build --profile development-local --platform ios
```

Both `credentials.json` and `certs/` are excluded from Git and ordinary source archives. EAS reads local signing credentials separately and transmits them to its build worker for signing. Do not paste the private key or password into chat. Don't revoke an existing certificate used by your friend's other apps just to create this prototype.

Sources: [Expo local credentials](https://docs.expo.dev/app-signing/local-credentials/), [syncing and downloading credentials](https://docs.expo.dev/app-signing/syncing-credentials/), [managed credentials](https://docs.expo.dev/app-signing/managed-credentials/), [Apple Developer permissions](https://docs.expo.dev/app-signing/apple-developer-program-roles-and-permissions/).
