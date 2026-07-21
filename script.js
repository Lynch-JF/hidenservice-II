// ============================================================
//  CONFIGURACIÓN
// ============================================================
const API_HOJA_PROCESO   = "https://api.sheetbest.com/sheets/7793c015-368c-456b-a175-0fc6cc94821f";
const API_HOJA_HISTORIAL = "https://api.sheetbest.com/sheets/cce35084-ee62-4934-b2ed-eb5fcd2d414b";

const UMBRAL_EQUIPO = 100;

let taskList     = document.getElementById("task-list");
let timers       = {};
let pausedTimers = {};

// ============================================================
//  DÍAS FERIADOS
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
  const key = `${fecha.getFullYear()}-${pad(fecha.getMonth()+1)}-${pad(fecha.getDate())}`;
  return cargarFeriados().includes(key);
}

// ============================================================
//  HORARIOS LABORABLES
// ============================================================
const HORA_ENTRADA = "08:00:00";

const HORARIO_SALIDA_PERSONAL = {
  "Elvin Manuel Villar Holguin":        { lun_jue: "18:00:00", vie: "17:00:00", sab: null         },
  "Fernando Robles Grullon":            { lun_jue: "17:00:00", vie: "17:00:00", sab: null         },
  "Clara Elvira Fanith Perez":          { lun_jue: "18:00:00", vie: "17:00:00", sab: null         },
  "Omar Marmolejos Fajardo":            { lun_jue: "17:00:00", vie: "17:00:00", sab: "12:00:00"   },
  "Jairo Fernandez Salcedo":            { lun_jue: "17:00:00", vie: "17:00:00", sab: "12:00:00"   },
  "Juan De Jesús Peña Pérez":           { lun_jue: "17:00:00", vie: "17:00:00", sab: "12:00:00"   },
  "Luis David Nuñez Santos":            { lun_jue: "18:00:00", vie: "17:00:00", sab: "12:00:00"   },
  "Cirilo Reynoso Acevedo":             { lun_jue: "18:00:00", vie: "17:00:00", sab: "12:00:00"   },
  "Enrique Nuñez Brito":                { lun_jue: "18:00:00", vie: "17:00:00", sab: "12:00:00"   },
  "Luis Eduardo Reyes":                 { lun_jue: "18:00:00", vie: "17:00:00", sab: "12:00:00"   },
  "Bryhan Santo Cordero":               { lun_jue: "18:00:00", vie: "17:00:00", sab: "12:00:00"   },
  "Wilkin Ortega Diaz":                 { lun_jue: "18:00:00", vie: "17:00:00", sab: "12:00:00"   },
  "Yan Carlos Cruz Paulino":            { lun_jue: "18:00:00", vie: "17:00:00", sab: "12:00:00"   },
  "Fernando Antonio Burgos Cabrera":    { lun_jue: "18:00:00", vie: "17:00:00", sab: "12:00:00"   },
  "Omelbe Gomez Valdez":                { lun_jue: "18:00:00", vie: "17:00:00", sab: "12:00:00"   },
  "Ismael Augusto Veras Lasuse":        { lun_jue: "18:00:00", vie: "17:00:00", sab: "12:00:00"   },
  "Anyelo Morel Acosta":                { lun_jue: "18:00:00", vie: "17:00:00", sab: null         },
  "Oscar De Jesús De La Cruz Reinoso":            { lun_jue: "18:00:00", vie: "17:00:00", sab: "12:00:00"   },
};

const HORARIO_SALIDA_DEFAULT = { lun_jue: "18:00:00", vie: "17:00:00", sab: "12:00:00" };

function getSalidaPersonal(sacador, dia) {
  const h = HORARIO_SALIDA_PERSONAL[sacador] || HORARIO_SALIDA_DEFAULT;
  if (dia >= 1 && dia <= 4) return h.lun_jue;
  if (dia === 5)             return h.vie;
  if (dia === 6)             return h.sab;
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
  "Oscar De Jesús De La Cruz Reinoso":             [{ hora: "10:00:00", durMin: 10 }, { hora: "16:00:00", durMin: 10 }]
};

// ── Almuerzo individual ───────────────────────────────────────
const INDIVIDUAL_PAUSES = {
  "Elvin Manuel Villar Holguin":        { pausa: "13:00:00", reanuda: "14:00:00" },
  "Fernando Robles Grullon":            { pausa: "13:00:00", reanuda: "14:00:00" },
  "Clara Elvira Fanith Perez":          { pausa: "13:00:00", reanuda: "14:00:00" },
  "Omar Marmolejos Fajardo":            { pausa: "13:00:00", reanuda: "14:00:00" },
  "Jairo Fernandez Salcedo":            { pausa: "13:00:00", reanuda: "14:00:00" },
  "Ismael Augusto Veras Lasuse":        { pausa: "13:00:00", reanuda: "14:00:00" },
  "Fernando Antonio Burgos Cabrera":    { pausa: "12:00:00", reanuda: "14:00:00" },
  "Juan De Jesús Peña Pérez":           { pausa: "13:00:00", reanuda: "14:00:00" },
  "Luis David Nuñez Santos":            { pausa: "12:00:00", reanuda: "14:00:00" },
  "Yustin Alexander Mendez":            { pausa: "12:00:00", reanuda: "14:00:00" },
  "Luis Eduardo Reyes":                 { pausa: "12:00:00", reanuda: "14:00:00" },
  "Omelbe Gomez Valdez":                { pausa: "12:00:00", reanuda: "14:00:00" },
  "Bryhan Santo Cordero":               { pausa: "12:00:00", reanuda: "14:00:00" },
  "Enrique Nuñez Brito":                { pausa: "12:00:00", reanuda: "14:00:00" },
  "Cirilo Reynoso Acevedo":             { pausa: "12:00:00", reanuda: "14:00:00" },
  "Yan Carlos Cruz Paulino":            { pausa: "12:00:00", reanuda: "14:00:00" },
  "Wilkin Ortega Diaz":                 { pausa: "12:00:00", reanuda: "14:00:00" },
  "Anyelo Morel Acosta":                { pausa: "12:00:00", reanuda: "14:00:00" },
  "Oscar De Jesús De La Cruz Reinoso":  { pausa: "12:00:00", reanuda: "14:00:00" }
};

