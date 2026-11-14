#!/usr/bin/env python3
"""Knectan · Manual editorial A4. Fuente editable y reproducible.

Uso: python3 generar_manual.py
Dependencias: reportlab, pypdf, pillow. Recursos locales; no usa la red.
Las coordenadas editoriales se expresan en puntos desde el borde superior.
"""
from pathlib import Path
import json, math, hashlib
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, Color
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.lib.enums import TA_LEFT, TA_JUSTIFY
from reportlab.lib.utils import ImageReader
from pypdf import PdfReader, PdfWriter

ROOT = Path(__file__).resolve().parent
(ROOT/'qa').mkdir(exist_ok=True)
OUT = ROOT / 'KNECTAN_MANUAL_IDENTIDAD_GRAFICA_A4_v1.0.pdf'
LOGO = ROOT / 'recursos/knectan-logo-referencia.png'
W, H = A4
M, CW = 48, W-96
F, C, MI, G, AU = '#093227', '#FCF4E3', '#50AE7A', '#117048', '#F4D29D'
RULE = '#C4CEBD'
FONTS = ROOT / 'recursos/fuentes'
for name, family, weight in [('Body','manrope',400),('Semi','manrope',600),('Bold','manrope',700),('Title','nunitosans',800),('Nunito','nunitosans',400),('Jakarta','plusjakartasans',500)]:
    pdfmetrics.registerFont(TTFont(name, str(FONTS/family/f'{family}-{weight}.ttf')))
pdfmetrics.registerFontFamily('Body', normal='Body', bold='Bold', italic='Body', boldItalic='Bold')
c = canvas.Canvas(str(OUT), pagesize=A4, pageCompression=1, pdfVersion=(1,7),initialFontName='Body')
c.setTitle('Knectan | Manual de Identidad Gráfica | v1.0')
c.setAuthor('Knectan')
c.setSubject('Identidad visual y aplicaciones de marca para comercio local. Versión 1.0, 14 de noviembre de 2026.')
c.setCreator('Knectan · composición editorial con ReportLab')
c.setKeywords('Knectan, identidad gráfica, manual, México, versión 1.0, manual de marca')
PAGE = 0
DARK = False
TEXT_AUDIT = []

def color(v): return HexColor(v)
def rect(x,y,w,h,fill,stroke=None,r=0,lw=.7):
    c.setFillColor(color(fill))
    c.setStrokeColor(color(stroke or fill)); c.setLineWidth(lw)
    if r: c.roundRect(x,H-y-h,w,h,r,stroke=int(bool(stroke)),fill=1)
    else: c.rect(x,H-y-h,w,h,stroke=int(bool(stroke)),fill=1)
def line(x1,y1,x2,y2,col=None,lw=.7,dash=None):
    c.setStrokeColor(color(col or (MI if DARK else RULE)));c.setLineWidth(lw)
    c.setDash(dash or []);c.line(x1,H-y1,x2,H-y2);c.setDash([])
def circle(x,y,r,fill=None,stroke=None,lw=1):
    c.setFillColor(color(fill or C));c.setStrokeColor(color(stroke or fill or C));c.setLineWidth(lw)
    c.circle(x,H-y,r,stroke=int(bool(stroke)),fill=int(bool(fill)))
def text(txt,x,y,size=11,font='Body',col=None):
    col=col or (C if DARK else F)
    c.setFillColor(color(col));c.setFont(font,size)
    c.drawString(x,H-y-size,txt)
    width=pdfmetrics.stringWidth(txt,font,size)
    TEXT_AUDIT.append({'page':PAGE,'text':txt,'x':round(x,2),'y':round(y,2),'w':round(width,2),'h':size})
    assert x>=0 and x+width<=W+.1, (PAGE,txt,width,x)
    return width
def para(txt,x,y,w,size=11,leading=None,col=None,font='Body',maxh=None):
    s=ParagraphStyle('p',fontName=font,fontSize=size,leading=leading or size*1.52,textColor=color(col or (C if DARK else F)),alignment=(TA_JUSTIFY if font=='Body' and w>=300 and '<br' not in txt and size<14 else TA_LEFT),spaceAfter=0,splitLongWords=False)
    p=Paragraph(txt,s);aw,ah=p.wrap(w,1000)
    assert not maxh or ah<=maxh+.1, (PAGE,txt[:60],ah,maxh)
    assert y+ah<790, (PAGE,'Text bottom overflow',txt[:40],y,ah)
    p.drawOn(c,x,H-y-ah)
    TEXT_AUDIT.append({'page':PAGE,'text':txt,'x':x,'y':y,'w':w,'h':ah})
    return ah
def label(txt,x,y,col=None): return text(txt.upper(),x,y,8,'Bold',col or (MI if DARK else G))
def logo(x,y,w):
    c.drawImage(str(LOGO),x,H-y-w*2/3,width=w,height=w*2/3,mask='auto',preserveAspectRatio=True)
def note(txt,y=733,w=CW,x=M):
    line(x,y-12,x+w,y-12)
    para(txt,x,y,w,8.3,12.2,col=MI if DARK else G)
def pill(txt,x,y,dark=False):
    size=7.6;ww=pdfmetrics.stringWidth(txt,'Semi',size)+18
    rect(x,y,ww,19,G if dark else C,MI if dark else G,r=9)
    text(txt,x+9,y+4,size,'Semi',C if dark else G)
