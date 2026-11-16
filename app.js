/* Jacinto · app del celular. Lee la pestaña "app" de la hoja pública y lanza el workflow de GitHub.
   El token de GitHub queda solo en este teléfono (localStorage). */
(function () {
'use strict';
const N = window.JacintoNucleo, VERSION = '1.0.1';
// El ID de la hoja NO va en el código (el repo de la app es público y la hoja tiene los picks del VIP):
// se pega una vez en Ajustes (link completo o solo el ID) o se abre la app con #hoja=<ID>; queda solo en el teléfono.
const DEF = { owner: 'frankdiaza13-ux', repo: 'jacinto-bot', workflow: 'jacinto_cron.yml', branch: 'main', sheetId: '' };
const idHoja = (t) => { const s = String(t || '').trim(), m = s.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/); return m ? m[1] : s; };
const K = { cfg: 'jacinto.cfg', tok: 'jacinto.token', ultimo: 'jacinto.ultimo', seg: 'jacinto.seguimiento', filtro: 'jacinto.filtro' };
const INPUTS_EXTRA = { motor: 'pinnacle', generar_voz: 'no' }, MAX_SEG_MS = 12 * 60 * 1000;
const ACCIONES = {
  analizar: { corto: 'Analizar', titulo: '¿Analizar ahora?', ok: 'Sí, analizar',
    texto: 'Jacinto revisará los partidos de las próximas horas y te avisará por Telegram si encuentra apuestas con valor.' },
  cerrar: { corto: 'Cerrar día', titulo: '¿Cerrar el día ahora?', ok: 'Sí, cerrar el día',
    texto: 'Jacinto buscará los resultados, cerrará las apuestas terminadas, actualizará la banca y te mandará el resumen.' },
  resumen: { corto: 'Resumen', titulo: '¿Enviar el resumen a Telegram?', ok: 'Sí, enviar resumen',
    texto: 'Jacinto te mandará por Telegram cómo va tu día: apuestas, resultados y banca.' }
};
const DEMO = new URLSearchParams(location.search).get('demo') === '1';
const $ = (s) => document.querySelector(s);
const todos = (s) => Array.prototype.slice.call(document.querySelectorAll(s));

// almacenamiento (puede fallar en modo privado)
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* nada */ } }
};
const leerJSON = (k) => { try { return JSON.parse(store.get(k) || 'null'); } catch (e) { return null; } };
const cfg = () => {
  const c = leerJSON(K.cfg) || {}, r = {};
  Object.keys(DEF).forEach((k) => { r[k] = (c[k] && String(c[k]).trim()) || DEF[k]; });
  return r;
};
const token = () => (store.get(K.tok) || '').trim();

let datos = null, ultimaCarga = 0, runs = [], cargando = false, seguimiento = null, accionPendiente = null;
let timerSeg = null, timerToast = null, timerChip = null, filtro = store.get(K.filtro) || 'todas';

