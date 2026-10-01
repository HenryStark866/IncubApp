"""
Asistente propio de IncubApp — gratis, local, sin IA externa.

Busca la respuesta en nuestros documentos (conocimiento de incubación de la app,
Manual de Usuario y operación sin conexión) con TF-IDF y similitud coseno, y
devuelve las frases más útiles, cortas para leerlas en voz alta.
POST /  {pregunta, contexto, historial}  ->  {texto, fuente}
Solo atiende a usuarios con sesión válida de IncubApp (se valida con Supabase).
"""
import json
import math
import os
import re
import unicodedata
import urllib.request
import zipfile
from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DOCS = os.environ.get('DOCS', '/docs')
AUTH = os.environ.get('AUTH_URL', 'http://supabase-auth:9999/user')
UMBRAL = 0.12
MAX_CHARS = 420
VACIAS = set('''a al algo como con cual cuando de del desde donde el ella en entre es esa ese esta este esto
hay la las le lo los mas me mi mis muy no o para pero por que se si sin sobre su sus te tiene tu un una uno unos y ya yo
hacer hago puedo debo quiero necesito'''.split())


def normal(t):
    t = unicodedata.normalize('NFD', t.lower())
    return ''.join(c for c in t if unicodedata.category(c) != 'Mn')


def raiz(p):
    # Raíz simple en español: quita plurales y terminaciones verbales comunes.
    # «registro», «registrar», «registros» → «registr».
    if len(p) > 4 and p.endswith('s'):
        p = p[:-1]
    for suf in ('acione', 'acion', 'amiento', 'mente', 'ando', 'iendo', 'ado', 'ada', 'ar', 'er', 'ir', 'e', 'o', 'a'):
        if len(p) > len(suf) + 3 and p.endswith(suf):
            return p[:-len(suf)]
    return p


def palabras(t):
    return [raiz(p) for p in re.findall(r'[a-z0-9]+', normal(t)) if p not in VACIAS and len(p) > 1]


def bloques(parrafos, tam=600):
    # Se agrupan párrafos seguidos hasta ~600 caracteres; el título va con su contenido.
    actual = []
    for p in parrafos:
        if actual and sum(len(x) for x in actual) + len(p) > tam:
            texto = '\n'.join(actual)
            yield texto, texto
            actual = []
        actual.append(p)
    if actual:
        texto = '\n'.join(actual)
        yield texto, texto


def fragmentos_js(ruta):
    js = open(ruta, encoding='utf-8').read()
    for m in re.finditer(r"tags:\s*\[([^\]]*)\],\s*text:\s*`([^`]*)`", js):
        yield m.group(1).replace("'", ' ') + ' ' + m.group(2), m.group(2)


def fragmentos_docx(ruta):
    xml = zipfile.ZipFile(ruta).read('word/document.xml').decode('utf-8')
    parrafos = [re.sub(r'<[^>]+>', '', p) for p in re.findall(r'<w:p[ >].*?</w:p>', xml, re.S)]
    yield from bloques([p.strip() for p in parrafos if p.strip()])


def fragmentos_md(ruta):
    # Cada título (##) abre un fragmento nuevo; los largos se parten en bloques.
    seccion = []
    for l in list(open(ruta, encoding='utf-8')) + ['## fin']:
        if l.startswith('#') and seccion:
            # El título pesa triple en la búsqueda: es la pregunta que responde la sección.
            for buscar, mostrar in bloques(seccion):
                yield (seccion[0] + '\n') * 3 + buscar, mostrar
            seccion = []
        l = re.sub(r'[#*`>|]', '', l).strip()
        if l and not set(l) <= set('-: '):
            seccion.append(l)


