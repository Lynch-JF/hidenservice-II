const API_SHEET = "https://api.sheetbest.com/sheets/d766bed7-9735-49db-82da-201848842e3d";
const API_KEY = "Ht$%NGa5MFpVGL8A$kpJiSKVU%#Q6GS575b2lB-yCIS5opwQ#g!1kPhaTSNZu@8k"; // Reemplaza con tu API Key de Sheet.best

let resumenSacadores = []; 
let pedidosFiltrados = []; 
let graficaTiempo = null;

// ---------- Funciones de fecha ----------
function esMismaFecha(f1, f2) {
  return f1.getFullYear() === f2.getFullYear() &&
         f1.getMonth() === f2.getMonth() &&
         f1.getDate() === f2.getDate();
}

function estaMismaSemana(fecha, referencia) {
  const diaSemana = referencia.getDay();
  const inicio = new Date(referencia);
  inicio.setDate(referencia.getDate() - diaSemana);
  inicio.setHours(0,0,0,0);

  const fin = new Date(inicio);
  fin.setDate(inicio.getDate() + 6);
  fin.setHours(23,59,59,999);

  return fecha >= inicio && fecha <= fin;
}

function obtenerNombreMes(mes) {
  const nombres = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  return nombres[mes] || "Mes desconocido";
}

// ---------- Filtrar pedidos ----------
function obtenerPedidosFiltrados(rango) {
  return fetch(API_SHEET)
    .then(res => res.json())
    .then(data => {
      const ahora = new Date();
      return data.filter(pedido => {
        const fechaStr = (pedido["HoraFin "] || pedido["HoraFin"] || "").trim();
        const fecha = new Date(fechaStr);
        if (isNaN(fecha)) return false;

        switch (rango) {
          case "hoy": return esMismaFecha(fecha, ahora);
          case "ayer": {
            const ayer = new Date(ahora);
            ayer.setDate(ahora.getDate() - 1);
            return esMismaFecha(fecha, ayer);
          }
          case "semana": return estaMismaSemana(fecha, ahora);
          case "mes": return fecha.getMonth() === ahora.getMonth() && fecha.getFullYear() === ahora.getFullYear();
          case "mesPasado": {
            const mesPasado = new Date(ahora);
            mesPasado.setMonth(ahora.getMonth() - 1);
            return fecha.getMonth() === mesPasado.getMonth() && fecha.getFullYear() === mesPasado.getFullYear();
          }
          case "todos": return true;
          default: return false;
        }
      });
    });
}

// ---------- Renderizar tabla resumen ----------
function renderizarTablaResumenSacadores(resumen) {
  const tbody = document.querySelector("#tabla-pedidos-filtrados tbody");
  if (!tbody) return;

  if (resumen.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5">No se encontraron datos.</td></tr>`;
    return;
  }

  tbody.innerHTML = resumen.map((item,i) => `
    <tr>
      <td>${i+1}</td>
      <td>${item.sacador}</td>
      <td>${item.totalProductos}</td>
      <td>${item.totalPedidos}</td>
      <td>${item.promedioTiempo.toFixed(2)} min/producto</td>
    </tr>
  `).join("");
}

// ---------- Actualizar conteo ----------
function actualizarConteoPedidos(totalPedidos) {
  const conteoDiv = document.getElementById("conteo-pedidos");
  if (conteoDiv) {
    conteoDiv.textContent = `📦 Total de pedidos en este periodo: ${totalPedidos}`;
  }
}

