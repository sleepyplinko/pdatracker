/* =====================================================================
   PDA TRACKER — ENTRY LIST
   ---------------------------------------------------------------------
   This is the only file you need to edit to add or fix entries.

   Weapons:   ["NAME"]                      a normal entry
              ["NAME", { special: true }]   red highlighted entry
              ["NAME", { stats: {...}, comment: "..." }]  adds a stat page
              "???"                          an entry whose name you
                                             don't know yet (shows as ???)
   People:    ["NAME"] or ["NAME", { img: "images/name.webp" }]
   Documents: ["NAME"]

   Every entry gets its checkmark saved by NAME, so if you rename an
   entry, anyone who had it marked will need to re-mark it.
   ===================================================================== */

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

  /* ---------------- BIOGRAPHY (people) ---------------- */
  biography: [
    { name: "Scavengers", color: "#f3c98b", bg: "#2a1d0e", entries: [
      "Miners", "Tony", "Scavengers", "Robinson", "Rogue Sig Boy", "Howard Carter",
      "Factory King", "Loner", "Plant Man", "Flower Woman", "Rogue Lead", "Jeremia Carter",
      "Sapling", "Forest Dwellers", "Rogues", "Advanced Scavengers", "Witch", "Trash Gang",
      "G.O.A.T"
    ]},
    { name: "Civilian", color: "#a6e38f", bg: "#132611", entries: [
      "Maria Hatty Kirsten", "Citizen Assault", "Citizen Rogue", "Citizen Sniper",
      "Citizen Scout", "Citizen Bodyguard", "Citizen Charger", "Citizen Bat",
      "Citizen Guard", "Citizen Escort"
    ]},
    { name: "Volya", color: "#86e0b8", bg: "#0e241c", entries: [
      "Benjamin Tarkovsky"
    ]},
    { name: "Robot", color: "#4a63ff", bg: "#0b0f2a", entries: [
      "Security Bot A", "Security Bot E", "VLTS Attendant", "Security Bot D",
      "Security Bot B", "Security Bot C", "Fabricated Dummy"
    ]},
    { name: "Animals", color: "#d6ef5a", bg: "#1e2509", entries: [
      "Rat", "Ratman"
    ]},
    { name: "Hellion", color: "#ff3030", bg: "#2a0808", entries: [
      "Wyrmling", "Hellbender"
    ]},
    { name: "Velris", color: "#e08a8a", bg: "#241010", entries: [
      "Velris Family"
    ]},
    { name: "Miscellaneous", color: "#ffffff", bg: "#141414", entries: [
      "Monolithic Guardian", "WC Emissary", "Martin", "Monolithic Psycho", "Doe",
      "Monolithic Soldier"
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
