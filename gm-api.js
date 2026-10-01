// ============================================================
//  GM API CLIENT — Gestor de tokens y llamadas al backend
//  Debe cargarse ANTES de script-v2.js en todas las páginas
// ============================================================

const GM_API_BASE_URL = "https://hidenback-end-production.up.railway.app";
const GM_TOKEN_KEY    = "gm_token";
const GM_USUARIO_KEY  = "gm_usuario";

const GMApi = {
  baseUrl: GM_API_BASE_URL,

  /**
   * Obtiene el token JWT del localStorage
   */
  getToken() {
    return localStorage.getItem(GM_TOKEN_KEY);
  },

  /**
   * Obtiene los datos del usuario del localStorage
   */
  getUsuario() {
    try {
      return JSON.parse(localStorage.getItem(GM_USUARIO_KEY) || "null");
    } catch {
      return null;
    }
  },

  /**
   * Guarda token + usuario en localStorage tras login exitoso
   */
  guardarSesion(token, usuario) {
    localStorage.setItem(GM_TOKEN_KEY, token);
    localStorage.setItem(GM_USUARIO_KEY, JSON.stringify(usuario));
  },

  /**
   * Limpia la sesión y redirige a login
   */
  cerrarSesion() {
    localStorage.removeItem(GM_TOKEN_KEY);
    localStorage.removeItem(GM_USUARIO_KEY);
    window.location.reload();
  },

  /**
   * Verifica si existe un token válido
   */
  haySesion() {
    return !!this.getToken();
  },

  /**
   * Llamada genérica a la API con manejo automático de errores 401
   * Si el token es inválido, dispara evento 'sesion-expirada'
   */
  async request(path, options = {}) {
    const token = this.getToken();
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers
      });

      // Token expirado o inválido
      if (res.status === 401) {
        console.warn("⚠️ Token expirado o inválido");
        this.cerrarSesion();
        throw new Error("Sesión expirada. Inicia sesión de nuevo.");
      }

      // Sin contenido (ej: DELETE 204)
      if (res.status === 204) {
        return null;
      }

      // Intentar parsear JSON
      const data = await res.json().catch(() => null);

      // Si no fue exitosa la respuesta
      if (!res.ok) {
        const errorMsg = (data && data.error) || `Error ${res.status}`;
        throw new Error(errorMsg);
      }

      return data;
    } catch (err) {
      console.error("❌ Error en GMApi.request:", err.message);
      throw err;
    }
  },

  /**
   * GET — Obtener recursos
   */
  get(path) {
    return this.request(path);
  },

  /**
   * POST — Crear recursos
   */
  post(path, body) {
    return this.request(path, {
      method: "POST",
      body: JSON.stringify(body)
    });
  },

  /**
   * PATCH — Actualizar recursos
   */
  patch(path, body) {
    return this.request(path, {
      method: "PATCH",
      body: JSON.stringify(body)
    });
  },

  /**
   * PUT — Reemplazar recursos
   */
  put(path, body) {
    return this.request(path, {
      method: "PUT",
      body: JSON.stringify(body)
    });
  },

  /**
   * DELETE — Eliminar recursos
   */
  del(path) {
    return this.request(path, {
      method: "DELETE"
    });
  },

  /**
   * ─────────────────────────────────────────────────────────
   *  MÉTODOS ESPECÍFICOS DE NEGOCIO
   * ─────────────────────────────────────────────────────────
   */

  /**
   * Autentica un usuario con email y contraseña
   */
  async login(email, password) {
    const data = await this.post("/api/auth/login", { email, password });
    // El backend devuelve { token, usuario }
    this.guardarSesion(data.token, data.usuario);
    return data;
  },

  /**
   * Obtiene el usuario actual (verificar que el token sea válido)
   */
  async obtenerUsuarioActual() {
    return this.get("/api/auth/me");
  },

  /**
   * ─── PEDIDOS ───────────────────────────────────────────
   */

  /**
   * GET /api/pedidos — obtener lista de pedidos con filtros opcionales
   * @param {string} estatus - "En Proceso", "Pausado", "Finalizado"
   * @param {string} sacador - nombre del sacador
   */
  async obtenerPedidos(estatus = null, sacador = null) {
    let path = "/api/pedidos";
    const params = [];
    if (estatus) params.push(`estatus=${encodeURIComponent(estatus)}`);
    if (sacador) params.push(`sacador=${encodeURIComponent(sacador)}`);
    if (params.length) path += "?" + params.join("&");

    return this.get(path);
  },

  /**
   * GET /api/pedidos/:id — obtener un pedido específico
   */
  async obtenerPedido(id) {
    return this.get(`/api/pedidos/${id}`);
  },

  /**
   * POST /api/pedidos — crear nuevo pedido
   */
  async crearPedido(numero_pedido, sacador, cantidad_referencias, hora_inicio, tiene_equipo = false, auxiliares = []) {
    return this.post("/api/pedidos", {
      numero_pedido,
      sacador,
      cantidad_referencias,
      hora_inicio,
      tiene_equipo,
      auxiliares
    });
  },

  /**
   * PATCH /api/pedidos/:id — actualizar pedido (segmentos, auxiliares, estatus)
   */
  async actualizarPedido(id, updates) {
    return this.patch(`/api/pedidos/${id}`, updates);
  },

  /**
   * POST /api/pedidos/:id/auxiliares — agregar un auxiliar al equipo
   */
  async agregarAuxiliarAPedido(id, nombre) {
    return this.post(`/api/pedidos/${id}/auxiliares`, { nombre });
  },

  /**
   * PATCH /api/pedidos/:id/finalizar — finalizar pedido y crear historial
   */
  async finalizarPedido(id, cantidad_sacada, bultos, monto_final, hora_fin, participantes) {
    return this.patch(`/api/pedidos/${id}/finalizar`, {
      cantidad_sacada,
      bultos,
      monto_final,
      hora_fin,
      tiempo_total_segundos: 0, // Se calcula en el backend si es necesario
      tiempo_por_producto_segundos: 0,
      participantes
    });
  },

  /**
   * DELETE /api/pedidos/:id — eliminar pedido
   */
  async eliminarPedido(id) {
    return this.del(`/api/pedidos/${id}`);
  },

  /**
   * ─── HISTORIAL ────────────────────────────────────────
   */

  /**
   * GET /api/historial — obtener historial de pedidos completados
   * @param {string} desde - fecha inicio (YYYY-MM-DD)
   * @param {string} hasta - fecha fin (YYYY-MM-DD)
   * @param {string} sacador - filtrar por sacador
   */
  async obtenerHistorial(desde = null, hasta = null, sacador = null) {
    let path = "/api/historial";
    const params = [];
    if (desde) params.push(`desde=${encodeURIComponent(desde)}`);
    if (hasta) params.push(`hasta=${encodeURIComponent(hasta)}`);
    if (sacador) params.push(`sacador=${encodeURIComponent(sacador)}`);
    if (params.length) path += "?" + params.join("&");

    return this.get(path);
  },

  /**
   * PUT /api/historial/:id — actualizar un registro de historial
   */
  async actualizarHistorial(id, datos) {
    return this.put(`/api/historial/${id}`, datos);
  },

  /**
   * ─── SACADORES ──────────────────────────────────────────
   */

  /**
   * GET /api/sacadores — obtener lista de sacadores
   * @param {boolean|null} activo - true/false para filtrar, null para traer todos
   */
  async obtenerSacadores(activo = null) {
    let path = "/api/sacadores";
    if (activo !== null) path += `?activo=${activo ? "true" : "false"}`;
    return this.get(path);
  },

  /**
   * GET /api/sacadores/:id — obtener un sacador específico
   */
  async obtenerSacador(id) {
    return this.get(`/api/sacadores/${id}`);
  },

  /**
   * POST /api/sacadores — crear un nuevo sacador
   * @param {object} datos - { nombre, activo, horario_entrada, salida_lun_jue,
   *                            salida_viernes, salida_sabado, almuerzo_inicio,
   *                            almuerzo_fin, breaks: [{hora, duracion_min}] }
   */
  async crearSacador(datos) {
    return this.post("/api/sacadores", datos);
  },

  /**
   * PATCH /api/sacadores/:id — actualizar un sacador existente
   */
  async actualizarSacador(id, updates) {
    return this.patch(`/api/sacadores/${id}`, updates);
  },

  /**
   * DELETE /api/sacadores/:id — eliminar un sacador
   */
  async eliminarSacador(id) {
    return this.del(`/api/sacadores/${id}`);
  },

  /**
   * ─── HORAS EXTRAS ──────────────────────────────────────
   */

  /**
   * GET /api/horas-extras — obtener reglas de horas extras
   */
  async obtenerHorasExtras() {
    return this.get("/api/horas-extras");
  },

  /**
   * POST /api/horas-extras — crear nueva regla de horas extras
   */
  async crearHoraExtra(tipo, fecha, hora_salida, sacadores = null, hora_entrada = null, nota = null) {
    return this.post("/api/horas-extras", {
      tipo,
      fecha,
      sacadores,
      hora_entrada,
      hora_salida,
      nota
    });
  },

  /**
   * PATCH /api/horas-extras/:id — activar/desactivar regla
   */
  async actualizarHoraExtra(id, activa) {
    return this.patch(`/api/horas-extras/${id}`, { activa });
  },

  /**
   * ─── USUARIOS ───────────────────────────────────────────
   */

  /**
   * GET /api/usuarios — obtener lista de usuarios (solo admin)
   */
  async obtenerUsuarios() {
    const data = await this.get("/api/usuarios");
    return data.usuarios;
  },

  /**
   * GET /api/usuarios/:id — obtener un usuario específico
   */
  async obtenerUsuario(id) {
    const data = await this.get(`/api/usuarios/${id}`);
    return data.usuario;
  },

  /**
   * POST /api/usuarios — crear un nuevo usuario
   */
  async crearUsuario(nombre, email, password, rol = "operador") {
    const data = await this.post("/api/usuarios", { nombre, email, password, rol });
    return data.usuario;
  },

  /**
   * PATCH /api/usuarios/:id — actualizar usuario (nombre, email, rol, activo, password opcional)
   */
  async actualizarUsuario(id, updates) {
    const data = await this.patch(`/api/usuarios/${id}`, updates);
    return data.usuario;
  },

  /**
   * DELETE /api/usuarios/:id — eliminar usuario
   */
  async eliminarUsuario(id) {
    return this.del(`/api/usuarios/${id}`);
  },

  /**
   * DELETE /api/horas-extras/:id — eliminar regla
   */
  async eliminarHoraExtra(id) {
    return this.del(`/api/horas-extras/${id}`);
  }
};

// Exportar para uso en módulos (si aplica)
if (typeof module !== "undefined" && module.exports) {
  module.exports = GMApi;
}
