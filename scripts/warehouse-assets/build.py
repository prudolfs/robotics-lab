"""Repeatable warehouse kit. Run through mcp.py --build or Blender --background --python.
Creates its own scene; exports only that scene, preserving the user's open scene.
"""
import bpy, json, math, hashlib
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'assets/warehouse-demo'
OUT = ROOT / 'apps/warehouse-demo/public/assets/warehouse'
DOC = ROOT / 'docs/warehouse-demo/phase3'
for folder in (SOURCE, OUT, DOC): folder.mkdir(parents=True, exist_ok=True)
M = json.loads((SOURCE / 'manifest.json').read_text())
assert (M['world']['width'], M['world']['depth']) == (12, 15.5), 'Reauthor shell when changing its footprint'
assert (M['forklift']['length'], M['forklift']['width'], M['forklift']['loadForward']) == (1.8, 1, 1.55), 'Reauthor forklift when changing its collision envelope'
assert M['pallet']['width'] == M['pallet']['depth'] == 1.1
previous = [item for item in bpy.data.scenes if item.name.startswith('Warehouse_Phase3') and any(obj.get('bundle') == 'forklift' for obj in item.objects)]
scene = bpy.data.scenes.new('Warehouse_Phase3_build')
bpy.context.window.scene = scene
for old in previous:
    for obj in list(old.objects): bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.scenes.remove(old)
scene.name = 'Warehouse_Phase3'
scene['warehouse_asset_source'] = str(SOURCE)
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
scene.world = bpy.data.worlds.new('Warehouse_Studio_World')
scene.world.color = (.12, .16, .18)
materials = {}
bundle = 'environment'

def material(name, color, metal=0, rough=.6, emit=0):
    mat = bpy.data.materials.new('WH_' + name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    if emit:
        bsdf.inputs['Emission Color'].default_value = (*color, 1)
        bsdf.inputs['Emission Strength'].default_value = emit
    materials[name] = mat

for spec in [
    ('teal', (.025,.20,.19), .3,.36), ('slate',(.075,.125,.15),.35,.48),
    ('wall',(.44,.53,.54),.08,.8), ('wall-light',(.62,.69,.67),.05,.72),
    ('floor',(.24,.31,.33),.08,.86), ('dark',(.014,.025,.031),.12,.8),
    ('alloy',(.42,.52,.55),.78,.3), ('white',(.78,.83,.78),.05,.58),
    ('amber',(.86,.48,.10),.1,.52), ('wood',(.39,.23,.11),0,.82),
    ('wood-light',(.51,.34,.18),0,.84), ('carton',(.57,.40,.23),0,.9),
    ('carton-light',(.66,.49,.30),0,.88), ('strap',(.17,.21,.19),.1,.64),
    ('mint',(.28,.78,.64),.12,.4), ('glass',(.035,.095,.12),.5,.2),
]: material(*spec)
material('warm-light',(1,.62,.24),.05,.35,2.5)
material('status-light',(.25,.9,.66),.05,.3,1.5)
material('beacon',(1,.22,.015),.05,.32,.8)

# A small embedded texture avoids a perfectly flat floor without shipping a texture library.
floor_image = ROOT / 'assets/slam-demo/textures/floor-albedo.png'
if floor_image.exists():
    mat = materials['floor']; image = bpy.data.images.load(str(floor_image), check_existing=True)
    image.pack(); tex = mat.node_tree.nodes.new('ShaderNodeTexImage'); tex.image = image
    mat.node_tree.links.new(tex.outputs['Color'],mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])

def tag(obj, name, mat=None, parent=None):
    obj.name = name
    obj['bundle'] = bundle
    if mat: obj.data.materials.append(materials[mat])
    if parent: obj.parent = parent
    return obj

def empty(name, loc=(0,0,0), parent=None):
    obj = bpy.data.objects.new(name, None); scene.collection.objects.link(obj)
    tag(obj,name,parent=parent); obj.location=loc
    return obj

