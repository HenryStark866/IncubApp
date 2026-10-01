// Panel IncubApp · aplica el tema guardado ANTES de pintar la página (script clásico, sin módulos).
// Preferencia: 'oscuro' (por defecto), 'claro' o 'sistema'.
(function () {
  var tema = 'oscuro';
  try {
    var v = localStorage.getItem('panel.tema');
    if (v) tema = JSON.parse(v) || 'oscuro';
  } catch (e) { /* sin almacenamiento: tema por defecto */ }
  if (tema === 'sistema') {
    try { tema = window.matchMedia('(prefers-color-scheme: light)').matches ? 'claro' : 'oscuro'; } catch (e) { tema = 'oscuro'; }
  }
  document.documentElement.setAttribute('data-tema', tema === 'claro' ? 'claro' : 'oscuro');
})();