TITLES = {
'Nuestra marca':'Fundamentos de marca',
'Componentes y dimensiones':'Componentes y proporciones',
'Nuestro símbolo':'Elementos del símbolo',
'Logotipo principal':'Logotipo principal',
'Versiones de color y B/N':'Versiones de color<br/>y reproducción monocromática',
'Área de protección':'Área de protección',
'Tamaños mínimos':'Tamaño y legibilidad',
'Usos correctos e incorrectos':'Usos correctos e incorrectos',
'Paleta cromática':'Paleta cromática',
'Jerarquía cromática':'Aplicación del color',
'Tipografía':'Sistema tipográfico',
'Sistema gráfico':'Recursos gráficos<br/>y composición',
'Convivencia y firma de marca':'Convivencia de marcas',
'Producción impresa':'Especificaciones de impresión',
'Voz y tono':'Voz y mensajes del asistente',
'WhatsApp y chatbot':'Aplicaciones conversacionales',
'Bienvenida y onboarding':'Aplicación digital<br/>y exportación de activos',
'Panel de administración':'Interfaz de administración',
'Papelería en contexto':'Papelería en contexto',
'Señalización en contexto':'Señalización en el comercio',
'Accesibilidad':'Contraste y accesibilidad',
'Entrega, control y referencias':'Entrega y control de marca',
'Guía de lectura':'Contenido y alcance'
}
def begin(section,title=None,subtitle=None,dark=False):
    global PAGE,DARK
    PAGE+=1;DARK=dark
    rect(0,0,W,H,F if dark else C)
    c.bookmarkPage(f'p{PAGE:02}')
    c.addOutlineEntry(f'{PAGE:02}  {section}',f'p{PAGE:02}',level=0)
    title=TITLES.get(section,title)
    if title: para(title,M,77,CW,30,34.5,font='Title',maxh=105)
    if subtitle: para(subtitle,M,163,CW,10.6,16.2,maxh=50)
def end():
    c.showPage()
def arrow(x,y,w=20,col=G):
    line(x,y,x+w,y,col,1.1);line(x+w-4,y-4,x+w,y,col,1.1);line(x+w-4,y+4,x+w,y,col,1.1)
def icon(kind,x,y,s=24,col=F):
    """Iconos editoriales originales; nunca sustituyen el símbolo de marca."""
    c.saveState();c.translate(x,H-y-s);c.scale(s/24,s/24)
    c.setStrokeColor(color(col));c.setLineWidth(1.6);c.setLineCap(1);c.setLineJoin(1)
    p=c.beginPath()
    if kind=='chat':
        c.roundRect(2,6,20,15,4,fill=0,stroke=1);p.moveTo(6,6);p.lineTo(6,2);p.lineTo(12,6);c.drawPath(p)
        c.line(7,15,17,15);c.line(7,11,14,11)
    elif kind=='box':
        p.moveTo(2,17);p.lineTo(12,22);p.lineTo(22,17);p.lineTo(22,6);p.lineTo(12,1);p.lineTo(2,6);p.close()
        c.drawPath(p);c.line(2,17,12,12);c.line(22,17,12,12);c.line(12,12,12,1);c.line(7,19.5,17,14.5)
    elif kind=='receipt':
        p.moveTo(4,2);p.lineTo(4,22);p.lineTo(20,22);p.lineTo(20,2);p.lineTo(16,4);p.lineTo(12,2);p.lineTo(8,4);p.close();c.drawPath(p)
        c.line(8,16,16,16);c.line(8,12,16,12);c.line(8,8,13,8)
    elif kind=='check':
        c.circle(12,12,10,fill=0,stroke=1);p.moveTo(7,12);p.lineTo(10,9);p.lineTo(17,16);c.drawPath(p)
    elif kind=='shop':
        c.roundRect(3,2,18,12,1,fill=0,stroke=1);p.moveTo(1,14);p.lineTo(5,21);p.lineTo(19,21);p.lineTo(23,14);p.close();c.drawPath(p)
        c.line(8,2,8,10);c.line(15,2,15,10)
    elif kind=='arrow':
        c.line(3,12,21,12);c.line(15,18,21,12);c.line(15,6,21,12)
    c.restoreState()
def avatar(cx,cy,d):
    circle(cx,cy,d/2,F)
    w=d*.80;logo(cx-w/2,cy-w/3,w)
def button(txt,x,y,w=140,h=33,fill=MI,fg=F):
    rect(x,y,w,h,fill,r=7);tw=pdfmetrics.stringWidth(txt,'Bold',9)
    text(txt,x+(w-tw)/2,y+(h-11)/2,9,'Bold',fg)

# 01 · Portada
begin('Identidad / edición de publicación',dark=True)
label('Comercio local. Conversación. Tecnología.',M,88,MI)
logo(M-3,148,CW+6)
line(M,530,W-M,530,MI)
para('Manual de<br/>Identidad Gráfica',M,557,CW,38,41,font='Title')
para('Una identidad cercana para la gestión<br/>cotidiana del pequeño comercio mexicano.',M,664,380,12,18)
text('VERSIÓN 1.0',M,751,8,'Bold',MI)
text('14 DE NOVIEMBRE DE 2026',M+126,751,8,'Semi',MI)
end()

