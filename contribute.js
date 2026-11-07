/* =====================================================================
   PDA TRACKER — SUBMISSION FORM SETTINGS
   ---------------------------------------------------------------------
   Submissions from the SUBMIT tab go to the cloud server (cloud-config.js)
   and show up on the ADMIN tab for admins. The Discord ping is sent by
   the server, so no webhook link lives in the site's code any more
   (see backend/README.md, "Discord ping").

   If the server can't be reached, the form falls back to emailing you
   through Web3Forms with the key below.
   ===================================================================== */

const PDA_FORM = {
  web3formsKey: "c5d6127e-46d7-4a0f-9c6c-8a5959648616",
  subject: "New PDA tracker submission"
};
