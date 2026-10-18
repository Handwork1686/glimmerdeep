import sys; sys.path.insert(0,'.')
from PIL import Image
from lib import Canvas
from palette import c
import tiles as TL
sheet = Canvas(1,1); sheet.a = __import__('numpy').array(Image.open('out/tileset_full.png'))
sheet.h, sheet.w = sheet.a.shape[:2]
names = TL.TILE_NAMES[1:]
cols = 8
out = Canvas(cols*(2*16+6)+4, ((len(names)+cols-1)//cols)*(16*2+12)+4, c('void2'))
for i,n in enumerate(names):
    mi = TL.TILE_NAMES.index(n)
    x = 4 + (i%cols)*(2*16+6); y = 4+(i//cols)*(16*2+12)
    for k,(mask) in enumerate([0,15]):
        for v in range(2) if mask==0 else range(1):
            pass
    # 2x2 block of interior (mask 0) variants 0,1,4,5
    for j,v in enumerate([0,1,4,5]):
        idx=v; col=idx%64; row=mi*4+idx//64
        out.blit(sheet.crop(col*16,row*16,16,16), x+(j%2)*16, y+(j//2)*16)
out.save('out/contact_tiles.png', scale=3)
