#!/usr/bin/env python3
"""Generate PWA icons (192, 512, maskable, apple-touch, favicon) from assets/icon.png."""
from PIL import Image
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'icon.png')
OUT = os.path.join(ROOT, 'pwa')
os.makedirs(OUT, exist_ok=True)

img = Image.open(SRC).convert('RGBA')

def save(size, name, pad=0.0, bg=None):
    canvas = Image.new('RGBA', (size, size), bg if bg else (0, 0, 0, 0))
    inner = int(size * (1 - pad))
    im = img.resize((inner, inner), Image.LANCZOS)
    off = (size - inner) // 2
    canvas.paste(im, (off, off), im)
    canvas.save(os.path.join(OUT, name), 'PNG', optimize=True)
    print('wrote', name, size)

save(192, 'icon-192.png')
save(512, 'icon-512.png')
# maskable: safe zone 80% on solid brand background
save(192, 'icon-192-maskable.png', pad=0.14, bg=(30, 107, 255, 255))
save(512, 'icon-512-maskable.png', pad=0.14, bg=(30, 107, 255, 255))
# apple touch icon (no transparency)
apple = Image.new('RGB', (180, 180), (30, 107, 255))
im = img.resize((150, 150), Image.LANCZOS)
apple.paste(im, (15, 15), im)
apple.save(os.path.join(OUT, 'apple-touch-icon.png'), 'PNG', optimize=True)
print('wrote apple-touch-icon.png')
# favicon 32
img.resize((32, 32), Image.LANCZOS).save(os.path.join(OUT, 'favicon-32.png'), 'PNG', optimize=True)
print('done')
