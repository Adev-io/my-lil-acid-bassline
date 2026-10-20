# Plugin pattern bank (128 slots, 64 factory)

Approved by the user on 2026-10-19 (answers: 128 slots, both storage places, restore button; styles funk, disco, house, tech house, melodic).

- 128 slots. Slots 1-64 are factory patterns, 65-128 start empty. Any slot can be overwritten by editing it. Restore returns a factory slot to the original (an empty slot is cleared).
- Factory set (names "Funk 01" etc.): funk 1-13, disco 14-26, house 27-39, tech house 40-51, melodic 52-64. Lengths 8-32, written in the web app's step notation. Factory data lives in the page (`factory.js`); the processor only stores edits.
- The processor plays the current slot's pattern (`pattern`, always the real content, saved in project state, so playback works with the editor closed). It also keeps `overrides` (slot to pattern JSON, only slots that differ from factory/empty) and `cur`.
- Edits are saved in the FL project (`bank` state property) and in a user bank file `%APPDATA%\A_Development\MyLilAcidBassline\bank.json`. A new instance loads the file, then the project's saved overrides win per slot.
- Window: page slot picker (prev, next, a 128-entry list showing "07 Funk 07" or "70 User"), Restore button. The old bank/group/slot buttons are hidden in the plugin.
