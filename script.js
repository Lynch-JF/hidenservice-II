// ============================================================
//  SCRIPT PRINCIPAL v3 — Backend + Supabase + Motor de Tiempo Laboral
//  Requiere gm-api.js cargado ANTES
//  El tiempo transcurrido se calcula SIEMPRE a partir de los
//  timestamps reales guardados en `segmentos` (no en memoria),
//  por eso sobrevive a recargas / cierre de pestaña.
// ============================================================

// ── ESTADO GLOBAL ──
let pedidosActivos = {}; // { id_pedido: { ...datos, segmentos, paused, ... } }
let timers = {};
let badgeTimers = {};

const UMBRAL_EQUIPO = 100;

// ============================================================
//  DÍAS FERIADOS (cliente — igual que antes)
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
//  PANEL DE FERIADOS — UI (igual que antes)
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
            <span style="font-size:13px;">📅 <strong>${f}</strong> — ${label}</span>
            <button class="btn-delete" style="font-size:11px;" onclick="eliminarFeriado('${f}')" title="Eliminar">✕</button>
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
//  HORARIOS LABORABLES
// ============================================================
const HORA_ENTRADA = "08:00:00";

const HORARIO_SALIDA_PERSONAL = {
  "Elvin Manuel Villar Holguin":       { lun_jue: "18:00:00", vie: "17:00:00", sab: null },
  "Fernando Robles Grullon":           { lun_jue: "17:00:00", vie: "17:00:00", sab: null },
  "Clara Elvira Fanith Perez":         { lun_jue: "18:00:00", vie: "17:00:00", sab: null },
  "Omar Marmolejos Fajardo":           { lun_jue: "17:00:00", vie: "17:00:00", sab: "12:00:00" },
  "Jairo Fernandez Salcedo":           { lun_jue: "17:00:00", vie: "17:00:00", sab: "12:00:00" },
  "Juan De Jesús Peña Pérez":          { lun_jue: "17:00:00", vie: "17:00:00", sab: "12:00:00" },
  "Luis David Nuñez Santos":           { lun_jue: "18:00:00", vie: "17:00:00", sab: "12:00:00" },
  "Cirilo Reynoso Acevedo":            { lun_jue: "18:00:00", vie: "17:00:00", sab: "12:00:00" },
  "Enrique Nuñez Brito":               { lun_jue: "18:00:00", vie: "17:00:00", sab: "12:00:00" },
  "Luis Eduardo Reyes":                { lun_jue: "18:00:00", vie: "17:00:00", sab: "12:00:00" },
  "Bryhan Santo Cordero":              { lun_jue: "18:00:00", vie: "17:00:00", sab: "12:00:00" },
  "Wilkin Ortega Diaz":                { lun_jue: "18:00:00", vie: "17:00:00", sab: "12:00:00" },
  "Yan Carlos Cruz Paulino":           { lun_jue: "18:00:00", vie: "17:00:00", sab: "12:00:00" },
  "Fernando Antonio Burgos Cabrera":   { lun_jue: "18:00:00", vie: "17:00:00", sab: "12:00:00" },
  "Omelbe Gomez Valdez":               { lun_jue: "18:00:00", vie: "17:00:00", sab: "12:00:00" },
  "Ismael Augusto Veras Lasuse":       { lun_jue: "18:00:00", vie: "17:00:00", sab: "12:00:00" },
  "Anyelo Morel Acosta":               { lun_jue: "18:00:00", vie: "17:00:00", sab: null },
  "Oscar De Jesús De La Cruz Reinoso": { lun_jue: "18:00:00", vie: "17:00:00", sab: "12:00:00" }
};

const HORARIO_SALIDA_DEFAULT = { lun_jue: "18:00:00", vie: "17:00:00", sab: "12:00:00" };

function getSalidaPersonal(sacador, dia) {
  const h = HORARIO_SALIDA_PERSONAL[sacador] || HORARIO_SALIDA_DEFAULT;
  if (dia >= 1 && dia <= 4) return h.lun_jue;
  if (dia === 5) return h.vie;
  if (dia === 6) return h.sab;
  return null;
}

