// ============================================================
//  SACADORES.JS — CRUD de sacadores (nombre, horario de salida,
//  almuerzo, breaks). Consume /api/sacadores vía GMApi.
//  Requiere gm-api.js cargado ANTES.
// ============================================================

let _sacadoresCache = []; // lista completa tal como viene del backend
let _sacadorEditandoId = null;
let _breaksContador = 0;

// ============================================================
//  AUTENTICACIÓN (mismo patrón que script.js)
// ============================================================
async function inicializarAutenticacionSacadores() {
  const token = GMApi.getToken();
  const usuario = GMApi.getUsuario();

  if (!token || !usuario) {
    document.getElementById("modal-login-overlay").classList.add("open");
    document.getElementById("main-app").style.display = "none";
    return;
  }

  try {
    await GMApi.obtenerUsuarioActual();
    document.getElementById("modal-login-overlay").classList.remove("open");
    document.getElementById("main-app").style.display = "block";
    document.getElementById("usuario-nombre").textContent = usuario.nombre || "Usuario";
    cargarListaSacadores();
    iniciarRelojSidebar();
  } catch (err) {
    console.error("❌ Error verificando sesión:", err);
    GMApi.cerrarSesion();
  }
}

async function autenticarSacadores() {
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

    loadingEl.style.display = "none";
    document.getElementById("modal-login-overlay").classList.remove("open");
    document.getElementById("main-app").style.display = "block";
    document.getElementById("usuario-nombre").textContent = usuario.nombre || "Usuario";

    cargarListaSacadores();
    iniciarRelojSidebar();
  } catch (err) {
    console.error("❌ Error en login:", err.message);
    errorEl.textContent = "Email o contraseña incorrectos.";
    errorEl.classList.add("visible");
    loadingEl.style.display = "none";
    btnEl.disabled = false;
  }
}

function cerrarSesionSacadores() {
  if (confirm("¿Cerrar sesión?")) GMApi.cerrarSesion();
}

function iniciarRelojSidebar() {
  const actualizar = () => {
    const now = new Date();
    const timeEl = document.getElementById("sidebar-clock-time");
    const dateEl = document.getElementById("sidebar-clock-date");
    if (timeEl) timeEl.textContent = now.toLocaleTimeString("es-DO", { hour12: false });
    if (dateEl) dateEl.textContent = now.toLocaleDateString("es-DO", { weekday: "long", day: "numeric", month: "long" });
  };
  actualizar();
  setInterval(actualizar, 1000);
}

// ============================================================
//  CARGAR / RENDERIZAR LISTA
// ============================================================
async function cargarListaSacadores() {
  try {
    _sacadoresCache = await GMApi.obtenerSacadores();
    renderListaSacadores();
  } catch (err) {
    console.error("❌ Error cargando sacadores:", err);
    mostrarToastSacadores("⚠️ Error al cargar sacadores.", "error");
  }
}

function renderListaSacadores() {
  const texto = (document.getElementById("sac-filtro-texto")?.value || "").toLowerCase().trim();
  const contenedor = document.getElementById("sacadores-list");
  const emptyState = document.getElementById("sac-empty-state");

  const filtrados = _sacadoresCache.filter(s => s.nombre.toLowerCase().includes(texto));

  contenedor.innerHTML = "";

  if (filtrados.length === 0) {
    contenedor.appendChild(emptyState);
    emptyState.classList.add("visible");
  } else {
    filtrados.forEach(s => contenedor.appendChild(_crearTarjetaSacador(s)));
  }

  const countEl = document.getElementById("sac-filter-count");
  if (countEl) countEl.textContent = `${filtrados.length} de ${_sacadoresCache.length} sacadores`;

  const activos = _sacadoresCache.filter(s => s.activo).length;
  document.getElementById("stat-sac-activos").textContent = activos;
  document.getElementById("stat-sac-inactivos").textContent = _sacadoresCache.length - activos;
  document.getElementById("stat-sac-total").textContent = _sacadoresCache.length;
}

function _fmtHora(hhmmss) {
  if (!hhmmss) return "—";
  return hhmmss.slice(0, 5); // "17:00:00" -> "17:00"
}

