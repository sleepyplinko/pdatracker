/* =====================================================================
   PDA TRACKER — SOUNDS
   ---------------------------------------------------------------------
   Every sound is its own file in the sounds/ folder. To change one,
   drop your file into sounds/ and point the "file" below at it.
   .mp3, .ogg and .wav all work. Set "file" to "" to turn a sound off.
   "volume" goes from 0 (silent) to 1 (full).
   ===================================================================== */

const PDA_SOUNDS = {
  hover:    { file: "sounds/hover.wav",    volume: 0.30 },  // mouse moves onto anything clickable
  click:    { file: "sounds/click.wav",    volume: 0.55 },  // tabs, categories, buttons
  select:   { file: "sounds/select.wav",   volume: 0.60 },  // marking something as found
  deselect: { file: "sounds/deselect.wav", volume: 0.60 },  // marking something as not found
  open:     { file: "sounds/open.wav",     volume: 0.50 },  // opening a stat page
  back:     { file: "sounds/back.wav",     volume: 0.50 },  // RETURN
  warn:     { file: "sounds/warn.wav",     volume: 0.55 },  // "are you sure?" prompts
  confirm:  { file: "sounds/confirm.wav",  volume: 0.60 }   // saying YES to a whole tier
};