// ---------- Filtrar y renderizar resumen ----------
function filtrarPedidos(rango) {
  if (rango === "ningun") {
    renderizarTablaResumenSacadores([]);
    actualizarConteoPedidos(0);
    document.getElementById("mensaje").textContent = "Seleccione una opción para ver los datos.";
    return;
  } else {
    document.getElementById("mensaje").textContent = "";
  }

  obtenerPedidosFiltrados(rango)
    .then(pedidos => {
      const sacadoresMap = {};

      pedidos.forEach(pedido => {
        const sacador = (pedido["Sacador "] || pedido["Sacador"] || "").trim();
        if (!sacador || sacador.includes("/")) return; // Excluir equipos

        const cantidad = parseInt(pedido["CantidadProductos "] || pedido["CantidadProductos"] || "0",10);
        const tiempoPorProducto = parseFloat(pedido["Grafica"]);

        if (!sacadoresMap[sacador]) {
          sacadoresMap[sacador] = { totalProductos:0, totalPedidos:0, sumaTiempos:0, cantidadTiempos:0 };
        }

        sacadoresMap[sacador].totalProductos += cantidad;
        sacadoresMap[sacador].totalPedidos++;
        if (!isNaN(tiempoPorProducto)) {
          sacadoresMap[sacador].sumaTiempos += tiempoPorProducto;
          sacadoresMap[sacador].cantidadTiempos++;
        }
      });

      resumenSacadores = Object.entries(sacadoresMap).map(([sacador,datos]) => ({
        sacador,
        totalProductos: datos.totalProductos,
        totalPedidos: datos.totalPedidos,
        promedioTiempo: datos.cantidadTiempos > 0 ? (datos.sumaTiempos / datos.cantidadTiempos) : 0
      }));

      // Ordenar de mayor a menor tiempo promedio
      resumenSacadores.sort((a,b) => b.promedioTiempo - a.promedioTiempo);

      renderizarTablaResumenSacadores(resumenSacadores);
      actualizarConteoPedidos(pedidos.length);
      actualizarGraficaTiempos(resumenSacadores);
    })
    .catch(err => {
      console.error("❌ Error al filtrar pedidos:", err);
      renderizarTablaResumenSacadores([]);
      actualizarConteoPedidos(0);
    });
}

// ---------- Actualizar gráfico ----------
function actualizarGraficaTiempos(resumen) {
  const ctx = document.getElementById("grafica-tiempo").getContext("2d");
  const labels = resumen.map(item => item.sacador);
  const data = resumen.map(item => item.promedioTiempo);

  if (graficaTiempo) {
    graficaTiempo.data.labels = labels;
    graficaTiempo.data.datasets[0].data = data;
    graficaTiempo.update();
  } else {
    graficaTiempo = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: '⏱️ Tiempo promedio (min/producto)',
          data,
          backgroundColor: 'rgba(54, 162, 235, 0.5)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 1,
        }]
      },
      options: {
        responsive: true,
        plugins: { legend:{display:true}, tooltip:{enabled:true} },
        scales: {
          y: { beginAtZero:true, title:{display:true,text:'Minutos'} },
          x: { title:{display:true,text:'Sacadores'} }
        }
      }
    });
  }
}

// ---------- Top 3 sacadores más rápidos ----------
function obtenerTop3SacadoresRapidos() {
  fetch(API_SHEET)
    .then(res => res.json())
    .then(data => {
      const ahora = new Date();
      const mesActual = ahora.getMonth();
      const añoActual = ahora.getFullYear();
      const tiempos = {};

      data.forEach(pedido => {
        const sacador = (pedido["Sacador "] || pedido["Sacador"] || "").trim();
        if (!sacador || sacador.includes("/")) return;

        const fechaFin = new Date(pedido["HoraFin "] || pedido["HoraFin"] || "");
        const tiempoPorProducto = parseFloat(pedido["Grafica"]);

        if (!isNaN(fechaFin) && fechaFin.getMonth() === mesActual && fechaFin.getFullYear() === añoActual && !isNaN(tiempoPorProducto)) {
          if (!tiempos[sacador]) tiempos[sacador] = { total:0, count:0 };
          tiempos[sacador].total += tiempoPorProducto;
          tiempos[sacador].count += 1;
        }
      });

      const promedios = Object.entries(tiempos).map(([sacador,datos]) => ({
        sacador,
        promedio: datos.total/datos.count
      }));

      const top3 = promedios.sort((a,b)=>a.promedio-b.promedio).slice(0,3);
      mostrarRankingRapidos(top3);
    })
    .catch(err=>console.error("❌ Error al obtener ranking:", err));
}

function mostrarRankingRapidos(top3) {
  const lista = document.getElementById("lista-top-sacadores");
  lista.innerHTML = top3.map((item,i)=>`
    <li><span>${["🥇","🥈","🥉"][i]||""}</span> <strong>${item.sacador}</strong>: ${item.promedio.toFixed(2)} min/prod</li>
  `).join("");
}

// ---------- Historial ganadores ----------
function mostrarHistorialGanadores() {
  fetch(API_SHEET)
    .then(res => res.json())
    .then(data => {
      const historial = {};

      data.forEach(pedido => {
        const fecha = new Date(pedido["HoraFin "] || pedido["HoraFin"] || "");
        if (isNaN(fecha)) return;

        const mes = fecha.getMonth();
        const año = fecha.getFullYear();
        const claveMes = `${año}-${mes}`;
        const sacador = (pedido["Sacador "] || pedido["Sacador"] || "Desconocido").trim();

        if (!historial[claveMes]) historial[claveMes] = {};
        historial[claveMes][sacador] = (historial[claveMes][sacador]||0)+1;
      });

      const ganadores = Object.entries(historial).map(([mesClave,sacadores])=>{
        const [año,mes] = mesClave.split("-");
        const mesNombre = obtenerNombreMes(parseInt(mes));
        const [nombreGanador,cantidad] = Object.entries(sacadores)
          .sort((a,b)=>b[1]-a[1])[0];
        return { mes:`${mesNombre} ${año}`, ganador:nombreGanador, cantidad };
      });

      renderizarHistorial(ganadores);
    })
    .catch(err=>console.error("❌ Error al obtener historial:",err));
}