def box(name, loc, size, mat, bevel=.018, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj=tag(bpy.context.object,name,mat,parent); obj.location=loc; obj.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=obj.modifiers.new('Edge highlights','BEVEL');mod.width=min(bevel,min(size)*.24);mod.segments=2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    if mat=='floor':
        uv=obj.data.uv_layers.active
        for face in obj.data.polygons:
            for index in face.loop_indices:
                co=obj.data.vertices[obj.data.loops[index].vertex_index].co
                uv.data[index].uv=(co.x*.7,co.y*.7)
    return obj

def cylinder(name,loc,radius,depth,mat,axis='Z',parent=None,vertices=20):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth)
    obj=tag(bpy.context.object,name,mat,parent);obj.location=loc
    if axis=='Y':obj.rotation_euler.x=math.pi/2
    if axis=='X':obj.rotation_euler.y=math.pi/2
    for face in obj.data.polygons:face.use_smooth=len(face.vertices)==4
    return obj

def text(name,body,loc,size,mat='white',rotation=(0,0,0),parent=None):
    curve=bpy.data.curves.new(name,'FONT');curve.body=body;curve.size=size;curve.extrude=.0003
    curve.space_character=1.12;curve.resolution_u=3
    obj=bpy.data.objects.new(name,curve);scene.collection.objects.link(obj)
    tag(obj,name,mat,parent);obj.location=loc;obj.rotation_euler=rotation
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.convert(target='MESH');return obj

# Warehouse cutaway and dock. All floor obstacles use the manifest's simulation footprint.
# Keep the foundation below the 5 cm finish slab: coincident top faces flicker in WebGPU.
box('Concrete_foundation',(0,7.75,-.225),(12,15.5,.35),'slate',.04)
box('Concrete_floor',(0,7.75,-.025),(11.9,15.4,.05),'floor',0)
box('Back_wall',(0,15.52,1.7),(12,.14,3.4),'wall-light')
box('Left_wall',(-6.02,7.75,1.7),(.14,15.5,3.4),'wall')
box('Cutaway_sill',(6.02,7.75,.19),(.14,15.5,.38),'wall-light')
for y in [0,3.85,7.7,11.55,15.4]:
    box('Wall_column',(-5.94,y,1.65),(.16,.2,3.3),'slate')
    if y: box('Column_foot',(-5.82,y,.3),(.12,.27,.6),'amber')
for x in [-5.8,-2.9,0,2.9,5.8]:
    box('Back_column',(x,15.39,1.65),(.16,.17,3.3),'slate')
for z in [.62,2.6,3.25]:box('Left_wall_rail',(-5.92,7.75,z),(.08,15.5,.08),'slate',.008)
for y in [1.8,5.7,9.6,13.5]:
    box('Wall_luminaire',(-5.73,y,2.87),(.32,1.05,.12),'slate')
    box('Warm_diffuser',(-5.7,y,2.805),(.25,.91,.025),'warm-light',.005)
box('Back_sign_panel',(-.8,15.35,2.15),(6.8,.045,.75),'slate',.01)
text('Warehouse_title','NORTHLINE  /  RECEIVING',(-3.85,15.315,2.13),.32,'white',(math.pi/2,0,0))
text('Warehouse_subtitle','AUTONOMOUS LOGISTICS   •   DOCK 01',(-3.8,15.31,1.88),.12,'mint',(math.pi/2,0,0))
# Floor seams and travel marks remain paint, not collision obstacles.
for y in [0,3.1,6.2,9.3,12.4]:box('Floor_joint',(0,y,.007),(11.85,.013,.009),'slate',0)
for x in [-3,0,3]:box('Floor_joint',(x,7.75,.007),(.013,15.4,.009),'slate',0)
for y in [1.2,2.7,4.2,5.7,7.2,8.7,10.2,11.7,13.2]:
    box('Travel_lane_mark',(.55,y,.012),(.065,.72,.012),'white',0)
for y in [3.5,8.5,13.5]:
    box('Travel_arrow',(-1.5,y,.018),(.08,.8,.012),'amber',0)
    for sign in [-1,1]:
        obj=box('Travel_arrow_head',(-1.5+sign*.14,y-.31,.018),(.08,.4,.012),'amber',0)
        obj.rotation_euler.z=sign*.75
text('Floor_dock_label','01  /  RECEIVING',(-4.5,.5,.018),.24,'white')
box('Dock_plate',(-1.95,0,.02),(3.7,.42,.04),'alloy',.008)
for x in [-3.7,-.2]:box('Dock_bumper',(x,-.12,-.22),(.21,.28,.44),'dark')
for x in [-5.5,-4.7,1,1.8,2.6,3.4,4.2,5]:
    obj=box('Dock_edge_hazard',(x,.09,.016),(.38,.18,.013),'amber',0);obj.rotation_euler.z=-.5
