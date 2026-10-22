# Shipping the mobile app

EAS project: [@cbenwell/griptrack-mobile](https://expo.dev/accounts/cbenwell/projects/griptrack-mobile)
(`eas-cli` is authenticated on Chris's Mac.)

> ⚠️ Run EAS commands from `mobile/`, or through the root `npm run mobile:*`
> scripts, which `cd mobile` first. Run from the repo root, `eas-cli` treats the
> web app as a new Expo project and creates a duplicate EAS project.

`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` are EAS project
env vars for the `preview` and `production` environments. Builds get them
automatically; the local `mobile/.env` is only for `expo start`.

## Current state (Oct 2026)

| Platform | Channel | Latest build |
|---|---|---|
| iOS | TestFlight (App Store Connect app `6788005208`, team `XB4R5BXJ7S`) | 1.0.0 (5), 2026-07-20 |
| Android | Google Play **internal testing** track (`com.griptrack.mobile`) | 1.0.0 (versionCode 2), 2026-10-17 |

**No over-the-air updates.** `expo-updates` is not installed. Every JS change
reaches testers only through a new store build, so batch fixes into a build.
Shipped builds stay in testers' hands for weeks. Backend changes (RPCs, edge
functions, RLS) must keep working for the builds already out there: add
overloads and never change a signature or response shape that an old build
uses.

## Versioning

`eas.json` sets `appVersionSource: "remote"` and `production.autoIncrement`, so
EAS owns the iOS build number and the Android versionCode and bumps them on
every production build. `app.json` deliberately has no `buildNumber` /
`versionCode`. To ship a new user-facing version, bump `expo.version` in
`app.json` (e.g. `1.0.0` → `1.1.0`).

## Release checklist

1. Pushed SQL / edge-function changes the build depends on are already deployed
   (`supabase db push`, `supabase functions deploy <name>`).
2. `cd mobile && npx jest --ci && npx tsc --noEmit` pass.
3. Build and submit (from the repo root):

```bash
npm run mobile:ios              # production iOS build
npm run mobile:ios:submit       # upload latest iOS build to TestFlight
npm run mobile:android          # production Android app bundle (.aab)
npm run mobile:android:submit   # upload latest .aab to the Play internal track
```

4. iOS: the build appears in App Store Connect → TestFlight after processing
   (~10–30 min). Internal testers get it straight away. External testers need
   Apple's beta review for a new version.
5. Android: the internal track rolls out to the tester list as soon as Play
   finishes processing.

### Submit credentials

- **iOS** — `eas.json` → `submit.production.ios` has `appleTeamId` + `ascAppId`.
  With the App Store Connect API key that EAS stores, submits run without a
  login. If `eas-cli` asks for an Apple ID, it reads `EXPO_APPLE_ID` from the
  environment (`export EXPO_APPLE_ID=…` in `~/.zshrc`). Never commit a personal
  Apple ID to `eas.json`: this repo is public.
- **Android** — `submit.production.android` reads the Google Play service-account
  JSON from `mobile/google-play-key.json` (gitignored; never commit it). Put
  the file there before `mobile:android:submit`, or upload it to EAS
  (`npx eas-cli credentials -p android` → Google Service Account) and remove
  `serviceAccountKeyPath` from `eas.json`. Track: `internal`.

## Side-loadable Android APK (no store)

```bash
npm run mobile:apk              # preview profile → installable .apk + internal-distribution link
```

Useful for a device that is not on the Play tester list. The keystore is
managed by EAS and shared with production builds.

## Development builds

`eas.json` → `development` (dev client; iOS simulator). Run it from `mobile/`:
`npx eas-cli build --profile development --platform ios`. Native changes (new
native packages, `app.json` plugin changes, an Expo SDK upgrade) need a fresh
dev build.

## Notes

- EAS archives the git repo, so the shared `../shared` folder is included in
  builds (Metro watch folder).
- Personal Play Console accounts had to pass Google's one-time
  device-verification gate; that is done.
