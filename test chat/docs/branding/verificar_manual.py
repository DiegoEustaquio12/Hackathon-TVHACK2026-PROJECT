#!/usr/bin/env python3
"""Validación estructural; la revisión visual de los PNG es adicional."""
from pathlib import Path
import hashlib, json
from PIL import Image, ImageDraw
from pypdf import PdfReader
from pypdf.generic import ContentStream

ROOT=Path(__file__).resolve().parent
pdf=ROOT/'KNECTAN_MANUAL_IDENTIDAD_GRAFICA_A4_v1.0.pdf'
r=PdfReader(pdf)
assert len(r.pages)==23
fonts={};sizes=[];texts=[];instances=[];image_pixels=[]
original=Image.open(ROOT/'recursos/knectan-logo-referencia.png').convert('RGB')
for i,p in enumerate(r.pages,1):
    sz=(float(p.mediabox.width),float(p.mediabox.height))
    assert abs(sz[0]-595.27559)<.02 and abs(sz[1]-841.88976)<.02
    assert int(p.get('/Rotate',0))==0
    sizes.append(sz)
    txt=p.extract_text()
    assert len(txt)>100 and '\ufffd' not in txt and '\u25a0' not in txt
    texts.append(txt)
    for item in p['/Resources']['/Font'].get_object().values():
        f=item.get_object();desc=f.get('/FontDescriptor');d=desc.get_object() if desc else {}
        embedded=bool(d.get('/FontFile') or d.get('/FontFile2') or d.get('/FontFile3'))
        fonts[str(f.get('/BaseFont'))]=embedded
    for image in p.images:
        im=image.image.convert('RGB')
        assert im.size==original.size
        permitted=[Image.open(q).convert('RGB').tobytes() for q in (ROOT/'recursos').glob('*.png')]
        assert im.tobytes() in permitted
        image_pixels.append(i)
    # ReportLab emite una transformación local por cada inserción del PNG.
    stream=ContentStream(p.get_contents(),r)
    matrix=(1.,0.,0.,1.,0.,0.);stack=[]
    for args,op in stream.operations:
        if op==b'q': stack.append(matrix)
        elif op==b'Q': matrix=stack.pop()
        elif op==b'cm':
            a,b,c,d,e,f=map(float,args);aa,bb,cc,dd,ee,ff=matrix
            matrix=(a*aa+b*cc,a*bb+b*dd,c*aa+d*cc,c*bb+d*dd,e*aa+f*cc+ee,e*bb+f*dd+ff)
        elif op==b'Do':
            obj=p['/Resources']['/XObject'][args[0]].get_object()
            if obj.get('/Subtype')=='/Image':
                a,b,c,d,e,f=matrix;ratio=(a*a+b*b)**.5/(c*c+d*d)**.5
                assert abs(ratio-1.5)<.001 or (i==10 and abs(ratio-193/55)<.001),(i,ratio)
                instances.append({'pagina':i,'proporcion':ratio})
assert fonts and all(fonts.values()),fonts
assert len(fonts)==6,fonts
assert r.metadata.author=='Knectan' and r.metadata.get('/Version')=='1.0'
assert len(r.outline)==23
pngs=sorted((ROOT/'qa').glob('pagina-*.png'))
assert len(pngs)==23
for p in pngs:
    with Image.open(p) as im:im.verify()
for start in range(0,23,6):
    sheet=Image.new('RGB',(1800,1760),'#D8DDCF');d=ImageDraw.Draw(sheet)
    for j,path in enumerate(pngs[start:start+6]):
        im=Image.open(path).convert('RGB');im.thumbnail((574,817))
        x=13+(j%3)*600;y=24+(j//3)*880
        sheet.paste(im,(x,y));d.text((x,y+im.height+10),path.stem,fill='black')
    sheet.save(ROOT/'qa'/f'contacto-{start//6+1:02}.jpg',quality=90)
(ROOT/'qa/texto_extraido.txt').write_text('\n\n'.join(f'PÁGINA {i+1}\n'+t for i,t in enumerate(texts)))
report={'resultado_estructural':'correcto','paginas':23,'formato':'A4 vertical 210 × 297 mm','dimensiones_pt':sizes,'paginas_con_texto_seleccionable':23,'caracteres_por_pagina':[len(t) for t in texts],'fuentes_incrustadas':fonts,'marcadores':len(r.outline),'inserciones_imagenes':len(instances),'proporcion_logo_verificada':'3:2 salvo el ejemplo incorrecto de deformación, expresamente rotulado','pixeles_logo':'original intacto; variantes B/N y grises verificadas frente a los recursos','paginas_renderizadas':23,'metadatos':dict(r.metadata),'sha256_pdf':hashlib.sha256(pdf.read_bytes()).hexdigest(),'sha256_logo':hashlib.sha256((ROOT/'recursos/knectan-logo-referencia.png').read_bytes()).hexdigest(),'nota':'La revisión visual se documenta por separado en REVISION_VISUAL.md. Este reporte no certifica PDF/UA ni PDF/X.'}
(ROOT/'qa/validacion.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({k:v for k,v in report.items() if k not in ['dimensiones_pt','metadatos']},ensure_ascii=False,indent=2))