function _crearTarjetaSacador(s) {
  const card = document.createElement("div");
  card.className = "task" + (s.activo ? "" : " finalizado");

  const breaksTxt = (s.breaks || []).length > 0
    ? s.breaks.map(b => `${_fmtHora(b.hora)} (${b.duracion_min}min)`).join(", ")
    : "Sin breaks";

  const almuerzoTxt = (s.almuerzo_inicio && s.almuerzo_fin)
    ? `${_fmtHora(s.almuerzo_inicio)} – ${_fmtHora(s.almuerzo_fin)}`
    : "Sin almuerzo asignado";

  card.innerHTML = `
    <div class="task-header">
      <div class="task-code">${s.nombre}</div>
      <button class="btn-delete" onclick="eliminarSacador('${s.id}')" title="Eliminar">✕</button>
    </div>
    <div class="task-meta">
      <span class="meta-item">🕗 Entrada <strong>${_fmtHora(s.horario_entrada)}</strong></span>
      <span class="badge-pausa" style="display:inline-flex;">
        ${s.activo ? "🟢 Activo" : "⚪ Inactivo"}
      </span>
    </div>
    <div class="task-times">
      <div class="time-row"><span class="time-label">Salida Lun-Jue</span><span class="time-value">${_fmtHora(s.salida_lun_jue)}</span></div>
      <div class="time-row"><span class="time-label">Salida Viernes</span><span class="time-value">${_fmtHora(s.salida_viernes)}</span></div>
      <div class="time-row"><span class="time-label">Salida Sábado</span><span class="time-value">${_fmtHora(s.salida_sabado)}</span></div>
      <div class="time-row"><span class="time-label">Almuerzo</span><span class="time-value">${almuerzoTxt}</span></div>
      <div class="time-row"><span class="time-label">Breaks</span><span class="time-value">${breaksTxt}</span></div>
    </div>
    <div class="task-actions">
      <button class="btn-action btn-pause" onclick="abrirModalSacador('${s.id}')">✎ Editar</button>
      <button class="btn-action btn-resume" onclick="toggleActivoSacador('${s.id}', ${!s.activo})">
        ${s.activo ? "⏸ Desactivar" : "▶ Activar"}
      </button>
    </div>
  `;
  return card;
}

// ============================================================
//  MODAL CREAR / EDITAR
// ============================================================
function abrirModalSacador(id = null) {
  _sacadorEditandoId = id;
  document.getElementById("sac-error").classList.remove("visible");
  document.getElementById("sac-breaks-list").innerHTML = "";
  _breaksContador = 0;

  const titleEl = document.getElementById("sacador-modal-title");

  if (id) {
    const s = _sacadoresCache.find(x => x.id === id);
    if (!s) return;
    titleEl.textContent = `Editar — ${s.nombre}`;
    document.getElementById("sac-nombre").value = s.nombre;
    document.getElementById("sac-activo").checked = !!s.activo;
    document.getElementById("sac-entrada").value = _fmtHora(s.horario_entrada) || "08:00";
    document.getElementById("sac-salida-ljv").value = _fmtHora(s.salida_lun_jue);
    document.getElementById("sac-salida-vie").value = _fmtHora(s.salida_viernes);
    document.getElementById("sac-salida-sab").value = _fmtHora(s.salida_sabado);
    document.getElementById("sac-almuerzo-inicio").value = _fmtHora(s.almuerzo_inicio);
    document.getElementById("sac-almuerzo-fin").value = _fmtHora(s.almuerzo_fin);
    (s.breaks || []).forEach(b => agregarFilaBreak(_fmtHora(b.hora), b.duracion_min));
  } else {
    titleEl.textContent = "Agregar sacador";
    document.getElementById("sac-nombre").value = "";
    document.getElementById("sac-activo").checked = true;
    document.getElementById("sac-entrada").value = "08:00";
    document.getElementById("sac-salida-ljv").value = "18:00";
    document.getElementById("sac-salida-vie").value = "17:00";
    document.getElementById("sac-salida-sab").value = "12:00";
    document.getElementById("sac-almuerzo-inicio").value = "12:00";
    document.getElementById("sac-almuerzo-fin").value = "14:00";
  }

  document.getElementById("modal-sacador-overlay").classList.add("open");
  setTimeout(() => document.getElementById("sac-nombre").focus(), 100);
}

function cerrarModalSacador() {
  document.getElementById("modal-sacador-overlay").classList.remove("open");
  _sacadorEditandoId = null;
}