// interfaz
function toast(msg, ms) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('ver');
  clearTimeout(timerToast);
  timerToast = setTimeout(() => t.classList.remove('ver'), ms || 3500);
}
function aviso(msg, reintentar) {
  $('#aviso').innerHTML = `<span>${N.esc(msg)}</span>` + (reintentar ? ' <button type="button" class="link" data-reintentar>Reintentar</button>' : '');
  $('#aviso').hidden = false;
}
const mostrarDlg = (d) => { if (d.showModal) { if (!d.open) d.showModal(); } else d.setAttribute('open', ''); };
const cerrarDlg = (d) => { if (d.close) { if (d.open) d.close(); } else d.removeAttribute('open'); };
const bloquearBotones = (si) => todos('.acciones [data-accion]').forEach((b) => { b.disabled = si; });
function mostrarChip(e, url) {
  const c = $('#chipCorrida');
  clearTimeout(timerChip);
  c.textContent = e.t;
  c.className = 'chip ' + e.c;
  if (url && /^https:\/\/github\.com\//.test(url)) { c.href = url; c.setAttribute('aria-label', e.t + ': ver la corrida en GitHub'); }
  else { c.removeAttribute('href'); c.removeAttribute('aria-label'); }
  c.hidden = false;
}
function ocultarChipLuego(ms) {
  clearTimeout(timerChip);
  timerChip = setTimeout(() => { if (!seguimiento) $('#chipCorrida').hidden = true; }, ms);
}

// datos de la hoja
const errorHoja = (tipo, msg) => Object.assign(new Error(msg), { tipo });
const MSG_HOJA = {
  privada: 'La hoja no es pública o el ID está mal. En Google Sheets: Compartir → Cualquier persona con el enlace → Lector.',
  gviz: 'Google no pudo entregar la pestaña "app" de la hoja.',
  corrupta: 'Los datos de la hoja están a medio escribir; reintento en 20 s.'
};
function leerHoja() {
  if (DEMO) {
    return fetch('demo.json', { cache: 'no-store' }).then((r) => {
      if (!r.ok) throw errorHoja('red', 'No se pudo cargar demo.json.');
      return r.json();
    });
  }
  if (!cfg().sheetId) return Promise.reject(errorHoja('sinhoja', 'Falta conectar tu hoja de Google: abre Ajustes y pega el link de la hoja.'));
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(cfg().sheetId)}/gviz/tq?tqx=out:csv&headers=0&sheet=app&_=${Date.now()}`;
  return fetch(url, { cache: 'no-store', credentials: 'omit' })
    .catch(() => { throw errorHoja('red', 'Sin conexión: no se pudo leer la hoja de Jacinto.'); })
    .then((r) => {
      if (!r.ok) throw errorHoja('http', `La hoja respondió con error ${r.status}.`);
      return r.text();
    }).then((txt) => {
      const res = N.leerEstado(txt);
      if (res.ok) return res.data;
      throw errorHoja(res.tipo, MSG_HOJA[res.tipo] || res.msg || 'No se pudo leer la hoja.');
    });
}
function cargar() {
  if (cargando) return Promise.resolve();
  cargando = true;
  $('#btnRefrescar').classList.add('girando');
  return leerHoja().then((d) => {
    datos = d;
    ultimaCarga = Date.now();
    $('#aviso').hidden = true;
    if (!DEMO) store.set(K.ultimo, JSON.stringify({ t: ultimaCarga, d }));
    render();
  }).catch((e) => {
    if (e.tipo === 'vacia') { datos = null; ultimaCarga = Date.now(); $('#aviso').hidden = true; renderVacio(); return; }
    if (e.tipo === 'sinhoja') {
      datos = null;
      renderVacio(true);
      $('#aviso').innerHTML = `<span>${N.esc(e.message)}</span> <button type="button" class="link" data-abrir-ajustes>Abrir Ajustes</button>`;
      $('#aviso').hidden = false;
      return;
    }
    if (e.tipo === 'corrupta') { aviso(e.message); setTimeout(cargar, 20000); return; }
    if (!datos) renderVacio(true);
    aviso((datos ? 'Mostrando la última copia guardada. ' : '') + (e.message || 'No se pudo leer la hoja.'), true);
  }).then(() => {
    cargando = false;
    $('#btnRefrescar').classList.remove('girando');
    $('#cargando').hidden = true;
    actualizarPie();
  });
}
function render() {
  const d = datos;
  if (!d) return;
  $('#cargando').hidden = $('#vacio').hidden = true;
  $('#contenido').hidden = false;
  $('#hero').innerHTML = N.htmlHero(d);
  const n = d.hoy && Array.isArray(d.hoy.apuestas) ? d.hoy.apuestas.length : 0;
  $('#nApuestas').textContent = n ? String(n) : '';
  $('#apuestas').innerHTML = N.htmlApuestas(d);
  renderMercados();
  $('#dias').innerHTML = N.htmlDias(d);
  $('#reglas').innerHTML = N.htmlReglas(d);
  $('#proximas').innerHTML = N.htmlProximas(d);
  if (DEMO) { runs = Array.isArray(d._demo_runs) ? d._demo_runs : []; renderCorridas(); }
  actualizarPie();
}
function renderMercados() {
  if (!datos) return;
  const r = N.htmlMercados(datos, filtro);
  $('#chipsMerc').innerHTML = r.chips;
  $('#mercados').innerHTML = r.html;
}
function renderVacio(porError) {
  $('#cargando').hidden = $('#contenido').hidden = true;
  $('#vacio').hidden = !!porError;
  $('#proximas').innerHTML = '';
}
function actualizarPie() {
  const partes = [];
  if (datos && datos.generado) {
    const viejo = Date.now() - new Date(datos.generado).getTime() > 6 * 3600 * 1000;
    partes.push(`${viejo ? '⚠️ ' : ''}Datos del bot ${N.esc(N.hace(datos.generado))} (${N.esc(N.horaChile(datos.generado))} hora Chile` +
      `${datos.accion ? ', ' + N.esc(datos.accion) : ''})`);
  }
  if (ultimaCarga) partes.push('revisado ' + N.esc(N.hace(new Date(ultimaCarga).toISOString())));
  partes.push('v' + VERSION + (DEMO ? ' · DEMO' : ''));
  $('#pie').innerHTML = partes.join(' · ');
}

// GitHub
const ErrorGH = (status, msg) => Object.assign(new Error(msg), { status });
function msgGH(s, cuerpo) {
  const extra = cuerpo ? ` (GitHub: ${cuerpo})` : '';
  const m = {
    401: 'Token inválido o vencido: crea uno nuevo en GitHub y pégalo en Ajustes.',
    403: 'GitHub negó el permiso: el token necesita "Actions: Read and write" sobre jacinto-bot.',
    404: 'No se encontró el repo o el workflow (revisa Ajustes), o el token no tiene acceso a ese repo privado.',
    422: 'GitHub rechazó la orden: revisa la rama y que el workflow acepte esa acción.'
  };
  return (m[s] || `GitHub respondió ${s}.`) + extra;
}
const errorDeRespuesta = (r) => r.json().catch(() => null).then((j) => ErrorGH(r.status, msgGH(r.status, j && j.message ? String(j.message) : '')));
const lanzarError = (r) => errorDeRespuesta(r).then((e) => { throw e; });
function gh(path, opts, tok) {
  const t = tok || token();
  if (!t) return Promise.reject(ErrorGH(0, 'Falta el token de GitHub (Ajustes).'));
  opts = opts || {};
  const headers = { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (opts.body) headers['Content-Type'] = 'application/json';
  return fetch('https://api.github.com' + path, { method: opts.method || 'GET', headers, body: opts.body, cache: 'no-store' })
    .catch(() => { throw ErrorGH(-1, 'Sin conexión con GitHub.'); });
}
const rutaRepo = (c) => `/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/actions`;
const rutaWorkflow = (c) => `${rutaRepo(c)}/workflows/${encodeURIComponent(c.workflow)}`;
const traerRuns = (tok, c) => gh(rutaWorkflow(c || cfg()) + '/runs?per_page=6', null, tok).then((r) =>
  r.status !== 200 ? lanzarError(r) : r.json().then((j) => (Array.isArray(j.workflow_runs) ? j.workflow_runs : [])));
const traerRun = (id) => gh(`${rutaRepo(cfg())}/runs/${encodeURIComponent(id)}`)
  .then((r) => (r.status === 200 ? r.json() : null)).catch(() => null);
function renderCorridas(msg) {
  const el = $('#corridas');
  if (!DEMO && !token()) {
    el.innerHTML = '<p class="vacio">Agrega tu token de GitHub en <button type="button" class="link" data-abrir-ajustes>Ajustes</button> para ver y lanzar corridas desde aquí.</p>';
  } else el.innerHTML = msg ? `<p class="vacio">${N.esc(msg)}</p>` : N.htmlCorridas(runs, Date.now());
}
function cargarRuns() {
  if (DEMO || !token()) { renderCorridas(); return Promise.resolve(); }
  return traerRuns().then((l) => { runs = l; renderCorridas(); }).catch((e) => renderCorridas(e.message));
}

function despachar(accion) {
  const c = cfg(), ruta = rutaWorkflow(c) + '/dispatches', t0 = Date.now();
  const enviar = (inputs) => gh(ruta, { method: 'POST', body: JSON.stringify({ ref: c.branch, inputs }) });
  bloquearBotones(true);
  mostrarChip({ t: 'Enviando…', c: 'st-cola' });
  return enviar(Object.assign({ accion }, INPUTS_EXTRA)).then((r) => r.status !== 422 ? r
    // Si el workflow ya no tiene las entradas "motor"/"generar_voz", se reintenta solo con "accion".
    : errorDeRespuesta(r).then((e) => { if (/unexpected inputs?/i.test(e.message)) return enviar({ accion }); throw e; })
  ).then((r) => {
    if (r.status !== 204) return lanzarError(r);
    toast(`Orden enviada: ${ACCIONES[accion].corto} ✓ Te aviso cuando termine.`);
    seguir(accion, t0);
  }).catch((e) => {
    mostrarChip({ t: 'Error ✗', c: 'st-mal' });
    ocultarChipLuego(15000);
    toast(e.message || 'No se pudo enviar la orden.', 8000);
  }).then(() => bloquearBotones(false));
}
function seguir(accion, t0) {
  seguimiento = { accion, t0, inicio: Date.now(), runId: null, url: '' };
  store.set(K.seg, JSON.stringify(seguimiento));
  mostrarChip({ t: 'En cola', c: 'st-cola' });
  clearTimeout(timerSeg);
  timerSeg = setTimeout(pollSeguimiento, 4000);
}
function finSeguimiento() { seguimiento = null; store.del(K.seg); clearTimeout(timerSeg); }
function elegirRun(lista, s) {
  const desde = s.t0 - 2 * 60 * 1000;   // tolera relojes desfasados
  const cand = lista.filter((r) => r.event === 'workflow_dispatch' && new Date(r.created_at).getTime() >= desde);
  return cand.filter((r) => String(r.display_title || r.name || '').toLowerCase().indexOf(s.accion) !== -1)[0] || cand[0] || null;
}
function pollSeguimiento() {
  clearTimeout(timerSeg);
  const s = seguimiento;
  if (!s) return;
  if (Date.now() - s.inicio > MAX_SEG_MS) {
    mostrarChip({ t: 'Sin noticias', c: 'st-neutral' }, s.url);
    ocultarChipLuego(60000);
    toast('La corrida está tardando más de lo normal; revísala en GitHub.', 6000);
    finSeguimiento();
    return;
  }
  traerRuns().then((lista) => {
    runs = lista;
    renderCorridas();
    const run = s.runId ? lista.filter((r) => r.id === s.runId)[0] : elegirRun(lista, s);
    return run || (s.runId ? traerRun(s.runId) : null);
  }).then((run) => {
    if (!run || seguimiento !== s) return false;
    s.runId = run.id;
    s.url = run.html_url;
    store.set(K.seg, JSON.stringify(s));
    mostrarChip(N.estadoRun(run), run.html_url);
    if (run.status !== 'completed') return false;
    finSeguimiento();
    ocultarChipLuego(90000);
    if (run.conclusion === 'success') {
      toast('Listo ✓ Actualizando los datos…');
      cargar();
      setTimeout(cargar, 15000);   // la hoja puede tardar unos segundos en mostrar lo nuevo
    } else toast('La corrida terminó con error. Toca el aviso de arriba para verla en GitHub.', 8000);
    return true;
  }).catch(() => false).then((termino) => {
    if (!termino && seguimiento === s) timerSeg = setTimeout(pollSeguimiento, 8000);
  });
}
function reanudarSeguimiento() {
  const s = leerJSON(K.seg);
  if (!s || DEMO || !token() || !s.inicio || Date.now() - s.inicio > MAX_SEG_MS) { store.del(K.seg); return; }
  seguimiento = s;
  mostrarChip({ t: 'Revisando…', c: 'st-cola' }, s.url);
  pollSeguimiento();
}

// acciones (botones y enlaces de Telegram)
function pedirAccion(accion) {
  const a = ACCIONES[accion];
  if (!a) return;
  if (!DEMO && !token()) {
    accionPendiente = accion;
    abrirAjustes(`Para «${a.corto}» necesitas pegar tu token de GitHub (una sola vez en este teléfono). Cómo crearlo: README de la app.`);
    return;
  }
  const d = $('#dlgConfirmar');
  $('#tConf').textContent = a.titulo;
  $('#txtConf').textContent = a.texto;
  $('#btnConfOk').textContent = a.ok;
  d.setAttribute('data-accion', accion);
  mostrarDlg(d);
}
function confirmar() {
  const d = $('#dlgConfirmar'), accion = d.getAttribute('data-accion');
  cerrarDlg(d);
  if (!ACCIONES[accion]) return;
  if (DEMO) toast('Modo demo: no se envió nada a GitHub.');
  else despachar(accion);
}
function leerHash() {
  const h = location.hash.replace(/^#/, '');
  if (!h) return;
  const p = new URLSearchParams(h), accion = p.get('accion'), hoja = idHoja(p.get('hoja'));
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* nada */ }
  if (hoja && !DEMO) {   // link de configuración: guarda el ID de la hoja en este teléfono
    const c = cfg();
    if (c.sheetId !== hoja) {
      c.sheetId = hoja;
      if (store.set(K.cfg, JSON.stringify(c))) { toast('Hoja conectada ✓'); cargar(); }
      else toast('Este navegador no deja guardar datos: pega el link de la hoja en Ajustes.', 8000);
    }
  }
  if (accion && ACCIONES[accion]) pedirAccion(accion);
}

// ajustes
const CAMPOS = { owner: '#inOwner', repo: '#inRepo', workflow: '#inWorkflow', branch: '#inBranch', sheetId: '#inSheet' };
const enmascarar = (t) => (t.length > 16 ? t.slice(0, 11) + '…' + t.slice(-4) : '••••••');
function cfgFormulario() {
  const c = {};
  Object.keys(CAMPOS).forEach((k) => { c[k] = ($(CAMPOS[k]).value || '').trim() || DEF[k]; });
  c.sheetId = idHoja(c.sheetId);
  return c;
}
const estadoToken = () => { $('#tokenEstado').textContent = token() ? 'Token guardado: ' + enmascarar(token()) : 'Sin token guardado.'; };
function abrirAjustes(nota) {
  const c = cfg(), inp = $('#inToken'), demo = $('#linkDemo');
  $('#ajNota').textContent = nota || '';
  $('#ajNota').hidden = !nota;
  inp.value = '';
  inp.type = 'password';
  $('#btnVerToken').textContent = 'Ver';
  estadoToken();
  Object.keys(CAMPOS).forEach((k) => { $(CAMPOS[k]).value = c[k]; });
  $('#probarRes').textContent = '';
  $('#probarRes').className = 'nota';
  demo.href = DEMO ? location.pathname : location.pathname + '?demo=1';
  demo.textContent = DEMO ? 'Salir de la demo' : 'Ver la demo (datos de ejemplo)';
  mostrarDlg($('#dlgAjustes'));
}
function guardarAjustes() {
  const nuevo = $('#inToken').value.trim(), c = cfgFormulario(), antes = cfg();
  store.set(K.cfg, JSON.stringify(c));
  if (nuevo && !store.set(K.tok, nuevo)) toast('No se pudo guardar el token: este navegador bloquea el almacenamiento.', 8000);
  else if (nuevo && !/^(github_pat_|ghp_)/.test(nuevo)) toast('Guardado, pero ojo: ese texto no parece un token de GitHub (suelen empezar con github_pat_).', 7000);
  else toast('Ajustes guardados ✓');
  cerrarDlg($('#dlgAjustes'));
  cargarRuns();
  if (c.sheetId !== antes.sheetId) cargar();
  if (accionPendiente && token()) {
    const a = accionPendiente;
    accionPendiente = null;
    setTimeout(() => pedirAccion(a), 250);
  }
}
function probarConexion() {
  const el = $('#probarRes'), tok = $('#inToken').value.trim() || token();
  if (!tok) { el.textContent = 'Primero pega un token.'; el.className = 'nota mal'; return; }
  el.textContent = 'Probando…';
  el.className = 'nota';
  traerRuns(tok, cfgFormulario()).then((l) => {
    el.textContent = 'Conexión OK ✓ ' + (l.length ? `Última corrida: ${l[0].display_title || 'sin nombre'} (${N.hace(l[0].created_at)}).`
      : 'Todavía no hay corridas de ese workflow.');
    el.className = 'nota ok';
  }).catch((e) => { el.textContent = e.message; el.className = 'nota mal'; });
}

function refrescar() { cargar(); cargarRuns(); }

// inicio
const clic = (sel, fn) => $(sel).addEventListener('click', (e) => { e.preventDefault(); fn(e); });
function init() {
  if (DEMO) { $('#demoTag').hidden = false; document.title = 'Jacinto (demo)'; }
  todos('.acciones [data-accion]').forEach((b) => b.addEventListener('click', () => pedirAccion(b.getAttribute('data-accion'))));
  clic('#btnRefrescar', refrescar);
  clic('#btnAjustes', () => abrirAjustes());
  clic('#btnConfOk', confirmar);
  clic('#btnConfNo', () => cerrarDlg($('#dlgConfirmar')));
  clic('#btnGuardar', guardarAjustes);
  clic('#btnCerrarAj', () => { accionPendiente = null; cerrarDlg($('#dlgAjustes')); });
  clic('#btnProbar', probarConexion);
  clic('#btnBorrarToken', () => { store.del(K.tok); estadoToken(); renderCorridas(); toast('Token borrado de este teléfono.'); });
  clic('#btnVerToken', () => {
    const i = $('#inToken'), ver = i.type === 'password';
    i.type = ver ? 'text' : 'password';
    $('#btnVerToken').textContent = ver ? 'Ocultar' : 'Ver';
  });
  todos('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) cerrarDlg(d); }));   // toque fuera de la hoja
  $('#chipsMerc').addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-filtro]');
    if (!b) return;
    filtro = b.getAttribute('data-filtro');
    store.set(K.filtro, filtro);
    renderMercados();
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest) return;
    if (e.target.closest('[data-abrir-ajustes]')) abrirAjustes();
    if (e.target.closest('[data-reintentar]')) refrescar();
  });

  if (!DEMO) {   // copia guardada: se ve al instante mientras llega lo nuevo
    const g = leerJSON(K.ultimo);
    if (g && g.d && g.d.v != null) { datos = g.d; ultimaCarga = g.t || 0; render(); }
  }
  renderCorridas();
  leerHash();   // antes de cargar(): un link #hoja=… deja la hoja conectada para esta primera carga
  cargar().then(cargarRuns);
  addEventListener('hashchange', leerHash);
  reanudarSeguimiento();
  setInterval(() => { if (document.visibilityState === 'visible') refrescar(); }, 120000);
  setInterval(actualizarPie, 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - ultimaCarga > 60000) refrescar();
  });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* sin modo offline */ });
  }
}
init();
})();
