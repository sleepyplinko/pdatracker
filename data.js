/* =====================================================================
   PDA TRACKER — ENTRY LIST
   ---------------------------------------------------------------------
   This is the only file you need to edit to add or fix entries.

   Weapons:   ["NAME"]                      a normal entry
              ["NAME", { special: true }]   red highlighted entry
              ["NAME", { stats: {...}, comment: "..." }]  adds a stat page
              "???"                          an entry whose name you
                                             don't know yet (shows as ???)
   People:    see the BIOGRAPHY section below (P / G shorthand)
   Documents: ["NAME"]

   Every entry gets its checkmark saved by NAME, so if you rename an
   entry, anyone who had it marked will need to re-mark it.
   ===================================================================== */

/* ---------- shorthand used in the biography list below ---------- */
const P  = (name, base = {}, skills = {}, loadout = []) => ({ name, base, skills, loadout });
const G  = (name, members) => ({ name, members });
const W  = (x) => ["Weapon", x];                        // weapon
const WR = (...xs) => xs.length === 1 ? ["Weapon", xs[0] + " (Random)"]
                                      : xs.map(x => ["Weapon", x + " (Random)"]);   // random weapon(s)
const A  = (x) => ["Ammo Loaded", x];                   // ammo
const M  = (x) => ["Magazine Loaded", x];               // magazine

/* skill sets many enemies share */
const STD   = { Strength: "0.2x", "Aim Time Multiplier": "2.35x", "Reload Speed Multiplier": "2x", "Aim Slowdown": "0.3x" };
const ROGUE = { "Aim Time Multiplier": "1.9x", "Aim Slowdown": "0.5x" };
const ROGUE_LOADOUT = WR("Kitchen Knife", "Frying Pan", "Hammer", "Pipe", "Ice Pick", "Crowbar");