function agregarFilaBreak(hora = "10:00", duracionMin = 10) {
  _breaksContador++;
  const rowId = `break-row-${_breaksContador}`;
  const fila = document.createElement("div");
  fila.id = rowId;
  fila.className = "equipo-aux-item";
  fila.style.cssText = "display:flex;gap:8px;align-items:center;margin-bottom:6px;";
  fila.innerHTML = `
    <input type="time" class="break-hora" value="${hora}" style="flex:1;" />
    <input type="number" class="break-duracion" value="${duracionMin}" min="1" max="60" style="width:90px;" placeholder="min" />
    <button type="button" class="equipo-btn-remove-aux" onclick="document.getElementById('${rowId}').remove()" title="Quitar">✕</button>
  `;
  document.getElementById("sac-breaks-list").appendChild(fila);
}

function _leerBreaksDelForm() {
  const filas = document.querySelectorAll("#sac-breaks-list .equipo-aux-item");
  const breaks = [];
  filas.forEach(fila => {
    const hora = fila.querySelector(".break-hora").value;
    const duracion = parseInt(fila.querySelector(".break-duracion").value, 10);
    if (hora && duracion > 0) {
      breaks.push({ hora: hora + ":00", duracion_min: duracion });
    }
  });
  return breaks;
}

async function guardarSacador() {
  const nombre = document.getElementById("sac-nombre").value.trim();
  const errorEl = document.getElementById("sac-error");

  if (!nombre) {
    errorEl.textContent = "El nombre es obligatorio.";
    errorEl.classList.add("visible");
    return;
  }

  const toHHMMSS = v => (v ? v + ":00" : null);

  const datos = {
    nombre,
    activo: document.getElementById("sac-activo").checked,
    horario_entrada: toHHMMSS(document.getElementById("sac-entrada").value) || "08:00:00",
    salida_lun_jue: toHHMMSS(document.getElementById("sac-salida-ljv").value),
    salida_viernes: toHHMMSS(document.getElementById("sac-salida-vie").value),
    salida_sabado: toHHMMSS(document.getElementById("sac-salida-sab").value),
    almuerzo_inicio: toHHMMSS(document.getElementById("sac-almuerzo-inicio").value),
    almuerzo_fin: toHHMMSS(document.getElementById("sac-almuerzo-fin").value),
    breaks: _leerBreaksDelForm()
  };

  const btn = document.getElementById("sac-btn-guardar");
  btn.disabled = true;

  try {
    if (_sacadorEditandoId) {
      await GMApi.actualizarSacador(_sacadorEditandoId, datos);
      mostrarToastSacadores(`✅ ${nombre} actualizado`, "success");
    } else {
      await GMApi.crearSacador(datos);
      mostrarToastSacadores(`✅ ${nombre} agregado`, "success");
    }
    cerrarModalSacador();
    await cargarListaSacadores();
  } catch (err) {
    console.error("❌ Error guardando sacador:", err);
    errorEl.textContent = err.message || "Error al guardar. Intenta de nuevo.";
    errorEl.classList.add("visible");
  } finally {
    btn.disabled = false;
  }
}

async function toggleActivoSacador(id, nuevoValor) {
  try {
    await GMApi.actualizarSacador(id, { activo: nuevoValor });
    mostrarToastSacadores(nuevoValor ? "▶ Sacador activado" : "⏸ Sacador desactivado", "info");
    await cargarListaSacadores();
  } catch (err) {
    console.error("❌ Error cambiando estatus:", err);
    mostrarToastSacadores("❌ Error al actualizar el sacador.", "error");
  }
}

async function eliminarSacador(id) {
  const s = _sacadoresCache.find(x => x.id === id);
  if (!s) return;
  if (!confirm(`¿Eliminar a ${s.nombre}? Si tiene pedidos o historial asociado, considera desactivarlo en vez de eliminarlo.`)) return;

  try {
    await GMApi.eliminarSacador(id);
    mostrarToastSacadores("🗑 Sacador eliminado", "warn");
    await cargarListaSacadores();
  } catch (err) {
    console.error("❌ Error eliminando sacador:", err);
    mostrarToastSacadores("❌ Error al eliminar. Puede tener pedidos asociados — prueba desactivarlo.", "error");
  }
}

// ============================================================
//  TOAST (mismo patrón visual que script.js)
// ============================================================
function mostrarToastSacadores(msg, tipo = "info") {
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
