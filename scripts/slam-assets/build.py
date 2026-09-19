"""Rebuild original lab assets in an isolated Blender --background --factory-startup process.
Pass -- --sample to export only the material/bench gate, before building the complete kit.
"""
import bpy, json, math, sys, hashlib
from pathlib import Path
import numpy as np
from mathutils import Vector, Matrix
ROOT=Path(__file__).resolve().parents[2]
SRC=ROOT/'assets/slam-demo'
OUT=ROOT/'apps/slam-demo/public/assets/slam'
DOC=ROOT/'docs/slam-demo/phase2'
for p in (SRC/'textures',OUT,DOC): p.mkdir(parents=True,exist_ok=True)
M=json.loads((SRC/'manifest.json').read_text())
SAMPLE='--sample' in sys.argv
# The wall kit is authored in 2 m bays. Reject incompatible room sizes explicitly.
assert M['world']=={'width':10,'depth':8}, 'Reauthor wall bays when changing room dimensions'
MODULE_BOUNDS={}
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.context.scene.unit_settings.system='METRIC';bpy.context.scene.unit_settings.scale_length=1
bpy.context.preferences.filepaths.save_version=0
bpy.context.scene.render.engine='CYCLES'
bpy.context.scene.world.color=(.12,.12,.12)
COLLECTION='lab'; MATERIALS={}

def image(name,array,noncolor=False):
    n=array.shape[0];im=bpy.data.images.new(name,width=n,height=n,alpha=True)
    if noncolor: im.colorspace_settings.name='Non-Color'
    im.pixels.foreach_set(array.astype(np.float32).ravel());im.filepath_raw=str(SRC/'textures'/f'{name}.png');im.file_format='PNG';im.save();return im

# Bake seeded procedural surface color, roughness and tangent-space detail normals to UV tiles.
n=256;y,x=np.mgrid[0:n,0:n];rng=np.random.default_rng(42)
grains=rng.normal(0,.025,(n,n));grooves=np.sin(x*.22)*.007
height=grains*.12+grooves;dy,dx=np.gradient(height)
rgba=np.ones((n,n,4));rgba[:,:,:3]=np.stack([.5-dx*2,.5-dy*2,np.ones_like(dx)],axis=-1)
normal=image('surface-normal',rgba,True)
rgba=np.ones((n,n,4));rough=np.clip(.68+grains*2,.35,.9);rgba[:,:,:3]=rough[:,:,None]
roughness=image('surface-roughness',rgba,True)
rgba=np.ones((n,n,4));tone=np.clip(.48+grains+(np.sin(x*.03)*np.sin(y*.02))*.03,0,1);rgba[:,:,:3]=tone[:,:,None]*np.array([.93,1,1.015])
floor_image=image('floor-albedo',rgba)

def material(name,color,metal=0,rough=.6,detail=False,emission=0):
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(*color,1);bsdf.inputs['Metallic'].default_value=metal;bsdf.inputs['Roughness'].default_value=rough
    if emission:
        bsdf.inputs['Emission Color'].default_value=(*color,1);bsdf.inputs['Emission Strength'].default_value=emission
    if detail:
        tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=normal
        norm=mat.node_tree.nodes.new('ShaderNodeNormalMap');norm.inputs['Strength'].default_value=.25
        mat.node_tree.links.new(tex.outputs['Color'],norm.inputs['Color']);mat.node_tree.links.new(norm.outputs['Normal'],bsdf.inputs['Normal'])
        tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=roughness;mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Roughness'])
    MATERIALS[name]=mat;return mat
material('paint-teal',(.025,.135,.14),.3,.4,True)
material('paint-slate',(.075,.12,.15),.2,.5,True)
material('wall-ivory',(.55,.61,.6),0,.8)
material('panel-light',(.34,.42,.43),.25,.5)
material('alloy',(.45,.52,.55),.78,.3)
material('rubber',(.009,.015,.019),0,.85)
material('amber',(.8,.38,.055),.1,.6)
material('white',(.77,.84,.81),0,.5)
material('screen',(.016,.04,.05),.3,.23)
material('cyan-light',(.16,.75,.62),.1,.3,False,1.8)
material('warm-light',(1,.69,.34),.1,.4,False,2)
mat=material('floor',(.42,.48,.48),.1,.72,True)
t=mat.node_tree.nodes.new('ShaderNodeTexImage');t.image=floor_image;mat.node_tree.links.new(t.outputs['Color'],mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])

