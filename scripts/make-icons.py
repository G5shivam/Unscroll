"""Generate Unscroll's app icons: a navy tile, a highlighter stroke and a bold U."""
from PIL import Image, ImageDraw, ImageFont
import os, sys

ROOT = os.path.join(os.path.dirname(__file__), '..')
FONT = os.path.join(ROOT, 'node_modules/@expo-google-fonts/bricolage-grotesque/800ExtraBold/BricolageGrotesque_800ExtraBold.ttf')
INK, HIGHLIGHTER, WHITE = (20, 33, 61, 255), (245, 221, 75, 255), (243, 245, 249, 255)

def mark(size, bg, letter, stroke, scale=1.0):
    img = Image.new('RGBA', (size, size), bg)
    d = ImageDraw.Draw(img)
    s = size * scale
    cx, cy = size / 2, size / 2
    # Highlighter stroke, slightly rotated, behind the lower half of the letter.
    stroke_img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    sd = ImageDraw.Draw(stroke_img)
    w, h = s * 0.58, s * 0.15
    top = cy + s * 0.02
    sd.rounded_rectangle([cx - w / 2, top, cx + w / 2, top + h], radius=h * 0.22, fill=stroke)
    stroke_img = stroke_img.rotate(3, center=(cx, top + h / 2), resample=Image.BICUBIC)
    img.alpha_composite(stroke_img)
    font = ImageFont.truetype(FONT, int(s * 0.56))
    bbox = d.textbbox((0, 0), 'U', font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text((cx - tw / 2 - bbox[0], cy - th / 2 - bbox[1] - s * 0.02), 'U', font=font, fill=letter)
    return img

out = os.path.join(ROOT, 'assets')
mark(1024, INK, WHITE, HIGHLIGHTER).convert('RGB').save(os.path.join(out, 'icon.png'))
# Android adaptive icon: foreground on transparent, kept inside the 66% safe zone.
mark(1024, (0, 0, 0, 0), WHITE, HIGHLIGHTER, scale=0.62).save(os.path.join(out, 'android-icon-foreground.png'))
Image.new('RGB', (1024, 1024), INK[:3]).save(os.path.join(out, 'android-icon-background.png'))
mono = mark(1024, (0, 0, 0, 0), (255, 255, 255, 255), (255, 255, 255, 90), scale=0.62)
mono.save(os.path.join(out, 'android-icon-monochrome.png'))
mark(1024, (0, 0, 0, 0), INK, HIGHLIGHTER, scale=0.5).save(os.path.join(out, 'splash-icon.png'))
mark(48, INK, WHITE, HIGHLIGHTER).convert('RGB').save(os.path.join(out, 'favicon.png'))
print('icons written')
