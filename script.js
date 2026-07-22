// ============================================================
//  SCRIPT PRINCIPAL v2 — Dependencia 100% del Backend
//  Requiere gm-api.js cargado ANTES
// ============================================================

// ── ESTADO GLOBAL ──
let pedidosActivos = {}; // { id_pedido: { ...datos, timerInterval, segmentosLocales } }
let timers = {};
let pausedTimers = {};

const UMBRAL_EQUIPO = 100;
const API_HOJA_HISTORIAL = "https://api.sheetbest.com/sheets/cce35084-ee62-4934-b2ed-eb5fcd2d414b";

// ============================================================
//  AUTENTICACIÓN
// ============================================================

/**
 * Inicializa el estado de autenticación al cargar la página
 */
async function inicializarAutenticacion() {
  const token = GMApi.getToken();
  const usuario = GMApi.getUsuario();

  if (!token || !usuario) {
    // Mostrar solo el modal de login
    document.getElementById("modal-login-overlay").classList.add("open");
    document.getElementById("main-app").style.display = "none";
    document.getElementById("btn-float-extras").style.display = "none";
    return;
  }

  try {
    // Verificar que el token sea válido
    await GMApi.obtenerUsuarioActual();

    // Token válido: mostrar la app
    document.getElementById("modal-login-overlay").classList.remove("open");
    document.getElementById("main-app").style.display = "block";
    document.getElementById("btn-float-extras").style.display = "flex";
    document.getElementById("usuario-nombre").textContent = usuario.nombre || "Usuario";

    // Cargar datos iniciales
    cargarPedidosDelBackend();
  } catch (err) {
    console.error("❌ Error verificando sesión:", err);
    mostrarToast("⚠️ Sesión expirada o inválida", "error");
    GMApi.cerrarSesion();
  }
}

/**
 * Realiza el login del usuario
 */
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

    // Login exitoso
    console.log("✅ Autenticación exitosa:", usuario.nombre);
    loadingEl.style.display = "none";
    errorEl.classList.remove("visible");

    // Actualizar UI
    document.getElementById("modal-login-overlay").classList.remove("open");
    document.getElementById("main-app").style.display = "block";
    document.getElementById("btn-float-extras").style.display = "flex";
    document.getElementById("usuario-nombre").textContent = usuario.nombre || "Usuario";

    // Cargar pedidos del backend
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

/**
 * Cierra la sesión actual
 */
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

/**
 * Obtiene todos los pedidos del backend y los renderiza en la UI
 */