counter={}
def tag(obj,name,mat=None,parent=None):
    counter[name]=counter.get(name,0)+1;obj.name=f'{name}_{counter[name]:03}'
    obj['asset_id']=f'{COLLECTION}/{obj.name}';obj['bundle']=COLLECTION
    if mat:obj.data.materials.append(MATERIALS[mat])
    if parent:obj.parent=parent
    return obj

def box(name,loc,dim,mat,bevel=.015,parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=tag(bpy.context.object,name,mat,parent);o.dimensions=dim
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new('Edge highlights','BEVEL');mod.width=min(bevel,min(dim)/4);mod.segments=2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    uv=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
    for face in o.data.polygons:
        axis=max(range(3),key=lambda i:abs(face.normal[i]));axes=[i for i in range(3) if i!=axis]
        for loop in face.loop_indices:
            co=o.data.vertices[o.data.loops[loop].vertex_index].co;uv.data[loop].uv=(co[axes[0]]*2,co[axes[1]]*2)
    return o

def cyl(name,loc,r,depth,mat,axis='Z',parent=None,vertices=20):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=loc);o=tag(bpy.context.object,name,mat,parent)
    if axis=='Y':o.rotation_euler.x=math.pi/2
    if axis=='X':o.rotation_euler.y=math.pi/2
    for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
    return o

def empty(name,loc,bundle=None):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=loc;o['bundle']=bundle or COLLECTION;o['asset_id']=name;return o

def text(name,body,loc,size,mat,orientation='north'):
    curve=bpy.data.curves.new(name,'FONT');curve.body=body;curve.size=size;curve.extrude=.0007;curve.space_character=1.15
    o=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(o);o.location=loc
    if orientation=='north':o.rotation_euler=(math.pi/2,0,0)
    elif orientation=='east':o.rotation_euler=(math.pi/2,0,-math.pi/2)
    elif orientation=='floor':pass
    tag(o,name,mat);bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False);return o

def cable(name,points,r=.015,mat='rubber'):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.bevel_depth=r;curve.bevel_resolution=1
    sp=curve.splines.new('POLY');sp.points.add(len(points)-1)
    for p,co in zip(sp.points,points):p.co=(*co,1)
    ob=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(ob);tag(ob,name,mat)
    bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob;bpy.ops.object.convert(target='MESH');ob.select_set(False)

def fit_module(before, module_id, origin, dimensions):
    spec=next(o for o in M['obstacles'] if o['id']==module_id)
    scale=Matrix.Diagonal((spec['width']/dimensions[0],spec['depth']/dimensions[1],spec['height']/dimensions[2],1))
    transform=Matrix.Translation((spec['x'],spec['y'],0)) @ scale @ Matrix.Translation((-origin[0],-origin[1],0))
    objects=[o for o in bpy.context.scene.objects if o.name not in before]
    bpy.context.view_layer.update()
    for ob in objects:
        ob.matrix_world=transform @ ob.matrix_world;ob['collision_module']=module_id
    bpy.context.view_layer.update()
    points=[ob.matrix_world @ Vector(corner) for ob in objects if ob.type=='MESH' for corner in ob.bound_box]
    bounds={'min':[min(p[i] for p in points) for i in range(3)],'max':[max(p[i] for p in points) for i in range(3)]}
    # Props may rise above the base cabinet, but their horizontal extents must remain in its solid footprint.
    for i,(center,extent) in enumerate([(spec['x'],spec['width']),(spec['y'],spec['depth'])]):
        assert bounds['min'][i]>=center-extent/2-.015 and bounds['max'][i]<=center+extent/2+.015, (module_id,bounds)
    MODULE_BOUNDS[module_id]=bounds