// ── Breaks de 10 minutos ─────────────────────────────────────
const BREAKS_10MIN = {
  "Omar Marmolejos Fajardo":         [{ hora: "10:00:00", durMin: 10 }, { hora: "12:00:00", durMin: 10 }, { hora: "16:00:00", durMin: 10 }],
  "Jairo Fernandez Salcedo":         [{ hora: "10:00:00", durMin: 10 }, { hora: "12:00:00", durMin: 10 }, { hora: "16:00:00", durMin: 10 }],
  "Juan De Jesús Peña Pérez":        [{ hora: "10:00:00", durMin: 10 }, { hora: "12:00:00", durMin: 10 }, { hora: "16:00:00", durMin: 10 }],
  "Luis David Nuñez Santos":         [{ hora: "10:00:00", durMin: 10 }, { hora: "16:00:00", durMin: 10 }],
  "Cirilo Reynoso Acevedo":          [{ hora: "10:00:00", durMin: 10 }, { hora: "16:00:00", durMin: 10 }],
  "Enrique Nuñez Brito":             [{ hora: "10:00:00", durMin: 10 }, { hora: "16:00:00", durMin: 10 }],
  "Luis Eduardo Reyes":              [{ hora: "10:00:00", durMin: 10 }, { hora: "16:00:00", durMin: 10 }],
  "Bryhan Santo Cordero":            [{ hora: "10:00:00", durMin: 10 }, { hora: "16:00:00", durMin: 10 }],
  "Wilkin Ortega Diaz":              [{ hora: "10:00:00", durMin: 10 }, { hora: "16:00:00", durMin: 10 }],
  "Yan Carlos Cruz Paulino":         [{ hora: "10:00:00", durMin: 10 }, { hora: "16:00:00", durMin: 10 }],
  "Fernando Antonio Burgos Cabrera": [{ hora: "10:00:00", durMin: 10 }, { hora: "16:00:00", durMin: 10 }],
  "Omelbe Gomez Valdez":             [{ hora: "10:00:00", durMin: 10 }, { hora: "16:00:00", durMin: 10 }],
  "Oscar De Jesús De La Cruz Reinoso": [{ hora: "10:00:00", durMin: 10 }, { hora: "16:00:00", durMin: 10 }]
};

// ── Almuerzo individual ───────────────────────────────────────
const INDIVIDUAL_PAUSES = {
  "Elvin Manuel Villar Holguin":       { pausa: "13:00:00", reanuda: "14:00:00" },
  "Fernando Robles Grullon":           { pausa: "13:00:00", reanuda: "14:00:00" },
  "Clara Elvira Fanith Perez":         { pausa: "13:00:00", reanuda: "14:00:00" },
  "Omar Marmolejos Fajardo":           { pausa: "13:00:00", reanuda: "14:00:00" },
  "Jairo Fernandez Salcedo":           { pausa: "13:00:00", reanuda: "14:00:00" },
  "Ismael Augusto Veras Lasuse":       { pausa: "13:00:00", reanuda: "14:00:00" },
  "Fernando Antonio Burgos Cabrera":   { pausa: "12:00:00", reanuda: "14:00:00" },
  "Juan De Jesús Peña Pérez":          { pausa: "13:00:00", reanuda: "14:00:00" },
  "Luis David Nuñez Santos":           { pausa: "12:00:00", reanuda: "14:00:00" },
  "Yustin Alexander Mendez":           { pausa: "12:00:00", reanuda: "14:00:00" },
  "Luis Eduardo Reyes":                { pausa: "12:00:00", reanuda: "14:00:00" },
  "Omelbe Gomez Valdez":               { pausa: "12:00:00", reanuda: "14:00:00" },
  "Bryhan Santo Cordero":              { pausa: "12:00:00", reanuda: "14:00:00" },
  "Enrique Nuñez Brito":               { pausa: "12:00:00", reanuda: "14:00:00" },
  "Cirilo Reynoso Acevedo":            { pausa: "12:00:00", reanuda: "14:00:00" },
  "Yan Carlos Cruz Paulino":           { pausa: "12:00:00", reanuda: "14:00:00" },
  "Wilkin Ortega Diaz":                { pausa: "12:00:00", reanuda: "14:00:00" },
  "Anyelo Morel Acosta":               { pausa: "12:00:00", reanuda: "14:00:00" },
  "Oscar De Jesús De La Cruz Reinoso": { pausa: "12:00:00", reanuda: "14:00:00" }
};