const TODOS_LOS_SACADORES = [
  "Elvin Manuel Villar Holguin",
  "Fernando Robles Grullon",
  "Clara Elvira Fanith Perez",
  "Omar Marmolejos Fajardo",
  "Jairo Fernandez Salcedo",
  "Ismael Augusto Veras Lasuse",
  "Fernando Antonio Burgos Cabrera",
  "Juan De Jesús Peña Pérez",
  "Luis David Nuñez Santos",
  "Yustin Alexander Mendez",
  "Luis Eduardo Reyes",
  "Omelbe Gomez Valdez",
  "Bryhan Santo Cordero",
  "Enrique Nuñez Brito",
  "Cirilo Reynoso Acevedo",
  "Yan Carlos Cruz Paulino",
  "Wilkin Ortega Diaz",
  "Anyelo Morel Acosta",
  "Oscar De Jesús De La Cruz Reinoso"
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
 * para la fecha dada. Al final delega en getRangosConExtras si
 * el módulo horasextras.js está cargado.
 */
function getRangosLaboralesDia(fecha, sacador) {
  const dia = fecha.getDay();
  if (dia === 0) return [];
  if (esFeriado(fecha)) return [];

  const salidaStr = getSalidaPersonal(sacador, dia);
  if (!salidaStr) return [];

  const entrada = hhmmssASeg(HORA_ENTRADA);
  const salida  = hhmmssASeg(salidaStr);

  const pausas = [];

  // Almuerzo (no aplica sábado)
  if (dia !== 6 && INDIVIDUAL_PAUSES[sacador]) {
    pausas.push({
      inicio: hhmmssASeg(INDIVIDUAL_PAUSES[sacador].pausa),
      fin:    hhmmssASeg(INDIVIDUAL_PAUSES[sacador].reanuda)
    });
  }

  // Breaks de 10 min (solo Lun–Jue)
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

  // ── Delegar en horasextras.js si está cargado ──
  if (typeof getRangosConExtras === "function") {
    return getRangosConExtras(fecha, sacador, rangos);
  }
  return rangos;
}

function segLaboralesDia(fecha, sacador) {
  return getRangosLaboralesDia(fecha, sacador)
    .reduce((acc, [a, b]) => acc + Math.max(0, b - a), 0);
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
        Math.floor(rInicio / 3600),
        Math.floor((rInicio % 3600) / 60),
        rInicio % 60, 0
      );
      const rFinMs = new Date(cursor).setHours(
        Math.floor(rFin / 3600),
        Math.floor((rFin % 3600) / 60),
        rFin % 60, 0
      );

      const solapInicio = Math.max(rInicioMs, limInf.getTime());
      const solapFin    = Math.min(rFinMs,    limSup.getTime());

      if (solapFin > solapInicio) {
        total += Math.floor((solapFin - solapInicio) / 1000);
      }
    }

    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(0, 0, 0, 0);
  }

  return total;
}

