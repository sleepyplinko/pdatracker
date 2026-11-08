/* =====================================================================
   PDA TRACKER — SOUNDS
   ---------------------------------------------------------------------
   Every sound is its own file in the sounds/ folder. To change one,
   drop your file into sounds/ and point the "file" below at it.
   .mp3, .ogg and .wav all work. Set "file" to "" to turn a sound off.
   "volume" goes from 0 (silent) to 1 (full).
   ===================================================================== */

const PDA_SOUNDS = {
  // ---- sounds from the game (sounds/game/) ----
  hoverTool:   { file: "sounds/game/tool-hover.mp3",      volume: 1 },  // mouse onto a weapon / document tile
  hoverPerson: { file: "sounds/game/person-hover.mp3",    volume: 1 },  // mouse onto a person card
  hoverTab:    { file: "sounds/game/hover-tab-list.mp3",  volume: 1 },  // mouse onto a tab, category or sub-tab
  switch:      { file: "sounds/game/category-switch.mp3", volume: 1 },  // picking a category or sub-tab
  transition:  { file: "sounds/game/transition.mp3",      volume: 1 },  // switching main tab (TOOLS, BIOGRAPHY, ...)
  open:        { file: "sounds/game/person-open.mp3",     volume: 1 },  // opening an entry's page
  close:       { file: "sounds/game/person-close.mp3",    volume: 1 },  // leaving an entry's page
  pdaOpen:     { file: "sounds/game/category-switch.mp3", volume: 1 },  // the site starting up (same file as in the game)
  // ---- the site's own sounds (no game version yet) ----
  hover:    { file: "sounds/hover.wav",    volume: 0.30 },  // mouse onto any other button
  click:    { file: "sounds/click.wav",    volume: 0.55 },  // tabs, categories, buttons
  select:   { file: "sounds/select.wav",   volume: 0.60 },  // marking something as found
  deselect: { file: "sounds/deselect.wav", volume: 0.60 },  // marking something as not found
  back:     { file: "sounds/back.wav",     volume: 0.50 },  // RETURN
  warn:     { file: "sounds/warn.wav",     volume: 0.55 },  // "are you sure?" prompts
  confirm:  { file: "sounds/confirm.wav",  volume: 0.60 }   // saying YES to a whole tier
};