// Lista de sacadores usada en los selects de auxiliar/equipo
const TODOS_LOS_SACADORES = [
  "Omar Marmolejos Fajardo", "Jairo Fernandez Salcedo", "Ismael Augusto Veras Lasuse",
  "Fernando Antonio Burgos Cabrera", "Juan De Jesús Peña Pérez", "Luis David Nuñez Santos",
  "Yustin Alexander Mendez", "Luis Eduardo Reyes", "Omelbe Gomez Valdez",
  "Bryhan Santo Cordero", "Enrique Nuñez Brito", "Cirilo Reynoso Acevedo",
  "Yan Carlos Cruz Paulino", "Wilkin Ortega Diaz", "Oscar De Jesús De La Cruz Reinoso"
];

// ============================================================
//  MOTOR DE TIEMPO LABORABLE
// ============================================================
function pad(n) { return String(n).padStart(2, "0"); }

function hhmmssASeg(str) {
  const [h, m, s] = str.split(":").map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

/**
 * Devuelve los rangos [inicioSeg, finSeg] laborables del sacador
 * para la fecha dada. Delega en getRangosConExtras si horasextras.js
 * está cargado (para horarios especiales / domingos habilitados).
 */
function getRangosLaboralesDia(fecha, sacador) {
  const dia = fecha.getDay();
  if (dia === 0) return [];
  if (esFeriado(fecha)) return [];

  const salidaStr = getSalidaPersonal(sacador, dia);
  if (!salidaStr) return [];

  const entrada = hhmmssASeg(HORA_ENTRADA);
  const salida = hhmmssASeg(salidaStr);

  const pausas = [];

  if (dia !== 6 && INDIVIDUAL_PAUSES[sacador]) {
    pausas.push({
      inicio: hhmmssASeg(INDIVIDUAL_PAUSES[sacador].pausa),
      fin: hhmmssASeg(INDIVIDUAL_PAUSES[sacador].reanuda)
    });
  }

  if (dia >= 1 && dia <= 4 && BREAKS_10MIN[sacador]) {
    for (const b of BREAKS_10MIN[sacador]) {
      const ini = hhmmssASeg(b.hora);
      const fin = ini + b.durMin * 60;
      if (ini >= entrada && fin <= salida) {
        pausas.push({ inicio: ini, fin });
      }
    }
  }

  pausas.sort((a, b) => a.inicio - b.inicio);

  const rangos = [];
  let cursor = entrada;
  for (const p of pausas) {
    if (p.inicio > cursor && p.inicio < salida) {
      rangos.push([cursor, Math.min(p.inicio, salida)]);
    }
    cursor = Math.max(cursor, p.fin);
  }
  if (cursor < salida) rangos.push([cursor, salida]);

  if (typeof getRangosConExtras === "function") {
    return getRangosConExtras(fecha, sacador, rangos);
  }
  return rangos;
}

function calcularSegLaborables(sacador, desdeMs, hastaMs) {
  if (hastaMs <= desdeMs) return 0;

  let total = 0;
  const desde = new Date(desdeMs);
  const hasta = new Date(hastaMs);

  const inicioDia = new Date(desde);
  inicioDia.setHours(0, 0, 0, 0);

  let cursor = new Date(inicioDia);

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

      if (solapFin > solapInicio) {
        total += Math.floor((solapFin - solapInicio) / 1000);
      }
    }

    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(0, 0, 0, 0);
  }

  return total;
}

