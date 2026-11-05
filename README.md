# PDA.exe — Once A Normal City tracker

A fan-made site for tracking which PDA entries (weapons, people and documents) you've found in the Roblox game **Once A Normal City**. It's styled after the in-game PDA.

Not affiliated with the game's developers.

## Using it
- Click any entry to mark it found. Click it again to unmark it.
- Press the small **i** on a weapon to open its stat page.
- Progress is saved in your browser. Use the **CLOUD** tab to download a backup or move your progress to another device.

## Adding or fixing entries
Everything is in **`data.js`**. Comments at the top of the file show the format.

- Unknown entries are written as `"???"`. Replace them with the real name once you know it.
- Empty categories (Machine Guns, Shotguns, etc.) just need their tiers filled in.
- To add a picture for a person or weapon, put the image in `images/` and add `{ img: "images/file.webp" }` to the entry.

## Files
| File | What it does |
|---|---|
| `index.html` | Page shell |
| `style.css` | PDA look |
| `app.js` | Tabs, tracking, backups |
| `data.js` | The entry list |
