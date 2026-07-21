// ============================================================
//  MÓDULO: HORAS EXTRAS & DÍAS ESPECIALES
//  Complemento para script.js — Gestión de Pedidos
//  Grupo Michel / Super Juguetería Michel
// ============================================================

// ── Clave de almacenamiento ──────────────────────────────────
const KEY_HORAS_EXTRAS = "gm_horas_extras_config";

/**
 * Estructura guardada en localStorage:
 * {
 *   reglas: [
 *     {
 *       id:        "timestamp único",
 *       tipo:      "dia_especial" | "extension",
 *       fecha:     "YYYY-MM-DD",          // día concreto
 *       sacadores: ["todos"] | ["Nombre1","Nombre2"],
 *       horaEntrada: "HH:MM:SS",          // solo en dia_especial
 *       horaSalida:  "HH:MM:SS",
 *       nota:      "texto libre",
 *       activa:    true | false
 *     }
 *   ]
 * }
 */

function cargarReglasExtras() {
  try {
    const raw = localStorage.getItem(KEY_HORAS_EXTRAS);
    return raw ? JSON.parse(raw) : { reglas: [] };
  } catch { return { reglas: [] }; }
}

function guardarReglasExtras(cfg) {
  localStorage.setItem(KEY_HORAS_EXTRAS, JSON.stringify(cfg));
}

// ── Aplicar reglas al cálculo de tiempo ─────────────────────

/**
 * Devuelve los rangos laborables del día considerando
 * las reglas de horas extras registradas.
 * Se llama ANTES del cálculo normal para parchear o extender.
 */
function getRangosConExtras(fecha, sacador, rangosBase) {
  const cfg = cargarReglasExtras();
  if (!cfg.reglas || cfg.reglas.length === 0) return rangosBase;

  const fechaKey = `${fecha.getFullYear()}-${pad(fecha.getMonth()+1)}-${pad(fecha.getDate())}`;
  const dia      = fecha.getDay(); // 0=Dom

  let rangos = [...rangosBase];

  for (const regla of cfg.reglas) {
    if (!regla.activa) continue;
    if (regla.fecha !== fechaKey) continue;

    const aplica =
      regla.sacadores.includes("todos") ||
      regla.sacadores.includes(sacador);
    if (!aplica) continue;

    const entrada = hhmmssASeg(regla.horaEntrada || HORA_ENTRADA);
    const salida  = hhmmssASeg(regla.horaSalida);

    if (regla.tipo === "dia_especial") {
      // Reemplaza completamente el día (ej: domingo habilitado)
      rangos = [[entrada, salida]];
    } else if (regla.tipo === "extension") {
      // Extiende la salida del último rango existente
      if (rangos.length > 0) {
        const ultimo = rangos[rangos.length - 1];
        if (salida > ultimo[1]) {
          rangos[rangos.length - 1] = [ultimo[0], salida];
        }
      } else {
        // Si no había rangos (ej: se está extendiendo en un día sin horario)
        rangos = [[entrada, salida]];
      }
    }
  }

  return rangos;
}

// Esperamos a que el DOM cargue para parchear,
// así script.js ya definió su versión primero.


// También parchear esMomentoLaborable para que los domingos
// con día especial se consideren laborables.
const _esMomentoLaborableOriginal = typeof esMomentoLaborable === "function"
  ? esMomentoLaborable
  : null;

function esMomentoLaborable(sacador, tsMs) {
  const d   = new Date(tsMs);
  const seg = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
  return getRangosLaboralesDia(d, sacador).some(([a, b]) => seg >= a && seg < b);
}

// ── Bloqueo de domingo sin día especial ─────────────────────
// Sobrescribimos agregarPedido para permitir domingos si hay regla activa.
// (El original ya bloquea domingos; este wrapper lo relaja cuando procede.)
const _agregarPedidoOriginal = typeof agregarPedido === "function"
  ? agregarPedido
  : null;

function _tieneDiaEspecialHoy(sacador) {
  const now     = new Date();
  const fechaKey = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  const cfg     = cargarReglasExtras();
  return (cfg.reglas || []).some(r =>
    r.activa &&
    r.fecha === fechaKey &&
    r.tipo === "dia_especial" &&
    (r.sacadores.includes("todos") || r.sacadores.includes(sacador))
  );
}

