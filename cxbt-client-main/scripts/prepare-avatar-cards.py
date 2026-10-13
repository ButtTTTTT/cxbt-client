"""Extract appearance cards from packet logs and build their original assets.

Run with Blender (bpy reads the cache DDS/TGA files; NumPy composites textures):
  blender -b --factory-startup --python-exit-code 1 --python scripts/prepare-avatar-cards.py
Optional arguments after --: --workspace PATH --logs FILE [FILE ...]
No packet code is executed, and player account/profile fields are not exported.
"""
from pathlib import Path
import argparse
import ast
import copy
import hashlib
import json
import re
import struct
import sys
import zlib

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

CLIENT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--workspace', type=Path, default=CLIENT.parents[1])
parser.add_argument('--logs', nargs='+', type=Path)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
ROOT = args.workspace.resolve()
CACHE = ROOT / 'AvatarStar_cache'
AVATAR = CACHE / 'mesh/character/thirdperson/avatar'
OUTPUT = CLIENT / 'public/assets/avatar-cards'
OUTPUT.mkdir(parents=True, exist_ok=True)
sources = {}
image_cache = {}
model_cache = {}
texture_cache = {}


def packets(path):
    data = bytearray()
    for line in path.read_text(encoding='utf-8-sig', errors='replace').splitlines():
        match = re.match(r'^([0-9A-Fa-f]{8})\s+((?:[0-9A-Fa-f]{2}\s+){0,15}[0-9A-Fa-f]{2})(?:\s{2,}|$)', line)
        if not match:
            continue
        if match[1] == '00000000' and data:
            yield bytes(data).decode('utf-8', errors='replace')
            data.clear()
        if int(match[1], 16) != len(data):
            raise ValueError(f'Non-contiguous packet in {path.name}')
        data.extend(bytes.fromhex(match[2]))
    if data:
        yield bytes(data).decode('utf-8', errors='replace')


def parts(value):
    if not value:
        return []
    # Only literal, positional tables are accepted, never Lua expressions.
    literal = value.replace('{', '[').replace('}', ']')
    literal = re.sub(r'\bfalse\b', 'False', literal)
    literal = re.sub(r'\btrue\b', 'True', literal)
    result = ast.literal_eval(literal)
    if not result:
        return []
    result = result if isinstance(result[0], list) else [result]
    for entry in result:
        if not isinstance(entry[0], str) or not re.fullmatch(r'[a-zA-Z0-9_]+', entry[0]):
            raise ValueError('Invalid resource name')
        if not all(isinstance(v, (str, int, float, bool)) for v in entry):
            raise ValueError('Invalid appearance value')
    return result


def appearances():
    shop, equipped = [], []
    seen = set()
    logs = args.logs or sorted(ROOT.glob('log-2026-10-13*.txt'))
    for path in logs:
        path = path if path.is_absolute() else ROOT / path
        for index, packet in enumerate(packets(path)):
            if 'items' in packet and re.search(r'\bavatar\s*=', packet):
                for block in re.split(r'\bsid\s*=\s*', packet)[1:]:
                    sid = re.match(r'"([0-9]+)"', block)[1]
                    display = re.search(r'display\s*=\s*"([^"]+)"', block)[1]
                    match = re.search(r'\bavatar\s*=\s*\{(.*?)\n\s*\}', block, re.S)
                    if match:
                        avatar = dict(re.findall(r'(\w+)\s*=\s*"([^"]*)"', match[1]))
                        if not any(item['id'] == 'card-' + sid for item in shop):
                            shop.append({'id': 'card-' + sid, 'display': display, 'avatar': avatar,
                                     'source': {'log': path.name, 'packet': index, 'sid': sid}})
            match = re.search(r'\bequipAvatar\s*=\s*\{(.*?)\n\s*\}', packet, re.S)
            if match:
                avatar = dict(re.findall(r'(\w+)\s*=\s*"([^"]*)"', match[1]))
                key = hashlib.sha256(json.dumps({k: parts(v) for k, v in avatar.items()}, sort_keys=True).encode()).hexdigest()[:12]
                if key not in seen:
                    seen.add(key)
                    equipped.append({'id': 'log-' + key, 'avatar': avatar,
                                     'source': {'log': path.name, 'packet': index}})
    if not shop and not equipped:
        raise ValueError('No appearance definitions found in logs')
    shop_keys = {json.dumps({k: parts(v) for k, v in item['avatar'].items()}, sort_keys=True) for item in shop}
    return shop + [item for item in equipped if json.dumps({k: parts(v) for k, v in item['avatar'].items()}, sort_keys=True) not in shop_keys]


