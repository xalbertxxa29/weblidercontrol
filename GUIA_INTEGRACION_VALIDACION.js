/**
 * GUÍA DE INTEGRACIÓN - Sistema de Validación de Rondas
 * 
 * Este archivo contiene ejemplos de cómo integrar la validación de rondas
 * en tu aplicación web existente (menu.js, script.js, etc.)
 */

// ============================================================================
// 1. MOSTRAR NOTIFICACIONES DE RONDAS INCUMPLIDAS EN EL DASHBOARD
// ============================================================================

/**
 * Función para cargar notificaciones de rondas incumplidas
 * Agrega esto a tu menu.js
 */
async function cargarNotificacionesIncumplidas() {
  const auth = firebase.auth();
  const usuario = auth.currentUser;
  
  if (!usuario) return;

  try {
    const db = firebase.database();
    
    // Escuchar cambios en tiempo real
    db.ref('NOTIFICACIONES').child(usuario.uid).on('value', (snapshot) => {
      const notificaciones = snapshot.val() || {};
      const alertas = Object.values(notificaciones)
        .filter(n => n.tipo === 'RONDA_INCUMPLIDA' && !n.leida);

      // Mostrar badge con número de alertas no leídas
      actualizarBadgeAlertas(alertas.length);

      // Mostrar lista de alertas
      if (alertas.length > 0) {
        mostrarPanelAlertas(alertas);
      }
    });

  } catch (error) {
    console.error('Error cargando notificaciones:', error);
  }
}

/**
 * Actualizar badge de notificaciones en el sidebar
 */
function actualizarBadgeAlertas(cantidad) {
  const badge = document.getElementById('badge-alertas');
  
  if (cantidad > 0) {
    if (!badge) {
      const btn = document.querySelector('[data-target="view-incidencias"]');
      const newBadge = document.createElement('span');
      newBadge.id = 'badge-alertas';
      newBadge.className = 'badge-alerta';
      newBadge.textContent = cantidad;
      btn.appendChild(newBadge);
    } else {
      badge.textContent = cantidad;
    }
  } else if (badge) {
    badge.remove();
  }
}

/**
 * Mostrar panel con alertas de rondas incumplidas
 */
function mostrarPanelAlertas(alertas) {
  const contenedor = document.getElementById('panel-alertas') || crearPanelAlertas();
  
  let html = `
    <div class="alertas-container">
      <h3>⚠️ Rondas Incumplidas (${alertas.length})</h3>
      <div class="alertas-list">
  `;
  
  alertas.forEach((alerta, index) => {
    html += `
      <div class="alerta-item" data-alerta-id="${index}">
        <div class="alerta-header">
          <span class="alerta-asunto">${alerta.asunto}</span>
          <button class="btn-cerrar-alerta" onclick="marcarComoLeida(${index})">✕</button>
        </div>
        <div class="alerta-body">
          <p><strong>Agente:</strong> ${alerta.datos.agente || 'N/A'}</p>
          <p><strong>Cliente:</strong> ${alerta.datos.cliente || 'N/A'}</p>
          <p><strong>Fecha:</strong> ${new Date(alerta.timestamp).toLocaleString('es-ES')}</p>
        </div>
      </div>
    `;
  });
  
  html += `
      </div>
    </div>
  `;
  
  contenedor.innerHTML = html;
  contenedor.style.display = 'block';
}

/**
 * Crear panel de alertas si no existe
 */
function crearPanelAlertas() {
  const panel = document.createElement('div');
  panel.id = 'panel-alertas';
  panel.className = 'panel-alertas';
  document.body.appendChild(panel);
  return panel;
}

/**
 * Marcar notificación como leída
 */
async function marcarComoLeida(alertaId) {
  const usuario = firebase.auth().currentUser;
  if (!usuario) return;

  try {
    const db = firebase.database();
    
    // Obtener todas las notificaciones
    const snapshot = await db.ref('NOTIFICACIONES').child(usuario.uid).get();
    const notificaciones = snapshot.val() || {};
    
    // Encontrar y marcar como leída
    let contador = 0;
    for (const key in notificaciones) {
      if (contador === alertaId) {
        await db.ref(`NOTIFICACIONES/${usuario.uid}/${key}`).update({
          leida: true
        });
        break;
      }
      contador++;
    }
    
    // Recargar notificaciones
    cargarNotificacionesIncumplidas();
    
  } catch (error) {
    console.error('Error al marcar como leída:', error);
  }
}

