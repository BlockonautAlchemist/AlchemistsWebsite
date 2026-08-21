# Third Party Notices

## Command Center visual design

The `/command-center` room geometry, palette, layer decomposition, animation language,
inspection-panel rules, responsive framing and asset specification are implemented from the
Claude Design "SpawnCamper Command Center" bible (REV 01), an original work authored by the
site owner for this project. No third-party assets, fonts or dependencies were introduced by
that design: it uses only the Google Fonts this site already loads (Russo One, Audiowide,
Saira, JetBrains Mono) and no npm packages. Its Claude Design canvas runtime (`support.js`)
and page shell are development tooling and are not shipped.

`assets/command-center/reference/spawncamper9000-character-reference.png` is the site owner's
own SpawnCamper9000 character render, retained as an art reference only. It is excluded from
the build and is never loaded as a scene texture.

No exported design asset was found to be derived from Star Office UI or LimeZu artwork.

## Star Office UI

The `/command-center` frontend adapts code and interaction concepts from Star Office UI: a fixed-size scene layout, config-driven areas, state-to-area mapping, agent focus movement, ambient prop animation, simultaneous area activity, stale-state fallback, and mobile canvas framing.

No Star Office UI artwork, LimeZu artwork, room backgrounds, character sprites, furniture sprites, decoration sprites, guest sprites, button skins, Flask backend code, mutation endpoints, memo features, join-key features, asset drawer code, Gemini room generation, or desktop-pet code is included.

Source: `../Star-Office-UI-reference` in the local development workspace.

Code/logic license: MIT.

Copyright (c) 2026 Ring Hyacinth & Simon Lee

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files, to deal in the software without restriction, including rights to use, copy, modify, merge, publish, distribute, sublicense, and sell copies, and to permit persons to whom the software is furnished to do so, subject to inclusion of the copyright notice and permission notice.

The software is provided "as is", without warranty of any kind, express or implied, including warranties of merchantability, fitness for a particular purpose, and noninfringement. The authors or copyright holders are not liable for claims, damages, or other liability arising from the software or its use.
