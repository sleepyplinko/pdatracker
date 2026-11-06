/* =====================================================================
   PDA TRACKER — SUBMISSION FORM SETTINGS
   ---------------------------------------------------------------------
   The SUBMIT tab posts each submission to your Discord channel through
   a webhook, so visitors don't need any account. If Discord fails, it
   falls back to emailing you through Web3Forms.

   The webhook link is scrambled below so automatic scanners don't find
   it, but anyone determined can still unscramble it from the site's
   code, so use it for a channel where only you read submissions. If it
   ever gets spammed: delete the webhook in Discord, make a new one and
   ask for it to be scrambled again (or put the plain link in a line
   discordWebhook: "https://discord.com/api/webhooks/..." , which also works).

   To turn it on:
     1. Go to https://web3forms.com and enter your email under
        "Create your Access Key". The key arrives by email.
     2. Paste it between the quotes below and save.

   While the key is empty, the form falls back to opening a GitHub
   issue instead (which does need a GitHub account).
   ===================================================================== */

const PDA_FORM = {
  pingUserId: "1025830147103936624",   // this Discord user gets pinged on every submission ("" = no ping)
  // the Discord webhook, scrambled so bots scanning GitHub don't pick it up (see the note above)
  hook: null,
  web3formsKey: "c5d6127e-46d7-4a0f-9c6c-8a5959648616",
  subject: "New PDA tracker submission"
};
