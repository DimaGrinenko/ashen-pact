# Audio sources — ASHEN PACT

The active game uses `public/ashen/audio/`. The source pages were inspected on 2026-09-09; byte-level mapping to the downloaded Kenney archive was verified on 2026-09-10.

## Background music

`deep-humidity.ogg`: **Deep Humidity**, by **TinyWorlds**, published 2014-12-02. The author-uploaded [OpenGameArt asset page](https://opengameart.org/content/deep-humidity) explicitly identifies **CC0**. The original download is [deep-humidity.ogg](https://opengameart.org/sites/default/files/deep-humidity.ogg).

The game loops the file and applies playback gain. CC0 attribution is not mandatory; the author and source are retained here for provenance. This is publicly available soundtrack material selected for the project, not newly composed or generated music.

## Interface and event effects

The six effects are unmodified audio files from **Interface Sounds 1.0**, created/distributed by **Kenney**, dated 2020-02-11 in the downloaded pack's license. Both the [official asset page](https://kenney.nl/assets/interface-sounds) and its included license identify **Creative Commons Zero (CC0)**. [Kenney's support page](https://kenney.nl/support) confirms commercial use is permitted and attribution is optional.

Exact source-file matches were established by SHA-256, not inferred from filenames:

- `click.ogg` ← `Audio/click_003.ogg`.
- `spin.ogg` ← `Audio/open_003.ogg`.
- `stop.ogg` ← `Audio/switch_003.ogg`.
- `wheel.ogg` ← `Audio/open_004.ogg`.
- `win.ogg` ← `Audio/confirmation_002.ogg`.
- `bonus.ogg` ← `Audio/confirmation_004.ogg`.

The game renames these files for event dispatch and adjusts playback volume. The audio bytes match the source files exactly. Download: [Kenney Interface Sounds ZIP](https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip). License reference: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).

For convenient credits: “Music: Deep Humidity — TinyWorlds (CC0). Interface sounds: Kenney (CC0).”

## Excluded reference material

The inherited Alchemist/Zeus vs Hades audio documentation attributes its samples to the user-provided reference. It does not establish commercial redistribution rights. Those samples, including processed character laughter and the previous soundtrack, are not used by `src/ashen/audio.ts` and are excluded from the production and compact source archives.

This file records source provenance and the stated licenses. It does not claim that the game, other artwork, fonts, or Spine Runtime has received platform approval.
