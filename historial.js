// ============================================================
//  HISTORIAL.JS — Pedidos finalizados
//  Consume GET /api/historial (ya existe en el backend) vía GMApi.
//  Requiere gm-api.js cargado ANTES.
// ============================================================

let _historialCache = [];

// ============================================================
//  AUTENTICACIÓN (mismo patrón que las otras páginas)
// ============================================================
async function inicializarAutenticacionHistorial() {
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

    await poblarSelectSacadorHistorial();
    iniciarRelojSidebarHistorial();
    cargarHistorial();
  } catch (err) {
    console.error("❌ Error verificando sesión:", err);
    GMApi.cerrarSesion();
  }
}

async function autenticarHistorial() {
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

    await poblarSelectSacadorHistorial();
    iniciarRelojSidebarHistorial();
    cargarHistorial();
  } catch (err) {
    console.error("❌ Error en login:", err.message);
    errorEl.textContent = "Email o contraseña incorrectos.";
    errorEl.classList.add("visible");
    loadingEl.style.display = "none";
    btnEl.disabled = false;
  }
}

function cerrarSesionHistorial() {
  if (confirm("¿Cerrar sesión?")) GMApi.cerrarSesion();
}

function iniciarRelojSidebarHistorial() {
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

async function poblarSelectSacadorHistorial() {
  const select = document.getElementById("hist-sacador");
  try {
    const sacadores = await GMApi.obtenerSacadores();
    select.innerHTML = '<option value="">Todos los sacadores</option>' +
      sacadores.map(s => `<option value="${s.nombre}">${s.nombre}</option>`).join("");
  } catch (err) {
    console.warn("⚠️ No se pudo cargar la lista de sacadores para el filtro:", err.message);
  }
}

// ============================================================
//  UTILIDADES DE FORMATO
// ============================================================
function _pad2(n) { return String(n).padStart(2, "0"); }

function _formatTimeHist(totalSeconds) {
  totalSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${_pad2(h)}:${_pad2(m)}:${_pad2(s)}`;
}

function _formatFechaHist(timestamp) {
  if (!timestamp) return "—";
  const d = new Date(timestamp);
  return `${_pad2(d.getDate())}/${_pad2(d.getMonth() + 1)}/${d.getFullYear()} ${_pad2(d.getHours())}:${_pad2(d.getMinutes())}`;
}

// ============================================================
//  CARGAR / FILTRAR / RENDERIZAR
// ============================================================
async function cargarHistorial() {
  const desde = document.getElementById("hist-desde").value || null;
  const hasta = document.getElementById("hist-hasta").value || null;
  const sacador = document.getElementById("hist-sacador").value || null;

  try {
    _historialCache = await GMApi.obtenerHistorial(desde, hasta, sacador);
    renderTablaHistorial();
  } catch (err) {
    console.error("❌ Error cargando historial:", err);
    mostrarToastHistorial("⚠️ Error al cargar el historial.", "error");
  }
}

function limpiarFiltroHistorial() {
  document.getElementById("hist-desde").value = "";
  document.getElementById("hist-hasta").value = "";
  document.getElementById("hist-sacador").value = "";
  document.getElementById("hist-filtro-texto").value = "";
  cargarHistorial();
}

function renderTablaHistorial() {
  const texto = (document.getElementById("hist-filtro-texto")?.value || "").toLowerCase().trim();
  const filas = _historialCache.filter(h => (h.codigo_pedido || "").toLowerCase().includes(texto));

  const tbody = document.getElementById("historial-tbody");
  const emptyState = document.getElementById("hist-empty-state");
  const table = document.getElementById("historial-table");

  tbody.innerHTML = "";

  if (filas.length === 0) {
    table.style.display = "none";
    emptyState.classList.add("visible");
  } else {
    table.style.display = "table";
    emptyState.classList.remove("visible");

    filas.forEach(h => {
      const tr = document.createElement("tr");
      tr.style.borderTop = "1px solid var(--border, #2a2a3a)";
      tr.innerHTML = `
        <td style="padding:10px 12px;font-weight:600;">#${h.codigo_pedido}</td>
        <td style="padding:10px 12px;">${h.sacador}</td>
        <td style="padding:10px 12px;">${h.rol === "Lider" ? "👑 Líder" : "Aux"}</td>
        <td style="padding:10px 12px;font-size:12px;color:var(--text-muted,#888);">${h.equipo_completo || "—"}</td>
        <td style="padding:10px 12px;text-align:right;">${h.cantidad_productos ?? "—"}</td>
        <td style="padding:10px 12px;text-align:right;">${h.bultos ?? "—"}</td>
        <td style="padding:10px 12px;text-align:right;">RD$ ${Number(h.monto_final || 0).toFixed(2)}</td>
        <td style="padding:10px 12px;">${_formatFechaHist(h.hora_inicio)}</td>
        <td style="padding:10px 12px;">${_formatFechaHist(h.hora_fin)}</td>
        <td style="padding:10px 12px;text-align:right;">${_formatTimeHist(h.tiempo_total_segundos)}</td>
        <td style="padding:10px 12px;text-align:right;">${_formatTimeHist(h.tiempo_por_producto_segundos)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  const countEl = document.getElementById("hist-filter-count");
  if (countEl) countEl.textContent = `${filas.length} de ${_historialCache.length} registros`;

  _actualizarStatsHistorial(filas);
}

function _actualizarStatsHistorial(filas) {
  document.getElementById("stat-hist-registros").textContent = filas.length;

  const pedidosUnicos = new Set(filas.map(h => h.pedido_id)).size;
  document.getElementById("stat-hist-pedidos").textContent = pedidosUnicos;

  const tppValidos = filas.filter(h => h.tiempo_por_producto_segundos > 0).map(h => h.tiempo_por_producto_segundos);
  const tppProm = tppValidos.length > 0 ? tppValidos.reduce((a, b) => a + b, 0) / tppValidos.length : 0;
  document.getElementById("stat-hist-tpp").textContent = tppValidos.length > 0 ? _formatTimeHist(tppProm) : "--:--";

  // El monto se guarda una vez por pedido (no por participante) — sumamos solo la fila del líder para no duplicar
  const montoTotal = filas
    .filter(h => h.rol === "Lider")
    .reduce((acc, h) => acc + Number(h.monto_final || 0), 0);
  document.getElementById("stat-hist-monto").textContent = `RD$ ${montoTotal.toFixed(2)}`;
}

// ============================================================
//  EXPORTAR A EXCEL
// ============================================================
function exportarHistorialExcel() {
  const texto = (document.getElementById("hist-filtro-texto")?.value || "").toLowerCase().trim();
  const filas = _historialCache.filter(h => (h.codigo_pedido || "").toLowerCase().includes(texto));

  if (filas.length === 0) {
    mostrarToastHistorial("⚠️ No hay datos para exportar.", "warn");
    return;
  }

  const datos = filas.map(h => ({
    "Código": h.codigo_pedido,
    "Sacador": h.sacador,
    "Rol": h.rol,
    "Equipo": h.equipo_completo || "",
    "Productos": h.cantidad_productos,
    "Bultos": h.bultos,
    "Monto (RD$)": Number(h.monto_final || 0),
    "Inicio": _formatFechaHist(h.hora_inicio),
    "Fin": _formatFechaHist(h.hora_fin),
    "Tiempo total": _formatTimeHist(h.tiempo_total_segundos),
    "Tiempo/producto": _formatTimeHist(h.tiempo_por_producto_segundos)
  }));

  const ws = XLSX.utils.json_to_sheet(datos);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Historial");
  const fechaArchivo = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `historial_pedidos_${fechaArchivo}.xlsx`);
}

// ============================================================
//  TOAST (mismo patrón visual que las otras páginas)
// ============================================================
function mostrarToastHistorial(msg, tipo = "info") {
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
