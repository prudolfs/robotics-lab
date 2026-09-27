"""Small client for the user's Blender MCP socket; complete JSON response framing."""
import argparse
import json
import socket
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--build', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
request = {'type': 'get_scene_info', 'params': {}}
if args.build:
    script = root / 'scripts/warehouse-assets/build.py'
    request = {'type': 'execute_code', 'params': {
        'code': f"exec(compile(open({str(script)!r}).read(), {str(script)!r}, 'exec'), {{'__file__': {str(script)!r}}})"
    }}
with socket.create_connection(('127.0.0.1', 9876), timeout=10) as connection:
    connection.settimeout(180)
    connection.sendall(json.dumps(request).encode())
    data = b''
    while True:
        chunk = connection.recv(65536)
        if not chunk:
            raise RuntimeError('Blender closed the socket before a complete response')
        data += chunk
        try:
            response = json.loads(data)
            break
        except json.JSONDecodeError:
            continue
print(json.dumps(response, indent=2))
if response.get('status') != 'success':
    raise SystemExit(1)