# 02 · Índice y estatus
begin('Guía de lectura','Una marca.<br/>Un lenguaje compartido.')
groups=[('01','Fundamento y logotipo',[(3,'Fundamentos de marca'),(4,'Componentes y proporciones'),(5,'Elementos del símbolo'),(6,'Logotipo principal'),(7,'Versiones de color y B/N'),(8,'Área de protección'),(9,'Tamaño y legibilidad'),(10,'Usos correctos e incorrectos')]),('02','Sistema visual',[(11,'Paleta cromática'),(12,'Aplicación del color'),(13,'Sistema tipográfico'),(14,'Recursos y composición'),(15,'Convivencia de marcas')]),('03','Aplicaciones',[(16,'Especificaciones de impresión'),(17,'Voz y mensajes'),(18,'Aplicaciones conversacionales'),(19,'Aplicación digital y exportación'),(20,'Interfaz de administración'),(21,'Papelería en contexto'),(22,'Señalización en el comercio')]),('04','Accesibilidad',[(23,'Contraste y accesibilidad')])]
for idx,(num,title,entries) in enumerate(groups):
    xx=M+(idx%2)*260;yy=220+(idx//2)*250
    label(num,xx,yy);text(title,xx+27,yy-3,12,'Bold')
    for j,(pg,entry) in enumerate(entries):
        ty=yy+30+j*19
        text(entry,xx,ty,8.6)
        text(f'{pg:02}',xx+222,ty,8.6,'Semi',G)
        c.linkRect('',f'p{pg:02}',(xx,H-ty-14,xx+242,H-ty+2),relative=0,thickness=0)
note('<b>Cómo usar este manual.</b> Consulta las reglas del logotipo antes de preparar una pieza. Aplica los valores de color y el sistema tipográfico de esta edición; después revisa los requisitos del canal. Las interfaces y los mockups muestran aplicaciones conceptuales de la identidad.',729)
end()

# 03 · Marca
begin('Nuestra marca','La tienda al centro.<br/>La tecnología, a su lado.', 'Knectan acerca la gestión digital a los pequeños comercios de México.',dark=True)
para('Una libreta, una conversación,<br/>una decisión cada día.',M,239,430,24,30,font='Title')
para('Muchos negocios organizan su operación entre apuntes, mensajes y cálculos manuales. Knectan busca reducir ese esfuerzo con una experiencia conversacional, especialmente por WhatsApp.',M,329,400,12,19)
line(M,438,W-M,438,MI)
for i,(ico,head,body) in enumerate([('receipt','Ventas y gastos','Registrar y consultar los movimientos del negocio con claridad.'),('box','Inventario','Ayudar a mantener la información de productos a la mano.'),('chat','Conexión comercial','Facilitar pedidos o comunicación con distribuidores.')]):
    yy=471+i*76;icon(ico,M,yy,26,MI);text(head,M+47,yy,13,'Bold')
    para(body,M+47,yy+23,398,11.0,15.5)
note('Propósito: acercar la gestión digital al comercio local. Personalidad: cercana, práctica y confiable. La marca comunica ayuda cotidiana, claridad y respeto por la experiencia del comerciante.',735)
end()

# 04 · Componentes y dimensiones
begin('Componentes y dimensiones','Una composición.<br/>Relaciones que se conservan.')
label('Lectura del lienzo / referencia raster',M,183)
logo(120,254,360)
line(120,235,480,235,G,1)
line(120,228,120,242,G,1);line(480,228,480,242,G,1)
text('1536 px / ancho total',227,211,10,'Bold')
line(99,254,99,494,G,1);line(92,254,106,254,G,1);line(92,494,106,494,G,1)
text('1024 px',M,510,10,'Bold')
for y,caption in [(293,'Símbolo'),(411,'Nombre')]:
    line(465,y,532,y,G,1);text(caption,485,y-22,9,'Semi',G)
label('Proporción de archivo',M,564)
para('<b>Ancho : alto = 3 : 2.</b> Para cualquier ancho W, conservar H = W × 2/3. Ejemplos: 600 × 400 px; 90 × 60 mm. Las dimensiones incluyen el fondo y el margen interno del PNG.',M,590,CW,11,17)
para('<b>Componentes inseparables en la versión principal:</b> toldo, robot-burbuja, trazos de conexión, destellos y nombre. No mover, reescalar ni extraer un elemento de forma independiente.',M,665,CW,10.5,16)
note('Utiliza el archivo completo como una sola unidad. Para ampliar la marca más allá de la resolución disponible, solicita el maestro vectorial; nunca reconstruyas los elementos por separado.',743)
end()

# 05 · Símbolo
begin('Nuestro símbolo','Cada elemento<br/>abre una conversación.', 'El comercio, la conversación y la asistencia digital se integran en un solo símbolo.')
logo(103,233,390)
# Índices externos al PNG; el recurso original no se recorta ni se altera.
for num,x,y,tx,ty in [('1',198,221,230,286),('2',83,360,299,355),('3',231,511,291,385),('4',510,397,378,368),('5',510,279,380,321),('6',490,511,400,425)]:
    line(x,y,tx,ty,G,.7);circle(x,y,9,C,G,.7);text(num,x-2.5,y-5,8,'Bold',G)
items=[('1','Toldo','Comercio de barrio y vida cotidiana.'),('2','Robot sonriente','Asistencia amable, sin distancia técnica.'),('3','Burbuja','Conversación como punto de entrada.'),('4','Trazos curvos','Conexión entre negocio y tecnología.'),('5','Destellos','Agilidad, energía y optimismo.'),('6','Nombre redondeado','Sencillez y cercanía en la expresión.')]
for i,(n,head,body) in enumerate(items):
    xx=M+(i%2)*260;yy=550+(i//2)*56
    label(n,xx,yy);text(head,xx+21,yy-3,10.7,'Bold');para(body,xx+21,yy+16,216,8.6,12.7)
note('El toldo sitúa la marca en el comercio; la burbuja y el robot expresan asistencia. Los trazos y destellos acompañan el conjunto sin convertirse en elementos independientes.',743)
end()

# 06 · Principal
begin('Logotipo principal','La referencia<br/>que debemos preservar.',dark=True)
logo(M,215,CW)
line(M,578,W-M,578,MI)
for i,(a,b) in enumerate([('1536 × 1024 px','Resolución del archivo'),('3:2','Proporción del lienzo'),('PNG / RGB','Referencia a color')]):
    xx=M+i*174;text(a,xx,608,20,'Title');text(b,xx,642,8.5,'Body',MI)
para('Se inserta la composición completa: símbolo, nombre y fondo original. La iluminación, los degradados y el margen interno forman parte del archivo recibido.',M,686,CW,10.4,16)
note('La tipografía del nombre no está identificada. No reescribir «Knectan» con una fuente similar ni reemplazar el símbolo por una aproximación.',748)
end()

# 07 · Versiones de color y B/N
begin('Versiones de color y B/N','La marca también<br/>debe funcionar a una tinta.')
pill('COLOR · GRISES · POSITIVO · NEGATIVO',M,177)
for i,(file,head,body) in enumerate([
 ('knectan-logo-referencia.png','Color / referencia','PNG recibido. Uso digital a color.'),
 ('knectan-grises-propuesta.png','Escala de grises','Reproducción tonal; no equivale a una tinta plana.'),
 ('knectan-bn-positivo-propuesta.png','Negro sobre blanco','Reproducción de alto contraste sobre soporte claro.'),
 ('knectan-bn-negativo-propuesta.png','Blanco sobre negro','Reproducción de alto contraste sobre soporte oscuro.')]):
 x=M+(i%2)*260;y=225+(i//2)*230
 c.drawImage(str(ROOT/'recursos'/file),x,H-y-150,width=225,height=150)
 text(head,x,y+163,12,'Bold');para(body,x,y+188,235,9.2,14)
para('<b>Selección:</b> color para pantallas e impresión a color; grises para reproducción tonal; positivo o negativo para una sola tinta, previa prueba de contornos y reducción.',M,697,CW,10,15)
note('Para sello, bordado o corte se necesita un maestro vectorial adaptado a la técnica. Estas imágenes raster no sustituyen los archivos de fabricación.',756)
end()

# 08 · Protección
begin('Área de protección','Espacio para<br/>que la marca respire.', 'Reserva un margen libre de texto, imágenes y controles alrededor de la composición.')
xx,yy,ww=98,283,399
rect(xx-40,yy-40,ww+80,ww*2/3+80,MI)
logo(xx,yy,ww)
for x1,y1,x2,y2 in [(xx,yy-52,xx,yy+ww*2/3+52),(xx+ww,yy-52,xx+ww,yy+ww*2/3+52),(xx-52,yy,xx+ww+52,yy),(xx-52,yy+ww*2/3,xx+ww+52,yy+ww*2/3)]: line(x1,y1,x2,y2,F,.65,[3,3])
text('x',74,258,12,'Bold');text('x',505,258,12,'Bold');text('x',74,565,12,'Bold')
label('Franja exterior libre de otros elementos',M,618)
para('Define x = 10 % del ancho del lienzo completo. Mantén al menos x de separación en sus cuatro lados, además del margen interno que ya contiene el archivo. Ejemplo: para un ancho de 240 px, reserva 24 px exteriores.',M,644,CW,11,17)
note('En una firma conjunta respeta también el área de protección de la otra marca. Si los mínimos difieren, utiliza la separación que proteja ambos conjuntos.',738)
end()

# 09 · Legibilidad
begin('Tamaños mínimos','El tamaño lo decide<br/>la lectura, no la costumbre.', 'Tamaños de referencia del archivo completo para pantalla e impresión.')
label('Pantalla / ancho de archivo en CSS px',M,218)
for x,px in zip([M,169,323],[96,160,240]):
    ww=px*.75;logo(x,254,ww);text(f'{px} px',x,391,10,'Bold')
line(M,437,W-M,437)
label('Impresión / ancho del archivo completo',M,460)
for x,mm in zip([M,174,350],[30,45,65]):
    ww=mm*72/25.4;logo(x,496,ww);text(f'{mm} mm',x,630,10,'Bold')
para('<b>Tamaños de referencia:</b> utiliza al menos 240 px de ancho en pantalla y 45 mm en impresión para la composición completa. Las reducciones menores se incluyen únicamente como comparación de legibilidad.',M,676,CW,11.0,15.5)
note('Validar nombre, ojos y destellos en móvil y papel. La muestra de pantalla solo equivale a CSS px al visualizar o imprimir esta página al 100 %.',742)
end()

# 10 · Usos correctos e incorrectos
begin('Usos correctos e incorrectos','Qué conservar.<br/>Qué evitar en cada aplicación.')
for i,(ok,head,body) in enumerate([
 (True,'Proporción original','Conservar el lienzo completo y su relación 3:2.'),
 (False,'Deformación','No comprimir ni estirar para llenar un espacio.'),
 (True,'Espacio de protección','Reservar el margen exterior ilustrado en esta guía.'),
 (False,'Interferencia','No colocar texto o controles sobre la marca.'),
 (True,'Escala y fondo','Asegurar lectura y conservar el fondo del original.'),
 (False,'Reducción excesiva','No usar la composición completa como favicon.')]):
 x=M+(i%2)*260;y=205+(i//2)*174
 rect(x,y,239,101,F)
 if i==1:
  c.drawImage(str(LOGO),x+23,H-y-79,width=193,height=55)
 elif i==3:
  logo(x+52,y+3,136);text('OFERTA',x+42,y+35,25,'Bold',AU)
 elif i==5:logo(x+105,y+39,29)
 else:logo(x+52,y+3,136)
 label('Correcto' if ok else 'Incorrecto',x,y+110)
 text(head,x,y+128,10.5,'Bold');para(body,x,y+147,236,8.4,12)
note('Los errores se muestran únicamente para explicar qué evitar. Tampoco rotar, añadir sombras, contornos o nuevos colores; separar la K; ni sustituir el lettering por una fuente parecida.',756)
end()

# 11 · Paleta
begin('Paleta cromática','Cinco tonos.<br/>Una calidez reconocible.')
pill('VALORES CROMÁTICOS · EDICIÓN 1.0',M,177)
palette=[('Verde bosque','forest-900',F,(9,50,39)),('Crema','cream-100',C,(252,244,227)),('Verde menta','mint-500',MI,(80,174,122)),('Verde profundo','green-700',G,(17,112,72)),('Dorado suave','gold-300',AU,(244,210,157))]
for i,(name,token,hx,rgb) in enumerate(palette):
    yy=231+i*91;fg=C if i in [0,3] else F
    rect(M,yy,131,77,hx,F if i==1 else None)
    text(f'{i+1:02}',M+13,yy+12,11,'Bold',fg)
    text(name,201,yy+1,15,'Title');text(hx,201,yy+28,11,'Bold');text('RGB  '+', '.join(map(str,rgb)),315,yy+29,9)
    text(token+' / token de color',201,yy+51,8.3,'Body',G)
note('Usa estos valores HEX y RGB en las piezas digitales. Para impresión, convierte con el perfil ICC del soporte y valida una prueba física; los valores CMYK dependen del proceso de reproducción.',744)
end()

# 12 · Jerarquía
begin('Jerarquía cromática','El bosque sostiene.<br/>Los acentos orientan.',dark=True)
label('Distribución de referencia',M,191,MI)
start=M
for name,pct,hx in [('Bosque',60,F),('Crema',25,C),('Menta',10,MI),('Verde',4,G),('Dorado',1,AU)]:
    ww=CW*pct/100;rect(start,228,ww,103,hx,MI if name=='Bosque' else None);start+=ww
for i,(name,pct) in enumerate([('Bosque',60),('Crema',25),('Menta',10),('Profundo',4),('Dorado',1)]):
    text(f'{pct} %',M+i*104,350,20,'Title');text(name,M+i*104,382,9,'Body',MI)
rect(M,445,240,218,C)
label('Superficie clara',M+18,464,G)
text('Registra con claridad',M+18,498,17,'Title',F)
para('Texto oscuro y una acción<br/>principal bien reconocible.',M+18,533,203,10,15,col=F)
button('Registrar venta',M+18,596,177,fill=G,fg=C)
rect(307,445,240,218,F,MI)
label('Superficie oscura',325,464,MI)
text('Consulta lo importante',325,498,16,'Title',C)
para('Crema para leer.<br/>Menta para dirigir la acción.',325,533,200,10,15,col=C)
button('Ver inventario',325,596,177)
note('Ajusta la proporción al contenido manteniendo la jerarquía. No uses crema sobre menta para texto pequeño; reserva el dorado para acentos.',733)
end()

# 13 · Tipografía
begin('Tipografía','Una voz amable.<br/>Una lectura precisa.')
for yy,family,font,desc in [(211,'Nunito Sans','Nunito','Titulares · formas cálidas y redondeadas. Utiliza el peso 800 para los títulos principales.'),(353,'Manrope','Body','Texto e interfaz · peso 400 para lectura, 600 para etiquetas y 700 para énfasis.'),(495,'Plus Jakarta Sans','Jakarta','Familia complementaria · carácter geométrico. Reservar para piezas especiales; no mezclar con las dos familias principales dentro de una misma interfaz.')]:
    label(family,M,yy)
    text('Tu negocio, en conversación.',M,yy+29,24,font)
    text('Aa Bb Cc Ññ  /  0123456789  /  $1,250.00',M,yy+67,12,font)
    para(desc,M,yy+93,CW,9.3,14)
line(M,633,W-M,633)
para('<b>Jerarquía editorial:</b> Nunito Sans 800, 30/34.5 pt para títulos. Manrope 400, 11/17 pt para cuerpo; 600-700 para subtítulos y datos. Notas de referencia: 8.3/12.2 pt. En interfaz, cuerpo de 16 px.',M,652,CW,9.7,15)
note('La fuente del logotipo no está identificada. Estas familias no reemplazan el lettering. Fuentes de Google Fonts bajo SIL Open Font License 1.1; archivos y licencias incluidos.',735)
end()

# 14 · Sistema gráfico
begin('Sistema gráfico','Formas suaves.<br/>Información en orden.', 'Lenguaje visual para piezas editoriales e interfaces.')
for i,kind in enumerate(['shop','chat','box','receipt','check','arrow']):
    xx=M+i*86;icon(kind,xx+9,238,37,G);text(['Comercio','Mensajes','Inventario','Movimientos','Confirmación','Continuar'][i],xx,295,7.9,'Semi')
line(M,337,W-M,337)
rect(M,370,225,146,F,r=13)
icon('receipt',M+18,390,25,MI)
text('Una acción por vez',M+18,434,17,'Title',C)
text('Jerarquía clara, sin ruido visual.',M+18,469,9,'Body',C)
label('Geometría y espaciado',306,368)
para('<b>Esquinas:</b> radio 12 px en tarjetas.<br/><b>Trazos:</b> 2 px sobre una base de 24 px.<br/><b>Espaciado:</b> múltiplos de 8 px.<br/><b>Composición:</b> bordes alineados y<br/>una acción principal por grupo.',306,396,236,11.0,20)
label('Imagen y movimiento',M,558)
for j,(head,body) in enumerate([
 ('Fotografía','Comercios reales, luz natural y acciones cotidianas. Evita filtros que alteren el color de productos o piel.'),
 ('Ilustración','Formas simples, trazos uniformes y escenas del negocio. El robot del logo no se redibuja como una mascota diferente.'),
 ('Movimiento','Transiciones breves que expliquen el estado de una acción. Respeta la preferencia de movimiento reducido.')]):
 yy=586+j*52;text(head,M,yy,10.5,'Bold');para(body,M+102,yy,397,9.3,14)
note('Mantén una sola familia de íconos y un criterio de iluminación por pieza. La imagen acompaña la información y deja un área tranquila para el texto.',756)
end()

# 15 · Convivencia de marcas
begin('Convivencia y firma de marca','Compartir un espacio.<br/>Conservar cada identidad.')
pill('FIRMA CONJUNTA',M,177)
label('Firma conjunta / esquema sin socio real',M,223)
rect(M,253,CW,179,F)
logo(M+22,276,200)
line(312,282,312,405,MI,1)
text('MARCA ALIADA',341,326,15,'Bold',C)
text('Espacio reservado',341,353,9,'Body',MI)
for j,(head,body) in enumerate([
 ('Separación','Conservar el área libre de ambas marcas. La línea divisoria organiza la relación; no fusionar nombres ni símbolos.'),
 ('Jerarquía','En materiales propios, Knectan firma como marca principal. En una pieza compartida, acordar protagonismo según el emisor; equilibrar peso óptico, no solo ancho.'),
 ('Nombre en texto','Escribir Knectan con K mayúscula, sin espacios ni cambios de grafía. Usar texto tipográfico para mencionar la marca en un párrafo; el logo firma fuera de la oración.')]):
 yy=469+j*80;text(head,M,yy,13,'Bold');para(body,M,yy+25,CW,10,15)
note('La firma conjunta mantiene cada identidad independiente. El rótulo «Marca aliada» indica la ubicación del activo del colaborador.',754)
end()

# 16 · Producción impresa
begin('Producción impresa','Del archivo<br/>al soporte físico.')
label('Tarjeta / formato 85 × 55 mm',M,180)
# Esquema a escala 1:1 en una impresión al 100 %.
pt=72/25.4;tx,ty=162,259;tw,th=85*pt,55*pt
rect(tx-3*pt,ty-3*pt,tw+6*pt,th+6*pt,MI)
rect(tx,ty,tw,th,C,F)
line(tx+5*pt,ty+5*pt,tx+tw-5*pt,ty+5*pt,G,.7,[3,3])
line(tx+5*pt,ty+th-5*pt,tx+tw-5*pt,ty+th-5*pt,G,.7,[3,3])
logo(tx+24,ty+15,190)
text('85 mm / corte',tx+76,ty-34,10,'Bold')
text('55 mm',tx+tw+15,ty+65,10,'Bold')
label('Sangrado ilustrado: 3 mm',M,454)
text('Zona segura: 5 mm hacia dentro del corte',M,476,10,'Semi')
for j,(head,body) in enumerate([
 ('Color y soporte','Solicitar perfil ICC y prueba física. Convertir RGB a CMYK con el perfil de destino; no asignar porcentajes genéricos como colores oficiales.'),
 ('Resolución y formato','Preferir logo vectorial aprobado. Para mapa de bits: 300 ppp al tamaño final. El PNG permite 130 × 86.7 mm a 300 ppp, aproximadamente.'),
 ('Salida y acabados','Entregar PDF/X según el proveedor, fuentes incrustadas y sangrado acordado. Para sello, serigrafía, bordado o corte, preparar maestro de una tinta y probar detalles.')]):
 y=520+j*71;text(head,M,y,12,'Bold');para(body,M,y+23,CW,9.6,14.5)
note('El rectángulo exterior representa el sangrado: extiende el fondo hasta ese borde. Confirma con el impresor el perfil, los acabados y los requisitos de salida antes de producir.',756)
end()

# 17 · Voz y tono
begin('Voz y tono','Hablar claro<br/>también genera confianza.',dark=True)
para('Español de México. Frases breves. Una pregunta a la vez. Amabilidad sin infantilizar ni esconder el estado de una operación.',M,181,CW,11,17)
examples=[('Bienvenida','¡Hola! Soy Knectan. ¿Qué necesitas hacer en tu negocio?','Abrir la conversación sin tecnicismos.'),('Confirmación','Entendido: 3 refrescos. ¿Confirmas la venta?','Pedir confirmación antes de registrar.'),('Éxito','Listo, registré la venta.','Solo después de guardar la operación.'),('Error','No pude guardar la venta. Intenta de nuevo.','Decir qué ocurrió y cuál es el siguiente paso.'),('Dato incompleto','¿De qué producto se trata?','Solicitar únicamente la información faltante.')]
for i,(state,msg,why) in enumerate(examples):
    yy=260+i*83
    label(state,M,yy,MI)
    para('«'+msg+'»',M+120,yy-4,CW-120,13,18,font='Semi')
    text(why,M+120,yy+39,8.6,'Body',MI)
    if i<4: line(M,yy+68,W-M,yy+68,G,.6)
note('Evitar promesas absolutas como «nunca falla» y «100 % automático». Los mensajes de éxito deben reflejar un estado persistido, no solo una intención recibida.',742)
end()

# 18 · WhatsApp
begin('WhatsApp y chatbot','La marca, dentro<br/>de una conversación.')
pill('APLICACIÓN DE MARCA',M,177)
# Interfaz esquemática propia; no utiliza emblemas ni capturas del servicio.
phone_x,phone_y,pw,ph=M,223,246,459
rect(phone_x,phone_y,pw,ph,F,r=22)
rect(phone_x+7,phone_y+7,pw-14,ph-14,C,r=17)
rect(phone_x+7,phone_y+7,pw-14,68,F,r=16)
avatar(phone_x+35,phone_y+41,39)
text('Knectan',phone_x+63,phone_y+23,13,'Bold',C)
text('Asistente para tu negocio',phone_x+63,phone_y+47,7.7,'Body',C)
rect(phone_x+19,phone_y+94,198,76,F,r=11)
para('¡Hola! Soy Knectan.<br/>¿Qué necesitas hacer<br/>en tu negocio?',phone_x+31,phone_y+106,174,11.0,16,col=C)
rect(phone_x+64,phone_y+188,161,42,MI,r=11)
text('Vendí 3 refrescos.',phone_x+77,phone_y+201,10,'Semi',F)
rect(phone_x+19,phone_y+248,198,73,F,r=11)
para('Entendido: 3 refrescos.<br/>¿Confirmas la venta?',phone_x+31,phone_y+261,174,11.0,16,col=C)
button('Confirmar venta',phone_x+19,phone_y+339,198,35,fill=G,fg=C)
line(phone_x+19,phone_y+395,phone_x+225,phone_y+395,G)
text('Escribe un mensaje…',phone_x+26,phone_y+414,8.5,'Body',G)
avatar(426,282,98)
label('Avatar de perfil',326,359)
text('Knectan',326,383,19,'Title')
para('Composición completa dentro del área circular. No se extrae el robot ni se recorta el nombre.',326,420,217,10.5,16)
label('Criterio de interacción',326,513)
para('Separar solicitud, revisión y confirmación. Mantener visibles producto y cantidad antes de registrar movimientos.',326,539,217,10.5,16)
note('Ejemplo conceptual de perfil y conversación para WhatsApp. Conserva el nombre completo y verifica la lectura del avatar al tamaño de visualización.',733)
end()

# 19 · Bienvenida
begin('Bienvenida y onboarding','Un inicio claro.<br/>Un primer paso posible.')
pill('APLICACIÓN DE MARCA',M,177)
xx,yy=M,226
rect(xx,yy,CW,337,F,r=9)
text('BIENVENIDA',xx+18,yy+17,7.5,'Bold',MI)
line(xx+18,yy+39,xx+CW-18,yy+39,G)
logo(xx+20,yy+61,192)
para('Tu negocio,<br/>en conversación.',xx+24,yy+205,211,23,28,col=C,font='Title')
rect(xx+254,yy+53,CW-269,264,C,r=8)
label('Primer paso / 1 de 3',xx+272,yy+73)
para('¿Qué necesitas<br/>hacer hoy?',xx+272,yy+105,194,23,27,col=F,font='Title')
for j,entry in enumerate(['Registrar una venta','Revisar inventario','Organizar gastos']):
    ey=yy+178+j*35
    rect(xx+272,ey,189,28,C,G,r=5)
    text(entry,xx+284,ey+7,8.5,'Semi',F)
label('Entrega digital / exportaciones',M,594)
para('<b>Logo de 240 × 160 CSS px:</b> exportar 240 × 160 px (1×), 480 × 320 px (2×) o 720 × 480 px (3×). Mantener sRGB y comprobar nitidez en el dispositivo real.',M,620,CW,11.0,16)
para('<b>Formato:</b> PNG para la referencia actual; SVG solo desde un maestro validado. Reservar 512 × 512 px para probar el avatar completo. Favicon: desarrollar una variante específica y comprobar 16, 32 y 48 px.',M,677,CW,11.0,16)
note('La bienvenida presenta una acción principal por paso. Mantén etiquetas breves y consistentes con el asistente. Ejemplo conceptual de aplicación digital.',738)
end()

# 20 · Panel
begin('Panel de administración','Los datos primero.<br/>La identidad los acompaña.')
pill('EJEMPLO DE INTERFAZ · DATOS FICTICIOS',M,177)
xx,yy=M,226
rect(xx,yy,CW,345,C,F,r=8)
rect(xx,yy,103,345,F,r=8)
logo(xx+7,yy+15,89)
for j,entry in enumerate(['Resumen','Ventas','Inventario','Gastos']):
    if j==0:rect(xx+9,yy+101+j*34,85,28,MI,r=4)
    text(entry,xx+18,yy+109+j*34,8.5,'Semi',F if j==0 else C)
text('Mi negocio / Resumen',xx+121,yy+19,14,'Title',F)
text('Información de ejemplo',xx+121,yy+45,8,'Body',G)
for j,(value,title) in enumerate([('$1,250','Ventas del día'),('$320','Gastos del día'),('48','Productos')]):
    kx=xx+121+j*121
    rect(kx,yy+77,108,79,F if j==0 else C,G,r=6)
    text(title,kx+10,yy+89,7.7,'Semi',C if j==0 else G)
    text(value,kx+10,yy+111,21,'Title',C if j==0 else F)
text('Movimientos recientes',xx+121,yy+183,11,'Bold',F)
line(xx+121,yy+210,xx+CW-18,yy+210,G)
text('Concepto',xx+121,yy+220,8,'Bold',G)
text('Tipo',xx+270,yy+220,8,'Bold',G)
text('Importe',xx+331,yy+220,8,'Bold',G)
for j,(concept,kind,amount) in enumerate([('3 refrescos','Venta','$60.00'),('Compra de producto','Gasto','$320.00'),('2 paquetes de galletas','Venta','$38.00')]):
    ry=yy+246+j*28
    text(concept,xx+121,ry,7.9,'Body',F);text(kind,xx+270,ry,7.9,'Body',F)
    tw=pdfmetrics.stringWidth(amount,'Semi',8.1);text(amount,xx+CW-18-tw,ry,8.1,'Semi',F)
    if j<2:line(xx+121,ry+21,xx+CW-18,ry+21,RULE,.5)
label('Criterios de interfaz',M,608)
for j,(head,body) in enumerate([('Prioridad','Resumen, acción y detalle en ese orden.'),('Datos','Moneda visible y cifras alineadas a la derecha.'),('Navegación','Etiquetas concretas; no depender solo de íconos.')]):
    x=M+j*174;text(head,x,635,13,'Title');para(body,x,663,151,9.3,14)
note('Los importes y movimientos son datos ficticios de demostración. La identidad refuerza la lectura: cifras alineadas, moneda visible y estados expresados con texto.',744)
end()

# 21 · Papelería en contexto
begin('Papelería en contexto','Papelería en contexto')
pill('APLICACIÓN DE MARCA · MOCKUP FOTOGRÁFICO',M,164)
y=213;scale=CW/1536
c.drawImage(str(ROOT/'recursos/mockup-papeleria-fondo-v1.png'),M,H-y-CW*2/3,width=CW,height=CW*2/3)
logo(M+410*scale,y+266*scale,680*scale)
label('Tarjeta / presentación de marca',M,579)
para('Una firma visible sobre un soporte cotidiano. El logotipo se inserta íntegro sobre una tarjeta mate; el contexto fotográfico muestra textura, escala y convivencia con objetos del negocio.',M,606,CW,11,17)
for j,(a,b) in enumerate([('Soporte','Papel mate. Validar gramaje y reproducción del verde con el impresor.'),('Producción','La fotografía no es el arte final. Preparar corte, sangrado y perfil de color.'),('Integridad','No extraer el robot ni usar una fuente parecida para rehacer el nombre.')]):
 x=M+j*174;text(a,x,682,11,'Bold');para(b,x,708,151,9,14)
end()

# 22 · Señalización en contexto
begin('Señalización en contexto','Señalización en el comercio')
pill('APLICACIÓN DE MARCA · MOCKUP FOTOGRÁFICO',M,164)
y=213;scale=CW/1536
c.drawImage(str(ROOT/'recursos/mockup-tienda-fondo-v1.png'),M,H-y-CW*2/3,width=CW,height=CW*2/3)
logo(M+448*scale,y+286*scale,640*scale)
label('Identificador de mostrador',M,579)
para('La composición se reconoce en un entorno de comercio local. La placa reserva una superficie tranquila para la marca, separada del ruido visual de productos y estantería.',M,606,CW,11,17)
for j,(a,b) in enumerate([('Ubicación','Situar la pieza a la vista sin obstruir la atención o el cobro.'),('Material','Probar acabado mate para reducir reflejos; confirmar estabilidad y limpieza.'),('Lectura','Validar nombre y detalles desde la distancia de uso antes de fabricar.')]):
 x=M+j*174;text(a,x,682,11,'Bold');para(b,x,708,151,9,14)
end()

# 23 · Accesibilidad
begin('Accesibilidad','El contraste<br/>es parte de la confianza.')
para('Contraste calculado en sRGB para los colores planos de la paleta. Evalúa por separado cualquier texto colocado sobre degradados o fotografías.',M,170,CW,10.5,16)
rows=[(C,F,'Crema / bosque',12.8167089,'Texto normal: sí'),(F,MI,'Bosque / menta',5.1274278,'Texto normal: sí'),(C,G,'Crema / profundo',5.5860658,'Texto normal: sí'),(C,MI,'Crema / menta',2.4996370,'Texto normal: no'),(AU,C,'Dorado / crema',1.3186100,'Texto normal: no')]
for i,(fg,bg,name,ratio,result) in enumerate(rows):
    yy=237+i*64;rect(M,yy,81,47,bg,F if bg==C else None,r=4)
    text('Aa',M+20,yy+5,27,'Title',fg)
    text(name,149,yy+1,11,'Bold');text(f'{ratio:.2f}:1',339,yy,15,'Title');text(result,149,yy+25,9,'Semi',G)
line(M,579,W-M,579)
para('<b>Referencia WCAG 2.2, nivel AA:</b> 4.5:1 para texto normal; 3:1 para texto grande (18 pt regular o 14 pt en negrita). Los controles y gráficos significativos requieren 3:1 frente a colores adyacentes, según el criterio aplicable.',M,599,CW,10,15.5)
para('<b>Además del color:</b> acompañar estados con texto e ícono, mostrar el foco de teclado, permitir ampliar texto y usar instrucciones claras. Usa un cuerpo de referencia de 16 px en interfaz y comprueba la ampliación de texto sin pérdida de contenido.',M,671,CW,9.7,15)
text('Fuentes: W3C · WCAG 2.2 · criterios 1.4.3 y 1.4.11',M,740,8,'Semi',G)
c.linkURL('https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html',(M,H-756,300,H-738),relative=0,thickness=0)
c.linkURL('https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html',(301,H-756,W-M,H-738),relative=0,thickness=0)
end()

assert PAGE==23
c.save()
# Metadatos adicionales explícitos; los recursos siguen siendo texto y vectores.
r=PdfReader(OUT);writer=PdfWriter();writer.clone_document_from_reader(r)
writer.add_metadata({'/Title':'Knectan | Manual de Identidad Gráfica | v1.0','/Author':'Knectan','/Subject':'Manual de identidad gráfica y aplicaciones de marca; edición de publicación del 14 de noviembre de 2026.','/Description':'Identidad gráfica de Knectan: logotipo, paleta, tipografía, especificaciones digitales e impresas y aplicaciones de marca.','/Version':'1.0','/Language':'es-MX'})
from pypdf.generic import NameObject, TextStringObject
writer._root_object[NameObject('/Lang')]=TextStringObject('es-MX')
with OUT.open('wb') as f: writer.write(f)
(ROOT/'KNECTAN_MANUAL_IDENTIDAD_GRAFICA_A4.pdf').write_bytes(OUT.read_bytes())
(ROOT/'qa/bloques_texto.json').write_text(json.dumps(TEXT_AUDIT,ensure_ascii=False,indent=2))
print(f'PDF generado: {OUT}\nPáginas: {PAGE}\nTamaño: {OUT.stat().st_size:,} bytes')