def read_image(path):
    if path not in image_cache:
        image = bpy.data.images.load(str(path), check_existing=True)
        pixels = np.empty(len(image.pixels), dtype=np.float32)
        image.pixels.foreach_get(pixels)
        width, height = image.size
        image_cache[path] = pixels.reshape(height, width, 4)[::-1].copy()
        bpy.data.images.remove(image)
    return image_cache[path].copy()


def resize(image, width, height):
    ys = np.linspace(0, image.shape[0] - 1, height)
    xs = np.linspace(0, image.shape[1] - 1, width)
    return sample(image, *np.meshgrid(xs, ys))


def sample(image, xs, ys):
    x0 = np.floor(xs).astype(int).clip(0, image.shape[1] - 1)
    y0 = np.floor(ys).astype(int).clip(0, image.shape[0] - 1)
    x1 = (x0 + 1).clip(0, image.shape[1] - 1)
    y1 = (y0 + 1).clip(0, image.shape[0] - 1)
    dx, dy = (xs - x0)[..., None], (ys - y0)[..., None]
    return ((image[y0, x0] * (1-dx) + image[y0, x1] * dx) * (1-dy)
            + (image[y1, x0] * (1-dx) + image[y1, x1] * dx) * dy)


def png(image, name, provenance):
    path = OUTPUT / (name + '.png')
    path.parent.mkdir(parents=True, exist_ok=True)
    pixels = (image.clip(0, 1) * 255).astype(np.uint8)
    height, width = pixels.shape[:2]
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    rows = b''.join(b'\0' + row.tobytes() for row in pixels)
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>2I5B', width, height, 8, 6, 0, 0, 0))
                     + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b''))
    sources[path.relative_to(OUTPUT).as_posix()] = provenance
    return '../avatar-cards/' + path.relative_to(OUTPUT).as_posix()


def diffuse(resource):
    matches = list(AVATAR.rglob('tex_' + resource + '_c.dds'))
    if not matches:
        raise FileNotFoundError('Texture: ' + resource)
    return matches[0]


def recolor(path, palette):
    image = read_image(path)
    mask_path = path.with_name(path.name.replace('_c.dds', '_m.dds'))
    if mask_path.exists():
        mask = resize(read_image(mask_path), image.shape[1], image.shape[0])[..., :3]
        mask /= np.maximum(mask.sum(axis=2, keepdims=True), 1)
        multiplier = 1 - mask.sum(axis=2, keepdims=True) + mask @ (np.asarray(palette).reshape(3, 3) / 128)
        image[..., :3] *= multiplier
    return image


config = json.loads((CLIENT / 'public/assets/creation/config.json').read_text(encoding='utf-8'))
base_glb = (CLIENT / 'public/assets/creation' / config['models']['body01']).read_bytes()
json_length = struct.unpack_from('<I', base_glb, 12)[0]
base_doc = json.loads(base_glb[20:20 + json_length])
base_bin = base_glb[28 + json_length:]
rig = base_doc['skins'][0]
bone_indices = {base_doc['nodes'][n]['name']: i for i, n in enumerate(rig['joints'])}