/**
 * Calcula el tiempo laborable (ms) de un pedido a partir de sus
 * segmentos reales (inicio/fin en ISO string o ms). Cada segmento
 * se recorta automáticamente contra almuerzo/breaks/feriados/fuera
 * de horario vía calcularSegLaborables — por eso NO importa si la
 * pestaña estuvo cerrada durante ese tramo, el cálculo es correcto
 * igual con solo recargar la página.
 */
function calcularElapsedMs(data, nowMs) {
  if (data.estatus === "Finalizado") return data.elapsedMsFinal || 0;

  if (!data.segmentos || data.segmentos.length === 0) {
    data.segmentos = [{ inicio: data.hora_inicio, fin: data.paused ? (data.hora_inicio) : null }];
  }

  let totalSeg = 0;
  for (const seg of data.segmentos) {
    const inicioMs = typeof seg.inicio === "number" ? seg.inicio : new Date(seg.inicio).getTime();
    const finMs = seg.fin === null || seg.fin === undefined
      ? nowMs
      : (typeof seg.fin === "number" ? seg.fin : new Date(seg.fin).getTime());
    totalSeg += calcularSegLaborables(data.sacador, inicioMs, finMs);
  }
  return totalSeg * 1000;
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
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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

    const { token, usuario } = await GMApi.login(email, password);

    console.log("✅ Autenticación exitosa:", usuario.nombre);
    loadingEl.style.display = "none";
    errorEl.classList.remove("visible");

    document.getElementById("modal-login-overlay").classList.remove("open");
    document.getElementById("main-app").style.display = "block";
    document.getElementById("btn-float-extras").style.display = "flex";
    document.getElementById("usuario-nombre").textContent = usuario.nombre || "Usuario";

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
    setTimeout(() => {
      GMApi.cerrarSesion();
    }, 800);
  }
}

// ============================================================
//  CARGAR PEDIDOS DEL BACKEND
// ============================================================
async function cargarPedidosDelBackend() {
  try {
    const pedidosEnProceso = await GMApi.obtenerPedidos("En Proceso");
    const pedidosPausados = await GMApi.obtenerPedidos("Pausado");
    const pedidosFinalizados = await GMApi.obtenerPedidos("Finalizado");

    const todosPedidos = [...pedidosEnProceso, ...pedidosPausados, ...pedidosFinalizados];

    const taskList = document.getElementById("task-list");
    taskList.innerHTML = "";

    for (const pedido of todosPedidos) {
      await renderizarPedido(pedido);
    }

    actualizarStats();
    aplicarFiltro();
  } catch (err) {
    console.error("❌ Error cargando pedidos:", err.message);
    mostrarToast("⚠️ Error al cargar pedidos. Recarga la página.", "error");
  }
}

/**
 * Renderiza un pedido individual desde el backend.
 * Usa los `segmentos` reales que vienen de Supabase para que el
 * tiempo laborable se recalcule correctamente sin importar cuánto
 * tiempo estuvo la página cerrada.
 */