# Compact ground-level cantilever rack: open front, structural steel behind load footprints.
for z in [.15,.55,1.35]:box('Rack_back_rail',(5.77,6.75,z),(.36,10.2,.11),'slate')
box('Rack_top_rail',(5.74,6.75,2.05),(.3,10.2,.14),'teal')
for bay in M['bays']:
    y=bay['y']
    box('Bay_inset',(4.9,y,.005),(1.1,1.1,.01),'slate',0)
    for offset in [-.59,.59]:box('Bay_paint',(4.89,y+offset,.014),(1.25,.035,.012),'mint',0)
    box('Bay_front_mark',(4.25,y,.014),(.035,1.18,.012),'mint',0)
    box('Rack_column',(5.74,y+.6,1.05),(.19,.09,2.1),'teal',.01)
    box('Rack_bay_sign',(5.53,y,1.69),(.035,.67,.23),'amber',.005)
    text('Bay_number',bay['id'],(5.505,y+.19,1.61),.18,'dark',(math.pi/2,0,-math.pi/2))
    text('Bay_floor_id',bay['id'],(3.92,y+.25,.024),.22,'mint',(0,0,-math.pi/2))
    for z in [.55,1.35]:
        cylinder('Rack_bolt',(5.53,y+.6,z),.023,.02,'alloy','X',vertices=10)
# Trailer open roof and cutaway near side expose the incoming cargo.
box('Trailer_chassis',(-1.95,-3.1,-.24),(3.7,6.2,.42),'slate',.04)
box('Trailer_bed',(-1.95,-3.1,-.025),(3.58,6.15,.05),'alloy',.004)
for x in [-3.83,-.07]:
    height=1.7 if x< -2 else .28
    box('Trailer_side',(x,-3.1,height/2),(.12,6.2,height),'wall-light')
    box('Trailer_side_rail',(x,-3.1,height),(.15,6.2,.09),'alloy')
for y in [-.1,-1.6,-3.1,-4.6,-6.1]:
    box('Trailer_far_rib',(-3.745,y,.85),(.035,.065,1.65),'alloy',.005)
box('Trailer_front',(-1.95,-6.18,.74),(3.7,.12,1.48),'wall-light')
text('Trailer_brand','NORTHLINE',(-3.75,-4.5,.83),.22,'slate',(math.pi/2,0,math.pi/2))
for slot in M['truckSlots']:
    for side in [-.62,.62]:box('Cargo_slot_mark',(slot['x']+side,slot['y'],.012),(.025,1.25,.012),'amber',0)
# Cab sits outside the simulator's drivable floor.
box('Truck_cab',(-1.95,-7.15,.52),(3.13,1.65,1.44),'teal',.13)
box('Truck_roof',(-1.95,-7.03,1.36),(3.2,1.45,.12),'slate',.045)
box('Truck_windscreen',(-1.95,-7.99,.97),(2.68,.035,.55),'glass',.025)
box('Truck_grille',(-1.95,-8.0,.25),(1.6,.04,.33),'dark')
for x in [-3.08,-.82]:
    box('Truck_headlamp',(x,-8.01,.42),(.42,.04,.16),'warm-light',.025)
    box('Truck_mirror',(x+(-.42 if x<-2 else .42),-7.68,1.0),(.18,.22,.25),'slate')
for x in [-3.72,-.18]:
    for y in [-4.5,-5.4,-7.15]:
        cylinder('Truck_tyre',(x,y,-.15),.42,.24,'dark','X')
        cylinder('Truck_hub',(x+(-.13 if x<-2 else .13),y,-.15),.22,.028,'alloy','X')

# Forklift, +X forward. Dynamic parts are children of explicitly named pivot empties.
bundle='forklift'
forklift=empty('Forklift_Root')
box('Counterweight',(-.5,0,.54),(.76,.91,.7),'teal',.1,forklift)
box('Chassis',(.03,0,.35),(1.72,.9,.28),'slate',.04,forklift)
box('Battery_cover',(-.2,0,.77),(.65,.78,.15),'teal',.035,forklift)
box('Driver_floor',(.35,0,.55),(.62,.79,.075),'dark',.008,forklift)
box('Seat_base',(-.19,0,.95),(.43,.53,.12),'dark',.05,forklift)
box('Seat_back',(-.42,0,1.13),(.12,.53,.44),'dark',.04,forklift)
for y in [-.435,.435]:
    for x in [-.66,.45]:box('Guard_post',(x,y,1.19),(.045,.045,1.16),'slate',.008,forklift)
