"""Authored metric lab assets; Blender Z up exports as glTF Y up, forward +X.
Creates a separate scene and restores the user's active scene after export.
"""
import bpy
import math
import shutil
import json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'assets/lab-kit'
SOURCE.mkdir(parents=True, exist_ok=True)
original = bpy.context.window.scene
scene = bpy.data.scenes.new('Robotics_Lab_Kit')
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
materials = {}

def material(name, color, metal=0, rough=.5, emission=0):
    mat = bpy.data.materials.new('Lab_' + name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Emission Color'].default_value = (*color, 1)
    bsdf.inputs['Emission Strength'].default_value = emission
    materials[name] = mat

for spec in [
    ('slate', (.07,.13,.16), .45,.4), ('teal', (.035,.29,.27), .35,.38),
    ('ivory', (.73,.80,.79), .25,.42), ('alloy', (.43,.54,.57), .8,.3),
    ('rubber', (.012,.022,.028), .05,.85), ('glass', (.015,.045,.06), .6,.18),
    ('mint', (.3,.83,.66), .2,.35, .5), ('amber', (.9,.52,.14), .15,.5),
]: material(*spec)

bundle = []
manifest = {}
def finish(obj, name, mat):
    obj.name = name
    obj.data.materials.append(materials[mat])
    bundle.append(obj)
    return obj

def box(name, loc, size, mat, bevel=.008):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = finish(bpy.context.object, name, mat)
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mod = obj.modifiers.new('Machined edges', 'BEVEL')
    mod.width = min(bevel, min(size)*.2)
    mod.segments = 3
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj

def cylinder(name, loc, radius, depth, mat, rotation=(0,0,0), vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rotation)
    obj = finish(bpy.context.object, name, mat)
    mod = obj.modifiers.new('Rim bevel', 'BEVEL')
    mod.width = min(.004, depth*.15)
    mod.segments = 2
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for face in obj.data.polygons: face.use_smooth = len(face.vertices) == 4
    return obj

def export(name, apps):
    global bundle
    # Merge by material: small draw-call budget, while preserving PBR surfaces.
    batches = [[o for o in bundle if o.data.materials[0] == mat] for mat in materials.values()]
    for objects in batches:
        if not objects: continue
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects: obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
    if name in ['lab-crate', 'lab-drum', 'rover-wheel']:
        # Unit obstacle envelopes match the existing world geometry exactly.
        points = [o.matrix_world @ Vector(corner) for o in scene.objects for corner in o.bound_box]
        minimum = Vector([min(p[i] for p in points) for i in range(3)])
        maximum = Vector([max(p[i] for p in points) for i in range(3)])
        target = Vector((1,1,1) if name != 'rover-wheel' else (.1,.036,.1))
        factor = Vector([target[i] / (maximum[i]-minimum[i]) for i in range(3)])
        center = (minimum + maximum) / 2
        for obj in scene.objects:
            for vertex in obj.data.vertices:
                point = obj.matrix_world @ vertex.co
                vertex.co = Vector([(point[i]-center[i])*factor[i] for i in range(3)])
            obj.matrix_world.identity()
    bpy.ops.object.select_all(action='SELECT')
    path = SOURCE / (name + '.glb')
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
                              use_active_scene=True, export_yup=True)
    points = [o.matrix_world @ Vector(corner) for o in scene.objects for corner in o.bound_box]
    manifest[name] = {'bytes': path.stat().st_size, 'meshes': len(scene.objects),
        'blenderBounds': {'min': [min(p[i] for p in points) for i in range(3)],
                          'max': [max(p[i] for p in points) for i in range(3)]}}
    for app in apps:
        out = ROOT / 'apps' / app / 'public/assets/lab'
        out.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, out / path.name)
    for obj in list(scene.objects): bpy.data.objects.remove(obj, do_unlink=True)
    bundle = []

