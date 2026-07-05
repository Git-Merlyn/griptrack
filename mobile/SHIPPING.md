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

1. Enroll at developer.apple.com, then:
2. `npx eas-cli build --profile production --platform ios`
   — EAS walks through certificates/profiles automatically on first run
   (interactive; sign in with the Apple ID).
3. `npx eas-cli submit --platform ios` to push to TestFlight; fill in the
   `submit.production.ios` placeholders in `eas.json` (appleId, ascAppId,
   appleTeamId) to make submits non-interactive.
4. In App Store Connect, add testers to TestFlight.

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
