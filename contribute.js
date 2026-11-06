/* =====================================================================
   PDA TRACKER — SUBMISSION FORM SETTINGS
   ---------------------------------------------------------------------
   The SUBMIT tab posts each submission to your Discord channel through
   a webhook, so visitors don't need any account. If Discord fails, it
   falls back to emailing you through Web3Forms.

   The webhook link is visible to anyone who reads the site's code, so
   use it for a channel where only you read submissions. If it ever
   gets spammed: delete the webhook in Discord, make a new one, and
   paste the new link below.

   To turn it on:
     1. Go to https://web3forms.com and enter your email under
        "Create your Access Key". The key arrives by email.
     2. Paste it between the quotes below and save.

   While the key is empty, the form falls back to opening a GitHub
   issue instead (which does need a GitHub account).
   ===================================================================== */

const PDA_FORM = {
  discordWebhook: "https://discord.com/api/webhooks/1568254389808931039/lRSH8rZP8fhPMr6xUXB_HqOzyt5GOnVmooePEAkFy3JfMIshHPfVSt0SXumz33AILpc3",
  web3formsKey: "c5d6127e-46d7-4a0f-9c6c-8a5959648616",
  subject: "New PDA tracker submission"
};