try:
    # Chassis uses exactly the existing .4 x .28 footprint; wheels remain parametric.
    box('Rover lower chassis', (0,0,.065), (.4,.28,.09), 'slate')
    box('Rover ivory shell', (0,0,.12), (.37,.265,.045), 'ivory')
    box('Service deck', (-.035,0,.148), (.19,.22,.014), 'teal')
    for side in [-1,1]:
        box('Status strip', (.12,side*.132,.113), (.10,.004,.012), 'mint', .001)
        for x in [-.13,.13]:
            cylinder('Deck fastener', (x,side*.10,.146), .009,.006, 'alloy', vertices=12)
    cylinder('Lidar plinth', (-.04,0,.17), .052,.03, 'slate')
    cylinder('Lidar window', (-.04,0,.19), .049,.018, 'glass')
    cylinder('Lidar cap', (-.04,0,.203), .051,.008, 'teal')
    box('Stereo camera', (.182,0,.105), (.025,.13,.038), 'slate')
    for side in [-1,1]:
        cylinder('Camera lens', (.198,side*.043,.107), .011,.009, 'glass', (0,math.pi/2,0))
    for i in range(5):
        box('Rear cooling slot', (-.196,(i-2)*.028,.08), (.005,.016,.025), 'rubber', .001)
    export('rover-chassis', ['simulator'])

    # Tire axis is glTF Z; mounted independently at the configured wheelbase.
    cylinder('Tire', (0,0,0), .05,.03, 'rubber', (math.pi/2,0,0))
    for side in [-1,1]:
        cylinder('Wheel hub', (0,side*.016,0), .029,.003, 'alloy', (math.pi/2,0,0))
        cylinder('Axle cap', (0,side*.018,0), .010,.004, 'teal', (math.pi/2,0,0), 12)
    for i in range(20):
        angle = i*math.tau/20
        tread = box('Tread', (.049*math.sin(angle),0,.049*math.cos(angle)), (.011,.03,.004), 'rubber', .001)
        tread.rotation_euler.y = angle
    export('rover-wheel', ['simulator'])

    # Drone body radius .13; arms and animated rotors retain simulation locations.
    box('Flight computer', (0,0,0), (.25,.18,.065), 'slate', .02)
    box('Aerodynamic shell', (0,0,.04), (.23,.16,.045), 'ivory', .018)
    box('Battery', (-.025,0,.069), (.14,.085,.03), 'teal')
    for x in [-.07,.035]:
        box('Battery strap', (x,0,.086), (.016,.09,.008), 'rubber', .002)
    for side in [-1,1]:
        box('Navigation light', (.06,side*.085,.026), (.06,.006,.012), 'mint', .001)
        box('Skid support', (-.025,side*.075,-.04), (.15,.012,.04), 'slate')
        box('Landing skid', (-.015,side*.085,-.063), (.25,.018,.014), 'alloy')
    box('Gimbal housing', (.092,0,-.045), (.065,.065,.045), 'slate')
    cylinder('Optical lens', (.129,0,-.045), .019,.014, 'glass', (0,math.pi/2,0))
    for i in range(5):
        box('Cooling fin', (-.08+i*.027,.086,.005), (.012,.004,.024), 'alloy', .001)
    export('drone-body', ['drone-mission-planner'])

    # Crate occupies a unit cube, centered on origin for editable world scaling.
    box('Transport case', (0,0,0), (1,1,1), 'slate', .025)
    for side in [-1,1]:
        box('Side panel', (side*.495,0,0), (.01,.83,.79), 'teal')
        box('End panel', (0,side*.495,0), (.83,.01,.79), 'teal')
        box('Handle', (0,side*.503,.18), (.23,.009,.065), 'rubber')
        for x in [-.4,.4]:
            box('Corner protection', (x,side*.495,0), (.07,.012,.96), 'alloy')
    for x in [-.32,.32]:
        box('Lid strap', (x,0,.499), (.045,.98,.004), 'alloy', .001)
    box('Asset label', (0,-.504,-.12), (.24,.008,.15), 'ivory')
    box('Safety band', (0,.502,-.32), (.65,.008,.055), 'amber', .001)
    export('lab-crate', ['simulator','drone-mission-planner'])

    cylinder('Drum body', (0,0,0), .5,1,'teal')
    for z in [-.47,-.28,.28,.47]:
        cylinder('Reinforcing hoop', (0,0,z), .505,.035,'alloy')
    cylinder('Inset lid', (0,0,.499), .46,.006,'slate')
    cylinder('Fill cap', (.22,0,.507), .065,.014,'alloy')
    export('lab-drum', ['simulator','drone-mission-planner'])
    # Keep a native source library containing all exported meshes.
    for path in sorted(SOURCE.glob('*.glb')):
        bpy.ops.import_scene.gltf(filepath=str(path))
    bpy.data.libraries.write(str(SOURCE / 'lab-kit.blend'), {scene}, fake_user=True, compress=True)
    (SOURCE / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print('Exported five lab assets and the editable Blender library')
finally:
    bpy.context.window.scene = original
