# PDA.exe — Once A Normal City tracker

A fan-made site for tracking which PDA entries (weapons, people and documents) you've found in the Roblox game **Once A Normal City**. It's styled after the in-game PDA.

Not affiliated with the game's developers.

## Using it
- **Click** a weapon, person or document to open its page.
- **Hover** over it and press the **star** that appears in the corner to mark it found (press again to unmark). On phones the star is always visible. Found entries go to the front, A–Z, followed by the ones you haven't found, also A–Z.
- **Tiers:** click a TIER header to unlock (or lock) the whole tier. It asks "ARE YOU SURE?" first.
- **People:** cards that hold several variants (Robinson, Rogues, Miners…) are one unlock. Mark the card and you can view every variant through the tabs along the bottom of its page.
- **Search:** type in the search bar, or press `/`. It finds weapons, people and documents, and also lists people who carry a matching weapon.
- Progress is saved in your browser. Use the **CLOUD** tab to back it up or move it to another device.

## Editing
| File | What it does |
|---|---|
| `data.js` | Every weapon, person (with stats) and document |
| `sounds.js` | Which sound file plays for each action, and its volume |
| `sounds/` | The sound files themselves. Each one is separate, so you can swap any of them |
| `index.html`, `style.css`, `app.js` | Page, look and logic |

To replace a sound, put your `.mp3`, `.ogg` or `.wav` in `sounds/` and change its `file` in `sounds.js`. Set a sound's file to `""` to turn it off.

## Adding images
1. Put the picture in the `images/` folder. `.webp` or `.jpg` keep the site small; screenshots of a few hundred KB are fine.
2. In `data.js`, add `img` (one picture) or `imgs` (several) to the entry:

```js
// a weapon
["Glock 18", { img: "images/glock18.webp", stats: { ... } }]

// a weapon with several pictures, each with its own hover text
["Glock 18", { imgs: [
    { src: "images/glock18.webp",      caption: "Default" },
    { src: "images/glock18-ext.webp",  caption: "With extended mag" }
  ], stats: { ... } }]

// a person: wrap P(...) with Object.assign
Object.assign(P("Tony", { ... }, { ... }, [ ... ]), { imgs: ["images/tony1.webp", "images/tony2.webp"] }),

// a whole group card (shown on the card and for any variant without its own)
Object.assign(G("Robinson", [ ... ]), { img: "images/robinson.webp" }),

// a document
["Swamp", { img: "images/swamp.webp" }]
```

The ◀ ▶ arrows next to **Preview** flip between pictures, and hovering a picture shows its `caption`.

## Other files
| File | What it does |
|---|---|
| `descriptions.js` | Every person's Description text |
| `tooltips.js` | The hover text for every stat (people and weapons) |