async function cargarPedidosDelBackend() {
  try {
    // Obtener pedidos En Proceso (activos y pausados)
    const pedidosEnProceso = await GMApi.obtenerPedidos("En Proceso");
    const pedidosPausados = await GMApi.obtenerPedidos("Pausado");
    const pedidosFinalizados = await GMApi.obtenerPedidos("Finalizado");

    // Combinar todos
    const todosPedidos = [...pedidosEnProceso, ...pedidosPausados, ...pedidosFinalizados];

    // Limpiar UI
    const taskList = document.getElementById("task-list");
    taskList.innerHTML = "";

    // Procesar cada pedido
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
 * Renderiza un pedido individual desde el backend
 */
async function renderizarPedido(pedido) {
  const { id, numero_pedido, sacador, cantidad_referencias, hora_inicio, estatus, auxiliares, tiene_equipo } = pedido;

  // Crear estado local para el pedido
  pedidosActivos[id] = {
    id,
    numero_pedido,
    sacador,
    cantidad_referencias,
    hora_inicio,
    estatus,
    auxiliares: auxiliares || [],
    tiene_equipo: tiene_equipo || false,
    elapsedMs: 0,
    paused: estatus === "Pausado"
  };

  // Crear tarjeta en UI
  crearTarjeta(pedido);

  // Si está activo (no finalizado), iniciar timer
  if (estatus !== "Finalizado") {
    iniciarTimer(id);
    if (!pedido.paused) {
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

  // Verificar que no sea domingo (salvo con día especial)
  if (now.getDay() === 0) {
    const tieneEspecial = typeof _tieneDiaEspecialHoy === "function" && _tieneDiaEspecialHoy(sacador);
    if (!tieneEspecial) {
      mostrarToast("🚫 Los domingos no se pueden iniciar pedidos.", "error");
      return;
    }
  }

  // Verificar que no sea feriado
  if (esFeriado(now)) {
    mostrarToast("🚫 Hoy es un día feriado no laborable.", "error");
    return;
  }

  try {
    // Si cantidad >= umbral, mostrar modal de equipo
    if (cantidad >= UMBRAL_EQUIPO) {
      _abrirModalEquipoNuevo(codigo, sacador, cantidad);
      return;
    }

    // Crear sin equipo
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

  const TODOS = [
    "Omar Marmolejos Fajardo", "Jairo Fernandez Salcedo", "Ismael Augusto Veras Lasuse",
    "Fernando Antonio Burgos Cabrera", "Juan De Jesús Peña Pérez", "Luis David Nuñez Santos",
    "Yustin Alexander Mendez", "Luis Eduardo Reyes", "Omelbe Gomez Valdez",
    "Bryhan Santo Cordero", "Enrique Nuñez Brito", "Cirilo Reynoso Acevedo",
    "Yan Carlos Cruz Paulino", "Wilkin Ortega Diaz", "Oscar De Jesús De La Cruz Reinoso"
  ];

  const opciones = TODOS
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

  // Renderizar el pedido que nos devuelve el backend
  await renderizarPedido(pedidoBackend);

  // Limpiar form
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
// ============================================================

async function pausar(id) {
  try {
    const updates = { estatus: "Pausado" };
    await GMApi.actualizarPedido(id, updates);

    pedidosActivos[id].paused = true;
    const btn = document.querySelector(`#card-${id} .btn-pause`);
    if (btn) {
      btn.textContent = "⏸ Pausado";
      btn.classList.add("paused");
    }

    actualizarStats();
    mostrarToast("⏸ Pedido pausado", "info");
  } catch (err) {
    console.error("❌ Error pausando pedido:", err);
    mostrarToast("❌ Error al pausar pedido.", "error");
  }
}

async function reanudar(id) {
  try {
    const updates = { estatus: "En Proceso" };
    await GMApi.actualizarPedido(id, updates);

    pedidosActivos[id].paused = false;
    const btn = document.querySelector(`#card-${id} .btn-pause`);
    if (btn) {
      btn.textContent = "⏸ Pausar";
      btn.classList.remove("paused");
    }

    actualizarStats();
    mostrarToast("▶ Pedido reanudado", "info");
  } catch (err) {
    console.error("❌ Error reanudando pedido:", err);
    mostrarToast("❌ Error al reanudar pedido.", "error");
  }
}

async function pausarTodos() {
  for (const id in pedidosActivos) {
    const data = pedidosActivos[id];
    if (!data.paused && data.estatus !== "Finalizado") {
      await pausar(id);
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
//  ELIMINAR
// ============================================================

async function eliminar(id) {
  if (!confirm("¿Eliminar este pedido?")) return;

  try {
    await GMApi.eliminarPedido(id);

    clearInterval(timers[id]);
    delete timers[id];
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
      delete timers[id];
      delete pedidosActivos[id];

      const card = document.getElementById(`card-${id}`);
      if (card) card.remove();
    } catch (err) {
      console.error(`❌ Error eliminando pedido ${id}:`, err);
    }
  }

  pedidosActivos = {};
  timers = {};
  actualizarStats();
  aplicarFiltro();
  mostrarToast("🗑 Todos los pedidos fueron eliminados", "warn");
}

// ============================================================
//  TIMER
// ============================================================

function iniciarTimer(id) {
  if (timers[id]) clearInterval(timers[id]);

  timers[id] = setInterval(() => {
    const data = pedidosActivos[id];
    if (!data || data.estatus === "Finalizado") {
      clearInterval(timers[id]);
      return;
    }

    // Sumar 500ms cada intervalo (se actualiza cada 500ms)
    if (!data.paused) {
      data.elapsedMs += 500;
    }

    const timerEl = document.getElementById(`timer-${id}`);
    if (timerEl) {
      timerEl.textContent = formatTime(Math.floor(data.elapsedMs / 1000));
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

  // Actualizar styling del botón de pausa si está pausado
  if (estatus === "Pausado") {
    const btn = task.querySelector(".btn-pause");
    if (btn) btn.classList.add("paused");
  }

  // Agregar sección de equipo si aplica
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

  const TODOS = [
    "Omar Marmolejos Fajardo", "Jairo Fernandez Salcedo", "Ismael Augusto Veras Lasuse",
    "Fernando Antonio Burgos Cabrera", "Juan De Jesús Peña Pérez", "Luis David Nuñez Santos",
    "Yustin Alexander Mendez", "Luis Eduardo Reyes", "Omelbe Gomez Valdez",
    "Bryhan Santo Cordero", "Enrique Nuñez Brito", "Cirilo Reynoso Acevedo",
    "Yan Carlos Cruz Paulino", "Wilkin Ortega Diaz", "Oscar De Jesús De La Cruz Reinoso"
  ];

  const yaAsignados = [
    data.sacador,
    ...(data.auxiliares || []).map(a => typeof a === "string" ? a : a.nombre)
  ];

  const auxSelect = document.getElementById("aux-select");
  auxSelect.innerHTML = '<option value="">-- Selecciona un colaborador --</option>';
  TODOS
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
    const cantSacada = modalRespuestas.cantidad;
    const porcentaje = Math.round((cantSacada / data.cantidad_referencias) * 100);
    const tpp = cantSacada > 0 ? formatTime(Math.floor(data.elapsedMs / cantSacada / 1000)) : "—";

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
        <div class="summary-row"><span class="summary-key">Tiempo total</span><span class="summary-val success">${formatTime(Math.floor(data.elapsedMs / 1000))}</span></div>
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

  cerrarModal();

  try {
    const ahora = new Date().toISOString();
    const cantidadSacada = modalRespuestas.cantidad;
    const bultos = modalRespuestas.bultos;
    const montoTotal = parseFloat(modalRespuestas.monto);

    // Preparar participantes (líder + auxiliares)
    const participantes = [
      {
        sacador: data.sacador,
        rol: "Lider",
        hora_inicio: data.hora_inicio,
        hora_fin: ahora,
        tiempo_total_segundos: Math.floor(data.elapsedMs / 1000),
        tiempo_por_producto_segundos: cantidadSacada > 0 ? (data.elapsedMs / 1000 / cantidadSacada) : 0
      }
    ];

    if (data.auxiliares && data.auxiliares.length > 0) {
      data.auxiliares.forEach(aux => {
        const nombre = typeof aux === "string" ? aux : aux.nombre;
        participantes.push({
          sacador: nombre,
          rol: "Auxiliar",
          hora_inicio: typeof aux === "object" && aux.joined_at ? aux.joined_at : data.hora_inicio,
          hora_fin: ahora,
          tiempo_total_segundos: 0, // El backend calculará esto
          tiempo_por_producto_segundos: 0
        });
      });
    }

    // Llamar al backend para finalizar
    const pedidoFinalizado = await GMApi.finalizarPedido(
      modalId,
      cantidadSacada,
      bultos,
      montoTotal,
      ahora,
      participantes
    );

    // Actualizar estado local
    data.estatus = "Finalizado";
    clearInterval(timers[modalId]);

    // Actualizar UI
    const card = document.getElementById(`card-${modalId}`);
    if (card) card.classList.add("finalizado");

    const endEl = document.getElementById(`end-${modalId}`);
    if (endEl) endEl.textContent = formatearFecha(ahora);

    const timerEl = document.getElementById(`timer-${modalId}`);
    if (timerEl) timerEl.textContent = formatTime(Math.floor(data.elapsedMs / 1000));

    const tppWrap = document.getElementById(`tpp-wrap-${modalId}`);
    const tppEl = document.getElementById(`tpp-${modalId}`);
    if (tppWrap) tppWrap.style.display = "block";
    if (tppEl) tppEl.textContent = cantidadSacada > 0 ? formatTime(Math.floor(data.elapsedMs / cantidadSacada / 1000)) : "—";

    // Remover botones de auxiliar
    const teamSection = document.getElementById(`team-section-${modalId}`);
    if (teamSection) {
      const btn = teamSection.querySelector(".btn-add-aux");
      if (btn) btn.remove();
    }
    const btnAuxSuelto = card ? card.querySelector(".btn-add-aux") : null;
    if (btnAuxSuelto) btnAuxSuelto.remove();

    actualizarStats();

    const porcentaje = Math.round((cantidadSacada / data.cantidad_referencias) * 100);
    const tppFormato = cantidadSacada > 0 ? formatTime(Math.floor(data.elapsedMs / cantidadSacada / 1000)) : "—";
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
//  PAUSAS AUTOMÁTICAS Y HORARIOS
// ============================================================

function programarPausas(id, sacador, now) {
  // Esto se puede implementar después si es necesario
  // Por ahora, los timers son simples y el backend maneja la lógica
}

// ============================================================
//  FERIADOS
// ============================================================

function cargarFeriados() {
  try {
    return JSON.parse(localStorage.getItem("feriados_no_laborables") || "[]");
  } catch {
    return [];
  }
}

function esFeriado(fecha) {
  const key = `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
  return cargarFeriados().includes(key);
}

function precargarFeriadosRD() {
  if (cargarFeriados().length === 0) {
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
    localStorage.setItem("feriados_no_laborables", JSON.stringify([...FERIADOS_RD_2025, ...FERIADOS_RD_2026]));
    console.log("✅ Feriados dominicanos precargados.");
  }
}

// ============================================================
//  UTILIDADES
// ============================================================

function pad(n) {
  return String(n).padStart(2, "0");
}

function formatTime(totalSeconds) {
  totalSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatearFecha(timestamp) {
  let d;
  if (typeof timestamp === "string") {
    d = new Date(timestamp);
  } else {
    d = new Date(timestamp);
  }
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

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

// Precarga de feriados
precargarFeriadosRD();
