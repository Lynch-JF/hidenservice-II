// ============================================================
//  SCRIPT PRINCIPAL v4 — Backend + Supabase + Motor de Tiempo Laboral
//  Requiere gm-api.js cargado ANTES
//
//  Novedades v4 (robustez):
//   1. Planificador central (1 solo intervalo) reemplaza los setTimeout
//      por pedido: ya no se acumulan ni sobreviven a pausas manuales.
//   2. Una pausa MANUAL nunca se reanuda sola. Cada segmento guarda
//      `cierre: "manual" | "auto"` y solo las pausas "auto" se reanudan.
//   3. Segmentos normalizados al cargar (sin solapes ni inconsistencias).
//   4. Alerta visual + banner para pedidos con demasiadas horas
//      laborables abiertas (UMBRAL_ALERTA_H).
//   5. Al finalizar se puede indicar la HORA REAL DE FIN; los segmentos
//      se recortan a esa hora (corrige pedidos que se olvidaron cerrar).
//   6. Tiempo de auxiliares calculado solo sobre los tramos activos.
//   7. Un solo reloj global (1 s) en vez de un intervalo por pedido.
//   8. Escape de HTML, anti-duplicados de código y "Eliminar Todos"
//      protegido (pide escribir ELIMINAR y no borra finalizados).
// ============================================================

// ── ESTADO GLOBAL ──
let pedidosActivos = {}; // { id_pedido: { ...datos, segmentos, paused, ... } }
let timers = {};         // (compatibilidad con horasextras.js)
let badgeTimers = {};    // (compatibilidad con horasextras.js)

const UMBRAL_EQUIPO = 100;
const UMBRAL_ALERTA_H = 12; // horas laborables abiertas a partir de las cuales se avisa
const UMBRAL_ALERTA_SEG = UMBRAL_ALERTA_H * 3600;

let soloAntiguos = false;

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// ============================================================
//  DÍAS FERIADOS (guardados en localStorage de ESTE navegador)
//  Ojo: si usas varias PCs, deben tener los mismos feriados o el
//  tiempo calculado diferirá entre ellas.
// ============================================================
function cargarFeriados() {
  try {
    return JSON.parse(localStorage.getItem("feriados_no_laborables") || "[]");
  } catch { return []; }
}

function guardarFeriados(lista) {
  localStorage.setItem("feriados_no_laborables", JSON.stringify(lista));
}

function esFeriado(fecha) {
  const key = `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
  return cargarFeriados().includes(key);
}

const FERIADOS_RD_2025 = [
  "2025-01-01", "2025-01-06", "2025-01-21", "2025-02-27", "2025-04-14",
  "2025-04-18", "2025-05-01", "2025-06-19", "2025-08-16", "2025-09-24",
  "2025-11-06", "2025-12-25"
];
const FERIADOS_RD_2026 = [
  "2026-01-01", "2026-01-06", "2026-01-26", "2026-02-27", "2026-04-03",
  "2026-04-06", "2026-05-01", "2026-06-29", "2026-08-16", "2026-09-24",
  "2026-11-06", "2026-12-25"
];

function precargarFeriadosRD() {
  if (cargarFeriados().length === 0) {
    guardarFeriados([...FERIADOS_RD_2025, ...FERIADOS_RD_2026]);
    console.log("✅ Feriados dominicanos 2025-2026 precargados.");
  }
}

// ============================================================
//  PANEL DE FERIADOS — UI
// ============================================================
function abrirPanelFeriados() {
  let overlay = document.getElementById("modal-feriados-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "modal-feriados-overlay";
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal" id="modal-feriados" style="max-width:480px;">
        <div class="modal-header">
          <h3 class="modal-title">🗓 Días Feriados No Laborables</h3>
          <button class="btn-delete" onclick="cerrarPanelFeriados()" title="Cerrar">✕</button>
        </div>
        <div class="modal-subtitle" id="feriados-subtitle">
          Agrega las fechas que deben excluirse del cálculo de tiempo laborable.
        </div>
        <div id="modal-feriados-body" style="padding:16px 20px;"></div>
        <div class="modal-footer" id="modal-feriados-footer"></div>
      </div>
    `;
    document.body.appendChild(overlay);
  }
  overlay.classList.add("open");
  renderPanelFeriados();
}

function cerrarPanelFeriados() {
  const overlay = document.getElementById("modal-feriados-overlay");
  if (overlay) overlay.classList.remove("open");
}

