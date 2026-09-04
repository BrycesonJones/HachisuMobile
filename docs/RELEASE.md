# Release configuration notes

## Build profiles (`eas.json`)

- `production`: App Store / TestFlight builds. Build numbers are managed
  remotely by EAS (`cli.appVersionSource: remote`) and auto-incremented.
- `preview`: internal-distribution builds for device testing.
- There is deliberately no `development` profile: `expo-dev-client` is not
  installed, so a `developmentClient: true` profile would fail to build.

Every profile extends `base`, whose `env` carries the PUBLIC Supabase URL and
anon key (the same values every shipped bundle already contains) and pins the
development toggles (`EXPO_PUBLIC_AUTH_DEV_BYPASS`, `EXPO_PUBLIC_DEV_AUTH_BYPASS`,
`EXPO_PUBLIC_PROFILE_DEBUG`) to `"false"`. `.env` is gitignored and is never
uploaded to EAS, so without this block a cloud build has no `EXPO_PUBLIC_*`
values at all and the app throws on cold start. `npm run check:config`
(rule 9) enforces this shape.

## Export compliance — PROVISIONAL

`app.json` sets `ios.infoPlist.ITSAppUsesNonExemptEncryption` to `false`.
This is a **provisional** value from the App Store readiness audit, Section 1
(build & completeness, 2026-09-04). It reflects only what was observed then:
the app uses HTTPS/TLS and platform-provided hashing and CSPRNG
(`lib/crypto/polyfill.ts`), and implements no proprietary encryption.

It is **not** a final export-compliance determination. Section 10 of the audit
(Export Compliance / Encryption) owns that decision and must confirm or change
this value before submission. Do not treat this note as clearance.
