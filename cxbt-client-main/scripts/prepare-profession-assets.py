"""Export the original profession selection artwork, using select_character.lua sizes.

blender -b --factory-startup --python-exit-code 1 --python scripts/prepare-profession-assets.py
"""
import json
import shutil
import struct
import zlib
from pathlib import Path

import bpy
import numpy as np

CLIENT = Path(__file__).resolve().parents[1]
ROOT = CLIENT.parents[1]
OUTPUT = CLIENT / 'public/assets/profession'
OUTPUT.mkdir(parents=True, exist_ok=True)
sources = {}


def resize(pixels, width, height):
    xs = np.round(np.linspace(0, pixels.shape[1] - 1, width)).astype(int)
    ys = np.round(np.linspace(0, pixels.shape[0] - 1, height)).astype(int)
    return pixels[ys[:, None], xs]


def export(key, source, size=None, margins=None):
    path = next(root / source for root in (ROOT / 'AvatarStar_zh_cn_cache', ROOT / 'AvatarStar_cache')
                if (root / source).exists())
    image = bpy.data.images.load(str(path), check_existing=True)
    width, height = image.size
    pixels = np.empty(len(image.pixels), dtype=np.float32)
    image.pixels.foreach_get(pixels)
    pixels = (pixels.reshape(height, width, 4)[::-1].clip(0, 1) * 255).round().astype(np.uint8)
    bpy.data.images.remove(image)
    if size and margins:
        left, top, right, bottom = margins
        xs, ys = [0, left, width-right, width], [0, top, height-bottom, height]
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

    destination = OUTPUT / (key + '.png')
    destination.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>2I5B', width, height, 8, 6, 0, 0, 0))
                            + chunk(b'IDAT', zlib.compress(b''.join(b'\0' + row.tobytes() for row in pixels), 9)) + chunk(b'IEND', b''))
    sources[destination.name] = [path.relative_to(ROOT).as_posix()]
    return destination.name


ui = {
    'frame': export('frame', 'ui/skinf/skin_windowtop_background01_03.tga'),
    'title': export('title', 'ui/skinf/skin_chara_title2_1.tga'),
    'jobPill': export('jobPill', 'ui/skinf/skin_chara_bg01_title02.tga', (303, 67), (80, 0, 40, 0)),
    'description': export('description', 'ui/skinf/skin_chara_bg02_11.tga', (390, 210), (0, 23, 0, 23)),
    'statPill': export('statPill', 'ui/skinf/skin_chara_bg01_title01.tga', (216, 31), (30, 0, 30, 0)),
    'diamondOn': export('diamondOn', 'ui/skinf/skin_chara_icon_02.tga'),
    'diamondOff': export('diamondOff', 'ui/skinf/skin_chara_icon_01.tga'),
    'back': export('back', 'ui/skinf/skin_button_icon_backsmall.tga'),
    'settings': export('settings', 'ui/skinf/skin_button_icon_setupsmall.tga'),
    'sparkle': export('sparkle', 'vfx/textures/vfx_glow_8.dds'),
}
for state in ('normal', 'hover', 'down', 'disabled'):
    ui['button_' + state] = export('button_' + state, f'ui/skinf/skin_common_button01_{state}_10.tga', (124, 56), (40, 25, 40, 25))
    ui['create_' + state] = export('create_' + state, f'ui/skinf/skin_common_button01_{state}_10.tga', (255, 66), (40, 25, 40, 25))

# Reuse the Esc menu prepared for the lobby without duplicating its textures.
lobby_ui = json.loads((CLIENT / 'public/assets/lobby/catalog.json').read_text(encoding='utf-8'))['ui']
for key, path in lobby_ui.items():
    if key.startswith('settings'):
        ui[key] = '../lobby/' + path

jobs = {}
for job, number, icon, background, banner in (
    ('guardian', '02', '01', 'bg_normal02', 'skin_guardian_title'),
    ('assassin', '03', '03', 'bg_normal', 'skin_hunter_title'),
    ('gunner', '01', '02', 'bg_normal31', 'skin_rocker_title'),
    ('biochemist', '04', '04', 'bg_normal04', 'skin_chemicalsoldier_title'),
):
    jobs[job] = {
        'background': export(job + '-background', f'ui/skinf/{background}.dds'),
        'portrait': export(job + '-portrait', f'ui/skinf/skin_zhiye{number}_icon.tga'),
        'button': export(job + '-button', f'ui/skinf/skin_zhiye{number}_down.tga'),
        'banner': export(job + '-banner', f'ui/skinf/{banner}.tga'),
        'icon': export(job + '-icon', f'ui/skinf/skin_common_icon{icon}.tga'),
    }
sound = ROOT / 'AvatarStar_cache/audio/wav/ui/char_change.wav'
shutil.copyfile(sound, OUTPUT / 'char-change.wav')
sources['char-change.wav'] = [sound.relative_to(ROOT).as_posix()]
(OUTPUT / 'catalog.json').write_text(json.dumps({'ui': ui, 'jobs': jobs}, ensure_ascii=False, indent=2), encoding='utf-8')
(OUTPUT / 'sources.json').write_text(json.dumps(sources, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Prepared {len(sources)} profession selection assets.')