const PDA_DATA = {

  /* ---------------- TOOLS (weapons and items) ---------------- */
  tools: [
    {
      name: "PISTOLS",
      tiers: {
        1: ["PB Silenced Makarov", "Skorpion", "Glock 18", "ZVI Kevin M", "M45A1",
            "PM Makarov", "USFA Zip .22", "SIG Sauer P250"],
        2: [
          ["Beretta M9A3", {
            stats: {
              "BURST": "NO", "STRENGTH": "1.4x", "AIM TIME": "0.5",
              "SWITCH TIME": "0.05s", "RPM": "275", "ALERT RADIUS": "200",
              "RELOAD MODIFIER": "1", "WEAPON TYPE": "Magazine-fed"
            },
            comment: "So tactical in it's design and ergo, a pretty big handgun compared to others, 17-round magazine for your safety.. Accepts many bullet types so that's a neat trait about this pistol."
          }],
          "Ashot", "OTs-02 Kiparis", "OTs-33 Pernach", "???"
        ],
        3: ["Ruger P345", "Warne Super Jagare", "Glock 19", "Stechkin APB",
            "H&K VP70", "H&K USP Compact", "FN Five-Seven"],
        4: ["Glock 19 Roland Special", "AMT Hardballer", "???"],
        5: ["Glock 17+", "Killer²"]
      }
    },
    {
      name: "SUBMACHINE GUNS",
      tiers: {
        2: ["Micro Uzi", "PPSh-41", "TEC-9", "UZI", "Daewoo K1", "Sten MK II",
            "H&K MP5K", "Gepard 9mm", "???"],
        3: ["B&T MP9", ".22LR AMR-180", "H&K MP7A1", "Timothy M1928", "SIG MPX",
            "Aero Survival Rifle", "PP-19 Bizon", "H&K MP5 RIS", "Colt 9mm SMG",
            "UMP-45", ["DEVILSPAWN-BFC", { special: true }]],
        4: ["Spectre M4", "Beretta CX4 Storm", "P90", "???"],
        5: ["CZ Skorpion EVO 3", "???", "???"]
      }
    },
    {
      name: "RIFLES",
      note: "Tiers 1–3 weren't in the recording, and these may belong to a different category. Check in-game.",
      tiers: {
        4: ["SR-3M Vikhr", "SIG Sauer MCX Virtus", "VSS Vintorez", "Dragunov SVD",
            "DP-28 Degtyaryov", "H&K G36E", "AK12", "SIG MCX", "???"],
        5: ["Colt M4A1+", "Deserttech MDR 7.62", "BCM Jack Carbine", "Barrett M82A1",
            "AK50", "Colt M4A1 RIS M203", ["PLATINUM-C.S.I.R.O DEVICE", { special: true }],
            "OTs-03 SVU", "DVL-10", "ASh-12.7", "???", "???", "???", "???"]
      }
    },
    { name: "MACHINE GUNS", tiers: {} },
    { name: "SHOTGUNS",     tiers: {} },
    { name: "HEAVY PISTOL", tiers: {} },
    { name: "HEAVY RIFLES", tiers: {} },
    { name: "BLUDGEON",     tiers: {} },
    { name: "SHARP",        tiers: {} },
    { name: "ETHEREAL",     tiers: {} },
    { name: "UTILITY",      tiers: {} },
    { name: "GEARS",        tiers: {} },
    { name: "AMMO",         tiers: {} }
  ],

  /* ---------------- BIOGRAPHY (people) ----------------
     Each person is written like this:
       P("Name", { Health: "90", Speed: "1", ... },      <- base stats
                 { Strength: "0.2x", ... },              <- SKILLS
                 [ W("Weapon"), A("Ammo"), M("Mag") ])   <- LOADOUT
     A card that holds several people (like Robinson) is written as
       G("Card name", [ P(...), P(...) ])
     The whole card is one unlock; every person inside it becomes viewable.
     Health is in HP, Speed is the in-game speed number, Defense and
     resistances are percentages. Leave a stat out if it isn't shown. */
  biography: [
    { name: "Scavengers", color: "#f3c98b", bg: "#2a1d0e", entries: [
      G("Miners", [
        P("Drill Gal", { Health: 145, Speed: 0.9, Defense: 15 },
          { "Pre-Aim": 150, Strength: "0.5x", "Aim Time Multiplier": "1.25x", "Reload Speed Multiplier": "2x", "Aim Slowdown": "2.5x" },
          [W("Power Drill")]),
        P("Shoveler", { Health: 90, Speed: 1 },
          { "Pre-Aim": 50, Strength: "0.5x", "Aim Time Multiplier": "1.25x", "Reload Speed Multiplier": "2x", "Aim Slowdown": "2.5x" },
          [W("Shovel")]),
        P("Miner", { Health: 90, Speed: 0.9 },
          { "Pre-Aim": 90, Strength: "0.5x", "Aim Time Multiplier": "1.25x", "Reload Speed Multiplier": "2x", "Aim Slowdown": "2.5x" },
          [W("Pickaxe")])
      ]),
      P("Tony", { Health: 220, Speed: 1.2, Defense: 40, "Super Armour": 12 },
        { "Aim Time Multiplier": "1.25x", "Aim Slowdown": "1.25x" },
        [W("Golf Club")]),
      G("Scavengers", [
        P("Artist",      { Health: 100, Speed: 1.3 }, STD, [WR("Electric Guitar")]),
        P("Chilly",      { Health: 100, Speed: 0.9 }, STD, WR("H&K MP5K", "MP-412 REX", "SKORPION", "SERBU SUPER SHORTY")),
        P("Sigmund",     { Health: 90,  Speed: 1 },   STD, WR("Kitchen Knife", "M45A1")),
        P("Fashionista", { Health: 90,  Speed: 1 },   STD, WR("UZI", "Machete", "SIG SAUER P250")),
        P("Nerdy",       { Health: 90,  Speed: 1.1 }, STD, WR("AK74U", "COLT 1883 SAWN OFF", "H&K VP70")),
        P("Palm",        { Health: 90,  Speed: 1 },   STD, WR("M16A1", "SKORPION", "UZI")),
        P("Cool",        { Health: 90,  Speed: 1.1 }, STD, WR("Hammer", "COLT 1883 SAWN OFF")),
        P("Swagger",     { Health: 100, Speed: 0.8 }, { Suppressor: "true", ...STD }, WR("Z-M LR-300", "OTS-33 PERNACH", "COLT 9MM SMG", "BENELLI NOVA")),
        P("Average",     { Health: 90,  Speed: 1 },   STD, WR("BERETTA M9A3", "GLOCK 18", "Frying Pan"))
      ]),
      G("Robinson", [
        P("Michael", { Health: 110, Speed: 1.6, Defense: 10 }, STD,
          [W("MICRO UZI"), A("9x19mm Green Tracer")]),
        P("Alex", { Health: 150, Speed: 1, Defense: 40 },
          { Strength: "0.5x", "Aim Time Multiplier": "1.25x", "Reload Speed Multiplier": "1.25x", "Aim Slowdown": "0.5x" },
          [W("Double Barrel Shotgun"), A("12/70 6.5mm Express buckshot")]),
        P("Paul", { Health: 160, Speed: 1, Defense: 20 },
          { Strength: "0.5x", "Aim Time Multiplier": "1.25x", "Reload Speed Multiplier": "1.25x", "Aim Slowdown": "0.5x" },
          [W("UMP-45"), A(".40 S&W FMJ")]),
        P("Raffy", { Health: 150, Speed: 1.2, Defense: 25 },
          { Strength: "0.9x", "Aim Time Multiplier": "1.5x", "Reload Speed Multiplier": "1x", "Aim Slowdown": "0.3x" },
          [W("MP-412 REX"), A(".357 SP")])
      ]),
      P("Rogue Sig Boy", { Health: 130, Speed: 1.1, Defense: 15, Supershield: 1 }, STD,
        [W("SIG SAUER P250"), A(".357 SIG FMJTC")]),
      G("Rogues", [
        P("Lavender Rogue",           { Health: 90,  Speed: 1 },   ROGUE, ROGUE_LOADOUT),
        P("Green Guy",                { Health: 90,  Speed: 0.9 }, ROGUE, ROGUE_LOADOUT),
        P("Scarlet's Maroon",         { Health: 100, Speed: 1 },   ROGUE, ROGUE_LOADOUT),
        P("XMas4ever Guy",            { Health: 90,  Speed: 0.9 }, ROGUE, ROGUE_LOADOUT),
        P("Yellow One",               { Health: 90,  Speed: 1 },   ROGUE, ROGUE_LOADOUT),
        P("Distrustful Swag",         { Health: 90,  Speed: 0.9 }, ROGUE, ROGUE_LOADOUT),
        P("Navy Blue of Nonchalant",  { Health: 90,  Speed: 0.9 }, ROGUE, ROGUE_LOADOUT),
        P("Sky-Blue Chump",           { Health: 90,  Speed: 0.9 }, ROGUE, ROGUE_LOADOUT)
      ]),
      P("Factory King", { Health: 325, Speed: 1.1, Defense: 70, Supershield: 2, "Super Armour": 25 },
        { "Pre-Aim": 40, Strength: "0.3x", "Aim Time Multiplier": "2x", "Reload Speed Multiplier": "1.4x" },
        [W("H&K G11"), A("4.73x33mm SP"), M("30rnd G11 Mag")]),
      P("Sapling", { Health: 90, Speed: 1.3, Defense: 10, "Burn Resistance": -200, "Bleed Resistance": 100 },
        ROGUE, [WR("Machete")]),
      P("Rogue Lead", { Health: 122, Speed: 1.1 }, STD,
        [W("BERETTA M9A3"), A(".45ACP Hydra-Shok"), M("17rnd Beretta Mag")]),
      P("Loner", { Health: 450, Speed: 1.4, Defense: 90, Shield: 300, Supershield: 2, "Super Armour": 9, "Bleed Resistance": 80, "Explosive Resistance": 25 },
        { Suppressor: "true", Strength: "0.6x", "Aim Time Multiplier": "1.7x", "Reload Speed Multiplier": "2x", "Aim Slowdown": "0.425x" },
        [W("COLT M4A1"), A("5.56x45mm M855"), M("30rnd AR15 Mag")]),
      P("Plant Man", { Health: 110, Speed: 1.2, Defense: 5, Supershield: 2, "Super Armour": 35, "Burn Resistance": -200, "Bleed Resistance": 100 },
        { Suppressor: "true", "Aim Time Multiplier": "1.5x" },
        [WR("Garden Gnome")]),
      P("Flower Woman", { Health: 175, Speed: 1.5, Defense: 10, Shield: 150, "Super Armour": 32, "Burn Resistance": -200, "Bleed Resistance": 100 },
        { Suppressor: "true", "Aim Time Multiplier": "1.25x" },
        [WR("Garden Gnome")]),
      P("Jeremia Carter", { Health: 500, Speed: 1.2, Defense: 40, Shield: 300, Supershield: 1, "Super Armour": 20, "Burn Resistance": 75, "Bleed Resistance": 100, "Explosive Resistance": 70 },
        { Suppressor: "true", "Pre-Aim": 30, Strength: "0.4x", "Aim Time Multiplier": "1.5x", "Aim Slowdown": "0.7x", "Attack Slowdown": "1.5x" },
        WR("COLT M4A1+", "CZ SKORPION EVO 3", "MILITARY KRISS VECTOR", "PP-19-01 VITYAZ")),
      P("Howard Carter", { Health: 80, Speed: 0.9 }, STD, []),
      P("Forest Dwellers", { Health: 100, Speed: 0.9, Defense: 20 },
        { Strength: "0.5x", "Aim Time Multiplier": "1.25x", "Reload Speed Multiplier": "2x", "Aim Slowdown": "2.5x" },
        WR("Atuned Skewer", "Shovel", "Pipe", "Sledgehammer", "Runes Saber", "Claymore", "Bearded Axe")),
      G("Advanced Scavengers", [
        P("Piercer", { Health: 150, Speed: 0.9, Defense: 35, Supershield: 1, "Super Armour": 8, "Explosive Resistance": 50 },
          { "Pre-Aim": 30, Strength: "0.4x", "Aim Time Multiplier": "1.5x", "Reload Speed Multiplier": "1.5x", "Attack Slowdown": "0.8x" },
          [WR("H&K G11"), A("4.73x33mm FMJ"), WR("P90"), A("5.7x28mm SB193"), WR("SIG MPX")]),
        P("Unit", { Health: 125, Speed: 1.1, Defense: 15, Supershield: 1, "Super Armour": 12, "Explosive Resistance": 50 },
          { "Pre-Aim": 30, Strength: "0.4x", "Aim Time Multiplier": "1.5x", "Reload Speed Multiplier": "1.5x", "Attack Slowdown": "0.8x" },
          [WR("SCAR-L"), A("5.56x45mm HP"), WR("AS-VAL"), A("9x39mm SPP"), WR("BENELLI M4"), A("12/70 7mm buckshot"), WR("Sledgehammer")]),
        P("Tank", { Health: 200, Speed: 0.9, Defense: 50, Supershield: 2, "Super Armour": 12, "Explosive Resistance": 50 },
          { Suppressor: "true", "Pre-Aim": 30, Strength: "0.4x", "Aim Time Multiplier": "1.25x", "Reload Speed Multiplier": "1.5x", "Attack Slowdown": "0.65x" },
          [WR("SPECTRE M4"), A(".45ACP AP"), WR("AEK-971"), A("5.45x39mm US gs"), WR("H&K MG4"), A("5.56x45mm M855A1")]),
        P("Master", { Health: 150, Speed: 0.9, Defense: 35, Supershield: 1, "Super Armour": 12, "Explosive Resistance": 50 },
          { "Pre-Aim": 30, Strength: "0.4x", "Aim Time Multiplier": "1.5x", "Attack Slowdown": "0.8x" },
          [WR("FAMAS G2"), A("5.56x45mm FMJ"), WR("OTS-14 GROZA"), A("9x39mm BP"), WR("AK103"), A("7.62x39mm FMJ"), WR("SIG SAUER MCX VIRTUS"), A(".300 Blackout CBJ")])
      ]),
      P("Witch", { Health: 400, Speed: 1.2, Defense: 50, Shield: 200, "Super Armour": 14 },
        { "Pre-Aim": 40, Strength: "0.7x", "Aim Time Multiplier": "0.5x", "Aim Slowdown": "1.4x" },
        [W("H&K MP5K"), W("SAVAGE ARMS AXIS II")]),
      P("Trash Gang", { Health: 100, Speed: 1.1, Defense: 30, Shield: 100, "Bleed Resistance": 45, "Explosive Resistance": 50 },
        { "Pre-Aim": 20, Strength: "0.4x", "Aim Time Multiplier": "1.8x", "Aim Slowdown": "1.5x", "Attack Slowdown": "0.25x" },
        WR(".44 AUTO MAG PISTOL", "SAIGA-12", "STEN MK II", "GLOCK 19 ROLAND SPECIAL")),
      P("G.O.A.T", { Health: 100, Speed: 0.8, Shield: 85, Supershield: 20, "Super Armour": 30 },
        { Suppressor: "true", "Pre-Aim": 35, Strength: "0.5x", "Aim Time Multiplier": "2x", "Reload Speed Multiplier": "2x", "Aim Slowdown": "1.4x", "Attack Slowdown": "0.3x" },
        [W("MARE'S LEG"), A(".44 JSP")])
    ]},
    { name: "Civilian", color: "#a6e38f", bg: "#132611", entries: [
      P("Maria Hatty Kirsten", { Health: 1000, Speed: 1.4, Defense: 75, Supershield: 30, "Super Armour": 35, "Explosive Resistance": 70, "Fracture Immunity": "true" },
        { "Aim Time Multiplier": "0x" },
        [W("Chainsaw")]),
      P("Citizen Assault", { Health: 150, Speed: 1.3 },
        { Suppressor: "true", Strength: "0.3x", "Aim Time Multiplier": "1.5x", "Aim Slowdown": "1.3x" },
        [W("DAEWOO K1"), A("5.56x45mm FMJ"), M("K1 Mag")]),
      P("Citizen Rogue", { Health: 100, Speed: 1.2, Defense: 25, Shield: 20 },
        { "Pre-Aim": 25, "Aim Time Multiplier": "1.5x", "Aim Slowdown": "1.1x" },
        [W("Hammer")]),
      P("Citizen Sniper", { Health: 175, Speed: 0, Defense: 20 },
        { Suppressor: "true", Strength: "0.3x", "Aim Time Multiplier": "2x", "Reload Speed Multiplier": "1.4x" },
        [W("REMINGTON 700"), A(".308 M105 AP"), M("11rnd R700 Mag")]),
      P("Citizen Scout", { Health: 80, Speed: 1.1 },
        { Strength: "0.2x", "Aim Time Multiplier": "2.5x", "Aim Slowdown": "1.35x" },
        [W("GLOCK 18"), A("9x19mm PSO gzh"), M("17rnd Glock Mag")]),
      P("Citizen Bodyguard", { Health: 115, Speed: 1.1, Defense: 15, Shield: 30 },
        { Strength: "0.2x", "Aim Time Multiplier": "2.5x", "Aim Slowdown": "1.35x" },
        [W("BERETTA M9A3")]),
      P("Citizen Charger", { Health: 350, Speed: 1.7, Defense: 90, Shield: 25, Supershield: 2, "Super Armour": 8, "Explosive Resistance": 66 },
        { Suppressor: "true", Strength: "0.5x", "Aim Time Multiplier": "1.6x", "Aim Slowdown": "0.65x" },
        [W("FRANCHI SPAS-12")]),
      P("Citizen Bat", { Health: 125, Speed: 1.6, Defense: 5, Shield: 50, "Super Armour": 3, "Explosive Resistance": 70 },
        { "Aim Time Multiplier": "1.25x", "Aim Slowdown": "0.5x" },
        [W("Baseball Bat")]),
      P("Citizen Guard", { Health: 100, Speed: 1, Defense: 40, Shield: 60, "Explosive Resistance": 25 },
        { "Pre-Aim": 25, Strength: "0.3x", "Aim Time Multiplier": "1.5x", "Aim Slowdown": "1.3x" },
        [W("H&K G36C"), A("5.56x45mm HP"), M("30rnd G36C Mag")]),
      P("Citizen Escort", { Health: 120, Speed: 1, Defense: 20 },
        { Strength: "0.3x", "Aim Time Multiplier": "1.5x", "Aim Slowdown": "1.5x" },
        [W("H&K MP5 RIS"), M("30rnd MP5 Mag")])
    ]},
    { name: "Volya", color: "#86e0b8", bg: "#0e241c", entries: [
      P("Benjamin Tarkovsky", { Health: 300, Speed: 0.5, Defense: 95, Shield: 150, Supershield: 5, "Super Armour": 32, "Burn Resistance": 85 },
        { Suppressor: "true", Strength: "0.35x", "Aim Time Multiplier": "1.5x", "Aim Slowdown": "3.5x", "Attack Slowdown": "0.35x" },
        [W("KONSTANTINOV"), A("7.62x39mm MAI AP"), M("73rnd ProMag Drum")])
    ]},
    { name: "Robot", color: "#4a63ff", bg: "#0b0f2a", entries: [
      "Security Bot A", "Security Bot B", "Security Bot C", "Security Bot D",
      "Security Bot E", "VLTS Attendant", "Fabricated Dummy"
    ]},
    { name: "Animals", color: "#d6ef5a", bg: "#1e2509", entries: [
      P("Rat", { Health: 5, Speed: 3.1 },
        { "Aim Time Multiplier": "1.25x" },
        [W("InfectedRapidBite")]),
      P("Ratman", { Health: 600, Speed: 1.2, Shield: 50, "Super Armour": 20 },
        { Strength: "0.3x", "Aim Time Multiplier": "2x", "Reload Speed Multiplier": "1.4x" },
        [W("Baseball Bat")])
    ]},
    { name: "Hellion", color: "#ff3030", bg: "#2a0808", entries: [
      P("Wyrmling", { Health: 200, Speed: 2.8, Defense: 30, "Burn Resistance": -100, "Bleed Resistance": 100 },
        { Suppressor: "true", Strength: "0.3x", "Aim Time Multiplier": "2x", "Reload Speed Multiplier": "1.4x" },
        [W("WyrmlingBite")]),
      P("Hellbender", { Health: 150, Speed: 0.5, "Super Armour": -30, "Burn Resistance": -10 },
        { Strength: "0.5x", "Aim Time Multiplier": "2x", "Reload Speed Multiplier": "2x", "Aim Slowdown": "1.4x", "Attack Slowdown": "0.3x" },
        [W("Spinal-lance")])
    ]},
    { name: "Velris", color: "#e08a8a", bg: "#241010", entries: [
      "Velris Family"
    ]},
    { name: "Miscellaneous", color: "#ffffff", bg: "#141414", entries: [
      P("Monolithic Guardian", { Health: 140, Speed: 0.9, Defense: 27, "Explosive Resistance": 50 },
        { Strength: "0.3x", "Aim Time Multiplier": "1.5x" },
        [W("HENRY 45-70")]),
      P("WC Emissary", { Health: 325, Speed: 1.6, Defense: 70, Shield: 400, Supershield: 2, "Super Armour": 40, "Burn Resistance": 100, "Bleed Resistance": 100, "Explosive Resistance": 60, "Stun Resistance": 100 },
        { "Pre-Aim": 25, Strength: "0.55x", "Aim Time Multiplier": "1.3x", "Aim Slowdown": "0.8x", "Attack Slowdown": "1.2x" },
        [W("GLOCK 17+"), A("9x19mm FXX2"), M("19rnd Glock Mag")]),
      P("Martin", { Health: 200, Speed: 0.9, Defense: 15, Supershield: 2, "Super Armour": 5, "Bleed Resistance": 75 },
        { Strength: "0.5x", "Aim Time Multiplier": "1.5x", "Aim Slowdown": "1.25x" },
        [W("M45A1"), A(".45ACP Match FMJ"), M("7rnd M45A1 Mag")]),
      P("Monolithic Psycho", { Health: 140, Speed: 0.9, "Explosive Resistance": 50 },
        { "Aim Time Multiplier": "1.25x" },
        [W("Fire Axe")]),
      P("Doe", { Health: 300, Speed: 0.9, Defense: 4, Supershield: 1, "Super Armour": 7, "Bleed Resistance": 50, "Explosive Resistance": 10 },
        { Strength: "1x", "Aim Time Multiplier": "0.4x" },
        []),
      P("Monolithic Soldier", { Health: 140, Speed: 0.9, Defense: 12, "Explosive Resistance": 50 },
        { "Aim Time Multiplier": "1.25x" },
        [W("Sledgehammer")])
    ]}
  ],

  /* ---------------- DOCUMENTS ---------------- */
  documents: [
    { name: "Locations", kind: "location", entries: [
      "Wooden Cottage", "Watchtower", "Creepy Glass", "Doe's House", "Metrostation",
      "Swamp", "Maintenance Park", "E3K Mall", "Suburban?", "Awesome Apartments",
      "The Lake", "The City", "Civilian Outpost #4", "Robinson Residence",
      "The Origins", "Mill", "Sons Apartment", "Library", "FunkTown", "Sewers",
      "John M4 House", "William's Warehouse", "???"
    ]},
    { name: "Notes", kind: "note", entries: [
      "Sewer maintenance", "Mines Note #3", "Paxton's letter", "Mines Note #5", "???"
    ]},
    { name: "Misc", kind: "misc", entries: [
      "Green Tape", "Fiona's Diary", "Resume #451"
    ]}
  ]
};
