"""Builds website/assets/demo/anne-marie.webp from a real simulated run (sim-runs/anne-marie):
each frame = the screen Barnaby saw + his real words (and the teaching ring when he showed one).
Run: python website/tools/make_demo.py
"""
import json, os, textwrap
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RUN = os.path.join(ROOT, 'sim-runs', 'anne-marie')
OUT = os.path.join(ROOT, 'website', 'assets', 'demo')
W, SHOT_H, BAR_H = 960, 600, 170
F = 'C:/Windows/Fonts/'
font = ImageFont.truetype(F + 'segoeui.ttf', 26)
bold = ImageFont.truetype(F + 'seguisb.ttf', 24)

ev = [json.loads(l) for l in open(os.path.join(RUN, 'events.jsonl'), encoding='utf-8')]
shots = [e for e in ev if e.get('type') == 'screenshot']


def words_between(t0, t1):
    """What Barnaby said/asked and what the person did between two screenshots."""
    out, ring = [], None
    for e in ev:
        if not (t0 <= e['t'] < t1):
            continue
        if e['type'] == 'say' and e.get('text'):
            out.append(('Barnaby', e['text']))
        elif e['type'] == 'ask' and e.get('question'):
            q = e['question']
            if e.get('choices'):
                q += '  [' + ' | '.join(e['choices']) + ']'
            out.append(('Barnaby', q))
        elif e['type'] == 'answer':
            out.append(('You', str(e.get('answer'))))
        elif e['type'] == 'person':
            out.append(('You', {'click': 'click', 'type': 'type'}.get(e.get('did'), e.get('did', '')) + ' ' + str(e.get('why', ''))))
        elif e['type'] == 'highlight' and ring is None:
            ring = e.get('rect')
    return out, ring


def ring(d, rect, sx, sy):
    x, y, w, h = rect
    x0, y0, x1, y1 = x * sx - 12, y * sy - 12, (x + w) * sx + 12, (y + h) * sy + 12
    d.rounded_rectangle([x0 - 3, y0 - 3, x1 + 3, y1 + 3], radius=16, outline='#000000', width=3)
    d.rounded_rectangle([x0, y0, x1, y1], radius=14, outline='#FFD000', width=6)
    d.rounded_rectangle([x0 + 6, y0 + 6, x1 - 6, y1 - 6], radius=10, outline='#000000', width=3)


frames, durations = [], []
for i, s in enumerate(shots):
    t1 = shots[i + 1]['t'] if i + 1 < len(shots) else 10 ** 12
    lines, r = words_between(s['t'], t1)
    img = Image.open(os.path.join(RUN, s['file'])).convert('RGB')
    sx, sy = W / img.width, SHOT_H / img.height
    img = img.resize((W, SHOT_H), Image.LANCZOS)
    canvas = Image.new('RGB', (W, SHOT_H + BAR_H), '#F7F4EE')
    canvas.paste(img, (0, 0))
    d = ImageDraw.Draw(canvas)
    if r:
        ring(d, r, sx, sy)
    d.rectangle([0, SHOT_H, W, SHOT_H + BAR_H], fill='#FFF8E1')
    d.line([0, SHOT_H, W, SHOT_H], fill='#6B6B6B', width=2)
    y = SHOT_H + 14
    for who, text in lines[-3:]:
        label = who + ': '
        d.text((24, y), label, font=bold, fill='#0B3566' if who == 'Barnaby' else '#1C5E2B')
        lx = 24 + d.textlength(label, font=bold)
        wrapped = textwrap.wrap(text, width=62)[:2]
        for j, part in enumerate(wrapped):
            d.text((lx, y - 2 + j * 32), part, font=font, fill='#1B1B1B')
        y += 32 * max(1, len(wrapped)) + 6
        if y > SHOT_H + BAR_H - 30:
            break
    frames.append(canvas)
    durations.append(3200 if lines else 1600)

os.makedirs(OUT, exist_ok=True)
frames[0].save(os.path.join(OUT, 'anne-marie.webp'), save_all=True, append_images=frames[1:],
               duration=durations, loop=0, quality=72, method=6)
frames[0].save(os.path.join(OUT, 'anne-marie-poster.jpg'), quality=85)
print(len(frames), 'frames', sum(durations) / 1000, 's',
      os.path.getsize(os.path.join(OUT, 'anne-marie.webp')) // 1024, 'KB')
