# projectM study notes used in v0.13

AudioReactive Studio v0.13 does **not** embed libprojectM, link against it, or ship `.milk` presets.

The attached libprojectM 4.1.4 source was used as an architectural reference. The concepts adapted independently are:

- instant + attenuated band values (`FrameAudioData.hpp`, `Loudness.cpp`)
- visual echo / previous-frame memory (`VideoEcho.cpp`)
- static transition randomness vs per-frame randomness (`PresetTransition.cpp`)
- visual waveform concepts (`Waveform*` and `CustomWaveform*`)

This keeps the current Three.js/WebGL architecture and avoids adding a C++/WASM dependency at this stage.
