# SpawnCamper9000 character reference

`spawncamper9000-character-reference.png` (2320x2219, RGBA) is the source render of
SpawnCamper9000, copied from the Claude Design "SpawnCamper Command Center" export
(`uploads/AlchemistsBossSkinPNG.png`).

**This is not a production asset and must never be loaded by the scene.** The design
bible labels it "SOURCE REFERENCE · not a production asset". It is a smooth render;
the room is hard-pixel art at a 24px tile grid, and dropping this in would be
stylistically wrong at any scale.

It lives here as the visual authority for generating `spawncamper_9000.png` — the
48x64, 8x6, 384x384 sprite sheet specified in `docs/command-center.md`. The silhouette
priorities it must preserve, in order:

1. brain-jar dome — cyan glass, magenta brain, dark cap (this is the read)
2. gold ovoid torso with purple riveted collar
3. two dark segmented tentacle arms, always trailing
4. hot orange chest core (his only warm light)

Nothing in `assets/` outside of files referenced by an HTML entry point is copied into
the Vite build, so this directory does not ship.