// ============================================================================
// 2. VALIDAR RONDAS INCUMPLIDAS AL INICIAR LA APP
// ============================================================================

/**
 * Ejecutar validación al cargar la app
 * Agrega esto al final de menu.js o en el evento de login
 */
async function inicializarValidacionRondas() {
  const usuario = firebase.auth().currentUser;
  
  if (!usuario) {
    console.log('Usuario no autenticado, validación de rondas deshabilitada');
    return;
  }

  try {
    console.log('✓ Iniciando validación de rondas...');
    
    // Cargar notificaciones de rondas incumplidas
    cargarNotificacionesIncumplidas();
    
    // Ejecutar validación cada 5 minutos
    setInterval(() => {
      validarRondasPendientes();
    }, 5 * 60 * 1000);
    
  } catch (error) {
    console.error('Error inicializando validación:', error);
  }
}

// ============================================================================
// 3. VALIDACIÓN LOCAL EN EL CLIENTE (REDUNDANCIA)
// ============================================================================

/**
 * Validar rondas pendientes cuando el usuario abre la app
 */
async function validarRondasPendientes() {
  try {
    const db = firebase.database();
    const hoy = formatearFecha(new Date());
    
    // Obtener todas las rondas programadas
    const snapshot = await db.ref('RONDAS_PROGRAMADAS').get();
    
    if (!snapshot.exists()) {
      return;
    }

    const rondas = snapshot.val();
    
    for (const rondasId in rondas) {
      const ronda = rondas[rondasId];
      
      // Verificar si debe ejecutarse hoy
      if (!debeEjecutarseHoy(ronda, hoy)) {
        continue;
      }

      // Verificar si pasó el tiempo límite
      const { tiempoLimiteAlcanzado } = verificarTiempoLimite(
        ronda.hora_fin,
        ronda.tolerancia_minutos || 0,
        new Date()
      );

      if (!tiempoLimiteAlcanzado) {
        continue;
      }

      // Verificar si fue completada
      const fueCompletada = await db
        .ref(`RONDAS_COMPLETADAS/${rondasId}/${hoy}`)
        .get();

      if (fueCompletada.exists()) {
        continue;
      }

      // Si llegamos aquí, la ronda está incumplida
      console.warn(`⚠️ Ronda incumplida detectada: ${rondasId}`);
      mostrarAlertaRondaIncumplida(ronda, rondasId, hoy);
    }

  } catch (error) {
    console.error('Error en validación local:', error);
  }
}

/**
 * Mostrar alerta visual en la app
 */
function mostrarAlertaRondaIncumplida(ronda, rondasId, fecha) {
  const mensaje = `
🚨 ALERTA: Ronda Incumplida

Ronda: ${ronda.nombre}
Agente: ${ronda.agente}
Cliente: ${ronda.cliente}
Fecha: ${fecha}
Hora Fin Esperada: ${ronda.hora_fin}

La ronda no fue completada dentro del tiempo permitido.
  `;
  
  // Mostrar como toast/notificación
  UI.showAlert(mensaje, 'warning');
  
  // También mostrar en un modal más formal
  mostrarModalAlertaIncumplida(ronda, rondasId, fecha);
}

/**
 * Mostrar modal con detalles de la ronda incumplida
 */