async function renderizarPedido(pedido) {
  const { id, numero_pedido, sacador, cantidad_referencias, hora_inicio, hora_fin,
    estatus, auxiliares, tiene_equipo, segmentos, tiempo_total_segundos } = pedido;

  let segmentosLocales = Array.isArray(segmentos) && segmentos.length > 0
    ? segmentos
    : [{ inicio: hora_inicio, fin: estatus === "Finalizado" ? hora_fin : null }];

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
    paused: estatus === "Pausado",
    elapsedMsFinal: estatus === "Finalizado" ? (tiempo_total_segundos || 0) * 1000 : 0
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
    if (!pedidosActivos[id].paused) {
      programarPausas(id, sacador, new Date());
    }
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
      <div class="equipo-lider-avatar">${iniciales}</div>
      <div class="equipo-lider-info">
        <div class="equipo-lider-name">${sacador}</div>
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
    .map(s => `<option value="${s}">${s}</option>`)
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

/**
 * Crea un pedido en el backend
 */
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
//  Cierra/abre un segmento real y lo persiste en el backend, así
//  el estado sobrevive a un refresh incluso si el auto-pause
//  programado nunca llegó a dispararse (pestaña cerrada, etc.) —
//  y aunque eso pase, calcularSegLaborables igual descuenta el
//  tramo no laborable automáticamente.
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
  if (!data || data.paused || data.estatus === "Finalizado") return;

  const ahora = new Date().toISOString();
  const ultimo = data.segmentos[data.segmentos.length - 1];
  if (ultimo && ultimo.fin === null) ultimo.fin = ahora;

  data.paused = true;
  data.estatus = "Pausado";

  try {
    await _persistirSegmentos(id, "Pausado");

    const btn = document.querySelector(`#card-${id} .btn-pause`);
    if (btn) {
      btn.textContent = "⏸ Pausado";
      btn.classList.add("paused");
    }

    renderBadgePausa(id);
    actualizarStats();
    if (tipo === "manual") mostrarToast("⏸ Pedido pausado", "info");
  } catch (err) {
    console.error("❌ Error pausando pedido:", err);
    data.paused = false;
    data.estatus = "En Proceso";
    if (ultimo) ultimo.fin = null;
    mostrarToast("❌ Error al pausar pedido.", "error");
  }
}

async function reanudar(id) {
  const data = pedidosActivos[id];
  if (!data || !data.paused || data.estatus === "Finalizado") return;

  const ahora = new Date().toISOString();
  data.segmentos.push({ inicio: ahora, fin: null });
  data.paused = false;
  data.estatus = "En Proceso";

  try {
    await _persistirSegmentos(id, "En Proceso");

    const btn = document.querySelector(`#card-${id} .btn-pause`);
    if (btn) {
      btn.textContent = "⏸ Pausar";
      btn.classList.remove("paused");
    }

    iniciarTimer(id);
    programarPausas(id, data.sacador, new Date());
    renderBadgePausa(id);
    actualizarStats();
    mostrarToast("▶ Pedido reanudado", "info");
  } catch (err) {
    console.error("❌ Error reanudando pedido:", err);
    data.segmentos.pop();
    data.paused = true;
    data.estatus = "Pausado";
    mostrarToast("❌ Error al reanudar pedido.", "error");
  }
}

async function pausarTodos() {
  for (const id in pedidosActivos) {
    const data = pedidosActivos[id];
    if (!data.paused && data.estatus !== "Finalizado") {
      await pausar(id, "manual");
    }
  }
}

async function reanudarTodos() {
  for (const id in pedidosActivos) {
    const data = pedidosActivos[id];
    if (data.paused && data.estatus !== "Finalizado") {
      await reanudar(id);
    }
  }
}

// ============================================================
//  PAUSAS AUTOMÁTICAS PROGRAMADAS (almuerzo / breaks / salida)
// ============================================================
function addDays(date, d) {
  const nd = new Date(date);
  nd.setDate(date.getDate() + d);
  return nd;
}

function getFutureTime(date, timeStr) {
  const [h, m, s] = timeStr.split(":").map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m, s);
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

