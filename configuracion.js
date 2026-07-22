// ============================================================
//  CONFIGURACION.JS — Lógica de la página de Configuración
//  Requiere que gm-api.js esté cargado antes que este archivo
// ============================================================

let usuariosCache = [];
let usuarioEditandoId = null;

/**
 * ─────────────────────────────────────────────────────────
 *  AUTENTICACIÓN
 * ─────────────────────────────────────────────────────────
 */

function inicializarAutenticacionConfig() {
  if (GMApi.haySesion()) {
    mostrarAppPrincipal();
  } else {
    mostrarModalLogin();
  }
  iniciarRelojSidebar();
}

function mostrarModalLogin() {
  document.getElementById("modal-login-overlay").style.display = "flex";
  document.getElementById("main-app").style.display = "none";
}

async function mostrarAppPrincipal() {
  document.getElementById("modal-login-overlay").style.display = "none";
  document.getElementById("main-app").style.display = "block";

  const usuario = GMApi.getUsuario();
  if (usuario) {
    document.getElementById("usuario-nombre").textContent = usuario.nombre;
  }

  // Si el usuario no es admin, ocultamos la gestión de usuarios
  if (usuario && usuario.rol !== "admin") {
    const btnAdd = document.querySelector('.filters-card .filters-actions .add');
    if (btnAdd) btnAdd.style.display = "none";
  }

  await renderListaUsuarios();
}

async function autenticarConfig() {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const errorEl = document.getElementById("login-error");
  const loadingEl = document.getElementById("login-loading");
  const btnLogin = document.getElementById("btn-login");

  errorEl.textContent = "";

  if (!email || !password) {
    errorEl.textContent = "Ingresa tu email y contraseña.";
    return;
  }

  btnLogin.disabled = true;
  loadingEl.style.display = "block";

  try {
    await GMApi.login(email, password);
    loadingEl.style.display = "none";
    btnLogin.disabled = false;
    document.getElementById("login-password").value = "";
    mostrarAppPrincipal();
  } catch (err) {
    loadingEl.style.display = "none";
    btnLogin.disabled = false;
    errorEl.textContent = err.message || "No se pudo iniciar sesión.";
  }
}

function cerrarSesionConfig() {
  GMApi.cerrarSesion();
}

/**
 * ─────────────────────────────────────────────────────────
 *  TABS DE CONFIGURACIÓN
 * ─────────────────────────────────────────────────────────
 */

function mostrarTabConfig(tab) {
  document.querySelectorAll(".config-tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  document.querySelectorAll(".config-tab-panel").forEach(panel => {
    panel.style.display = panel.id === `tab-${tab}` ? "block" : "none";
  });
}

/**
 * ─────────────────────────────────────────────────────────
 *  LISTA DE USUARIOS
 * ─────────────────────────────────────────────────────────
 */