function renderizarHistorial(ganadores) {
  const container = document.getElementById("historial-ganadores");
  if (!container) return;

  container.innerHTML = `
    <ul class="historial-lista">
      ${ganadores.sort((a,b)=>new Date(b.mes)-new Date(a.mes))
        .map(g=>`<li><strong>${g.mes}</strong>: ${g.ganador} (${g.cantidad} pedidos)</li>`).join("")}
    </ul>
  `;
}

function mostrarPedidosEnProgreso() {
  fetch(API_SHEET, { headers: { "Authorization": `Bearer ${API_KEY}` } })
    .then(res => res.json())
    .then(data => {
      const pedidosProgreso = data.filter(p => {
        const estatus = (p["Estatus"] || "").trim();
        const horaFin = (p["HoraFin "] || p["HoraFin"] || "").trim();
        return estatus === "En Proceso... 📃" || !horaFin;
      });

      const lista = document.getElementById("lista-pedidos-progreso");
      if (!lista) {
        console.error("❌ No se encontró el contenedor de pedidos en progreso");
        return;
      }

      if (pedidosProgreso.length === 0) {
        lista.innerHTML = `<li>No hay pedidos en progreso.</li>`;
        return;
      }

      lista.innerHTML = pedidosProgreso.map(p => `
        <li style="padding:5px 0; border-bottom:1px solid #eee;">
          <strong>${(p["Sacador"] || "Sin nombre").trim()}</strong> 
          - Productos: ${p["CantidadReferencias"] || 0} 
          - Hora Inicio: ${p["HoraInicio"] || "-"}
        </li>
      `).join("");
    })
    .catch(err => console.error("❌ Error al mostrar pedidos en progreso:", err));
}


function cargarPedidosEnProceso() {
  fetch("https://api.sheetbest.com/sheets/30e3fbb6-d751-4bc7-bf1c-4012867c53c3")
    .then(res => res.json())
    .then(data => {
      const tbody = document.querySelector("#tabla-pedidos tbody");
      tbody.innerHTML = "";

      // Filtrar solo los que están "En Proceso"
      const enProceso = data.filter(p => 
        String(p.Estatus).toLowerCase().includes("en proceso")
      );

      if (enProceso.length === 0) {
        const fila = document.createElement("tr");
        fila.innerHTML = `<td colspan="4" style="text-align:center;">No hay pedidos en proceso</td>`;
        tbody.appendChild(fila);
        return;
      }

      enProceso.forEach(pedido => {
        const fila = document.createElement("tr");
        fila.innerHTML = `
          <td>${pedido.NumeroPedido || ""}</td>
          <td>${pedido.Sacador || ""}</td>
          <td>${pedido.CantidadReferencias || ""}</td>
          <td>${pedido.HoraInicio || ""}</td>
        `;
        tbody.appendChild(fila);
      });
    })
    .catch(err => console.error("❌ Error cargando pedidos en proceso:", err));
}

setInterval(cargarPedidosEnProceso, 10000);
cargarPedidosEnProceso();



// ---------- Auto-refresh cada 5 min ----------
function iniciarAutoRefreshPedidos() {
  mostrarPedidosEnProgreso(); // Primera carga
  setInterval(mostrarPedidosEnProgreso, 5*60*1000); // Cada 5 minutos
}

// ---------- Inicialización ----------
window.onload = () => {
  filtrarPedidos("hoy"); 
  mostrarHistorialGanadores();
  obtenerTop3SacadoresRapidos();
  iniciarAutoRefreshPedidos(); // Panel de pedidos en progreso
};





let currentSlide = 0;
const slides = document.querySelectorAll(".slideshow .slide");

function showSlide(index) {
  slides.forEach((slide, i) => {
    slide.style.display = (i === index) ? "block" : "none";
  });
}

function nextSlide() {
  currentSlide = (currentSlide + 1) % slides.length;
  showSlide(currentSlide);
}

// Iniciar
showSlide(currentSlide);
setInterval(nextSlide, 8000); // Cambia cada 8 segundos