function programarPausas(id, sacador, now) {
  const dia = now.getDay();

  if (dia !== 6 && INDIVIDUAL_PAUSES[sacador]) {
    const p1 = getFutureTime(now, INDIVIDUAL_PAUSES[sacador].pausa);
    const r1 = getFutureTime(now, INDIVIDUAL_PAUSES[sacador].reanuda);
    if (p1 > now) setTimeout(() => pausar(id, "almuerzo"), p1 - now);
    if (r1 > now) setTimeout(() => reanudar(id), r1 - now);
  }

  if (dia >= 1 && dia <= 4 && BREAKS_10MIN[sacador]) {
    for (const b of BREAKS_10MIN[sacador]) {
      const pBreak = getFutureTime(now, b.hora);
      const rBreak = new Date(pBreak.getTime() + b.durMin * 60 * 1000);
      if (pBreak > now) setTimeout(() => pausar(id, "break"), pBreak - now);
      if (rBreak > now) setTimeout(() => reanudar(id), rBreak - now);
    }
  }

  const salidaStr = getSalidaPersonal(sacador, dia);
  if (salidaStr) {
    const pausaSalida = getFutureTime(now, salidaStr);
    const diasHasta = diasHastaProximoLaborable(now);
    const reanuda = getFutureTime(addDays(now, diasHasta), HORA_ENTRADA);
    if (pausaSalida > now) setTimeout(() => pausar(id, "salida"), pausaSalida - now);
    if (reanuda > now) setTimeout(() => reanudar(id), reanuda - now);
  }
}

