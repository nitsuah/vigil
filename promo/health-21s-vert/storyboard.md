# health-21s-vert — storyboard

Reuses the brag-30s scenes (`"base": "brag-30s"` in spot.json): pipeline.sh renders brag-30s/compose.html and brag-30s/synth.py on this spot's own timeline, and each scene's choreography is time-mapped into its slot. Scene list, copy and poster live in spot.json; post text in share-copy.txt.

Vertical (1080×1920): this folder's compose.html is a shell that plays the landscape composition (staged as inner.html) full-width in the middle, with the brand above and burned-in captions below. Narration lines live in spot.json `narration`; `promo/tts/narrate.sh health-21s-vert` regenerates `vo/*.wav` (Kokoro via Hyperframes, in Docker) and prints each line's duration for its `dur` field. pipeline.sh mixes them over the music with `tts/mix.py`.
