import sys
from PIL import Image, ImageDraw
out = sys.argv[1]
S = 1024
def ribbon(d, x, y, w, h, fill):
    notch = h * 0.22
    d.polygon([(x, y), (x+w, y), (x+w, y+h), (x+w/2, y+h-notch), (x, y+h)], fill=fill)
img = Image.new("RGBA", (S, S), (0,0,0,0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([0, 0, S-1, S-1], radius=S*0.22, fill=(26,115,232,255))
w, h = S*0.36, S*0.56
# 後ろのブックマーク（待機中モード）
ribbon(d, S*0.40, S*0.16, w, h, (255,255,255,150))
# 前のブックマーク（アクティブモード）。背景色の縁取りで後ろと分離
g = S*0.035
ribbon(d, S*0.24-g, S*0.28-g, w+2*g, h+2*g, (26,115,232,255))
ribbon(d, S*0.24, S*0.28, w, h, (255,255,255,255))
for n in (16, 32, 48, 128):
    img.resize((n, n), Image.LANCZOS).save(f"{out}/icon{n}.png")
img.resize((256,256), Image.LANCZOS).save(f"{out}/preview.png")