def mesh(resource, transform=None, side=None):
    key = (resource, str(transform), side)
    if key in model_cache:
        return model_cache[key]
    candidates = list(AVATAR.rglob('mesh_' + resource + (('_' + side) if side else '') + '.mesh'))
    if not candidates:
        raise FileNotFoundError('Mesh: ' + resource)
    path = candidates[0]
    data = path.read_bytes()
    offset = 12
    names = []
    for _ in range(struct.unpack_from('<I', data, 8)[0]):
        size = struct.unpack_from('<I', data, offset)[0]
        offset += 4
        names.append(data[offset:offset + size].decode('ascii'))
        offset += size
    bounds = struct.unpack_from('<I', data, offset)[0]
    offset += 4 + bounds * 24
    submeshes, triangles, vertices, _, _, _, layout = struct.unpack_from('<7I', data, offset)
    if submeshes != 1 or layout != 1:
        raise ValueError(f'Unsupported mesh layout: {path}')
    offset += 29
    byte_size = struct.unpack_from('<I', data, offset)[0]
    offset += 4
    if byte_size != vertices * 64:
        raise ValueError(f'Unsupported vertex stride: {path}')
    def attr(code, columns, start):
        return np.ndarray((vertices, columns), dtype=code, buffer=data, offset=offset + start,
                          strides=(64, np.dtype(code).itemsize)).copy()
    position = attr('<f4', 3, 0)
    normal = attr('<f2', 3, 12).astype('<f4')
    normal /= np.maximum(np.linalg.norm(normal, axis=1, keepdims=True), 1e-8)
    uv = attr('<f2', 2, 56).astype('<f4')
    joints = attr('u1', 4, 36)
    weights = attr('<f4', 4, 40)
    remap = np.array([bone_indices[name] for name in names] + [0] * (256 - len(names)), dtype='<u2')
    joints = remap[joints]
    if transform:
        translation, rotation, scale = transform
        q = Quaternion((rotation[3], *rotation[:3]))
        matrix = Matrix.LocRotScale(Vector(translation), q, Vector(scale))
        rotation_matrix = np.array(q.to_matrix(), dtype='<f4')
        position = (np.column_stack((position, np.ones(vertices))) @ np.array(matrix).T)[:, :3].astype('<f4')
        normal = (normal @ rotation_matrix.T).astype('<f4')
    index_offset = offset + byte_size
    index_size = struct.unpack_from('<I', data, index_offset)[0]
    if index_size != triangles * 3 * 4:
        raise ValueError(f'Invalid indices: {path}')
    indices = np.frombuffer(data, dtype='<u4', count=triangles * 3, offset=index_offset + 4)
    if indices.max() >= vertices:
        raise ValueError(f'Out-of-range indices: {path}')
    indices = indices.astype('<u2')
    document = {'asset': {'version': '2.0', 'generator': 'AvatarStar cache card importer'},
                'nodes': copy.deepcopy(base_doc['nodes']), 'skins': [copy.deepcopy(rig)],
                'accessors': [], 'bufferViews': [], 'buffers': [], 'materials': [{'pbrMetallicRoughness': {'metallicFactor': 0, 'roughnessFactor': .85}}]}
    for node in document['nodes']:
        node.pop('mesh', None)
        node.pop('skin', None)
    binary = bytearray()
    def accessor(array, code, kind, target=None, bounds=False):
        binary.extend(b'\0' * (-len(binary) % 4))
        view = {'buffer': 0, 'byteOffset': len(binary), 'byteLength': array.nbytes}
        if target:
            view['target'] = target
        binary.extend(array.tobytes())
        document['bufferViews'].append(view)
        result = {'bufferView': len(document['bufferViews']) - 1, 'componentType': code, 'count': len(array), 'type': kind}
        if bounds:
            result.update(min=array.min(axis=0).tolist(), max=array.max(axis=0).tolist())
        document['accessors'].append(result)
        return len(document['accessors']) - 1
    inv_acc = base_doc['accessors'][rig['inverseBindMatrices']]
    inv_view = base_doc['bufferViews'][inv_acc['bufferView']]
    inv_offset = inv_view.get('byteOffset', 0) + inv_acc.get('byteOffset', 0)
    inverse = np.frombuffer(base_bin, dtype='<f4', count=inv_acc['count'] * 16, offset=inv_offset).reshape(-1, 16)
    document['skins'][0]['inverseBindMatrices'] = accessor(inverse, 5126, 'MAT4')
    attributes = {name: accessor(array, code, kind, 34962, name == 'POSITION') for name, array, code, kind in (
        ('POSITION', position, 5126, 'VEC3'), ('NORMAL', normal, 5126, 'VEC3'), ('TEXCOORD_0', uv, 5126, 'VEC2'),
        ('JOINTS_0', joints, 5123, 'VEC4'), ('WEIGHTS_0', weights, 5126, 'VEC4'))}
    document['meshes'] = [{'name': resource, 'primitives': [{'attributes': attributes, 'indices': accessor(indices, 5123, 'SCALAR', 34963), 'material': 0}]}]
    node_index = len(document['nodes'])
    document['nodes'].append({'name': resource, 'mesh': 0, 'skin': 0})
    document['scenes'] = [{'nodes': [rig['skeleton'], node_index]}]
    document['scene'] = 0
    document['buffers'] = [{'byteLength': len(binary)}]
    binary.extend(b'\0' * (-len(binary) % 4))
    encoded = json.dumps(document, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    filename = resource + ('-' + side if side else '') + ('-' + hashlib.sha256(str(transform).encode()).hexdigest()[:8] if transform else '')
    dest = OUTPUT / 'models' / (filename + '.glb')
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(struct.pack('<4sII', b'glTF', 2, 28 + len(encoded) + len(binary)) + struct.pack('<I4s', len(encoded), b'JSON') + encoded
                    + struct.pack('<I4s', len(binary), b'BIN\0') + binary)
    sources[dest.relative_to(OUTPUT).as_posix()] = [path.relative_to(ROOT).as_posix(), 'assets/creation/' + config['models']['body01']]
    model_cache[key] = '../avatar-cards/' + dest.relative_to(OUTPUT).as_posix()
    return model_cache[key]


def textured_part(entry, transform=None, side=None, color_offset=4):
    model = mesh(entry[0], transform, side)
    raw = list(AVATAR.rglob('mesh_' + entry[0] + (('_' + side) if side else '') + '.mesh'))[0].read_bytes()
    texture_path = re.search(rb'/mesh/[^\x00]+?_c\.dds', raw)
    if texture_path is None:
        path = diffuse(entry[0].removesuffix('_lod0'))
    else:
        path = CACHE / texture_path[0].decode('ascii').lstrip('/')
    palette = entry[color_offset:color_offset + 9]
    signature = hashlib.sha256((str(path) + str(palette)).encode()).hexdigest()[:12]
    if signature not in texture_cache:
        texture_cache[signature] = png(recolor(path, palette), 'textures/part-' + signature, [path.relative_to(ROOT).as_posix()])
    return {'model': model, 'texture': texture_cache[signature]}


def face(entry, name, eye=False, right=False):
    if not entry:
        return png(np.zeros((512, 512, 4)), name, [])
    path = diffuse(entry[0])
    color_offset = 13 if eye else 8
    image = recolor(path, entry[color_offset:color_offset + 9])
    width, height = (128, 128) if eye else (256, 128)
    tile = resize(image, 512, 512)[:height, :width]
    if eye:
        tile = tile[:, ::-1]
    x, y, angle, sx, sy = entry[7:12] if eye and right else entry[2:7]
    # The game stores face decal offsets around UV (0.5, 0.5).
    grid_y, grid_x = np.mgrid[:512, :512]
    dx, dy = grid_x - (0.5 - x) * 512, grid_y - (0.5 - y) * 512
    cosine, sine = np.cos(angle), np.sin(angle)
    # scale_x/y multiply the shader UV coordinates, so larger values shrink
    # the face element. Use the atlas tile dimensions when baking that transform.
    tx = (dx * cosine - dy * sine) * max(abs(sx), .001) + width / 2
    ty = (dx * sine + dy * cosine) * max(abs(sy), .001) + height / 2
    result = sample(tile, tx.clip(0, width - 1), ty.clip(0, height - 1))
    result[(tx < 0) | (tx >= width) | (ty < 0) | (ty >= height)] = 0
    return png(result, name, [path.relative_to(ROOT).as_posix()])


texts = dict(re.findall(r'\b(\w+)\s*=\s*"([^"\n]*)"', (CACHE / 'scripts/game_text.lua').read_text(encoding='utf-8', errors='replace')))
texts.update({
    'id_datalist_Steam_Magician': '蒸气男爵',
    'id_datalist_Steam_Blacksmith': '蒸气爷爷',
    'id_datalist_Tin_Man': 'TV怪客',
    'UI_abilities_name_snake': '斯内克',
    'UI_abilities_name_laola': '劳拉',
    'UI_avatar_aosiding_avatar': '奥斯丁',
    'UI_avatar_dalianna_avatar': '达莉安娜',
    'id_avatar_luzhantezhongbing': '陆战特种兵',
    'id_avatar_tezhongbing': '特种兵',
})
png(read_image(CACHE / 'ui/skinf/skin_avatarcard.tga'), 'card-frame', ['AvatarStar_cache/ui/skinf/skin_avatarcard.tga'])
thumbnail_index = OUTPUT / 'thumbnails/index.json'
thumbnail_signatures = json.loads(thumbnail_index.read_text(encoding='utf-8')) if thumbnail_index.exists() else {}
generator_hash = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
cards = []
for index, card in enumerate(appearances()):
    avatar = card.pop('avatar')
    data = {slot: parts(value) for slot, value in avatar.items()}
    skin = data.get('skin', [])
    skin_color = skin[0][4:7] if skin else [244, 198, 145]
    body = np.ones((1024, 1024, 4), dtype=np.float32)
    body[..., :3] = np.asarray(skin_color) / 255
    body_sources = []
    if skin and skin[0][0] != 'onecolor_skin':
        path = diffuse(skin[0][0])
        body = resize(recolor(path, skin[0][4:13]), 1024, 1024)
        body_sources.append(path.relative_to(ROOT).as_posix())
    dress = [entry for slot in ('underwear', 'outerwear', 'trousers', 'glove', 'shoes') for entry in data.get(slot, [])]
    for entry in sorted(dress, key=lambda entry: entry[2]):
        path = diffuse(entry[0])
        layer = resize(recolor(path, entry[4:13]), 1024, 1024)
        body[..., :3] = layer[..., :3] * layer[..., 3:] + body[..., :3] * (1 - layer[..., 3:])
        body_sources.append(path.relative_to(ROOT).as_posix())
    preset = {'id': card['id'], 'skinColor': '#' + ''.join(f'{v:02x}' for v in skin_color),
              'body': png(body, 'textures/' + card['id'] + '-body', body_sources),
              'hair': [], 'ears': [], 'accessories': [], 'fixedParts': [], 'accessorySets': [[]], 'defaultHair': 0,
              'noseTexture': None}
    if skin and skin[0][0] != 'onecolor_skin':
        head_path = AVATAR / 'head/skin' / ('tex_' + skin[0][0] + '_c.dds')
        if not head_path.exists():
            head_path = diffuse(skin[0][0])
        preset['headTexture'] = png(recolor(head_path, skin[0][4:13]), 'textures/' + card['id'] + '-head', [head_path.relative_to(ROOT).as_posix()])
    eye = data.get('eye', [])
    mouth = data.get('mouth', [])
    preset['eyes'] = [face(eye[0] if eye else None, 'textures/' + card['id'] + '-eye', eye=True)]
    preset['rightEyes'] = [face(eye[0] if eye else None, 'textures/' + card['id'] + '-right-eye', eye=True, right=True)]
    preset['mouths'] = [face(mouth[0] if mouth else None, 'textures/' + card['id'] + '-mouth')]
    if data.get('nose'):
        entry = data['nose'][0]
        preset['noseTexture'] = face(entry, 'textures/' + card['id'] + '-nose')
    for slot in ('hair', 'helmet', 'beard', 'immobile', 'immobileUp', 'immobileDown'):
        for entry in data.get(slot, []):
            preset['fixedParts'].append(textured_part(entry))
    for entry in data.get('ear', []):
        for side, start in (('left', 8), ('right', 19)):
            transform = (entry[start:start + 3], entry[start + 3:start + 7], [entry[start + 7]] * 3)
            preset['fixedParts'].append(textured_part(entry, transform, side, 31))
    for entry in data.get('movable', []):
        transform = (entry[3:6], entry[6:10], [entry[10]] * 3)
        preset['fixedParts'].append(textured_part(entry, transform, color_offset=19))
    primary = (data.get('helmet') or data.get('hair') or data.get('outerwear') or data.get('movable') or [['onecolor_skin']])[0][0]
    icon_path = CACHE / 'ui/avatarui/itemicons' / (primary + '.tga')
    if not icon_path.exists():
        icon_path = CACHE / 'ui/skinf/skin_avatarcard.tga'
    display = card.pop('display', '')
    card['name'] = texts.get(display, display or f'日志造型 {sum("sid" not in item["source"] for item in cards) + 1:02d}')
    card['icon'] = png(read_image(icon_path), 'icons/' + card['id'], [icon_path.relative_to(ROOT).as_posix()])
    card['preset'] = preset
    thumbnail = OUTPUT / 'thumbnails' / (card['id'] + '.png')
    signature = hashlib.sha256((generator_hash + json.dumps(preset, ensure_ascii=False, separators=(',', ':'))).encode()).hexdigest()
    if thumbnail.exists() and thumbnail_signatures.get(card['id']) == signature:
        card['icon'] = '../avatar-cards/' + thumbnail.relative_to(OUTPUT).as_posix()
        sources[thumbnail.relative_to(OUTPUT).as_posix()] = [preset['body']] + [path for part in preset['fixedParts'] for path in part.values()]
    card['appearanceData'] = avatar
    cards.append(card)
    print('Built', card['id'], len(preset['fixedParts']), 'parts', flush=True)

(OUTPUT / 'catalog.json').write_text(json.dumps({'cards': cards}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
(OUTPUT / 'sources.json').write_text(json.dumps(sources, ensure_ascii=False, indent=2), encoding='utf-8')
# Remove only generated files that no longer belong to the regenerated manifest.
for folder in ('models', 'textures', 'icons'):
    for path in (OUTPUT / folder).glob('*'):
        if path.is_file() and path.relative_to(OUTPUT).as_posix() not in sources:
            path.unlink()
print(f'Prepared {len(cards)} cards, {len(model_cache)} models from {len(args.logs or list(ROOT.glob("log-2026-10-13*.txt")))} logs.', flush=True)
