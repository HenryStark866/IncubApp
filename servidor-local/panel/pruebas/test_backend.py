"""Pruebas del backend del panel (no tocan el servidor real).

cd servidor-local/panel && python -m unittest discover -s pruebas -v
"""
import sys
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from nucleo import acciones, puertos_conocidos, red, secretos, sistema, trabajos  # noqa: E402


class Secretos(unittest.TestCase):
    def test_tacha(self):
        casos = {
            'SMTP_PASS=abc123&x': 'SMTP_PASS=«oculto»&x',
            'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZSJ9.abcdefghijk': 'Authorization: Bearer «oculto»',
            'postgres://supabase_admin:Clave123@db:5432/postgres': 'postgres://supabase_admin:«oculto»@db:5432/postgres',
            'https://x/?apikey=abc&b=2': 'https://x/?apikey=«oculto»&b=2',
            'TUNNEL_TOKEN=eyJhIjoiMTIz': 'TUNNEL_TOKEN=«oculto»',
        }
        for entrada, esperado in casos.items():
            self.assertEqual(secretos.tachar(entrada), esperado)

    def test_no_tacha_lo_normal(self):
        for t in ('POSTGRES_PORT=5432', 'INC-08 aplicada {"co2": 0.41}', 'correo=juan@x.com status=200'):
            self.assertEqual(secretos.tachar(t), t)


class Validaciones(unittest.TestCase):
    def test_host(self):
        self.assertEqual(red.validar_host('192.168.5.1'), '192.168.5.1')
        self.assertEqual(red.validar_host('incubapp.cdhmaker.com'), 'incubapp.cdhmaker.com')
        for malo in ('1.1.1.1; calc', '-x', 'a..b', '$(id)', '', 'a b'):
            with self.assertRaises(ValueError):
                red.validar_host(malo)

    def test_red(self):
        self.assertEqual(str(red.validar_red('192.168.5.7/24')), '192.168.5.0/24')
        for malo in ('8.8.8.0/24', '10.0.0.0/8', 'hola'):
            with self.assertRaises(ValueError):
                red.validar_red(malo)

    def test_mac(self):
        self.assertEqual(red.validar_mac('aa-bb-cc-dd-ee-ff'), 'AA:BB:CC:DD:EE:FF')
        self.assertTrue(red.mac_aleatoria('AA:E0:78:BE:C7:A2'))
        self.assertFalse(red.mac_aleatoria('78:9A:18:E0:8E:80'))
        with self.assertRaises(ValueError):
            red.validar_mac('zz:zz')

    def test_herramientas(self):
        with self.assertRaises(ValueError):
            red.validar_herramienta('rm', {})
        with self.assertRaises(ValueError):
            red.validar_herramienta('http', {'url': 'file:///C:/Windows'})
        with self.assertRaises(ValueError):
            red.validar_herramienta('puerto', {'host': '192.168.5.1', 'puerto': 70000})
        red.validar_herramienta('http', {'url': 'https://incubapp.cdhmaker.com/'})

    def test_acciones_rechazan(self):
        with self.assertRaises(acciones.ErrorAccion):
            acciones.ejecutar('no-existe', {})
        with self.assertRaises(acciones.ErrorAccion):
            acciones._contenedor({'contenedor': 'x; rm -rf /'})
        with self.assertRaises(acciones.ErrorAccion):
            acciones._correo({'correo': 'no-es-correo'})
        with self.assertRaises(acciones.ErrorAccion):
            acciones._destino({'destino': 'C:\\Windows'})

    def test_catalogo(self):
        ids = {a['id'] for a in acciones.catalogo()}
        for id_ in ('revisar_todo', 'arrancar_servidor', 'reiniciar_wsl', 'respaldo_ahora', 'reporte_soporte', 'abrir'):
            self.assertIn(id_, ids)
        self.assertFalse(any(k.startswith('_') for a in acciones.catalogo() for k in a))


class Sistema(unittest.TestCase):
    def test_a_wsl_y_cita(self):
        self.assertEqual(sistema.a_wsl(r'C:\IncubApp\servidor-local'), '/mnt/c/IncubApp/servidor-local')
        self.assertEqual(sistema.q("a'b; rm"), "'a'\"'\"'b; rm'")

    def test_ajustes(self):
        a = sistema.Ajustes()
        a.guardar = lambda: None
        self.assertEqual(a.actualizar({'intervalo_rapido_s': '15', 'notificaciones': 0, 'nada': 1, 'escaneo_red_min': -5}),
                         ['intervalo_rapido_s', 'notificaciones'])
        self.assertEqual(a.intervalo_rapido_s, 15)
        self.assertFalse(a.notificaciones)

    def test_puertos(self):
        self.assertEqual(puertos_conocidos.describir(23)[1], 'critico')
        self.assertEqual(puertos_conocidos.describir(65000)[0], 'Desconocido')
        self.assertIn(502, puertos_conocidos.PERFILES['industrial'])


class Trabajos(unittest.TestCase):
    def test_funcion_y_error(self):
        t = trabajos.TRABAJOS.lanzar('prueba', 'ok', lambda tr: (tr.linea('hola'), 42)[1])
        e = trabajos.TRABAJOS.lanzar('prueba', 'mal', lambda tr: 1 / 0)
        for x in (t, e):
            while not x.terminado:
                time.sleep(0.05)
        self.assertEqual((t.estado, t.resultado), ('ok', 42))
        self.assertEqual(e.estado, 'error')
        self.assertEqual(t.como_dict(1)['lineas'], [])

    def test_exclusivo(self):
        a = trabajos.TRABAJOS.lanzar('p', 'a', lambda tr: time.sleep(0.5), exclusivo='x')
        b = trabajos.TRABAJOS.lanzar('p', 'b', lambda tr: None, exclusivo='x')
        self.assertIs(a, b)


class Panel(unittest.TestCase):
    def test_rutas_estaticas_peligrosas(self):
        import panel
        for ruta in ('/../DISENO.md', '/..%2fDISENO.md', '/C:/Windows/win.ini', '/js/..\\..\\x'):
            self.assertTrue('..' in ruta or ':' in ruta or '\\' in ruta or '%2f' in ruta)
        rutas = {f.__name__ for _, _, f in panel.RUTAS}
        self.assertIn('r_estado', rutas)
        self.assertIn('r_salir', rutas)


if __name__ == '__main__':
    unittest.main()