def bench():
    before=set(bpy.context.scene.objects.keys())
    o=next(o for o in M['obstacles'] if o['id']=='workbench');cx,cy=o['x'],o['y']
    box('bench-plinth',(cx,cy,.065),(2.96,.66,.13),'rubber')
    box('bench-carcass',(cx,cy,.44),(2.96,.66,.75),'paint-teal')
    box('bench-top',(cx,cy,.875),(3,.7,.05),'alloy')
    for j in range(4):
        px=cx-1.1+j*.73
        for k in range(3):
            z=.23+k*.205;box('drawer',(px,cy-.32,z),(.66,.018,.18),'paint-slate',.006)
            box('drawer-pull',(px,cy-.335,z+.045),(.32,.025,.018),'alloy',.004)
        box('cabinet-id',(px-.18,cy-.333,.69),(.19,.012,.045),'white',.002)
        text('drawer-label',f'B-{j+1:02}',(px-.25,cy-.344,.68),.029,'rubber')
    # Pegboard and tools remain above the solid bench's footprint.
    box('pegboard',(cx,cy+.25,1.48),(2.96,.055,.95),'paint-slate')
    for row in range(5):
        for col in range(22):cyl('peg-hole',(cx-1.37+col*.13,cy+.216,1.09+row*.16),.012,.003,'rubber','Y',vertices=8)
    for j in range(7):
        px=cx-1.23+j*.17;box('tool-grip',(px,cy+.18,1.35+(.1 if j%2 else 0)),(.037,.045,.16),'amber' if j%2 else 'paint-teal',.01)
        box('tool-shaft',(px,cy+.18,1.53+(.1 if j%2 else 0)),(.016,.02,.23),'alloy',.002)
    box('oscilloscope',(cx+.7,cy,1.04),(.53,.38,.27),'panel-light')
    box('scope-display',(cx+.64,cy-.197,1.06),(.32,.009,.17),'screen',.005)
    for j in range(9):box('waveform',(cx+.505+j*.031,cy-.204,1.065+math.sin(j*.9)*.04),(.023,.004,.006),'cyan-light',0)
    for j in range(3):cyl('scope-knob',(cx+.91,cy-.208,.97+j*.064),.023,.02,'rubber','Y')
    box('parts-tray',(cx-.35,cy-.12,.94),(.48,.33,.07),'rubber')
    for j in range(5):cyl('tray-fastener',(cx-.5+j*.072,cy-.12,.985),.022,.025,'alloy')
    box('light-bar',(cx,cy+.1,2.04),(2.9,.2,.08),'alloy')
    box('light-diffuser',(cx,cy+.1,1.995),(2.7,.14,.012),'warm-light',0)
    text('bench-mark','01 / INSTRUMENTS',(cx-1.3,cy+.21,1.87),.065,'white')
    fit_module(before,'workbench',(cx,cy),(3,.7,.9))

def service_panel(label, location, angle, seed):
    # Physical maintenance-panel artwork, visible to people and both cameras.
    # The vision worker receives only rendered pixels, never these identifiers/geometry.
    before=set(bpy.context.scene.objects.keys());rng=np.random.default_rng(seed)
    box('service-plate',(0,0,.73),(1.5,.018,1.16),'paint-slate',.004)
    text('service-title',label,(-.68,-.013,1.19),.07,'white')
    text('service-rating','48 V / 05 A',(-.68,-.013,1.07),.045,'amber')
    for j in range(4):
        x=-.57+j*.35
        text('service-channel',f'{seed%97:02}-{j+1}',(x-.08,-.014,.29),.042,'white')
        for row in range(4):
            z=.45+row*.14
            box('circuit-node',(x,-.013,z),(.075,.008,.048),'white',.002)
            length=float(rng.uniform(.06,.22))
            box('circuit-wire',(x+length/2,-.014,z), (length,.006,.012),'white',0)
            box('circuit-branch',(x+length,-.014,z+.035),(.012,.006,.082),'white',0)
            if rng.random()>.5:box('circuit-terminal',(x+length,-.016,z+.07),(.04,.006,.032),'amber',0)
    for x in [-.70,.70]:
        for z in [.20,1.23]:cyl('service-fastener',(x,-.014,z),.014,.008,'alloy','Y',vertices=8)
    transform=Matrix.Translation(location) @ Matrix.Rotation(angle,4,'Z')
    bpy.context.view_layer.update()
    for ob in bpy.context.scene.objects:
        if ob.name not in before:ob.matrix_world=transform @ ob.matrix_world

