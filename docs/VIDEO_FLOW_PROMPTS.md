# Google Flow Intro — Veo 3.1 Prompts & Assembly (Scene 0)

> 20-second cinematic opening: **MEMORY POISONED → BLOCKED → HEALED → BASTION**.
> Generate in Google Flow (`flow.google.com`, requires Google AI Pro/Ultra).
> Text is rendered in-Flow as short words only (Veo garbles sentences — the full
> pitch is voiceover, not on-screen text).

---

## Setup (once)

1. **Create Ingredients** (Nano Banana) to lock the visual style across clips:
   - **Ingredient A — "memory node"**: single luminous teal-white sphere, network
     node, on pure black.
   - **Ingredient B — "injection"**: the same node but corrupted — cracked, deep-red
     filaments crawling through it.
2. Save both to the project Asset Library so Clip 1 and Clip 2 reference the *same* nodes.

---

## Clip 1 — POISON (target ~8s)

**Mode**: Ingredients to Video (reference Ingredient A + B)
**Prompt**:
> Slow cinematic dolly push-in over a vast distributed network of glowing memory nodes
> on pure black. A single deep-red injection filament slithers into one node and
> spreads, corrupting neighboring nodes one by one. Dark, moody, volumetric light.
> Subtle glitch distortion as each node corrupts. No people, no text, no faces.
> Photoreal, high contrast, cinematic depth of field.

**Text overlay (in-Flow)**: `MEMORY POISONED` — appear at ~5s, hold to end.
**Audio**: low industrial hum + corruption crackle (Veo native).

**Camera**: Camera Controls → slow dolly forward (push-in), slight drift toward the
first corrupted node.

---

## Clip 2 — BLOCK + HEAL (target ~10s)

**Mode**: Extend / Scene Extension on Clip 1 (keeps the same nodes + corruption)
**Prompt (extend)**:
> Continue: a glowing SHA-256 chain / link seals across the memory network, and the
> red corruption wave slams into it and stops — blocked. Then a rewind-restore effect:
> the corrupted nodes snap back to clean, healthy teal, the chain re-seals, the network
> breathes calmly. Resolution and quiet.

**Text overlays (in-Flow)**: `BLOCKED` (at ~2s), then `HEALED` (at ~7s).
**Audio**: clean mechanical "click" on BLOCK, soft tonal resolve on HEAL.

**Camera**: Camera Controls → reverse/reverse-dolly on the heal section to sell the
time-travel rewind.

---

## Clip 3 — TITLE CARD (target ~2s)

**Mode**: Frames to Video (or generate a still with Nano Banana)
**Prompt / visual**: Bastion wordmark — `BASTION` in clean geometric white/teal
sans-serif on pure black, subtle glow. Static or gentle fade-in.

**Text**: `BASTION` (this IS the text — rendered in Flow or as the still itself).

---

## Assembly in Scenebuilder

1. Add Clip 1 → Clip 2 → Clip 3 in order.
2. Trim so the timeline is exactly **20s**: Clip 1 ≈ 8s, Clip 2 ≈ 10s, Clip 3 ≈ 2s.
3. Add a quick white/black fade between Clip 2 and Clip 3 (or straight cut).
4. Export 1080p (4K only if budget allows).

---

## Audio pass (in editor or Flow)

- Layer the pitch voiceover over Clip 1 (Scene 0 VO text in `VIDEO_SCRIPT.md`).
- Keep Veo-native SFX; duck them under the VO.
- Optional: light score via Flow Music (Lyria) — subtle, don't overpower narration.

---

## Acceptance checklist

- [ ] Total = 20s
- [ ] No fake UI/screenshots — abstract visuals only
- [ ] Short words render correctly: `MEMORY POISONED` / `BLOCKED` / `HEALED` / `BASTION`
- [ ] Full pitch sentence is VOICEOVER, not on-screen text
- [ ] 1080p export, no login required when public