"""Prepare the original Esc menu and practice-list skins with Blender's image reader.

blender -b --factory-startup --python-exit-code 1 --python scripts/prepare-interface-assets.py
"""
import json
import struct
import zlib
from pathlib import Path

import bpy
import numpy as np

CLIENT = Path(__file__).resolve().parents[1]
ROOT = CLIENT.parents[1]
OUTPUT = CLIENT / 'public/assets/lobby'
catalog = json.loads((OUTPUT / 'catalog.json').read_text(encoding='utf-8'))
sources = json.loads((OUTPUT / 'sources.json').read_text(encoding='utf-8'))


def resize(image, width, height):
    x = np.round(np.linspace(0, image.shape[1] - 1, width)).astype(int)
    y = np.round(np.linspace(0, image.shape[0] - 1, height)).astype(int)
    return image[y[:, None], x]


def export(key, filename, size=None, margins=None):
    path = next(root / 'ui/skinf' / filename for root in (ROOT / 'AvatarStar_zh_cn_cache', ROOT / 'AvatarStar_cache')
                if (root / 'ui/skinf' / filename).exists())
    image = bpy.data.images.load(str(path), check_existing=True)
    width, height = image.size
    pixels = np.empty(len(image.pixels), dtype=np.float32)
    image.pixels.foreach_get(pixels)
    pixels = (pixels.reshape(height, width, 4)[::-1].clip(0, 1) * 255).round().astype(np.uint8)
    bpy.data.images.remove(image)
    if size and margins:
        left, top, right, bottom = margins
        xs, ys = [0, left, width-right, width], [0, top, height-bottom, height]
        # Some original skins use adjacent edge slices with a zero-width center.
        # Repeat the nearest border pixel for the expanded middle region.
        dx, dy = [0, left, size[0]-right, size[0]], [0, top, size[1]-bottom, size[1]]
        canvas = np.zeros((size[1], size[0], 4), dtype=np.uint8)
        for y in range(3):
            for x in range(3):
                if dx[x+1] > dx[x] and dy[y+1] > dy[y]:
                    patch = pixels[min(ys[y], height-1):max(ys[y+1], ys[y]+1), min(xs[x], width-1):max(xs[x+1], xs[x]+1)]
                    canvas[dy[y]:dy[y+1], dx[x]:dx[x+1]] = resize(patch, dx[x+1]-dx[x], dy[y+1]-dy[y])
        pixels = canvas
    elif size:
        pixels = resize(pixels, *size)
    height, width = pixels.shape[:2]
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    destination = OUTPUT / 'ui' / (key + '.png')
    destination.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>2I5B', width, height, 8, 6, 0, 0, 0))
                            + chunk(b'IDAT', zlib.compress(b''.join(b'\0' + row.tobytes() for row in pixels), 9)) + chunk(b'IEND', b''))
    catalog['ui'][key] = destination.relative_to(OUTPUT).as_posix()
    sources[catalog['ui'][key]] = [path.relative_to(ROOT).as_posix()]


export('settingsPanel', 'skin_common_background31.tga', (251, 425), (35, 35, 35, 35))
export('settingsInner', 'skin_playgame_bg13.tga', (222, 350), (20, 20, 20, 20))
export('practiceTitleTab', 'skin_playgame_bg29.tga', (354, 67), (70, 0, 70, 0))
export('practiceModeFrame', 'skin_playgame_bg13.tga', (850, 77), (30, 30, 30, 30))
for state in ('normal', 'hover', 'down', 'disabled'):
    export('settingsButton_' + state, 'skin_common_button_' + state + '.tga', (193, 37), (20, 18, 20, 18))
    export('settingsClose_' + state, 'skin_info_closebutton_' + state + '.tga')
    export('practiceWatch_' + state, 'skin_common_button02_' + state + '_10.tga', (128, 56), (40, 25, 40, 25))
    export('practiceListRow_' + state, 'skin_playgame_bg01_' + state + '.tga', (813, 41), (66, 8, 8, 8))
for number in (6, 3, 5, 2, 4, 8, 10):
    for state in ('normal', 'hover'):
        export(f'skin_playgame_mode{number}_{state}', f'skin_playgame_mode{number}_{state}.tga')
    catalog['ui'][f'skin_playgame_mode{number}_down'] = catalog['ui'][f'skin_playgame_mode{number}_hover']
for key, filename in {
    'practiceScrollUp': 'skin_gam_scrollbar2_button_up_normal.tga',
    'practiceScrollDown': 'skin_gam_scrollbar2_button_down_normal.tga',
    'practiceScrollTrack': 'skin_gam_scrollbar2_bg.tga',
    'practiceScrollThumb': 'skin_gam_scrollbar2_button_normal.tga',
}.items():
    export(key, filename)
(OUTPUT / 'catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
(OUTPUT / 'sources.json').write_text(json.dumps(sources, ensure_ascii=False, indent=2), encoding='utf-8')
print('Prepared settings and practice interface skins.')