function esMomentoLaborable(sacador, tsMs) {
  const d   = new Date(tsMs);
  const seg = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
  return getRangosLaboralesDia(d, sacador).some(([a, b]) => seg >= a && seg < b);
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
  const body   = document.getElementById("modal-feriados-body");
  const footer = document.getElementById("modal-feriados-footer");
  const lista  = cargarFeriados().sort();

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
  const input    = document.getElementById("feriado-input");
  const errorEl  = document.getElementById("feriado-error");
  const fecha    = input.value.trim();

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

const FERIADOS_RD_2025 = [
  "2025-01-01","2025-01-06","2025-01-21","2025-02-27","2025-04-14",
  "2025-04-18","2025-05-01","2025-06-19","2025-08-16","2025-09-24",
  "2025-11-06","2025-12-25"
];
const FERIADOS_RD_2026 = [
  "2026-01-01","2026-01-06","2026-01-26","2026-02-27","2026-04-03",
  "2026-04-06","2026-05-01","2026-06-29","2026-08-16","2026-09-24",
  "2026-11-06","2026-12-25"
];

function precargarFeriadosRD() {
  if (cargarFeriados().length === 0) {
    guardarFeriados([...FERIADOS_RD_2025, ...FERIADOS_RD_2026]);
    console.log("✅ Feriados dominicanos 2025-2026 precargados.");
  }
}

// ============================================================
//  UTILIDADES DE FORMATO
// ============================================================
function formatDateTime(date) {
  if (!(date instanceof Date)) date = new Date(date);
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ` +
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
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

window.formatDateTime = formatDateTime;
window.formatTime     = formatTime;

// ============================================================
//  CÁLCULO DE ELAPSED
// ============================================================
function calcularElapsedMs(data, nowMs) {
  if (data.finalizado) return data.elapsedMsFinal || 0;

  if (!data.segmentos || data.segmentos.length === 0) {
    _migrarASegmentos(data, nowMs);
  }

  let totalSeg = 0;
  for (const seg of data.segmentos) {
    const fin = seg.fin !== null ? seg.fin : nowMs;
    totalSeg += calcularSegLaborables(data.sacador, seg.inicio, fin);
  }
  return totalSeg * 1000;
}

function _migrarASegmentos(data, nowMs) {
  const inicio = data.startTimestamp || (nowMs - (data.elapsedSnapshot || 0));
  const fin    = data.paused ? (data.pausedAt || nowMs) : null;
  data.segmentos = [{ inicio, fin }];
  data.pausedDuration = 0;
  data.pausedAt       = data.paused ? (data.pausedAt || nowMs) : null;
}

// ============================================================
//  TIMER
// ============================================================
function iniciarTimer(index) {
  if (timers[index]) clearInterval(timers[index]);
  timers[index] = setInterval(() => {
    const data = pausedTimers[index];
    if (!data || data.finalizado) { clearInterval(timers[index]); return; }
    const elapsedMs = calcularElapsedMs(data, Date.now());
    const timerEl   = document.getElementById(`timer-${index}`);
    if (timerEl) timerEl.textContent = formatTime(Math.floor(elapsedMs / 1000));
  }, 500);
}

// ============================================================
//  STATS BAR
// ============================================================
function actualizarStats() {
  let activos = 0, pausados = 0, finalizados = 0;
  for (let i in pausedTimers) {
    const d = pausedTimers[i];
    if (d.finalizado)   finalizados++;
    else if (d.paused)  pausados++;
    else                activos++;
  }
  const el = id => document.getElementById(id);
  if (el("stat-activos"))     el("stat-activos").textContent     = activos;
  if (el("stat-pausados"))    el("stat-pausados").textContent    = pausados;
  if (el("stat-finalizados")) el("stat-finalizados").textContent = finalizados;
}

// ============================================================
//  BADGE DE PRÓXIMA PAUSA
// ============================================================
function getFutureTime(date, timeStr) {
  const [h, m, s] = timeStr.split(":").map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m, s);
}

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

function renderBadgePausa(index) {
  const data    = pausedTimers[index];
  const badgeEl = document.getElementById(`badge-pausa-${index}`);
  if (!badgeEl || !data || data.finalizado || data.paused) {
    if (badgeEl) badgeEl.style.display = "none";
    return;
  }
  const prox = calcularProximaPausa(data.sacador, new Date());
  if (!prox) { badgeEl.style.display = "none"; return; }
  const diffMs  = prox.time - Date.now();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH   = Math.floor(diffMin / 60);
  const remMin  = diffMin % 60;
  const textoTiempo = diffH > 0 ? `en ${diffH}h ${pad(remMin)}m` : `en ${diffMin}m`;
  const esPronto    = diffMin <= 15;
  badgeEl.textContent = `${prox.label} ${textoTiempo}`;
  badgeEl.className   = `badge-pausa tipo-${prox.tipo}${esPronto ? " tipo-pronto" : ""}`;
  badgeEl.style.display = "inline-flex";
}

function iniciarBadgeTimer(index) {
  setInterval(() => renderBadgePausa(index), 60000);
  renderBadgePausa(index);
}

// ============================================================
//  PAUSA / REANUDACIÓN
// ============================================================
function autoPause(index, tipo = "manual") {
  const data = pausedTimers[index];
  if (!data || data.paused || data.finalizado) return;

  const ahora = Date.now();
  data.paused    = true;
  data.tipoPausa = tipo;

  if (!data.segmentos) _migrarASegmentos(data, ahora);
  const ultimo = data.segmentos[data.segmentos.length - 1];
  if (ultimo && ultimo.fin === null) ultimo.fin = ahora;

  const btn = document.querySelector(`#card-${index} .btn-pause`);
  if (btn) { btn.textContent = "⏸ Pausado"; btn.classList.add("paused"); }
  renderBadgePausa(index);
  guardarPedidos();
  actualizarStats();
}

function autoReanudar(index) {
  const data = pausedTimers[index];
  if (!data || !data.paused || data.finalizado) return;

  const ahora = Date.now();
  if (!data.segmentos) _migrarASegmentos(data, ahora);
  data.segmentos.push({ inicio: ahora, fin: null });
  data.paused    = false;
  data.reanudado = true;

  iniciarTimer(index);
  const btn = document.querySelector(`#card-${index} .btn-pause`);
  if (btn) { btn.textContent = "⏸ Pausar"; btn.classList.remove("paused"); }
  renderBadgePausa(index);
  guardarPedidos();
  actualizarStats();
}

function pausar(index)   { autoPause(index, "manual"); }
function reanudar(index) { autoReanudar(index); }
function pausarTodos()   { for (let i in pausedTimers) autoPause(i, "manual"); }
function reanudarTodos() { for (let i in pausedTimers) autoReanudar(i); }

// ============================================================
//  PROGRAMAR PAUSAS AUTOMÁTICAS
// ============================================================
function addDays(date, d) {
  const nd = new Date(date);
  nd.setDate(date.getDate() + d);
  return nd;
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

function programarPausas(index, sacador, now) {
  const dia = now.getDay();

  if (dia !== 6 && INDIVIDUAL_PAUSES[sacador]) {
    const p1 = getFutureTime(now, INDIVIDUAL_PAUSES[sacador].pausa);
    const r1 = getFutureTime(now, INDIVIDUAL_PAUSES[sacador].reanuda);
    if (p1 > now) setTimeout(() => autoPause(index, "almuerzo"),  p1 - now);
    if (r1 > now) setTimeout(() => autoReanudar(index),           r1 - now);
  }

  if (dia >= 1 && dia <= 4 && BREAKS_10MIN[sacador]) {
    for (const b of BREAKS_10MIN[sacador]) {
      const pBreak = getFutureTime(now, b.hora);
      const rBreak = new Date(pBreak.getTime() + b.durMin * 60 * 1000);
      if (pBreak > now) setTimeout(() => autoPause(index, "break"),  pBreak - now);
      if (rBreak > now) setTimeout(() => autoReanudar(index),        rBreak - now);
    }
  }

  const salidaStr = getSalidaPersonal(sacador, dia);
  if (salidaStr) {
    const pausaSalida = getFutureTime(now, salidaStr);
    const diasHasta   = diasHastaProximoLaborable(now);
    const reanuda     = getFutureTime(addDays(now, diasHasta), HORA_ENTRADA);
    if (pausaSalida > now) setTimeout(() => autoPause(index, "salida"),  pausaSalida - now);
    if (reanuda     > now) setTimeout(() => autoReanudar(index),         reanuda - now);
  }
}

// ============================================================
//  AGREGAR PEDIDO
// ============================================================
function agregarPedido() {
  const codigo   = document.getElementById("codigo").value.trim();
  const sacador  = document.getElementById("sacador").value;
  const cantidad = parseInt(document.getElementById("cantidad").value.trim(), 10);
  const now      = new Date();

  if (!codigo || !sacador || isNaN(cantidad) || cantidad <= 0) {
    mostrarToast("⚠️ Completa todos los campos correctamente.", "warn"); return;
  }

  // Domingo: bloquear salvo que horasextras.js habilite un día especial
  if (now.getDay() === 0) {
    const tieneEspecial = typeof _tieneDiaEspecialHoy === "function" && _tieneDiaEspecialHoy(sacador);
    if (!tieneEspecial) {
      mostrarToast("🚫 Los domingos no se pueden iniciar pedidos.", "error"); return;
    }
  }

  if (esFeriado(now)) {
    mostrarToast("🚫 Hoy es un día feriado no laborable.", "error"); return;
  }

  const nowMs = now.getTime();
  const index = nowMs;

  const pedidoData = {
    index, codigo, sacador, cantidad,
    startTimestamp: nowMs,
    segmentos:      [{ inicio: nowMs, fin: null }],
    paused:         false,
    tipoPausa:      null,
    reanudado:      false,
    finalizado:     false,
    tiempoPorProducto: null,
    elapsedMsFinal: 0,
    tieneEquipo:    false,
    liderId:        sacador,
    auxiliares:     []
  };

  if (cantidad >= UMBRAL_EQUIPO) {
    _pedidoPendiente = pedidoData;
    _abrirModalEquipo(pedidoData);
    return;
  }

  _crearPedidoFinal(pedidoData);
}

let _pedidoPendiente = null;

function _crearPedidoFinal(pedidoData) {
  const index = pedidoData.index;
  pausedTimers[index] = pedidoData;
  crearTarjeta(pedidoData);
  iniciarTimer(index);
  iniciarBadgeTimer(index);
  programarPausas(index, pedidoData.sacador, new Date());
  guardarPedidos();
  actualizarStats();
  aplicarFiltro();

  fetch(API_HOJA_PROCESO, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      NumeroPedido:        pedidoData.codigo,
      Sacador:             pedidoData.sacador,
      CantidadReferencias: pedidoData.cantidad,
      HoraInicio:          formatDateTime(new Date(pedidoData.startTimestamp)),
      Estatus:             pedidoData.tieneEquipo ? "En Proceso - Equipo 👥" : "En Proceso... 📃",
      Equipo:              pedidoData.tieneEquipo
        ? [pedidoData.liderId, ...pedidoData.auxiliares.map(a => typeof a === "string" ? a : a.nombre)].join(", ")
        : pedidoData.sacador
    })
  }).catch(err => console.error("❌ Error al enviar en proceso:", err));

  document.getElementById("codigo").value   = "";
  document.getElementById("sacador").value  = "";
  document.getElementById("cantidad").value = "";
  document.getElementById("codigo").focus();
}