box('Overhead_guard',(-.08,0,1.82),(1.35,.97,.075),'slate',.02,forklift)
for x in [-.5,-.25,0,.25]:box('Guard_slat',(x,0,1.866),(.045,.83,.012),'alloy',.003,forklift)
cylinder('Steering_column',(.32,0,.96),.035,.52,'slate',parent=forklift)
cylinder('Steering_wheel',(.32,0,1.23),.16,.025,'dark',parent=forklift)
for y in [-.23,-.14]:
    cylinder('Hydraulic_lever',(.25,y,.95),.013,.32,'alloy',parent=forklift,vertices=10)
    cylinder('Lever_grip',(.25,y,1.12),.03,.07,'dark',parent=forklift,vertices=12)
for y in [-.45,.45]:
    box('Entry_step',(.0,y,.32),(.38,.1,.07),'alloy',.01,forklift)
    box('Forklift_nameplate',(-.54,y*1.025,.65),(.45,.014,.19),'slate',.005,forklift)
text('Forklift_brand','NL  /  01',(-.75,-.466,.6),.086,'white',(math.pi/2,0,0),forklift)
cylinder('Beacon_base',(-.48,.28,1.92),.085,.09,'dark',parent=forklift)
cylinder('Amber_beacon',(-.48,.28,2.0),.071,.09,'beacon',parent=forklift)
for y in [-.32,.32]:box('Mast_headlight',(.53,y,1.51),(.09,.13,.09),'warm-light',.01,forklift)
box('Rear_status',(-.889,0,.66),(.02,.27,.055),'status-light',.004,forklift)
for name,x,y in [('FL',.61,.385),('FR',.61,-.385),('RL',-.59,.385),('RR',-.59,-.385)]:
    steering=empty('Steer_'+name,(x,y,.24),forklift) if name.startswith('R') else None
    wheel=empty('Wheel_'+name,(0,0,0) if steering else (x,y,.24),steering or forklift)
    cylinder('Tyre_'+name,(0,0,0),.24,.17,'dark','Y',wheel,24)
    cylinder('Wheel_hub_'+name,(0,.09 if y>0 else -.09,0),.115,.025,'alloy','Y',wheel,16)
    for angle in [0,math.pi/2,math.pi,3*math.pi/2]:
        cylinder('Wheel_bolt',(math.cos(angle)*.075,.106 if y>0 else -.106,math.sin(angle)*.075),.013,.016,'slate','Y',wheel,8)
for y in [-.38,.38]:box('Outer_mast',(.83,y,1.0),(.13,.10,2.0),'slate',.012,forklift)
box('Mast_top',(.83,0,1.96),(.13,.8,.1),'slate',.012,forklift)
mast=empty('Mast_Lift',(0,0,0),forklift)
for y in [-.28,.28]:
    box('Inner_mast',(.87,y,.96),(.07,.065,1.77),'alloy',.007,mast)
    cylinder('Lift_ram',(.78,y,.81),.025,1.4,'alloy',parent=forklift,vertices=12)
carriage=empty('Fork_Carriage',(0,0,.1),forklift)
box('Fork_backplate',(.98,0,.29),(.075,.86,.54),'slate',.009,carriage)
for y in [-.28,.28]:
    box('Fork_vertical',(1.01,y,.25),(.075,.095,.5),'alloy',.008,carriage)
    box('Fork_tine',(1.45,y,.018),(.94,.095,.036),'alloy',.007,carriage)
for y in [-.3,-.15,0,.15,.3]:box('Load_guard',(1.015,y,.65),(.03,.025,.52),'slate',.003,carriage)
box('Load_guard_top',(1.015,0,.91),(.03,.76,.03),'slate',.003,carriage)

