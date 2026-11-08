# PDA tracker backend (free Cloudflare Worker)

Powers accounts + sync between devices, the "found by X% of players"
numbers, and live profile links (`#u=name`). Everything here fits in
Cloudflare's free plan. Nothing needs installing: it's all done in the
Cloudflare website.

## 1. Make the database
1. Sign up / log in at https://dash.cloudflare.com
2. Left menu: **Storage & Databases → D1 SQL Database → Create**.
   Name it `pda`, create.
3. Open it, go to the **Console** tab, paste everything in
   [`schema.sql`](schema.sql) and press **Execute**.

## 2. Make the Worker
1. Left menu: **Compute (Workers) → Workers & Pages → Create → Create Worker**
   (start from the "Hello World" template). Name it `pda-tracker`, **Deploy**.
2. Press **Edit code**, delete what's there, paste all of
   [`worker.js`](worker.js), press **Deploy**.
3. Back on the Worker's page: **Bindings → Add binding → D1 database**.
   Variable name: `DB` (exactly), database: `pda`. Save / deploy.
4. Copy the Worker's address, e.g. `https://pda-tracker.yourname.workers.dev`.
   Opening `…/api` in a browser should show `{"ok":true,...}`.

## 3. Connect the site
Put the address in [`../cloud-config.js`](../cloud-config.js):

    api: "https://pda-tracker.yourname.workers.dev"

Commit, and the ACCOUNT section appears in the CLOUD tab, plus
"FOUND BY" on item pages and RAREST FIRST in the sort menu.

## 4. Update for the admin page, friends, leaderboard and submissions
(Do this once if you set the backend up before November 2026.)
1. D1 database `pda` → **Console**: paste everything in
   [`schema-update-2.sql`](schema-update-2.sql) and press **Execute**.
   (New setups can paste [`schema-full.sql`](schema-full.sql) instead of
   `schema.sql` in step 1.)
2. Worker → **Edit code**: paste the new [`worker.js`](worker.js), **Deploy**.
3. Worker → **Settings → Variables and Secrets → Add**:
   - `ADMINS` (Text): your account name(s) on the site, comma separated,
     e.g. `Gabe`. Logging in with one of these names shows the ADMIN tab.
   - `DISCORD_WEBHOOK` (**Secret**, optional): a Discord webhook URL. Each
     new submission sends a short ping there. Because it's a secret it
     never appears in the site's files. Leave it out for no pings.
   - `DISCORD_PING` (Text, optional): your Discord user id, so the ping
     mentions you.
   Deploy.

SUBMIT now saves straight to the database; you review it in the ADMIN tab
(mark done / reject / delete, or PUBLISH INFO to change an entry's stats,
comment, tier or description for everyone within a minute, no commit
needed). Published info is stored on the server, separate from data.js.

## 5. Update for new entries, friends' recent finds and picture uploads
1. D1 database `pda` → **Console**: paste [`schema-update-3.sql`](schema-update-3.sql), **Execute**.
2. Worker → **Edit code**: paste the new [`worker.js`](worker.js), **Deploy**.
3. Optional, for picture uploads on the SUBMIT tab:
   - Left menu: **Storage & Databases → R2 Object Storage → Create bucket**, name it
     `pda-pictures`. (Cloudflare may ask you to add a payment method to turn R2 on.
     The free allowance is 10 GB, far more than this needs.)
   - Worker → **Bindings → Add binding → R2 bucket**. Variable name: `IMAGES`
     (exactly), bucket: `pda-pictures`. Deploy.
   Without this, everything else still works; the upload box just stays hidden.

## 6. Update for change history, blocking and Discord announcements
1. D1 database `pda` → **Console**: paste [`schema-update-4.sql`](schema-update-4.sql), **Execute**.
2. Worker → **Edit code**: paste the new [`worker.js`](worker.js), **Deploy**.
3. Optional, for **ANNOUNCE ON DISCORD** in the admin tab:
   - In Discord, make a webhook in the channel you want announcements in
     (Channel settings → Integrations → Webhooks → New Webhook → Copy URL).
   - Worker → **Settings → Variables and Secrets → Add**: type **Secret**, name
     `ANNOUNCE_WEBHOOK`, paste the URL. Deploy.
   The button only shows up once this is set.

## Notes
- Blocking stores a one-way fingerprint of the sender's connection, never the
  address itself.
- Submissions are limited to 6 per IP per 10 minutes, picture uploads to 8
  (5 MB each, PNG/JPG/WEBP/GIF only, checked by the server).
- Passwords never reach the server; the browser turns them into a key
  first, and the server only stores a salted hash of that key.
- Login/register is limited to 20 tries per IP per 10 minutes.
- Rarity numbers are cached for 5 minutes.
- Players can turn off rarity sharing and their public profile at any
  time, or delete their account, from the CLOUD tab.
- To update the backend later, paste the new `worker.js` into the
  editor again and deploy.
