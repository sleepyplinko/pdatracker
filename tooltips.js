/* =====================================================================
   PDA TRACKER — HOVER TEXT
   ---------------------------------------------------------------------
   The little box that appears when you hover over a stat name.
   Edit the text freely. Leave a tip as "" to show no box for that stat.

   Only text copied from the in-game PDA is filled in (marked "game").
   The empty ones never showed up in the recordings; paste the game's
   wording in when you have it.
   ===================================================================== */

const PDA_TIPS = {

  /* ---------- people (Enemy Data) ---------- */
  person: {
    "Health":               "",
    "Speed":                "Describes the enemie's speed. (Formula is their walk speed divided by 16)",          // (game)
    "Defense":              "Subtracts the damage dealt with the enemy's defense percentage. May be subtract with some bludgeons or ammo types. Mostly bypassed with explosives.", // (game)
    "Shield":               "Subtracts the damage dealt by 50% and directs it to the shield as a secondary health. Will no longer work once runs out. Bypassed by explosives and bludgeons.", // (game)
    "Supershield":          "Completely negates all incoming damage but negates supershield by one point.",      // (game)
    "Super Armour":         "Significantly punishes & reduces high damage count compared to lower damages. Any weapon that fires more than one pellet per blast counts as a single damage blast.", // (game)
    "Burn Resistance":      "Subtracts incoming fire damage by resistance's percentage.",                          // (game)
    "Bleed Resistance":     "",
    "Explosive Resistance": "",
    "Stun Resistance":      "",
    "Fracture Immunity":    "",
    "Suppressor":           "Entity will not cancel aim regardless of their target going back to cover.",          // (game)
    "Pre-Aim":              "",
    "Strength":             "The damage multiplier for the entity's weapon.",                                      // (game)
    "Aim Time Multiplier":  "The multiplier for the entity's aim time.",                                           // (game)
    "Reload Speed Multiplier": "The multiplier for the entity's reload speed.",                                    // (game)
    "Aim Slowdown":         "The multiplier for the entity's speed upon aiming down.",                             // (game)
    "Attack Slowdown":      "",
    "Weapon":               "The primary or secondary the entity uses. If firearm is specified and no magazine & bullet type specified, then the magazine & ammo are random.", // (game)
    "Ammo Loaded":          "",
    "Magazine Loaded":      "",
  },

  /* ---------- weapons (Statistics) ---------- */
  weapon: {
    "CALIBER TYPE":     "",
    "AUTO":             "",
    "BURST":            "",
    "BURST DELAY":      "",
    "BURST AMOUNT":     "",
    "BURST VOLLEY":     "",
    "STRENGTH":         "",
    "AIM TIME":         "",
    "SWITCH TIME":      "",
    "RPM":              "",
    "ALERT RADIUS":     "",
    "RELOAD MODIFIER":  "",
    "WEAPON TYPE":      "",
    "MAX SPREAD":       "",
    "MINIMUM SPREAD":   "",
    "SPREAD INCREMENT": "",
    "SPREAD DECREASE":  "",
    "EQUIP TIME":       "",
    "WEIGHT":           "",
    "TIER":             "",
  }
};
