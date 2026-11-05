# PDA.exe — Once A Normal City tracker

A fan-made site for tracking which PDA entries (weapons, people and documents) you've found in the Roblox game **Once A Normal City**. It's styled after the in-game PDA.

Not affiliated with the game's developers.

## Using it
- Click an entry to mark it found, and click it again to unmark it. Found entries go to the front, A–Z, followed by the ones you haven't found, also A–Z.
- **Tiers:** click a TIER header to unlock (or lock) the whole tier. It asks "ARE YOU SURE?" first.
- **People:** cards that hold several people (Robinson, Rogues, Miners…) open into a page with a tab for each person. Each person is tracked separately with the star.
- **Search:** type in the search bar, or press `/`. It finds weapons, people and documents, and also lists people who carry a matching weapon.
- Press the small **i** to open a weapon's or person's stat page.
- Progress is saved in your browser. Use the **CLOUD** tab to back it up or move it to another device.

## Editing
| File | What it does |
|---|---|
| `data.js` | Every weapon, person (with stats) and document |
| `sounds.js` | Which sound file plays for each action, and its volume |
| `sounds/` | The sound files themselves. Each one is separate, so you can swap any of them |
| `index.html`, `style.css`, `app.js` | Page, look and logic |

To replace a sound, put your `.mp3`, `.ogg` or `.wav` in `sounds/` and change its `file` in `sounds.js`. Set a sound's file to `""` to turn it off.
