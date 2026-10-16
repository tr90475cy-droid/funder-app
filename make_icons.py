from PIL import Image, ImageDraw, ImageFont
import os

os.makedirs('static/icons', exist_ok=True)

BG = '#22252D'   # slate background
FG = '#F0B24D'   # FUNDAR gold


def load_font(size):
    candidates = [
        'arialbd.ttf', 'Arial Bold.ttf', 'DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        'C:/Windows/Fonts/arialbd.ttf',
        'C:/Windows/Fonts/arial.ttf',
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


def draw_letter(draw, size, pad_ratio=0.0):
    font_size = int(size * (0.62 - pad_ratio * 2))
    font = load_font(font_size)
    bbox = draw.textbbox((0, 0), 'F', font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = (size - tw) // 2 - bbox[0]
    y = (size - th) // 2 - bbox[1]
    draw.text((x, y), 'F', fill=FG, font=font)


def make_icon(size, path, pad_ratio=0.0, rounded=True):
    img = Image.new('RGB', (size, size), BG)
    draw = ImageDraw.Draw(img)
    if rounded:
        radius = int(size * 0.22)
        draw.rounded_rectangle([0, 0, size, size], radius=radius, fill=BG)
    draw_letter(draw, size, pad_ratio)
    img.save(path, 'PNG')
    print(f'✓ {path} ({size}x{size})')


# Regular icons
make_icon(192, 'static/icons/icon-192.png', rounded=True)
make_icon(512, 'static/icons/icon-512.png', rounded=True)

# Maskable (full bleed, letter smaller for safe area)
make_icon(512, 'static/icons/icon-maskable-512.png', pad_ratio=0.15, rounded=False)

# Apple touch icon (no rounded corners)
make_icon(180, 'static/icons/apple-touch-icon.png', rounded=False)

# Favicon
make_icon(32, 'static/icons/favicon-32.png', rounded=False)
make_icon(16, 'static/icons/favicon-16.png', rounded=False)

print('\n✅ All icons generated in static/icons/')