function renderPanelFeriados() {
  const body = document.getElementById("modal-feriados-body");
  const footer = document.getElementById("modal-feriados-footer");
  const lista = cargarFeriados().sort();

  const itemsHTML = lista.length === 0
    ? `<p style="color:var(--muted);font-size:13px;text-align:center;padding:12px 0;">No hay feriados registrados.</p>`
    : lista.map(f => {
        const d = new Date(f + "T12:00:00");
        const label = d.toLocaleDateString("es-DO", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
        return `
          <div class="feriado-item" style="display:flex;align-items:center;justify-content:space-between;
               padding:8px 10px;margin-bottom:6px;background:var(--surface2,#1e1e2e);
               border-radius:8px;gap:8px;">
            <span style="font-size:13px;">📅 <strong>${esc(f)}</strong> — ${esc(label)}</span>
            <button class="btn-delete" style="font-size:11px;" onclick="eliminarFeriado('${esc(f)}')" title="Eliminar">✕</button>
          </div>`;
      }).join("");

  body.innerHTML = `
    ${itemsHTML}
    <div style="margin-top:16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <input type="date" id="feriado-input"
             style="flex:1;padding:8px 12px;border-radius:8px;border:1px solid var(--border,#333);
                    background:var(--surface2,#1e1e2e);color:inherit;font-size:13px;"
             min="${new Date().getFullYear()}-01-01" />
      <input type="text" id="feriado-nombre" placeholder="Nombre (opcional)"
             style="flex:2;padding:8px 12px;border-radius:8px;border:1px solid var(--border,#333);
                    background:var(--surface2,#1e1e2e);color:inherit;font-size:13px;" />
    </div>
    <p id="feriado-error" class="modal-hint error-msg" style="margin-top:6px;"></p>
  `;

  footer.innerHTML = `
    <div style="display:flex;gap:10px;justify-content:flex-end;padding:12px 20px;">
      <button class="modal-btn secondary" onclick="cerrarPanelFeriados()">Cerrar</button>
      <button class="modal-btn primary"   onclick="agregarFeriado()">+ Agregar Feriado</button>
    </div>
  `;
}

function agregarFeriado() {
  const input = document.getElementById("feriado-input");
  const errorEl = document.getElementById("feriado-error");
  const fecha = input.value.trim();

  if (!fecha) {
    errorEl.textContent = "Selecciona una fecha.";
    errorEl.classList.add("visible");
    input.focus();
    return;
  }

  const lista = cargarFeriados();
  if (lista.includes(fecha)) {
    errorEl.textContent = "Esa fecha ya está registrada.";
    errorEl.classList.add("visible");
    return;
  }

  lista.push(fecha);
  guardarFeriados(lista);
  mostrarToast(`📅 Feriado agregado: ${fecha}`, "info");
  renderPanelFeriados();
}

function eliminarFeriado(fecha) {
  const lista = cargarFeriados().filter(f => f !== fecha);
  guardarFeriados(lista);
  mostrarToast(`🗑 Feriado eliminado: ${fecha}`, "warn");
  renderPanelFeriados();
}

// ============================================================
//  HORARIOS LABORABLES — vienen de la tabla `sacadores` (Supabase)
// ============================================================
const HORA_ENTRADA_DEFAULT = "08:00:00";

let SACADORES_CACHE = {};
let TODOS_LOS_SACADORES = [];
const _sacadoresSinHorario = new Set();

async function cargarSacadores() {
  try {
    const lista = await GMApi.obtenerSacadores();
    SACADORES_CACHE = {};
    TODOS_LOS_SACADORES = [];

    for (const s of lista) {
      SACADORES_CACHE[s.nombre] = s;
      if (s.activo) TODOS_LOS_SACADORES.push(s.nombre);
    }
    TODOS_LOS_SACADORES.sort((a, b) => a.localeCompare(b, "es"));

    poblarSelectsSacadores();
  } catch (err) {
    console.error("❌ Error cargando sacadores:", err.message);
    mostrarToast("⚠️ No se pudieron cargar los sacadores.", "error");
  }
}

function poblarSelectsSacadores() {
  const selectPedido = document.getElementById("sacador");
  if (selectPedido) {
    const actual = selectPedido.value;
    selectPedido.innerHTML = '<option value="">Selecciona el sacador</option>' +
      TODOS_LOS_SACADORES.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join("");
    if (TODOS_LOS_SACADORES.includes(actual)) selectPedido.value = actual;
  }

  const selectFiltro = document.getElementById("filtro-sacador");
  if (selectFiltro) {
    const actual = selectFiltro.value;
    selectFiltro.innerHTML = '<option value="">Todos los sacadores</option>' +
      TODOS_LOS_SACADORES.map(n => `<option value="${esc(n.toLowerCase())}">${esc(n)}</option>`).join("");
    selectFiltro.value = actual;
  }
}

function _avisarSinHorario(sacador) {
  if (!SACADORES_CACHE[sacador] && !_sacadoresSinHorario.has(sacador)) {
    _sacadoresSinHorario.add(sacador);
    console.warn(`⚠️ "${sacador}" no está en la tabla sacadores: se usa el horario por defecto (08:00-18:00).`);
  }
}

function getSalidaPersonal(sacador, dia) {
  _avisarSinHorario(sacador);
  const s = SACADORES_CACHE[sacador];
  if (dia >= 1 && dia <= 4) return s ? s.salida_lun_jue : "18:00:00";
  if (dia === 5) return s ? s.salida_viernes : "17:00:00";
  if (dia === 6) return s ? s.salida_sabado : "12:00:00";
  return null;
}

function getHoraEntrada(sacador) {
  const s = SACADORES_CACHE[sacador];
  return (s && s.horario_entrada) || HORA_ENTRADA_DEFAULT;
}

function getBreaksSacador(sacador) {
  const s = SACADORES_CACHE[sacador];
  if (!s || !Array.isArray(s.breaks)) return [];
  return s.breaks.map(b => ({ hora: b.hora, durMin: b.duracion_min }));
}

function getAlmuerzoSacador(sacador) {
  const s = SACADORES_CACHE[sacador];
  if (!s || !s.almuerzo_inicio || !s.almuerzo_fin) return null;
  return { pausa: s.almuerzo_inicio, reanuda: s.almuerzo_fin };
}

// ============================================================
//  MOTOR DE TIEMPO LABORABLE
// ============================================================
function pad(n) { return String(n).padStart(2, "0"); }

function hhmmssASeg(str) {
  const [h, m, s] = str.split(":").map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

function aMs(v) {
  return typeof v === "number" ? v : new Date(v).getTime();
}

/**
 * Rangos [inicioSeg, finSeg] laborables del sacador para la fecha dada.
 * Delega en getRangosConExtras (horasextras.js) si está cargado.
 */
function getRangosLaboralesDia(fecha, sacador) {
  const dia = fecha.getDay();
  if (dia === 0) {
    // Domingo: solo cuenta si horasextras.js habilita un día especial
    return typeof getRangosConExtras === "function" ? getRangosConExtras(fecha, sacador, []) : [];
  }
  if (esFeriado(fecha)) return [];

  const salidaStr = getSalidaPersonal(sacador, dia);
  if (!salidaStr) return [];

  const entrada = hhmmssASeg(getHoraEntrada(sacador));
  const salida = hhmmssASeg(salidaStr);

  const pausas = [];

  const almuerzo = getAlmuerzoSacador(sacador);
  if (dia !== 6 && almuerzo) {
    pausas.push({ inicio: hhmmssASeg(almuerzo.pausa), fin: hhmmssASeg(almuerzo.reanuda) });
  }

  const breaksSacador = getBreaksSacador(sacador);
  if (dia >= 1 && dia <= 4 && breaksSacador.length > 0) {
    for (const b of breaksSacador) {
      const ini = hhmmssASeg(b.hora);
      const fin = ini + b.durMin * 60;
      if (ini >= entrada && fin <= salida) pausas.push({ inicio: ini, fin });
    }
  }

  pausas.sort((a, b) => a.inicio - b.inicio);

  const rangos = [];
  let cursor = entrada;
  for (const p of pausas) {
    if (p.inicio > cursor && p.inicio < salida) rangos.push([cursor, Math.min(p.inicio, salida)]);
    cursor = Math.max(cursor, p.fin);
  }
  if (cursor < salida) rangos.push([cursor, salida]);

  if (typeof getRangosConExtras === "function") return getRangosConExtras(fecha, sacador, rangos);
  return rangos;
}

function estaDentroHorario(sacador, fecha) {
  const rangos = getRangosLaboralesDia(fecha, sacador);
  const seg = fecha.getHours() * 3600 + fecha.getMinutes() * 60 + fecha.getSeconds();
  return rangos.some(([a, b]) => seg >= a && seg < b);
}

function calcularSegLaborables(sacador, desdeMs, hastaMs) {
  if (!(hastaMs > desdeMs)) return 0;

  let total = 0;
  const desde = new Date(desdeMs);
  const hasta = new Date(hastaMs);

  const cursor = new Date(desde);
  cursor.setHours(0, 0, 0, 0);

  while (cursor < hasta) {
    const finDia = new Date(cursor);
    finDia.setHours(23, 59, 59, 999);

    const limSup = finDia < hasta ? finDia : hasta;
    const limInf = cursor < desde ? desde : cursor;

    const rangos = getRangosLaboralesDia(cursor, sacador);

    for (const [rInicio, rFin] of rangos) {
      const rInicioMs = new Date(cursor).setHours(
        Math.floor(rInicio / 3600), Math.floor((rInicio % 3600) / 60), rInicio % 60, 0
      );
      const rFinMs = new Date(cursor).setHours(
        Math.floor(rFin / 3600), Math.floor((rFin % 3600) / 60), rFin % 60, 0
      );

      const solapInicio = Math.max(rInicioMs, limInf.getTime());
      const solapFin = Math.min(rFinMs, limSup.getTime());

      if (solapFin > solapInicio) total += Math.floor((solapFin - solapInicio) / 1000);
    }

    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(0, 0, 0, 0);
  }

  return total;
}

// ── Utilidades de segmentos ──────────────────────────────────

/**
 * Deja la lista de segmentos coherente: ordenada, sin solapes, solo el
 * último puede estar abierto, y consistente con el estado pausado/activo.
 */
function normalizarSegmentos(segs, horaInicio, paused, nowMs) {
  let lista = Array.isArray(segs)
    ? segs.filter(s => s && s.inicio != null && !isNaN(aMs(s.inicio))).map(s => ({ ...s }))
    : [];

  if (lista.length === 0) {
    lista = [{ inicio: horaInicio, fin: paused ? horaInicio : null, cierre: "manual" }];
  }

  lista.sort((a, b) => aMs(a.inicio) - aMs(b.inicio));

  for (let i = 0; i < lista.length - 1; i++) {
    const s = lista[i], sig = lista[i + 1];
    if (s.fin == null || aMs(s.fin) > aMs(sig.inicio)) s.fin = sig.inicio;
  }
  for (const s of lista) {
    if (s.fin != null && aMs(s.fin) < aMs(s.inicio)) s.fin = s.inicio;
  }

  const ult = lista[lista.length - 1];
  if (paused && ult.fin == null) {
    console.warn("⚠️ Pedido pausado con segmento abierto; se cierra ahora.");
    ult.fin = new Date(nowMs).toISOString();
    ult.cierre = ult.cierre || "manual";
  }
  if (!paused && ult.fin != null) {
    lista.push({ inicio: new Date(nowMs).toISOString(), fin: null });
  }
  return lista;
}

/** Recorta los segmentos para que terminen a más tardar en finMs. */
function recortarSegmentos(segs, finMs) {
  return segs
    .map(s => ({ ...s }))
    .filter(s => aMs(s.inicio) < finMs)
    .map(s => {
      if (s.fin == null || aMs(s.fin) > finMs) s.fin = new Date(finMs).toISOString();
      return s;
    });
}

function calcularMsSegmentos(sacador, segs, nowMs) {
  let totalSeg = 0;
  for (const seg of segs) {
    const inicioMs = aMs(seg.inicio);
    const finMs = seg.fin == null ? nowMs : aMs(seg.fin);
    totalSeg += calcularSegLaborables(sacador, inicioMs, finMs);
  }
  return totalSeg * 1000;
}

function calcularSegAuxiliar(nombre, segs, joinedMs) {
  let t = 0;
  for (const s of segs) {
    const ini = Math.max(aMs(s.inicio), joinedMs);
    const fin = s.fin == null ? Date.now() : aMs(s.fin);
    if (fin > ini) t += calcularSegLaborables(nombre, ini, fin);
  }
  return t;
}

function ultimoCierre(data) {
  const u = data.segmentos && data.segmentos[data.segmentos.length - 1];
  // Si no sabemos quién pausó, se trata como manual (nunca se reanuda solo).
  return u && u.fin != null ? (u.cierre || "manual") : null;
}

/**
 * Tiempo laborable (ms) de un pedido a partir de sus segmentos reales.
 */
function calcularElapsedMs(data, nowMs) {
  if (data.estatus === "Finalizado") return data.elapsedMsFinal || 0;

  if (!data.segmentos || data.segmentos.length === 0) {
    data.segmentos = [{ inicio: data.hora_inicio, fin: data.paused ? data.hora_inicio : null }];
  }
  return calcularMsSegmentos(data.sacador, data.segmentos, nowMs);
}

// ============================================================
//  UTILIDADES DE FORMATO
// ============================================================
function formatDateTime(date) {
  if (!(date instanceof Date)) date = new Date(date);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatTime(totalSeconds) {
  totalSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatearFecha(timestamp) {
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return "—";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function toLocalInput(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// ============================================================
//  AUTENTICACIÓN
// ============================================================
async function inicializarAutenticacion() {
  const token = GMApi.getToken();
  const usuario = GMApi.getUsuario();

  if (!token || !usuario) {
    document.getElementById("modal-login-overlay").classList.add("open");
    document.getElementById("main-app").style.display = "none";
    document.getElementById("btn-float-extras").style.display = "none";
    return;
  }

  try {
    await GMApi.obtenerUsuarioActual();

    document.getElementById("modal-login-overlay").classList.remove("open");
    document.getElementById("main-app").style.display = "block";
    document.getElementById("btn-float-extras").style.display = "flex";
    document.getElementById("usuario-nombre").textContent = usuario.nombre || "Usuario";

    await cargarSacadores();
    cargarPedidosDelBackend();
  } catch (err) {
    console.error("❌ Error verificando sesión:", err);
    mostrarToast("⚠️ Sesión expirada o inválida", "error");
    GMApi.cerrarSesion();
  }
}

async function autenticar() {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const errorEl = document.getElementById("login-error");
  const loadingEl = document.getElementById("login-loading");
  const btnEl = document.getElementById("btn-login");

  if (!email || !password) {
    errorEl.textContent = "Completa email y contraseña.";
    errorEl.classList.add("visible");
    return;
  }

  try {
    errorEl.classList.remove("visible");
    loadingEl.style.display = "block";
    btnEl.disabled = true;

    const { usuario } = await GMApi.login(email, password);

    console.log("✅ Autenticación exitosa:", usuario.nombre);
    loadingEl.style.display = "none";
    errorEl.classList.remove("visible");

    document.getElementById("modal-login-overlay").classList.remove("open");
    document.getElementById("main-app").style.display = "block";
    document.getElementById("btn-float-extras").style.display = "flex";
    document.getElementById("usuario-nombre").textContent = usuario.nombre || "Usuario";

    await cargarSacadores();
    cargarPedidosDelBackend();
    mostrarToast(`¡Bienvenido, ${usuario.nombre}! 👋`, "success");
  } catch (err) {
    console.error("❌ Error en login:", err.message);
    errorEl.textContent = "Email o contraseña incorrectos.";
    errorEl.classList.add("visible");
    loadingEl.style.display = "none";
    btnEl.disabled = false;
  }
}

function cerrarSesion() {
  if (confirm("¿Cerrar sesión?")) {
    mostrarToast("Sesión cerrada. Hasta pronto 👋", "info");
    setTimeout(() => { GMApi.cerrarSesion(); }, 800);
  }
}

// ============================================================
//  CARGAR PEDIDOS DEL BACKEND
//  (Recordatorio PARCHE 2 en gm-api.js, método request():
//   if (res.status === 401 && !path.startsWith("/api/auth/login")) {  )
// ============================================================
async function cargarPedidosDelBackend() {
  try {
    const todosPedidos = await GMApi.obtenerPedidos();

    Object.values(timers).forEach(clearInterval);
    Object.values(badgeTimers).forEach(clearInterval);
    timers = {};
    badgeTimers = {};
    pedidosActivos = {};
    document.querySelectorAll("#task-list .task").forEach((t) => t.remove());

    let fallidos = 0;
    for (const pedido of todosPedidos) {
      try {
        await renderizarPedido(pedido);
      } catch (e) {
        fallidos++;
        if (pedido && pedido.id) delete pedidosActivos[pedido.id];
        console.error("❌ No se pudo mostrar el pedido", pedido && pedido.numero_pedido, pedido, e);
      }
    }

    iniciarRelojGlobal();
    await planificadorTick(true); // reconcilia pausas/reanudaciones perdidas
    refrescarTimers();

    actualizarStats();
    aplicarFiltro();

    if (fallidos) {
      mostrarToast(`⚠️ ${fallidos} pedido(s) no se pudieron mostrar. Revisa la consola (F12).`, "warn");
    }
  } catch (err) {
    console.error("❌ Error cargando pedidos:", err.message);
    mostrarToast("⚠️ Error al cargar pedidos. Recarga la página.", "error");
  }
}

async function renderizarPedido(pedido) {
  const { id, numero_pedido, sacador, cantidad_referencias, hora_inicio, hora_fin,
    estatus, auxiliares, tiene_equipo, segmentos, tiempo_total_segundos } = pedido;

  const nowMs = Date.now();
  const paused = estatus === "Pausado";

  const segmentosLocales = estatus === "Finalizado"
    ? (Array.isArray(segmentos) && segmentos.length > 0
        ? segmentos
        : [{ inicio: hora_inicio, fin: hora_fin }])
    : normalizarSegmentos(segmentos, hora_inicio, paused, nowMs);

  pedidosActivos[id] = {
    id,
    numero_pedido,
    sacador,
    cantidad_referencias,
    hora_inicio,
    hora_fin,
    estatus,
    auxiliares: auxiliares || [],
    tiene_equipo: tiene_equipo || false,
    segmentos: segmentosLocales,
    paused,
    elapsedMsFinal: estatus === "Finalizado" ? (tiempo_total_segundos || 0) * 1000 : 0,
    _dentro: estatus === "Finalizado" ? undefined : estaDentroHorario(sacador, new Date()),
    _alerta: false,
    _ocupado: false
  };

  crearTarjeta(pedido);

  if (estatus === "Finalizado") {
    const data = pedidosActivos[id];
    const cantSacada = pedido.cantidad_sacada;
    const timerEl = document.getElementById(`timer-${id}`);
    if (timerEl) timerEl.textContent = formatTime(Math.floor(data.elapsedMsFinal / 1000));
    const tppWrap = document.getElementById(`tpp-wrap-${id}`);
    const tppEl = document.getElementById(`tpp-${id}`);
    if (tppWrap) tppWrap.style.display = "block";
    if (tppEl && cantSacada > 0) {
      tppEl.textContent = formatTime(Math.floor(data.elapsedMsFinal / 1000 / cantSacada));
    }
  } else {
    iniciarTimer(id);
    iniciarBadgeTimer(id);
  }
}

// ============================================================
//  AGREGAR PEDIDO NUEVO
// ============================================================
async function agregarPedido() {
  const codigo = document.getElementById("codigo").value.trim();
  const sacador = document.getElementById("sacador").value;
  const cantidad = parseInt(document.getElementById("cantidad").value.trim(), 10);
  const now = new Date();

  if (!codigo || !sacador || isNaN(cantidad) || cantidad <= 0) {
    mostrarToast("⚠️ Completa todos los campos correctamente.", "warn");
    return;
  }

  const duplicado = Object.values(pedidosActivos).some(
    p => p.estatus !== "Finalizado" && String(p.numero_pedido).toLowerCase() === codigo.toLowerCase()
  );
  if (duplicado) {
    mostrarToast(`🚫 Ya existe un pedido abierto con el código ${codigo}.`, "error");
    return;
  }

  if (now.getDay() === 0) {
    const tieneEspecial = typeof _tieneDiaEspecialHoy === "function" && _tieneDiaEspecialHoy(sacador);
    if (!tieneEspecial) {
      mostrarToast("🚫 Los domingos no se pueden iniciar pedidos.", "error");
      return;
    }
  }

  if (esFeriado(now)) {
    mostrarToast("🚫 Hoy es un día feriado no laborable.", "error");
    return;
  }

  try {
    if (cantidad >= UMBRAL_EQUIPO) {
      _abrirModalEquipoNuevo(codigo, sacador, cantidad);
      return;
    }

    await _crearPedidoEnBackend(codigo, sacador, cantidad, false, []);
  } catch (err) {
    console.error("❌ Error al agregar pedido:", err.message);
    mostrarToast("❌ Error al crear pedido. Intenta de nuevo.", "error");
  }
}

let _pendientePedidoNuevo = null;

function _abrirModalEquipoNuevo(codigo, sacador, cantidad) {
  _pendientePedidoNuevo = { codigo, sacador, cantidad };

  const overlay = document.getElementById("modal-equipo-overlay");
  document.getElementById("equipo-subtitle").textContent =
    `Este pedido tiene ${cantidad} referencias (límite sugerido: ${UMBRAL_EQUIPO}). ` +
    `¿Deseas asignar un equipo? El líder será ${sacador}.`;

  const iniciales = sacador.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
  document.getElementById("equipo-body").innerHTML = `
    <div class="equipo-lider-preview">
      <div class="equipo-lider-avatar">${esc(iniciales)}</div>
      <div class="equipo-lider-info">
        <div class="equipo-lider-name">${esc(sacador)}</div>
        <div class="equipo-lider-badge">👑 Líder del equipo</div>
      </div>
    </div>
    <div class="equipo-aux-list" id="equipo-aux-list"></div>
    <button class="equipo-btn-add-more" onclick="_agregarFilaAuxNueva()">
      + Agregar auxiliar
    </button>
  `;

  document.getElementById("equipo-footer").innerHTML = `
    <div class="equipo-footer-btns">
      <button class="modal-btn secondary" onclick="_rechazarEquipoNuevo()">Continuar sin equipo</button>
      <button class="modal-btn team"      onclick="_confirmarEquipoNuevo()">👥 Confirmar equipo</button>
    </div>
  `;

  overlay.classList.add("open");
}

let _equipoAuxContador = 0;

function _agregarFilaAuxNueva() {
  _equipoAuxContador++;
  const id = `aux-row-${_equipoAuxContador}`;
  const fila = document.createElement("div");
  fila.className = "equipo-aux-item";
  fila.id = id;

  const opciones = TODOS_LOS_SACADORES
    .filter(s => s !== _pendientePedidoNuevo.sacador)
    .map(s => `<option value="${esc(s)}">${esc(s)}</option>`)
    .join("");

  fila.innerHTML = `
    <select class="equipo-aux-select">
      <option value="">-- Selecciona auxiliar --</option>
      ${opciones}
    </select>
    <button class="equipo-btn-remove-aux" onclick="document.getElementById('${id}').remove()" title="Quitar">✕</button>
  `;

  document.getElementById("equipo-aux-list").appendChild(fila);
}

async function _confirmarEquipoNuevo() {
  if (!_pendientePedidoNuevo) {
    cerrarModalEquipo();
    return;
  }

  const selects = document.querySelectorAll("#equipo-aux-list .equipo-aux-select");
  const auxiliares = [];
  let hayError = false;

  selects.forEach(sel => {
    if (!sel.value) {
      sel.style.borderColor = "var(--danger)";
      hayError = true;
    } else {
      sel.style.borderColor = "";
      if (!auxiliares.includes(sel.value)) auxiliares.push(sel.value);
    }
  });

  if (hayError) {
    mostrarToast("⚠️ Selecciona un colaborador en cada fila o elimina la fila vacía.", "warn");
    return;
  }

  const { codigo, sacador, cantidad } = _pendientePedidoNuevo;

  cerrarModalEquipo();
  try {
    await _crearPedidoEnBackend(codigo, sacador, cantidad, true, auxiliares);
    mostrarToast(`👥 Equipo de ${auxiliares.length + 1} personas asignado a #${codigo}`, "team");
  } catch (err) {
    console.error("❌ Error creando pedido con equipo:", err);
    mostrarToast("❌ Error al crear pedido.", "error");
  }
  _pendientePedidoNuevo = null;
}

function _rechazarEquipoNuevo() {
  if (!_pendientePedidoNuevo) {
    cerrarModalEquipo();
    return;
  }

  const { codigo, sacador, cantidad } = _pendientePedidoNuevo;
  cerrarModalEquipo();

  _crearPedidoEnBackend(codigo, sacador, cantidad, false, []).catch(err => {
    console.error("❌ Error:", err);
    mostrarToast("❌ Error al crear pedido.", "error");
  });

  _pendientePedidoNuevo = null;
}

async function _crearPedidoEnBackend(codigo, sacador, cantidad, tieneEquipo, auxiliares) {
  const ahora = new Date().toISOString();

  const pedidoBackend = await GMApi.crearPedido(
    codigo,
    sacador,
    cantidad,
    ahora,
    tieneEquipo,
    auxiliares.map(nombre => ({ nombre, joined_at: ahora }))
  );

  await renderizarPedido(pedidoBackend);

  document.getElementById("codigo").value = "";
  document.getElementById("sacador").value = "";
  document.getElementById("cantidad").value = "";
  document.getElementById("codigo").focus();

  actualizarStats();
  aplicarFiltro();
  mostrarToast(`✅ Pedido #${codigo} creado exitosamente`, "success");
}

// ============================================================
//  PAUSAR / REANUDAR
//  tipo: "manual" (botón del usuario) | "auto" (planificador)
//  Solo las pausas "auto" son reanudadas por el planificador.
// ============================================================
async function _persistirSegmentos(id, estatusNuevo) {
  const data = pedidosActivos[id];
  await GMApi.actualizarPedido(id, {
    estatus: estatusNuevo,
    segmentos: data.segmentos
  });
}

async function pausar(id, tipo = "manual") {
  const data = pedidosActivos[id];
  if (!data || data.paused || data.estatus === "Finalizado") return false;

  const ahora = new Date().toISOString();
  const ultimo = data.segmentos[data.segmentos.length - 1];
  const finPrev = ultimo ? ultimo.fin : null;
  const cierrePrev = ultimo ? ultimo.cierre : undefined;

  if (ultimo && ultimo.fin == null) {
    ultimo.fin = ahora;
    ultimo.cierre = tipo === "manual" ? "manual" : "auto";
  }

  data.paused = true;
  data.estatus = "Pausado";
  data._ocupado = true;

  try {
    await _persistirSegmentos(id, "Pausado");

    const btn = document.querySelector(`#card-${id} .btn-pause`);
    if (btn) {
      btn.textContent = "⏸ Pausado";
      btn.classList.add("paused");
    }

    renderBadgePausa(id);
    actualizarTimerCard(id, Date.now());
    actualizarStats();
    if (tipo === "manual") mostrarToast("⏸ Pedido pausado", "info");
    return true;
  } catch (err) {
    console.error("❌ Error pausando pedido:", err);
    data.paused = false;
    data.estatus = "En Proceso";
    if (ultimo) {
      ultimo.fin = finPrev;
      if (cierrePrev === undefined) delete ultimo.cierre; else ultimo.cierre = cierrePrev;
    }
    data._reintento = Date.now() + 60000;
    if (tipo === "manual") mostrarToast("❌ Error al pausar pedido.", "error");
    return false;
  } finally {
    data._ocupado = false;
  }
}

async function reanudar(id, tipo = "manual") {
  const data = pedidosActivos[id];
  if (!data || !data.paused || data.estatus === "Finalizado") return false;

  const ahora = new Date().toISOString();
  data.segmentos.push({ inicio: ahora, fin: null });
  data.paused = false;
  data.estatus = "En Proceso";
  data._ocupado = true;

  try {
    await _persistirSegmentos(id, "En Proceso");

    const btn = document.querySelector(`#card-${id} .btn-pause`);
    if (btn) {
      btn.textContent = "⏸ Pausar";
      btn.classList.remove("paused");
    }

    iniciarTimer(id);
    renderBadgePausa(id);
    actualizarStats();
    if (tipo === "manual") mostrarToast("▶ Pedido reanudado", "info");
    return true;
  } catch (err) {
    console.error("❌ Error reanudando pedido:", err);
    data.segmentos.pop();
    data.paused = true;
    data.estatus = "Pausado";
    data._reintento = Date.now() + 60000;
    if (tipo === "manual") mostrarToast("❌ Error al reanudar pedido.", "error");
    return false;
  } finally {
    data._ocupado = false;
  }
}

async function pausarTodos() {
  for (const id in pedidosActivos) {
    const data = pedidosActivos[id];
    if (!data.paused && data.estatus !== "Finalizado") await pausar(id, "manual");
  }
}

async function reanudarTodos() {
  for (const id in pedidosActivos) {
    const data = pedidosActivos[id];
    if (data.paused && data.estatus !== "Finalizado") await reanudar(id, "manual");
  }
}

// ============================================================
//  PLANIFICADOR CENTRAL (reemplaza los setTimeout por pedido)
//  - Pausa automática cuando termina el horario (almuerzo, break, salida)
//  - Reanuda automáticamente SOLO lo que pausó el propio planificador
//  - Se re-evalúa al volver a la pestaña, así que no depende de que
//    estuviera abierta cuando ocurrió el evento.
// ============================================================
let relojGlobal = null;
let planificador = null;
let _planificando = false;
let _tickBadge = 0;

function iniciarRelojGlobal() {
  if (!relojGlobal) relojGlobal = setInterval(refrescarTimers, 1000);
  if (!planificador) planificador = setInterval(() => planificadorTick(false), 15000);
}

async function planificadorTick(inicial = false) {
  if (_planificando) return;
  _planificando = true;
  try {
    const ahora = new Date();
    for (const id of Object.keys(pedidosActivos)) {
      const d = pedidosActivos[id];
      if (!d || d.estatus === "Finalizado" || d._ocupado) continue;
      if (d._reintento && Date.now() < d._reintento) continue;

      const dentro = estaDentroHorario(d.sacador, ahora);
      const antes = d._dentro;
      d._dentro = dentro;

      if (!d.paused) {
        // Pausa solo en la transición dentro → fuera (o al cargar la página)
        if (!dentro && (inicial || antes === true)) await pausar(id, "auto");
      } else if (dentro && ultimoCierre(d) === "auto") {
        await reanudar(id, "auto");
      }
    }
  } finally {
    _planificando = false;
  }
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    refrescarTimers();
    planificadorTick(false);
  }
});

// Compatibilidad: horasextras.js u otros módulos pueden seguir llamándola.
// El planificador central ya cubre todo, así que no programa nada por pedido.
function programarPausas(id, sacador, now) {
  planificadorTick(false);
}

// ============================================================
//  BADGE DE PRÓXIMA PAUSA
// ============================================================
function addDays(date, d) {
  const nd = new Date(date);
  nd.setDate(date.getDate() + d);
  return nd;
}

function getFutureTime(date, timeStr) {
  const [h, m, s] = timeStr.split(":").map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m, s || 0);
}

function diasHastaProximoLaborable(desde) {
  let dias = 1;
  while (dias <= 7) {
    const candidato = addDays(desde, dias);
    if (candidato.getDay() !== 0 && !esFeriado(candidato)) return dias;
    dias++;
  }
  return 1;
}

function calcularProximaPausa(sacador, now) {
  const eventos = [];
  const dia = now.getDay();

  const almuerzo = getAlmuerzoSacador(sacador);
  if (dia !== 6 && almuerzo) {
    const p = getFutureTime(now, almuerzo.pausa);
    if (p > now) eventos.push({ label: "🍽 Almuerzo", time: p, tipo: "almuerzo" });
  }

  const breaksSacador = getBreaksSacador(sacador);
  if (dia >= 1 && dia <= 4 && breaksSacador.length > 0) {
    for (const b of breaksSacador) {
      const p = getFutureTime(now, b.hora);
      if (p > now) eventos.push({ label: `☕ Break ${b.durMin}min`, time: p, tipo: "break" });
    }
  }

  const salidaStr = getSalidaPersonal(sacador, dia);
  if (salidaStr) {
    const p = getFutureTime(now, salidaStr);
    if (p > now) eventos.push({ label: "🚪 Salida", time: p, tipo: "salida" });
  }

  if (!eventos.length) return null;
  eventos.sort((a, b) => a.time - b.time);
  return eventos[0];
}

function renderBadgePausa(id) {
  const data = pedidosActivos[id];
  const badgeEl = document.getElementById(`badge-pausa-${id}`);
  if (!badgeEl || !data || data.estatus === "Finalizado" || data.paused) {
    if (badgeEl) badgeEl.style.display = "none";
    return;
  }
  const prox = calcularProximaPausa(data.sacador, new Date());
  if (!prox) { badgeEl.style.display = "none"; return; }
  const diffMs = prox.time - Date.now();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const remMin = diffMin % 60;
  const textoTiempo = diffH > 0 ? `en ${diffH}h ${pad(remMin)}m` : `en ${diffMin}m`;
  const esPronto = diffMin <= 15;
  badgeEl.textContent = `${prox.label} ${textoTiempo}`;
  badgeEl.className = `badge-pausa tipo-${prox.tipo}${esPronto ? " tipo-pronto" : ""}`;
  badgeEl.style.display = "inline-flex";
}

// Compatibilidad: el refresco real lo hace el reloj global cada 30 s.
function iniciarBadgeTimer(id) {
  renderBadgePausa(id);
}

// ============================================================
//  ELIMINAR
// ============================================================
function _limpiarPedidoLocal(id) {
  clearInterval(timers[id]);
  clearInterval(badgeTimers[id]);
  delete timers[id];
  delete badgeTimers[id];
  delete pedidosActivos[id];
}

async function eliminar(id) {
  if (!confirm("¿Eliminar este pedido?")) return;

  try {
    await GMApi.eliminarPedido(id);
    _limpiarPedidoLocal(id);

    const card = document.getElementById(`card-${id}`);
    if (card) {
      card.style.animation = "fadeOut 0.3s ease forwards";
      setTimeout(() => {
        card.remove();
        aplicarFiltro();
        actualizarStats();
      }, 300);
    }

    mostrarToast("🗑 Pedido eliminado", "warn");
  } catch (err) {
    console.error("❌ Error eliminando pedido:", err);
    mostrarToast("❌ Error al eliminar pedido.", "error");
  }
}

async function eliminarTodos() {
  const ids = Object.keys(pedidosActivos).filter(id => pedidosActivos[id].estatus !== "Finalizado");
  if (ids.length === 0) {
    mostrarToast("ℹ️ No hay pedidos abiertos para eliminar.", "info");
    return;
  }

  const resp = prompt(
    `Vas a eliminar ${ids.length} pedido(s) abiertos (los finalizados NO se tocan).\n` +
    `Esta acción no se puede deshacer. Escribe ELIMINAR para confirmar:`
  );
  if (resp === null || resp.trim() !== "ELIMINAR") {
    mostrarToast("Operación cancelada.", "info");
    return;
  }

  let borrados = 0;
  for (const id of ids) {
    try {
      await GMApi.eliminarPedido(id);
      _limpiarPedidoLocal(id);
      const card = document.getElementById(`card-${id}`);
      if (card) card.remove();
      borrados++;
    } catch (err) {
      console.error(`❌ Error eliminando pedido ${id}:`, err);
    }
  }

  actualizarStats();
  aplicarFiltro();
  mostrarToast(`🗑 ${borrados} de ${ids.length} pedidos eliminados`, "warn");
}

// ============================================================
//  TIMERS — un solo reloj global, siempre desde los segmentos reales
// ============================================================
function iniciarTimer(id) {
  iniciarRelojGlobal();
  actualizarTimerCard(id, Date.now());
}

function actualizarTimerCard(id, nowMs) {
  const data = pedidosActivos[id];
  if (!data || data.estatus === "Finalizado") return;

  const elapsedSeg = Math.floor(calcularElapsedMs(data, nowMs) / 1000);
  const timerEl = document.getElementById(`timer-${id}`);
  if (timerEl) timerEl.textContent = formatTime(elapsedSeg);

  const alerta = elapsedSeg >= UMBRAL_ALERTA_SEG;
  data._alerta = alerta;

  const card = document.getElementById(`card-${id}`);
  if (card) card.dataset.alerta = alerta ? "1" : "0";
  if (timerEl) timerEl.classList.toggle("alerta", alerta);

  const badge = document.getElementById(`badge-alerta-${id}`);
  if (badge) {
    if (alerta) {
      badge.textContent = `⚠ Revisar · ${Math.floor(elapsedSeg / 3600)}h laborables`;
      badge.title = "Lleva mucho tiempo abierto. Si ya terminó, finalízalo indicando la hora real de fin.";
      badge.style.display = "inline-flex";
    } else {
      badge.style.display = "none";
    }
  }
}

function refrescarTimers() {
  const now = Date.now();
  let antiguos = 0;
  for (const id in pedidosActivos) {
    const d = pedidosActivos[id];
    if (d.estatus === "Finalizado") continue;
    actualizarTimerCard(id, now);
    if (d._alerta) antiguos++;
  }

  actualizarAlertaGlobal(antiguos);

  _tickBadge = (_tickBadge + 1) % 30;
  if (_tickBadge === 0) {
    for (const id in pedidosActivos) renderBadgePausa(id);
  }
}

function actualizarAlertaGlobal(n) {
  const el = document.getElementById("alerta-antiguos");
  if (!el) return;
  el.style.display = n > 0 ? "flex" : "none";
  const txt = document.getElementById("alerta-antiguos-texto");
  if (txt) {
    txt.textContent = `${n} pedido${n > 1 ? "s" : ""} acumula${n > 1 ? "n" : ""} más de ${UMBRAL_ALERTA_H} h laborables abiertos. ` +
      `Si ya terminaron, finalízalos indicando su hora real de fin.`;
  }
}

function filtrarAntiguos() {
  soloAntiguos = true;
  aplicarFiltro();
}

// ============================================================
//  STATS BAR
// ============================================================
function actualizarStats() {
  let activos = 0, pausados = 0, finalizados = 0, hoy = 0;
  const h = new Date();

  for (const id in pedidosActivos) {
    const d = pedidosActivos[id];
    if (d.estatus === "Finalizado") finalizados++;
    else if (d.estatus === "Pausado") pausados++;
    else activos++;

    const ini = new Date(d.hora_inicio);
    if (ini.getFullYear() === h.getFullYear() && ini.getMonth() === h.getMonth() && ini.getDate() === h.getDate()) hoy++;
  }

  const el = id => document.getElementById(id);
  if (el("stat-activos")) el("stat-activos").textContent = activos;
  if (el("stat-pausados")) el("stat-pausados").textContent = pausados;
  if (el("stat-finalizados")) el("stat-finalizados").textContent = finalizados;
  if (el("stat-total")) el("stat-total").textContent = hoy;
}

// ============================================================
//  CREAR TARJETA
// ============================================================
function crearTarjeta(pedido) {
  const { id, numero_pedido, sacador, cantidad_referencias, hora_inicio, estatus, auxiliares, tiene_equipo } = pedido;

  const task = document.createElement("div");
  task.className = "task";
  task.id = `card-${id}`;
  task.dataset.codigo = String(numero_pedido ?? "").toLowerCase();
  task.dataset.sacador = String(sacador ?? "").toLowerCase();
  task.dataset.alerta = "0";

  if (tiene_equipo && auxiliares && auxiliares.length > 0) task.classList.add("en-equipo");
  if (estatus === "Finalizado") task.classList.add("finalizado");

  task.innerHTML = `
    <div class="task-header">
      <div class="task-code">#${esc(numero_pedido)}</div>
      <button class="btn-delete" onclick="eliminar('${id}')" title="Eliminar">✕</button>
    </div>
    <div class="task-sacador">${esc(sacador)}</div>
    <div class="task-meta">
      <span class="meta-item">📦 <strong>${esc(cantidad_referencias)}</strong> productos</span>
      <span class="badge-pausa" id="badge-pausa-${id}" style="display:none;"></span>
      <span class="badge-alerta" id="badge-alerta-${id}" style="display:none;"></span>
    </div>
    <div id="times-wrap-${id}" class="task-times">
      <div class="time-row">
        <span class="time-label">Inicio</span>
        <span class="time-value" id="start-${id}">${formatearFecha(hora_inicio)}</span>
      </div>
      <div class="time-row">
        <span class="time-label">Fin</span>
        <span class="time-value" id="end-${id}">—</span>
      </div>
    </div>
    <div class="task-timer" id="timer-${id}">00:00:00</div>
    <div class="task-tpp" id="tpp-wrap-${id}" style="display:none;">
      ⏱ <span id="tpp-${id}">--</span> por producto
    </div>
    <div class="task-actions">
      <button class="btn-action btn-pause"  onclick="pausar('${id}')">${estatus === "Pausado" ? "⏸ Pausado" : "⏸ Pausar"}</button>
      <button class="btn-action btn-resume" onclick="reanudar('${id}')">▶ Reanudar</button>
      <button class="btn-action btn-finish" onclick="abrirModalFinalizar('${id}')">✔ Finalizar</button>
    </div>
  `;

  document.getElementById("task-list").appendChild(task);

  if (estatus === "Pausado") {
    const btn = task.querySelector(".btn-pause");
    if (btn) btn.classList.add("paused");
  }

  if ((tiene_equipo || auxiliares?.length > 0) && estatus !== "Finalizado") {
    _actualizarSeccionEquipo(id);
  } else if (estatus !== "Finalizado") {
    _agregarBtnAuxSuelto(id);
  }
}

function _agregarBtnAuxSuelto(id) {
  const card = document.getElementById(`card-${id}`);
  if (!card || card.querySelector(".btn-add-aux")) return;

  const btn = document.createElement("button");
  btn.className = "btn-add-aux";
  btn.textContent = "+ Agregar auxiliar";
  btn.onclick = () => abrirModalAux(id);

  const actionsEl = card.querySelector(".task-actions");
  if (actionsEl) card.insertBefore(btn, actionsEl);
}

// ============================================================
//  MODAL EQUIPO (para nuevos pedidos)
// ============================================================
function cerrarModalEquipo() {
  document.getElementById("modal-equipo-overlay").classList.remove("open");
}

// ============================================================
//  MODAL AUXILIAR
// ============================================================
let _auxTargetId = null;

function abrirModalAux(id) {
  _auxTargetId = id;
  const data = pedidosActivos[id];
  if (!data) return;

  document.getElementById("aux-subtitle").textContent =
    `Pedido #${data.numero_pedido} — ${data.sacador}`;

  const yaAsignados = [
    data.sacador,
    ...(data.auxiliares || []).map(a => typeof a === "string" ? a : a.nombre)
  ];

  const auxSelect = document.getElementById("aux-select");
  auxSelect.innerHTML = '<option value="">-- Selecciona un colaborador --</option>';
  TODOS_LOS_SACADORES
    .filter(s => !yaAsignados.includes(s))
    .forEach(s => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      auxSelect.appendChild(opt);
    });

  const errorEl = document.getElementById("aux-error");
  if (errorEl) errorEl.classList.remove("visible");

  document.getElementById("modal-aux-overlay").classList.add("open");
  setTimeout(() => auxSelect.focus(), 100);
}

function cerrarModalAux() {
  document.getElementById("modal-aux-overlay").classList.remove("open");
  _auxTargetId = null;
}

async function confirmarAgregarAux() {
  const select = document.getElementById("aux-select");
  const errorEl = document.getElementById("aux-error");
  const nuevoAux = select.value;

  if (!nuevoAux) {
    errorEl.classList.add("visible");
    select.focus();
    return;
  }

  try {
    await GMApi.agregarAuxiliarAPedido(_auxTargetId, nuevoAux);

    const data = pedidosActivos[_auxTargetId];
    if (!data.auxiliares) data.auxiliares = [];
    data.auxiliares.push({ nombre: nuevoAux, joined_at: new Date().toISOString() });
    data.tiene_equipo = true;

    cerrarModalAux();
    _actualizarSeccionEquipo(_auxTargetId);
    actualizarStats();

    mostrarToast(`👥 ${nuevoAux.split(" ")[0]} se unió al equipo de #${data.numero_pedido}`, "team");
  } catch (err) {
    console.error("❌ Error agregando auxiliar:", err);
    errorEl.classList.add("visible");
  }
}

function _actualizarSeccionEquipo(id) {
  const data = pedidosActivos[id];
  if (!data) return;
  const card = document.getElementById(`card-${id}`);
  if (!card) return;

  if (data.tiene_equipo && (data.auxiliares || []).length > 0) card.classList.add("en-equipo");

  const lider = data.sacador;
  const auxiliares = data.auxiliares || [];

  const miembrosHTML = auxiliares.map(a => {
    const nombre = typeof a === "string" ? a : a.nombre;
    const joined = (typeof a === "object" && a.joined_at)
      ? `<span class="member-joined">Se unió: ${formatearFecha(a.joined_at)}</span>`
      : "";
    return `
      <div class="task-team-member">
        <span class="member-role auxiliar">Aux</span>
        <div class="member-info"><span>${esc(nombre)}</span>${joined}</div>
      </div>`;
  }).join("");

  const btnLabel = auxiliares.length === 0 ? "+ Agregar auxiliar" : "+ Añadir otro auxiliar";

  const innerHTML = `
    <div class="task-team-title">👥 Equipo</div>
    <div class="task-team-member">
      <span class="member-role lider">👑 Líder</span>
      <div class="member-info">
        <span>${esc(lider)}</span>
        <span class="member-joined">Inicio: ${formatearFecha(data.hora_inicio)}</span>
      </div>
    </div>
    ${miembrosHTML}
    ${data.estatus !== "Finalizado" ? `<button class="btn-add-aux" onclick="abrirModalAux('${id}')">${btnLabel}</button>` : ""}
  `;

  let teamSection = document.getElementById(`team-section-${id}`);
  if (teamSection) {
    teamSection.innerHTML = innerHTML;
  } else {
    teamSection = document.createElement("div");
    teamSection.className = "task-team";
    teamSection.id = `team-section-${id}`;
    teamSection.innerHTML = innerHTML;
    const timesEl = document.getElementById(`times-wrap-${id}`);
    if (timesEl) card.insertBefore(teamSection, timesEl);
  }
}

// ============================================================
//  MODAL FINALIZAR (con ajuste de hora real de fin)
// ============================================================
let modalId = null;
let modalStep = 1;
let modalRespuestas = {};

function abrirModalFinalizar(id) {
  modalId = id;
  modalStep = 1;
  modalRespuestas = {};
  document.getElementById("modal-overlay").classList.add("open");
  renderModalStep(1);
  setTimeout(() => {
    const i = document.getElementById("modal-input");
    if (i) i.focus();
  }, 100);
}

function cerrarModal() {
  document.getElementById("modal-overlay").classList.remove("open");
  modalId = null;
}

/** Lee el campo "hora real de fin". Devuelve {ms, ajustado} o {error}. */
function obtenerFinElegidoMs(data) {
  const el = document.getElementById("modal-fin-real");
  if (!el || !el.value) return { ms: Date.now(), ajustado: false };

  const ms = new Date(el.value).getTime();
  if (isNaN(ms)) return { error: "Fecha inválida." };
  if (ms <= aMs(data.hora_inicio)) return { error: "El fin debe ser posterior al inicio del pedido." };
  if (ms > Date.now()) return { error: "El fin no puede estar en el futuro." };
  return { ms, ajustado: true };
}

function actualizarResumenFin() {
  const data = pedidosActivos[modalId];
  if (!data) return;

  const errEl = document.getElementById("modal-fin-error");
  const r = obtenerFinElegidoMs(data);
  if (r.error) {
    if (errEl) { errEl.textContent = r.error; errEl.classList.add("visible"); }
    return;
  }
  if (errEl) errEl.classList.remove("visible");

  const segs = r.ajustado ? recortarSegmentos(data.segmentos, r.ms) : data.segmentos;
  const seg = Math.floor(calcularMsSegmentos(data.sacador, segs, r.ms) / 1000);
  const cant = modalRespuestas.cantidad;

  const tEl = document.getElementById("res-tiempo");
  const pEl = document.getElementById("res-tpp");
  if (tEl) tEl.textContent = formatTime(seg);
  if (pEl) pEl.textContent = cant > 0 ? formatTime(Math.floor(seg / cant)) : "—";
}

function renderModalStep(step) {
  const data = pedidosActivos[modalId];
  const titles = ["", "¿Cuántos productos se sacaron?", "¿Cuántos bultos se realizaron?", "¿Cuál es el monto total del pedido?", "Resumen del pedido"];
  const subtitles = ["", `Esperado: ${data.cantidad_referencias} producto${data.cantidad_referencias > 1 ? "s" : ""}`, "Cantidad de bultos completados", "Monto en RD$", "Confirma los datos antes de guardar"];

  document.getElementById("modal-title").textContent = titles[step];
  document.getElementById("modal-subtitle").textContent = subtitles[step];

  document.querySelectorAll("#modal .modal-step-dot").forEach((dot, i) => {
    dot.classList.remove("active", "done");
    if (i + 1 < step) dot.classList.add("done");
    else if (i + 1 === step) dot.classList.add("active");
  });

  const body = document.getElementById("modal-body");
  const footer = document.getElementById("modal-footer");
  body.innerHTML = "";

  if (step < 4) {
    const tipos = ["", "number", "number", "number"];
    const hints = ["", `Máximo: ${data.cantidad_referencias}`, "Solo números enteros positivos", "Ejemplo: 1500.00"];

    body.innerHTML = `
      <div class="modal-field">
        <label>${titles[step]}</label>
        <input type="${tipos[step]}" id="modal-input" placeholder="0"
               min="0" step="${step === 3 ? "0.01" : "1"}" />
      </div>
      <p class="modal-hint" id="modal-hint">${hints[step]}</p>
      <p class="modal-hint error-msg" id="modal-error">Valor inválido, intenta de nuevo.</p>
    `;
    footer.innerHTML = `
      <button class="modal-btn secondary" onclick="cerrarModal()">Cancelar</button>
      <button class="modal-btn primary"   onclick="modalSiguiente()">${step === 3 ? "Ver resumen →" : "Siguiente →"}</button>
    `;
    const input = document.getElementById("modal-input");
    if (input) input.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        modalSiguiente();
      }
    });
  } else {
    const now = Date.now();
    const elapsedMs = calcularElapsedMs(data, now);
    const elapsedSeg = Math.floor(elapsedMs / 1000);
    const cantSacada = modalRespuestas.cantidad;
    const porcentaje = Math.round((cantSacada / data.cantidad_referencias) * 100);
    const tpp = cantSacada > 0 ? formatTime(Math.floor(elapsedSeg / cantSacada)) : "—";
    const alerta = elapsedSeg >= UMBRAL_ALERTA_SEG;

    const equipoRow = data.tiene_equipo && data.auxiliares && data.auxiliares.length > 0
      ? `<div class="summary-row">
           <span class="summary-key">Equipo</span>
           <span class="summary-val" style="color:var(--team);font-size:12px;">
             ${esc([data.sacador, ...data.auxiliares.map(a => typeof a === "string" ? a : a.nombre)].join(", "))}
           </span>
         </div>` : "";

    const avisoAlerta = alerta
      ? `<p class="modal-hint" style="color:#ffb454;margin:10px 0 4px;">
           ⚠ Este pedido acumula ${formatTime(elapsedSeg)} de tiempo laborable. Si ya había terminado antes,
           indica abajo la hora real de fin para que el tiempo quede correcto.
         </p>` : "";

    body.innerHTML = `
      <div class="modal-summary">
        <div class="summary-row"><span class="summary-key">Pedido</span><span class="summary-val highlight">#${esc(data.numero_pedido)}</span></div>
        <div class="summary-row"><span class="summary-key">Sacador</span><span class="summary-val">${esc(data.sacador.split(" ").slice(0, 2).join(" "))}</span></div>
        ${equipoRow}
        <div class="summary-row"><span class="summary-key">Productos sacados</span><span class="summary-val">${cantSacada} / ${data.cantidad_referencias} (${porcentaje}%)</span></div>
        <div class="summary-row"><span class="summary-key">Tiempo laborable</span><span class="summary-val success" id="res-tiempo">${formatTime(elapsedSeg)}</span></div>
        <div class="summary-row"><span class="summary-key">Tiempo/producto</span><span class="summary-val success" id="res-tpp">${tpp}</span></div>
        <div class="summary-row"><span class="summary-key">Bultos</span><span class="summary-val">${modalRespuestas.bultos}</span></div>
        <div class="summary-row"><span class="summary-key">Monto total</span><span class="summary-val">RD$ ${parseFloat(modalRespuestas.monto).toFixed(2)}</span></div>
      </div>
      ${avisoAlerta}
      <details class="modal-ajuste" ${alerta ? "open" : ""} style="margin-top:10px;">
        <summary style="cursor:pointer;font-size:13px;">¿Terminó antes? Ajustar hora real de fin</summary>
        <input type="datetime-local" id="modal-fin-real"
               min="${toLocalInput(new Date(aMs(data.hora_inicio)))}"
               max="${toLocalInput(new Date())}"
               onchange="actualizarResumenFin()"
               style="width:100%;margin-top:8px;padding:8px 12px;border-radius:8px;border:1px solid var(--border,#333);background:var(--surface2,#1e1e2e);color:inherit;font-size:13px;" />
        <p class="modal-hint" style="margin-top:6px;">Déjalo vacío para finalizar con la hora actual.</p>
        <p class="modal-hint error-msg" id="modal-fin-error"></p>
      </details>
    `;
    footer.innerHTML = `
      <button class="modal-btn secondary" onclick="modalAnterior()">← Atrás</button>
      <button class="modal-btn success"   onclick="confirmarFinalizar()">✔ Confirmar</button>
    `;
  }
}

