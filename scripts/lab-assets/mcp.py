"""Build the shared lab kit through the running Blender MCP socket."""
import json
import socket
from pathlib import Path

script = Path(__file__).with_name('build.py').resolve()
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
            raise RuntimeError('Blender closed before returning a complete response')
        data += chunk
        try:
            response = json.loads(data)
            break
        except json.JSONDecodeError:
            continue
print(json.dumps(response, indent=2))
if response.get('status') != 'success':
    raise SystemExit(1)
