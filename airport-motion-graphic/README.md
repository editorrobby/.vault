# Airports — motion graphic

A 38-second 1920×1080 motion graphic for this script:

> Airports don't feel like real places. They feel like waiting rooms outside of reality. Think about it.
> The second you enter an airport, normal life kind of disappears. Time zones stop making sense.
> It can be 3 a.m. and it will be fully bright inside. People are sleeping on the floor, eating noodles
> for breakfast, drinking coffee at midnight. Nobody questions it.

The style follows the reference: flat vector illustration, warm golden-hour light, light shafts,
bokeh and bloom, stepped "pixel" clouds, silhouetted travellers, slow parallax camera moves and thin
spaced-out uppercase titles.

## Files

| File | What it is |
|---|---|
| `output/airports.mp4` | Final video with on-screen captions and soundtrack |
| `output/airports_clean.mp4` | Same video without captions (for laying under a voiceover) |
| `output/music.wav` | The soundtrack on its own (ambient pad, music box, chime and sound effects) |
| `index.html` + `anim.js` | The animation source. Open `index.html` in a browser for a live preview (`?notext` hides captions) |
| `render.js` | Renders frames with headless Chromium and encodes them with ffmpeg |
| `music.py` | Generates the soundtrack (needs numpy) |

## Scene and voiceover timing

| Time | Line | Visual |
|---|---|---|
| 0:00 – 0:04.4 | Airports don't feel like real places. | Valley airport at golden hour; a jet climbs over the camera |
| 0:04.4 – 0:09.0 | They feel like waiting rooms outside of reality. | Empty gate, rows of seats, a lone traveller, side dolly |
| 0:09.0 – 0:11.2 | Think about it. | Traveller at the window as a plane takes off (column wipe in) |
| 0:11.2 – 0:16.2 | The second you enter an airport, normal life kind of disappears. | Doors open; the street (taxi, bench, trees, bus stop) dissolves into pixels; white-out |
| 0:16.2 – 0:19.4 | Time zones stop making sense. | Wall of world clocks spinning at different, accelerating speeds |
| 0:19.4 – 0:24.0 | It can be 3 a.m. and it will be fully bright inside. | Night outside, board reads 03:00, ceiling lights snap on |
| 0:24.0 – 0:26.6 | People are sleeping on the floor, | Sleepers on backpacks, a dozer against a pillar |
| 0:26.6 – 0:29.0 | eating noodles for breakfast, | Dawn; a traveller eats ramen from a cup |
| 0:29.0 – 0:31.6 | drinking coffee at midnight. | Clock reads 00:00; coffee raised (column wipe in) |
| 0:31.6 – 0:38.0 | Nobody questions it. | Busy concourse; outside, day and night race past; fade out |

## Re-rendering

```bash
python3 music.py              # writes output/music.wav
node render.js                # writes output/airports.mp4
node render.js --notext       # writes output/airports_clean.mp4
```

To change timing, edit the `SCENES` table at the bottom of `anim.js` (and the matching times in `music.py`).
