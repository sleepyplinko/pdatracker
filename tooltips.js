/* =====================================================================
   PDA TRACKER — HOVER TEXT
   ---------------------------------------------------------------------
   The little box that appears when you hover over a stat name.
   Edit the text freely. Leave a tip as "" to show no box for that stat.

   PEOPLE: the ones marked (game) were copied from the in-game PDA.
   WEAPONS: none were visible in the recordings, so these are written
   to describe what each stat does. Swap in the game's wording if you
   find it.
   ===================================================================== */

const PDA_TIPS = {

  /* ---------- people (Enemy Data) ---------- */
  person: {
    "Health":               "The amount of damage the entity can take before dying.",
    "Speed":                "Describes the enemie's speed. (Formula is their walk speed divided by 16)",          // (game)
    "Defense":              "Subtracts the damage dealt with the enemy's defense percentage. May be subtract with some bludgeons or ammo types. Mostly bypassed with explosives.", // (game)
    "Shield":               "Subtracts the damage dealt by 50% and directs it to the shield as a secondary health. Will no longer work once runs out. Bypassed by explosives and bludgeons.", // (game)
    "Supershield":          "Completely negates all incoming damage but negates supershield by one point.",      // (game)
    "Super Armour":         "Significantly punishes & reduces high damage count compared to lower damages. Any weapon that fires more than one pellet per blast counts as a single damage blast.", // (game)
    "Burn Resistance":      "Subtracts incoming fire damage by resistance's percentage.",                          // (game)
    "Bleed Resistance":     "Subtracts incoming bleed damage by resistance's percentage.",
    "Explosive Resistance": "Subtracts incoming explosive damage by resistance's percentage.",
    "Stun Resistance":      "Subtracts incoming stun by resistance's percentage.",
    "Fracture Immunity":    "The entity's bones can't be fractured.",
    "Suppressor":           "Entity will not cancel aim regardless of their target going back to cover.",          // (game)
    "Pre-Aim":              "The range at which the entity starts aiming before it can see you.",
    "Strength":             "The damage multiplier for the entity's weapon.",                                      // (game)
    "Aim Time Multiplier":  "The multiplier for the entity's aim time.",                                           // (game)
    "Reload Speed Multiplier": "The multiplier for the entity's reload speed.",                                    // (game)
    "Aim Slowdown":         "The multiplier for the entity's speed upon aiming down.",                             // (game)
    "Attack Slowdown":      "The multiplier for the entity's speed while attacking.",
    "Weapon":               "The primary or secondary the entity uses. If firearm is specified and no magazine & bullet type specified, then the magazine & ammo are random.", // (game)
    "Ammo Loaded":          "The bullet type loaded into the entity's weapon.",
    "Magazine Loaded":      "The magazine loaded into the entity's weapon."
  },

  /* ---------- weapons (Statistics) ---------- */
  weapon: {
    "CALIBER TYPE":     "The bullet types this weapon accepts.",
    "AUTO":             "Whether holding the trigger keeps firing.",
    "BURST":            "Whether each trigger pull fires a burst of shots.",
    "BURST DELAY":      "The time between each shot in a burst.",
    "BURST AMOUNT":     "How many shots are fired per burst.",
    "BURST VOLLEY":     "How many bursts can be fired back to back.",
    "STRENGTH":         "The damage multiplier for this weapon.",
    "AIM TIME":         "How long it takes to aim down sights.",
    "SWITCH TIME":      "How long it takes to switch to this weapon.",
    "RPM":              "Rounds per minute. How fast the weapon fires.",
    "ALERT RADIUS":     "How far away enemies can hear this weapon being fired.",
    "RELOAD MODIFIER":  "The multiplier for reload speed. Lower is faster.",
    "WEAPON TYPE":      "How the weapon is loaded.",
    "MAX SPREAD":       "The most inaccurate the weapon can get while firing.",
    "MINIMUM SPREAD":   "The weapon's inaccuracy on the first shot.",
    "SPREAD INCREMENT": "How much spread is added with each shot.",
    "SPREAD DECREASE":  "How much spread recovers, and how often, when you stop firing.",
    "EQUIP TIME":       "How long it takes to pull the weapon out.",
    "WEIGHT":           "How much the weapon slows you down while held.",
    "TIER":             "The weapon's tier in the PDA."
  }
};
