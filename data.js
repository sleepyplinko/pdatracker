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
        1: [
        ["PB Silenced Makarov", { stats: {
          "CALIBER TYPE": "9x18mm Makarov",
          "AUTO": "YES",
          "BURST": "NO",
          "STRENGTH": "1.2x",
          "AIM TIME": "1.15",
          "SWITCH TIME": "0.11s",
          "RPM": "200",
          "ALERT RADIUS": "50",
          "RELOAD MODIFIER": "1",
          "WEAPON TYPE": "Magazine-fed",
          "MAX SPREAD": "17",
          "MINIMUM SPREAD": "1",
          "SPREAD INCREMENT": "0.35",
          "SPREAD DECREASE": "1.5/0.1s",
          "EQUIP TIME": "0.65s",
          "WEIGHT": "0.25"
        }, comment: "" }],
        ["Glock 18", { stats: {
          "CALIBER TYPE": "9x19mm",
          "AUTO": "YES",
          "BURST": "NO",
          "STRENGTH": "0.7x",
          "AIM TIME": "0.5",
          "SWITCH TIME": "0.05s",
          "RPM": "1000",
          "ALERT RADIUS": "300",
          "RELOAD MODIFIER": "1",
          "WEAPON TYPE": "Magazine-fed",
          "MAX SPREAD": "20",
          "MINIMUM SPREAD": "2.5",
          "SPREAD INCREMENT": "0.15",
          "SPREAD DECREASE": "0.4/0.1s",
          "EQUIP TIME": "0.75s"
        }, comment: "The most popular handgun amongst the lowest ranking of civilians.. GLOCK 18! A tiny machine gun for handguns.. Uses 9mm and can be quite threatening, so it's no surprise it became a choice for the civilians." }],
        ["ZVI Kevin M", { stats: {
          "CALIBER TYPE": "9x18mm Makarov",
          "AUTO": "NO",
          "BURST": "NO",
          "STRENGTH": "2x",
          "AIM TIME": "0.4",
          "SWITCH TIME": "0.24s",
          "RPM": "250",
          "ALERT RADIUS": "125",
          "RELOAD MODIFIER": "1",
          "WEAPON TYPE": "Magazine-fed",
          "MAX SPREAD": "10",
          "MINIMUM SPREAD": "3.5",
          "SPREAD INCREMENT": "0.75",
          "SPREAD DECREASE": "0.4/0.1s",
          "EQUIP TIME": "0.25s"
        }, comment: "BERETTA GLOCK KEVIN???" }],
        ["USFA Zip .22", { stats: {
          "CALIBER TYPE": ".22lr",
          "AUTO": "YES",
          "BURST": "NO",
          "STRENGTH": "1x",
          "AIM TIME": "0.5",
          "SWITCH TIME": "0.05s",
          "RPM": "450",
          "ALERT RADIUS": "75",
          "RELOAD MODIFIER": "1",
          "WEAPON TYPE": "Magazine-fed",
          "MAX SPREAD": "30",
          "MINIMUM SPREAD": "0.5",
          "SPREAD INCREMENT": "0.3",
          "SPREAD DECREASE": "0.03/0.1s",
          "EQUIP TIME": "0.5s"
        }, comment: "So tactical in it's design and ergo, a pretty big handgun compared to others, 17-round magazine for your safety.. Accepts many bullet types so that's a neat trait about this pistol." }],
        ["M45A1", { stats: {
          "CALIBER TYPE": ".45ACP",
          "AUTO": "YES",
          "BURST": "NO",
          "STRENGTH": "1.2x",
          "AIM TIME": "1",
          "SWITCH TIME": "0.1s",
          "RPM": "325",
          "ALERT RADIUS": "150",
          "RELOAD MODIFIER": "1",
          "WEAPON TYPE": "Magazine-fed",
          "MAX SPREAD": "20",
          "MINIMUM SPREAD": "1",
          "SPREAD INCREMENT": "0.05",
          "SPREAD DECREASE": "1.5/0.1s",
          "EQUIP TIME": "0.75s"
        }, comment: "Sweet .45 ACP! M1911s were outdated so M45A1s became more popular instead, a pretty odd choice since these weapons were honestly kind of forgotten even for their intended replacement. You'll find some of these amongst scavengers instead." }],
        ["PM Makarov", { stats: {
          "CALIBER TYPE": "9x18mm Makarov",
          "AUTO": "YES",
          "BURST": "NO",
          "STRENGTH": "1.3x",
          "AIM TIME": "0.8",
          "SWITCH TIME": "0.08s",
          "RPM": "200",
          "ALERT RADIUS": "235",
          "RELOAD MODIFIER": "1",
          "WEAPON TYPE": "Magazine-fed",
          "MAX SPREAD": "20",
          "MINIMUM SPREAD": "0.75",
          "SPREAD INCREMENT": "0.425",
          "SPREAD DECREASE": "1.5/0.1s",
          "EQUIP TIME": "0.45s"
        }, comment: "" }],
        ["Skorpion", { stats: {
          "CALIBER TYPE": ".32 ACP | 9x19mm | 9x18mm Makarov",
          "AUTO": "YES",
          "BURST": "NO",
          "STRENGTH": "0.8x",
          "AIM TIME": "0.25",
          "SWITCH TIME": "0.03s",
          "RPM": "700",
          "ALERT RADIUS": "200",
          "RELOAD MODIFIER": "0.8",
          "WEAPON TYPE": "Magazine-fed",
          "MAX SPREAD": "20",
          "MINIMUM SPREAD": "2",
          "SPREAD INCREMENT": "0.2",
          "SPREAD DECREASE": "1/0.1s",
          "EQUIP TIME": "0.25s"
        }, comment: "Incredibly light, like it literally takes up almost no space at all without magazine, don't know how the components got that light but don't expect the performance of the weapon to be anything good though." }],
        ["SIG Sauer P250", { stats: {
          "CALIBER TYPE": "9x19mm | .45ACP | .22lr | .357 SIG",
          "AUTO": "YES",
          "BURST": "NO",
          "STRENGTH": "1x",
          "AIM TIME": "0.5",
          "SWITCH TIME": "0.05s",
          "RPM": "500",
          "ALERT RADIUS": "300",
          "RELOAD MODIFIER": "0.75",
          "WEAPON TYPE": "Magazine-fed",
          "MAX SPREAD": "20",
          "MINIMUM SPREAD": "1",
          "SPREAD INCREMENT": "0.5",
          "SPREAD DECREASE": "0.75/0.1s",
          "EQUIP TIME": "0.75s"
        }, comment: "This pistol is a menace. No seriously, it's really popular for whatever reason. Everyone loves these and nobody really knows why, is it because of it's incredible ergonomics? The fact that there's 5 different extended magazines available for it? Or that it accepts almost every single pistol bullet possible?\n\nMysteries that time will.. probably never tell." }]
        ],
        2: [
        ["OTs-33 Pernach", { stats: {
          "CALIBER TYPE": "9x18mm Makarov",
          "AUTO": "YES",
          "BURST": "NO",
          "STRENGTH": "0.75x",
          "AIM TIME": "0.4",
          "SWITCH TIME": "0.04s",
          "RPM": "800",
          "ALERT RADIUS": "400",
          "RELOAD MODIFIER": "1",
          "WEAPON TYPE": "Magazine-fed",
          "MAX SPREAD": "20",
          "MINIMUM SPREAD": "2.75",
          "SPREAD INCREMENT": "0.3",
          "SPREAD DECREASE": "0.4/0.1s",
          "EQUIP TIME": "0.25s"
        }, comment: "The most popular handgun amongst the lowest ranking of civilians.. GLOCK 18! A tiny machine gun for handguns.. Uses 9mm and can be quite threatening, so it's no surprise it became a choice for the civilians." }],
        ["OTs-02 Kiparis", { stats: {
          "CALIBER TYPE": "9x18mm Makarov",
          "AUTO": "YES",
          "BURST": "NO",
          "STRENGTH": "1x",
          "AIM TIME": "1.125",
          "SWITCH TIME": "0.11s",
          "RPM": "800",
          "ALERT RADIUS": "250",
          "RELOAD MODIFIER": "1",
          "WEAPON TYPE": "Magazine-fed",
          "MAX SPREAD": "20",
          "MINIMUM SPREAD": "2",
          "SPREAD INCREMENT": "0.2",
          "SPREAD DECREASE": "1/0.1s",
          "EQUIP TIME": "1.1s",
          "WEIGHT": "0.5"
        }, comment: "The OTS-02 Kiparis, a SMG currently in service by internal security of foreign embassies and police overseas. Currently its unknown how this weapon managed to appear in the city but more sighting of such weapon have been seen with citizens, with majority citing its accuracy and light design combined with cheap ammunition and maintenance." }],
        ["Beretta M9A3", { stats: {
          "CALIBER TYPE": "9x19mm | .45ACP | .22lr",
          "AUTO": "YES",
          "BURST": "NO",
          "STRENGTH": "1.4x",
          "AIM TIME": "0.5",
          "SWITCH TIME": "0.05s",
          "RPM": "275",
          "ALERT RADIUS": "200",
          "RELOAD MODIFIER": "1",
          "WEAPON TYPE": "Magazine-fed",
          "MAX SPREAD": "10",
          "MINIMUM SPREAD": "1",
          "SPREAD INCREMENT": "0.5",
          "SPREAD DECREASE": "0.4/0.1s",
          "EQUIP TIME": "0.25s"
        }, comment: "So tactical in it's design and ergo, a pretty big handgun compared to others, 17-round magazine for your safety.. Accepts many bullet types so that's a neat trait about this pistol." }],
        ["Ashot", { stats: {
          "CALIBER TYPE": ".410",
          "AUTO": "NO",
          "BURST": "NO",
          "STRENGTH": "1.45x",
          "AIM TIME": "0.5",
          "SWITCH TIME": "0.4s",
          "RPM": "150",
          "ALERT RADIUS": "600",
          "RELOAD MODIFIER": "1",
          "WEAPON TYPE": "Manually-loaded",
          "MAX SPREAD": "9.5",
          "MINIMUM SPREAD": "5.5",
          "SPREAD INCREMENT": "0.1",
          "SPREAD DECREASE": "0.15/0.05s",
          "EQUIP TIME": "0.25s",
          "WEIGHT": "0.25"
        }, comment: "" }],
        "???"
        ],
        3: [
        ["FN Five-Seven", { stats: {
          "CALIBER TYPE": "5.7x28mm",
          "AUTO": "YES",
          "BURST": "NO",
          "STRENGTH": "1.4x",
          "AIM TIME": "0.75",
          "SWITCH TIME": "0.08s",
          "RPM": "360",
          "ALERT RADIUS": "500",
          "RELOAD MODIFIER": "1",
          "WEAPON TYPE": "Magazine-fed",
          "MAX SPREAD": "16",
          "MINIMUM SPREAD": "2.25",
          "SPREAD INCREMENT": "0.05",
          "SPREAD DECREASE": "0.1/0.1s",
          "EQUIP TIME": "0.75s"
        }, comment: "" }],
        ["Warne Super Jägare", { stats: {
          "CALIBER TYPE": ".45ACP | 10x25mm",
          "AUTO": "YES",
          "BURST": "NO",
          "STRENGTH": "1.4x",
          "AIM TIME": "0.5",
          "SWITCH TIME": "0.05s",
          "RPM": "325",
          "ALERT RADIUS": "400",
          "RELOAD MODIFIER": "1",
          "WEAPON TYPE": "Magazine-fed",
          "MAX SPREAD": "10",
          "MINIMUM SPREAD": "0.5",
          "SPREAD INCREMENT": "0.25",
          "SPREAD DECREASE": "0.1/0.05s",
          "EQUIP TIME": "1s"
        }, comment: "" }],
        ["Stechkin APB", { stats: {
          "CALIBER TYPE": "9x18mm Makarov",
          "AUTO": "YES",
          "BURST": "NO",
          "STRENGTH": "0.8x",
          "AIM TIME": "0.55",
          "SWITCH TIME": "0.06s",
          "RPM": "725",
          "ALERT RADIUS": "125",
          "RELOAD MODIFIER": "1",
          "WEAPON TYPE": "Magazine-fed",
          "MAX SPREAD": "13",
          "MINIMUM SPREAD": "2.5",
          "SPREAD INCREMENT": "0.175",
          "SPREAD DECREASE": "0.55/0.1s",
          "EQUIP TIME": "0.4s",
          "WEIGHT": "0.5"
        }, comment: "A fully automatic 9x18mm handgun designed as a replacement to the inferior Makarov PM for usage by state special forces. While still relatively heavy and cumbersome, it's still lighter than its predecessor - the APS. This one comes attached with a foldable stock and a pistol suppressor. Quiet, somewhat accurate, yet still underwhelming due to the used caliber." }],
        ["H&K VP70", { stats: {
          "CALIBER TYPE": "9x19mm",
          "AUTO": "NO",
          "BURST": "YES",
          "BURST DELAY": "0.2s",
          "BURST AMOUNT": "3",
          "BURST VOLLEY": "5",
          "STRENGTH": "1.25x",
          "AIM TIME": "0.75",
          "SWITCH TIME": "0.04s",
          "RPM": "1500",
          "ALERT RADIUS": "300",
          "RELOAD MODIFIER": "1.25",
          "WEAPON TYPE": "Magazine-fed",
          "MAX SPREAD": "25",
          "MINIMUM SPREAD": "3",
          "SPREAD INCREMENT": "0.1",
          "SPREAD DECREASE": "0.2/0.1s",
          "EQUIP TIME": "0.25s"
        }, comment: "" }],
        ["H&K USP Compact", { stats: {
          "CALIBER TYPE": ".45ACP | .40 S&W | 9x19mm | .357 SIG",
          "AUTO": "YES",
          "BURST": "NO",
          "STRENGTH": "1.35x",
          "AIM TIME": "0.65",
          "SWITCH TIME": "0.07s",
          "RPM": "350",
          "ALERT RADIUS": "200",
          "RELOAD MODIFIER": "1",
          "WEAPON TYPE": "Magazine-fed",
          "MAX SPREAD": "15",
          "MINIMUM SPREAD": "0.5",
          "SPREAD INCREMENT": "0.125",
          "SPREAD DECREASE": "0.1/0.1s",
          "EQUIP TIME": "0.75s"
        }, comment: "The H&K USP Compact was formerly used by the 'Government' for it's high stopping power as well as the fact that they can utilize a variety of ammo types. Though it was eventually replaced by the H&K MP7 which had immense backlash due to the fact that President Tofuu thought it would be a good idea to replace a side arm with a submachine gun. A long debate was formed over this change where Tofuu tried to argue against the military on how the H&K MP7 classifies as a side-arm. He didn't win. Though instead of backing down, later that year he found the Beretta CX4 Storm and fell in love with it and thus chose that weapon instead for the military." }],
        ["Glock 19", { stats: {
          "CALIBER TYPE": "9x19mm",
          "AUTO": "YES",
          "BURST": "NO",
          "STRENGTH": "1.4x",
          "AIM TIME": "0.75",
          "SWITCH TIME": "0.08s",
          "RPM": "500",
          "ALERT RADIUS": "400",
          "RELOAD MODIFIER": "1",
          "WEAPON TYPE": "Magazine-fed",
          "MAX SPREAD": "20",
          "MINIMUM SPREAD": "2",
          "SPREAD INCREMENT": "0.075",
          "SPREAD DECREASE": "0.1/0.1s",
          "EQUIP TIME": "1s"
        }, comment: "The GLOCK 19 is a popular choice within the average district, decent ergonomics, average stopping power, variety of magazine supports ranging from 17 rounds to 80 rounds. Though you'll only ever see 17-20 rounds as the higher capacity is unnecessary and reasonably expensive. It's accessible ammo further makes it a popular pick within the district. Despite the fact that it only fires 9x19mm. It was also popularized by the Beige Boxes a faction known for their army of cardboard \"armoured\" men with GLOCK 19s. They're pretty weak especially on the durability side admittedly but there's so many of them that it's almost uncountable, I guess that makes up for their quality." }],
        ["Ruger P345", { stats: {
          "CALIBER TYPE": ".45ACP",
          "AUTO": "YES",
          "BURST": "NO",
          "STRENGTH": "2x",
          "AIM TIME": "0.75",
          "SWITCH TIME": "0.08s",
          "RPM": "400",
          "ALERT RADIUS": "250",
          "RELOAD MODIFIER": "1",
          "WEAPON TYPE": "Magazine-fed",
          "MAX SPREAD": "20",
          "MINIMUM SPREAD": "1.75",
          "SPREAD INCREMENT": "0.1",
          "SPREAD DECREASE": "0.1/0.1s",
          "EQUIP TIME": "0.35s",
          "WEIGHT": "0.5"
        }, comment: "" }]
        ],
        4: [
        ["Glock 19 Roland Special", { stats: {
          "CALIBER TYPE": "9x19mm",
          "AUTO": "YES",
          "BURST": "NO",
          "STRENGTH": "1.65x",
          "AIM TIME": "1",
          "SWITCH TIME": "0.1s",
          "RPM": "550",
          "ALERT RADIUS": "300",
          "RELOAD MODIFIER": "1",
          "WEAPON TYPE": "Magazine-fed",
          "MAX SPREAD": "25",
          "MINIMUM SPREAD": "1.5",
          "SPREAD INCREMENT": "0.05",
          "SPREAD DECREASE": "0.1/0.1s",
          "EQUIP TIME": "0.75s"
        }, comment: "" }],
        ["AMT Hardballer", { stats: {
          "CALIBER TYPE": ".45ACP",
          "AUTO": "YES",
          "BURST": "NO",
          "STRENGTH": "3x",
          "AIM TIME": "1",
          "SWITCH TIME": "0.1s",
          "RPM": "350",
          "ALERT RADIUS": "400",
          "RELOAD MODIFIER": "1",
          "WEAPON TYPE": "Magazine-fed",
          "MAX SPREAD": "10",
          "MINIMUM SPREAD": "1",
          "SPREAD INCREMENT": "0.25",
          "SPREAD DECREASE": "0.1/0.05s",
          "EQUIP TIME": "1s",
          "WEIGHT": "0.25"
        }, comment: "The AMT Hardballer is a semi-automatic 1911-style pistol, famous for being the first pistol built entirely out of brushed stainless steel to prevent rust. It comes standard with competition-style modifications out of the factory, such as target sights, an extended slide release, and a wide target trigger. This variant is the most famous variant of the AMT Hardballer \"Long Slide\" variant, featuring a 7-inch barrel and slide. The Long Slide variant is a more sporty, target shooting focused variant to give target shooters a longer sight radius and enough muzzle weight to manage the strong recoil of .45 ACP. The name \"Hardballer\" derives it's name from it's intended use with standard 230-grain full metal jacket (FMJ) \"hardball\" military-grade ammunition." }],
        "???"
        ],
        5: [
        ["Glock 17+", { stats: {
          "CALIBER TYPE": "9x19mm",
          "AUTO": "YES",
          "BURST": "NO",
          "STRENGTH": "1.9x",
          "AIM TIME": "0.5",
          "SWITCH TIME": "0.05s",
          "RPM": "575",
          "ALERT RADIUS": "50",
          "RELOAD MODIFIER": "1",
          "WEAPON TYPE": "Magazine-fed",
          "MAX SPREAD": "10",
          "MINIMUM SPREAD": "0",
          "SPREAD INCREMENT": "0.35",
          "SPREAD DECREASE": "0.03/0.1s",
          "EQUIP TIME": "0s"
        }, comment: "" }],
        ["Killer²", { stats: {
          "CALIBER TYPE": ".45ACP",
          "AUTO": "YES",
          "BURST": "NO",
          "STRENGTH": "4x",
          "AIM TIME": "0.7",
          "SWITCH TIME": "0.07s",
          "RPM": "450",
          "ALERT RADIUS": "400",
          "RELOAD MODIFIER": "1",
          "WEAPON TYPE": "Magazine-fed",
          "MAX SPREAD": "10",
          "MINIMUM SPREAD": "0.5",
          "SPREAD INCREMENT": "0.25",
          "SPREAD DECREASE": "0.1/0.05s",
          "EQUIP TIME": "1s",
          "WEIGHT": "0.5"
        }, comment: "\"A .45 Long Slide, with laser sighting.\"\n\nThe KILLER2/Killer Second is a rare factory modification of the AMT Hardballer \"Long Slide\" variant produced in limited amounts and only sold to exclusive buyers. Although the KILLER2 included standard upgrades to the AMT Hardballer such as more ergonomics, lighter internals, and better durability, It's most prominent addition to the Hardballer is it's bulky, custom-built helium-neon laser-sight, being one of the very first laser sight technology ever developed." }]
        ]
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
      Object.assign(G("Miners", [
        P("Drill Gal", { Health: 145, Speed: 0.9, Defense: 15 },
          { "Pre-Aim": 150, Strength: "0.5x", "Aim Time Multiplier": "1.25x", "Reload Speed Multiplier": "2x", "Aim Slowdown": "2.5x" },
          [W("Power Drill")]),
        P("Shoveler", { Health: 90, Speed: 1 },
          { "Pre-Aim": 50, Strength: "0.5x", "Aim Time Multiplier": "1.25x", "Reload Speed Multiplier": "2x", "Aim Slowdown": "2.5x" },
          [W("Shovel")]),
        P("Miner", { Health: 90, Speed: 0.9 },
          { "Pre-Aim": 90, Strength: "0.5x", "Aim Time Multiplier": "1.25x", "Reload Speed Multiplier": "2x", "Aim Slowdown": "2.5x" },
          [W("Pickaxe")])
      ]), { img: "images/people/miners.webp" }),
      P("Tony", { Health: 220, Speed: 1.2, Defense: 40, "Super Armour": 12 },
        { "Aim Time Multiplier": "1.25x", "Aim Slowdown": "1.25x" },
        [W("Golf Club")]),
      Object.assign(G("Scavengers", [
        P("Artist",      { Health: 100, Speed: 1.3 }, STD, [WR("Electric Guitar")]),
        P("Chilly",      { Health: 100, Speed: 0.9 }, STD, WR("H&K MP5K", "MP-412 REX", "SKORPION", "SERBU SUPER SHORTY")),
        P("Sigmund",     { Health: 90,  Speed: 1 },   STD, WR("Kitchen Knife", "M45A1")),
        P("Fashionista", { Health: 90,  Speed: 1 },   STD, WR("UZI", "Machete", "SIG SAUER P250")),
        P("Nerdy",       { Health: 90,  Speed: 1.1 }, STD, WR("AK74U", "COLT 1883 SAWN OFF", "H&K VP70")),
        P("Palm",        { Health: 90,  Speed: 1 },   STD, WR("M16A1", "SKORPION", "UZI")),
        P("Cool",        { Health: 90,  Speed: 1.1 }, STD, WR("Hammer", "COLT 1883 SAWN OFF")),
        P("Swagger",     { Health: 100, Speed: 0.8 }, { Suppressor: "true", ...STD }, WR("Z-M LR-300", "OTS-33 PERNACH", "COLT 9MM SMG", "BENELLI NOVA")),
        P("Average",     { Health: 90,  Speed: 1 },   STD, WR("BERETTA M9A3", "GLOCK 18", "Frying Pan"))
      ]), { img: "images/people/scavengers.webp" }),
      Object.assign(G("Robinson", [
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
      ]), { img: "images/people/robinson.webp" }),
      Object.assign(P("Rogue Sig Boy", { Health: 130, Speed: 1.1, Defense: 15, Supershield: 1 }, STD,
        [W("SIG SAUER P250"), A(".357 SIG FMJTC")]), { img: "images/people/rogue-sig-boy.webp" }),
      Object.assign(G("Rogues", [
        P("Lavender Rogue",           { Health: 90,  Speed: 1 },   ROGUE, ROGUE_LOADOUT),
        P("Green Guy",                { Health: 90,  Speed: 0.9 }, ROGUE, ROGUE_LOADOUT),
        P("Scarlet's Maroon",         { Health: 100, Speed: 1 },   ROGUE, ROGUE_LOADOUT),
        P("XMas4ever Guy",            { Health: 90,  Speed: 0.9 }, ROGUE, ROGUE_LOADOUT),
        P("Yellow One",               { Health: 90,  Speed: 1 },   ROGUE, ROGUE_LOADOUT),
        P("Distrustful Swag",         { Health: 90,  Speed: 0.9 }, ROGUE, ROGUE_LOADOUT),
        P("Navy Blue of Nonchalant",  { Health: 90,  Speed: 0.9 }, ROGUE, ROGUE_LOADOUT),
        P("Sky-Blue Chump",           { Health: 90,  Speed: 0.9 }, ROGUE, ROGUE_LOADOUT)
      ]), { img: "images/people/rogues.webp" }),
      Object.assign(P("Factory King", { Health: 325, Speed: 1.1, Defense: 70, Supershield: 2, "Super Armour": 25 },
        { "Pre-Aim": 40, Strength: "0.3x", "Aim Time Multiplier": "2x", "Reload Speed Multiplier": "1.4x" },
        [W("H&K G11"), A("4.73x33mm SP"), M("30rnd G11 Mag")]), { img: "images/people/factory-king.webp" }),
      Object.assign(P("Sapling", { Health: 90, Speed: 1.3, Defense: 10, "Burn Resistance": -200, "Bleed Resistance": 100 },
        ROGUE, [WR("Machete")]), { img: "images/people/sapling.webp" }),
      Object.assign(P("Rogue Lead", { Health: 122, Speed: 1.1 }, STD,
        [W("BERETTA M9A3"), A(".45ACP Hydra-Shok"), M("17rnd Beretta Mag")]), { img: "images/people/rogue-lead.webp" }),
      Object.assign(P("Loner", { Health: 450, Speed: 1.4, Defense: 90, Shield: 300, Supershield: 2, "Super Armour": 9, "Bleed Resistance": 80, "Explosive Resistance": 25 },
        { Suppressor: "true", Strength: "0.6x", "Aim Time Multiplier": "1.7x", "Reload Speed Multiplier": "2x", "Aim Slowdown": "0.425x" },
        [W("COLT M4A1"), A("5.56x45mm M855"), M("30rnd AR15 Mag")]), { img: "images/people/loner.webp" }),
      Object.assign(P("Plant Man", { Health: 110, Speed: 1.2, Defense: 5, Supershield: 2, "Super Armour": 35, "Burn Resistance": -200, "Bleed Resistance": 100 },
        { Suppressor: "true", "Aim Time Multiplier": "1.5x" },
        [WR("Garden Gnome")]), { img: "images/people/plant-man.webp" }),
      Object.assign(P("Flower Woman", { Health: 175, Speed: 1.5, Defense: 10, Shield: 150, "Super Armour": 32, "Burn Resistance": -200, "Bleed Resistance": 100 },
        { Suppressor: "true", "Aim Time Multiplier": "1.25x" },
        [WR("Garden Gnome")]), { img: "images/people/flower-woman.webp" }),
      Object.assign(P("Jeremia Carter", { Health: 500, Speed: 1.2, Defense: 40, Shield: 300, Supershield: 1, "Super Armour": 20, "Burn Resistance": 75, "Bleed Resistance": 100, "Explosive Resistance": 70 },
        { Suppressor: "true", "Pre-Aim": 30, Strength: "0.4x", "Aim Time Multiplier": "1.5x", "Aim Slowdown": "0.7x", "Attack Slowdown": "1.5x" },
        WR("COLT M4A1+", "CZ SKORPION EVO 3", "MILITARY KRISS VECTOR", "PP-19-01 VITYAZ")), { img: "images/people/jeremia-carter.webp" }),
      Object.assign(P("Howard Carter", { Health: 80, Speed: 0.9 }, STD, []), { img: "images/people/howard-carter.webp" }),
      P("Forest Dwellers", { Health: 100, Speed: 0.9, Defense: 20 },
        { Strength: "0.5x", "Aim Time Multiplier": "1.25x", "Reload Speed Multiplier": "2x", "Aim Slowdown": "2.5x" },
        WR("Atuned Skewer", "Shovel", "Pipe", "Sledgehammer", "Runes Saber", "Claymore", "Bearded Axe")),
      Object.assign(G("Advanced Scavengers", [
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
      ]), { img: "images/people/advanced-scavengers.webp" }),
      Object.assign(P("Witch", { Health: 400, Speed: 1.2, Defense: 50, Shield: 200, "Super Armour": 14 },
        { "Pre-Aim": 40, Strength: "0.7x", "Aim Time Multiplier": "0.5x", "Aim Slowdown": "1.4x" },
        [W("H&K MP5K"), W("SAVAGE ARMS AXIS II")]), { img: "images/people/witch.webp" }),
      Object.assign(P("Trash Gang", { Health: 100, Speed: 1.1, Defense: 30, Shield: 100, "Bleed Resistance": 45, "Explosive Resistance": 50 },
        { "Pre-Aim": 20, Strength: "0.4x", "Aim Time Multiplier": "1.8x", "Aim Slowdown": "1.5x", "Attack Slowdown": "0.25x" },
        WR(".44 AUTO MAG PISTOL", "SAIGA-12", "STEN MK II", "GLOCK 19 ROLAND SPECIAL")), { img: "images/people/trash-gang.webp" }),
      Object.assign(P("G.O.A.T", { Health: 100, Speed: 0.8, Shield: 85, Supershield: 20, "Super Armour": 30 },
        { Suppressor: "true", "Pre-Aim": 35, Strength: "0.5x", "Aim Time Multiplier": "2x", "Reload Speed Multiplier": "2x", "Aim Slowdown": "1.4x", "Attack Slowdown": "0.3x" },
        [W("MARE'S LEG"), A(".44 JSP")]), { img: "images/people/g-o-a-t.webp" })
    ]},
    { name: "Civilian", color: "#a6e38f", bg: "#132611", entries: [
      Object.assign(P("Maria Hatty Kirsten", { Health: 1000, Speed: 1.4, Defense: 75, Supershield: 30, "Super Armour": 35, "Explosive Resistance": 70, "Fracture Immunity": "true" },
        { "Aim Time Multiplier": "0x" },
        [W("Chainsaw")]), { img: "images/people/maria-hatty-kirsten.webp" }),
      Object.assign(P("Citizen Assault", { Health: 150, Speed: 1.3 },
        { Suppressor: "true", Strength: "0.3x", "Aim Time Multiplier": "1.5x", "Aim Slowdown": "1.3x" },
        [W("DAEWOO K1"), A("5.56x45mm FMJ"), M("K1 Mag")]), { img: "images/people/citizen-assault.webp" }),
      Object.assign(P("Citizen Rogue", { Health: 100, Speed: 1.2, Defense: 25, Shield: 20 },
        { "Pre-Aim": 25, "Aim Time Multiplier": "1.5x", "Aim Slowdown": "1.1x" },
        [W("Hammer")]), { img: "images/people/citizen-rogue.webp" }),
      Object.assign(P("Citizen Sniper", { Health: 175, Speed: 0, Defense: 20 },
        { Suppressor: "true", Strength: "0.3x", "Aim Time Multiplier": "2x", "Reload Speed Multiplier": "1.4x" },
        [W("REMINGTON 700"), A(".308 M105 AP"), M("11rnd R700 Mag")]), { img: "images/people/citizen-sniper.webp" }),
      Object.assign(P("Citizen Scout", { Health: 80, Speed: 1.1 },
        { Strength: "0.2x", "Aim Time Multiplier": "2.5x", "Aim Slowdown": "1.35x" },
        [W("GLOCK 18"), A("9x19mm PSO gzh"), M("17rnd Glock Mag")]), { img: "images/people/citizen-scout.webp" }),
      Object.assign(P("Citizen Bodyguard", { Health: 115, Speed: 1.1, Defense: 15, Shield: 30 },
        { Strength: "0.2x", "Aim Time Multiplier": "2.5x", "Aim Slowdown": "1.35x" },
        [W("BERETTA M9A3")]), { img: "images/people/citizen-bodyguard.webp" }),
      Object.assign(P("Citizen Charger", { Health: 350, Speed: 1.7, Defense: 90, Shield: 25, Supershield: 2, "Super Armour": 8, "Explosive Resistance": 66 },
        { Suppressor: "true", Strength: "0.5x", "Aim Time Multiplier": "1.6x", "Aim Slowdown": "0.65x" },
        [W("FRANCHI SPAS-12")]), { img: "images/people/citizen-charger.webp" }),
      Object.assign(P("Citizen Bat", { Health: 125, Speed: 1.6, Defense: 5, Shield: 50, "Super Armour": 3, "Explosive Resistance": 70 },
        { "Aim Time Multiplier": "1.25x", "Aim Slowdown": "0.5x" },
        [W("Baseball Bat")]), { img: "images/people/citizen-bat.webp" }),
      Object.assign(P("Citizen Guard", { Health: 100, Speed: 1, Defense: 40, Shield: 60, "Explosive Resistance": 25 },
        { "Pre-Aim": 25, Strength: "0.3x", "Aim Time Multiplier": "1.5x", "Aim Slowdown": "1.3x" },
        [W("H&K G36C"), A("5.56x45mm HP"), M("30rnd G36C Mag")]), { img: "images/people/citizen-guard.webp" }),
      Object.assign(P("Citizen Escort", { Health: 120, Speed: 1, Defense: 20 },
        { Strength: "0.3x", "Aim Time Multiplier": "1.5x", "Aim Slowdown": "1.5x" },
        [W("H&K MP5 RIS"), M("30rnd MP5 Mag")]), { img: "images/people/citizen-escort.webp" })
    ]},
    { name: "Volya", color: "#86e0b8", bg: "#0e241c", entries: [
      Object.assign(P("Benjamin Tarkovsky", { Health: 300, Speed: 0.5, Defense: 95, Shield: 150, Supershield: 5, "Super Armour": 32, "Burn Resistance": 85 },
        { Suppressor: "true", Strength: "0.35x", "Aim Time Multiplier": "1.5x", "Aim Slowdown": "3.5x", "Attack Slowdown": "0.35x" },
        [W("KONSTANTINOV"), A("7.62x39mm MAI AP"), M("73rnd ProMag Drum")]), { img: "images/people/benjamin-tarkovsky.webp" })
    ]},
    { name: "Robot", color: "#4a63ff", bg: "#0b0f2a", entries: [
      ["Security Bot A", { img: "images/people/security-bot-a.webp" }], ["Security Bot B", { img: "images/people/security-bot-b.webp" }], ["Security Bot C", { img: "images/people/security-bot-c.webp" }], ["Security Bot D", { img: "images/people/security-bot-d.webp" }],
      ["Security Bot E", { img: "images/people/security-bot-e.webp" }], ["VLTS Attendant", { img: "images/people/vlts-attendant.webp" }], "Fabricated Dummy"
    ]},
    { name: "Animals", color: "#d6ef5a", bg: "#1e2509", entries: [
      Object.assign(P("Rat", { Health: 5, Speed: 3.1 },
        { "Aim Time Multiplier": "1.25x" },
        [W("InfectedRapidBite")]), { img: "images/people/rat.webp" }),
      Object.assign(P("Ratman", { Health: 600, Speed: 1.2, Shield: 50, "Super Armour": 20 },
        { Strength: "0.3x", "Aim Time Multiplier": "2x", "Reload Speed Multiplier": "1.4x" },
        [W("Baseball Bat")]), { img: "images/people/ratman.webp" })
    ]},
    { name: "Hellion", color: "#ff3030", bg: "#2a0808", entries: [
      Object.assign(P("Wyrmling", { Health: 200, Speed: 2.8, Defense: 30, "Burn Resistance": -100, "Bleed Resistance": 100 },
        { Suppressor: "true", Strength: "0.3x", "Aim Time Multiplier": "2x", "Reload Speed Multiplier": "1.4x" },
        [W("WyrmlingBite")]), { img: "images/people/wyrmling.webp" }),
      P("Hellbender", { Health: 150, Speed: 0.5, "Super Armour": -30, "Burn Resistance": -10 },
        { Strength: "0.5x", "Aim Time Multiplier": "2x", "Reload Speed Multiplier": "2x", "Aim Slowdown": "1.4x", "Attack Slowdown": "0.3x" },
        [W("Spinal-lance")])
    ]},
    { name: "Velris", color: "#e08a8a", bg: "#241010", entries: [
      ["Velris Family", { img: "images/people/velris-family.webp" }]
    ]},
    { name: "Miscellaneous", color: "#ffffff", bg: "#141414", entries: [
      P("Monolithic Guardian", { Health: 140, Speed: 0.9, Defense: 27, "Explosive Resistance": 50 },
        { Strength: "0.3x", "Aim Time Multiplier": "1.5x" },
        [W("HENRY 45-70")]),
      P("WC Speedster", {}, {}, []),
      P("WC Emissary", { Health: 325, Speed: 1.6, Defense: 70, Shield: 400, Supershield: 2, "Super Armour": 40, "Burn Resistance": 100, "Bleed Resistance": 100, "Explosive Resistance": 60, "Stun Resistance": 100 },
        { "Pre-Aim": 25, Strength: "0.55x", "Aim Time Multiplier": "1.3x", "Aim Slowdown": "0.8x", "Attack Slowdown": "1.2x" },
        [W("GLOCK 17+"), A("9x19mm FXX2"), M("19rnd Glock Mag")]),
      Object.assign(P("Martin", { Health: 200, Speed: 0.9, Defense: 15, Supershield: 2, "Super Armour": 5, "Bleed Resistance": 75 },
        { Strength: "0.5x", "Aim Time Multiplier": "1.5x", "Aim Slowdown": "1.25x" },
        [W("M45A1"), A(".45ACP Match FMJ"), M("7rnd M45A1 Mag")]), { img: "images/people/martin.webp" }),
      P("Monolithic Psycho", { Health: 140, Speed: 0.9, "Explosive Resistance": 50 },
        { "Aim Time Multiplier": "1.25x" },
        [W("Fire Axe")]),
      Object.assign(P("Doe", { Health: 300, Speed: 0.9, Defense: 4, Supershield: 1, "Super Armour": 7, "Bleed Resistance": 50, "Explosive Resistance": 10 },
        { Strength: "1x", "Aim Time Multiplier": "0.4x" },
        []), { img: "images/people/doe.webp" }),
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