function modalSiguiente() {
  const input = document.getElementById("modal-input");
  const errorEl = document.getElementById("modal-error");
  const data = pedidosActivos[modalId];
  const val = parseFloat(input.value);
  let valido = true,
    mensajeError = "Valor inválido, intenta de nuevo.";

  if (modalStep === 1) {
    if (isNaN(val) || val < 0 || val > data.cantidad_referencias || !Number.isInteger(val)) {
      valido = false;
      mensajeError = `Ingresa un número entre 0 y ${data.cantidad_referencias}.`;
    } else {
      modalRespuestas.cantidad = val;
    }
  } else if (modalStep === 2) {
    if (isNaN(val) || val < 0 || !Number.isInteger(val)) {
      valido = false;
      mensajeError = "Ingresa un número entero positivo.";
    } else {
      modalRespuestas.bultos = val;
    }
  } else if (modalStep === 3) {
    if (isNaN(val) || val < 0) {
      valido = false;
      mensajeError = "Ingresa un monto válido mayor o igual a 0.";
    } else {
      modalRespuestas.monto = val;
    }
  }

  if (!valido) {
    input.classList.add("error");
    errorEl.textContent = mensajeError;
    errorEl.classList.add("visible");
    input.focus();
    return;
  }
  modalStep++;
  renderModalStep(modalStep);
  setTimeout(() => {
    const ni = document.getElementById("modal-input");
    if (ni) ni.focus();
  }, 80);
}

