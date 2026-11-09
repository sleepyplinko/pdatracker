/* =====================================================================
   PDA TRACKER — SOUNDS
   ---------------------------------------------------------------------
   Every sound is its own file in the sounds/ folder. To change one,
   drop your file into sounds/ and point the "file" below at it.
   .mp3, .ogg and .wav all work. Set "file" to "" to turn a sound off.
   "volume" goes from 0 (silent) to 1 (full).
   ===================================================================== */

const PDA_SOUNDS = {
  // ---- all sounds are from the game (sounds/game/) ----
  hoverTool:   { file: "sounds/game/tool-hover.mp3?v=4",      volume: 1 },  // mouse onto a weapon / document tile (recorded in-game)
  hoverPerson: { file: "sounds/game/person-hover.mp3",    volume: 1 },  // mouse onto a person card
  hoverTab:    { file: "sounds/game/hover-tab-list.mp3",  volume: 1 },  // mouse onto a tab, category or sub-tab
  switch:      { file: "sounds/game/category-switch.mp3", volume: 1 },  // picking a category or sub-tab
  transition:  { file: "sounds/game/transition.mp3",      volume: 1 },  // switching main tab (TOOLS, BIOGRAPHY, ...)
  open:        { file: "sounds/game/person-open.mp3",     volume: 1 },  // opening an entry's page
  close:       { file: "sounds/game/person-close.mp3",    volume: 1 },  // leaving an entry's page
  bioClose:    { file: "sounds/game/bio-close.mp3?v=2",       volume: 1 },  // leaving a BIOGRAPHY page (recorded in-game)
  pdaOpen:     { file: "sounds/game/category-switch.mp3", volume: 1 },  // the site starting up (same file as in the game)
  marked:      { file: "sounds/game/person-open.mp3",     volume: 1 },  // marking something as found
  unmarked:    { file: "sounds/game/person-close.mp3",    volume: 1 },  // marking something as not found
  warn:        { file: "sounds/game/warning.mp3",         volume: 1 },  // "are you sure?" prompts and errors
  hover:       { file: "sounds/game/misc.mp3",            volume: 1 },  // mouse onto any other button
  click:       { file: "sounds/game/misc.mp3",            volume: 1 },  // ordinary buttons and toggles
  back:        { file: "sounds/game/misc.mp3",            volume: 1 },  // cancel / back buttons
  confirm:     { file: "sounds/game/misc.mp3",            volume: 1 }   // saying YES (unlocking a whole tier, publishing...)
};