# Two cargo arrangements, same collision footprint, with visible fork pockets.
def pallet(variant):
    global bundle
    bundle='pallet-'+variant
    root=empty('Pallet_'+variant.upper())
    for y in [-.44,0,.44]:box('Bottom_runner',(0,y,.023),(1.1,.17,.045),'wood',.006,root)
    for x in [-.45,0,.45]:
        for y in [-.44,0,.44]:box('Pallet_block',(x,y,.098),(.17,.17,.10),'wood',.008,root)
    for x in [-.47,-.235,0,.235,.47]:box('Deck_board',(x,0,.166),(.16,1.1,.028),'wood-light',.004,root)
    if variant=='a':
        for x in [-.245,.245]:
            for y in [-.245,.245]:
                box('Carton',(x,y,.48),(.475,.475,.60),'carton-light' if x<0 else 'carton',.012,root)
                box('Carton_tape',(x,y,.786),(.06,.475,.01),'wood-light',.001,root)
    else:
        box('Crate',(0,0,.53),(.99,.99,.70),'carton',.018,root)
        for z in [.27,.78]:
            for y in [-.503,.503]:box('Crate_batten',(0,y,z),(1.0,.025,.065),'wood-light',.005,root)
    for x in [-.29,.29]:
        box('Cargo_strap',(x,0,.795 if variant=='a' else .89),(.025,.99,.012),'strap',.001,root)
        for y in [-.497,.497]:box('Cargo_strap_side',(x,y,.50),(.025,.012,.59),'strap',.001,root)
    box('Shipping_label',(-.06,-.503,.51),(.38,.012,.23),'white',.003,root)
    for index in range(11):
        box('Barcode',(-.21+index*.023,-.512,.47),(.007 if index%3 else .012,.003,.07),'dark',0,root)
    text('Cargo_label','NORTHLINE',(-.21,-.513,.565),.042,'slate',(math.pi/2,0,0),root)
    return root
pallet_a=pallet('a');pallet_b=pallet('b')

# Batch meshes sharing a material and a pivot. No dynamic pivot is joined away.
def batch_meshes():
    groups={}
    for obj in list(scene.objects):
        if obj.type=='MESH':
            key=(obj['bundle'],obj.parent.name if obj.parent else '',obj.data.materials[0].name)
            groups.setdefault(key,[]).append(obj)
    for (pack,parent,mat),objects in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        if len(objects)>1:bpy.ops.object.join()
        objects[0].name=pack+'_'+(parent or 'static')+'_'+mat
batch_meshes()
report={'blender':bpy.app.version_string,'manifestHash':hashlib.sha256((SOURCE/'manifest.json').read_bytes()).hexdigest(),'source':'assets/warehouse-demo/warehouse.blend','bundles':{}}
for name in ['environment','forklift','pallet-a','pallet-b']:
    bpy.ops.object.select_all(action='DESELECT')
    objects=[obj for obj in scene.objects if obj.get('bundle')==name]
    for obj in objects:obj.select_set(True)
    meshes=[obj for obj in objects if obj.type=='MESH']
    for obj in meshes:obj.data.calc_loop_triangles()
    path=OUT/(name+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_cameras=False,export_lights=False,export_apply=True)
    report['bundles'][name]={'bytes':path.stat().st_size,'meshes':len(meshes),'triangles':sum(len(obj.data.loop_triangles) for obj in meshes),'pivots':[obj.name for obj in objects if obj.type=='EMPTY']}
(OUT/'manifest.json').write_text(json.dumps(M,indent=2)+'\n')
# Arrange the source scene for an immediately readable Blender view after export.
forklift.location=(-2.8,1.7,0);forklift.rotation_euler.z=-math.pi/2
pallet_a.location=(-2.8,-2.1,0);pallet_b.location=(-1,-4.1,0)
light_data=bpy.data.lights.new('Warehouse_preview_key','AREA');light_data.energy=2200;light_data.shape='DISK';light_data.size=10
light=bpy.data.objects.new('Warehouse_preview_key',light_data);scene.collection.objects.link(light);light.location=(0,5,10)
for area in bpy.context.screen.areas if bpy.context.screen else []:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_distance=25
        area.spaces.active.region_3d.view_location=Vector((0,4,0))
# Save only this scene and its dependencies, excluding unrelated user scenes.
bpy.data.libraries.write(str(SOURCE/'warehouse.blend'),{scene},fake_user=True,compress=True)
(DOC/'asset-export.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