// ============================================================
//  MODAL EQUIPO
// ============================================================
let _equipoAuxContador = 0;

function _abrirModalEquipo(pedidoData) {
  _equipoAuxContador = 0;
  const overlay = document.getElementById("modal-equipo-overlay");

  document.getElementById("equipo-subtitle").textContent =
    `Este pedido tiene ${pedidoData.cantidad} referencias (límite sugerido: ${UMBRAL_EQUIPO}). ` +
    `¿Deseas asignar un equipo? El líder será el sacador seleccionado.`;

  const iniciales = pedidoData.sacador.split(" ").slice(0,2).map(w => w[0]).join("").toUpperCase();
  document.getElementById("equipo-body").innerHTML = `
    <div class="equipo-lider-preview">
      <div class="equipo-lider-avatar">${iniciales}</div>
      <div class="equipo-lider-info">
        <div class="equipo-lider-name">${pedidoData.sacador}</div>
        <div class="equipo-lider-badge">👑 Líder del equipo</div>
      </div>
    </div>
    <div class="equipo-aux-list" id="equipo-aux-list"></div>
    <button class="equipo-btn-add-more" onclick="_agregarFilaAux('${pedidoData.sacador}')">
      + Agregar auxiliar
    </button>
  `;

  document.getElementById("equipo-footer").innerHTML = `
    <div class="equipo-footer-btns">
      <button class="modal-btn secondary" onclick="_rechazarEquipo()">Continuar sin equipo</button>
      <button class="modal-btn team"      onclick="_confirmarEquipo()">👥 Confirmar equipo</button>
    </div>
  `;

  overlay.classList.add("open");
}

