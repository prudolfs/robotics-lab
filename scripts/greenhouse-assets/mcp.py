"""Local Blender MCP client with complete JSON framing; no remote asset services."""

import argparse
import json
import socket
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--build', action='store_true')
parser.add_argument('--verify-source', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
request = {'type': 'get_scene_info', 'params': {}}
if args.build:
    source = root / 'scripts/greenhouse-assets/build.py'
    code = f"exec(compile(open({str(source)!r}).read(), {str(source)!r}, 'exec'), {{'__file__': {str(source)!r}}})"
    request = {'type': 'execute_code', 'params': {'code': code}}
elif args.verify_source:
    source = root / 'assets/greenhouse-demo/greenhouse.blend'
    report = root / 'docs/greenhouse-demo/phase3/blender-source.json'
    code = f"""
import bpy, json
from pathlib import Path
with bpy.data.libraries.load({str(source)!r}, link=False) as (source, target):
    scenes = list(source.scenes)
    objects = list(source.objects)
assert scenes == ['Greenhouse_Phase3'], scenes
assert not set(['Cube', 'Camera', 'Light']).intersection(objects)
assert set(['Caretaker_Root', 'Robot_Eye', 'Lift_Carriage']).issubset(objects)
result = {{'sourceScenes': scenes, 'sourceObjectCount': len(objects),
          'activeScenePreserved': bpy.context.scene.name,
          'activeSceneObjects': sorted(obj.name for obj in bpy.context.scene.objects)}}
Path({str(report)!r}).write_text(json.dumps(result, indent=2) + '\\n')
print(json.dumps(result))
"""
    request = {'type': 'execute_code', 'params': {'code': code}}
with socket.create_connection(('127.0.0.1', 9876), timeout=10) as connection:
    connection.settimeout(180)
    connection.sendall(json.dumps(request).encode())
    data = b''
    while True:
        chunk = connection.recv(65536)
        if not chunk:
            raise RuntimeError('Blender closed before its response completed')
        data += chunk
        try:
            response = json.loads(data)
            break
        except json.JSONDecodeError:
            continue
print(json.dumps(response, indent=2))
if response.get('status') != 'success':
    raise SystemExit(1)
