import random, sys, time
sys.path.insert(0, '.')
from lib import Canvas
from palette import c
import tiles as TL

t0 = time.time()
sheet, meta = TL.build_tileset()
print('tileset', sheet.w, sheet.h, f'{time.time()-t0:.1f}s')
sheet.save('out/tileset_full.png')
# mock scene: 30x17 tiles, with tunnels
W, H = 30, 17
rnd = random.Random(3)
grid = [[0]*W for _ in range(H)]
names = TL.TILE_NAMES
def nm(n): return names.index(n)
bands = [('turf',0,1),('dirt',1,4),('clay',4,6),('stone',6,9),('sandstone',9,11),('limestone',11,12),('crystalrock',12,14),('basalt',14,15),('voidstone',15,17)]
for name,a,b in bands:
    for y in range(a,b):
        for x in range(W): grid[y][x]=nm(name)
ores = {'stone':['copper','quartz'],'dirt':['lampmoss'],'limestone':['silver','fossil'],'sandstone':['amber'],'crystalrock':['gold','sapphire','glimmer'],'basalt':['fireopal','ruby','ember'],'voidstone':['starmetal','prism','voidglass']}
for y in range(H):
    for x in range(W):
        base = names[grid[y][x]]
        if base in ores and rnd.random()<0.18: grid[y][x]=nm(rnd.choice(ores[base]))
for x in range(W): grid[y][0]=nm('bedrock')
for y in range(H): grid[y][0]=grid[y][W-1]=nm('bedrock')
# tunnels
x,y=14,0
for i in range(60):
    for dx in range(2):
        for dy in range(2):
            if 0<x+dx<W-1 and 0<=y+dy<H: grid[y+dy][x+dx]=0
    d=rnd.choice([(0,1),(0,1),(1,0),(-1,0)]); x=max(1,min(W-3,x+d[0])); y=min(H-2,y+d[1])
for y in range(3,7):
    for x in range(3,11): grid[y][x]=0
for y in range(9,12):
    for x in range(18,27): grid[y][x]=0
grid[2][6]=nm('boulder')
bw = TL.build_backwall("soil", 301); ao = TL.ao_tiles()
scene = Canvas(W*16, H*16)
for y in range(0,H*16,64):
    for x in range(0,W*16,64): scene.blit(bw,x,y)
def solid(x,y):
    if x<0 or x>=W: return True
    if y<0: return False
    if y>=H: return True
    return grid[y][x]!=0
for y in range(H):
    for x in range(W):
        t=grid[y][x]
        if not t:
            m=(1 if solid(x,y-1) else 0)|(2 if solid(x+1,y) else 0)|(4 if solid(x,y+1) else 0)|(8 if solid(x-1,y) else 0)
            scene.blit(ao[m],x*16,y*16)
            continue
        m=(1 if not solid(x,y-1) else 0)|(2 if not solid(x+1,y) else 0)|(4 if not solid(x,y+1) else 0)|(8 if not solid(x-1,y) else 0)
        v=(x%4)+(y%4)*4
        idx=m*16+v
        col=idx%64; row=t*4+idx//64
        scene.blit(sheet.crop(col*16,row*16,16,16),x*16,y*16)
scene.save('out/mock_scene.png', scale=2)
print('done', f'{time.time()-t0:.1f}s')