function _agregarFilaAux(lider) {
  _equipoAuxContador++;
  const id   = `aux-row-${_equipoAuxContador}`;
  const fila = document.createElement("div");
  fila.className = "equipo-aux-item";
  fila.id = id;

  const opciones = TODOS_LOS_SACADORES
    .filter(s => s !== lider)
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

function _rechazarEquipo() {
  cerrarModalEquipo();
  if (_pedidoPendiente) {
    _pedidoPendiente.tieneEquipo = false;
    _crearPedidoFinal(_pedidoPendiente);
    _pedidoPendiente = null;
  }
}

function _confirmarEquipo() {
  if (!_pedidoPendiente) { cerrarModalEquipo(); return; }

  const selects  = document.querySelectorAll("#equipo-aux-list .equipo-aux-select");
  const auxiliares = [];
  let hayError = false;

  selects.forEach(sel => {
    if (!sel.value) { sel.style.borderColor = "var(--danger)"; hayError = true; }
    else { sel.style.borderColor = ""; if (!auxiliares.includes(sel.value)) auxiliares.push(sel.value); }
  });

  if (hayError) {
    mostrarToast("⚠️ Selecciona un colaborador en cada fila o elimina la fila vacía.", "warn");
    return;
  }

  const startTs = _pedidoPendiente.startTimestamp;
  _pedidoPendiente.tieneEquipo = true;
  _pedidoPendiente.auxiliares  = auxiliares.map(nombre => ({ nombre, joinedAt: startTs }));

  cerrarModalEquipo();
  _crearPedidoFinal(_pedidoPendiente);
  mostrarToast(`👥 Equipo de ${auxiliares.length + 1} personas asignado a #${_pedidoPendiente.codigo}`, "team");
  _pedidoPendiente = null;
}

function cerrarModalEquipo() {
  document.getElementById("modal-equipo-overlay").classList.remove("open");
}

// ============================================================
//  MODAL AUXILIAR
// ============================================================
let _auxTargetIndex = null;

function abrirModalAux(index) {
  _auxTargetIndex = index;
  const data = pausedTimers[index];
  if (!data) return;

  document.getElementById("aux-subtitle").textContent =
    `Pedido #${data.codigo} — ${data.sacador}`;

  const yaAsignados = [
    data.liderId || data.sacador,
    ...(data.auxiliares || []).map(a => typeof a === "string" ? a : a.nombre)
  ];
  const auxSelect = document.getElementById("aux-select");
  auxSelect.innerHTML = '<option value="">-- Selecciona un colaborador --</option>';
  TODOS_LOS_SACADORES
    .filter(s => !yaAsignados.includes(s))
    .forEach(s => {
      const opt = document.createElement("option");
      opt.value = s; opt.textContent = s;
      auxSelect.appendChild(opt);
    });

  const errorEl = document.getElementById("aux-error");
  if (errorEl) errorEl.classList.remove("visible");

  document.getElementById("modal-aux-overlay").classList.add("open");
  setTimeout(() => auxSelect.focus(), 100);
}

function cerrarModalAux() {
  document.getElementById("modal-aux-overlay").classList.remove("open");
  _auxTargetIndex = null;
}

function confirmarAgregarAux() {
  const select   = document.getElementById("aux-select");
  const errorEl  = document.getElementById("aux-error");
  const nuevoAux = select.value;

  if (!nuevoAux) { errorEl.classList.add("visible"); select.focus(); return; }

  const data = pausedTimers[_auxTargetIndex];
  if (!data) { cerrarModalAux(); return; }

  if (!data.auxiliares)  data.auxiliares  = [];
  if (!data.tieneEquipo) data.tieneEquipo = true;
  if (!data.liderId)     data.liderId     = data.sacador;

  const joinedAt = Date.now();
  data.auxiliares.push({ nombre: nuevoAux, joinedAt });

  cerrarModalAux();
  _actualizarSeccionEquipo(_auxTargetIndex);
  guardarPedidos();
  mostrarToast(`👥 ${nuevoAux.split(" ")[0]} se unió al equipo de #${data.codigo} — ${formatearFecha(joinedAt)}`, "team");
}

// ============================================================
//  RENDERIZAR SECCIÓN EQUIPO
// ============================================================
function _actualizarSeccionEquipo(index) {
  const data = pausedTimers[index];
  if (!data) return;
  const card = document.getElementById(`card-${index}`);
  if (!card) return;

  if (data.tieneEquipo && (data.auxiliares || []).length > 0) card.classList.add("en-equipo");

  const lider      = data.liderId || data.sacador;
  const auxiliares = data.auxiliares || [];

  const miembrosHTML = auxiliares.map(a => {
    const nombre = typeof a === "string" ? a : a.nombre;
    const joined = (typeof a === "object" && a.joinedAt)
      ? `<span class="member-joined">Se unió: ${formatearFecha(a.joinedAt)}</span>`
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
        <span class="member-joined">Inicio: ${formatearFecha(data.startTimestamp)}</span>
      </div>
    </div>
    ${miembrosHTML}
    ${!data.finalizado ? `<button class="btn-add-aux" onclick="abrirModalAux(${index})">${btnLabel}</button>` : ""}
  `;

  let teamSection = document.getElementById(`team-section-${index}`);
  if (teamSection) {
    teamSection.innerHTML = innerHTML;
  } else {
    teamSection = document.createElement("div");
    teamSection.className = "task-team";
    teamSection.id = `team-section-${index}`;
    teamSection.innerHTML = innerHTML;
    const timesEl = document.getElementById(`times-wrap-${index}`);
    if (timesEl) card.insertBefore(teamSection, timesEl);
    else {
      const metaEl = card.querySelector(".task-meta");
      if (metaEl && metaEl.nextSibling) card.insertBefore(teamSection, metaEl.nextSibling);
      else card.appendChild(teamSection);
    }
  }
}

// ============================================================
//  CREAR TARJETA
// ============================================================
function crearTarjeta(pedido) {
  const { index, codigo, sacador, cantidad, startTimestamp, tieneEquipo } = pedido;

  const task = document.createElement("div");
  task.className = "task";
  task.id = `card-${index}`;
  task.dataset.codigo  = codigo.toLowerCase();
  task.dataset.sacador = sacador.toLowerCase();

  if (tieneEquipo && (pedido.auxiliares || []).length > 0) task.classList.add("en-equipo");

  task.innerHTML = `
    <div class="task-header">
      <div class="task-code">#${codigo}</div>
      <button class="btn-delete" onclick="eliminar(${index})" title="Eliminar">✕</button>
    </div>
    <div class="task-sacador">${sacador}</div>
    <div class="task-meta">
      <span class="meta-item">📦 <strong>${cantidad}</strong> productos</span>
      <span class="badge-pausa" id="badge-pausa-${index}" style="display:none;"></span>
    </div>
    <div id="times-wrap-${index}" class="task-times">
      <div class="time-row">
        <span class="time-label">Inicio</span>
        <span class="time-value" id="start-${index}">${formatearFecha(startTimestamp)}</span>
      </div>
      <div class="time-row">
        <span class="time-label">Fin</span>
        <span class="time-value" id="end-${index}">—</span>
      </div>
    </div>
    <div class="task-timer" id="timer-${index}">00:00:00</div>
    <div class="task-tpp" id="tpp-wrap-${index}" style="display:none;">
      ⏱ <span id="tpp-${index}">--</span> por producto
    </div>
    <div class="task-actions">
      <button class="btn-action btn-pause"  onclick="pausar(${index})">⏸ Pausar</button>
      <button class="btn-action btn-resume" onclick="reanudar(${index})">▶ Reanudar</button>
      <button class="btn-action btn-finish" onclick="abrirModalFinalizar(${index})">✔ Finalizar</button>
    </div>
  `;

  taskList.appendChild(task);

  if (tieneEquipo || (pedido.auxiliares && pedido.auxiliares.length > 0)) {
    _actualizarSeccionEquipo(index);
  } else if (!pedido.finalizado) {
    _agregarBtnAuxSuelto(index);
  }
}

function _agregarBtnAuxSuelto(index) {
  const data = pausedTimers[index];
  if (!data || data.finalizado) return;
  const card = document.getElementById(`card-${index}`);
  if (!card || card.querySelector(".btn-add-aux")) return;

  const btn = document.createElement("button");
  btn.className   = "btn-add-aux";
  btn.textContent = "+ Agregar auxiliar";
  btn.onclick     = () => abrirModalAux(index);

  const actionsEl = card.querySelector(".task-actions");
  if (actionsEl) card.insertBefore(btn, actionsEl);
}

// ============================================================
//  MODAL FINALIZAR
// ============================================================
let modalIndex      = null;
let modalStep       = 1;
let modalRespuestas = {};

function abrirModalFinalizar(index) {
  modalIndex      = index;
  modalStep       = 1;
  modalRespuestas = {};
  document.getElementById("modal-overlay").classList.add("open");
  renderModalStep(1);
  setTimeout(() => { const i = document.getElementById("modal-input"); if (i) i.focus(); }, 100);
}

function cerrarModal() {
  document.getElementById("modal-overlay").classList.remove("open");
  modalIndex = null;
}

function renderModalStep(step) {
  const data = pausedTimers[modalIndex];
  const titles   = ["","¿Cuántos productos se sacaron?","¿Cuántos bultos se realizaron?","¿Cuál es el monto total del pedido?","Resumen del pedido"];
  const subtitles = ["",`Esperado: ${data.cantidad} producto${data.cantidad > 1 ? "s" : ""}`,
    "Cantidad de bultos completados","Monto en RD$","Confirma los datos antes de guardar"];

  document.getElementById("modal-title").textContent    = titles[step];
  document.getElementById("modal-subtitle").textContent = subtitles[step];

  document.querySelectorAll("#modal .modal-step-dot").forEach((dot, i) => {
    dot.classList.remove("active", "done");
    if (i + 1 < step)        dot.classList.add("done");
    else if (i + 1 === step) dot.classList.add("active");
  });

  const body   = document.getElementById("modal-body");
  const footer = document.getElementById("modal-footer");
  body.innerHTML = "";

  if (step < 4) {
    const tipos = ["","number","number","number"];
    const hints = ["",`Máximo: ${data.cantidad}`,"Solo números enteros positivos","Ejemplo: 1500.00"];

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
    if (input) input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); modalSiguiente(); } });

  } else {
    const now        = new Date();
    const elapsedMs  = calcularElapsedMs(data, now.getTime());
    const elapsedSeg = Math.floor(elapsedMs / 1000);
    const cantSacada = modalRespuestas.cantidad;
    const porcentaje = Math.round((cantSacada / data.cantidad) * 100);
    const tpp        = cantSacada > 0 ? formatTime(Math.floor(elapsedSeg / cantSacada)) : "—";

    const equipoRow = data.tieneEquipo && data.auxiliares && data.auxiliares.length > 0
      ? `<div class="summary-row">
           <span class="summary-key">Equipo</span>
           <span class="summary-val" style="color:var(--team);font-size:12px;">
             ${[data.liderId || data.sacador, ...data.auxiliares.map(a => typeof a === "string" ? a : a.nombre)].join(", ")}
           </span>
         </div>` : "";

    body.innerHTML = `
      <div class="modal-summary">
        <div class="summary-row"><span class="summary-key">Pedido</span><span class="summary-val highlight">#${data.codigo}</span></div>
        <div class="summary-row"><span class="summary-key">Sacador</span><span class="summary-val">${data.sacador.split(" ").slice(0,2).join(" ")}</span></div>
        ${equipoRow}
        <div class="summary-row"><span class="summary-key">Productos sacados</span><span class="summary-val">${cantSacada} / ${data.cantidad} (${porcentaje}%)</span></div>
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
  const input    = document.getElementById("modal-input");
  const errorEl  = document.getElementById("modal-error");
  const data     = pausedTimers[modalIndex];
  const val      = parseFloat(input.value);
  let valido = true, mensajeError = "Valor inválido, intenta de nuevo.";

  if (modalStep === 1) {
    if (isNaN(val) || val < 0 || val > data.cantidad || !Number.isInteger(val)) {
      valido = false; mensajeError = `Ingresa un número entre 0 y ${data.cantidad}.`;
    } else { modalRespuestas.cantidad = val; }
  } else if (modalStep === 2) {
    if (isNaN(val) || val < 0 || !Number.isInteger(val)) {
      valido = false; mensajeError = "Ingresa un número entero positivo.";
    } else { modalRespuestas.bultos = val; }
  } else if (modalStep === 3) {
    if (isNaN(val) || val < 0) {
      valido = false; mensajeError = "Ingresa un monto válido mayor o igual a 0.";
    } else { modalRespuestas.monto = val; }
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
  setTimeout(() => { const ni = document.getElementById("modal-input"); if (ni) ni.focus(); }, 80);
}

function modalAnterior() {
  if (modalStep > 1) {
    modalStep--;
    renderModalStep(modalStep);
    setTimeout(() => { const ni = document.getElementById("modal-input"); if (ni) ni.focus(); }, 80);
  }
}

function confirmarFinalizar() {
  const now  = new Date();
  const data = pausedTimers[modalIndex];
  if (!data) return;

  cerrarModal();

  if (!data.paused) {
    if (!data.segmentos) _migrarASegmentos(data, now.getTime());
    const ultimo = data.segmentos[data.segmentos.length - 1];
    if (ultimo && ultimo.fin === null) ultimo.fin = now.getTime();
  }

  const elapsedMs         = calcularElapsedMs(data, now.getTime());
  const elapsedSeg        = Math.floor(elapsedMs / 1000);
  const cantidadSacada    = modalRespuestas.cantidad;
  const bultos            = modalRespuestas.bultos;
  const montoTotal        = parseFloat(modalRespuestas.monto);
  const porcentaje        = Math.round((cantidadSacada / data.cantidad) * 100);

  let tiempoPorProductoSeg = 0;
  let tiempoFormateado     = "00:00:00";
  if (cantidadSacada > 0) {
    tiempoPorProductoSeg = elapsedSeg / cantidadSacada;
    tiempoFormateado     = formatTime(Math.floor(tiempoPorProductoSeg));
  }

  data.finalizado        = true;
  data.endTimestamp      = now.getTime();
  data.tiempoPorProducto = tiempoFormateado;
  data.elapsedMsFinal    = elapsedMs;

  clearInterval(timers[modalIndex]);
  delete timers[modalIndex];

  const index = modalIndex;
  const card  = document.getElementById(`card-${index}`);
  if (card) card.classList.add("finalizado");

  const endEl   = document.getElementById(`end-${index}`);
  if (endEl)    endEl.textContent = formatearFecha(now.getTime());
  const timerEl = document.getElementById(`timer-${index}`);
  if (timerEl)  timerEl.textContent = formatTime(elapsedSeg);
  const tppWrap = document.getElementById(`tpp-wrap-${index}`);
  const tppEl   = document.getElementById(`tpp-${index}`);
  const badgeEl = document.getElementById(`badge-pausa-${index}`);
  if (tppWrap) tppWrap.style.display = "block";
  if (tppEl)   tppEl.textContent = tiempoFormateado;
  if (badgeEl) badgeEl.style.display = "none";

  const teamSection  = document.getElementById(`team-section-${index}`);
  if (teamSection) { const b = teamSection.querySelector(".btn-add-aux"); if (b) b.remove(); }
  const btnAuxSuelto = card ? card.querySelector(".btn-add-aux") : null;
  if (btnAuxSuelto) btnAuxSuelto.remove();

  guardarPedidos();
  actualizarStats();

  const auxList        = data.auxiliares || [];
  const endTs          = data.endTimestamp;
  const equipoCompleto = data.tieneEquipo && auxList.length > 0
    ? [data.liderId || data.sacador, ...auxList.map(a => typeof a === "string" ? a : a.nombre)].join(", ")
    : data.sacador;

  const auxDetalles = auxList.map(a => {
    const nombre   = typeof a === "string" ? a : a.nombre;
    const joinedAt = (typeof a === "object" && a.joinedAt) ? a.joinedAt : data.startTimestamp;
    const tiempoAuxSeg = calcularSegLaborables(nombre, joinedAt, endTs);
    const tppAux = cantidadSacada > 0
      ? formatTime(Math.floor(tiempoAuxSeg / cantidadSacada))
      : "00:00:00";
    return { nombre, joinedAt, tiempoAuxSeg, tppAux };
  });

  const equipoStr = data.tieneEquipo && auxList.length > 0
    ? ` | Equipo: ${auxList.length + 1} personas` : "";
  mostrarToast(
    `✅ ${data.sacador.split(" ")[0]} — ${porcentaje}% | ${tiempoFormateado}/prod | ${bultos} bultos | RD$ ${montoTotal.toFixed(2)}${equipoStr}`,
    "success"
  );

  fetch(API_HOJA_HISTORIAL, {
    method: "POST", mode: "cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      "Codigo P":                  data.codigo,
      "Sacador":                   data.sacador,
      "Rol":                       "Lider",
      "Equipo":                    equipoCompleto,
      "CantidadProductos ":        data.cantidad,
      "HoraInicio ":               formatDateTime(new Date(data.startTimestamp)),
      "HoraFin ":                  formatDateTime(new Date(endTs)),
      "TiempoTotal ":              formatTime(elapsedSeg),
      "TiempoPorProductoSegundos": tiempoPorProductoSeg.toFixed(2),
      "TiempoPorProducto":         tiempoFormateado,
      "Bultos":                    bultos,
      "MontoFinal":                montoTotal.toFixed(2)
    })
  }).catch(err => console.error("❌ Error historial (líder):", err));

  auxDetalles.forEach(aux => {
    fetch(API_HOJA_HISTORIAL, {
      method: "POST", mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "Codigo P":                  data.codigo,
        "Sacador":                   aux.nombre,
        "Rol":                       "Auxiliar",
        "Equipo":                    equipoCompleto,
        "CantidadProductos ":        data.cantidad,
        "HoraInicio ":               formatDateTime(new Date(aux.joinedAt)),
        "HoraFin ":                  formatDateTime(new Date(endTs)),
        "TiempoTotal ":              formatTime(aux.tiempoAuxSeg),
        "TiempoPorProductoSegundos": cantidadSacada > 0
          ? (aux.tiempoAuxSeg / cantidadSacada).toFixed(2) : "0.00",
        "TiempoPorProducto":         aux.tppAux,
        "Bultos":                    bultos,
        "MontoFinal":                montoTotal.toFixed(2)
      })
    }).catch(err => console.error(`❌ Error historial (aux ${aux.nombre}):`, err));
  });

  fetch(`${API_HOJA_PROCESO}/search?NumeroPedido=${encodeURIComponent(data.codigo)}`, {
    method: "PATCH", mode: "cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      CantidadProductos: data.cantidad,
      Equipo:            equipoCompleto,
      HoraFin:           formatDateTime(new Date(endTs)),
      Estatus:           "Finalizado"
    })
  }).catch(err => console.error("❌ Error actualizar proceso:", err));
}