bench()
if not SAMPLE:
    # Floor, modular wall bays and service infrastructure.
    box('slab',(0,0,-.14),(10.2,8.2,.28),'paint-slate')
    box('floor',(0,0,-.015),(10,8,.03),'floor',0)
    for i in range(-4,5):box('floor-joint',(i,0,.001),(.008,8,.002),'paint-slate',0)
    for i in range(-3,4):box('floor-joint',(0,i,.001),(10,.008,.002),'paint-slate',0)
    for i in range(5):
        x=-4+i*2
        box('north-bay',(x,4.08,1.4),(1.96,.16,2.8),'wall-ivory')
        box('north-lower',(x,3.987,.44),(1.94,.022,.87),'panel-light')
        box('north-rail',(x,3.96,.91),(1.96,.04,.06),'alloy')
        box('north-column',(x-.98,3.98,1.42),(.065,.13,2.85),'paint-slate')
    for i in range(4):
        y=-3+i*2
        box('west-bay',(-5.08,y,1.4),(.16,1.96,2.8),'wall-ivory')
        box('west-lower',(-4.987,y,.44),(.022,1.94,.87),'panel-light')
        box('west-column',(-4.98,y-.98,1.42),(.13,.065,2.85),'paint-slate')
    for x in [-4,0,4]:
        box('service-beam',(x,0,2.87),(.09,8.1,.12),'paint-slate')
        for y in [-2,1.8]:
            box('ceiling-light',(x,y,2.78),(1.2,.26,.08),'alloy')
            box('ceiling-diffuser',(x,y,2.735),(1.1,.2,.012),'white',0)
    for i in range(30):box('cable-tray-rung',(-4.68,-3.8+i*.26,2.62),(.35,.025,.025),'alloy',0)
    for x in [-4.82,-4.55]:box('tray-rail',(x,0,2.62),(.025,7.8,.06),'alloy',0)
    cable('service-cable',[(-4.7,-3.7,2.67),(-4.7,3.65,2.67),(-3.5,3.65,2.67),(-3.5,3.65,.99)],.024,'rubber')
    # Fit authored modules to the manifest's position and collision dimensions.
    before=set(bpy.context.scene.objects.keys())
    box('island-plinth',(0,0,.07),(2.9,1.9,.14),'rubber')
    box('island-body',(0,0,.43),(2.96,1.90,.7),'paint-teal')
    box('island-top',(0,0,.825),(3,2,.05),'panel-light')
    for x in [-1,-.33,.33,1]:
        for side in [-1,1]:
            box('island-door',(x,side*.96,.44),(.6,.018,.61),'paint-slate')
            box('island-handle',(x+.2,side*.978,.48),(.025,.025,.2),'alloy',.004)
    box('island-mat',(-.25,0,.856),(1.65,1.35,.01),'rubber',0)
    # Inspection jig, small actuated-looking fixture and patterned target.
    box('jig-base',(-.45,.1,.89),(.6,.6,.06),'alloy')
    for x in [-.68,-.22]:
        for y in [-.12,.32]:cyl('jig-post',(x,y,1.01),.023,.21,'alloy')
    box('jig-bridge',(-.45,.1,1.135),(.6,.12,.05),'amber')
    cyl('sample-cylinder',(-.45,.1,1.01),.11,.18,'paint-teal')
    box('instrument',(1,.2,1.02),(.5,.6,.3),'panel-light')
    box('instrument-screen',(1,-.107,1.05),(.34,.014,.16),'screen')
    text('instrument-name','CAL / 02',(.83,-.12,.925),.041,'white')
    for i in range(5):box('instrument-meter',(.87+i*.06,-.12,1.04),(.023,.005,.045+i*.012),'cyan-light',0)
    box('target-board',(.55,.69,1.03),(.49,.025,.35),'white')
    for r in range(4):
        for c in range(6):
            if (r+c)%2==0:box('target-check',(.35+c*.077,.672,.9+r*.077),(.077,.007,.077),'rubber',0)
    cable('jig-wire',[(-.1,.1,.87),(.1,.4,.87),(.6,.4,.87),(.8,.3,1)],.011,'amber')
    text('island-label','02 / CALIBRATION',(-1.25,-.993,.64),.11,'white')
    fit_module(before,'island',(0,0),(3,2,.85))
    before=set(bpy.context.scene.objects.keys())
    # Shelving: four bays; boxes stay within the manifest solid footprint.
    for y in [-1.12,-.18,.76,1.7]:
        for x in [4.105,4.595]:box('shelf-upright',(x,y,.725),(.035,.035,1.45),'alloy',.004)
    for z in [.1,.55,1.03,1.42]:box('shelf',(4.35,.3,z),(.55,3,.035),'alloy',.005)
    for row,z in enumerate([.29,.76,1.23]):
        for col,y in enumerate([-.86,-.28,.32,.92,1.49]):
            box('storage-bin',(4.34,y,z),(.4,.45,.26),'paint-teal' if (row+col)%3 else 'amber')
            box('bin-label',(4.132,y,z),(.01,.2,.065),'white',.002)
            text('bin-number',f'{row+1}{col+1}',(4.122,y-.045,z-.017),.035,'rubber','east')
    fit_module(before,'storage',(4.35,.3),(.55,3,1.45))
    # Dock pad and durable floor markings are flush, not new collision solids.
    box('dock-pad',(0,-2.5,.002),(.84,.78,.004),'paint-teal',0)
    for x in [-.44,.44]:box('dock-edge',(x,-2.5,.005),(.025,.85,.005),'cyan-light',0)
    text('dock-title','03 / DOCK',(-.45,-3.3,.007),.15,'white','floor')
    text('floor-title','ROBOTICS LAB',(-3.8,-3.6,.008),.25,'white','floor')
    text('north-title','INSPECTION / 01',(-.3,3.975,2.25),.19,'paint-slate')
    text('north-subtitle','AUTONOMOUS SYSTEMS',(-.3,3.973,2.06),.065,'paint-slate')
    for i in range(7):
        stripe=box('caution-stripe',(1.3+i*.17,-1.35,.005),(.075,.24,.008),'amber',0);stripe.rotation_euler.z=-.45
    for obstacle in M['obstacles']:
        node=empty('Collision_'+obstacle['id'],[obstacle['x'],obstacle['y'],obstacle['height']/2]);node['collision_footprint']=json.dumps(obstacle)
    for anchor in M['anchors']:empty(anchor['id'],anchor['position'])
    for i,x in enumerate([-4,-2,0,2,4]):service_panel(f'N / SERVICE {i+1:02}',(x,3.947,0),0,100+i)
    for i,y in enumerate([-3,-1,1,3]):service_panel(f'W / POWER {i+1:02}',(-4.955,y,0),math.pi/2,200+i)
    # Separate near-wall bundle is visible from robot eye, cut away in the overview.
    COLLECTION='cutaway'
    for y in [-3,-1,1,3]:box('east-bay',(5.08,y,1.4),(.16,1.96,2.8),'wall-ivory')
    for x in [-4,-2,0,2,4]:box('south-bay',(x,-4.08,1.4),(1.96,.16,2.8),'wall-ivory')
    for y in [-3,-1,1,3]:box('east-lower',(4.987,y,.45),(.02,1.95,.9),'panel-light')
    text('east-number','B / STORAGE',(4.975,-1.5,2.1),.2,'paint-slate','east')
    for i,y in enumerate([-3,-1,1,3]):service_panel(f'E / CONTROL {i+1:02}',(4.955,y,0),-math.pi/2,300+i)
    for i,x in enumerate([-4,-2,0,2,4]):service_panel(f'S / SYSTEM {i+1:02}',(x,-3.955,0),math.pi,400+i)
    COLLECTION='rover'
    box('rover-chassis',(0,0,.18),(M['robot']['bodyLength'],M['robot']['bodyWidth'],.16),'paint-teal',.028)
    box('rover-skid',(0,0,.105),(.4,.3,.035),'rubber')
    box('rover-top',(-.02,0,.28),(.36,.3,.05),'panel-light')
    for y in [-.145,.145]:box('rover-rail',(-.03,y,.315),(.35,.013,.023),'alloy',.004)
    for x in [-.14,-.09,-.04,.01,.06]:box('cooling-slot',(x,0,.309),(.016,.16,.008),'rubber',.002)
    for x in [-.17,.13]:
        for y in [-.12,.12]:cyl('top-fastener',(x,y,.313),.007,.005,'alloy',vertices=8)
    box('bumper',(.238,0,.16),(.025,.31,.04),'rubber')
    box('status-bar',(.253,0,.21),(.008,.17,.014),'cyan-light',.002)
    box('stereo-mast',(.12,0,.365),(.027,.032,.14),'alloy',.006)
    box('stereo-housing',(.127,0,.45),(.058,.185,.06),'paint-slate',.012)
    for name in ['Camera_Left','Camera_Right']:
        loc=M['mounts'][name];mount=empty(name,loc);mount['optical_to_robot']=json.dumps(M['calibration']['opticalToRobot'])
        cyl('lens-rim',(loc[0]-.004,loc[1],loc[2]),.023,.025,'alloy','X',vertices=24)
        cyl('lens-glass',(loc[0]+.009,loc[1],loc[2]),.016,.003,'screen','X',vertices=24)
    for name in ['Wheel_Left','Wheel_Right']:
        pivot=empty(name,M['mounts'][name]);sign=1 if name.endswith('Left') else -1
        cyl('tire',(0,0,0),M['robot']['wheelRadius'],.05,'rubber','Y',pivot,32)
        cyl('wheel-hub',(0,sign*.027,0),.052,.006,'alloy','Y',pivot,24)
        cyl('wheel-cap',(0,sign*.032,0),.017,.008,'paint-teal','Y',pivot,16)
        for j in range(16):
            a=j*math.tau/16;ob=box('tread',(math.sin(a)*.079,0,math.cos(a)*.079),(.023,.052,.008),'paint-slate',.002,pivot);ob.rotation_euler.y=a
        for j in range(5):
            a=j*math.tau/5;cyl('hub-fastener',(math.sin(a)*.036,sign*.032,math.cos(a)*.036),.005,.005,'rubber','Y',pivot,8)
    cyl('rear-caster',(-.16,0,.06),.035,.03,'rubber','Y')
    text('rover-name','R-01',(-.15,-.194,.18),.042,'white')