function modalAnterior() {
  if (modalStep > 1) {
    modalStep--;
    renderModalStep(modalStep);
    setTimeout(() => {
      const ni = document.getElementById("modal-input");
      if (ni) ni.focus();
    }, 80);
  }
}

async function confirmarFinalizar() {
  const data = pedidosActivos[modalId];
  if (!data) return;

  const idPedido = modalId;

  // 1) Hora de fin elegida (antes de cerrar el modal, por si hay error)
  const fin = obtenerFinElegidoMs(data);
  if (fin.error) {
    const errEl = document.getElementById("modal-fin-error");
    if (errEl) { errEl.textContent = fin.error; errEl.classList.add("visible"); }
    mostrarToast(`⚠️ ${fin.error}`, "warn");
    return;
  }

  // 2) Tiempo con esa hora de fin
  const finMs = fin.ms;
  const finISO = new Date(finMs).toISOString();
  const segmentosFinal = recortarSegmentos(data.segmentos, finMs);
  const elapsedMs = calcularMsSegmentos(data.sacador, segmentosFinal, finMs);
  const elapsedSeg = Math.floor(elapsedMs / 1000);

  // 3) Doble verificación si el tiempo es sospechosamente alto
  if (!fin.ajustado && elapsedSeg >= UMBRAL_ALERTA_SEG) {
    const ok = confirm(
      `Este pedido acumula ${formatTime(elapsedSeg)} de tiempo laborable.\n\n` +
      `¿Seguro que es correcto? Si ya había terminado antes, pulsa Cancelar y ajusta la hora real de fin.`
    );
    if (!ok) return;
  }

  cerrarModal();

  try {
    const cantidadSacada = modalRespuestas.cantidad;
    const bultos = modalRespuestas.bultos;
    const montoTotal = parseFloat(modalRespuestas.monto);
    const tiempoPorProductoSeg = cantidadSacada > 0 ? (elapsedSeg / cantidadSacada) : 0;

    const participantes = [
      {
        sacador: data.sacador,
        rol: "Lider",
        hora_inicio: data.hora_inicio,
        hora_fin: finISO,
        tiempo_total_segundos: elapsedSeg,
        tiempo_por_producto_segundos: tiempoPorProductoSeg
      }
    ];

    if (data.auxiliares && data.auxiliares.length > 0) {
      data.auxiliares.forEach(aux => {
        const nombre = typeof aux === "string" ? aux : aux.nombre;
        const joinedAt = typeof aux === "object" && aux.joined_at ? aux.joined_at : data.hora_inicio;
        // Solo cuentan los tramos en que el pedido estuvo activo
        const tiempoAuxSeg = calcularSegAuxiliar(nombre, segmentosFinal, aMs(joinedAt));
        participantes.push({
          sacador: nombre,
          rol: "Auxiliar",
          hora_inicio: joinedAt,
          hora_fin: finISO,
          tiempo_total_segundos: tiempoAuxSeg,
          tiempo_por_producto_segundos: cantidadSacada > 0 ? (tiempoAuxSeg / cantidadSacada) : 0
        });
      });
    }

    await GMApi.finalizarPedido(
      idPedido,
      cantidadSacada,
      bultos,
      montoTotal,
      finISO,
      participantes,
      segmentosFinal,
      elapsedSeg,
      tiempoPorProductoSeg
    );

    // Estado local (solo tras éxito en el backend)
    data.segmentos = segmentosFinal;
    data.estatus = "Finalizado";
    data.paused = true;
    data.elapsedMsFinal = elapsedMs;
    data._alerta = false;
    clearInterval(timers[idPedido]);
    clearInterval(badgeTimers[idPedido]);

    const card = document.getElementById(`card-${idPedido}`);
    if (card) { card.classList.add("finalizado"); card.dataset.alerta = "0"; }

    const endEl = document.getElementById(`end-${idPedido}`);
    if (endEl) endEl.textContent = formatearFecha(finISO);

    const timerEl = document.getElementById(`timer-${idPedido}`);
    if (timerEl) { timerEl.textContent = formatTime(elapsedSeg); timerEl.classList.remove("alerta"); }

    const tppWrap = document.getElementById(`tpp-wrap-${idPedido}`);
    const tppEl = document.getElementById(`tpp-${idPedido}`);
    const badgeEl = document.getElementById(`badge-pausa-${idPedido}`);
    const badgeAlerta = document.getElementById(`badge-alerta-${idPedido}`);
    if (tppWrap) tppWrap.style.display = "block";
    if (tppEl) tppEl.textContent = cantidadSacada > 0 ? formatTime(Math.floor(tiempoPorProductoSeg)) : "—";
    if (badgeEl) badgeEl.style.display = "none";
    if (badgeAlerta) badgeAlerta.style.display = "none";

    const teamSection = document.getElementById(`team-section-${idPedido}`);
    if (teamSection) {
      const btn = teamSection.querySelector(".btn-add-aux");
      if (btn) btn.remove();
    }
    const btnAuxSuelto = card ? card.querySelector(".btn-add-aux") : null;
    if (btnAuxSuelto) btnAuxSuelto.remove();

    actualizarStats();
    refrescarTimers();

    const porcentaje = Math.round((cantidadSacada / data.cantidad_referencias) * 100);
    const tppFormato = cantidadSacada > 0 ? formatTime(Math.floor(tiempoPorProductoSeg)) : "—";
    const equipoStr = data.tiene_equipo && data.auxiliares?.length > 0
      ? ` | Equipo: ${data.auxiliares.length + 1} personas` : "";

    mostrarToast(
      `✅ ${data.sacador.split(" ")[0]} — ${porcentaje}% | ${tppFormato}/prod | ${bultos} bultos | RD$ ${montoTotal.toFixed(2)}${equipoStr}`,
      "success"
    );
  } catch (err) {
    console.error("❌ Error finalizando pedido:", err);
    mostrarToast("❌ Error al finalizar pedido. Intenta de nuevo.", "error");
  }
}