// ============================================================
//  FILTRO
// ============================================================
function aplicarFiltro() {
  const textoBusqueda = (document.getElementById("filtro-texto")?.value || "").toLowerCase().trim();
  const sacadorFiltro = (document.getElementById("filtro-sacador")?.value || "").toLowerCase();
  let visibles = 0;
  const total  = Object.keys(pausedTimers).length;

  document.querySelectorAll(".task").forEach(card => {
    const matchCodigo  = card.dataset.codigo?.includes(textoBusqueda) ?? true;
    const matchSacador = sacadorFiltro ? card.dataset.sacador?.includes(sacadorFiltro) : true;
    const visible = matchCodigo && matchSacador;
    card.style.display = visible ? "" : "none";
    if (visible) visibles++;
  });

  const countEl = document.getElementById("filter-count");
  if (countEl) {
    countEl.textContent = textoBusqueda || sacadorFiltro
      ? `${visibles} de ${total}` : `${total} pedidos`;
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
//  ELIMINAR
// ============================================================
function eliminar(index) {
  clearInterval(timers[index]);
  delete timers[index];
  delete pausedTimers[index];
  const card = document.getElementById(`card-${index}`);
  if (card) {
    card.style.animation = "fadeOut 0.3s ease forwards";
    setTimeout(() => { card.remove(); aplicarFiltro(); }, 300);
  }
  guardarPedidos();
  actualizarStats();
}

function eliminarTodos() {
  if (!confirm("¿Eliminar todos los pedidos? Esta acción no se puede deshacer.")) return;
  for (let index in pausedTimers) {
    clearInterval(timers[index]);
    const card = document.getElementById(`card-${index}`);
    if (card) card.remove();
  }
  pausedTimers = {};
  timers       = {};
  guardarPedidos();
  actualizarStats();
  aplicarFiltro();
}

// ============================================================
//  PERSISTENCIA
// ============================================================
function guardarPedidos() {
  localStorage.setItem("pedidos", JSON.stringify(pausedTimers));
}

function reconstruirPedido(pedido) {
  const index = pedido.index;

  if (!pedido.segmentos || pedido.segmentos.length === 0) {
    const ahora = Date.now();

    if (pedido.finalizado) {
      pedido.segmentos = [{
        inicio: pedido.startTimestamp || ahora,
        fin:    pedido.endTimestamp   || ahora
      }];
    } else if (pedido.paused) {
      const inicioReal = pedido.startTimestamp || ahora;
      const finReal    = pedido.pausedAt       || pedido.savedAt || ahora;
      pedido.segmentos = [{ inicio: inicioReal, fin: finReal }];
    } else {
      const inicioReal = pedido.startTimestamp || ahora;
      const savedAt    = pedido.savedAt        || ahora;
      pedido.segmentos = [
        { inicio: inicioReal, fin: savedAt },
        { inicio: savedAt,    fin: null    }
      ];
    }

    delete pedido.elapsedSnapshot;
    delete pedido.savedAt;
    delete pedido.pausedDuration;
  }

  if (!pedido.auxiliares)  pedido.auxiliares  = [];
  if (!pedido.liderId)     pedido.liderId     = pedido.sacador;
  if (pedido.tieneEquipo === undefined) pedido.tieneEquipo = false;

  pedido.auxiliares = pedido.auxiliares.map(a =>
    typeof a === "string" ? { nombre: a, joinedAt: pedido.startTimestamp } : a
  );

  pausedTimers[index] = pedido;
  crearTarjeta(pedido);

  if (pedido.finalizado) {
    const card    = document.getElementById(`card-${index}`);
    const tppWrap = document.getElementById(`tpp-wrap-${index}`);
    const tppEl   = document.getElementById(`tpp-${index}`);
    const timerEl = document.getElementById(`timer-${index}`);
    const endEl   = document.getElementById(`end-${index}`);
    if (card)    card.classList.add("finalizado");
    if (tppWrap) tppWrap.style.display = "block";
    if (tppEl && pedido.tiempoPorProducto) tppEl.textContent = pedido.tiempoPorProducto;
    if (timerEl) timerEl.textContent = formatTime(Math.floor((pedido.elapsedMsFinal || 0) / 1000));
    if (endEl && pedido.endTimestamp)  endEl.textContent = formatearFecha(pedido.endTimestamp);
  } else {
    iniciarTimer(index);
    iniciarBadgeTimer(index);
    programarPausas(index, pedido.sacador, new Date());
    if (pedido.paused) {
      const btn = document.querySelector(`#card-${index} .btn-pause`);
      if (btn) { btn.textContent = "⏸ Pausado"; btn.classList.add("paused"); }
    }
  }
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
//  VERIFICAR MES
// ============================================================
function verificarMesActual() {
  const now       = new Date();
  const mesActual = now.getMonth();
  const saved     = parseInt(localStorage.getItem("mes_actual_guardado"), 10);
  if (isNaN(saved) || saved !== mesActual) {
    localStorage.setItem(`sacadores_${now.getFullYear()}_${mesActual}`, "{}");
    localStorage.setItem("mes_actual_guardado", mesActual);
  }
}

// ============================================================
//  INICIALIZACIÓN
// ============================================================
window.onload = () => {
  precargarFeriadosRD();
  verificarMesActual();
  const saved = JSON.parse(localStorage.getItem("pedidos")) || {};
  Object.values(saved).forEach(pedido => reconstruirPedido(pedido));
  actualizarStats();
  aplicarFiltro();
};
