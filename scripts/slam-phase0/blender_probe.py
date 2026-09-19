"""Run in a separate background Blender process; never modifies the open scene."""
import bpy, json, sys
from pathlib import Path
root = Path(__file__).resolve().parents[2]
out = root / '.temp/slam-phase0/blender'
out.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene.unit_settings.scale_length = 1.0
for i, (name, color, metal, rough) in enumerate([
    ('Painted teal', (0.055, 0.23, 0.25, 1), 0.3, 0.4),
    ('Brushed alloy', (0.52, 0.59, 0.61, 1), 0.85, 0.26),
    ('Rubber', (0.018, 0.025, 0.03, 1), 0.0, 0.85),
]):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=0.2, location=(i*0.5, 0, 0.2))
    obj = bpy.context.object
    obj.name = name
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    obj.data.materials.append(mat)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'material-probe.blend'))
bpy.ops.export_scene.gltf(filepath=str(out/'material-probe.glb'), export_format='GLB', export_yup=True)
report={'version': bpy.app.version_string, 'export': '.temp/slam-phase0/blender/material-probe.glb', 'bytes': (out/'material-probe.glb').stat().st_size, 'units':'meters', 'blenderUp':'Z', 'gltfUp':'Y', 'objects':len(bpy.context.scene.objects)}
(root/'docs/slam-demo/phase0/blender.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
