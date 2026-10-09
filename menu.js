// ============================================================
//  MENÚ LATERAL COMPARTIDO
//  Dibuja el mismo menú, en el mismo orden, en todas las páginas
//  y marca la página actual. Llena el primer elemento con
//  [data-menu] (un <ul> o un <nav>).
// ============================================================
(function () {
  const ICONOS = {
    dashboard: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/>',
    pedidos: '<circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L21 8H6"/>',
    historial: '<path d="M21 8 12 3 3 8v8l9 5 9-5V8Z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>',
    reportes: '<path d="M4 20V11"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>',
    sacadores: '<path d="M17 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1"/><circle cx="10" cy="8" r="3.4"/><path d="M23 20v-1a4 4 0 0 0-3-3.87"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/>',
    configuracion: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z"/>',
  };

  const ITEMS = [
    { href: "dashboard.html",     texto: "Dashboard",           icono: "dashboard" },
    { href: "index.html",         texto: "Pedidos",             icono: "pedidos" },
    { href: "Historial.html",     texto: "Pedidos finalizados", icono: "historial" },
    { href: "Reportes.html",      texto: "Reportes",            icono: "reportes" },
    { href: "Sacadores.html",     texto: "Sacadores",           icono: "sacadores" },
    { href: "configuracion.html", texto: "Configuración",       icono: "configuracion" },
  ];

  function paginaActual() {
    const archivo = decodeURIComponent(location.pathname.split("/").pop() || "index.html");
    return archivo.toLowerCase();
  }

  function dibujar() {
    const cont = document.querySelector("[data-menu]");
    if (!cont) return;
    const actual = paginaActual();
    const esLista = cont.tagName === "UL";

    const html = ITEMS.map((it) => {
      const activo = it.href.toLowerCase() === actual;
      const a =
        `<a href="${it.href}"${activo ? ' class="active activo" aria-current="page"' : ""}>` +
        `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONOS[it.icono]}</svg>` +
        `<span>${it.texto}</span></a>`;
      return esLista ? `<li>${a}</li>` : a;
    }).join("");

    cont.innerHTML = html;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", dibujar);
  } else {
    dibujar();
  }
})();
