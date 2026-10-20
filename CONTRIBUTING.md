# Contributing

- Web app: `bun test` (or `node --test`) must pass. `acidbass.js` is the pure half and is where the tests live.
- Plugin: `plugin\build.bat` builds and runs the smoke test; it must pass. CI runs the same on every PR.
- Open a pull request against `main`. Small, described changes merge fastest.
- Licences: `plugin/` is AGPL-3.0-or-later, everything else MIT. By contributing you agree your change is under the licence of the folder it lands in. No CLA.
- Keep the clean-room rule: no code or assets copied from other plugins.
