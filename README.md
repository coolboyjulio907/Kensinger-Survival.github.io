# Kensinger Survival

A Brotato-inspired arena roguelike survival game. Pure HTML5 + Canvas + vanilla
JavaScript — **no build step, no dependencies**. Drop it on GitHub Pages and play.

![menu](assets/MenuBackground.jpg)

## Play

| Action | Input |
|---|---|
| Move | **WASD** / **Arrow Keys** / gamepad left stick & d-pad |
| Attack | Automatic — weapons hit nearby enemies (Manual Aim options in Settings) |
| Pause | **ESC** or **P** |
| Reroll (Level Up) | **F** |
| Reroll (Shop) | **R** |
| Lock shop item | **E** or click Lock |

Survive **20 waves** to beat the run. Every wave ends with the
**WAVE COMPLETED** banner → **Level Up** (if you gained levels) → **Shop** →
**Go** to the next wave.

### The intermission loop

- Kills roll for **Materials** (green cubes): waves 1-4 drop **100%**, then the
  chance falls **1.5 percentage points per wave** (wave 5: 92.5%, wave 10: 85%,
  wave 15: 77.5%, wave 20: 70%), never below **50%**, and **horde waves** (waves
  scheduling ≥ 55 units) multiply it by **0.65**. Stronger variants improve the
  reward (advanced ×2.5, elite ×5); a fractional value rolls probabilistically
  for the extra pickup instead of rounding. Picking a material up grants
  **+1 material AND +1 XP**; each level grants one upgrade choice.
- Kills can also drop **consumables**: first roll = does a consumable drop at
  all (per-enemy chance, boosted by **Luck** and the variant multiplier), second
  roll = **Loot Crate** or **Fruit**. Crate chance = base × (1 + Luck/100) ÷
  (1 + crates already dropped this wave) — each ordinary crate makes the next
  one rarer; the counter resets every wave. **Fruit heals 3 HP**; **crates**
  register for the end-of-wave screen, where each one offers a random item of
  the wave's rarity (**boss crates are golden, one tier better**) — take it or
  **recycle** it for 40% of its price. Bosses always drop materials **and** a
  guaranteed special crate, regardless of the ordinary odds. Material pickups
  merge into existing ones near the cap, and anything left on the ground is
  collected automatically when the wave ends — nothing is ever lost.
- **Combat**: weapons fly **dead straight** — the direction locks onto the
  nearest enemy (or your cursor with Manual Aim) the instant the attack starts,
  and the attack has **infinite piercing**: it damages **every enemy it
  touches** along its path without stopping. Attacks never travel farther than
  the weapon's reach, so clicking somewhere on the map cannot send your weapon
  flying to that spot.
- **New waves** restore your **full health** and teleport you back to the
  **center of the map**.
- **Level Up screen**: 4 upgrade cards, primary stats panel, reroll (starts at
  2 materials, +1 per roll). Multiple levels = multiple picks with a free
  auto-reroll between them.
- **Shop**: 4 purchasable slots — a **Fist offer is always present**, and the
  other slots can also roll weapon offers. Items can
  be **locked** (free) to keep them across rerolls *and* waves at a frozen
  price. Bought cards become **empty boxes** (even if they were locked) until
  the next reroll fills them again. Buying **all 4** makes the next reroll
  **free**. Reroll price per the formula: increase = max(1, ⌊0.40 × wave⌋),
  first price = ⌊wave × 0.75⌋ + increase. Cards the player **cannot afford**
  are dimmed with a red price and a "Too expensive" label.
