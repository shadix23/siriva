"""Synthetic screen videos (256x256, 8 fps, 16 s, no audio) for visual/spatial/motor exercises; PIL frames -> mp4 via
imageio-ffmpeg. Simplified schematic animations of the task screen, NOT the real app UI. Updates manifest modalities."""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
import imageio.v2 as iio
ROOT = Path(__file__).resolve().parents[1]
V = ROOT/"stimuli"/"video"; V.mkdir(parents=True, exist_ok=True)
N, FPS, W = 128, 8, 256
COL = [(220,60,60),(60,160,80),(60,100,220),(230,180,40),(150,80,200),(40,180,190)]
def frame(ex, i, rng):
    im = Image.new("RGB", (W, W), (245,245,240)); d = ImageDraw.Draw(im); t = i/FPS
    if ex in ("spatial_sequence_recall", "route_recall_map", "digit_span_tap"):
        n = 3 if ex != "route_recall_map" else 5
        lit = int(t/1.5) % (n*n)
        for r in range(n):
            for c in range(n):
                x, y = 20+c*(216//n), 20+r*(216//n); s = 216//n-8
                on = (r*n+c) == (lit*7) % (n*n) and (t % 1.5) < 1.0
                d.rectangle([x, y, x+s, y+s], fill=COL[2] if on else (200,200,200))
        if ex == "digit_span_tap": d.text((110,110), str(int(t/1.2) % 10), fill=(0,0,0))
    elif ex in ("picture_pair_memory", "delayed_picture_recognition", "face_name_choice", "shopping_list_recall_visual"):
        for r in range(3):
            for c in range(4):
                x, y = 12+c*60, 20+r*76; k = (r*4+c) % 6
                up = ((int(t/1.5) + r*4+c) % 5 == 0)
                d.rectangle([x, y, x+50, y+66], fill=COL[k] if up else (90,90,120))
                if up: d.ellipse([x+10, y+18, x+40, y+48], fill=(255,255,255))
    elif ex in ("odd_one_out", "spot_the_difference", "card_sorting"):
        k = int(t/2)
        for j in range(4):
            x, y = 20+(j%2)*118, 20+(j//2)*118
            odd = j == k % 4
            sh = j % 3 if not odd else 3
            if sh == 0: d.ellipse([x,y,x+100,y+100], fill=COL[k%6])
            elif sh == 1: d.rectangle([x,y,x+100,y+100], fill=COL[k%6])
            elif sh == 2: d.polygon([(x+50,y),(x,y+100),(x+100,y+100)], fill=COL[k%6])
            else: d.polygon([(x+50,y),(x+100,y+50),(x+50,y+100),(x,y+50)], fill=COL[(k+3)%6])
    elif ex == "reaction_tap":
        k = int(t/1.0); x, y = (k*53) % 180+30, (k*97) % 180+30
        if (t % 1.0) < 0.7: d.ellipse([x-25,y-25,x+25,y+25], fill=(60,170,80) if k%3 else (220,60,60))
    elif ex == "sentence_building_cards":
        for j in range(5):
            off = max(0, 40 - int(t*8)) if j % 2 else 0
            d.rectangle([14+j*47, 100+off, 14+j*47+42, 140+off], fill=COL[j%6])
    else:
        d.rectangle([40,40,216,216], fill=COL[int(t/2)%6])
    return np.asarray(im)
rng = np.random.default_rng(0)
man = json.load(open(ROOT/"stimuli"/"manifest.json"))
VIS = ["sentence_building_cards","odd_one_out","picture_pair_memory","spatial_sequence_recall","delayed_picture_recognition",
       "route_recall_map","face_name_choice","shopping_list_recall_visual","digit_span_tap","spot_the_difference","card_sorting","reaction_tap"]
for ex in VIS:
    w = iio.get_writer(str(V/f"{ex}.mp4"), fps=FPS, codec="libx264", macro_block_size=None, quality=6)
    for i in range(N): w.append_data(frame(ex, i, rng))
    w.close()
    man[ex]["modalities"] = sorted(set(man[ex]["modalities"]) | {"video"}); man[ex]["video"] = {"duration_s": N/FPS, "how": "PIL schematic animation of the task screen (not real UI), 256x256 8 fps"}
    print(ex)
(ROOT/"stimuli"/"manifest.json").write_text(json.dumps(man, ensure_ascii=False, indent=1))