function mostrarModalAlertaIncumplida(ronda, rondasId, fecha) {
  const modal = document.createElement('div');
  modal.className = 'modal-alerta-incumplida';
  modal.innerHTML = `
    <div class="modal-content">
      <h2>⚠️ Ronda Incumplida</h2>
      <p>La siguiente ronda no fue completada dentro del tiempo permitido:</p>
      
      <table class="detalle-ronda">
        <tr>
          <td><strong>Ronda:</strong></td>
          <td>${ronda.nombre}</td>
        </tr>
        <tr>
          <td><strong>Agente:</strong></td>
          <td>${ronda.agente}</td>
        </tr>
        <tr>
          <td><strong>Cliente:</strong></td>
          <td>${ronda.cliente}</td>
        </tr>
        <tr>
          <td><strong>Unidad:</strong></td>
          <td>${ronda.unidad}</td>
        </tr>
        <tr>
          <td><strong>Hora de Fin:</strong></td>
          <td>${ronda.hora_fin}</td>
        </tr>
        <tr>
          <td><strong>Tolerancia:</strong></td>
          <td>${ronda.tolerancia_minutos} minutos</td>
        </tr>
        <tr>
          <td><strong>Fecha:</strong></td>
          <td>${fecha}</td>
        </tr>
      </table>
      
      <div class="modal-buttons">
        <button class="btn btn-primary" onclick="this.parentElement.parentElement.parentElement.remove()">
          Cerrar
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  modal.style.display = 'block';
}

// ============================================================================
// 4. FUNCIONES AUXILIARES
// ============================================================================

function debeEjecutarseHoy(ronda, fechaHoy) {
  if (!ronda.frecuencia) return false;

  const diaSemana = new Date(`${fechaHoy}T00:00:00`).toLocaleDateString('es-ES', {
    weekday: 'long'
  }).toUpperCase();

  const frecuencia = (ronda.frecuencia || '').toUpperCase();

  if (frecuencia === 'DIARIA') return true;
  if (frecuencia === 'LUNES_VIERNES' && ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES'].includes(diaSemana)) return true;
  if (frecuencia === 'FINES_SEMANA' && ['SÁBADO', 'DOMINGO'].includes(diaSemana)) return true;
  if (frecuencia.includes(diaSemana)) return true;

  return false;
}

function verificarTiempoLimite(horaFin, toleranciaMinutos = 0, ahora = new Date()) {
  const [horas, minutos] = horaFin.split(':').map(Number);
  
  const tiempoLimite = new Date(ahora);
  tiempoLimite.setHours(horas, minutos, 0, 0);
  tiempoLimite.setMinutes(tiempoLimite.getMinutes() + toleranciaMinutos);

  const ahoraTime = ahora.getTime();
  const tiempoLimiteTime = tiempoLimite.getTime();
  const minutosRestantes = Math.ceil((tiempoLimiteTime - ahoraTime) / 60000);

  return {
    tiempoLimiteAlcanzado: ahoraTime > tiempoLimiteTime,
    minutosRestantes: Math.max(minutosRestantes, 0)
  };
}

function formatearFecha(fecha) {
  const año = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${año}-${mes}-${dia}`;
}

// ============================================================================
// 5. INVOCAR INICIALIZACIÓN CUANDO EL USUARIO LOGEA
// ============================================================================

// Agrega esto en tu script.js después de login exitoso:
/*
firebase.auth().onAuthStateChanged((user) => {
  if (user) {
    console.log('Usuario autenticado:', user.email);
    inicializarValidacionRondas(); // ← AGREGAR ESTA LÍNEA
  } else {
    console.log('Usuario no autenticado');
  }
});
*/

// ============================================================================
// ESTILOS CSS RECOMENDADOS (agrega a menu.css)
// ============================================================================

/*
.panel-alertas {
  position: fixed;
  top: 20px;
  right: 20px;
  background: white;
  border-left: 4px solid #ff6b6b;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 20px;
  max-width: 400px;
  max-height: 500px;
  overflow-y: auto;
  z-index: 9999;
}

.alertas-container h3 {
  color: #ff6b6b;
  margin: 0 0 15px 0;
}

.alerta-item {
  padding: 12px;
  border: 1px solid #ffdddd;
  border-radius: 4px;
  margin-bottom: 10px;
  background: #fff5f5;
}

.alerta-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.alerta-asunto {
  font-weight: bold;
  color: #333;
}

.btn-cerrar-alerta {
  background: none;
  border: none;
  color: #ff6b6b;
  cursor: pointer;
  font-size: 20px;
  padding: 0;
}

.alerta-body p {
  margin: 4px 0;
  font-size: 12px;
  color: #666;
}

.modal-alerta-incumplida {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.modal-alerta-incumplida .modal-content {
  background: white;
  padding: 30px;
  border-radius: 8px;
  max-width: 500px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.detalle-ronda {
  width: 100%;
  margin: 20px 0;
  border-collapse: collapse;
}

.detalle-ronda td {
  padding: 8px;
  border-bottom: 1px solid #eee;
}

.modal-buttons {
  margin-top: 20px;
  text-align: right;
}

.badge-alerta {
  background: #ff6b6b;
  color: white;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
  position: absolute;
  top: -8px;
  right: -8px;
}
*/
