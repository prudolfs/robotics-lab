"""Repeatable greenhouse kit. Blender MCP or --background --python; metres, Z-up.

Only replaces our tagged generated scene. Runtime bundles export at the origin;
the saved library contains only our scene and its editable dependencies.
"""

import hashlib
import json
import math
import random
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'assets/greenhouse-demo'
OUT = ROOT / 'apps/greenhouse-demo/public/assets/greenhouse'
DOC = ROOT / 'docs/greenhouse-demo/phase3'
for folder in (SOURCE, OUT, DOC):
    folder.mkdir(parents=True, exist_ok=True)
M = json.loads((SOURCE / 'manifest.json').read_text())
original = bpy.context.window.scene
scene = bpy.data.scenes.new('Greenhouse_Phase3_build')
scene['greenhouse_generated'] = True
bpy.context.window.scene = scene
for old in list(bpy.data.scenes):
    if old is not scene and old.get('greenhouse_generated'):
        if original is old:
            original = scene
        for obj in list(old.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.scenes.remove(old)
scene.name = M['scene']
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
scene.world = bpy.data.worlds.new('Greenhouse_Warm_Daylight')
scene.world.color = (.20, .24, .20)
materials = {}
bundle = 'environment'


def srgb(hex_value):
    rgb = [int(hex_value[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in rgb)


def material(name, color, metal=0, rough=.65, emit=0, alpha=1):
    mat = bpy.data.materials.new('GH_' + name)
    mat.use_nodes = True
    rgb = srgb(color)
    mat.diffuse_color = (*rgb, alpha)
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*rgb, alpha)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Alpha'].default_value = alpha
    if emit:
        bsdf.inputs['Emission Color'].default_value = (*rgb, 1)
        bsdf.inputs['Emission Strength'].default_value = emit
    if alpha < 1:
        mat.surface_render_method = 'DITHERED'
    materials[name] = mat


for spec in [
    ('fern', '#536c60', .35, .42), ('fern-dark', '#354d43', .2, .54),
    ('ivory', '#e6ddbc', .12, .42), ('ivory-dark', '#c6bc98', .1, .58),
    ('graphite', '#283a35', .08, .7), ('rubber', '#23302b', 0, .93),
    ('alloy', '#9ca99b', .72, .3), ('glass-eye', '#102c2c', .6, .12),
    ('leaf', '#7d9a69', 0, .76), ('leaf-dark', '#496d43', 0, .8),
    ('leaf-light', '#a4b77a', 0, .72), ('vein', '#7f9b60', 0, .8),
    ('soil', '#4b3c2d', 0, .98), ('clay', '#a77953', 0, .9),
    ('clay-rim', '#bb8c65', 0, .83), ('wood', '#b3966d', 0, .8),
    ('wood-dark', '#8d7554', 0, .88), ('amber', '#c99643', .12, .4),
    ('cream-print', '#f0e8d3', 0, .8), ('grout', '#989984', 0, .95),
]:
    material(*spec)
for index, color in enumerate(['#c9c6ae', '#cbc8b3', '#c3c1a9', '#cecab4', '#c7c5ae']):
    material('stone-' + str(index), color, 0, .9)
material('glazing', '#b9d1c4', .1, .24, alpha=.13)
material('warm-lamp', '#ffe4af', 0, .4, emit=2)
material('status', '#b4dea2', 0, .4, emit=.8)


def tag(obj, name, mat=None, parent=None):
    obj.name = name
    obj['bundle'] = bundle
    if mat:
        obj.data.materials.append(materials[mat])
    if parent:
        obj.parent = parent
    return obj


def empty(name, loc=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    scene.collection.objects.link(obj)
    tag(obj, name, parent=parent)
    obj.location = loc
    return obj


def box(name, loc, size, mat, bevel=.01, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj = tag(bpy.context.object, name, mat, parent)
    obj.location = loc
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new('Soft manufactured edge', 'BEVEL')
        mod.width = min(bevel, min(size) * .24)
        mod.segments = 3
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def cylinder(name, loc, radius, depth, mat, axis='Z', parent=None, vertices=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth)
    obj = tag(bpy.context.object, name, mat, parent)
    obj.location = loc
    if axis == 'Y':
        obj.rotation_euler.x = math.pi / 2
    if axis == 'X':
        obj.rotation_euler.y = math.pi / 2
    for face in obj.data.polygons:
        face.use_smooth = len(face.vertices) == 4
    return obj


def sphere(name, loc, scale, mat, parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=1)
    obj = tag(bpy.context.object, name, mat, parent)
    obj.location = loc
    obj.scale = scale
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj


def bar(name, start, end, width, mat, parent=None):
    midpoint = (Vector(start) + Vector(end)) / 2
    direction = Vector(end) - Vector(start)
    obj = box(name, midpoint, (width, width, direction.length), mat, .003, parent)
    obj.rotation_euler = direction.to_track_quat('Z', 'Y').to_euler()
    return obj


def ring(name, loc, radius, minor, mat, axis='Z', parent=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=minor,
                                    major_segments=32, minor_segments=6)
    obj = tag(bpy.context.object, name, mat, parent)
    obj.location = loc
    if axis == 'X':
        obj.rotation_euler.y = math.pi / 2
    elif axis == 'Y':
        obj.rotation_euler.x = math.pi / 2
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj


def text(name, body, loc, size, mat, rotation=(0, 0, 0), parent=None):
    curve = bpy.data.curves.new(name, 'FONT')
    curve.body = body
    curve.size = size
    curve.extrude = .00015
    curve.resolution_u = 2
    obj = bpy.data.objects.new(name, curve)
    scene.collection.objects.link(obj)
    tag(obj, name, mat, parent)
    obj.location = loc
    obj.rotation_euler = rotation
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    return obj


def panel(name, vertices, mat):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], [(0, 1, 2, 3)])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    tag(obj, name, mat)
    return obj


def leaf(name, start, end, width, mat, parent=None, bend=.045):
    a, b = Vector(start), Vector(end)
    direction = b - a
    side = direction.cross(Vector((0, 0, 1)))
    if side.length < .001:
        side = Vector((1, 0, 0))
    side.normalize()
    center = a.lerp(b, .55) + Vector((0, 0, bend))
    mesh = bpy.data.meshes.new(name)
    vertices = [a, a.lerp(b, .25) + side * width * .65,
                center + side * width, b, center - side * width,
                a.lerp(b, .25) - side * width * .65, center + Vector((0, 0, .018))]
    mesh.from_pydata(vertices, [], [(0, 1, 6), (1, 2, 6), (2, 3, 6),
                                  (3, 4, 6), (4, 5, 6), (5, 0, 6)])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    tag(obj, name, mat, parent)
    for face in mesh.polygons:
        face.use_smooth = True
    # Give the blade a back face while keeping the export standard PBR.
    mesh.materials[0].use_backface_culling = False
    return obj


try:
    # Environment: bevelled pavers above a recessed foundation, never coplanar.
    environment = empty('Greenhouse_Root')
    box('Foundation', (0, 0, -.12), (6.35, 4.35, .18), 'fern-dark', .025, environment)
    box('Grout_bed', (0, 0, -.025), (6, 4, .03), 'grout', 0, environment)
    rng = random.Random(31)
    for ix in range(12):
        for iy in range(8):
            box('Limestone_paver', (-2.75 + ix * .5, -1.75 + iy * .5, -.0075),
                (.486, .486, .015), 'stone-' + str(rng.randrange(5)), .003, environment)
    for wall in M['walls']:
        box(wall['id'], wall['center'], [v * 2 for v in wall['halfSize']], 'fern', .01, environment)
        x, y, z = wall['center']
        hx, hy, hz = wall['halfSize']
        box('Sill_cap', (x, y, z + hz - .003), (hx * 2 - .004, hy * 2 - .004, .01), 'ivory-dark', .002, environment)
    # Far/west glazing and open near/east cutaway maintain the action view.
    for x in [-2.95, -1.48, 0, 1.48, 2.95]:
        box('Rear_frame_post', (x, 2, 1.11), (.045, .055, 1.98), 'fern', .005, environment)
    for y in [-1.98, 0, 1.98]:
        box('West_frame_post', (-2.99, y, 1.11), (.055, .045, 1.98), 'fern', .005, environment)
    for z in [.28, 1.1, 2.05]:
        box('Rear_cross_rail', (0, 2, z), (6, .05, .04), 'fern', .003, environment)
        box('West_cross_rail', (-3, 0, z), (.05, 4, .04), 'fern', .003, environment)
    for index in range(4):
        a, b = -2.95 + index * 1.475 + .03, -2.95 + (index + 1) * 1.475 - .03
        panel('Rear_glazing', [(a, 2.015, .30), (b, 2.015, .30),
                               (b, 2.015, 2.02), (a, 2.015, 2.02)], 'glazing')
    for a, b in [(-1.94, -.04), (.04, 1.94)]:
        panel('West_glazing', [(-3.015, a, .30), (-3.015, b, .30),
                               (-3.015, b, 2.02), (-3.015, a, 2.02)], 'glazing')
    for x in [-2.95, 0, 2.95]:
        bar('Gable_rafter', (x, -2, 2.05), (x, 0, 2.65), .045, 'fern', environment)
        bar('Gable_rafter', (x, 0, 2.65), (x, 2, 2.05), .045, 'fern', environment)
    box('Roof_ridge', (0, 0, 2.65), (6.05, .055, .055), 'fern', .005, environment)
    for xa, xb in [(-2.9, -.04), (.04, 2.9)]:
        panel('Partial_roof_glazing', [(xa, .05, 2.63), (xb, .05, 2.63),
                                       (xb, 1.96, 2.06), (xa, 1.96, 2.06)], 'glazing')
    # Floating work benches are entirely above the robot/carry envelope.
    for index, center in enumerate(M['benches']['centers']):
        x, y, z = center
        box('Potting_bench', center, M['benches']['size'], 'wood', .01, environment)
        box('Bench_front_trim', (x, y - .119, z - .012), (2.4, .012, .045), 'wood-dark', .003, environment)
        for offset in [-.9, .9]:
            bar('Wall_bracket', (x + offset, 1.98, .72), (x + offset, 1.80, .85), .025, 'fern', environment)
        for offset in [-.72, -.27, .18]:
            box('Seedling_tray', (x + offset, y, z + .045), (.34, .17, .03), 'fern-dark', .006, environment)
            for dx in [-.10, 0, .10]:
                box('Seedling_soil', (x + offset + dx, y, z + .064), (.075, .12, .015), 'soil', .005, environment)
                leaf('Seedling_leaf', (x + offset + dx, y, z + .07), (x + offset + dx + .05, y - .04, z + .12), .025, 'leaf', environment, .004)
        cylinder('Tool_cup', (x + .87, y, z + .10), .06, .14, 'clay-rim', parent=environment)
        for offset in [-.025, .025]:
            bar('Hand_tool', (x + .87 + offset, y, z + .12), (x + .9 + offset, y, z + .30), .012, 'alloy', environment)
        text('Bench_label', 'SEED NURSERY' if not index else 'CUTTINGS / 03',
             (x - .9, y - .132, z -.016), .048, 'fern-dark', (math.pi / 2, 0, 0), environment)
    # Warm practical lights are small, not broad emissive panels.
    for x in [-1.5, 1.5]:
        box('Task_light', (x, 1.92, 1.53), (.34, .10, .055), 'fern-dark', .01, environment)
        box('Task_diffuser', (x, 1.86, 1.513), (.28, .025, .025), 'warm-lamp', .005, environment)
    # Destination: floor-level mat and exact acceptance-radius marker.
    tx, ty, _ = M['tray']['position']
    box('Collection_mat', (tx, ty, .0015), (.65, .65, .003), 'fern', .018, environment)
    ring('Acceptance_ring', (tx, ty, .004), M['tray']['acceptanceRadius'], .003, 'ivory', parent=environment)
    for offset in [-.28, .28]:
        box('Tray_grip_mark', (tx + offset, ty, .004), (.015, .21, .003), 'amber', .002, environment)
    text('Collection_label', 'SEEDS', (tx - .13, ty - .295, .004), .065, 'cream-print', parent=environment)
    # Charger panel fits completely in the existing wall collider.
    dx, dy, dz = M['dock']['pad']
    box('Charging_pad', (dx, dy, dz), (.70, .62, .002), 'fern-dark', .02, environment)
    ring('Charging_mark', (dx, dy, .003), .21, .003, 'amber', parent=environment)
    box('Charging_wall_panel', M['dock']['panel'], (.05, .40, .40), 'ivory-dark', .012, environment)
    box('Charge_indicator', (-2.998, dy, .49), (.002, .12, .015), 'warm-lamp', .001, environment)
    text('Charging_label', 'PIP / HOME', (-2.997, dy + .15, .35), .045, 'fern-dark', (math.pi/2, 0, -math.pi/2), environment)

    # Original articulated caretaker. Local origins are physical mount points.
    bundle = 'caretaker'
    robot = empty(M['pivots']['root'])
    box('Lower_chassis', (0, 0, .14), (.40, .32, .13), 'graphite', .035, robot)
    box('Ivory_shell', (-.015, 0, .245), (.39, .335, .20), 'ivory', .045, robot)
    box('Shoulder_cap', (-.015, 0, .35), (.34, .32, .025), 'ivory-dark', .005, robot)
    box('Rear_service_cover', (-.207, 0, .25), (.008, .23, .12), 'fern', .002, robot)
    for y in [-.12, .12]:
        box('Amber_latch', (.09, y, .348), (.04, .025, .025), 'amber', .004, robot)
    for y in [-.075, -.025, .025, .075]:
        box('Cooling_slot', (-.213, y, .25), (.003, .013, .06), 'graphite', .001, robot)
    for name, loc, side in [(M['pivots']['leftWheel'], M['robot']['wheelCenters'][0], 1),
                            (M['pivots']['rightWheel'], M['robot']['wheelCenters'][1], -1)]:
        wheel = empty(name, loc, robot)
        cylinder('Rubber_tyre', (0, 0, 0), .14, .08, 'rubber', 'Y', wheel, 40)
        cylinder('Wheel_hub', (0, side * .0395, 0), .088, .004, 'ivory-dark', 'Y', wheel, 24)
        cylinder('Axle_cap', (0, side * .043, 0), .032, .002, 'fern', 'Y', wheel, 20)
        for angle in [0, math.pi * 2 / 3, math.pi * 4 / 3]:
            spoke = box('Wheel_spoke', (.05 * math.cos(angle), side * .042, .05 * math.sin(angle)),
                        (.072, .001, .013), 'fern', .002, wheel)
            spoke.rotation_euler.y = -angle
        for index in range(22):
            angle = index * math.tau / 22
            tread = box('Tread_groove', (.137 * math.cos(angle), 0, .137 * math.sin(angle)),
                        (.004, .066, .009), 'graphite', .001, wheel)
            tread.rotation_euler.y = -angle
    sphere('Rear_support', (-.14, 0, .055), (.045, .045, .045), 'rubber', robot)
    box('Neck_socket', (.025, 0, .38), (.09, .11, .04), 'graphite', .01, robot)
    cylinder('Neck_stem', (.025, 0, .419), .023, .075, 'alloy', parent=robot, vertices=16)
    pan = empty(M['pivots']['headPan'], M['robot']['headPanPivot'], robot)
    cylinder('Neck_joint', (0, 0, .015), .041, .045, 'fern', parent=pan, vertices=20)
    pitch = empty(M['pivots']['headPitch'], M['robot']['headPitchPivot'], pan)
    box('Binocular_bridge', (0, 0, .025), (.12, .27, .055), 'fern', .012, pitch)
    for index, y in enumerate([.105, -.105]):
        box('Eye_housing', (.026, y, .025), (.17, .17, .145), 'ivory', .032, pitch)
        cylinder('Lens_barrel', (.112, y, .025), .063, .028, 'graphite', 'X', pitch, 32)
        ring('Lens_ring', (.129, y, .025), .052, .004, 'alloy', 'X', pitch)
        cylinder('Optical_glass', (.132, y, .025), .048, .005, 'glass-eye', 'X', pitch, 32)
        sphere('Lens_glint', (.136, y -.014, .045), (.002, .009, .009), 'cream-print', pitch)
        lid = empty(M['pivots']['lids'][index], (.137, y, .025), pitch)
        cylinder('Eyelid_shutter', (0, 0, 0), .051, .003, 'ivory', 'X', lid, 24)
        lid.scale.z = .001
    empty(M['pivots']['eye'], M['robot']['eyeLocal'], pitch)
    # A rail and exposed carriage keep pickup height visually readable.
    for y in [-.10, .10]:
        box('Lift_rail', (.17, y, .19), (.018, .018, .29), 'alloy', .003, robot)
    lift = empty(M['pivots']['lift'], (0, 0, M['robot']['liftMin']), robot)
    box('Lift_crossbar', (.175, 0, .005), (.035, .23, .04), 'fern', .007, lift)
    for name, side in [(M['pivots']['leftJaw'], 1), (M['pivots']['rightJaw'], -1)]:
        jaw = empty(name, (0, side * M['robot']['openJawOffset'], 0), lift)
        box('Gripper_finger', (.28, 0, 0), (.22, .025, .025), 'alloy', .004, jaw)
        box('Soft_jaw_pad', (.338, -side * .013, .001), (.065, .003, .022), 'rubber', .001, jaw)
    status = empty(M['pivots']['status'], (.189, 0, .265), robot)
    cylinder('Status_lamp', (0, 0, 0), .018, .006, 'status', 'X', status, 16)
    text('Caretaker_name', 'PIP', (.015, -.170, .245), .048, 'fern-dark', (math.pi/2, 0, 0), robot)
    sphere('Seed_badge', (.11, -.173, .27), (.012, .002, .018), 'amber', robot)

    bundle = 'capsule'
    capsule = empty('Capsule_Root')
    sphere('Seed_capsule_shell', (0, 0, 0), (.049, .049, .049), 'amber', capsule)
    ring('Capsule_seam', (0, 0, 0), .047, .0015, 'ivory-dark', parent=capsule)
    sphere('Capsule_seed_mark', (0, -.048, .008), (.009, .001, .014), 'fern-dark', capsule)

    # Three authored plant types, each rooted at ground and sharing pot physics.
    plant_roots = []
    for variant, name in enumerate(['plant-a', 'plant-b', 'plant-c']):
        bundle = name
        plant = empty('Plant_Root_' + str(variant))
        plant_roots.append(plant)
        bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=.11, radius2=.145, depth=.28)
        pot = tag(bpy.context.object, 'Terracotta_pot', 'clay', plant)
        pot.location = (0, 0, .14)
        for face in pot.data.polygons:
            face.use_smooth = len(face.vertices) == 4
        ring('Pot_rim', (0, 0, .282), .139, .010, 'clay-rim', parent=plant)
        cylinder('Pot_soil', (0, 0, .275), .132, .008, 'soil', parent=plant)
        ring('Pot_foot', (0, 0, .012), .108, .005, 'clay-rim', parent=plant)
        if variant == 0:
            # Broad, bowed rosette leaves.
            for index in range(15):
                angle = index * 2.39996
                height = .26 + (index % 4) * .075
                reach = .17 + (index % 3) * .022
                end = (math.cos(angle) * reach, math.sin(angle) * reach, .28 + height)
                leaf('Rosette_leaf', (0, 0, .28), end, .05, ['leaf', 'leaf-dark', 'leaf-light'][index % 3], plant, .07)
        elif variant == 1:
            # Upright herb with paired leaves.
            for stem_index in range(5):
                angle = stem_index * 2.4
                center = (.045 * math.cos(angle), .045 * math.sin(angle))
                top = .68 + stem_index * .025
                bar('Herb_stem', (*center, .28), (*center, top), .008, 'leaf-dark', plant)
                for tier in range(4):
                    z = .37 + tier * .075
                    for side in [-1, 1]:
                        a = angle + side * .6 + tier * .8
                        end = (center[0] + math.cos(a) * .13, center[1] + math.sin(a) * .13, z + .065)
                        leaf('Herb_leaf', (*center, z), end, .032, 'leaf' if tier % 2 else 'leaf-light', plant, .018)
        else:
            # Compact tomato-like vine, small warm fruit rather than a featureless blob.
            for stem_index in range(3):
                angle = stem_index * math.tau / 3
                end = (.09 * math.cos(angle), .09 * math.sin(angle), .75)
                bar('Vine_stem', (0, 0, .28), end, .010, 'leaf-dark', plant)
                for tier in range(5):
                    z = .35 + tier * .075
                    a = angle + tier * 1.2
                    leaf('Vine_leaf', (end[0] * .6, end[1] * .6, z),
                         (math.cos(a) * .21, math.sin(a) * .21, z + .09), .042, 'leaf-dark' if tier % 2 else 'leaf', plant, .02)
                sphere('Small_fruit', (end[0] + .04, end[1] -.03, .57), (.026, .026, .028), 'amber', plant)
        box('Plant_marker', (.10, -.085, .35), (.045, .008, .14), 'ivory-dark', .002, plant)
        text('Plant_marker_id', ['01', '02', '03'][variant], (.083, -.09, .388), .023, 'fern-dark', (math.pi/2, 0, 0), plant)

    # Batch static geometry without collapsing articulation boundaries.
    groups = {}
    for obj in list(scene.objects):
        if obj.type == 'MESH':
            key = (obj['bundle'], obj.parent.name if obj.parent else '', obj.data.materials[0].name)
            groups.setdefault(key, []).append(obj)
    for (pack, parent_name, mat_name), objects in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects) > 1:
            bpy.ops.object.join()
        objects[0].name = pack + '_' + (parent_name or 'static') + '_' + mat_name
    report = {'blender': bpy.app.version_string,
              'manifestHash': hashlib.sha256((SOURCE / 'manifest.json').read_bytes()).hexdigest(),
              'source': 'assets/greenhouse-demo/greenhouse.blend', 'bundles': {}}
    for name in ['environment', 'caretaker', 'capsule', 'plant-a', 'plant-b', 'plant-c']:
        bpy.ops.object.select_all(action='DESELECT')
        objects = [obj for obj in scene.objects if obj.get('bundle') == name]
        for obj in objects:
            obj.select_set(True)
        meshes = [obj for obj in objects if obj.type == 'MESH']
        for obj in meshes:
            obj.data.calc_loop_triangles()
        path = OUT / (name + '.glb')
        bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
                                  use_active_scene=True, export_yup=True, export_cameras=False,
                                  export_lights=False, export_apply=True)
        report['bundles'][name] = {'bytes': path.stat().st_size, 'meshes': len(meshes),
            'triangles': sum(len(obj.data.loop_triangles) for obj in meshes),
            'pivots': [obj.name for obj in objects if obj.type == 'EMPTY']}
    (OUT / 'manifest.json').write_text(json.dumps(M, indent=2) + '\n')
    # Save a useful source assembly after all exports at their own origins.
    robot.location = (-1.2, -.4, 0)
    capsule.location = (.12, -.2, .05)
    for index, root in enumerate(plant_roots):
        root.location = M['potPositions'][index]
    for index, root in [(3, plant_roots[0]), (4, plant_roots[1])]:
        def clone_tree(obj, parent=None):
            copy = obj.copy()
            scene.collection.objects.link(copy)
            copy.parent = parent
            for child in obj.children:
                clone_tree(child, copy)
            return copy
        copy = clone_tree(root)
        copy.location = M['potPositions'][index]
    light_data = bpy.data.lights.new('Greenhouse_preview_sun', 'AREA')
    light_data.energy = 1400
    light_data.shape = 'DISK'
    light_data.size = 8
    light = bpy.data.objects.new('Greenhouse_preview_sun', light_data)
    scene.collection.objects.link(light)
    light.location = (-3, -4, 7)
    for area in bpy.context.screen.areas if bpy.context.screen else []:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_distance = 8
            area.spaces.active.region_3d.view_location = Vector((0, 0, .6))
    bpy.data.libraries.write(str(SOURCE / 'greenhouse.blend'), {scene}, fake_user=True, compress=True)
    (DOC / 'asset-export.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))
finally:
    bpy.context.window.scene = original