async function renderListaUsuarios() {
  const listEl = document.getElementById("usuarios-list");
  const countEl = document.getElementById("usr-filter-count");
  const filtro = (document.getElementById("usr-filtro-texto").value || "").toLowerCase().trim();

  // Solo recargamos del servidor si aún no tenemos datos en caché
  if (usuariosCache.length === 0) {
    try {
      usuariosCache = await GMApi.obtenerUsuarios();
    } catch (err) {
      listEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div>${err.message || "No se pudo cargar la lista de usuarios."}</div></div>`;
      countEl.textContent = "0 usuarios";
      return;
    }
  }

  const filtrados = usuariosCache.filter(u => {
    if (!filtro) return true;
    return u.nombre.toLowerCase().includes(filtro) || u.email.toLowerCase().includes(filtro);
  });

  countEl.textContent = `${filtrados.length} usuario${filtrados.length === 1 ? "" : "s"}`;

  if (filtrados.length === 0) {
    listEl.innerHTML = `<div class="empty-state" id="usr-empty-state"><div class="empty-state-icon">👥</div><div>No hay usuarios que coincidan con la búsqueda.</div></div>`;
    return;
  }

  listEl.innerHTML = filtrados.map(u => `
    <div class="list-item" style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.06);">
      <div style="display:flex;flex-direction:column;gap:2px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <strong>${escaparHtml(u.nombre)}</strong>
          <span style="font-size:11px;padding:2px 8px;border-radius:10px;background:${u.rol === 'admin' ? 'var(--accent, #2d6a4f)' : 'rgba(255,255,255,0.08)'};color:${u.rol === 'admin' ? '#fff' : 'inherit'};">${escaparHtml(u.rol)}</span>
          <span style="font-size:11px;padding:2px 8px;border-radius:10px;background:${u.activo ? 'rgba(45,106,79,0.25)' : 'rgba(200,60,60,0.2)'};">${u.activo ? 'Activo' : 'Inactivo'}</span>
        </div>
        <span style="font-size:12px;color:var(--text-muted,#999);">${escaparHtml(u.email)}</span>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="modal-btn secondary" style="padding:6px 10px;font-size:12px;" onclick="abrirModalUsuario('${u.id}')">✏️ Editar</button>
        <button class="modal-btn secondary" style="padding:6px 10px;font-size:12px;" onclick="toggleActivoUsuario('${u.id}', ${u.activo})">${u.activo ? '🚫 Desactivar' : '✅ Activar'}</button>
        <button class="modal-btn secondary" style="padding:6px 10px;font-size:12px;color:#e05a5a;" onclick="eliminarUsuario('${u.id}', '${escaparHtml(u.nombre).replace(/'/g, "\\'")}')">🗑️</button>
      </div>
    </div>
  `).join("");
}

function escaparHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

/**
 * ─────────────────────────────────────────────────────────
 *  MODAL: CREAR / EDITAR USUARIO
 * ─────────────────────────────────────────────────────────
 */

function abrirModalUsuario(id = null) {
  usuarioEditandoId = id;
  document.getElementById("usr-error").textContent = "";
  document.getElementById("usr-password").value = "";

  const overlay = document.getElementById("modal-usuario-overlay");
  const titulo = document.getElementById("usuario-modal-title");
  const hintEdit = document.getElementById("usr-password-hint-edit");
  const activoWrap = document.getElementById("usr-activo-wrap");

  if (id) {
    const usuario = usuariosCache.find(u => String(u.id) === String(id));
    if (!usuario) return;

    titulo.textContent = "Editar usuario";
    hintEdit.style.display = "inline";
    activoWrap.style.display = "flex";

    document.getElementById("usr-nombre").value = usuario.nombre;
    document.getElementById("usr-email").value = usuario.email;
    document.getElementById("usr-rol").value = usuario.rol;
    document.getElementById("usr-activo").checked = !!usuario.activo;
  } else {
    titulo.textContent = "Registrar usuario";
    hintEdit.style.display = "none";
    activoWrap.style.display = "none";

    document.getElementById("usr-nombre").value = "";
    document.getElementById("usr-email").value = "";
    document.getElementById("usr-rol").value = "Operador";
  }

  overlay.style.display = "flex";
}

function cerrarModalUsuario() {
  document.getElementById("modal-usuario-overlay").style.display = "none";
  usuarioEditandoId = null;
}

async function guardarUsuario() {
  const nombre = document.getElementById("usr-nombre").value.trim();
  const email = document.getElementById("usr-email").value.trim();
  const password = document.getElementById("usr-password").value;
  const rol = document.getElementById("usr-rol").value.toLowerCase();
  const errorEl = document.getElementById("usr-error");
  const btnGuardar = document.getElementById("usr-btn-guardar");

  errorEl.textContent = "";

  if (!nombre || !email) {
    errorEl.textContent = "Nombre y email son requeridos.";
    return;
  }
  if (!usuarioEditandoId && !password) {
    errorEl.textContent = "La contraseña es requerida para un usuario nuevo.";
    return;
  }
  if (password && password.length < 6) {
    errorEl.textContent = "La contraseña debe tener al menos 6 caracteres.";
    return;
  }

  btnGuardar.disabled = true;

  try {
    if (usuarioEditandoId) {
      const activo = document.getElementById("usr-activo").checked;
      const updates = { nombre, email, rol, activo };
      if (password) updates.password = password;
      await GMApi.actualizarUsuario(usuarioEditandoId, updates);
    } else {
      await GMApi.crearUsuario(nombre, email, password, rol);
    }

    usuariosCache = []; // forzar recarga desde el servidor
    cerrarModalUsuario();
    await renderListaUsuarios();
  } catch (err) {
    errorEl.textContent = err.message || "No se pudo guardar el usuario.";
  } finally {
    btnGuardar.disabled = false;
  }
}

async function toggleActivoUsuario(id, activoActual) {
  try {
    await GMApi.actualizarUsuario(id, { activo: !activoActual });
    usuariosCache = [];
    await renderListaUsuarios();
  } catch (err) {
    alert(err.message || "No se pudo actualizar el usuario.");
  }
}

async function eliminarUsuario(id, nombre) {
  if (!confirm(`¿Eliminar al usuario "${nombre}"? Esta acción no se puede deshacer.`)) return;

  try {
    await GMApi.eliminarUsuario(id);
    usuariosCache = [];
    await renderListaUsuarios();
  } catch (err) {
    alert(err.message || "No se pudo eliminar el usuario.");
  }
}

/**
 * ─────────────────────────────────────────────────────────
 *  RELOJ DEL SIDEBAR
 * ─────────────────────────────────────────────────────────
 */

function iniciarRelojSidebar() {
  const timeEl = document.getElementById("sidebar-clock-time");
  const dateEl = document.getElementById("sidebar-clock-date");
  if (!timeEl || !dateEl) return;

  function actualizar() {
    const ahora = new Date();
    timeEl.textContent = ahora.toLocaleTimeString("es-DO", { hour12: false });
    dateEl.textContent = ahora.toLocaleDateString("es-DO", { day: "2-digit", month: "long", year: "numeric" });
  }

  actualizar();
  setInterval(actualizar, 1000);
}