class Indice:
    def __init__(self, fragmentos):
        self.textos, conteos = [], []
        for buscar, mostrar in fragmentos:
            self.textos.append(mostrar)
            conteos.append(Counter(palabras(buscar)))
        n = len(conteos)
        df = Counter(p for c in conteos for p in c)
        self.idf = {p: math.log((1 + n) / (1 + c)) + 1 for p, c in df.items()}
        self.vectores = [self._pesos(c) for c in conteos]

    def _pesos(self, conteo):
        v = {p: (1 + math.log(c)) * self.idf.get(p, 0) for p, c in conteo.items()}
        norma = math.sqrt(sum(x * x for x in v.values())) or 1
        return {p: x / norma for p, x in v.items()}

    def buscar(self, pregunta):
        q = self._pesos(Counter(palabras(pregunta)))
        puntos = [(sum(x * d.get(p, 0) for p, x in q.items()), i) for i, d in enumerate(self.vectores)]
        return [(s, self.textos[i]) for s, i in sorted(puntos, reverse=True)[:2]]


def cargar(docs=DOCS):
    frag = []
    for nombre in sorted(os.listdir(docs)):
        ruta = os.path.join(docs, nombre)
        if nombre.endswith('.js'):
            frag += list(fragmentos_js(ruta))
        elif nombre.endswith('.docx'):
            frag += list(fragmentos_docx(ruta))
        elif nombre.endswith('.md'):
            frag += list(fragmentos_md(ruta))
    return Indice(frag)


def para_voz(texto, pregunta):
    # Frases que comparten palabras con la pregunta, en su orden, hasta ~420 caracteres.
    # «Título:» + viñetas se leen como una frase; el título del fragmento no se lee.
    texto = re.sub(r':\s*\n\s*[-•]?\s*', ': ', texto)
    frases = [f.strip(' -•\t') for f in re.split(r'(?<=[.;!?])\s+|\n', texto)]
    frases = [f.rstrip(';,') for f in frases if len(f) > 3]
    if len(frases) > 1 and not re.search(r'[.:;!?]$', frases[0]):
        frases = frases[1:]  # el título del fragmento no se lee
    clave = set(palabras(pregunta))
    cabe = sum(len(f) + 1 for f in frases) <= MAX_CHARS
    elegidas = frases if cabe else [f for f in frases if clave & set(palabras(f))] or frases
    out = ''
    for f in elegidas:
        if len(out) + len(f) > MAX_CHARS:
            break
        out += (' ' if out else '') + f.rstrip('.') + '.'
    return out or elegidas[0][:MAX_CHARS]


def responder(indice, pregunta):
    pregunta = (pregunta or '').strip()[:400]
    if not pregunta:
        return {'texto': '¿Qué necesitas? Pregúntame cómo hacer algo en la app o sobre incubación.', 'fuente': 'propio'}
    res = indice.buscar(pregunta)
    if not res or res[0][0] < UMBRAL:
        return {'texto': 'No encontré eso en los manuales. Pregúntalo de otra forma o consúltalo con tu supervisor.', 'fuente': 'propio'}
    return {'texto': para_voz(res[0][1], pregunta), 'fuente': 'propio'}


def sesion_valida(cabecera):
    if not cabecera or not cabecera.startswith('Bearer '):
        return False
    try:
        with urllib.request.urlopen(urllib.request.Request(AUTH, headers={'Authorization': cabecera}), timeout=5) as r:
            return r.status == 200
    except Exception:
        return False


INDICE = None


class Manejador(BaseHTTPRequestHandler):
    def _json(self, codigo, cuerpo):
        datos = json.dumps(cuerpo, ensure_ascii=False).encode('utf-8')
        self.send_response(codigo)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)

    def do_GET(self):
        self._json(200, {'ok': True, 'fragmentos': len(INDICE.textos)})

    def do_POST(self):
        if not sesion_valida(self.headers.get('Authorization')):
            return self._json(401, {'error': 'sesión no válida'})
        try:
            largo = min(int(self.headers.get('Content-Length') or 0), 32768)
            cuerpo = json.loads(self.rfile.read(largo) or b'{}')
        except Exception:
            return self._json(400, {'error': 'JSON no válido'})
        self._json(200, responder(INDICE, cuerpo.get('pregunta')))

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    INDICE = cargar()
    print(f'Asistente listo: {len(INDICE.textos)} fragmentos', flush=True)
    ThreadingHTTPServer(('0.0.0.0', 8080), Manejador).serve_forever()