// Reasignamos agregarPedido SÓLO para quitar el bloqueo de domingo
// cuando hay un día especial configurado.
// NOTA: el resto de la validación permanece intacta en script.js.
window._agregarPedidoConExtras = function() {
  const sacador = document.getElementById("sacador")?.value || "";
  const now     = new Date();

  if (now.getDay() === 0 && !_tieneDiaEspecialHoy(sacador)) {
    mostrarToast("🚫 Los domingos no se pueden iniciar pedidos. Configura un Día Especial primero.", "error");
    return;
  }
  // Delegar al flujo normal (omitiendo la validación de domingo original)
  // Usamos una copia que no tiene el bloqueo de domingo.
  _ejecutarAgregarPedidoSinBloqueoDomingo();
};

function _ejecutarAgregarPedidoSinBloqueoDomingo() {
  const codigo   = document.getElementById("codigo").value.trim();
  const sacador  = document.getElementById("sacador").value;
  const cantidad = parseInt(document.getElementById("cantidad").value.trim(), 10);
  const now      = new Date();

  if (!codigo || !sacador || isNaN(cantidad) || cantidad <= 0) {
    mostrarToast("⚠️ Completa todos los campos correctamente.", "warn"); return;
  }
  if (esFeriado(now)) {
    mostrarToast("🚫 Hoy es un día feriado no laborable.", "error"); return;
  }
  // (resto idéntico al agregarPedido original — sin el bloqueo de domingo)
  const nowMs = now.getTime();
  const index = nowMs;
  const pedidoData = {
    index, codigo, sacador, cantidad,
    startTimestamp: nowMs,
    segmentos:      [{ inicio: nowMs, fin: null }],
    paused: false, tipoPausa: null, reanudado: false, finalizado: false,
    tiempoPorProducto: null, elapsedMsFinal: 0,
    tieneEquipo: false, liderId: sacador, auxiliares: []
  };
  if (cantidad >= UMBRAL_EQUIPO) {
    _pedidoPendiente = pedidoData;
    _abrirModalEquipo(pedidoData);
    return;
  }
  _crearPedidoFinal(pedidoData);
}

// ============================================================
//  PANEL DE HORAS EXTRAS — UI
// ============================================================