# Editable source keeps every named module and original UV/material setup.
for im in bpy.data.images:
    if im.source=='FILE' or im.name.startswith(('surface-','floor-')):im.pack()
source=SRC/('workbench.blend' if SAMPLE else 'inspection-lab.blend')
bpy.ops.wm.save_as_mainfile(filepath=str(source),compress=True)

# Runtime geometry merged per material and parent, preserving animated wheel pivots and named anchors.
report={'blender':bpy.app.version_string,'manifestHash':hashlib.sha256((SRC/'manifest.json').read_bytes()).hexdigest(),'source':str(source.relative_to(ROOT)),'moduleBounds':MODULE_BOUNDS,'bundles':{}}
for bundle in (['lab'] if SAMPLE else ['lab','cutaway','rover']):
    objects=[o for o in bpy.context.scene.objects if o.get('bundle')==bundle]
    groups={}
    for o in objects:
        if o.type=='MESH':groups.setdefault((o.parent.name if o.parent else '',o.data.materials[0].name),[]).append(o)
    for (parent,mat),group in groups.items():
        ids=[o.get('asset_id') for o in group];bpy.ops.object.select_all(action='DESELECT')
        for o in group:o.select_set(True)
        bpy.context.view_layer.objects.active=group[0]
        if len(group)>1:bpy.ops.object.join()
        o=bpy.context.object;o.name=f'{bundle}_{parent or "static"}_{mat}';o['source_asset_ids']=json.dumps(ids);o['bundle']=bundle
    bpy.ops.object.select_all(action='DESELECT')
    objects=[o for o in bpy.context.scene.objects if o.get('bundle')==bundle]
    for o in objects:o.select_set(True)
    triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects if o.type=='MESH')
    name='workbench' if SAMPLE else ('rover' if bundle=='rover' else bundle)
    path=OUT/f'{name}.glb'
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_materials='EXPORT',export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6)
    report['bundles'][name]={'bytes':path.stat().st_size,'triangles':triangles,'meshNodes':sum(o.type=='MESH' for o in objects),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
(OUT/'scene-manifest.json').write_text(json.dumps(M,indent=2)+'\n')
(DOC/('sample-export.json' if SAMPLE else 'asset-export.json')).write_text(json.dumps(report,indent=2)+'\n')
print('SLAM_ASSET_REPORT '+json.dumps(report))
