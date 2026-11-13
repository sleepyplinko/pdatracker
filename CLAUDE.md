# Working notes for Claude (PDA.exe tracker)

Read this first after any break or conversation summary. Update it whenever something here changes, and every so often during long sessions. Keep it short and current. No secrets in this file: the repo is served publicly by GitHub Pages.

## What the site is
- Fan checklist for the PDA in the Roblox game **Once A Normal City**: weapons (TOOLS), people (BIOGRAPHY), DOCUMENTS. Its main job is **checking off PDA entries**; everything else supports that.
- Looks and sounds like the in-game PDA: Inconsolata font, real game icons, game sounds, page slide, pastel tab colours (TOOLS, BIOGRAPHY, DOCUMENTS and SETTINGS stay white like the game; ADMIN is red).
- Live: https://sleepyplinko.github.io/pdatracker/ (GitHub Pages, repo `sleepyplinko/pdatracker`, branch `main`).
- Owner: sleepyplinko (Gabewant). Admins: sleepyplinko and ForsakenFireFly.

## How the owner wants me to work
- **Accuracy first.** Never invent stats, text or game mechanics. Copy exactly what the game shows (keep in-game quirks like a comment of `--` or a trailing ` [EPIC],`). If something is unknown, leave it blank and say so.
- When given a video, pull the data out frame by frame (crop the stats/comment panels at full resolution) instead of guessing.
- Actually implement and push changes; don't just describe them or hand over files. Test in a browser (Playwright) before saying something works. I can't reach the live site from the sandbox, so say so instead of claiming it's live-verified.
- Every push: bump `pda-tracker-vN` in `sw.js`, and add a changelog line at the top of the newest date block in `changelog.js`.
- Previews regenerate on GitHub (daily + on data pushes); locally run `node tools/previews.js` if needed.
- Admin edits live on the Worker, not in data.js. `e/overrides.json` is a copy the preview job saves (daily / on data pushes): **read it before reporting gaps or checking data**, or test with it loaded (`localStorage pda-overrides-v1`). Owner edits through ADMIN only and never wants to touch GitHub. Owner wants the site to look good when posted on Discord.
- Code has no explanatory comments (owner's call): write code for myself, keep notes here instead.
- Commit messages end with the Co-Authored-By / Claude-Session lines from the session's attribution reminder.
- README is a short description + credits only, not a guide.
- MANUAL → ABOUT says "Built with AI (Claude)." (owner's choice of spot).
- Site text (manual, changelog, help notes): incredibly short and simple. Changelog items are a few words each.
- Replies short and plain. When suggesting ideas, give a few good ones; if the owner passes, don't push them.
- From time to time, re-read this file and the code to stay current on what the owner wants.

## Hard rules / decided
- **No colourful emojis.** Use monochrome symbols (⚠&#xFE0E;, ▸, ⓘ, ✎, ✦, ★) with `&#xFE0E;` where needed.
- **Pictures are link-only.** No file uploads anywhere (security). Giphy/Imgur page links get turned into the GIF.
- **No player accounts**, no PLAYERS tab. Progress lives in the browser; CLOUD has backup download/upload, transfer link/code/QR (24h, replace or combine), screenshot import, paste-a-list.
- **Admin:** sign in from a button in SETTINGS with the shared ADMIN login; then the ADMIN tab appears. The password lives only in the Cloudflare Worker secret `ADMIN_KEYS` ("name=pass,..."), never in site code.
- **Discord webhook** stays server-side in the Worker secret (`ANNOUNCE_WEBHOOK`), pings everyone. Never paste it into site code.
- Keep share links (entry links: the address bar shows `…/pdatracker/e/<hash>/` while a page is open (`syncURL()` via replaceState; `<base>` tag in index.html keeps relative files working) and LINK copies the same; `#e=` still works; profile share `#v=`, damage calc `#dmg=`).
- Credit **gluehesthar** (@iaminyourwallsiaminyourwalls on Discord) for the OANC Ammo Chart wherever ammo data shows.
- **Rejected / not wanted:** completion rewards, "dropped by" or route features, damage over distance/headshots (game has neither), weapon records page, NPC compare, recently viewed, document reading mode, public change history, reload time in the damage calculator (dropped 2026-11-10: hand-loading timing unclear; only data point: 5 rounds into a 17rnd Glock Mag took ~0.6s).
- Gear has no WEIGHT in the game, so never flag it as missing weight. Same for any item (ammo included) whose PDA page shows no WEIGHT line: it weighs nothing (owner). Leave WEIGHT out, don't add 0.
- Supershield math: blocked hits = `ss > B ? ceil((ss - B) / max(1, B)) : 0`; shown inline as "N supershield + M health = X hits to kill". (Owner had me undo a different change here once; don't touch without being asked.)

## Files
| File | What |
|---|---|
| `data.js` | Every weapon (stats, comment, modes, tiers), person (`P(...)`, groups `G(...)`, loadouts `W/A/M`), document |
| `descriptions.js` | Biography Description text (`PDA_DESC`), document text (`PDA_DOC_DESC`, key = doc name), and `PDA_TEXT_WIKI` (name → wiki page) for texts copied from the OANC Wiki; those show a "TEXT: OANC WIKI" link under the description (`wikiCredit` in app.js) unless an admin override replaces the text |
| `tooltips.js` | Hover text for stats |
| `ammo.js` / `ammo-links.js` | Ammo chart data (parser handles chart typos; reproduces all rows) and caliber links |
| `sounds.js` + `sounds/game/*.mp3` | Which game sound plays for what. Bump `?v=` when replacing a file |
| `changelog.js` | Shown on SUBMIT; newest first |
| `app.js` | All logic (render, tabs, damage calc, loadout, cloud, admin, sounds) |
| `style.css`, `index.html` | Look and page shell; background `images/bg/patio.jpg` |
| `qr.js` | QR generator (`window.PDA_QR(text)` → SVG) for transfer codes |
| `sw.js` | Offline cache, cache-first (instant repeat loads). Page auto-reloads when a new version activates (or shows an UPDATED bar if the user is mid-use). Bump version every push |
| `tools/previews.js` | Generates `e/<hash>/index.html` + `card.jpg` (1200×630 PDA-style card: picture, name, key stats in game colours, comment/description) for Discord large-image previews; applies live admin overrides from the Worker (`NO_OVERRIDES=1` to skip); only redraws changed entries (`e/manifest.json`, bump `VERSION` to redraw all). `.github/workflows/previews.yml` runs it daily, on data pushes, and by hand (Actions → Discord previews → Run). `404.html` covers entries without a page |
| `backend/` | Cloudflare Worker + D1 (`worker.js`, schema updates, README with setup steps 1–8) |

## Features (as of 2026-11-09)
- Tabs: top = TOOLS, BIOGRAPHY, DOCUMENTS, WHAT'S LEFT, LOADOUT, DAMAGE; bottom = PROFILE, CLOUD, MANUAL, SETTINGS, SUBMIT (+ ADMIN for admins).
- Marking: star on hover / always on phones, tier header marks whole tier (ARE YOU SURE?), ENTER in search quick-marks, swipe on phones, FOUND + NEXT, NEXT MISSING, random missing, undo, keyboard mode, colour-blind marks.
- Entry pages: stats with colours like the game, comment, My Notes, multiple pictures/GIFs, ⋯ menu (LINK, FIX?, COMPARE, DAMAGE CALC), times found, "found by %" (anonymous sharing, can be turned off).
- WHAT'S LEFT: almost done list, NEW-entry filter, copy/print missing list. SINCE YOUR LAST VISIT note.
- DAMAGE: weapon/mode/ammo/target pickers, superarmor → armor pen → defense, supershield, shield (explosives/bludgeons skip), TTK (burst guns: shots 60/RPM apart inside a burst of BURST AMOUNT, BURST DELAY between bursts, per owner; AUTO only means you can hold the trigger (owner), so every BURST: YES gun always fires in bursts; no fire-mode choice), best-ammo table (fewest hits first, BEST tag, USE IT tip), COMPARE TWO LOADOUTS with verdict + SWAP, COPY LINK (`#dmg=` base64url JSON).
- LOADOUT planner with carry weight. PROFILE: save profiles, progress, favourites, this run.
- SUBMIT: send info without an account (status via token), HELP WANTED lists, changelog.
- ADMIN: TESTING section (boot-up replays; DISCORD PREVIEW picker that fetches the live `e/<hash>/` page or index.html meta tags, no-cache, and draws a Discord-style embed), review submissions, edit/add entries and ammo via overrides, notice bar, announcements, change history with undo, blocking, stats.
- Boot-up screen (`#bootscr` in index.html, `runBoot()` in app.js): original design (owner chose not to copy the game), plays every load, ~1.6s: system-check lines with real progress counts, bar, READY, CRT collapse reveal. Skip by click/key; SETTINGS toggle `bootAnim`; skipped for reduced motion and share-view. Doubles as the loading screen. First-visit tour starts after it. ADMIN → TESTING replays it (`runBoot({ force, hold })`: normal, 3 s and 8 s slow-load).
- Weapon pictures: 146 so far. Skorpion was sent by the owner; 145 come from the Once A Normal City Wiki Guns page (https://once-a-normal-city-roblox.fandom.com/wiki/Guns) and carry `picCredit: "wiki"`, which shows a "PIC: OANC WIKI" link on the picture and a credit line in the enlarged view (`PIC_CREDITS` in app.js). Keep crediting the wiki. Save as `images/tools/<slug>.webp`, add `img:` to the entry. Gun pictures fit whole (`.preview.gunprev`), on the site and on Discord cards.
- Wiki guns still without a picture here (all ARE in the tracker; the first matcher missed them, e.g. wiki uses single quotes where data.js has `"Frankenstein"` / `"Obrez"`): HK SMG-II Prototype, H&K MP7A1+, PP-19-01 Vityaz, Salient Arms GRY, AK74M, Dragunov SVD-M, SIG MCX-SPEAR, RSh-12, WC Rocket Launcher, Mosin-Nagant "Obrez", Remington 870 "Frankenstein". SCR 5.56 Raider added 2026-11-09 under HEAVY PISTOL tier 3 (owner gave the stats; no comment yet, no picture here yet). Killer² skipped: the wiki uses the same picture as AMT Hardballer. Match names loosely (quotes, case, punctuation).
- Wiki texts (2026-11-10): 9 people + 18 documents copied exactly from the OANC Wiki via its API (infobox `description` / location `comment` field; John M4 House from its "Document" section; Fiona's Diary from the Witch House page). Wiki maps: E3K Mall → E3K Brand Store, The Lake → Lake, The City → Freiden, Civilian Outpost #4 → Civilian Outpost, Sons Apartment → Son's Apartment. Single wikitext newlines in infobox fields render as paragraphs on the wiki, so they're blank lines here.
- HIDDEN entries (2026-11-12): admin editor checkbox stores `stats.HIDDEN: "YES"` in the override (no Worker change needed); `applyOverrides` strips it and sets `e.hidden`. Hidden entries still show (grey HIDDEN badge) but `countOf`, WHAT'S LEFT, NEXT MISSING and random skip them.
- Entry colours + custom categories/tabs (2026-11-13), all stored in override `stats` with `_` keys (no Worker change): `_STYLE` = normal|red|gold|#hex, `_GLOW` = YES (custom only). Categories are overrides `t|@cat|slug`, `b|@cat|slug`, `d|@cat|slug` (`_NAME`, `_COLOR`, `_KIND` for docs, `_TAB` for a custom tab); tabs are `d|@tab|slug` (`_NAME`, `_COLOR`), shown as `x:<slug>` top tabs after DOCUMENTS and render with `renderDocs(tab)` (groups with `g.tab`). Built at startup from the cached overrides, so changes reload the page (`addedSig` covers them). ADMIN → CATEGORIES… manages them; delete only when empty.
- Document pages copy the game (2026-11-13, owner asked): `renderDocDetail` = grey title bar + text block (`.gdoc/.gtitle/.gtext`), red exit icon bottom-left, star bottom-right, small buttons (FOUND+NEXT, MY NOTES, ⋯, ♥) in the middle. In-game titles/colours per doc in `DOC_LOOK` (sampled from the owner's video; e.g. Creepy Glass → "Illusions: Creepy Glass", The City title #eba882, Outpost #e2676d, Lake title #f2f5c0 + body #c7b7a2, Sons Apartments yellow bar). Resume #451 uses `form` (question bars, pixel font Press Start 2P from Google Fonts, green STATUS). Fiona's Diary text re-copied from the game (wiki copy had different spacing/words), no wiki credit now.
- Notes (kind note) with a picture and Green Tape show the picture / cassette in that page. Note pictures `images/docs/<slug>.webp` are crops from the owner's video. Green Tape: `tape: { title, src }`, cassette picture with an HTML Play/Stop button over it; plays `sounds/docs/paradise-falls.mp3` (owner sent it; Craig McConnell - Paradise Falls 4) at the site volume, stops when leaving the page.
- Only one function may be named `previewHTML` (entry pictures). The admin Discord tester uses `discordPreviewHTML`; a duplicate name once broke every Preview box.
- Sounds: `play()` uses Web Audio (all SFX fetched + decoded at startup, context resumed on the first click/key/touch), HTMLAudio pools only as fallback. Browsers allow no sound before the first click/key; hovering doesn't count.
- Loading: Site Discord card `images/og.jpg` is drawn by `tools/previews.js` (logo, tagline, live TOOLS/PEOPLE/DOCUMENTS counts, 6 portraits); bump `?v=` on its og:image in index.html when the design changes.
- Tour (`TOUR` in app.js): 10 short steps on the basics only (owner wants it brief, no over-explaining, no minor features). Spotlights real elements, switches tabs, opens Glock 18 as demo, arrow keys/Enter/Esc, restores the user's place, never marks anything. Auto-starts on a first visit; replay from SETTINGS. Only add a step for a feature that's essential.
- Settings include sound/hover sound/volume, page slide, CRT, light theme, text size.
- Sounds (final, owner confirmed): hover tool (`tool-hover.mp3`, recorded in-game), leave/unmark (`bio-close.mp3`, recorded in-game; old person-close removed), open/mark (`person-open`), tabs, warnings, misc.

- Ammo (2026-11-10): stats (CAPACITY, RELOAD TIME, LOAD AMOUNT, AMMO TYPE, WEIGHT) + pictures `images/ammo/<slug>.webp` for every mag the owner has found, from his tier videos. Pictures are the game's preview box with the star painted out. Some in-game AMMO TYPE lines are cut off at the panel edge (MP7A1 mags, AK/AK74/AK74U, RPK, 15rnd H&K USP); copied as far as visible. Game quirk kept: 16rnd SRM Mag says CAPACITY 4 rounds. Ammo stat colours sampled from the game (TOOL_STAT_COLORS).

## Open items
- None. (All people now have descriptions as of 2026-11-10.)
