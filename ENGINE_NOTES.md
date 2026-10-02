# AudioReactive Studio v0.19.0 · Engine notes

## Musical director

CONTROL owns one MusicalDirector. Preview and OUTPUT receive the same effective settings, cue ids, tempo estimate and beat serials. Manual visual and logo controls remain in separate unchanged state; either automation layer can be disabled independently.

A rising detected beat with usable audio level drives phrase counts. A median of recent valid beat intervals estimates the current period. Scene cues begin at 16 / 24 / 32 beats and last 2 / 4 beat intervals; transition completion requires the final detected beat. A fractional phase is capped before that beat, so silence cannot finish an automatic transition on a timer.

Curated color pairs, bounded camera and exposure profiles, small spins and limited feedback keep generative decisions coherent. Discrete changes occur on beat boundaries; numeric controls ease toward their targets. The next scene is compiled ahead of its cue when the renderer supports it.

Each renderer saves its existing visual and logo spin orientation on entry. Leaving AUTO restores those values along with manual control state. The ordinary manual scene transition handles the return to the selected manual scene.

The web bridge streams effective state over BroadcastChannel and limits automation localStorage checkpoints to one per second. Electron continues to use the existing IPC route.

## Arcane Living Tree 3.1

The filament tree has its own scene, perspective camera and multisampled target. That texture participates in the common visual transition and post stack.

Root curves form 56 inherited, tapered paths. Their signed travel distance is negative; trunk and branch distances are positive. Eight independent low-frequency wave fronts travel inward from the roots and then upward through the crown. New beats do not reset the previous front.

Geometric extension uses shared growth offsets at branch junctions. The growth control provides a restrained structural base; intensity, high-frequency envelopes and phrase energy add expansion, followed by a slower release. Particle emission samples the same deformed coordinates before particles move independently in world space.

Quality controls and adaptive resolution remain available. Matrix keeps its continuous falling clock; Vegvísir keeps its improved background and perspective controls.
