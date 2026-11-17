/* Jacinto · núcleo sin DOM (formatos, CSV de la hoja, HTML). Navegador: window.JacintoNucleo · node: module.exports */
(function (raiz) {
'use strict';
const TZ = 'America/Santiago';

// formatos
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (v) => {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
};
const miles = (n) => String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const clp = (v, signo) => {
  const n = num(v);
  if (n === null) return '—';
  const r = Math.round(n);
  return (r < 0 ? '−' : (signo && r > 0 ? '+' : '')) + '$' + miles(r);
};
const clpCorto = (v) => {
  const n = num(v);
  if (n === null) return '';
  const r = Math.round(n), s = r < 0 ? '−' : r > 0 ? '+' : '', a = Math.abs(r);
  if (a >= 1e6) return s + (a / 1e6).toFixed(1).replace('.', ',') + 'M';
  return s + (a >= 1000 ? Math.round(a / 1000) + 'k' : a);
};
const pct = (v, signo, dec) => {
  const n = num(v);
  if (n === null) return '—';
  const d = dec == null ? 1 : dec, f = Math.pow(10, d), r = Math.round(n * f) / f;
  return (r < 0 ? '−' : (signo !== false && r > 0 ? '+' : '')) + Math.abs(r).toFixed(d).replace('.', ',') + '%';
};
const cuota = (v) => { const n = num(v); return n === null || n <= 1 ? '—' : n.toFixed(2); };
const signoClase = (v) => { const n = num(v); return n === null ? '' : n > 0 ? 'pos' : n < 0 ? 'neg' : ''; };
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// fechas (hora de Chile)
let fmtHM = null, fmtYMD = null;
try {
  fmtHM = new Intl.DateTimeFormat('es-CL', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  fmtYMD = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
} catch (e) { fmtHM = fmtYMD = null; }
const dos = (n) => (n < 10 ? '0' : '') + n;
const horaChile = (iso) => {
  const d = new Date(iso);
  if (!iso || isNaN(d)) return '';
  return fmtHM ? fmtHM.format(d).replace(/\s/g, '') : dos(d.getHours()) + ':' + dos(d.getMinutes());
};
const fechaChile = (fecha) => {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (isNaN(d)) return '';
  if (fmtYMD && fmtYMD.formatToParts) {
    const p = {};
    fmtYMD.formatToParts(d).forEach((x) => { p[x.type] = x.value; });
    return `${p.year}-${p.month}-${p.day}`;
  }
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
};
const fechaCorta = (ymd) => { const s = String(ymd || ''); return s.length >= 10 ? s.slice(8, 10) + '-' + s.slice(5, 7) : s; };
const sumarDias = (ymd, k) => {
  const p = String(ymd).split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + k)).toISOString().slice(0, 10);
};
/** "16:45" si es el día de referencia; "mañana 16:45", "ayer 16:45" o "17-11 16:45" si no. */
const etiquetaHora = (iso, hoyStr, siempreDia) => {
  const h = horaChile(iso);
  if (!h || !hoyStr) return h;
  const f = fechaChile(iso);
  if (f === hoyStr) return siempreDia ? 'hoy ' + h : h;
  if (f === sumarDias(hoyStr, 1)) return 'mañana ' + h;
  if (f === sumarDias(hoyStr, -1)) return 'ayer ' + h;
  return fechaCorta(f) + ' ' + h;
};
const hace = (iso, ahoraMs) => {
  const t = new Date(iso).getTime();
  if (!iso || isNaN(t)) return '';
  const s = Math.max(0, ((ahoraMs || Date.now()) - t) / 1000);
  if (s < 60) return 'hace instantes';
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h` + (m % 60 ? ` ${m % 60} min` : '');
  return 'hace ' + plural(Math.floor(h / 24), 'día', 'días');
};

// pestaña "app": CSV de gviz -> JSON
/** CSV: comillas, "" , comas y saltos de línea entre comillas, CRLF. */
function parseCSV(txt) {
  const filas = [], n = txt.length;
  let fila = [], campo = '', i = 0, enComillas = false;
  while (i < n) {
    const c = txt.charAt(i);
    if (enComillas) {
      if (c === '"') {
        if (txt.charAt(i + 1) === '"') { campo += '"'; i += 2; } else { enComillas = false; i++; }
        continue;
      }
      const fin = txt.indexOf('"', i);
      campo += fin === -1 ? txt.slice(i) : txt.slice(i, fin);
      i = fin === -1 ? n : fin;
      continue;
    }
    i++;
    if (c === '"') enComillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}
const trozos = (txt) => parseCSV(txt).map((f) => (f[0] == null ? '' : f[0]));
const unirChunks = (txt) => trozos(txt).join('');
const esEstado = (d) => !!d && typeof d === 'object' && !Array.isArray(d) && d.v != null;
/** {ok, data} o {ok:false, tipo: privada|gviz|vacia|corrupta} */
function leerEstado(txt) {
  txt = String(txt || '');
  if (/google\.visualization\.Query\.setResponse/.test(txt)) return { ok: false, tipo: 'gviz' };
  if (/^\s*</.test(txt)) return { ok: false, tipo: 'privada' };
  const partes = trozos(txt), todo = partes.join('').trim();
  if (!todo || todo.charAt(0) !== '{') return { ok: false, tipo: 'vacia' };
  try {
    const d = JSON.parse(todo);
    return esEstado(d) ? { ok: true, data: d } : { ok: false, tipo: 'vacia' };
  } catch (e) {
    // Si quedaron trozos viejos al final (el bot escribió menos filas que antes), el JSON válido es un prefijo.
    for (let k = partes.length - 1; k >= 1; k--) {
      try {
        const d = JSON.parse(partes.slice(0, k).join('').trim());
        if (esEstado(d)) return { ok: true, data: d, sobrantes: partes.length - k };
      } catch (e2) { /* sigue probando */ }
    }
    return { ok: false, tipo: 'corrupta' };
  }
}

// HTML
const kpi = (nombre, valor, clase, nota) =>
  `<div class="kpi"><span>${esc(nombre)}</span><b class="${clase}">${valor}</b>${nota ? `<small>${esc(nota)}</small>` : ''}</div>`;
function htmlHero(d) {
  const b = (d && d.banca) || {}, h = (d && d.hoy) || {};
  const nu = num(h.nulas) || 0, neta = num(b.neta), ini = num(b.inicial);
  const conteo = [plural(num(h.ganadas) || 0, 'ganada', 'ganadas'), plural(num(h.perdidas) || 0, 'perdida', 'perdidas'),
    plural(num(h.pendientes) || 0, 'pendiente', 'pendientes')].concat(nu ? [plural(nu, 'nula', 'nulas')] : []);
  return `<div class="hero-top"><div class="hero-col"><div class="label">Banca actual</div><div class="big">${clp(b.actual)}</div>` +
    `<div class="sub ${signoClase(neta)}">${neta === null ? '&nbsp;' : `<span class="nw">${clp(neta, true)}</span> desde el inicio`}` +
    `${ini !== null ? ` <span class="muted">(${clp(ini)})</span>` : ''}</div></div>` +
    `<div class="hero-col der"><div class="label">Hoy${h.fecha ? ' · ' + esc(fechaCorta(h.fecha)) : ''}</div>` +
    `<div class="big ${signoClase(h.ganancia)}">${clp(h.ganancia, true)}</div><div class="sub">apostado ${clp(h.apostado)}</div></div></div>` +
    `<div class="conteo">${conteo.join(' · ')}</div><div class="kpis">` +
    kpi('ROI', pct(b.roi_pct), signoClase(b.roi_pct), num(b.cerradas) !== null ? miles(b.cerradas) + ' cerradas' : '') +
    kpi('CLV', pct(b.clv_pct), signoClase(b.clv_pct), num(b.clv_n) !== null ? miles(b.clv_n) + ' medidas' : '') +
    kpi('Acierto', pct(b.acierto_pct, false), '', '') +
    kpi('Caída máx.', clp(b.caida_max), num(b.caida_max) ? 'neg' : '', '') + '</div>' +
    (b.recomendacion ? `<p class="reco"><span aria-hidden="true">💡 </span>${esc(b.recomendacion)}</p>` : '');
}

const ESTADOS = { HIT: ['Ganada', 'hit'], MISS: ['Perdida', 'miss'], NULO: ['Nula', 'nulo'],
  Pendiente: ['Pendiente', 'pend'], REVISAR_MANUAL: ['Por revisar', 'rev'] };
/** Fila "👑 premium" (solo si la app está conectada al servidor premium): visible u oculta para tus clientes. */
function htmlPremium(a) {
  if (typeof a.premium !== 'boolean' || !a.id) return '';
  return `<div class="prem${a.premium ? '' : ' oculta'}"><span>👑 ${a.premium ? 'Visible para tus clientes premium' : 'Oculta en premium'}</span>` +
    `<button type="button" class="link" data-premium="${esc(a.id)}" data-oculto="${a.premium ? '1' : '0'}">${a.premium ? 'Ocultar' : 'Mostrar'}</button></div>`;
}
function htmlApuesta(a, hoyStr) {
  const tipo = String(a.tipo || '').toUpperCase(), e = ESTADOS[a.estado] || [a.estado ? String(a.estado) : 'Pendiente', 'pend'];
  const cerrada = a.estado === 'HIT' || a.estado === 'MISS' || a.estado === 'NULO';
  const meta = [], res = [];
  if (num(a.prob) !== null) meta.push('Prob. ' + pct(a.prob, false, 0));
  if (num(a.ev) !== null) meta.push(`EV <b class="${signoClase(a.ev)}">${pct(a.ev)}</b>`);
  if (num(a.apuesta) !== null) meta.push(`Apuesta <b>${clp(a.apuesta)}</b>`);
  if (num(a.cuota_min) !== null) meta.push('mín. @' + cuota(a.cuota_min));
  if (a.marcador) res.push(esc(a.marcador));
  if (num(a.ganancia) !== null && (cerrada || num(a.ganancia) !== 0)) res.push(`<b class="${signoClase(a.ganancia)}">${clp(a.ganancia, true)}</b>`);
  if (num(a.clv) !== null) res.push(`CLV <span class="${signoClase(a.clv)}">${pct(a.clv)}</span>`);
  const etiqueta = tipo === 'DIARIA' ? ' <span class="tipo diaria">Diaria · sin valor, stake mínimo</span>'
    : tipo === 'VALOR' ? ' <span class="tipo valor">Valor</span>' : '';
  const aviso = a.estimada && !cerrada ? `<div class="alerta"><span aria-hidden="true">⚠️ </span>Cuota de un feed atrasado: verifica en ${esc(a.casa || 'la casa')}` +
    `${num(a.cuota_min) !== null ? ' que pague ≥ ' + cuota(a.cuota_min) : ' la cuota'} antes de apostar.</div>` : '';
  const hora = a.kickoff ? (a.competicion ? ' · ' : '') + esc(etiquetaHora(a.kickoff, hoyStr)) : '';
  return `<article class="apuesta e-${e[1]}"><div class="fila1"><span class="comp">${esc(a.competicion || '')}${hora}</span>` +
    `<span class="estado ${e[1]}">${esc(e[0])}</span></div><div class="partido">${esc(a.partido || '')}</div>` +
    `<div class="pick"><b>${esc(a.pronostico || '')}</b> <span class="cuota">@ ${cuota(a.cuota)}</span>` +
    `${a.casa ? ` <span class="casa">${esc(a.casa)}</span>` : ''}${etiqueta}</div>` +
    (meta.length ? `<div class="meta">${meta.join(' · ')}</div>` : '') +
    (res.length ? `<div class="resultado">${res.join(' · ')}</div>` : '') + aviso + htmlPremium(a) + '</article>';
}
function htmlApuestas(d) {
  d = d || {};
  const h = d.hoy || {}, lista = Array.isArray(h.apuestas) ? h.apuestas.filter(Boolean) : [];
  if (!lista.length) {
    return '<p class="vacio">Hoy no hay apuestas todavía.' + (d.parametros && d.parametros.diaria
      ? ' Si no aparece valor, en la última revisión del día Jacinto hará la apuesta diaria con monto mínimo.' : '') + '</p>';
  }
  const orden = (e) => (!e || e === 'Pendiente' ? 0 : e === 'REVISAR_MANUAL' ? 1 : 2);
  lista.sort((a, b) => orden(a.estado) - orden(b.estado) || String(a.kickoff || '').localeCompare(String(b.kickoff || '')));
  const hoyStr = h.fecha || fechaChile(new Date());
  return lista.map((a) => htmlApuesta(a, hoyStr)).join('');
}

const MERC = { APUESTA: ['Apuesta', 'apuesta'], SIN_VALOR: ['Sin valor', 'sinvalor'], SIN_CUOTAS: ['Sin cuotas', 'sincuotas'] };
const conValor = (m) => m.estado === 'APUESTA' || (num(m.ev) !== null && num(m.ev) > 0);
function htmlMercados(d, filtro) {
  d = d || {};
  const todos = (Array.isArray(d.mercados) ? d.mercados.filter(Boolean) : [])
    .sort((a, b) => String(a.kickoff || '').localeCompare(String(b.kickoff || '')));
  const n = { todas: todos.length, valor: todos.filter(conValor).length };
  n.sin = n.todas - n.valor;
  if (filtro !== 'valor' && filtro !== 'sin') filtro = 'todas';
  const chips = [['todas', 'Todas'], ['valor', 'Con valor'], ['sin', 'Sin valor']].map(([k, t]) =>
    `<button type="button" class="chipf${filtro === k ? ' activo' : ''}" data-filtro="${k}" aria-pressed="${filtro === k}">${t} <span>${n[k]}</span></button>`).join('');
  const lista = filtro === 'valor' ? todos.filter(conValor) : filtro === 'sin' ? todos.filter((m) => !conValor(m)) : todos;
  const hoyStr = (d.hoy && d.hoy.fecha) || fechaChile(new Date());
  const filas = lista.map((m) => {
    const e = MERC[m.estado] || [m.estado ? String(m.estado) : '—', 'sincuotas'], det = [];
    if (m.pronostico) det.push(esc(m.pronostico) + (num(m.cuota) ? ' @ ' + cuota(m.cuota) : ''));
    if (num(m.prob) !== null) det.push('prob ' + pct(m.prob, false, 0));
    if (num(m.ev) !== null) det.push(`<b class="${signoClase(m.ev)}">EV ${pct(m.ev)}</b>`);
    return `<li class="merc m-${e[1]}"><div class="m1"><span class="hora">${esc(etiquetaHora(m.kickoff, hoyStr, true))}</span>` +
      `<span class="badge ${e[1]}">${esc(e[0])}</span></div>` +
      `<div class="m2">${esc(m.partido || '')}${m.competicion ? ` <small>${esc(m.competicion)}</small>` : ''}</div>` +
      (det.length ? `<div class="m3">${det.join(' · ')}</div>` : '') + (m.motivo ? `<div class="m4">${esc(m.motivo)}</div>` : '') + '</li>';
  }).join('');
  return { filtro, chips, html: lista.length ? `<ul class="mercados">${filas}</ul>`
    : `<p class="vacio">${todos.length ? 'Nada en este filtro.' : 'Todavía no hay partidos revisados hoy.'}</p>` };
}

function htmlDias(d) {
  const dias = (d && Array.isArray(d.dias) ? d.dias : []).filter((x) => x && x.fecha).slice(-14);
  if (!dias.length) return '<p class="vacio">Aún no hay días con apuestas.</p>';
  const W = 340, H = 176, top = 22, alto = H - top - 36, lado = 6;
  const vals = dias.map((x) => num(x.ganancia) || 0);
  const maxP = Math.max(0, ...vals), maxN = Math.max(0, ...vals.map((v) => -v)), rango = (maxP + maxN) || 1;
  const y0 = top + alto * (maxP / rango), paso = (W - 2 * lado) / dias.length, ancho = Math.max(6, Math.min(34, paso * 0.62));
  const muchos = dias.length > 8, iMax = vals.indexOf(Math.max(...vals)), iMin = vals.indexOf(Math.min(...vals));
  const barras = dias.map((x, i) => {
    const v = vals[i], h = v === 0 ? 1.5 : Math.max(2, Math.abs(v) / rango * alto);
    const cx = (lado + paso * i + paso / 2).toFixed(1), y = v >= 0 ? y0 - h : y0;
    const conTexto = !muchos || i === iMax || i === iMin || i === dias.length - 1, conFecha = !muchos || (dias.length - 1 - i) % 2 === 0;
    return `<g><title>${esc(fechaCorta(x.fecha))}: ${esc(clp(v, true))} en ${esc(plural(num(x.n) || 0, 'apuesta', 'apuestas'))} (apostado ${esc(clp(x.apostado))})</title>` +
      `<rect class="${v > 0 ? 'b-pos' : v < 0 ? 'b-neg' : 'b-cero'}" x="${(cx - ancho / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${ancho.toFixed(1)}" height="${h.toFixed(1)}" rx="3"></rect>` +
      (conTexto ? `<text class="v" x="${cx}" y="${(v >= 0 ? y - 5 : y + h + 12).toFixed(1)}" text-anchor="middle">${esc(clpCorto(v))}</text>` : '') +
      (conFecha ? `<text class="f" x="${cx}" y="${H - 10}" text-anchor="middle">${esc(fechaCorta(x.fecha))}</text>` : '') + '</g>';
  }).join('');
  const suma = (f) => dias.reduce((a, x) => a + (num(f(x)) || 0), 0), tot = suma((x) => x.ganancia);
  return `<svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ganancia por día en los últimos ${plural(dias.length, 'día', 'días')} con apuestas">` +
    `<line class="cero" x1="${lado}" x2="${W - lado}" y1="${y0.toFixed(1)}" y2="${y0.toFixed(1)}"></line>${barras}</svg>` +
    `<p class="resumen-dias">${plural(dias.length, 'día', 'días')} · ${plural(suma((x) => x.n), 'apuesta', 'apuestas')} · apostado ${clp(suma((x) => x.apostado))}` +
    ` · resultado <b class="${signoClase(tot)}">${clp(tot, true)}</b></p>`;
}

function htmlReglas(d) {
  const p = (d && d.parametros) || {}, li = [];
  if (num(p.ev_min_principal) !== null) {
    li.push(`Apuesta solo si el <b>EV</b> es ≥ ${pct(p.ev_min_principal)} en mercados principales (1X2, doble oportunidad, goles, ambos marcan)` +
      (num(p.ev_min_props) !== null ? ` y ≥ ${pct(p.ev_min_props)} en córners y tarjetas` : '') + '.');
  }
  if (num(p.kelly) !== null) {
    li.push('Monto: Kelly × ' + String(p.kelly).replace('.', ',') +
      (num(p.max_pct) !== null ? `, máximo ${pct(p.max_pct, false)} de la banca por apuesta` : '') +
      (num(p.dia_max_pct) !== null ? ` y ${pct(p.dia_max_pct, false)} por día` : '') + '.');
  }
  if (p.diaria != null) li.push(p.diaria ? 'Si un día no aparece valor, se hace una apuesta diaria con monto mínimo (marcada «Diaria»).' : 'Los días sin valor no se apuesta.');
  li.push('<b>EV</b> (valor esperado): cuánto paga la casa por sobre la probabilidad real de Pinnacle. Positivo = la apuesta tiene ventaja.',
    '<b>CLV</b>: cuánto mejor fue tu cuota que la de cierre de Pinnacle. Si se mantiene positivo, el modelo tiene ventaja real aunque haya rachas malas.',
    '<b>Cuota mínima</b>: bajo esa cuota la apuesta ya no tiene valor; si la casa paga menos, no apuestes.');
  return `<ul class="reglas">${li.map((x) => `<li>${x}</li>`).join('')}</ul>`;
}
function htmlProximas(d) {
  const l = (d && Array.isArray(d.proximas) ? d.proximas : []).filter(Boolean);
  return l.length ? `<p class="proximas">Próximas automáticas (hora Chile): ${l.map(esc).join(' · ')}</p>` : '';
}

function estadoRun(r) {
  if (!r) return null;
  if (r.status !== 'completed') return r.status === 'in_progress' ? { t: 'Corriendo', c: 'st-run' } : { t: 'En cola', c: 'st-cola' };
  if (r.conclusion === 'success') return { t: 'Listo ✓', c: 'st-ok' };
  if (r.conclusion === 'cancelled' || r.conclusion === 'skipped') return { t: r.conclusion === 'skipped' ? 'Omitida' : 'Cancelada', c: 'st-neutral' };
  return { t: 'Falló ✗', c: 'st-mal' };
}
function htmlCorridas(runs, ahoraMs) {
  runs = (Array.isArray(runs) ? runs : []).filter(Boolean);
  if (!runs.length) return '<p class="vacio">No hay corridas recientes.</p>';
  return '<ul class="corridas">' + runs.slice(0, 6).map((r) => {
    const e = estadoRun(r), ini = r.run_started_at || r.created_at;
    const tipo = r.event === 'schedule' ? 'automática' : r.event === 'workflow_dispatch' ? 'manual' : (r.event || '');
    let dur = '';
    if (r.status === 'completed' && ini && r.updated_at) {
      const s = Math.max(0, (new Date(r.updated_at) - new Date(ini)) / 1000);
      dur = s >= 60 ? Math.round(s / 60) + ' min' : Math.round(s) + ' s';
    }
    const url = /^https:\/\/github\.com\//.test(String(r.html_url || '')) ? r.html_url : '';
    const dentro = `<span class="estado-run ${e.c}">${esc(e.t)}</span><span class="run-tit">${esc(r.display_title || r.name || 'Corrida')}</span>` +
      `<span class="run-meta">${esc(tipo)} · ${esc(hace(r.created_at, ahoraMs))}${dur ? ' · ' + dur : ''}</span>`;
    return '<li>' + (url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${dentro}</a>` : `<div class="run-fila">${dentro}</div>`) + '</li>';
  }).join('') + '</ul>';
}

const api = { esc, num, miles, clp, clpCorto, pct, cuota, signoClase, horaChile, fechaChile, fechaCorta, sumarDias, etiquetaHora, hace,
  parseCSV, unirChunks, leerEstado, htmlHero, htmlApuestas, htmlMercados, htmlDias, htmlReglas, htmlProximas, htmlCorridas, estadoRun, conValor };
raiz.JacintoNucleo = api;
if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