- **Manage weapons**: click an owned weapon chip in the shop to **sell** it
  (50% of its tier's base price) or **combine** two copies of the same weapon
  at the same tier into one weapon of the next tier (up to T4). Weapon-granted
  stats (like the Hand's Harvesting) update automatically on buy / sell /
  combine.
- **Rarity**: tiers roll from the wave/level curve (T1 → T4), improved by the
  **Luck** stat, with guaranteed tiers at levels 1 (T1), 5 (T2), 10/15/20 (T3)
  and 25 + every 5th (T4).
- **Harvesting** pays out materials **once per wave** and is shown on the
  wave-complete banner ("+N materials — Harvesting"; +5% per activation until
  wave 20, then −20%).

### Wave durations

The timer ramps up: waves 1-9 last **20 / 25 / 30 / 35 / 40 / 45 / 50 / 55 /
60** seconds, waves 10-20 last **60 seconds** each. When the timer expires,
scheduling stops and the wave holds open until **every remaining enemy is
defeated** (and any boss is dead) — survivors are never discarded; a gold
"CLEAR THE REMAINING ENEMIES" banner marks overtime. The shop intermission
is separate from the combat timer.

### Difficulty

7 difficulties (0–6). Beating the highest unlocked one unlocks the next.
Difficulty 0 has **no modifiers**; higher ones add enemy HP / speed / damage /
spawn-rate. **Endless mode** keeps the waves rolling past 20.

### Adaptive spawn scheduling

Every ordinary enemy spawn is telegraphed with a **blinking red X** exactly
1 second before the enemy appears. Spawns never land closer than 250 px to
the principal. The wave's exact quota is chunked into **spawn groups** and
spread between 15% and 85% of the wave's actual duration, using per-wave
target intervals (waves 1-2: every 5-7s, waves 17-20: every 2.5-3s; group
sizes grow from 1-2 to 3-5). Intervals are targets, not rigid timers: short
waves with big quotas stretch group sizes before they shrink intervals, and
a burst guard never lets a group exceed twice its typical size.

### The active-enemy cap & dynamic spawn queue

A maximum of **55 ordinary enemies** may be alive at once (**12 while a boss
is on the field**; bosses never count). When the cap is reached, spawning
**pauses and the remaining quota stays queued** — nothing is discarded.
When kills free up space, spawning resumes and the remaining groups are
**re-timed into the wave time that is left** (adaptive re-targeting every
few seconds while anything is queued). If the cap is still exceeded by a
releasing group, the overflow is re-queued a beat later rather than spawned.
When the timer expires the queue simply stops; the player then finishes
whatever is on the field.

## The enemy roster (v0.5.0)

Nine enemy identities, each with its own movement, attack and special ability.
All stats live in `js/config.js` (`ENEMIES` / `VARIANTS` / `WAVE_SCHEDULE` /
`WAVE_SCALING` / `BOSSES`) — nothing is hardcoded in the behavior code.

| Enemy | Wave | Identity |
|---|---|---|
| **iPhone** | 1 | Pursuer; notification-bubble shots; **Notification Rush** dash every 9s (flashing warning + arrow, then a locked-direction dash) |
| **Camera** | 1 | Stationary turret; **Target Lock** red aiming line, then fires at your position the moment the shot releases |
| **ChatGPT** | 2 | Pursuer that stops to "answer"; **Generated Response** = 2-shot sequence, second aimed at your predicted position |
| **Toilet** | 3 | Slow tank; **Flush** expanding water wave with a dashed warning circle |
| **Gemini** | 4 | Strafing kiter; alternates accurate singles and 3-spreads; **Multimodal Burst** every 4th attack (wider 5-spread) |
| **TikTok** | 6 | Fast erratic mover; **Scroll Frenzy** speed burst then a brief slow; video-frame projectiles |
| **AirPods** | 8 | Spawns as **pairs**; orbit you in sync; each pod is independently targetable; **Soundwave** expanding ring from one pod of the pair |
| **Claude** | 10 | Kiting heavy shooter; **Constitution Shield** absorbs 20 damage |
| **Drug Bottle** | 12 | Zigzag mover; drops **Distraction Clouds** (temporary, −35% move speed inside, strongest applies, never stacks, never removes control) |

### Variants

From **wave 7** enemies can spawn as **Advanced** (×1.8 HP, ×1.25 dmg, ×1.10
speed, ×2.5 reward, blue ring), from **wave 13** as **Elite** (×3.0 HP, ×1.5
dmg, ×1.15 speed, ×5 reward, gold ring + crown ticks). Probabilities ramp
gradually and each variant also gets behavior upgrades (more lenses, wider
flushes, faster dashes, bigger soundwaves…).

### Bosses — only the three AI companies

| Wave | Boss | Notes |
|---|---|---|
| 5 | **ADVANCED CHATGPT** | 8× HP, 2.2× size; text spreads, predicted aimed sequences, a large orb that **splits into 6**; phases at 70% / 35% HP |
| 10 | **ADVANCED GEMINI** | 9× HP; radial bursts, aimed spreads, projectile rings with a safe gap |
| 15 | **ADVANCED CLAUDE** | 10× HP; heavy shots, stronger Constitution Shields, **protective zones** that halve damage while inside |
| 20 | **AI COUNCIL** | All three at once (7–8× HP each), **three separate health bars**, each keeps its own attack identity; the wave ends only when all three die |

Bosses are ~2.2× scale with a **dark-red overlay** blended over the original
logo, a red aura, a name banner on entrance and a dedicated health bar. Boss
waves use their normal assigned duration, and the boss spawns **at the start
of the wave behind a 3-second introduction sequence**, with ordinary pressure
reduced while it lives. In endless mode a boss returns every wave (rotating,
council every 5th).

### Early-game balance (spec §1)

Opening waves are deliberately relaxed: contact/projectile damage and enemy
speed run softened in waves 1-5 (e.g. ×0.6 damage, ×0.65 speed at waves 1-3,
tapering to 1.0 by wave 9), attack intervals are 1.25-1.8× longer early, first
attacks are staggered by a random 0.6-1.8s, projectiles fly slower (×0.7 in
waves 1-3), and the active-enemy cap ramps 3→4→5→6→7→10→14→18→24 across the
waves. Starting damage values: Toilet 1, AirPods 1, Camera 1 (its photo
projectile 1), TikTok 1 (stream projectile 1), ChatGPT 2 (answer projectile 2).
Every enemy keeps a working damage system — nothing is harmless.

### Rewards & difficulty curve

Base material values: Toilet 2, AirPods 1 per pod, Camera 2, TikTok 2,
ChatGPT 3, Gemini 3, iPhone 3, Claude 4, Drug Bottle 2 (advanced ×2.5,
elite ×5, bosses 25/30/35, council 75 total). Every enemy also rolls its own
consumable chance (1-3%) and crate chance (1-5%) — see the tables in
`config.js`. Global per-wave scaling interpolates HP ×1.0→×2.2 and
damage ×1.0→×1.6 between waves 1–20 and keeps climbing in endless mode.

### Debug overlay

Press **B** during a run: wave + clock, active ordinary count vs the current
cap, variants alive, spawn-queue size, spawned/quota-left per type, projectile
and hazard counts, and every boss's HP + phase.

## Characters & weapons

All characters have **10 base HP** plus any HP bonus.

| Character | Bonuses |
|---|---|
| **Balanced Kensinger** | +5 Max HP (15 total), +5% Speed, +8 Harvesting |
| **Adkins** | +50% Attack Speed with **Unarmed** weapons, starts with **1 Fist** (on top of the chosen starting weapon), +15% Dodge, −50 Range, −50 Ranged Damage. His starting-weapon screen only offers **Unarmed** weapons |
| **Fair Bair** | Crazy archetype: +25% Attack Speed (all weapons), −30% Dodge, −10 Engineering, −10 Ranged Damage. High-tempo glass cannon — no extra bonuses beyond the listed modifiers |

| Weapon | Classes | Notes |
|---|---|---|
| **Fist** | Unarmed | 8 base damage (100% Melee DMG scaling), 0.78s |
| **Hand** | Unarmed, Support | 1 damage (50% Melee DMG), 1.01s→0.71s per tier, knockback 30, grants **+3 / +6 / +12 / +25 Harvesting** by tier (shop prices 10 / 22 / 45 / 91) |

## Settings (all persisted in your browser)

- **Sound** — Master / Sound / Music volume, Mute on losing focus
- **Video** — Language (English / Español), Screenshake, Fullscreen, Visual
  Effects, Damage Display, Optimize end of waves, Limit FPS
- **Gameplay** — Mouse Only, Manual Aim, Manual Aim on mouse press, Movement
  with gamepad, HP bar on character, HP bar on bosses
- **Accessibility** — Explosion / Projectile / Pet opacity, Font Size
  (80–125%), Character / Weapons / Projectiles / Turrets / Pets Highlighting,
  Show effects icons, Change material sounds, Screen darkening, Retry failed
  waves (death restarts the current wave instead of ending the run)

### Custom art drop-in

Placeholder art renders today; replace it with images — no code changes:

- `assets/stats/<key>.png` — stat logos (e.g. `stats/maxHP.png`)
- `assets/upgrades/<key>_t<tier>.png` — level-up images (e.g. `upgrades/maxHP_t2.png`)
- `assets/items/<id>.png` — shop item icons (e.g. `items/apple.png`)
- `assets/Adkins.png` / `assets/Hand.png` — character portrait & weapon icon
  (currently temporary stand-ins)

## Features (v0.4.0)

- Everything from v0.3.x: settings screen, wave-completed banner, level-up
  economy, shop with locking/inflation/rerolls, pause rework, records, EN/ES
- **Characters**: 10 base HP rule, Balanced Kensinger (+5 HP / +5% Speed /
  +8 Harvesting), **new character Adkins** (unarmed brawler with an extra
  starting Fist and an Unarmed-only weapon selection)
- **New weapon: Hand** (Unarmed/Support) with 4 tiers and a Harvesting-granting
  special effect; class tags shown under every weapon title
- **Weapons fly straight with infinite piercing**; attack distance clamped to
  weapon reach (no more flying to a clicked map spot)
- **Materials economy**: every kill drops one material; each pickup = +1
  material and +1 XP (no XP orbs)
- **Pause menu opens with ESC or P**; Items row shows the character portrait
  first and grows one square per bought item (no item limit, no placeholders)
- Weapon **sell / combine** with correct passive-stat handling

## v0.6 — three characters & the loot economy

- **Fair Bair** (Crazy archetype) joins Kensinger and Adkins: +25% Attack
  Speed, −30% Dodge, −10 Engineering, −10 Ranged Damage — exactly those, no
  extras. New portrait, selectable from the character screen.
- **Character-select fix**: the preview panel and the highlighted slot now
  follow the character you actually chose (they used to stay on Kensinger).
- **Loot system** (`js/loot.js`, all knobs in `CONFIG.LOOT`): wave-based
  material chances with horde ×0.65, probabilistic fractional rewards,
  per-enemy consumable/crate rolls boosted by Luck, diminishing crate odds,
  fruit (+3 HP), loot crates resolved on a dedicated end-of-wave screen
  (take or recycle for 40%), guaranteed boss special crates, harvesting paid
  once per wave and shown on the banner, uncollected pickups auto-collected,
  and a new **Magnet** item (+40 pickup range).
- **Shop affordability**: cards you cannot afford are dimmed with a red price
  and a "Too expensive" label.
- Dodge now rolls in combat (60% cap, "DODGE" popup); Dodge / Engineering /
  Ranged Damage display on the stat screen for all characters.

## v0.7 — rebalance, Hebrew, hidden Dev Mode

- **Early-game rebalance**: the §1 damage table, slower approaches, longer
  attack intervals, staggered first attacks, slower early projectiles and the
  per-wave active-enemy cap table (3/4/5/6/7/10/14/18/24) — with breathing
  room between skirmishes. Later waves keep the existing progression.
- **Character display fix**: the in-run player sprite now uses the selected
  character's portrait (it was hardcoded to Kensinger Balanced for every run).
- **Hebrew (עברית)**: fully playable language — all 239 UI keys, menus, HUD,
  shop, upgrades, tooltips, wave/game-over screens, accessibility settings and
  the dev console; localized stat/tier/weapon/item names and character
  taglines; right-to-left interface that never mirrors gameplay.
- **Dev Mode**: hidden Accessibility toggle (visible only while Hebrew is
  selected, state persists independently across languages and restarts). With
  it enabled, `/` opens a Minecraft-style command console during waves and in
  the shop (pauses gameplay, never opens from the menu): `/stat`, `/weapon`,
  `/item`, `/reset`, `/undo` — with live autocomplete from the game's actual
  registries, Tab completion, command history, per-category undo, and safe
  validation on everything.

## v0.8 — camera rework, dev-panel E key, starting equipment, Builder

- **Camera is a mobile ranged pursuer** (Brotato ranged style): it chases
  the player, holds a firing ring, pauses only for its Target-Lock flash,
  and uses the same movement/clamp systems as every other enemy.
- **Dev console on E** (was `/`): toggle open/close with E, Escape closes
  from anywhere, works only while Dev Mode is enabled and only during a
  wave or in the shop — and it freezes the whole simulation (timers,
  enemies, projectiles, cooldowns) and resumes exactly where it stopped.
  The command input starts with `/` pre-typed.
- **Starting equipment** (Brotato Brawler/Crazy structure): the chosen
  starting weapon plus one guaranteed bonus weapon as separate instances —
  Adkins always gets a Fist, Fair Bair always gets a Knife (both keep their
  restricted starting pools).
- **Weapon instances** (spec §10): every slot is an independent instance
  with a unique id, its own tier/cooldown/state and its own HUD chip.
  Two identical weapons coexist; combining consumes the pair into one
  upgraded instance.
- **Bair The Builder**: new character (Brotato Builder) — starts with a
  unique Builder's Turret, +20 Harvesting, −30% Pickup Range, engineering
  gains ×1.5, damage gains ×0.25, and converts every 5 uncollected materials
  at the end of each wave into +1% Structure Attack Speed / +1 Structure
  Range (shown in the wave results). The turret re-deploys at the arena
  center each wave, auto-targets and fires with Engineering scaling, and
  upgrades through four tier images at +30/+150/+300 Structure Range with
  cumulative extra projectiles.
- **Combat is fully automatic**: manual clicking no longer influences
  attacks (the mouse stays UI-only). Hand strikes use the new handAttack
  art; the new Knife weapon uses knifeAttack.

## v0.9 — local split-screen multiplayer, smaller arena, player-relative enemy speeds

- **Local 2-player split screen**: "2 PLAYERS" on the menu — each player
  picks a character and starting weapon independently (duplicates allowed),
  P1 plays WASD (left half), P2 plays arrow keys (right half), each with
  their own camera, own HUD, own XP/level-ups, own items and own materials.
  Currency is credited per player exactly once per reward event; P1's shop
  purchases never touch P2's balance, cards or inventory. Enemy quotas and
  the active-enemy cap double in duo (boss count/HP unchanged); enemies use
  stable per-enemy targeting with occasional retargeting and speed that
  follows their current target's effective speed.
- **Arena 25% smaller** (960 -> 720 px): a genuinely smaller playable area,
  tiles re-rendered at the new size, spawns recalculated.
- **Enemy speeds replaced** with exact percentages of the targeted player's
  effective speed (toilet 70%, airpods 85%, camera 70%, tiktok 90%,
  chatgpt 80%, gemini 75%, iphone 80%, claude 70%, drug bottle 75%) —
  the old fixed speeds, variant/difficulty speed multipliers and wave
  speed curve are gone. Later waves scale through quantity/health/damage.
- **iPhone is a pure pursuer**: every projectile behavior removed; its
  Notification Rush surge now runs at 100% of the target's speed.
- **Builder's Turret**: body stays upright (a rotating barrel stub shows
  the firing direction) and it is now a SHOP ITEM (one per player; Bair
  keeps his guaranteed starting turret; the four-tier Structure Range
  upgrade system is unchanged).
- **Hand push art** faces the strike direction; **AirPods are ONE enemy**
  using the supplied pair image (one HP bar, one body, one reward roll,
  one quota unit); **camera projectiles fly 1.5x faster** (420).
- **Ranged attack telegraphs**: TikTok / ChatGPT / Gemini / Claude show a
  charging ring + dashed aim line before firing (Camera keeps its Target
  Lock line); the iPhone never shows ranged warnings.
- **Dev Mode defaults to OFF in every language**; the toggle stays visible
  only in Hebrew and language switching never changes its state.

## v0.10 — true full-interface co-op split screen, turn-based shop, character audit

- **The whole interface splits, not just the cameras**: every player gets a
  complete UI root (left 50% / right 50%). Health, wave + timer (exactly
  centered at 25% / 75% of the window), materials, kill counters, weapon
  chips, boss bars and elimination banners are per player and per half.
- **Co-Op defaults to OFF** and lives on the new RUN OPTIONS screen
  (menu -> play screen). A fresh install is always single-player; solo keeps
  the original centered interface and never shows "PLAYER n IS DOWN".
- **Turn-based intermissions**: crates per player, then level-ups P1 -> P2,
  then the shop P1 turn -> P2 turn -> next wave only after both DONEs. The
  inactive half dims ~28% + blurs and every interaction re-checks turn
  ownership in code (buy / reroll / lock / sell / combine / DONE / crates).
- **Two independent shops** (one per half): "PLAYER 1/2 SHOP" header with
  own materials, wave and reroll price; four purchase cards with artwork,
  tier, price, description, locked and unaffordable states; own inventory,
  reroll count and DONE button. Player 2 rerolls as reliably as Player 1.
- **Duplicated shared wave reward**: both players' collected materials and
  harvesting income are combined and the SAME total is credited to each
  player (every pickup counted exactly once; solo behavior unchanged).
  Kills are attributed per player (strikes and turret shots included).
- **Selection sequence**: P1 character -> P1 weapon -> P2 character ->
  P2 weapon -> difficulty, with correct BACK destinations at every stage
  (P2's character BACK returns to P1's weapon screen; selections persist).
- **Character audit** to exact specs: Kensinger Balanced (renamed from
  "Balanced Kensinger"), Adkins (+50% attack speed strictly on Unarmed,
  +15% dodge, -50 range, -50 ranged damage, bonus Fist as a separate
  instance, Unarmed-only starting pool), Fair Bair (+25% attack speed all
  classes, -30% dodge, -10 engineering, -10 ranged damage, bonus Knife as
  a separate instance, Blade/Unarmed pool), Bair The Builder (guaranteed
  turret, +20 harvesting, +50% engineering gains, -30% pickup range,
  damage gains x0.25, Blade/Support pool, uncollected-material conversion
  shown in the wave results).
- **Bair is full size now**: every portrait's visible (opaque) bounds are
  measured at boot and all four characters render at the same apparent
  size — Bair was ~24% smaller visually and is scaled up uniformly; the
  select screens and gameplay stay consistent and nobody is shrunk.
- **Builder's Turret shop guarantee**: tracked per player — if eligible,
  it appears at least once every three shop visits, never overwriting
  locked entries or the Fist anchor; the counter resets on any appearance.
- **Toilet explosion performance**: hazards are pooled and capped (12 live
  waves, oldest recycled immediately), cloud gradients are cached instead
  of rebuilt every frame, rings draw cheap when many overlap, and hazards
  now hit BOTH players in co-op (previously only Player 1). 10 simultaneous
  flush waves render at ~0.36 ms/frame in duo.

## Run it

Open `index.html` in any browser, or serve the folder statically
(`python3 -m http.server`) and visit the URL. For GitHub Pages, push this
folder to a repository and enable Pages on the root.