// ============================================================
//  BADGE DE PRÓXIMA PAUSA
// ============================================================
function calcularProximaPausa(sacador, now) {
  const eventos = [];
  const dia = now.getDay();

  if (dia !== 6 && INDIVIDUAL_PAUSES[sacador]) {
    const p = getFutureTime(now, INDIVIDUAL_PAUSES[sacador].pausa);
    if (p > now) eventos.push({ label: "🍽 Almuerzo", time: p, tipo: "almuerzo" });
  }

  if (dia >= 1 && dia <= 4 && BREAKS_10MIN[sacador]) {
    for (const b of BREAKS_10MIN[sacador]) {
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

function iniciarBadgeTimer(id) {
  if (badgeTimers[id]) clearInterval(badgeTimers[id]);
  badgeTimers[id] = setInterval(() => renderBadgePausa(id), 60000);
  renderBadgePausa(id);
}

// ============================================================
//  ELIMINAR
// ============================================================
async function eliminar(id) {
  if (!confirm("¿Eliminar este pedido?")) return;

  try {
    await GMApi.eliminarPedido(id);

    clearInterval(timers[id]);
    clearInterval(badgeTimers[id]);
    delete timers[id];
    delete badgeTimers[id];
    delete pedidosActivos[id];

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
  if (!confirm("¿Eliminar TODOS los pedidos? Esta acción no se puede deshacer.")) return;

  const ids = Object.keys(pedidosActivos);
  for (const id of ids) {
    try {
      await GMApi.eliminarPedido(id);
      clearInterval(timers[id]);
      clearInterval(badgeTimers[id]);
      delete timers[id];
      delete badgeTimers[id];
      delete pedidosActivos[id];

      const card = document.getElementById(`card-${id}`);
      if (card) card.remove();
    } catch (err) {
      console.error(`❌ Error eliminando pedido ${id}:`, err);
    }
  }

  pedidosActivos = {};
  timers = {};
  badgeTimers = {};
  actualizarStats();
  aplicarFiltro();
  mostrarToast("🗑 Todos los pedidos fueron eliminados", "warn");
}

// ============================================================
//  TIMER — recalcula siempre desde los segmentos reales
// ============================================================
function iniciarTimer(id) {
  if (timers[id]) clearInterval(timers[id]);

  timers[id] = setInterval(() => {
    const data = pedidosActivos[id];
    if (!data || data.estatus === "Finalizado") {
      clearInterval(timers[id]);
      return;
    }

    const elapsedMs = calcularElapsedMs(data, Date.now());
    const timerEl = document.getElementById(`timer-${id}`);
    if (timerEl) {
      timerEl.textContent = formatTime(Math.floor(elapsedMs / 1000));
    }
  }, 500);
}

// ============================================================
//  STATS BAR
// ============================================================
function actualizarStats() {
  let activos = 0, pausados = 0, finalizados = 0;

  for (const id in pedidosActivos) {
    const d = pedidosActivos[id];
    if (d.estatus === "Finalizado") finalizados++;
    else if (d.estatus === "Pausado") pausados++;
    else activos++;
  }

  const el = id => document.getElementById(id);
  if (el("stat-activos")) el("stat-activos").textContent = activos;
  if (el("stat-pausados")) el("stat-pausados").textContent = pausados;
  if (el("stat-finalizados")) el("stat-finalizados").textContent = finalizados;
}

// ============================================================
//  CREAR TARJETA
// ============================================================
function crearTarjeta(pedido) {
  const { id, numero_pedido, sacador, cantidad_referencias, hora_inicio, estatus, auxiliares, tiene_equipo } = pedido;

  const task = document.createElement("div");
  task.className = "task";
  task.id = `card-${id}`;
  task.dataset.codigo = numero_pedido.toLowerCase();
  task.dataset.sacador = sacador.toLowerCase();

  if (tiene_equipo && auxiliares && auxiliares.length > 0) {
    task.classList.add("en-equipo");
  }

  if (estatus === "Finalizado") {
    task.classList.add("finalizado");
  }

  task.innerHTML = `
    <div class="task-header">
      <div class="task-code">#${numero_pedido}</div>
      <button class="btn-delete" onclick="eliminar('${id}')" title="Eliminar">✕</button>
    </div>
    <div class="task-sacador">${sacador}</div>
    <div class="task-meta">
      <span class="meta-item">📦 <strong>${cantidad_referencias}</strong> productos</span>
      <span class="badge-pausa" id="badge-pausa-${id}" style="display:none;"></span>
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

  const taskList = document.getElementById("task-list");
  taskList.appendChild(task);

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
        <div class="member-info"><span>${nombre}</span>${joined}</div>
      </div>`;
  }).join("");

  const btnLabel = auxiliares.length === 0 ? "+ Agregar auxiliar" : "+ Añadir otro auxiliar";

  const innerHTML = `
    <div class="task-team-title">👥 Equipo</div>
    <div class="task-team-member">
      <span class="member-role lider">👑 Líder</span>
      <div class="member-info">
        <span>${lider}</span>
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
//  MODAL FINALIZAR
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

    const equipoRow = data.tiene_equipo && data.auxiliares && data.auxiliares.length > 0
      ? `<div class="summary-row">
           <span class="summary-key">Equipo</span>
           <span class="summary-val" style="color:var(--team);font-size:12px;">
             ${[data.sacador, ...data.auxiliares.map(a => typeof a === "string" ? a : a.nombre)].join(", ")}
           </span>
         </div>` : "";

    body.innerHTML = `
      <div class="modal-summary">
        <div class="summary-row"><span class="summary-key">Pedido</span><span class="summary-val highlight">#${data.numero_pedido}</span></div>
        <div class="summary-row"><span class="summary-key">Sacador</span><span class="summary-val">${data.sacador.split(" ").slice(0, 2).join(" ")}</span></div>
        ${equipoRow}
        <div class="summary-row"><span class="summary-key">Productos sacados</span><span class="summary-val">${cantSacada} / ${data.cantidad_referencias} (${porcentaje}%)</span></div>
        <div class="summary-row"><span class="summary-key">Tiempo laborable</span><span class="summary-val success">${formatTime(elapsedSeg)}</span></div>
        <div class="summary-row"><span class="summary-key">Tiempo/producto</span><span class="summary-val success">${tpp}</span></div>
        <div class="summary-row"><span class="summary-key">Bultos</span><span class="summary-val">${modalRespuestas.bultos}</span></div>
        <div class="summary-row"><span class="summary-key">Monto total</span><span class="summary-val">RD$ ${parseFloat(modalRespuestas.monto).toFixed(2)}</span></div>
      </div>
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

  // Guardamos el id ANTES de cerrar el modal (cerrarModal pone modalId = null)
  const idPedido = modalId;

  cerrarModal();

  try {
    const ahoraDate = new Date();
    const ahora = ahoraDate.toISOString();
    const cantidadSacada = modalRespuestas.cantidad;
    const bultos = modalRespuestas.bultos;
    const montoTotal = parseFloat(modalRespuestas.monto);

    // Cerrar el segmento abierto (si no estaba pausado)
    if (!data.paused) {
      const ultimo = data.segmentos[data.segmentos.length - 1];
      if (ultimo && ultimo.fin === null) ultimo.fin = ahora;
    }

    // Tiempo laborable real del líder, ya calculado a partir de los segmentos
    const elapsedMs = calcularElapsedMs(data, ahoraDate.getTime());
    const elapsedSeg = Math.floor(elapsedMs / 1000);
    const tiempoPorProductoSeg = cantidadSacada > 0 ? (elapsedSeg / cantidadSacada) : 0;

    const participantes = [
      {
        sacador: data.sacador,
        rol: "Lider",
        hora_inicio: data.hora_inicio,
        hora_fin: ahora,
        tiempo_total_segundos: elapsedSeg,
        tiempo_por_producto_segundos: tiempoPorProductoSeg
      }
    ];

    if (data.auxiliares && data.auxiliares.length > 0) {
      data.auxiliares.forEach(aux => {
        const nombre = typeof aux === "string" ? aux : aux.nombre;
        const joinedAt = typeof aux === "object" && aux.joined_at ? aux.joined_at : data.hora_inicio;
        const tiempoAuxSeg = calcularSegLaborables(nombre, new Date(joinedAt).getTime(), ahoraDate.getTime());
        participantes.push({
          sacador: nombre,
          rol: "Auxiliar",
          hora_inicio: joinedAt,
          hora_fin: ahora,
          tiempo_total_segundos: tiempoAuxSeg,
          tiempo_por_producto_segundos: cantidadSacada > 0 ? (tiempoAuxSeg / cantidadSacada) : 0
        });
      });
    }

    // Llamar al backend para finalizar (incluye segmentos + tiempo real calculado)
    const pedidoFinalizado = await GMApi.finalizarPedido(
      idPedido,
      cantidadSacada,
      bultos,
      montoTotal,
      ahora,
      participantes,
      data.segmentos,
      elapsedSeg,
      tiempoPorProductoSeg
    );

    // Actualizar estado local
    data.estatus = "Finalizado";
    data.elapsedMsFinal = elapsedMs;
    clearInterval(timers[idPedido]);
    clearInterval(badgeTimers[idPedido]);

    // Actualizar UI
    const card = document.getElementById(`card-${idPedido}`);
    if (card) card.classList.add("finalizado");

    const endEl = document.getElementById(`end-${idPedido}`);
    if (endEl) endEl.textContent = formatearFecha(ahora);

    const timerEl = document.getElementById(`timer-${idPedido}`);
    if (timerEl) timerEl.textContent = formatTime(elapsedSeg);

    const tppWrap = document.getElementById(`tpp-wrap-${idPedido}`);
    const tppEl = document.getElementById(`tpp-${idPedido}`);
    const badgeEl = document.getElementById(`badge-pausa-${idPedido}`);
    if (tppWrap) tppWrap.style.display = "block";
    if (tppEl) tppEl.textContent = cantidadSacada > 0 ? formatTime(Math.floor(tiempoPorProductoSeg)) : "—";
    if (badgeEl) badgeEl.style.display = "none";

    const teamSection = document.getElementById(`team-section-${idPedido}`);
    if (teamSection) {
      const btn = teamSection.querySelector(".btn-add-aux");
      if (btn) btn.remove();
    }
    const btnAuxSuelto = card ? card.querySelector(".btn-add-aux") : null;
    if (btnAuxSuelto) btnAuxSuelto.remove();

    actualizarStats();

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
    const visible = matchCodigo && matchSacador;
    card.style.display = visible ? "" : "none";
    if (visible) visibles++;
  });

  const countEl = document.getElementById("filter-count");
  if (countEl) {
    countEl.textContent = textoBusqueda || sacadorFiltro
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
// que a su vez llama a cargarPedidosDelBackend()

precargarFeriadosRD();