// ============================================================
//  FILTRO
// ============================================================
function aplicarFiltro() {
  const textoBusqueda = (document.getElementById("filtro-texto")?.value || "").toLowerCase().trim();
  const sacadorFiltro = (document.getElementById("filtro-sacador")?.value || "").toLowerCase();
  let visibles = 0;
  const total = Object.keys(pedidosActivos).length;

  document.querySelectorAll(".task").forEach(card => {
    const matchCodigo = card.dataset.codigo?.includes(textoBusqueda) ?? true;
    const matchSacador = sacadorFiltro ? card.dataset.sacador?.includes(sacadorFiltro) : true;
    const matchAntiguo = soloAntiguos ? card.dataset.alerta === "1" : true;
    const visible = matchCodigo && matchSacador && matchAntiguo;
    card.style.display = visible ? "" : "none";
    if (visible) visibles++;
  });

  const countEl = document.getElementById("filter-count");
  if (countEl) {
    countEl.textContent = textoBusqueda || sacadorFiltro || soloAntiguos
      ? `${visibles} de ${total}`
      : `${total} pedidos`;
  }

  const emptyEl = document.getElementById("empty-state");
  if (emptyEl) emptyEl.classList.toggle("visible", visibles === 0 && total > 0);
}

function limpiarFiltro() {
  const tf = document.getElementById("filtro-texto");
  const sf = document.getElementById("filtro-sacador");
  if (tf) tf.value = "";
  if (sf) sf.value = "";
  soloAntiguos = false;
  aplicarFiltro();
}

// ============================================================
//  TOAST
// ============================================================
function mostrarToast(msg, tipo = "info") {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.className = `toast toast-${tipo}`;
  toast.textContent = msg;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

// ============================================================
//  INICIALIZACIÓN
// ============================================================
// El DOMContentLoaded está en el HTML y llama a inicializarAutenticacion()
// que a su vez llama a cargarPedidosDelBackend().

precargarFeriadosRD();