function abrirPanelHorasExtras() {
  let overlay = document.getElementById("modal-extras-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "modal-extras-overlay";
    overlay.className = "modal-overlay";
    overlay.onclick = e => { if (e.target === overlay) cerrarPanelHorasExtras(); };
    overlay.innerHTML = `
      <div class="modal modal-extras" id="modal-extras">
        <div class="modal-header" style="border-bottom:1px solid var(--border);padding-bottom:16px;margin-bottom:0;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div class="modal-title" style="display:flex;align-items:center;gap:8px;">
                <span class="extras-icon-badge">⏱</span> Horas Extras & Días Especiales
              </div>
              <div class="modal-subtitle" style="margin-top:4px;">
                Configura domingos laborables y extensiones de horario por sacador o para todo el equipo.
              </div>
            </div>
            <button class="btn-delete" onclick="cerrarPanelHorasExtras()" title="Cerrar" style="font-size:18px;">✕</button>
          </div>
          <!-- Tabs -->
          <div class="extras-tabs" style="margin-top:16px;">
            <button class="extras-tab active" data-tab="lista" onclick="switchExtrasTab('lista')">📋 Reglas activas</button>
            <button class="extras-tab"        data-tab="nueva" onclick="switchExtrasTab('nueva')">＋ Nueva regla</button>
          </div>
        </div>

        <!-- Tab: Lista -->
        <div class="extras-tab-content" id="extras-tab-lista">
          <div id="extras-lista-body"></div>
        </div>

        <!-- Tab: Nueva regla -->
        <div class="extras-tab-content" id="extras-tab-nueva" style="display:none;">
          <div id="extras-form-body"></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }
  overlay.classList.add("open");
  _renderExtrasLista();
  _renderExtrasForm();
  _inyectarEstilosExtras();
}

function cerrarPanelHorasExtras() {
  document.getElementById("modal-extras-overlay")?.classList.remove("open");
}

function switchExtrasTab(tab) {
  document.querySelectorAll(".extras-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  document.getElementById("extras-tab-lista").style.display = tab === "lista" ? "" : "none";
  document.getElementById("extras-tab-nueva").style.display = tab === "nueva" ? "" : "none";
}

// ── Renderizar lista de reglas ───────────────────────────────
function _renderExtrasLista() {
  const body = document.getElementById("extras-lista-body");
  if (!body) return;
  const cfg    = cargarReglasExtras();
  const reglas = cfg.reglas || [];

  if (reglas.length === 0) {
    body.innerHTML = `
      <div style="text-align:center;padding:40px 20px;color:var(--text-muted);">
        <div style="font-size:36px;opacity:.3;margin-bottom:12px;">📭</div>
        <div style="font-size:13px;">No hay reglas configuradas.</div>
        <div style="font-size:12px;margin-top:4px;">Usa la pestaña <strong style="color:var(--accent)">+ Nueva regla</strong> para agregar.</div>
      </div>`;
    return;
  }

  const hoy = new Date();
  const hoyKey = `${hoy.getFullYear()}-${pad(hoy.getMonth()+1)}-${pad(hoy.getDate())}`;

  body.innerHTML = reglas.map((r, i) => {
    const isPast    = r.fecha < hoyKey;
    const isToday   = r.fecha === hoyKey;
    const isFuture  = r.fecha > hoyKey;
    const label     = r.tipo === "dia_especial" ? "Día especial" : "Extensión horario";
    const icon      = r.tipo === "dia_especial" ? "📅" : "🕐";
    const colorTipo = r.tipo === "dia_especial" ? "var(--team)" : "var(--warn)";

    const sacLabel  = r.sacadores.includes("todos")
      ? "Todos los sacadores"
      : r.sacadores.join(", ");

    const horario = r.tipo === "dia_especial"
      ? `${r.horaEntrada || "08:00:00"} → ${r.horaSalida}`
      : `Hasta las ${r.horaSalida}`;

    const d = new Date(r.fecha + "T12:00:00");
    const fechaLabel = d.toLocaleDateString("es-DO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    const estadoBadge = isPast
      ? `<span class="extras-badge pasado">Pasado</span>`
      : isToday
        ? `<span class="extras-badge hoy">Hoy</span>`
        : `<span class="extras-badge futuro">Próximo</span>`;

    return `
      <div class="extras-rule-card ${!r.activa ? "inactiva" : ""} ${isToday ? "hoy" : ""}">
        <div class="extras-rule-top">
          <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
            <span style="font-size:18px;">${icon}</span>
            <div style="min-width:0;">
              <div style="font-size:13px;font-weight:700;color:${colorTipo};">${label}</div>
              <div style="font-size:11px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${fechaLabel}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
            ${estadoBadge}
            <label class="extras-toggle" title="${r.activa ? "Desactivar" : "Activar"}">
              <input type="checkbox" ${r.activa ? "checked" : ""} onchange="toggleReglaExtra('${r.id}', this.checked)" />
              <span class="extras-toggle-track"></span>
            </label>
            <button class="btn-delete" onclick="eliminarReglaExtra('${r.id}')" title="Eliminar regla">✕</button>
          </div>
        </div>
        <div class="extras-rule-details">
          <span class="extras-detail-pill">🕐 ${horario}</span>
          <span class="extras-detail-pill">👥 ${sacLabel.length > 40 ? sacLabel.slice(0,37)+"…" : sacLabel}</span>
          ${r.nota ? `<span class="extras-detail-pill">📝 ${r.nota}</span>` : ""}
        </div>
      </div>`;
  }).join("");
}

// ── Renderizar formulario nueva regla ────────────────────────
function _renderExtrasForm() {
  const body = document.getElementById("extras-form-body");
  if (!body) return;

  const hoy      = new Date();
  const hoyStr   = `${hoy.getFullYear()}-${pad(hoy.getMonth()+1)}-${pad(hoy.getDate())}`;
  const sacOpts  = TODOS_LOS_SACADORES.map(s =>
    `<option value="${s}">${s}</option>`
  ).join("");

  body.innerHTML = `
    <div class="extras-form">
      <!-- Tipo de regla -->
      <div class="extras-form-group">
        <label class="extras-label">Tipo de configuración</label>
        <div class="extras-tipo-grid">
          <label class="extras-tipo-card selected" data-tipo="dia_especial">
            <input type="radio" name="extras-tipo" value="dia_especial" checked onchange="onExtrastipoChange(this.value)" />
            <span class="extras-tipo-icon">📅</span>
            <span class="extras-tipo-title">Día especial</span>
            <span class="extras-tipo-desc">Habilita un día no laborable (ej: domingo) con horario propio</span>
          </label>
          <label class="extras-tipo-card" data-tipo="extension">
            <input type="radio" name="extras-tipo" value="extension" onchange="onExtrastipoChange(this.value)" />
            <span class="extras-tipo-icon">🕐</span>
            <span class="extras-tipo-title">Extensión de horario</span>
            <span class="extras-tipo-desc">Amplía la hora de salida en un día ya laborable</span>
          </label>
        </div>
      </div>

      <!-- Fecha -->
      <div class="extras-form-group">
        <label class="extras-label">Fecha</label>
        <input type="date" id="extras-fecha" value="${hoyStr}"
               style="width:100%;background:var(--bg);border:1px solid var(--border-light);color:var(--text-primary);
                      font-family:var(--font-ui);font-size:13px;padding:10px 14px;border-radius:6px;min-width:unset;" />
        <div id="extras-fecha-hint" class="extras-hint" style="margin-top:6px;"></div>
      </div>

      <!-- Horario -->
      <div class="extras-form-group">
        <label class="extras-label">Horario de trabajo</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div id="extras-entrada-wrap">
            <div style="font-size:11px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">Hora de entrada</div>
            <input type="time" id="extras-entrada" value="08:00" step="600"
                   style="width:100%;background:var(--bg);border:1px solid var(--border-light);color:var(--text-primary);
                          font-family:var(--font-mono);font-size:16px;padding:10px 12px;border-radius:6px;min-width:unset;" />
          </div>
          <div>
            <div style="font-size:11px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">Hora de salida</div>
            <input type="time" id="extras-salida" value="18:00" step="600"
                   style="width:100%;background:var(--bg);border:1px solid var(--border-light);color:var(--text-primary);
                          font-family:var(--font-mono);font-size:16px;padding:10px 12px;border-radius:6px;min-width:unset;" />
          </div>
        </div>
        <div id="extras-duracion-preview" class="extras-preview-pill" style="margin-top:10px;"></div>
      </div>

      <!-- Sacadores -->
      <div class="extras-form-group">
        <label class="extras-label">Aplica a</label>
        <div style="display:flex;gap:10px;margin-bottom:10px;">
          <label class="extras-radio-opt active" id="extras-scope-todos-label">
            <input type="radio" name="extras-scope" value="todos" checked onchange="onExtrasScopeChange(this.value)" />
            👥 Todos los sacadores
          </label>
          <label class="extras-radio-opt" id="extras-scope-individual-label">
            <input type="radio" name="extras-scope" value="individual" onchange="onExtrasScopeChange(this.value)" />
            👤 Sacadores específicos
          </label>
        </div>
        <div id="extras-sacadores-multi" style="display:none;">
          <select id="extras-sacadores-select" multiple size="5"
                  style="width:100%;background:var(--bg);border:1px solid var(--border-light);
                         color:var(--text-primary);font-family:var(--font-ui);font-size:12px;
                         padding:6px;border-radius:6px;min-width:unset;">
            ${sacOpts}
          </select>
          <div class="extras-hint" style="margin-top:4px;">Mantén Ctrl (o Cmd en Mac) para seleccionar varios.</div>
        </div>
      </div>

      <!-- Nota -->
      <div class="extras-form-group">
        <label class="extras-label">Nota (opcional)</label>
        <input type="text" id="extras-nota" placeholder="Ej: Inventario fin de año, cierre de campaña…"
               maxlength="80"
               style="width:100%;background:var(--bg);border:1px solid var(--border-light);color:var(--text-primary);
                      font-family:var(--font-ui);font-size:13px;padding:10px 14px;border-radius:6px;min-width:unset;" />
      </div>

      <!-- Error -->
      <p id="extras-form-error" class="modal-hint error-msg" style="margin-top:4px;"></p>

      <!-- Acciones -->
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">
        <button class="modal-btn secondary" onclick="switchExtrasTab('lista')">Cancelar</button>
        <button class="modal-btn primary"   onclick="guardarNuevaReglaExtra()">✔ Guardar regla</button>
      </div>
    </div>
  `;

  // Preview de duración en tiempo real
  ["extras-entrada","extras-salida"].forEach(id => {
    document.getElementById(id).addEventListener("change", _actualizarDuracionPreview);
  });
  document.getElementById("extras-fecha").addEventListener("change", _actualizarFechaHint);
  _actualizarDuracionPreview();
  _actualizarFechaHint();
}

function onExtrastipoChange(tipo) {
  document.querySelectorAll(".extras-tipo-card").forEach(card => {
    card.classList.toggle("selected", card.dataset.tipo === tipo);
  });
  const esEspecial = tipo === "dia_especial";
  const entradaWrap = document.getElementById("extras-entrada-wrap");
  if (entradaWrap) entradaWrap.style.opacity = esEspecial ? "1" : "0.4";
  if (entradaWrap) entradaWrap.style.pointerEvents = esEspecial ? "" : "none";
  _actualizarFechaHint();
}

function onExtrasScopeChange(scope) {
  document.querySelectorAll(".extras-radio-opt").forEach(el => el.classList.remove("active"));
  const lbl = scope === "todos"
    ? document.getElementById("extras-scope-todos-label")
    : document.getElementById("extras-scope-individual-label");
  if (lbl) lbl.classList.add("active");
  const multi = document.getElementById("extras-sacadores-multi");
  if (multi) multi.style.display = scope === "individual" ? "" : "none";
}

function _actualizarDuracionPreview() {
  const entrada = document.getElementById("extras-entrada")?.value;
  const salida  = document.getElementById("extras-salida")?.value;
  const el      = document.getElementById("extras-duracion-preview");
  if (!el || !entrada || !salida) return;

  const [eh,em] = entrada.split(":").map(Number);
  const [sh,sm] = salida.split(":").map(Number);
  const totalMin = (sh*60+sm) - (eh*60+em);

  if (totalMin <= 0) {
    el.textContent = "⚠️ La hora de salida debe ser mayor que la de entrada.";
    el.style.color = "var(--danger)";
    return;
  }
  const horas = Math.floor(totalMin/60);
  const mins  = totalMin % 60;
  el.textContent = `⏱ Duración: ${horas}h ${mins > 0 ? mins+"m" : ""}`;
  el.style.color = "var(--success)";
}

function _actualizarFechaHint() {
  const fechaEl = document.getElementById("extras-fecha");
  const hintEl  = document.getElementById("extras-fecha-hint");
  const tipoEl  = document.querySelector("input[name='extras-tipo']:checked");
  if (!fechaEl || !hintEl) return;

  const val = fechaEl.value;
  if (!val) { hintEl.textContent = ""; return; }

  const d   = new Date(val + "T12:00:00");
  const dia = d.getDay();
  const dias = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
  const tipo = tipoEl?.value;

  if (dia === 0 && tipo === "dia_especial") {
    hintEl.innerHTML = `✅ <strong style="color:var(--team)">Domingo</strong> — se habilitará como día laborable con el horario indicado.`;
  } else if (dia === 0 && tipo === "extension") {
    hintEl.innerHTML = `⚠️ Es <strong>domingo</strong>. Para trabajar domingos usa "Día especial".`;
    hintEl.style.color = "var(--warn)";
    return;
  } else if (esFeriado(d)) {
    hintEl.innerHTML = `⚠️ Fecha marcada como <strong>feriado</strong>. La regla sí se creará pero solo si previamente eliminás el feriado.`;
    hintEl.style.color = "var(--warn)";
    return;
  } else {
    hintEl.innerHTML = `📅 ${dias[dia].charAt(0).toUpperCase()+dias[dia].slice(1)} — día laborable normal.`;
  }
  hintEl.style.color = "";
}

function guardarNuevaReglaExtra() {
  const tipoEl    = document.querySelector("input[name='extras-tipo']:checked");
  const fechaEl   = document.getElementById("extras-fecha");
  const entradaEl = document.getElementById("extras-entrada");
  const salidaEl  = document.getElementById("extras-salida");
  const scopeEl   = document.querySelector("input[name='extras-scope']:checked");
  const multiSel  = document.getElementById("extras-sacadores-select");
  const notaEl    = document.getElementById("extras-nota");
  const errorEl   = document.getElementById("extras-form-error");

  const tipo    = tipoEl?.value;
  const fecha   = fechaEl?.value;
  const entrada = entradaEl?.value;
  const salida  = salidaEl?.value;
  const scope   = scopeEl?.value;
  const nota    = notaEl?.value.trim();

  errorEl.classList.remove("visible");

  if (!fecha) { errorEl.textContent = "Selecciona una fecha."; errorEl.classList.add("visible"); return; }
  if (!salida) { errorEl.textContent = "Indica la hora de salida."; errorEl.classList.add("visible"); return; }

  const [eh,em] = (entrada || "08:00").split(":").map(Number);
  const [sh,sm] = salida.split(":").map(Number);
  if (sh*60+sm <= eh*60+em) {
    errorEl.textContent = "La hora de salida debe ser mayor que la de entrada.";
    errorEl.classList.add("visible"); return;
  }

  let sacadores = ["todos"];
  if (scope === "individual") {
    sacadores = Array.from(multiSel.selectedOptions).map(o => o.value);
    if (sacadores.length === 0) {
      errorEl.textContent = "Selecciona al menos un sacador.";
      errorEl.classList.add("visible"); return;
    }
  }

  const nueva = {
    id:          Date.now().toString(),
    tipo,
    fecha,
    sacadores,
    horaEntrada: tipo === "dia_especial" ? (entrada + ":00") : HORA_ENTRADA,
    horaSalida:  salida + ":00",
    nota,
    activa: true
  };

  const cfg = cargarReglasExtras();
  cfg.reglas.push(nueva);
  guardarReglasExtras(cfg);

  mostrarToast(
    `✅ Regla guardada: ${tipo === "dia_especial" ? "Día especial" : "Extensión"} para ${fecha}`,
    "success"
  );

  switchExtrasTab("lista");
  _renderExtrasLista();
  _renderExtrasForm();
}

function toggleReglaExtra(id, activa) {
  const cfg = cargarReglasExtras();
  const r   = cfg.reglas.find(r => r.id === id);
  if (r) { r.activa = activa; guardarReglasExtras(cfg); }
  mostrarToast(activa ? "✅ Regla activada." : "⏸ Regla desactivada.", "info");
  _renderExtrasLista();
}

function eliminarReglaExtra(id) {
  const cfg = cargarReglasExtras();
  cfg.reglas = cfg.reglas.filter(r => r.id !== id);
  guardarReglasExtras(cfg);
  mostrarToast("🗑 Regla eliminada.", "warn");
  _renderExtrasLista();
}

// ── Estilos del panel ────────────────────────────────────────
function _inyectarEstilosExtras() {
  if (document.getElementById("extras-styles")) return;
  const style = document.createElement("style");
  style.id = "extras-styles";
  style.textContent = `
    .modal-extras {
      max-width: 560px;
      padding: 0;
      overflow: hidden;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
    }
    .modal-extras .modal-header {
      padding: 24px 28px 0;
      flex-shrink: 0;
    }
    .extras-icon-badge {
      background: rgba(245,158,11,0.15);
      border: 1px solid rgba(245,158,11,0.35);
      color: var(--warn);
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 14px;
    }
    .extras-tabs {
      display: flex;
      gap: 6px;
    }
    .extras-tab {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 600;
      padding: 8px 16px;
      border-radius: 6px 6px 0 0;
      border-bottom: none;
      cursor: pointer;
      transition: all .2s;
      font-family: var(--font-ui);
    }
    .extras-tab.active {
      background: var(--bg-card);
      color: var(--text-primary);
      border-color: var(--border-light);
    }
    .extras-tab-content {
      padding: 20px 28px 24px;
      overflow-y: auto;
      flex: 1;
    }
    .extras-rule-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px 16px;
      margin-bottom: 10px;
      transition: border-color .2s;
    }
    .extras-rule-card.hoy {
      border-color: rgba(245,158,11,.4);
      background: rgba(245,158,11,.04);
    }
    .extras-rule-card.inactiva { opacity: .5; }
    .extras-rule-top {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }
    .extras-rule-details {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .extras-detail-pill {
      font-size: 11px;
      color: var(--text-secondary);
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      padding: 3px 10px;
      border-radius: 20px;
      font-family: var(--font-mono);
    }
    .extras-badge {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .06em;
      padding: 2px 8px;
      border-radius: 20px;
    }
    .extras-badge.hoy     { background: rgba(245,158,11,.2); color: var(--warn); border: 1px solid rgba(245,158,11,.4); }
    .extras-badge.futuro  { background: rgba(59,130,246,.15); color: var(--accent); border: 1px solid rgba(59,130,246,.3); }
    .extras-badge.pasado  { background: var(--bg-elevated); color: var(--text-muted); border: 1px solid var(--border); }
    /* Toggle switch */
    .extras-toggle { position: relative; display: inline-block; width: 36px; height: 20px; cursor: pointer; }
    .extras-toggle input { opacity: 0; width: 0; height: 0; }
    .extras-toggle-track {
      position: absolute; inset: 0;
      background: var(--border-light); border-radius: 20px;
      transition: background .2s;
    }
    .extras-toggle-track::after {
      content: ""; position: absolute;
      width: 14px; height: 14px; border-radius: 50%;
      background: white; top: 3px; left: 3px;
      transition: transform .2s;
    }
    .extras-toggle input:checked + .extras-toggle-track { background: var(--success); }
    .extras-toggle input:checked + .extras-toggle-track::after { transform: translateX(16px); }
    /* Form */
    .extras-form { display: flex; flex-direction: column; gap: 18px; }
    .extras-form-group { display: flex; flex-direction: column; gap: 6px; }
    .extras-label {
      font-size: 11px; font-weight: 700; text-transform: uppercase;
      letter-spacing: .07em; color: var(--text-muted);
    }
    .extras-tipo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .extras-tipo-card {
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: 10px; padding: 14px 16px; cursor: pointer;
      display: flex; flex-direction: column; gap: 4px;
      transition: border-color .2s, background .2s;
    }
    .extras-tipo-card input { display: none; }
    .extras-tipo-card.selected {
      border-color: var(--accent);
      background: rgba(59,130,246,.08);
    }
    .extras-tipo-icon  { font-size: 22px; }
    .extras-tipo-title { font-size: 13px; font-weight: 700; color: var(--text-primary); }
    .extras-tipo-desc  { font-size: 11px; color: var(--text-secondary); line-height: 1.4; }
    .extras-radio-opt {
      display: flex; align-items: center; gap: 6px;
      font-size: 12px; font-weight: 600;
      background: var(--bg-elevated); border: 1px solid var(--border);
      padding: 7px 14px; border-radius: 6px; cursor: pointer;
      transition: border-color .2s, color .2s;
      color: var(--text-secondary);
    }
    .extras-radio-opt input { display: none; }
    .extras-radio-opt.active { border-color: var(--accent); color: var(--accent); background: rgba(59,130,246,.1); }
    .extras-hint  { font-size: 12px; color: var(--text-muted); }
    .extras-preview-pill { font-size: 12px; font-family: var(--font-mono); font-weight: 600; }
    @media (max-width:480px) {
      .extras-tipo-grid { grid-template-columns: 1fr; }
      .modal-extras { max-width: 100%; }
    }
  `;
  document.head.appendChild(style);
}

// ── Exponer funciones globalmente ────────────────────────────
window.abrirPanelHorasExtras   = abrirPanelHorasExtras;
window.cerrarPanelHorasExtras  = cerrarPanelHorasExtras;
window.switchExtrasTab         = switchExtrasTab;
window.onExtrastipoChange      = onExtrastipoChange;
window.onExtrasScopeChange     = onExtrasScopeChange;
window.guardarNuevaReglaExtra  = guardarNuevaReglaExtra;
window.toggleReglaExtra        = toggleReglaExtra;
window.eliminarReglaExtra      = eliminarReglaExtra;
window.getRangosConExtras      = getRangosConExtras;
window._tieneDiaEspecialHoy    = _tieneDiaEspecialHoy;

console.log("✅ Módulo Horas Extras cargado.");
