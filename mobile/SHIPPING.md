# Shipping the mobile app

EAS project: [@cbenwell/griptrack-mobile](https://expo.dev/accounts/cbenwell/projects/griptrack-mobile)
(`eas-cli` is authenticated on this machine; all commands run from `mobile/`.)

`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` are stored as EAS
project env vars for the `preview` and `production` environments — builds get
them automatically; the local `.env` is only for `expo start`.

## Android — available now (no store account needed)

```bash
npx eas-cli build --profile preview --platform android   # from mobile/
npm run mobile:apk                                        # or from the repo root
```

> ⚠️ EAS commands must run from `mobile/` (or via the root `mobile:apk`
> script). Run from the repo root, `eas-cli` will treat the web app as a new
> Expo project and create a duplicate EAS project that fails to build.

Produces an installable APK with an "internal distribution" link — send it to
crew, they tap it on their phone, done. The Android keystore is managed by EAS
(generated automatically on the first build).

For the Play Store later: create a Google Play Console account ($25 one-time),
then `--profile production` (app-bundle) + `eas submit`.

## iOS — needs an Apple Developer account ($99/yr)

Bundle id `com.griptrack.mobile`; `ITSAppUsesNonExemptEncryption: false` is
set in app.json (skips the export-compliance prompt); production builds
auto-increment the build number. `eas.json` → `submit.production.ios` is
intentionally `{}` so the first submit runs interactively and captures the
IDs (see step 4).

Run all commands from `mobile/`. First-time flow, once enrollment is approved:

1. **Build.** `npx eas-cli build --profile production --platform ios`
   — first run is interactive: sign in with the Apple ID, and EAS generates
   and stores the distribution certificate + provisioning profile for you.
2. **Submit to TestFlight.** `npx eas-cli submit --platform ios --latest`
   — interactive: signs in, **auto-creates the App Store Connect app record**
   for `com.griptrack.mobile`, uploads the build.
3. **Add testers.** In App Store Connect → GripTrack → TestFlight, add crew by
   email (internal testers get it immediately; external needs a one-time
   lightweight Apple review).
4. **Make future submits one-command (optional).** After the first submit,
   grab the three values and paste them into `eas.json` →
   `submit.production.ios` so CI/non-interactive submits work:
   - `appleId` — the Apple ID email you enrolled with
   - `appleTeamId` — App Store Connect → membership, or `eas credentials`
   - `ascAppId` — App Store Connect → GripTrack → App Information → "Apple ID"
     (a number), or the id EAS printed during the first submit
   ```json
   "ios": { "appleId": "you@example.com", "appleTeamId": "XXXXXXXXXX", "ascAppId": "1234567890" }
   ```

## Google Play — device verification gate (2024+)

Personal Play Console accounts must verify access to an Android device before
publishing: install the **Google Play Console** app on any Android device,
sign in with the developer Google account (owner only), and confirm. One-time,
~2 min — a borrowed phone works; skip emulators. Until then, Android crew stay
on the internal-distribution APK links above.

## Distribution plan (decided July 2026)

Both store accounts get set up together (~$125 total): Google Play Console
($25 one-time) + Apple Developer ($99/yr). Until then, Android crews install
via internal-distribution APK links and re-install per update — acceptable at
beta scale. Once the store accounts exist, crews install once from the store
and updates arrive automatically.

## Over-the-air updates (optional extra on top of the stores)

`expo-updates` ships JS-only fixes without a store round-trip:

```bash
npx expo install expo-updates
npx eas-cli update:configure
# after a JS change:
npx eas-cli update --branch preview --message "fix: …"
```

Native changes (new packages with native code, app.json plugin changes) still
require a full rebuild — EAS prints a warning when an update can't apply.

## Notes

- The monorepo is handled automatically: EAS archives the git repo, so the
  shared `../shared` folder is included in builds.
- Version bumps for production builds are automatic (`appVersionSource:
  "remote"` + `autoIncrement`).
