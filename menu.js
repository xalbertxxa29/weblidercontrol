// === FIX: Chart.js resize loop protection & responsiveness ===
(function () {
  try {
    if (window.Chart && Chart.defaults) {
      Chart.defaults.maintainAspectRatio = false;
      Chart.defaults.responsive = true;     // keeps tree-shaking safe
      Chart.defaults.resizeDelay = 200;     // throttle resize to avoid loops
    }
  } catch (e) { /* noop */ }
})();

// === Registrar plugin de etiquetas y color por defecto según tema ===
(function () {
  try {
    if (window.ChartDataLabels && window.Chart?.register) {
      Chart.register(ChartDataLabels);
    }
    if (window.Chart && Chart.defaults) {
      const ink = getComputedStyle(document.documentElement)
        .getPropertyValue('--fg')?.trim() || '#111';
      Chart.defaults.color = ink; // tooltips/legend/ticks por defecto
    }
  } catch (e) { /* noop */ }
})();

// Helper global para obtener unidades (accesible en todo el script)
async function getUnidadesFromClienteUnidad(cliente) {
  if (!cliente) return [];
  try {
    const firestore = firebase.firestore();
    const result = [];

    // 1. Try Field (Legacy support)
    const doc = await firestore.collection('CLIENTE_UNIDAD').doc(cliente).get();
    if (doc.exists) {
      const data = doc.data();
      if (data.unidades && Array.isArray(data.unidades)) result.push(...data.unidades);
      if (data.UNIDADES && Array.isArray(data.UNIDADES)) result.push(...data.UNIDADES);
    }

    // 2. Try Subcollection (Standard)
    const snap = await firestore.collection('CLIENTE_UNIDAD').doc(cliente).collection('UNIDADES').get();
    snap.forEach(d => result.push(d.id));

    // Unique and Sort
    return [...new Set(result)].sort();
  } catch (e) {
    console.error('Error fetching units (Global):', e);
  }
  return [];
}

document.addEventListener('DOMContentLoaded', () => {

  // Registrar Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('SW registrado:', reg.scope))
      .catch(err => console.error('Error SW:', err));
  }

  // Registrar plugins de Chart.js
  if (typeof ChartDataLabels !== 'undefined') {
    Chart.register(ChartDataLabels);
  }

  // Evita doble ejecución del mismo script
  if (window.__wiredCuadernoInc__) { /* already wired */ } else {
    window.__wiredCuadernoInc__ = true;

    // ============================================================================
    // 1) CONFIGURACIÓN E INICIALIZACIÓN DE FIREBASE
    // ============================================================================
    const COLLECTIONS = {
      USERS: 'USUARIOS',
      CLIENT_UNITS: 'CLIENTE_UNIDAD',
      LOGBOOK: 'CUADERNO',
      INCIDENTS: 'INCIDENCIAS_REGISTRADAS',
      HM_INCIDENTS: 'INCIDENCIASHYM_REGISTRADAS'
    };

    if (!firebase.apps.length) {
      firebase.initializeApp(window.firebaseConfig);
    }
    const auth = firebase.auth();
    const db = window.db = firebase.firestore();

    // Habilitar persistencia Offline (DESHABILITADO TEMPORALMENTE POR CONFLICTO DE VERSIONES SDK)
    /*
    db.enablePersistence({ synchronizeTabs: true })
      .catch((err) => {
        if (err.code == 'failed-precondition') {
          console.warn('Persistencia falló: Multiples pestañas abiertas.');
        } else if (err.code == 'unimplemented') {
          console.warn('Persistencia no soportada por el navegador.');
        }
      });
    */

    // ============================================================================
    // 2) SELECTORES DE ELEMENTOS DEL DOM Y ESTADO GLOBAL
    // ============================================================================

    // --- Layout y Navegación Principal ---
    const sidebar = document.getElementById('sidebar');
    const burgerBtn = document.getElementById('burger');
    const menuToggleBtn = document.getElementById('menuToggleBtn');
    const menuOverlay = document.getElementById('menu-overlay');
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view');
    const logoutBtn = document.getElementById('logoutBtn');
    const avatarEl = document.getElementById('avatar');
    const userNameEl = document.getElementById('userName');
    const userMetaEl = document.getElementById('userMeta');

    // --- Usuarios ---
    const usersTbody = document.getElementById('usersTbody');
    const usersCountEl = document.getElementById('usersCount');

    // --- Cliente/Unidad ---
    const clienteUnidadSearchInput = document.getElementById('clienteUnidadSearchInput');
    const clienteUnidadTbody = document.getElementById('clienteUnidadTbody');
    const cuAgregarClienteBtn = document.getElementById('cuAgregarClienteBtn');
    const cuAgregarUnidadBtn = document.getElementById('cuAgregarUnidadBtn');
    const cuAgregarPuestoBtn = document.getElementById('cuAgregarPuestoBtn');

    // --- Cuaderno ---
    const cuadernoClienteSelect = document.getElementById('cuaderno-cliente');
    const cuadernoUnidadSelect = document.getElementById('cuaderno-unidad');
    const cuadernoFechaInicio = document.getElementById('cuaderno-fecha-inicio');
    const cuadernoFechaFin = document.getElementById('cuaderno-fecha-fin');
    const cuadernoTbody = document.getElementById('cuadernoTbody');
    const cuadernoBtnBuscar = document.getElementById('cuaderno-btn-buscar');
    const cuadernoBtnLimpiar = document.getElementById('cuaderno-btn-limpiar');
    const cuadernoBtnExportar = document.getElementById('cuaderno-btn-exportar');
    const cuadernoBtnImprimirPDF = document.getElementById('cuaderno-btn-imprimir-pdf');

    // --- Incidencias (nuevo) ---
    const incFechaInicio = document.getElementById('incidencias-fecha-inicio');
    const incFechaFin = document.getElementById('incidencias-fecha-fin');
    const incCliente = document.getElementById('incidencias-cliente');
    const incUnidad = document.getElementById('incidencias-unidad');
    const incEstado = document.getElementById('incidencias-estado');
    const incBtnBuscar = document.getElementById('incidencias-btn-buscar');
    const incBtnLimpiar = document.getElementById('incidencias-btn-limpiar');
    const incBtnExportar = document.getElementById('incidencias-btn-exportar');
    const incidenciasTbody = document.getElementById('incidenciasTbody');

    // --- Tiempo de Conexión ---
    const tiempoConexionFechaInicio = document.getElementById('tiempo-conexion-fecha-inicio');
    const tiempoConexionFechaFin = document.getElementById('tiempo-conexion-fecha-fin');
    const tiempoConexionCliente = document.getElementById('tiempo-conexion-cliente');
    const tiempoConexionUnidad = document.getElementById('tiempo-conexion-unidad');
    const tiempoConexionUsuario = document.getElementById('tiempo-conexion-usuario');
    const tiempoConexionBtnBuscar = document.getElementById('tiempo-conexion-btn-buscar');
    const tiempoConexionBtnLimpiar = document.getElementById('tiempo-conexion-btn-limpiar');
    const tiempoConexionBtnExportar = document.getElementById('tiempo-conexion-btn-exportar');
    const tiempoConexionBtnPdf = document.getElementById('tiempo-conexion-btn-pdf');
    const tiempoConexionTbody = document.getElementById('tiempoConexionTbody');

    // ====== Cuaderno: carga de filtros (Cliente/Unidad) desde colección CUADERNO ======
    async function loadCuadernoFilters() {
      try {
        if (!cuadernoClienteSelect && !cuadernoUnidadSelect) return;
        // Reducido de 2000 a 500 para mejor rendimiento
        const snap = await getQueryWithClienteFilter(COLLECTIONS.LOGBOOK).orderBy('__name__', 'desc').limit(500).get();
        const rows = snap.docs.map(d => d.data());
        const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

        const clientes = uniq(rows.map(r => r.cliente));
        const unidades = uniq(rows.map(r => r.unidad));

        // Obtener filtros del usuario
        const clienteDelUsuario = window.accessControl?.getClienteFilter();
        const esCliente = !!clienteDelUsuario;

        if (cuadernoClienteSelect) {
          // ✅ CORRECCIÓN: Bloquear cliente para usuarios CLIENTE
          const fillClienteSelect = (el, values, preselected = null, disabled = false) => {
            if (!el) return;
            el.disabled = disabled;
            let html = '';
            if (disabled && preselected) {
              html = `<option value="${preselected}" selected disabled>${preselected}</option>`;
            } else {
              html = '<option value="">Todas</option>';
              html += values.map(c => {
                const selected = preselected && c === preselected ? ' selected' : '';
                return `<option value="${c}"${selected}>${c}</option>`;
              }).join('');
            }
            el.innerHTML = html;
          };
          fillClienteSelect(cuadernoClienteSelect, clientes, clienteDelUsuario, esCliente);
        }
        if (cuadernoUnidadSelect) {
          const ac = window.accessControl;
          // ✅ CORRECCIÓN: Filtrar unidades por las permitidas al usuario CLIENTE
          let unidadesPermitidas = unidades;
          if (ac && ac.userType === 'CLIENTE') {
            const userAssignedUnits = ac.getUnidadesAsignadas();
            if (userAssignedUnits && userAssignedUnits.length > 0) {
              unidadesPermitidas = unidades.filter(u => userAssignedUnits.includes(u));
            }
          }

          if (ac && ac.userType === 'CLIENTE' && unidadesPermitidas.length === 1) {
            cuadernoUnidadSelect.innerHTML = `<option value="${unidadesPermitidas[0]}">${unidadesPermitidas[0]}</option>`;
            cuadernoUnidadSelect.disabled = true;
            cuadernoUnidadSelect.style.backgroundColor = '#e2e8f0';
          } else {
            cuadernoUnidadSelect.innerHTML = '<option value="">Todas</option>' +
              unidadesPermitidas.map(u => `<option value="${u}">${u}</option>`).join('');
            cuadernoUnidadSelect.disabled = false;
          }
        }
      } catch (e) { }
    }

    // --- Incidencias: cargar filtros únicos (Cliente/Unidad/Estado) ---
    let incidenciasFiltersLoaded = false;
    async function loadIncidenciasFilters() {
      try {
        // Reducido de 5000 a 1000 para mejor rendimiento
        const snap = await getQueryWithClienteFilter(COLLECTIONS.INCIDENTS).orderBy('__name__', 'desc').limit(1000).get();
        const rows = snap.docs.map(d => d.data());
        const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

        const clientes = uniq(rows.map(r => r.cliente));
        const unidades = uniq(rows.map(r => r.unidad));
        const estados = uniq(rows.map(r => r.estado));

        // Obtener filtros del usuario
        const clienteDelUsuario = accessControl?.getClienteFilter();
        const unidadDelUsuario = accessControl?.getUnidadFilter?.();
        const esCliente = !!clienteDelUsuario; // Si hay clienteFiltro, es CLIENTE; si no, es ADMIN

        // Función para llenar select con soporte para deshabilitado
        const fillSelect = (el, values, preselectedValue = null, disabled = false) => {
          if (!el) return;
          el.disabled = disabled;
          let html = '';
          if (disabled && preselectedValue) {
            // Si está deshabilitado, mostrar solo el valor seleccionado
            html = `<option value="${preselectedValue}" selected disabled>${preselectedValue}</option>`;
          } else {
            html = '<option value="">Todos</option>';
            html += values.map(v => {
              const selected = preselectedValue && v === preselectedValue ? ' selected' : '';
              return `<option value="${v}"${selected}>${v}</option>`;
            }).join('');
          }
          el.innerHTML = html;
        };

        // Si es CLIENTE: Cliente bloqueado, Unidad libre (mostrando sus unidades), Estados libre
        // Si es ADMIN: Todo libre
        fillSelect(incCliente, clientes, clienteDelUsuario, esCliente);

        // ✅ CORRECCIÓN: Filtrar unidades por las permitidas al usuario CLIENTE
        let unidadesPermitidas = unidades;
        if (accessControl && accessControl.userType === 'CLIENTE') {
          const userAssignedUnits = accessControl.getUnidadesAsignadas();
          if (userAssignedUnits && userAssignedUnits.length > 0) {
            unidadesPermitidas = unidades.filter(u => userAssignedUnits.includes(u));
          }
        }

        if (accessControl && accessControl.userType === 'CLIENTE' && unidadesPermitidas.length === 1) {
          fillSelect(incUnidad, unidadesPermitidas, unidadesPermitidas[0], true);
          if (incUnidad) incUnidad.style.backgroundColor = '#e2e8f0';
        } else {
          fillSelect(incUnidad, unidadesPermitidas, unidadDelUsuario, false);
        }
        fillSelect(incEstado, estados, null, false);

      } catch (e) {
      }
    }

    // Cargar filtros para Tiempo de Conexión
    async function loadTiempoConexionFilters() {
      try {
        // Cargar caché de usuarios PRIMERO (Lógica existente preservada)
        const usuariosCache = {};
        let usuariosSnap = await db.collection(COLLECTIONS.USERS).get();

        let usuarios = usuariosSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Si es SUPERVISOR, filtrar para excluir usuarios con TIPOACCESO = 'ADMIN'
        if (accessControl?.isSupervisor()) {
          usuarios = usuarios.filter(u => !u.TIPOACCESO || u.TIPOACCESO !== 'ADMIN');
        }

        usuarios.forEach(userData => {
          usuariosCache[userData.id] = {
            NOMBRES: userData.NOMBRES || '',
            APELLIDOS: userData.APELLIDOS || '',
            cliente: userData.CLIENTE || '',
            unidad: userData.UNIDAD || ''
          };
        });

        // Cargar listado de usuarios basado en registros recientes ? 
        // El código original usaba los registros de CONTROL_TIEMPOS_USUARIOS para filtrar qué usuarios mostrar.
        // Mantenemos esa lógica para el filtro de "Usuario".
        let rows = [];
        try {
          const snap = await getQueryWithClienteFilter('CONTROL_TIEMPOS_USUARIOS').orderBy('__name__', 'desc').limit(1000).get();
          rows = snap.docs.map(d => d.data());
        } catch (e) { console.warn("Error cargando usuarios recientes TC", e); }


        // ============================================
        // NUEVA LÓGICA DE FILTROS (MASTER DATA)
        // ============================================
        const ac = window.accessControl;

        // Referencia a elementos (variables globales en menu.js)
        if (tiempoConexionCliente && tiempoConexionUnidad) {

          if (ac?.userType === 'CLIENTE') {
            const c = ac.clienteAsignado;

            // 1. Bloquear Cliente
            tiempoConexionCliente.innerHTML = `<option value="${c}">${c}</option>`;
            tiempoConexionCliente.disabled = true;

            // 2. Obtener Unidades (Master Data)
            let units = [];
            if (typeof getUnidadesFromClienteUnidad === 'function') {
              units = await getUnidadesFromClienteUnidad(c);
            }
            if (!units || !units.length) {
              const doc = await db.collection('CLIENTE_UNIDAD').doc(c).get();
              if (doc.exists) {
                const d = doc.data();
                units = d.unidades || d.UNIDADES || [];
              }
            }

            // 3. Filtrar permitidas
            const allowed = ac.getUnidadesAsignadas();
            if (allowed && allowed.length > 0) units = units.filter(u => allowed.includes(u));
            units.sort();

            // 4. Configurar Unidad
            if (units.length === 1) {
              tiempoConexionUnidad.innerHTML = `<option value="${units[0]}">${units[0]}</option>`;
              tiempoConexionUnidad.disabled = true;
              tiempoConexionUnidad.style.backgroundColor = '#e2e8f0';
            } else {
              tiempoConexionUnidad.innerHTML = '<option value="">Todas</option>' +
                units.map(u => `<option value="${u}">${u}</option>`).join('');
              tiempoConexionUnidad.disabled = false;
              tiempoConexionUnidad.style.backgroundColor = '';
            }

          } else {
            // ADMIN: Cargar Todo
            const snapC = await db.collection('CLIENTE_UNIDAD').get();
            const clients = snapC.docs.map(d => d.id).sort();

            tiempoConexionCliente.innerHTML = '<option value="">Todos</option>' +
              clients.map(c => `<option value="${c}">${c}</option>`).join('');
            tiempoConexionCliente.disabled = false;

            tiempoConexionUnidad.innerHTML = '<option value="">Todas</option>';
            tiempoConexionUnidad.disabled = false;
          }
        }

        // Usuarios - siempre mostrar todos los disponibles (de la query reciente)
        if (tiempoConexionUsuario) {
          const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
          const usuariosIds = uniq(rows.map(r => r.usuarioID || r.usuario).filter(Boolean));

          tiempoConexionUsuario.innerHTML = '<option value="">Todos</option>' +
            usuariosIds.map(uid => {
              const userData = usuariosCache[uid];
              const label = userData ? `${userData.NOMBRES} ${userData.APELLIDOS}` : uid;
              return `<option value="${uid}">${label}</option>`;
            }).join('');
        }

        tiempoConexionFiltersLoaded = true;
      } catch (e) {
        console.error("Error loadTiempoConexionFilters:", e);
      }
    }

    // Función auxiliar para obtener unidades por cliente
    async function getUnidadesByCliente(cliente) {
      const usuariosSnap = await db.collection(COLLECTIONS.USERS).where('CLIENTE', '==', cliente).get();
      const unidades = new Set();
      usuariosSnap.forEach(doc => {
        const userData = doc.data();
        if (userData.UNIDAD) unidades.add(userData.UNIDAD);
      });
      return Array.from(unidades).sort((a, b) => a.localeCompare(b, 'es'));
    }

    // Función auxiliar para calcular la duración entre dos fechas
    function calcularDuracionTiempo(horaInicio, horaCierre) {
      if (!horaInicio || !horaCierre) return '--';

      let inicio, fin;

      // Convertir a Date si son Timestamp de Firebase
      if (horaInicio.toDate && typeof horaInicio.toDate === 'function') {
        inicio = horaInicio.toDate();
      } else if (typeof horaInicio === 'string') {
        inicio = new Date(horaInicio);
      } else {
        inicio = horaInicio;
      }

      if (horaCierre.toDate && typeof horaCierre.toDate === 'function') {
        fin = horaCierre.toDate();
      } else if (typeof horaCierre === 'string') {
        fin = new Date(horaCierre);
      } else {
        fin = horaCierre;
      }

      if (!(inicio instanceof Date) || !(fin instanceof Date) || Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
        return '--';
      }

      const diffMs = fin.getTime() - inicio.getTime();
      if (diffMs < 0) return '--';

      const horas = Math.floor(diffMs / (1000 * 60 * 60));
      const minutos = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const segundos = Math.floor((diffMs % (1000 * 60)) / 1000);

      if (horas > 0) {
        return `${horas}h ${minutos}m ${segundos}s`;
      } else if (minutos > 0) {
        return `${minutos}m ${segundos}s`;
      } else {
        return `${segundos}s`;
      }
    }

    // Función para llenar la tabla de Tiempo de Conexión con datos de USUARIOS
    async function fillTiempoConexionTable(rows) {
      if (!tiempoConexionTbody) return;

      // Cache de usuarios para evitar búsquedas repetidas
      const usuariosCache = {};

      // Cargar todos los usuarios de Firebase en caché
      try {
        let usuariosSnap = await db.collection(COLLECTIONS.USERS).get();

        let usuarios = usuariosSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Si es SUPERVISOR, filtrar para excluir usuarios con TIPOACCESO = 'ADMIN'
        if (accessControl?.isSupervisor()) {
          usuarios = usuarios.filter(u => !u.TIPOACCESO || u.TIPOACCESO !== 'ADMIN');
        }

        usuarios.forEach(userData => {
          usuariosCache[userData.id] = {
            nombres: userData.NOMBRES || '',
            apellidos: userData.APELLIDOS || '',
            cliente: userData.CLIENTE || '',
            unidad: userData.UNIDAD || ''
          };
        });
      } catch (e) {
      }

      // Array para guardar datos enriquecidos
      const enrichedRows = [];

      tiempoConexionTbody.innerHTML = rows.map(r => {
        // Extraer usuario ID
        const usuarioID = r.usuarioID || r.usuario || '--';

        // Buscar en caché
        const usuarioData = usuariosCache[usuarioID] || {};
        const nombreCompleto = usuarioData.nombres && usuarioData.apellidos
          ? `${usuarioData.nombres} ${usuarioData.apellidos}`
          : usuarioID;
        const cliente = usuarioData.cliente || '--';
        const unidad = usuarioData.unidad || '--';

        // Extraer fecha e hora de inicio
        let fechaInicio = '--';
        let horaInicio = '--';
        let fechaObj = null;
        if (r.horaInicio) {
          fechaObj = r.horaInicio.toDate ? r.horaInicio.toDate() : new Date(r.horaInicio);
          if (fechaObj instanceof Date && !Number.isNaN(fechaObj.getTime())) {
            fechaInicio = fechaObj.toLocaleDateString('es-PE');
            horaInicio = fechaObj.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          }
        }

        // Extraer hora de fin
        let horaFin = '--';
        if (r.horaCierre) {
          const fechaObjFin = r.horaCierre.toDate ? r.horaCierre.toDate() : new Date(r.horaCierre);
          if (fechaObjFin instanceof Date && !Number.isNaN(fechaObjFin.getTime())) {
            horaFin = fechaObjFin.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          }
        }

        // Calcular duración
        const duracion = calcularDuracionTiempo(r.horaInicio, r.horaCierre);

        // Guardar datos enriquecidos
        enrichedRows.push({
          usuarioID: usuarioID,
          nombreCompleto: nombreCompleto,
          cliente: cliente,
          unidad: unidad,
          fechaInicio: fechaInicio,
          horaInicio: horaInicio,
          horaFin: horaFin,
          duracion: duracion,
          horaInicioObj: r.horaInicio,
          horaCierreObj: r.horaCierre
        });

        return `<tr>
        <td>${nombreCompleto}</td>
        <td>${cliente}</td>
        <td>${unidad}</td>
        <td>${fechaInicio}</td>
        <td>${horaInicio}</td>
        <td>${horaFin}</td>
        <td style="font-weight: 600; color: #3b82f6;">${duracion}</td>
      </tr>`;
      }).join('');

      // Guardar datos enriquecidos en el dataset
      tiempoConexionTbody.dataset.rows = JSON.stringify(enrichedRows);
    }

    // Hook: cuando entro a la vista Cuaderno, cargo filtros una vez
    let cuadernoFiltersLoaded = false;
    let tiempoConexionFiltersLoaded = false;

    document.addEventListener('click', (ev) => {
      const toCuaderno = ev.target.closest('[data-target="view-cuaderno"]');
      if (toCuaderno && !cuadernoFiltersLoaded) {
        cuadernoFiltersLoaded = true;
        loadCuadernoFilters();
      }
      const toInc = ev.target.closest('[data-target="view-incidencias"]');
      if (toInc && !incidenciasFiltersLoaded) {
        loadIncidenciasFilters();
      }
      const toTiempoConexion = ev.target.closest('[data-target="view-tiempo-conexion"]');
      if (toTiempoConexion && !tiempoConexionFiltersLoaded) {
        tiempoConexionFiltersLoaded = true;
        loadTiempoConexionFilters();
      }
    });

    // --- Overlays y Diálogos ---
    const overlay = document.getElementById('overlay');
    const olTitle = document.getElementById('olTitle');
    const olSub = document.getElementById('olSub');
    const olBar = document.getElementById('olBar');
    const dialog = document.getElementById('dialog');
    const dialogIcon = document.getElementById('dialogIcon');
    const dialogTitle = document.getElementById('dialogTitle');
    const dialogMessage = document.getElementById('dialogMessage');
    const dialogActions = document.getElementById('dialogActions');
    const toast = document.getElementById('toast');

    // --- Modales de edición (Usuarios / Cliente-Unidad) ---
    const editModal = document.getElementById('editModal');
    const editForm = document.getElementById('editForm');
    const editCancelBtn = document.getElementById('editCancel');
    const editSaveBtn = document.getElementById('editSave');
    const editNombres = document.getElementById('editNombres');
    const editApellidos = document.getElementById('editApellidos');
    const editCliente = document.getElementById('editCliente');
    const editUnidad = document.getElementById('editUnidad');
    const editTipo = document.getElementById('editTipo');
    const editEstado = document.getElementById('editEstado');

    const cuEditModal = document.getElementById('cuEditModal');
    const cuEditForm = document.getElementById('cuEditForm');
    const cuEditCancelBtn = document.getElementById('cuEditCancel');
    const cuEditSaveBtn = document.getElementById('cuEditSave');
    const cuEditCliente = document.getElementById('cuEditCliente');
    const cuEditUnidad = document.getElementById('cuEditUnidad');
    const cuEditPuesto = document.getElementById('cuEditPuesto');
    const cuEditClienteOriginal = document.getElementById('cuEditClienteOriginal');
    const cuEditUnidadOriginal = document.getElementById('cuEditUnidadOriginal');
    const cuEditPuestoOriginal = document.getElementById('cuEditPuestoOriginal');

    // Modal para agregar CLIENTE
    const cuAgregarClienteModal = document.getElementById('cuAgregarClienteModal');
    const cuAgregarClienteForm = document.getElementById('cuAgregarClienteForm');
    const cuAgregarClienteCancel = document.getElementById('cuAgregarClienteCancel');
    const cuNuevoCliente = document.getElementById('cuNuevoCliente');
    const cuNuevaUnidadCliente = document.getElementById('cuNuevaUnidadCliente');

    // Modal para agregar UNIDAD
    const cuAgregarUnidadModal = document.getElementById('cuAgregarUnidadModal');
    const cuAgregarUnidadForm = document.getElementById('cuAgregarUnidadForm');
    const cuAgregarUnidadCancel = document.getElementById('cuAgregarUnidadCancel');
    const cuAgregarUnidadCliente = document.getElementById('cuAgregarUnidadCliente');
    const cuNuevaUnidad = document.getElementById('cuNuevaUnidad');

    // Modal para agregar PUESTO
    const cuAgregarPuestoModal = document.getElementById('cuAgregarPuestoModal');
    const cuAgregarPuestoForm = document.getElementById('cuAgregarPuestoForm');
    const cuAgregarPuestoCancel = document.getElementById('cuAgregarPuestoCancel');
    const cuAgregarPuestoCliente = document.getElementById('cuAgregarPuestoCliente');
    const cuAgregarPuestoUnidad = document.getElementById('cuAgregarPuestoUnidad');
    const cuNuevoPuesto = document.getElementById('cuNuevoPuesto');

    // Modal Password Reset
    const modalPasswordReset = document.getElementById('modal-password-reset');
    const formPasswordReset = document.getElementById('form-password-reset');
    const inputNewPass = document.getElementById('reset-new-password');
    const inputConfirmPass = document.getElementById('reset-confirm-password');
    const btnCancelReset = document.getElementById('btn-cancel-reset');
    const btnSaveReset = document.getElementById('btn-save-reset');
    let targetResetUserId = null; // ID del usuario a resetear

    // --- Lógica Password Reset (Admin) ---
    window.openPasswordReset = (userId) => {
      targetResetUserId = userId;
      if (formPasswordReset) formPasswordReset.reset();
      openModal(modalPasswordReset);
    };

    btnSaveReset?.addEventListener('click', async () => {
      const p1 = inputNewPass?.value;
      const p2 = inputConfirmPass?.value;

      if (!p1 || p1.length < 6) {
        UI.toast('La contraseña debe tener al menos 6 caracteres.');
        return;
      }
      if (p1 !== p2) {
        UI.toast('Las contraseñas no coinciden.');
        return;
      }

      try {
        UI.showOverlay('Actualizando...', 'Procesando cambio de contraseña');

        // Llamada a Cloud Function
        const adminResetPassword = firebase.functions().httpsCallable('adminResetPassword');
        const result = await adminResetPassword({
          targetUid: targetResetUserId,
          newPassword: p1
        });

        UI.toast('Contraseña actualizada correctamente.');
        closeModal(modalPasswordReset);
      } catch (error) {
        console.error(error);
        UI.toast(`Error: ${error.message}`);
        /* Opcional: Mostrar modal de error detallado
        UI.showError('Falló el cambio de contraseña', error.message);
        */
      } finally {
        UI.hideOverlay();
      }
    });

    btnCancelReset?.addEventListener('click', () => {
      closeModal(modalPasswordReset);
    });

    // --- Estado Global ---
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    let currentUser = null;
    let cachedIncidents = [];
    let cachedUsers = [];
    let usersMap = {}; // Cache para búsqueda rápida de nombres por código de usuario
    let cachedClientesUnidades = [];
    let resumenCharts = {};
    let detalleChart = null;
    let detalleChoices = {};
    let resumenChoices = {};
    let detalleInitialized = false;
    let editingUserId = null;
    let lastDetalleData = {}; // Para guardar los datos del último detalle para exportación

    // === Paleta y utilidades de formato para gráficos ===
    const PALETTE = {
      blue: '#3b82f6',
      blueLt: '#60a5fa',
      violet: '#a78bfa',
      cyan: '#0ea5e9',
      amber: '#f59e0b',
      red: '#ef4444',
      gray: '#9ca3af',
      purple: '#8b5cf6',
      green: '#22c55e'
    };
    const nf = new Intl.NumberFormat('es-PE');
    const pf = (value, total) => total ? ((value / total) * 100).toFixed(1) : '0.0';
    const themeInk = () => getComputedStyle(document.documentElement).getPropertyValue('--fg')?.trim() || '#111';

    // Helpers genéricos
    const debounce = (fn, wait = 200) => {
      let t;
      return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(null, args), wait); };
    };
    const csvEsc = (s) => `"${(s ?? '').toString().replace(/"/g, '""')}"`;

    // Normalizador y buckets
    const norm = s => (s || '').toString().trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const BUCKETS = {
      RIESGO: ['CONDICION DE RIESGO', 'CONDICIÓN DE RIESGO'],
      CODIGOS: ['CODIGO DE SEGURIDAD Y EMERGENCIA', 'CÓDIGOS DE SEGURIDAD Y EMERGENCIA'],
      AMBIENTAL: ['ACTO DE SISTEMA MEDIO AMBIENTAL', 'ACTOS DE SISTEMA MEDIOAMBIENTAL'],
      SSO: ['ACTO DE SEGURIDAD Y SALUD OCUPACIONAL', 'ACTOS DE SEGURIDAD Y SALUD OCUPACIONAL']
    };
    const bucketOf = (tipo) => {
      const t = norm(tipo);
      for (const [k, arr] of Object.entries(BUCKETS)) {
        if (arr.some(x => t.includes(norm(x)))) return k;
      }
      return 'OTROS';
    };

    // Helpers modales
    function openModal(modal) { modal?.classList.add('show'); modal?.setAttribute('aria-hidden', 'false'); }
    function closeModal(modal) { modal?.classList.remove('show'); modal?.setAttribute('aria-hidden', 'true'); }

    // ============================================================================
    // 3) HELPERS DE UI (MODALES, TOASTS, ETC.)
    // ============================================================================
    window.UI = {
      showOverlay(title = 'Procesando…', sub = 'Conectando con el servidor') {
        if (!overlay) return;
        if (olTitle) olTitle.textContent = title;
        if (olSub) olSub.textContent = sub;
        if (olBar) olBar.style.width = '0%';
        overlay.classList.add('show');
        overlay.setAttribute('aria-hidden', 'false');
        let p = 0; const t = setInterval(() => {
          p = Math.min(100, p + Math.random() * 18);
          if (olBar) olBar.style.width = p + '%';
          if (p >= 100) clearInterval(t);
        }, 250);
      },
      hideOverlay() {
        if (!overlay) return;
        if (olBar) olBar.style.width = '100%';
        setTimeout(() => {
          overlay.classList.remove('show');
          overlay.setAttribute('aria-hidden', 'true');
        }, 260);
      },
      toast(msg) {
        if (!toast || !msg) return;
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2500);
      },
      confirm({ title = 'Confirmar', message = '', confirmText = 'Aceptar', cancelText = 'Cancelar', kind = 'warn' }) {
        if (!dialog) return Promise.resolve(false);
        if (dialogIcon) dialogIcon.textContent = kind === 'err' ? '!' : (kind === 'warn' ? '⚠' : '★');
        if (dialogTitle) dialogTitle.textContent = title;
        if (dialogMessage) dialogMessage.textContent = message;
        if (dialogActions) {
          dialogActions.innerHTML = `
          <button class="btn secondary" id="dlgCancel">${cancelText}</button>
          <button class="btn ${kind}" id="dlgYes">${confirmText}</button>`;
        }
        dialog.classList.add('show');
        return new Promise(res => {
          const close = v => { dialog.classList.remove('show'); res(v); };
          document.getElementById('dlgCancel')?.addEventListener('click', () => close(false), { once: true });
          document.getElementById('dlgYes')?.addEventListener('click', () => close(true), { once: true });
        });
      }
    };

    // ============================================================================
    // 4) LÓGICA DE NAVEGACIÓN (MENÚ LATERAL Y PESTAÑAS KPI)
    // ============================================================================
    // ============================================================================
    // 4) LÓGICA DE NAVEGACIÓN (MENÚ LATERAL Y PESTAÑAS KPI)
    // ============================================================================

    // FORZAR MENU EXPANDIDO SIEMPRE
    if (sidebar) sidebar.classList.remove('collapsed');
    if (burgerBtn) burgerBtn.style.display = 'none'; // Ocultar botón hamburguesa
    localStorage.removeItem('sidebarCollapsed'); // Limpiar preferencia anterior

    const toggleMenuMobile = () => {
      sidebar?.classList.toggle('show');
      menuOverlay?.classList.toggle('show');
    };
    menuToggleBtn?.addEventListener('click', toggleMenuMobile);
    menuOverlay?.addEventListener('click', toggleMenuMobile);

    navItems.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-target');

        // ===== VALIDAR CONTROL DE ACCESO (RESTRICCIÓN CRÍTICA) =====
        if (!accessControl) {
          UI.showError('Error de Seguridad', 'Sistema de control de acceso no disponible');
          return;
        }

        // Validar acceso a la vista
        if (!accessControl.validateViewAccess(target)) {
          const summary = accessControl.getSummary();
          UI.showError(
            '🔒 Acceso Denegado',
            `No tienes permisos para acceder a esta sección.\n\nTipo de acceso: ${summary.accessLevel} (${summary.userType})\n\nContacta al administrador si crees que esto es un error.`
          );
          return; // ← BLOQUEA AQUÍ
        }

        // Si llegó aquí, tiene permisos
        if (window.innerWidth < 1024) toggleMenuMobile();
        navItems.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        views.forEach(v => v.classList.toggle('shown', v.id === target));

        if (target === 'view-usuarios' && (!usersTbody || !usersTbody.dataset.initialized)) {
          loadUsers().catch(() => { });
          if (usersTbody) usersTbody.dataset.initialized = 'true';
        }
        if (target === 'view-cliente-unidad' && (!clienteUnidadTbody || !clienteUnidadTbody.dataset.initialized)) {
          loadClienteUnidad().catch(() => { });
          if (clienteUnidadTbody) clienteUnidadTbody.dataset.initialized = 'true';
        }
        if (target === 'view-cuaderno' && !cuadernoFiltersLoaded) {
          cuadernoFiltersLoaded = true;
          loadCuadernoFilters();
        }
        if (target === 'view-incidencias' && !incidenciasFiltersLoaded) {
          loadIncidenciasFilters();
        }
        if (target === 'view-tiempo-conexion' && !tiempoConexionFiltersLoaded) {
          tiempoConexionFiltersLoaded = true;
          if (UI && UI.showOverlay) UI.showOverlay('Cargando filtros...', 'Obteniendo clientes y unidades');
          loadTiempoConexionFilters().then(() => {
            if (UI && UI.hideOverlay) UI.hideOverlay();
          }).catch(() => {
            if (UI && UI.hideOverlay) UI.hideOverlay();
          });
        }
      });
    });

    // --- Rondas Menu Toggle ---
    const navGroup = document.querySelector('.nav-group');
    const navGroupToggle = document.querySelector('.nav-group-toggle');
    const navSubitems = document.querySelectorAll('.nav-subitem');

    navGroupToggle?.addEventListener('click', (e) => {
      e.preventDefault();
      const menu = navGroup?.querySelector('.nav-group-menu');
      if (menu) {
        menu.classList.toggle('shown');
        navGroupToggle.setAttribute('aria-expanded', menu.classList.contains('shown'));
      }
    });

    navSubitems.forEach(btn => {
      btn.addEventListener('click', () => {
        if (window.innerWidth < 1024) toggleMenuMobile();
        navItems.forEach(b => b.classList.remove('active'));
        navSubitems.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.getAttribute('data-target');
        views.forEach(v => v.classList.toggle('shown', v.id === target));
      });
    });

    const kpiSubnav = document.querySelector('.kpi-subnav');
    kpiSubnav?.addEventListener('click', (e) => {
      const targetButton = e.target.closest('.kpi-subnav-btn');
      if (!targetButton) return;

      kpiSubnav.querySelectorAll('.kpi-subnav-btn').forEach(btn => btn.classList.remove('active'));
      targetButton.classList.add('active');

      document.querySelectorAll('.kpi-subview').forEach(view => {
        view.classList.toggle('active', view.id === targetButton.dataset.target);
      });

      if (targetButton.dataset.target === 'kpi-detalle-incidentes' && !detalleInitialized) {
        initDetalleIncidentesDashboard();
      }
      if (targetButton.dataset.target === 'kpi-acceso-peatonal' && !apInitialized) {
        initAccesoPeatonalDashboard();
        apInitialized = true;
      }
      if (targetButton.dataset.target === 'kpi-detalle-acceso') {
        initDetalleAccesoDashboard();
      }
      if (targetButton.dataset.target === 'kpi-ronda-general') {
        initKpiRondaGeneral();
      }
      if (targetButton.dataset.target === 'kpi-detalle-rondas') {
        initDetalleRondas();
      }
    });

    // ============================================================================
    // 5A) LÓGICA DEL PANEL "RESUMEN"
    // ============================================================================
    // ======================================================
    // 🔄 Sincronizar filtros Cliente/Unidad (GENÉRICO)
    // ======================================================
    async function loadClienteUnidadFiltersGenerico(clienteSelectId, unidadSelectId, usarChoices = false, choicesObj = null) {
      try {
        const clienteSelect = document.getElementById(clienteSelectId);
        const unidadSelect = document.getElementById(unidadSelectId);
        if (!clienteSelect || !unidadSelect) return;

        // Obtener todos los clientes desde CLIENTE_UNIDAD
        const clientesSnapshot = await db.collection('CLIENTE_UNIDAD').get();
        const clientes = [];

        clientesSnapshot.docs.forEach(doc => {
          clientes.push(doc.id);
        });
        clientes.sort((a, b) => a.localeCompare(b, 'es'));

        // Si el usuario tiene restricción de CLIENTE
        const clienteAsignado = window.accessControl?.getClienteFilter?.();
        const unidadAsignada = window.accessControl?.getUnidadFilter?.();
        const esCliente = !!clienteAsignado;
        const tieneUnidadAsignada = !!unidadAsignada;

        console.log('=== RESTRICCIONES DE USUARIO ===');
        console.log('Cliente Asignado:', clienteAsignado);
        console.log('Unidad Asignada:', unidadAsignada);
        console.log('Es Cliente:', esCliente);
        console.log('Tiene Unidad Asignada:', tieneUnidadAsignada);

        // Función para rellenar el select de cliente
        const rellenarClientes = () => {
          if (usarChoices && choicesObj) {
            // Usando Choices.js con el objeto pasado como parámetro
            if (esCliente) {
              console.log(`Cliente restringido a: ${clienteAsignado}`);
              choicesObj.cliente.setChoices(
                [{ value: clienteAsignado, label: clienteAsignado, selected: true }],
                'value', 'label', true
              );
              // Deshabilitar el select de cliente en Choices.js
              clienteSelect.disabled = true;
              // Intentar deshabilitar el contenedor de Choices
              const choicesContainer = clienteSelect.closest('.choices');
              if (choicesContainer) {
                choicesContainer.style.opacity = '0.6';
                choicesContainer.style.pointerEvents = 'none';
                choicesContainer.title = `Restringido a ${clienteAsignado}`;
              }
            } else {
              console.log('Sin restricción de cliente - mostrando todos');
              choicesObj.cliente.setChoices(
                [{ value: 'Todos', label: 'Todos', selected: true }, ...clientes.map(c => ({ value: c, label: c }))],
                'value', 'label', true
              );
            }
          } else {
            // Usando HTML plano
            clienteSelect.innerHTML = '';
            if (esCliente) {
              clienteSelect.innerHTML = `<option value="${clienteAsignado}" selected>${clienteAsignado}</option>`;
              clienteSelect.disabled = true;
            } else {
              clienteSelect.innerHTML = '<option value="">Todos</option>' +
                clientes.map(c => `<option value="${c}">${c}</option>`).join('');
            }
          }
        };

        // Función para filtrar y rellenar unidades según el cliente seleccionado
        const actualizarUnidades = async (clienteElegido) => {
          let unidades = [];

          if (clienteElegido && clienteElegido !== 'Todos') {
            // USAR HELPER SEGURO para obtener unidades (aplica filtros de seguridad automáticamente)
            // Esto asegura que si el usuario tiene unidades asignadas en accessControl, solo vea esas.
            unidades = await getUnidadesFromClienteUnidad(clienteElegido);
          } else {
            // Obtener todas las unidades de todos los clientes (OPTIMIZADO: Paralelo)
            const promises = clientes.map(cliente =>
              db.collection('CLIENTE_UNIDAD').doc(cliente).collection('UNIDADES').get()
            );

            const snapshots = await Promise.all(promises);

            snapshots.forEach(unidadesSnapshot => {
              unidadesSnapshot.forEach(doc => {
                unidades.push(doc.id);
              });
            });

            unidades = [...new Set(unidades)]; // Eliminar duplicados
          }

          unidades.sort((a, b) => a.localeCompare(b, 'es'));

          if (usarChoices && choicesObj) {
            // Usando Choices.js con el objeto pasado como parámetro
            if (tieneUnidadAsignada) {
              // Usuario restringido a una unidad específica
              console.log(`Unidad restringida a: ${unidadAsignada}`);
              choicesObj.unidad.setChoices(
                [{ value: unidadAsignada, label: unidadAsignada, selected: true }],
                'value', 'label', true
              );
              // Deshabilitar el select de unidad
              unidadSelect.disabled = true;
              const choicesContainer = unidadSelect.closest('.choices');
              if (choicesContainer) {
                choicesContainer.style.opacity = '0.6';
                choicesContainer.style.pointerEvents = 'none';
                choicesContainer.title = `Restringido a ${unidadAsignada}`;
              }
            } else {
              // Usuario sin restricción de unidad
              choicesObj.unidad.setChoices(
                [{ value: 'Todas', label: 'Todas', selected: true }, ...unidades.map(u => ({ value: u, label: u }))],
                'value', 'label', true
              );
              // Resetear la selección de unidad a "Todas"
              // choicesObj.unidad.clearStore(); // REMOVED: Destroys the choices we just set
              choicesObj.unidad.setChoiceByValue('Todas');
            }
          } else {
            // Usando HTML plano
            if (tieneUnidadAsignada) {
              unidadSelect.innerHTML = `<option value="${unidadAsignada}" selected>${unidadAsignada}</option>`;
              unidadSelect.disabled = true;
            } else {
              unidadSelect.innerHTML = '<option value="">Todas</option>' +
                unidades.map(u => `<option value="${u}">${u}</option>`).join('');
            }
          }
        };

        // Rellenar clientes
        rellenarClientes();

        // Llenar unidades iniciales
        await actualizarUnidades(esCliente ? clienteAsignado : 'Todos');

        // Escuchar cambios de cliente (solo si no está bloqueado)
        if (!esCliente) {
          // Para Choices.js, usar el evento 'change' en el select
          clienteSelect.addEventListener('change', async (e) => {
            console.log('Cliente cambió a:', e.target.value);
            await actualizarUnidades(e.target.value);
            // Disparar renderResumen si está disponible (para resumen específicamente)
            if (typeof renderResumen === 'function' && clienteSelectId.includes('resumen')) {
              // Esperar a que las unidades se actualicen antes de renderizar
              setTimeout(() => {
                renderResumen();
              }, 100);
            }
          });
        }

      } catch (error) {
        console.error('Error al cargar filtros Cliente/Unidad:', error);
      }
    }

    // ============= FUNCIÓN GLOBALES ÚTILES =============
    async function getUnidadesFromClienteUnidad(cliente) {
      if (!cliente) return []; // Protección contra cliente nulo/vacío

      try {
        const snap = await db
          .collection('CLIENTE_UNIDAD')
          .doc(cliente)
          .collection('UNIDADES')
          .get();

        let unidadesDisponibles = snap.docs
          .map(d => d.id)
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, 'es'));

        // FILTRO DE SEGURIDAD: Si el usuario tiene unidades restringidas (array UNIDADES)
        if (window.accessControl) {
          const unidadesPermitidas = window.accessControl.getUnidadesAsignadas();
          if (unidadesPermitidas && unidadesPermitidas.length > 0) {
            // Intersección: Solo mostrar unidades que existen Y están permitidas
            unidadesDisponibles = unidadesDisponibles.filter(u => unidadesPermitidas.includes(u));
          }
        }

        return unidadesDisponibles;
      } catch (e) {
        console.error(`[KPI] Error obteniendo unidades de CLIENTE_UNIDAD:`, e);
        return [];
      }
    }

    async function loadResumenUnidadesByCliente(cliente) {
      if (!resumenChoices.unidad) return;

      console.log(`Cargando unidades para cliente: ${cliente}`);

      // OBTENER UNIDADES DIRECTAMENTE DE CLIENTE_UNIDAD (no de incidentes)
      const unidades = await getUnidadesFromClienteUnidad(cliente);
      console.log(`Unidades encontradas para ${cliente}:`, unidades);

      const unidadSelect = document.getElementById('resumen-filtro-unidad');
      if (!unidadSelect) return;

      // Destruir la instancia anterior de Choices
      if (resumenChoices.unidad) {
        resumenChoices.unidad.destroy();
      }

      // LÓGICA MEJORADA: Bloquear si es usuario CLIENTE y solo tiene 1 unidad disponible
      const ac = window.accessControl;
      const esClienteRestringido = ac && ac.userType === 'CLIENTE';

      // Si es cliente restringido y solo hay 1 unidad en la lista permitida
      if (esClienteRestringido && unidades.length === 1) {
        const unidadUnica = unidades[0];
        console.log(`[loadResumenUnidadesByCliente] Bloqueando unidad única: ${unidadUnica}`);

        unidadSelect.innerHTML = `<option value="${unidadUnica}" selected>${unidadUnica}</option>`;

        const cfg = { searchEnabled: true, itemSelectText: 'Seleccionar', placeholder: true, allowHTML: false };
        resumenChoices.unidad = new Choices('#resumen-filtro-unidad', cfg);

        // Bloquear visualmente
        unidadSelect.disabled = true;
        resumenChoices.unidad.disable(); // Deshabilitar el plugin Choices también

        // Estilo visual "plomo"
        const container = document.querySelector('#resumen-filtro-unidad').closest('.choices');
        if (container) {
          container.style.opacity = '0.6';
          container.style.pointerEvents = 'none';
          container.style.backgroundColor = '#e2e8f0'; // Plomo claro
        }
      } else {
        // Caso normal: Mostrar "Todas" + lista
        unidadSelect.innerHTML = '<option value="Todas" selected>Todas</option>' +
          unidades.map(u => `<option value="${u}">${u}</option>`).join('');

        const cfg = { searchEnabled: true, itemSelectText: 'Seleccionar', placeholder: true, allowHTML: false };
        resumenChoices.unidad = new Choices('#resumen-filtro-unidad', cfg);

        // Asegurar que esté habilitado
        unidadSelect.disabled = false;
      }
    }

    function initResumenDashboard() {
      // Defaults de fecha: últimos 30 días (si no hubiera valor)
      if (typeof $ !== 'undefined' && typeof $.fn.daterangepicker !== 'undefined') {
        const $dp = $('#resumen-filtro-fecha');
        if (!$dp.val()) {
          const start = moment().subtract(29, 'days');
          const end = moment();
          $dp.val(`${start.format('DD/MM/YYYY')} - ${end.format('DD/MM/YYYY')}`);
        }
      }

      const cfg = { searchEnabled: true, itemSelectText: 'Seleccionar', placeholder: true, allowHTML: false };
      if (window.Choices) {
        // Inicializar SOLO UNA VEZ si no existen
        if (!resumenChoices.cliente) {
          resumenChoices.cliente = new Choices('#resumen-filtro-cliente', cfg);
        }
        if (!resumenChoices.unidad) {
          resumenChoices.unidad = new Choices('#resumen-filtro-unidad', cfg);
        }
        if (!resumenChoices.categoria) {
          resumenChoices.categoria = new Choices('#resumen-filtro-categoria', cfg);
        }
        if (!resumenChoices.riesgo) {
          resumenChoices.riesgo = new Choices('#resumen-filtro-riesgo', cfg);
        }
      }

      if (typeof $ !== 'undefined' && typeof $.fn.daterangepicker !== 'undefined') {
        $('#resumen-filtro-fecha').daterangepicker({
          opens: 'left',
          locale: { format: 'DD/MM/YYYY', applyLabel: 'Aplicar', cancelLabel: 'Cancelar' }
        });
      } else {
      }

      // Cargar filtros genéricos de Cliente/Unidad
      loadClienteUnidadFiltersGenerico('resumen-filtro-cliente', 'resumen-filtro-unidad', true, resumenChoices);

      // Agregar event listeners para Choices.js en Resumen
      // Nota: Choices.js dispara eventos 'change' en el elemento select nativo
      setTimeout(() => {
        const clienteSelect = document.getElementById('resumen-filtro-cliente');
        const unidadSelect = document.getElementById('resumen-filtro-unidad');
        const categoriaSelect = document.getElementById('resumen-filtro-categoria');
        const riesgoSelect = document.getElementById('resumen-filtro-riesgo');

        // PASO 2: Agregar onChange listener al cliente que cargue unidades

        // PASO 2: Agregar onChange listener al cliente que cargue unidades
        // [REMOVED] Redundant listener handled by loadClienteUnidadFiltersGenerico
        /*
        if (clienteSelect) {
          clienteSelect.addEventListener('change', async () => {
             // ... Logic moved to generic loader ...
          });
        }
        */
        if (unidadSelect) {
          unidadSelect.addEventListener('change', () => {
            console.log('Unidad cambió');
            renderResumen();
          });
        }
        if (categoriaSelect) {
          categoriaSelect.addEventListener('change', () => {
            console.log('Categoría cambió');
            renderResumen();
          });
        }
        if (riesgoSelect) {
          riesgoSelect.addEventListener('change', () => {
            console.log('Riesgo cambió');
            renderResumen();
          });
        }
      }, 100);

      // Listener para daterangepicker
      if (typeof $ !== 'undefined') {
        $('#resumen-filtro-fecha').on('apply.daterangepicker', () => {
          console.log('Fecha cambió');
          renderResumen();
        });
      }

      document.getElementById('resumen-btn-refresh')?.addEventListener('click', renderResumen);
      queryAndRenderResumen();
    }

    async function queryAndRenderResumen() {
      UI.showOverlay('Cargando resumen…', 'Consultando incidentes (últimos 10000)');
      try {
        // Limitar a últimos 10000 incidentes para mejor rendimiento
        const snapshot = await getQueryWithClienteFilter(COLLECTIONS.INCIDENTS)
          .orderBy('__name__', 'desc')
          .limit(10000)
          .get();

        console.log(`Incidentes descargados: ${snapshot.docs.length}`);

        // PASO 2: APLICAR FILTRO DE ACCESO A LOS DATOS
        let incidentsRaw = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : (data.timestamp || new Date()),
          };
        });

        // FILTRAR DATOS ANTES DE CACHEAR
        cachedIncidents = applyAccessFilter(incidentsRaw);

        console.log(`Incidentes después de filtro de acceso: ${cachedIncidents.length} (raw: ${incidentsRaw.length})`);
        console.log('Primeros 3 incidentes cacheados:');
        cachedIncidents.slice(0, 3).forEach((d, i) => {
          console.log(`${i}: cliente=${d.cliente}, unidad=${d.unidad}, tipoIncidente=${d.tipoIncidente}, riesgo=${d.Nivelderiesgo}`);
        });

        populateResumenFilters(cachedIncidents);

        // PASO 3: Cargar unidades iniciales para el cliente actual
        const clienteActual = accessControl && accessControl.userType === 'CLIENTE'
          ? accessControl.clienteAsignado
          : 'Todos';

        console.log('Cargando unidades iniciales para:', clienteActual);
        await loadResumenUnidadesByCliente(clienteActual);

        renderResumen();
      } catch (e) {
        console.error('Error al cargar datos del resumen:', e);
        UI.toast('Error al cargar datos del resumen.');
      } finally {
        UI.hideOverlay();
      }
    }

    // ============= PASO 1: FILTRO CENTRAL DE ACCESO (OBLIGATORIO) =============
    // Aplica las restricciones de CLIENTE/UNIDAD a CUALQUIER dato
    function applyAccessFilter(rows) {
      if (!accessControl || accessControl.userType !== 'CLIENTE') {
        // ADMIN y SUPERVISOR ven todos los datos
        return rows;
      }

      // CLIENTE solo ve SU cliente asignado
      return rows.filter(r => {
        const clienteMatch = r.cliente === accessControl.clienteAsignado;
        const unidadMatch = !accessControl.unidadAsignada || r.unidad === accessControl.unidadAsignada;
        return clienteMatch && unidadMatch;
      });
    }

    // Función simplificada para cargar solo categorías y riesgos
    function populateResumenFilters(data) {
      if (!resumenChoices.categoria || !resumenChoices.riesgo) return;

      // PASO 4: NO reconstruir clientes desde data global - ya vienen filtrados
      // Cargar categorías y riesgos SOLO del data filtrado
      const categorias = [...new Set(data.map(d => bucketOf(d.tipoIncidente)).filter(Boolean))];
      const riesgos = [...new Set(data.map(d => d.Nivelderiesgo).filter(Boolean))];

      // Cargar Categorías
      if (resumenChoices.categoria && categorias.length > 0) {
        resumenChoices.categoria.setChoices(
          [{ value: 'Todos', label: 'Todas', selected: true }, ...categorias.map(c => ({ value: c, label: c }))],
          'value', 'label', false
        );
      }

      // Cargar Riesgos
      if (resumenChoices.riesgo && riesgos.length > 0) {
        resumenChoices.riesgo.setChoices(
          [{ value: 'Todos', label: 'Todos', selected: true }, ...riesgos.map(r => ({ value: r, label: r }))],
          'value', 'label', false
        );
      }

      // PASO 3: Para CLIENTE, mostrar SOLO su cliente y bloquearlo
      if (resumenChoices.cliente) {
        const ac = window.accessControl;
        if (ac && ac.userType === 'CLIENTE') {
          const clienteNombre = ac.clienteAsignado || 'Sin asignar';
          console.log(`[populateResumenFilters] Asignando Cliente: "${clienteNombre}"`);
          resumenChoices.cliente.setChoices(
            [{ value: clienteNombre, label: clienteNombre, selected: true }],
            'value', 'label', true // clearStore = true para reemplazar todo
          );

          // Bloquear el select visualmente
          const clienteSelect = document.getElementById('resumen-filtro-cliente');
          if (clienteSelect) {
            clienteSelect.disabled = true;
            clienteSelect.style.opacity = '0.6';
            clienteSelect.title = `Acceso restringido a: ${clienteNombre}`;
          }
        }
      }
    }

    // === Layout unificado para KPI (mismas alturas de cards) ===
    function applyKpiUnifiedHeights() {
      const H_SMALL = 260;
      const H_BAR = 260;
      const H_TABLE = 260;
      const H_HEATMAP = 520; // Mayor altura para el heatmap con 24 horas

      // SKIP resumen charts - they use CSS Grid sizing instead
      // setH('resumen-chart-riesgo',    H_SMALL);
      // setH('resumen-chart-categoria', H_BAR);
      // setH('resumen-chart-unidad',    H_BAR);
      // setH('resumen-chart-fecha',     H_SMALL);
      // setH('resumen-chart-mes',       H_BAR);
      setTableH('resumen-tabla-heatmap', H_HEATMAP);

      setH('detalle-chart-area', 250);
      setTableH('detalle-tbl-riesgo', H_TABLE);
      setTableH('detalle-tbl-codigos', H_TABLE);
      setTableH('detalle-tbl-ambiental', H_TABLE);
      setTableH('detalle-tbl-sso', H_TABLE);

      setH('ap-chart-fecha', H_SMALL);
      setH('ap-chart-estado', H_SMALL);
      setH('ap-chart-empresa', H_BAR);
      setH('ap-chart-unidad', H_BAR);
      setTableH('ap-tabla-heatmap', H_TABLE);

      function setH(canvasId, h) {
        const c = document.getElementById(canvasId);
        if (!c) return;
        const box = c.closest('.card, .panel, .box, .kpi-card') || c.parentElement;
        if (box) {
          box.style.height = h + 'px';
          box.style.minHeight = h + 'px';
        } else {
          c.parentElement && (c.parentElement.style.height = h + 'px');
        }
      }
      function setTableH(tableId, h) {
        const t = document.getElementById(tableId);
        if (!t) return;
        const box = t.closest('.card, .panel, .box, .kpi-card') || t.parentElement;
        if (box) {
          box.style.height = h + 'px';
          box.style.minHeight = h + 'px';
          box.style.overflow = 'auto';
        } else {
          t.parentElement && (t.parentElement.style.cssText += `height:${h}px;min-height:${h}px;overflow:auto;`);
        }
      }
    }

    function renderResumen() {
      // [EXTRA] Limpiar gráficos previos (recomendado cuando se aplican filtros)
      limpiarKPI();

      if (typeof $ === 'undefined' || typeof $.fn.daterangepicker === 'undefined') {
        console.warn('jQuery o daterangepicker no están disponibles');
        return;
      }

      if (!cachedIncidents || cachedIncidents.length === 0) {
        console.warn('No hay incidentes cacheados');
        return;
      }

      // Obtener valores de filtros - manejo seguro para Choices.js
      let clienteValue = 'Todos';
      let unidadValue = 'Todas';
      let categoriaValue = 'Todos';
      let riesgoValue = 'Todos';

      try {
        // Usar getValue(true) que devuelve el string del valor seleccionado
        if (resumenChoices.cliente) {
          const val = resumenChoices.cliente.getValue(true);
          // Si getValue devuelve un array, tomar el primer elemento
          if (Array.isArray(val) && val.length > 0) {
            clienteValue = val[0];
          } else if (typeof val === 'string' && val.length > 0) {
            clienteValue = val;
          }
          console.log('Cliente obtenido:', clienteValue, '(raw:', val, ')');
        }

        if (resumenChoices.unidad) {
          const val = resumenChoices.unidad.getValue(true);
          if (Array.isArray(val) && val.length > 0) {
            unidadValue = val[0];
          } else if (typeof val === 'string' && val.length > 0) {
            unidadValue = val;
          }
          console.log('Unidad obtenida:', unidadValue, '(raw:', val, ')');
        }

        if (resumenChoices.categoria) {
          const val = resumenChoices.categoria.getValue(true);
          if (Array.isArray(val) && val.length > 0) {
            categoriaValue = val[0];
          } else if (typeof val === 'string' && val.length > 0) {
            categoriaValue = val;
          }
          console.log('Categoría obtenida:', categoriaValue, '(raw:', val, ')');
        }

        if (resumenChoices.riesgo) {
          const val = resumenChoices.riesgo.getValue(true);
          if (Array.isArray(val) && val.length > 0) {
            riesgoValue = val[0];
          } else if (typeof val === 'string' && val.length > 0) {
            riesgoValue = val;
          }
          console.log('Riesgo obtenido:', riesgoValue, '(raw:', val, ')');
        }
      } catch (e) {
        console.error('Error obteniendo valores de filtros:', e);
      }

      const filters = {
        cliente: clienteValue,
        unidad: unidadValue,
        categoria: categoriaValue,
        riesgo: riesgoValue,
        fecha: $('#resumen-filtro-fecha').val().split(' - ')
      };

      // Debug: mostrar qué filtros se están usando
      console.log('===== FILTROS APLICADOS =====');
      console.log('Cliente:', filters.cliente);
      console.log('Unidad:', filters.unidad);
      console.log('Categoría:', filters.categoria);
      console.log('Riesgo:', filters.riesgo);
      console.log('Fecha:', filters.fecha);
      console.log('Total incidentes cacheados:', cachedIncidents.length);

      const startDate = moment(filters.fecha[0], 'DD/MM/YYYY').startOf('day');
      const endDate = moment(filters.fecha[1], 'DD/MM/YYYY').endOf('day');

      const filteredData = cachedIncidents.filter(d => {
        const d_date = moment(d.timestamp);
        const inDate = d_date.isBetween(startDate, endDate, undefined, '[]');
        const inCli = filters.cliente === 'Todos' || (d.cliente === filters.cliente);
        const inUni = filters.unidad === 'Todas' || (d.unidad === filters.unidad);
        const inCat = filters.categoria === 'Todos' || bucketOf(d.tipoIncidente) === filters.categoria;
        const inR = filters.riesgo === 'Todos' || d.Nivelderiesgo === filters.riesgo;

        // Debug para el primer incidente
        if (d_date.isSame(startDate, 'day') && inDate) {
          console.log('Incidente sample:', {
            cliente: d.cliente,
            inCli,
            unidad: d.unidad,
            inUni,
            tipoIncidente: d.tipoIncidente,
            bucket: bucketOf(d.tipoIncidente),
            inCat,
            riesgo: d.Nivelderiesgo,
            inR,
            timestamp: d.timestamp
          });
        }

        return inDate && inCli && inUni && inCat && inR;
      });

      console.log(`===== RESULTADOS =====`);
      console.log(`Incidentes filtrados: ${filteredData.length} de ${cachedIncidents.length} totales`);
      console.log('============================');

      document.getElementById('resumen-total-incidentes').textContent = filteredData.length.toLocaleString('es-PE');

      drawRiesgoChart(filteredData);
      drawCategoriaChart(filteredData);
      drawUnidadChart(filteredData);
      drawFechaChart(filteredData, startDate, endDate);
      drawMesChart(filteredData);
      renderHeatmap(filteredData);
      initializeResumenMap(filteredData);

      applyKpiUnifiedHeights();
    }

    function drawChart(canvasId, config) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;
      if (resumenCharts[canvasId]) {
        resumenCharts[canvasId].destroy();
      }
      resumenCharts[canvasId] = new Chart(canvas, config);
    }

    // Función global para resetear gráficos cuando no hay datos
    function resetChart(canvasId, type = 'bar') {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return null;

      if (resumenCharts[canvasId]) {
        resumenCharts[canvasId].destroy();
      }

      resumenCharts[canvasId] = new Chart(canvas, {
        type,
        data: {
          labels: [],
          datasets: []
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false }
          },
          scales: {
            x: { display: false },
            y: { display: false }
          }
        }
      });

      return resumenCharts[canvasId];
    }

    // ===== FUNCIÓN EXTRA (RECOMENDADO): Limpiar todos los gráficos de KPI cuando se aplican filtros =====
    function limpiarKPI() {
      console.log('[KPI] Limpiando gráficos...');
      // Destruir todos los gráficos activos
      Object.keys(resumenCharts).forEach(key => {
        if (resumenCharts[key]) {
          resumenCharts[key].destroy();
          resumenCharts[key] = null;
        }
      });
      console.log('[KPI] Gráficos limpios');
    }

    // ======================= GRÁFICOS RESUMEN =======================
    function drawRiesgoChart(data) {
      // Agrupar por nivel de riesgo
      const counts = data.reduce((acc, curr) => {
        const riesgo = curr.Nivelderiesgo || 'No definido';
        acc[riesgo] = (acc[riesgo] || 0) + 1;
        return acc;
      }, {});

      // Mapear riesgos a colores específicos
      const riesgoColors = {
        'ALTO': '#ef4444',
        'MEDIO': '#f59e0b',
        'BAJO': '#10b981',
        'CRÍTICO': '#991b1b',
        'No definido': '#9ca3af'
      };

      const labels = Object.keys(counts);
      const values = Object.values(counts);
      const total = values.reduce((a, b) => a + b, 0) || 1;
      const colors = labels.map(l => riesgoColors[l] || '#8b5cf6');

      drawChart('resumen-chart-riesgo', {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data: values,
            backgroundColor: colors,
            borderColor: 'var(--bg)',
            borderWidth: 0,
            hoverOffset: 12
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '75%', // Más delgado para aspecto moderno
          animation: { animateRotate: true, animateScale: false, duration: 800 },
          layout: { padding: 10 },
          plugins: {
            legend: {
              position: 'right', // Leyenda a la derecha
              labels: {
                color: themeInk(),
                padding: 15,
                font: { size: 12, weight: '600' },
                usePointStyle: true,
                pointStyle: 'rectRounded'
              }
            },
            tooltip: {
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              titleColor: '#1e293b',
              bodyColor: '#475569',
              borderColor: '#e2e8f0',
              borderWidth: 1,
              padding: 12,
              titleFont: { size: 14, weight: 'bold' },
              bodyFont: { size: 13 },
              displayColors: true,
              callbacks: {
                label: function (context) {
                  const v = context.raw || 0;
                  const pct = pf(v, total);
                  return `  ${nf.format(v)} casos (${pct}%)`;
                }
              }
            },
            datalabels: {
              color: (ctx) => {
                // Texto blanco para segmentos oscuros, oscuro para claros (simplificado: blanco)
                return '#fff';
              },
              formatter: (v, ctx) => {
                const pct = ((v / total) * 100);
                // Solo mostrar si es > 5% para evitar amontonamiento
                return pct > 5 ? Math.round(pct) + '%' : '';
              },
              font: { weight: 'bold', size: 12 },
              backgroundColor: (ctx) => {
                return ctx.dataset.backgroundColor[ctx.dataIndex]; // Fondo igual al color
              },
              borderRadius: 4,
              padding: 4
            }
          }
        }
      });
    }

    /**
     * Helper para envolver el canvas en un contenedor con scroll si es necesario.
     * @param {string} canvasId 
     * @param {string} direction 'x' | 'y'
     * @param {number} requiredSize Tamaño en px necesario para el gráfico
     */
    function setupChartScrollWrapper(canvasId, direction, requiredSize) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;

      // Buscar si ya existe el wrapper
      let wrapper = canvas.closest('.chart-scroll-wrapper');

      if (!wrapper) {
        // Crear estructura si no existe
        wrapper = document.createElement('div');
        wrapper.className = 'chart-scroll-wrapper';
        wrapper.style.width = '100%';
        wrapper.style.height = '100%';
        wrapper.style.minHeight = '0'; // Flex/Grid fix
        wrapper.style.position = 'relative';
        wrapper.style.overflow = 'hidden';

        // Insertar wrapper donde estaba el canvas
        canvas.parentNode.insertBefore(wrapper, canvas);

        // Contenedor interno
        const inner = document.createElement('div');
        inner.className = 'chart-inner-container';
        inner.style.position = 'relative';
        inner.style.width = '100%';
        inner.style.height = '100%';

        wrapper.appendChild(inner);
        inner.appendChild(canvas);

        // Forzar estilos al canvas para que Chart.js ocupe todo el inner
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.display = 'block';
      }

      // Configurar scroll y tamaños
      const inner = wrapper.querySelector('.chart-inner-container');
      // Necesitamos el tamaño del padre del wrapper para saber si scrolear? 
      // Ojo: wrapper.clientHeight debería ser el tamaño disponible en el layout grid.
      const containerSize = direction === 'y' ? wrapper.clientHeight : wrapper.clientWidth;

      // Si el tamaño requerido es mayor al contenedor (+ buffer), activar scroll
      if (Math.max(requiredSize, 0) > containerSize + 5) {
        if (direction === 'y') {
          wrapper.style.overflowY = 'auto';
          wrapper.style.overflowX = 'hidden';
          inner.style.height = `${requiredSize}px`;
          inner.style.width = '100%';
        } else {
          wrapper.style.overflowX = 'auto';
          wrapper.style.overflowY = 'hidden';
          inner.style.width = `${requiredSize}px`;
          inner.style.height = '100%';
        }
      } else {
        // Reset a normal si cabe
        wrapper.style.overflow = 'hidden';
        inner.style.width = '100%';
        inner.style.height = '100%';
      }
    }

    function drawCategoriaChart(data) {
      if (!data || data.length === 0) {
        console.warn('No hay datos para gráfico de categoría');
        const canvas = document.getElementById('resumen-chart-categoria');
        if (canvas && resumenCharts['resumen-chart-categoria']) {
          resumenCharts['resumen-chart-categoria'].destroy();
        }
        return;
      }

      // Agrupar por tipoIncidente
      const tipoMap = data.reduce((acc, d) => {
        const tipo = (d.tipoIncidente || 'Sin especificar').trim();
        acc[tipo] = (acc[tipo] || 0) + 1;
        return acc;
      }, {});

      // Ordenar y tomar TOP 15 (Lógica Original Restaurada)
      let sorted = Object.entries(tipoMap).sort((a, b) => b[1] - a[1]);
      const topLimit = 15;

      let finalLabels = [];
      let finalValues = [];

      if (sorted.length > topLimit) {
        const top = sorted.slice(0, topLimit);
        const others = sorted.slice(topLimit);
        finalLabels = top.map(x => x[0]);
        finalValues = top.map(x => x[1]);

        // Agregar categoría "Otros"
        const otherCount = others.reduce((a, b) => a + b[1], 0);
        if (otherCount > 0) {
          finalLabels.push('Otros');
          finalValues.push(otherCount);
        }
      } else {
        finalLabels = sorted.map(x => x[0]);
        finalValues = sorted.map(x => x[1]);
      }

      const total = finalValues.reduce((a, b) => a + b, 0) || 1;

      // Colores vivos
      const bgColors = finalLabels.map((_, i) => {
        const h = 210 + (i * 10);
        return `hsla(${h}, 85%, 55%, 0.85)`;
      });
      const borderColors = finalLabels.map((_, i) => {
        const h = 210 + (i * 10);
        return `hsla(${h}, 85%, 45%, 1)`;
      });

      // Abreviar etiquetas 
      const abbreviations = finalLabels.map(text => {
        if (text === 'Otros') return text;
        if (text.length <= 15) return text;
        return text.substring(0, 13) + '...';
      });

      // NO llamamos a setupChartScrollWrapper aquí para volver al comportamiento original

      drawChart('resumen-chart-categoria', {
        type: 'bar',
        data: {
          labels: abbreviations,
          datasets: [{
            label: 'Cantidad',
            data: finalValues,
            backgroundColor: bgColors,
            borderColor: borderColors,
            borderWidth: 1,
            borderRadius: 6,
            barPercentage: 0.7,
          }]
        },
        options: {
          indexAxis: 'x', // Vertical
          responsive: true,
          maintainAspectRatio: false, // Permitir estirar
          animation: { duration: 500 },
          layout: { padding: { top: 25 } },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(15, 23, 42, 0.9)',
              padding: 12,
              cornerRadius: 6,
              titleFont: { size: 13 },
              bodyFont: { size: 13 },
              callbacks: {
                title: (ctx) => finalLabels[ctx[0].dataIndex],
                label: (c) => {
                  const pct = total > 0 ? ((c.raw / total) * 100).toFixed(1) : '0.0';
                  return ` ${c.raw} registros (${pct}%)`;
                }
              }
            },
            datalabels: {
              display: true,
              color: '#334155',
              anchor: 'end',
              align: 'top',
              offset: 2,
              font: { weight: 'bold', size: 11 },
              formatter: (value) => value > 0 ? value : ''
            }
          },
          scales: {
            x: {
              ticks: {
                autoSkip: false, // Mostrar todas
                maxRotation: 45,
                minRotation: 25,
                font: { size: 10, weight: '500' },
                color: '#64748b'
              },
              grid: { display: false }
            },
            y: {
              beginAtZero: true,
              ticks: { stepSize: 1, color: '#64748b' },
              grid: { color: '#f1f5f9' }
            }
          },
          onClick: (_evt, elements) => {
            if (!elements?.length) return;
            const idx = elements[0].index;
            const tipoSeleccionado = finalLabels[idx];
            if (tipoSeleccionado !== 'Otros') {
              try {
                const cat = bucketOf(tipoSeleccionado);
                resumenChoices.categoria?.setChoiceByValue(cat);
              } catch { /* noop */ }
              document.getElementById('resumen-btn-refresh')?.click();
            }
          }
        }
      });
    }

    function drawUnidadChart(data) {
      if (!data || data.length === 0) {
        console.warn('No hay datos para gráfico de unidad');
        resetChart('resumen-chart-unidad', 'bar');
        return;
      }

      const counts = data.reduce((acc, curr) => {
        const unidad = curr.unidad || 'No definido';
        acc[unidad] = (acc[unidad] || 0) + 1;
        return acc;
      }, {});

      // Ordenar por cantidad y tomar TOP 10 (Revertido a original)
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
      const labels = sorted.map(item => item[0]);
      const values = sorted.map(item => item[1]);
      const total = values.reduce((a, b) => a + b, 0) || 1;

      // Unwrapp si existiera wrapper previo (limpieza)
      const canvas = document.getElementById('resumen-chart-unidad');
      if (canvas) {
        const wrapper = canvas.closest('.chart-scroll-wrapper');
        if (wrapper) {
          // Mover canvas fuera y eliminar wrapper
          wrapper.parentNode.insertBefore(canvas, wrapper);
          wrapper.remove();
          // Resetear estilos que forzamos
          canvas.style.width = '';
          canvas.style.height = '';
          canvas.style.display = '';
        }
      }

      // Colores estilo Ranking
      const colors = labels.map((_, i) => {
        if (i === 0) return '#eab308'; // Oro
        if (i === 1) return '#94a3b8'; // Plata
        if (i === 2) return '#d97706'; // Bronce
        return '#3b82f6'; // Azul estándar
      });

      drawChart('resumen-chart-unidad', {
        type: 'bar', // Horizontal bar
        data: {
          labels,
          datasets: [{
            label: 'Incidentes por Unidad',
            data: values,
            backgroundColor: colors,
            borderRadius: 4,
            borderSkipped: false,
            borderColor: 'rgba(0,0,0,0.1)',
            borderWidth: 1,
            barPercentage: 0.7,
            categoryPercentage: 0.9
          }]
        },
        options: {
          indexAxis: 'y', // Horizontal
          responsive: true,
          maintainAspectRatio: false, // Permitir estirar height
          animation: { duration: 500 },
          layout: {
            padding: { top: 10, bottom: 10, left: 10, right: 30 }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(0,0,0,0.85)',
              padding: 12,
              cornerRadius: 6,
              titleFont: { size: 13, weight: 'bold' },
              callbacks: {
                label: (c) => {
                  const pct = total > 0 ? ((c.raw / total) * 100).toFixed(1) : '0.0';
                  return `${c.dataset.label}: ${new Intl.NumberFormat().format(c.raw || 0)} (${pct}%)`;
                }
              }
            },
            datalabels: {
              display: true,
              formatter: (v) => v > 0 ? new Intl.NumberFormat().format(v) : '',
              anchor: 'end',
              align: 'right', // A la derecha de la barra
              offset: 4,
              font: { weight: 'bold', size: 11 },
              color: '#334155'
            }
          },
          scales: {
            x: {
              // Eje horizontal (cantidad)
              position: 'top', // Números arriba
              ticks: { color: '#64748b', autoSkip: true, font: { size: 10 } },
              grid: { display: true, color: '#f1f5f9' }
            },
            y: {
              // Eje vertical (nombres de unidad)
              ticks: {
                color: '#334155',
                font: { size: 11, weight: '600' },
                autoSkip: false // Importante: mostrar todas las etiquetas
              },
              grid: { display: false }
            }
          },
          onClick: (_evt, elements) => {
            if (!elements?.length) return;
            const chosen = labels[elements[0].index];
            try { resumenChoices.unidad?.setChoiceByValue(chosen); } catch { /* noop */ }
            document.getElementById('resumen-btn-refresh')?.click();
          }
        }
      });
    }

    function drawFechaChart(data, start, end) {
      if (!data || data.length === 0) {
        console.warn('No hay datos para gráfico de fecha');
        resetChart('resumen-chart-fecha', 'line');
        return;
      }

      const diffDays = end.diff(start, 'days');
      let labels, counts;

      // Agrupación dinámica según rango
      if (diffDays < 60) {
        // Por día
        labels = Array.from({ length: diffDays + 1 }, (_, i) => start.clone().add(i, 'days').format('DD/MM'));
        counts = data.reduce((acc, curr) => {
          const key = moment(curr.timestamp).format('DD/MM');
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {});
      } else {
        // Por mes
        labels = moment.monthsShort();
        counts = data.reduce((acc, curr) => {
          const key = moment(curr.timestamp).format('MMM');
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {});
      }

      const values = labels.map(l => counts[l] || 0);
      const maxValue = Math.max(...values, 1);

      drawChart('resumen-chart-fecha', {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Incidentes',
            data: values,
            borderColor: '#6366f1', // Indigo
            backgroundColor: (context) => {
              const ctx = context.chart.ctx;
              const gradient = ctx.createLinearGradient(0, 0, 0, 300);
              gradient.addColorStop(0, 'rgba(99, 102, 241, 0.4)');
              gradient.addColorStop(1, 'rgba(99, 102, 241, 0.0)');
              return gradient;
            },
            tension: 0.4,
            fill: true,
            pointBackgroundColor: '#fff',
            pointBorderColor: '#6366f1',
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 600 },
          interaction: { mode: 'index', intersect: false },
          layout: { padding: { top: 20, right: 10 } },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(15, 23, 42, 0.9)',
              titleFont: { size: 13 },
              bodyFont: { size: 13 },
              padding: 12,
              cornerRadius: 6,
              displayColors: false,
              callbacks: {
                label: (c) => ` ${c.parsed.y} incidentes`
              }
            },
            datalabels: {
              display: true,
              align: 'top',
              offset: 4,
              color: '#475569',
              font: { weight: 'bold', size: 10 },
              formatter: (val) => val > 0 ? val : '' // Solo mostrar si > 0 para limpiar
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              max: Math.ceil(maxValue * 1.15), // Espacio extra para etiquetas
              ticks: { stepSize: 1, color: '#64748b' },
              grid: { color: '#f1f5f9', drawBorder: false }
            },
            x: {
              ticks: {
                autoSkip: true,
                maxTicksLimit: 15,
                color: '#64748b'
              },
              grid: { display: false }
            }
          }
        }
      });
    }

    function drawMesChart(data) {
      if (!data || data.length === 0) {
        console.warn('No hay datos para gráfico de mes');
        resetChart('resumen-chart-mes', 'bar');
        return;
      }

      const monthsData = [
        { short: 'ene', long: 'Enero', num: 0 },
        { short: 'feb', long: 'Febrero', num: 1 },
        { short: 'mar', long: 'Marzo', num: 2 },
        { short: 'abr', long: 'Abril', num: 3 },
        { short: 'may', long: 'Mayo', num: 4 },
        { short: 'jun', long: 'Junio', num: 5 },
        { short: 'jul', long: 'Julio', num: 6 },
        { short: 'ago', long: 'Agosto', num: 7 },
        { short: 'sep', long: 'Septiembre', num: 8 },
        { short: 'oct', long: 'Octubre', num: 9 },
        { short: 'nov', long: 'Noviembre', num: 10 },
        { short: 'dic', long: 'Diciembre', num: 11 }
      ];

      const counts = {};
      monthsData.forEach(m => { counts[m.short] = 0; });

      data.forEach(curr => {
        const monthNum = moment(curr.timestamp).month();
        const monthShort = monthsData[monthNum].short;
        counts[monthShort] = (counts[monthShort] || 0) + 1;
      });

      const labels = monthsData.map(m => m.long);
      const values = monthsData.map(m => counts[m.short] || 0);
      const total = values.reduce((a, b) => a + b, 0) || 1;
      const maxValue = Math.max(...values, 1);

      // Generar gradient de colores
      const colors = values.map((v) => {
        const intensity = v / maxValue;
        return `rgba(59, 130, 246, ${0.5 + intensity * 0.5})`;
      });

      drawChart('resumen-chart-mes', {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Incidentes por Mes',
            data: values,
            backgroundColor: colors,
            borderRadius: 8,
            borderSkipped: false,
            hoverBackgroundColor: 'rgba(59, 130, 246, 1)',
            borderColor: 'rgba(59, 130, 246, 0.3)',
            borderWidth: 1
          }]
        },
        options: {
          indexAxis: 'x',
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 500 },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(0,0,0,0.8)',
              padding: 12,
              cornerRadius: 8,
              titleFont: { size: 13, weight: 'bold' },
              bodyFont: { size: 12 },
              callbacks: {
                label: (c) => {
                  const pct = total > 0 ? pf(c.raw || 0, total) : '0.0';
                  return `${c.dataset.label}: ${nf.format(c.raw || 0)} (${pct}%)`;
                }
              }
            },
            datalabels: {
              display: true,
              formatter: (v) => v > 0 ? nf.format(v) : '',
              anchor: 'end',
              align: 'top',
              offset: 6,
              font: { weight: 'bold', size: 12 },
              color: themeInk()
            }
          },
          scales: {
            y: {
              ticks: { color: themeInk() },
              grid: { color: 'rgba(0,0,0,0.05)' },
              beginAtZero: true,
              max: Math.ceil(maxValue * 1.15)
            },
            x: {
              ticks: { color: themeInk(), maxRotation: 45, minRotation: 45 },
              grid: { display: false }
            }
          }
        }
      });
    }

    function renderHeatmap(data) {
      const heatmap = Array(24).fill(0).map(() => Array(7).fill(0));
      data.forEach(d => {
        const ts = moment(d.timestamp);
        const hour = ts.hour();
        const day = ts.day(); // 0=Domingo, 6=Sábado
        heatmap[hour][day]++;
      });

      const table = document.getElementById('resumen-tabla-heatmap');
      if (!table) return;
      const days = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];

      // Estilos inline para tabla y celdas
      const thStyle = 'background:#2c5aa0; color:white; padding:8px; font-size:0.75rem; text-align:center; position:sticky; top:0; z-index:10; border:1px solid #1e40af;';
      const cellStyle = 'padding:6px; font-size:0.8rem; text-align:center; border:1px solid #e2e8f0;';
      const labelStyle = 'background:#f1f5f9; color:#334155; font-weight:600; padding:6px; font-size:0.75rem; border:1px solid #e2e8f0; text-align:center; min-width:80px;';
      const totalStyle = 'background:#f8fafc; font-weight:bold; color:#1e293b; padding:6px; font-size:0.8rem; border:1px solid #e2e8f0; text-align:center;';

      let html = `<thead style="box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <tr>
          <th style="${thStyle}">HORA</th>
          ${days.map(d => `<th style="${thStyle}">${d}</th>`).join('')}
          <th style="${thStyle}">TOTAL</th>
        </tr>
      </thead><tbody>`;

      const colTotals = Array(7).fill(0);
      let maxCell = 0;

      // Calcular máximo global para escala de color
      for (let h = 0; h < 24; h++) {
        for (let d = 0; d < 7; d++) {
          maxCell = Math.max(maxCell, heatmap[h][d]);
        }
      }

      // Generar filas de 00:00 a 23:59
      for (let h = 0; h < 24; h++) {
        const hourLabel = `${String(h).padStart(2, '0')}:00 - ${String(h).padStart(2, '0')}:59`;
        let rowTotal = 0;
        let rowHtml = `<tr><td style="${labelStyle}">${hourLabel}</td>`;

        for (let d = 0; d < 7; d++) {
          const val = heatmap[h][d];
          colTotals[d] += val;
          rowTotal += val;

          rowHtml += `<td data-v="${val}" style="${cellStyle}">${val > 0 ? val : ''}</td>`;
        }
        rowHtml += `<td style="${totalStyle}">${rowTotal}</td></tr>`;
        html += rowHtml;
      }

      const grandTotal = colTotals.reduce((a, b) => a + b, 0);
      html += `</tbody>
      <tfoot>
        <tr>
          <th style="${thStyle}">TOTAL</th>
          ${colTotals.map(t => `<th style="${thStyle}">${t}</th>`).join('')}
          <th style="${thStyle}">${grandTotal}</th>
        </tr>
      </tfoot>`;

      table.innerHTML = html;
      table.style.width = '100%';
      table.style.borderCollapse = 'collapse';

      // Aplicar colores de fondo
      const cells = table.querySelectorAll('tbody td[data-v]');
      cells.forEach(td => {
        const v = +td.dataset.v || 0;
        if (v === 0) {
          td.style.backgroundColor = '#ffffff';
          td.style.color = '#cbd5e1';
          return;
        }

        const k = maxCell ? v / maxCell : 0;
        let bg, color;

        // Escala de azules a rojos profesional
        if (k < 0.2) {
          bg = '#dbeafe'; color = '#1e3a8a'; // Azul muy claro
        } else if (k < 0.4) {
          bg = '#93c5fd'; color = '#172554'; // Azul claro
        } else if (k < 0.6) {
          bg = '#fcd34d'; color = '#78350f'; // Amarillo
        } else if (k < 0.8) {
          bg = '#fb923c'; color = '#431407'; // Naranja
        } else {
          bg = '#ef4444'; color = '#ffffff'; // Rojo
        }

        td.style.backgroundColor = bg;
        td.style.color = color;
        td.style.fontWeight = 'bold';
      });

      // Ajustar altura del contenedor para ver todo sin scroll interno forzado
      const tableWrap = table.closest('.table-wrap');
      if (tableWrap) {
        tableWrap.style.height = 'auto';
        tableWrap.style.maxHeight = 'none'; // Quitar límite de altura
        tableWrap.style.overflow = 'visible';
      }

      // Ajustar tarjeta padre si existe
      const card = table.closest('.card-heatmap');
      if (card) {
        card.style.height = 'auto';
        card.style.minHeight = '600px'; // Altura mínima generosa
      }
    }

    // Variable global para el mapa de Leaflet
    let resumenMap = null;
    let resumenMapMarkers = null;

    // Coordenadas de referencia para geolocalización inteligente
    const LOCATION_COORDS = {
      // DEPARTAMENTOS / CIUDADES PRINCIPALES
      'AMAZONAS': { lat: -6.2317, lng: -77.8690 },
      'ANCASH': { lat: -9.5278, lng: -77.5278 },
      'HUARAZ': { lat: -9.5290, lng: -77.5284 },
      'CHIMBOTE': { lat: -9.0760, lng: -78.5737 },
      'APURIMAC': { lat: -13.6339, lng: -72.8814 },
      'ABANCAY': { lat: -13.6339, lng: -72.8814 },
      'AREQUIPA': { lat: -16.3989, lng: -71.5350 },
      'AYACUCHO': { lat: -13.1631, lng: -74.2237 },
      'CAJAMARCA': { lat: -7.1632, lng: -78.5003 },
      'CALLAO': { lat: -12.0560, lng: -77.1260 },
      'CUSCO': { lat: -13.5320, lng: -71.9675 },
      'CUZCO': { lat: -13.5320, lng: -71.9675 },
      'HUANCAVELICA': { lat: -12.7861, lng: -74.9760 },
      'HUANUCO': { lat: -9.9306, lng: -76.2422 },
      'ICA': { lat: -14.0678, lng: -75.7286 },
      'CHINCHA': { lat: -13.4194, lng: -76.1345 },
      'PISCO': { lat: -13.7259, lng: -76.1856 },
      'NAZCA': { lat: -14.8294, lng: -74.9431 },
      'JUNIN': { lat: -11.1582, lng: -75.9933 },
      'HUANCAYO': { lat: -12.0651, lng: -75.2049 },
      'LA LIBERTAD': { lat: -8.1116, lng: -79.0266 },
      'TRUJILLO': { lat: -8.1116, lng: -79.0266 },
      'LAMBAYEQUE': { lat: -6.7714, lng: -79.8441 },
      'CHICLAYO': { lat: -6.7714, lng: -79.8441 },
      'LIMA': { lat: -12.0464, lng: -77.0428 },
      'LORETO': { lat: -3.7437, lng: -73.2516 },
      'IQUITOS': { lat: -3.7437, lng: -73.2516 },
      'MADRE DE DIOS': { lat: -12.5933, lng: -69.1891 },
      'PUERTO MALDONADO': { lat: -12.5933, lng: -69.1891 },
      'MOQUEGUA': { lat: -17.1895, lng: -70.9328 },
      'ILO': { lat: -17.6531, lng: -71.3415 },
      'PASCO': { lat: -10.6864, lng: -76.2625 },
      'CERRO DE PASCO': { lat: -10.6864, lng: -76.2625 },
      'PIURA': { lat: -5.1945, lng: -80.6328 },
      'TALARA': { lat: -4.5772, lng: -81.2719 },
      'PAITA': { lat: -5.0933, lng: -81.1111 },
      'SULLANA': { lat: -4.9039, lng: -80.6853 },
      'PUNO': { lat: -15.8402, lng: -70.0219 },
      'JULIACA': { lat: -15.4965, lng: -70.1331 },
      'SAN MARTIN': { lat: -6.4856, lng: -76.3688 },
      'TARAPOTO': { lat: -6.4856, lng: -76.3688 },
      'MOYOBAMBA': { lat: -6.0469, lng: -76.9749 },
      'TACNA': { lat: -18.0066, lng: -70.2463 },
      'TUMBES': { lat: -3.5684, lng: -80.4571 },
      'UCAYALI': { lat: -8.3791, lng: -74.5539 },
      'PUCALLPA': { lat: -8.3791, lng: -74.5539 },

      // DISTRITOS / ZONAS DE LIMA
      'MIRAFLORES': { lat: -12.1111, lng: -77.0316 },
      'SAN ISIDRO': { lat: -12.0970, lng: -77.0360 },
      'SURCO': { lat: -12.1388, lng: -76.9953 },
      'LA MOLINA': { lat: -12.0833, lng: -76.9366 },
      'SAN BORJA': { lat: -12.1009, lng: -76.9996 },
      'ATE': { lat: -12.0255, lng: -76.9142 },
      'PURUCHUCO': { lat: -12.0483, lng: -76.9422 },
      'SANTA ANITA': { lat: -12.0435, lng: -76.9645 },
      'LURIN': { lat: -12.2743, lng: -76.8647 },
      'VILLA EL SALVADOR': { lat: -12.2227, lng: -76.9366 },
      'VILLA MARIA': { lat: -12.1565, lng: -76.9396 },
      'CHORRILLOS': { lat: -12.1760, lng: -77.0180 },
      'BARRANCO': { lat: -12.1492, lng: -77.0210 },
      'SAN MIGUEL': { lat: -12.0874, lng: -77.0864 },
      'MAGDALENA': { lat: -12.0945, lng: -77.0678 },
      'JESUS MARIA': { lat: -12.0792, lng: -77.0475 },
      'LINCE': { lat: -12.0835, lng: -77.0345 },
      'BREÑA': { lat: -12.0577, lng: -77.0504 },
      'RIMAC': { lat: -12.0315, lng: -77.0289 },
      'INDEPENDENCIA': { lat: -11.9934, lng: -77.0620 },
      'OLIVOS': { lat: -11.9904, lng: -77.0725 },
      'COMAS': { lat: -11.9320, lng: -77.0494 },
      'PUENTE PIEDRA': { lat: -11.8672, lng: -77.0747 },
      'CARABAYLLO': { lat: -11.8966, lng: -77.0224 },
      'SAN JUAN DE LURIGANCHO': { lat: -11.9793, lng: -77.0006 },
      'LURIGANCHO': { lat: -11.9443, lng: -76.7029 },
      'CHOSICA': { lat: -11.9443, lng: -76.7029 },
      'VENTANILLA': { lat: -11.8742, lng: -77.1245 },
      'BELLAVISTA': { lat: -12.0641, lng: -77.1082 },

      // CENTROS COMERCIALES / REFERENCIAS
      'JOCKEY': { lat: -12.0867, lng: -76.9757 },
      'MEGAPLAZA': { lat: -11.9934, lng: -77.0620 },
      'PLAZA NORTE': { lat: -12.0065, lng: -77.0587 },
      'MALL DEL SUR': { lat: -12.1565, lng: -76.9772 },
      'REAL PLAZA': { lat: -12.0558, lng: -77.0336 }, // Centro cívico ref
      'SALAVERRY': { lat: -12.0911, lng: -77.0501 },
      'RAMBLA': { lat: -12.0934, lng: -77.0028 },
      'AEROPUERTO': { lat: -12.0241, lng: -77.1120 }
    };

    /**
     * Intenta encontrar coordenadas basadas en palabras clave dentro del nombre de la unidad.
     * @param {string} unitName 
     * @returns {object} {lat, lng} o null si no encuentra coincidencia inteligente.
     */
    function getCoordinatesFromUnitName(unitName) {
      if (!unitName) return null;
      const normalized = unitName.toUpperCase().trim();

      // 1. Búsqueda exacta o parcial por palabras clave
      const keys = Object.keys(LOCATION_COORDS);

      // Ordenar claves por longitud descendente para priorizar "VILLA EL SALVADOR" sobre "VILLA"
      keys.sort((a, b) => b.length - a.length);

      for (const key of keys) {
        // Usar límites de palabra para evitar falsos positivos (ej: "ATE" en "LATERAL")
        // O búsqueda simple includes si la palabra es suficientemente larga
        if (normalized.includes(key)) {
          const base = LOCATION_COORDS[key];
          // Añadir pequeño jitter (ruido aleatorio) para que múltiples marcadores en el mismo sitio no se solapen perfectamente
          return {
            lat: base.lat + (Math.random() - 0.5) * 0.005,
            lng: base.lng + (Math.random() - 0.5) * 0.005
          };
        }
      }

      return null;
    }

    function initializeResumenMap(data) {
      const mapElement = document.getElementById('resumen-map');
      if (!mapElement || typeof L === 'undefined') return;

      // Destruir mapa anterior si existe
      if (resumenMap) {
        resumenMap.remove();
        resumenMap = null;
      }

      // Crear nuevo mapa centrado en Perú (Lima por defecto)
      resumenMap = L.map('resumen-map', {
        center: [-12.0464, -77.0428],
        zoom: 5,
        zoomControl: false, // Control custom
        attributionControl: false
      });

      // Mover control de zoom a esquina
      L.control.zoom({ position: 'bottomright' }).addTo(resumenMap);

      // Usar tiles de CartoDB Positron (diseño limpio y profesional)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(resumenMap);

      // Agrupar incidentes por ubicación
      const locationCounts = {};
      data.forEach(d => {
        const location = d.unidad || 'Ubicación Desconocida';
        if (!locationCounts[location]) {
          // INTENTO DE GEOLOCALIZACIÓN INTELIGENTE
          const smartCoords = getCoordinatesFromUnitName(location);

          if (smartCoords) {
            locationCounts[location] = {
              count: 0,
              lat: smartCoords.lat,
              lng: smartCoords.lng,
              isReal: true
            };
          } else {
            // Fallback: Coordenadas aleatorias alrededor de Lima si no se encuentra
            const baseLat = -12.0464;
            const baseLng = -77.0428;
            locationCounts[location] = {
              count: 0,
              lat: baseLat + (Math.random() - 0.5) * 0.1,
              lng: baseLng + (Math.random() - 0.5) * 0.1,
              isReal: false
            };
          }
        }
        locationCounts[location].count++;
      });

      const bounds = L.latLngBounds();
      let hasRealLocations = false;

      Object.entries(locationCounts).forEach(([location, info]) => {
        const { count, lat, lng, isReal } = info;
        if (isReal) hasRealLocations = true;

        // Estilo de marcador
        const size = Math.min(Math.max(30, count * 2), 60);
        const color = count > 10 ? '#ef4444' : count > 3 ? '#f59e0b' : '#3b82f6';

        const customIcon = L.divIcon({
          className: 'custom-map-marker',
          html: `<div style="
            background-color: ${color};
            width: ${size}px;
            height: ${size}px;
            border-radius: 50%;
            border: 2px solid white;
            box-shadow: 0 0 10px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 12px;
            opacity: 0.9;
          ">${count}</div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2]
        });

        L.marker([lat, lng], { icon: customIcon })
          .addTo(resumenMap)
          .bindPopup(`
            <div style="text-align:center;">
              <h4 style="margin:0 0 5px 0; color:#1e293b;">${location}</h4>
              <span style="font-size:12px; color:#64748b;">Incidentes: <strong>${count}</strong></span>
              ${!isReal ? '<br><small style="color:#94a3b8; font-style:italic;">(Ubicación no detectada)</small>' : ''}
            </div>
          `);

        bounds.extend([lat, lng]);
      });

      if (Object.keys(locationCounts).length > 0) {
        // Si hay ubicaciones reales dispersas, hacer zoom out para ver todo Perú
        // Si todo está en Lima (fallback), hacer zoom más cercano
        const padding = [50, 50];
        if (hasRealLocations) {
          resumenMap.fitBounds(bounds, { padding, maxZoom: 10 });
        } else {
          resumenMap.fitBounds(bounds, { padding, maxZoom: 11 });
        }
      }
    }


    // ============= FUNCIÓN PARA CARGAR UNIDADES POR CLIENTE (KPI DETALLE DE INCIDENTES) =============
    async function loadDetalleUnidadesByCliente(cliente) {
      if (!detalleChoices.unidad) return;

      console.log(`[DETALLE] Cargando unidades para cliente: ${cliente}`);

      // OBTENER UNIDADES DIRECTAMENTE DE CLIENTE_UNIDAD (no de incidentes)
      const unidades = await getUnidadesFromClienteUnidad(cliente);
      console.log(`[DETALLE] Unidades encontradas para ${cliente}:`, unidades);

      const unidadSelect = document.getElementById('detalle-filtro-unidad');
      if (!unidadSelect) return;

      // Destruir la instancia anterior de Choices
      if (detalleChoices.unidad) {
        detalleChoices.unidad.destroy();
      }

      const ac = window.accessControl;
      const esClienteRestringido = ac && ac.userType === 'CLIENTE';

      if (esClienteRestringido && unidades.length === 1) {
        const unidadUnica = unidades[0];
        unidadSelect.innerHTML = `<option value="${unidadUnica}" selected>${unidadUnica}</option>`;

        const cfg = { searchEnabled: true, itemSelectText: 'Seleccionar', placeholder: true, allowHTML: false };
        detalleChoices.unidad = new Choices('#detalle-filtro-unidad', cfg);

        unidadSelect.disabled = true;
        detalleChoices.unidad.disable();
        const container = unidadSelect.closest('.choices');
        if (container) {
          container.style.opacity = '0.6';
          container.style.pointerEvents = 'none';
          container.style.backgroundColor = '#e2e8f0';
        }
      } else {
        // Usuario ADMIN/SUPERVISOR o CLIENTE con múltiples unidades
        unidadSelect.innerHTML = '<option value="Todas" selected>Todas</option>' +
          unidades.map(u => `<option value="${u}">${u}</option>`).join('');

        const cfg = { searchEnabled: true, itemSelectText: 'Seleccionar', placeholder: true, allowHTML: false };
        detalleChoices.unidad = new Choices('#detalle-filtro-unidad', cfg);
      }
    }

    async function initDetalleIncidentesDashboard() {
      const cfg = { searchEnabled: true, itemSelectText: 'Seleccionar', shouldSort: false };
      detalleChoices.cliente = new Choices('#detalle-filtro-cliente', cfg);
      detalleChoices.unidad = new Choices('#detalle-filtro-unidad', cfg);
      detalleChoices.year = new Choices('#detalle-filtro-year', cfg);

      const currentYear = new Date().getFullYear();
      const years = Array.from({ length: 6 }, (_, i) => ({ value: currentYear - i, label: String(currentYear - i) }));
      detalleChoices.year.setChoices(years, 'value', 'label', true);

      // Usar la función genérica para cargar Cliente/Unidad desde CLIENTE_UNIDAD
      await loadClienteUnidadFiltersGenerico('detalle-filtro-cliente', 'detalle-filtro-unidad', true, detalleChoices);

      // Agregar listener de cliente para recargar unidades
      const clienteSelect = document.getElementById('detalle-filtro-cliente');
      if (clienteSelect) {
        clienteSelect.addEventListener('change', async () => {
          const cliente = detalleChoices.cliente.getValue(true);
          const clienteValue = Array.isArray(cliente) ? cliente[0] : cliente;

          if (clienteValue && clienteValue !== 'Todos') {
            await loadDetalleUnidadesByCliente(clienteValue);
          }

          queryAndRenderDetalle();
        });
      }

      // Configurar date pickers
      const hoy = new Date();
      const hace30Dias = new Date(hoy.getTime() - 30 * 24 * 60 * 60 * 1000);
      document.getElementById('detalle-filtro-fecha-inicio').value = hace30Dias.toISOString().split('T')[0];
      document.getElementById('detalle-filtro-fecha-fin').value = hoy.toISOString().split('T')[0];

      document.getElementById('detalle-btn-refresh')?.addEventListener('click', queryAndRenderDetalle);
      document.getElementById('detalle-btn-export')?.addEventListener('click', exportDetalleCSV);

      // Cargar unidades iniciales
      const clienteActual = accessControl && accessControl.userType === 'CLIENTE'
        ? accessControl.clienteAsignado
        : 'Todos';

      console.log('[DETALLE] Cargando unidades iniciales para:', clienteActual);
      await loadDetalleUnidadesByCliente(clienteActual);

      queryAndRenderDetalle();
      detalleInitialized = true;
    }

    async function queryAndRenderDetalle() {
      UI.showOverlay('Generando detalles…', 'Consultando incidencias');
      try {
        const cliente = detalleChoices.cliente.getValue(true) || 'Todos';
        const unit = detalleChoices.unidad.getValue(true) || 'Todas';
        const year = detalleChoices.year.getValue(true) || new Date().getFullYear();

        // Obtener fechas de los inputs
        const fechaInicio = document.getElementById('detalle-filtro-fecha-inicio').value;
        const fechaFin = document.getElementById('detalle-filtro-fecha-fin').value;

        const startDate = fechaInicio ? new Date(fechaInicio + 'T00:00:00') : new Date(year, 0, 1);
        const endDate = fechaFin ? new Date(fechaFin + 'T23:59:59') : new Date(parseInt(year) + 1, 0, 1);

        let query = getQueryWithClienteFilter(COLLECTIONS.INCIDENTS)
          .where('timestamp', '>=', startDate)
          .where('timestamp', '<', endDate);

        if (cliente !== 'Todos') {
          query = query.where('cliente', '==', cliente);
        }
        if (unit !== 'Todas') {
          query = query.where('unidad', '==', unit);
        }

        // Agregar ordenamiento y límite para mejor rendimiento
        query = query.orderBy('timestamp', 'desc').limit(1000);

        const snapshot = await query.get();

        // Validación defensiva del snapshot
        if (!snapshot || !snapshot.docs) {
          console.error('[DETALLE] snapshot o snapshot.docs es undefined');
          UI.toast('No se pudo cargar los detalles. Intenta de nuevo.');
          UI.hideOverlay();
          return;
        }

        console.log(`[DETALLE] Registros descargados: ${snapshot.docs.length}`);

        // Recolectar todos los tipoIncidente únicos
        const tiposMap = {};
        const tiposOrder = [];

        snapshot.forEach(doc => {
          const data = doc.data();
          const tipo = (data.tipoIncidente || 'Sin especificar').trim();
          if (!tiposMap[tipo]) {
            tiposMap[tipo] = 0;
            tiposOrder.push(tipo);
          }
          tiposMap[tipo]++;
        });

        // Regenerar tablas dinámicamente para cada tipo
        const tables = {};
        tiposOrder.forEach(tipo => {
          tables[tipo] = new Map();
        });

        // Poblar datos mensuales por tipo
        const monthly = {};
        tiposOrder.forEach(tipo => {
          monthly[tipo] = Array(12).fill(0);
        });

        snapshot.forEach(doc => {
          const data = doc.data();
          const ts = data.timestamp?.toDate ? data.timestamp.toDate() : new Date();
          const m = ts.getMonth();
          const tipo = (data.tipoIncidente || 'Sin especificar').trim();

          if (monthly[tipo]) {
            monthly[tipo][m]++;
            const detalle = data.detalleIncidente || 'Sin Detalle';
            if (!tables[tipo].has(detalle)) tables[tipo].set(detalle, Array(12).fill(0));
            tables[tipo].get(detalle)[m]++;
          }
        });

        // Generar tarjetas dinámicamente
        const sum = arr => arr.reduce((a, b) => a + b, 0);
        const sidebar = document.getElementById('detalle-sidebar-stats');
        sidebar.innerHTML = '';

        // GUARDAR datos para exportación (incluyendo documentos completos con fechas)
        const detailedRecords = [];
        snapshot.forEach(doc => {
          const data = doc.data();
          const ts = data.timestamp?.toDate ? data.timestamp.toDate() : new Date();
          detailedRecords.push({
            fecha: ts.toLocaleDateString('es-PE'),
            hora: ts.toLocaleTimeString('es-PE'),
            cliente: data.cliente || 'N/A',
            unidad: data.unidad || 'N/A',
            tipoIncidente: data.tipoIncidente || 'Sin especificar',
            detalleIncidente: data.detalleIncidente || 'Sin Detalle',
            subCategoria: data.subCategoria || 'N/A',
            nivelRiesgo: data.Nivelderiesgo || 'N/A',
            estado: data.estado || 'Pendiente',
            comentario: data.comentario || 'Sin comentarios'
          });
        });

        lastDetalleData = {
          monthly,
          tables,
          tiposOrder,
          detailedRecords,
          filters: {
            cliente: detalleChoices.cliente.getValue(true),
            unidad: detalleChoices.unidad.getValue(true),
            year: detalleChoices.year.getValue(true),
            fechaInicio: document.getElementById('detalle-filtro-fecha-inicio').value,
            fechaFin: document.getElementById('detalle-filtro-fecha-fin').value
          }
        };

        // DEBUG: Verificar datos capturados
        const colors = ['#7c3aed', '#2563eb', '#06b6d4', '#0ea5e9', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6', '#6366f1', '#ec4899'];
        tiposOrder.forEach((tipo, idx) => {
          const total = sum(monthly[tipo]);
          if (total > 0) { // Solo mostrar tarjetas con datos
            const color = colors[idx % colors.length];
            const card = document.createElement('div');
            card.className = 'stat';
            card.style.setProperty('--card-color', color);
            card.innerHTML = `<div class="stat-value">${total}</div><div class="stat-label">${tipo}</div>`;
            sidebar.appendChild(card);
          }
        });

        const toMatrix = map => [...map.entries()]
          .map(([label, arr]) => ({ label, monthly: arr, total: sum(arr) }))
          .sort((a, b) => b.total - a.total);

        // Limpiar las tablas anteriores y crear nuevas para cada tipo
        const mainContent = document.querySelector('.kpi-tables-wrapper');
        if (mainContent) {
          mainContent.innerHTML = '';

          // Filtrar tipos que tengan datos
          const tiposConDatos = tiposOrder.filter(tipo => sum(monthly[tipo]) > 0);

          if (tiposConDatos.length === 0) {
            mainContent.innerHTML = '<div style="padding:20px; text-align:center; color:#999;"><p>No hay datos para los filtros seleccionados</p></div>';
          } else {
            tiposConDatos.forEach(tipo => {
              const tableItem = document.createElement('div');
              tableItem.className = 'kpi-table-item';
              tableItem.innerHTML = `<h3>${tipo}</h3><div class="table-wrap"><table data-tipo="${tipo}"></table></div>`;
              mainContent.appendChild(tableItem);
              const tableEl = tableItem.querySelector('table');
              renderDetalleTable(tableEl, toMatrix(tables[tipo]));
            });
          }
        }

        drawDetalleAreaChart(monthly);

        applyKpiUnifiedHeights();

      } catch (e) {
        console.error('[queryAndRenderDetalle] Error completo:', e);
        console.error('Error message:', e.message);
        console.error('Error stack:', e.stack);
        UI.toast('Error al cargar los detalles: ' + e.message);
      } finally {
        UI.hideOverlay();
      }
    }

    function renderDetalleTable(tableEl, matrix) {
      if (!tableEl) return;
      const headTitle = tableEl.dataset.head || 'Concepto';
      const head = `<thead><tr><th>${headTitle}</th>${months.map(m => `<th>${m}</th>`).join('')}<th>Total</th></tr></thead>`;
      let body = matrix.map(r => `<tr><td>${r.label}</td>${r.monthly.map(v => `<td>${v || 0}</td>`).join('')}<td><b>${r.total || 0}</b></td></tr>`).join('');
      const monthlyTotals = months.map((_, i) => `<td><b>${matrix.reduce((a, c) => a + (c.monthly[i] || 0), 0)}</b></td>`).join('');
      body += `<tr style="background:rgba(255,255,255,0.05)"><td><b>Total</b></td>${monthlyTotals}<td><b>${matrix.reduce((a, c) => a + (c.total || 0), 0)}</b></td></tr>`;
      tableEl.innerHTML = head + `<tbody>${body}</tbody>`;
    }

    function drawDetalleAreaChart(series) {
      const canvas = document.getElementById('detalle-chart-area');
      if (!canvas) return;

      // Verificar si hay datos válidos
      const hasData = Object.values(series).some(data => {
        if (Array.isArray(data)) {
          return data.some(v => v > 0);
        }
        return false;
      });

      if (detalleChart) detalleChart.destroy();

      // Si no hay datos, mostrar gráfico vacío
      if (!hasData) {
        detalleChart = new Chart(canvas, {
          type: 'line',
          data: { labels: months, datasets: [] },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'bottom',
                labels: { color: themeInk() }
              },
              tooltip: { enabled: false }
            },
            scales: {
              y: { ticks: { color: themeInk() } },
              x: { ticks: { color: themeInk() } }
            }
          }
        });
        return;
      }

      // Construir dinámicamente los datasets según los tipos disponibles
      const colors = ['#7c3aed', '#2563eb', '#06b6d4', '#0ea5e9', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6', '#6366f1', '#ec4899'];
      const datasets = Object.entries(series).map(([label, data], idx) => {
        const color = colors[idx % colors.length];
        const rgbaColor = color.replace('#', '').match(/.{2}/g).map(x => parseInt(x, 16)).join(',');
        return {
          label,
          data,
          fill: true,
          tension: 0.35,
          pointRadius: 1,
          borderWidth: 2,
          borderColor: color,
          backgroundColor: `rgba(${rgbaColor}, 0.2)`
        };
      });

      detalleChart = new Chart(canvas, {
        type: 'line',
        data: { labels: months, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: themeInk() }
            }
          },
          scales: {
            y: { ticks: { color: themeInk() } },
            x: { ticks: { color: themeInk() } }
          }
        }
      });
    }

    function exportDetalleCSV() {
      // Redirigir a la función de Excel
      exportDetalleExcel();
    }

    function exportDetalleExcel() {
      try {
        if (!window.XLSX) {
          UI.toast('Librería XLSX no disponible');
          return;
        }

        if (!lastDetalleData || !lastDetalleData.detailedRecords || lastDetalleData.detailedRecords.length === 0) {
          UI.toast('Primero genera un reporte con filtros y datos disponibles');
          return;
        }

        const wb = XLSX.utils.book_new();
        const timestamp = new Date().toLocaleString('es-PE');
        const { detailedRecords, monthly, tiposOrder } = lastDetalleData;
        const sum = arr => arr.reduce((a, b) => a + b, 0);

        // ===== HOJA 1: DETALLE COMPLETO CON FECHA Y HORA =====
        const detailData = [];

        // Título y fecha de exportación
        detailData.push(['REGISTRO DETALLADO DE INCIDENCIAS']);
        detailData.push(['Fecha de Exportación:', timestamp]);
        detailData.push(['Total de Registros:', detailedRecords.length]);
        detailData.push([]); // Fila vacía

        // Encabezados
        detailData.push([
          'FECHA',
          'HORA',
          'CLIENTE',
          'UNIDAD',
          'TIPO DE INCIDENTE',
          'DETALLE',
          'SUB CATEGORÍA',
          'NIVEL RIESGO',
          'ESTADO',
          'COMENTARIO'
        ]);

        // Agregar todos los registros
        detailedRecords.forEach(record => {
          detailData.push([
            record.fecha || 'N/A',
            record.hora || 'N/A',
            record.cliente || 'N/A',
            record.unidad || 'N/A',
            record.tipoIncidente || 'N/A',
            record.detalleIncidente || 'N/A',
            record.subCategoria || 'N/A',
            record.nivelRiesgo || 'N/A',
            record.estado || 'N/A',
            record.comentario || 'N/A'
          ]);
        });

        const detailWs = XLSX.utils.aoa_to_sheet(detailData);

        // Configurar ancho de columnas
        detailWs['!cols'] = [
          { wch: 13 },  // Fecha
          { wch: 13 },  // Hora
          { wch: 16 },  // Cliente
          { wch: 16 },  // Unidad
          { wch: 28 },  // Tipo
          { wch: 40 },  // Detalle
          { wch: 28 },  // Sub Categoría
          { wch: 15 },  // Nivel
          { wch: 13 },  // Estado
          { wch: 35 }   // Comentario
        ];

        // Estilos para encabezado de tabla
        const headerStyle = {
          font: { bold: true, color: { rgb: 'FFFFFF' }, size: 11 },
          fill: { fgColor: { rgb: 'FF2F5496' } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: { top: { style: 'medium' }, left: { style: 'medium' }, bottom: { style: 'medium' }, right: { style: 'medium' } }
        };

        // Aplicar estilos al encabezado de tabla (fila 1)
        for (let i = 0; i < 10; i++) {
          const cell = XLSX.utils.encode_cell({ r: 0, c: i });
          if (detailWs[cell]) detailWs[cell].s = headerStyle;
        }

        // Aplicar bordes y alineación a datos
        for (let r = 1; r < detailData.length; r++) {
          for (let c = 0; c < 10; c++) {
            const cell = XLSX.utils.encode_cell({ r, c });
            if (detailWs[cell]) {
              const borderColor = (r % 2 === 0) ? 'FFE7E6E6' : 'FFFFFFFF';
              detailWs[cell].s = {
                border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } },
                fill: { fgColor: { rgb: borderColor } },
                alignment: { vertical: 'top', wrapText: true, horizontal: 'left' }
              };
            }
          }
        }

        // Congelar filas de encabezado
        detailWs['!freeze'] = { xSplit: 0, ySplit: 1 };

        XLSX.utils.book_append_sheet(wb, detailWs, 'Detalle Completo');

        // ===== HOJA 2: RESUMEN POR TIPO DE INCIDENTE =====
        const summaryData = [];

        // Encabezados
        const summaryHeader = ['Mes', ...tiposOrder, 'TOTAL MENSUAL'];
        summaryData.push(summaryHeader);

        const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        let totalGranGeneral = 0;
        for (let i = 0; i < 12; i++) {
          const monthData = tiposOrder.map(tipo => monthly[tipo][i] || 0);
          const monthTotal = sum(monthData);
          totalGranGeneral += monthTotal;
          summaryData.push([months[i], ...monthData, monthTotal]);
        }

        // Fila de totales anuales
        const totalesAnuales = tiposOrder.map(tipo => sum(monthly[tipo]));
        summaryData.push(['TOTAL ANUAL', ...totalesAnuales, totalGranGeneral]);

        const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
        summaryWs['!cols'] = new Array(tiposOrder.length + 2).fill(0).map(() => ({ wch: 18 }));

        // Estilo para encabezado de tabla
        const summaryHeaderStyle = {
          font: { bold: true, color: { rgb: 'FFFFFF' }, size: 11 },
          fill: { fgColor: { rgb: 'FF548235' } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: { top: { style: 'medium' }, left: { style: 'medium' }, bottom: { style: 'medium' }, right: { style: 'medium' } }
        };

        for (let i = 0; i <= tiposOrder.length; i++) {
          const cell = XLSX.utils.encode_cell({ r: 0, c: i });
          if (summaryWs[cell]) summaryWs[cell].s = summaryHeaderStyle;
        }

        const totalRowStyle = {
          font: { bold: true, size: 11 },
          fill: { fgColor: { rgb: 'FFFFC7CE' } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: { top: { style: 'medium' }, left: { style: 'medium' }, bottom: { style: 'medium' }, right: { style: 'medium' } },
          numFmt: '0'
        };

        // Estilo a fila de totales
        for (let i = 0; i <= tiposOrder.length; i++) {
          const cell = XLSX.utils.encode_cell({ r: summaryData.length - 1, c: i });
          if (summaryWs[cell]) summaryWs[cell].s = totalRowStyle;
        }

        // Bordes a datos intermedios
        for (let r = 1; r < summaryData.length - 1; r++) {
          for (let c = 0; c <= tiposOrder.length; c++) {
            const cell = XLSX.utils.encode_cell({ r, c });
            if (summaryWs[cell]) {
              const borderColor = (r % 2 === 0) ? 'FFE7E6E6' : 'FFFFFFFF';
              summaryWs[cell].s = {
                border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } },
                alignment: { horizontal: 'center' },
                fill: { fgColor: { rgb: borderColor } },
                numFmt: '0'
              };
            }
          }
        }

        summaryWs['!freeze'] = { xSplit: 1, ySplit: 1 };
        XLSX.utils.book_append_sheet(wb, summaryWs, 'Resumen Mensual');

        // ===== HOJA 3: INFORMACIÓN Y ANÁLISIS =====
        const analysisData = [
          ['INFORMACIÓN DEL REPORTE'],
          ['Fecha y Hora de Exportación', timestamp],
          ['Total de Registros Exportados', detailedRecords.length],
          [],
          ['FILTROS APLICADOS'],
          ['Cliente', lastDetalleData.filters.cliente || 'Todos'],
          ['Unidad', lastDetalleData.filters.unidad || 'Todas'],
          ['Año', lastDetalleData.filters.year || 'N/A'],
          ['Desde (Fecha Inicio)', lastDetalleData.filters.fechaInicio || 'N/A'],
          ['Hasta (Fecha Fin)', lastDetalleData.filters.fechaFin || 'N/A'],
          [],
          ['ANÁLISIS POR TIPO DE INCIDENTE'],
          ['Tipo', 'Cantidad', '% del Total']
        ];

        const total = sum(tiposOrder.map(tipo => sum(monthly[tipo])));
        tiposOrder.forEach(tipo => {
          const cantidad = sum(monthly[tipo]);
          const porcentaje = total > 0 ? ((cantidad / total) * 100).toFixed(2) : '0.00';
          analysisData.push([tipo, cantidad, porcentaje + '%']);
        });

        const analysisWs = XLSX.utils.aoa_to_sheet(analysisData);
        analysisWs['!cols'] = [{ wch: 35 }, { wch: 25 }, { wch: 15 }];

        // Estilos para encabezado de tabla de análisis
        const analysisHeaderStyle = {
          font: { bold: true, color: { rgb: 'FFFFFF' }, size: 11 },
          fill: { fgColor: { rgb: 'FF2F5496' } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: { top: { style: 'medium' }, left: { style: 'medium' }, bottom: { style: 'medium' }, right: { style: 'medium' } }
        };

        for (let i = 0; i < 3; i++) {
          const cell = XLSX.utils.encode_cell({ r: 12, c: i });
          if (analysisWs[cell]) analysisWs[cell].s = analysisHeaderStyle;
        }

        // Bordes a filas de análisis
        for (let r = 13; r < analysisData.length; r++) {
          for (let c = 0; c < 3; c++) {
            const cell = XLSX.utils.encode_cell({ r, c });
            if (analysisWs[cell]) {
              const borderColor = (r % 2 === 0) ? 'FFE7E6E6' : 'FFFFFFFF';
              analysisWs[cell].s = {
                border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } },
                fill: { fgColor: { rgb: borderColor } },
                alignment: { horizontal: c === 0 ? 'left' : 'center', vertical: 'center' }
              };
            }
          }
        }

        analysisWs['!freeze'] = { xSplit: 0, ySplit: 13 };
        XLSX.utils.book_append_sheet(wb, analysisWs, 'Información');

        // Descargar archivo
        const filename = `Incidencias_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, filename);
        UI.toast('✓ Exportado a Excel con ' + detailedRecords.length + ' registros');
      } catch (e) {
        UI.toast('Error al exportar a Excel: ' + e.message);
      }
    }

    // ============================================================================
    // 5C) KPI — ACCESO PEATONAL
    // ============================================================================
    let apCliente, apSedes, apTipo, apFecha, apApply;
    let apCardTotal, apCardVisita, apCardProveedor, apCardContratista, apCardEmpleado;

    let apCharts = {};
    let apChoices = {};
    let apInitialized = false;
    let apCache = [];

    function initAccesoPeatonalDashboard() {
      // Seleccionar elementos HTML cuando el tab está disponible
      apCliente = document.getElementById('ap-filtro-cliente');
      apSedes = document.getElementById('ap-filtro-sede');
      apTipo = document.getElementById('ap-filtro-tipo');
      apFecha = document.getElementById('ap-filtro-fecha');
      apApply = document.getElementById('ap-btn-aplicar');

      apCardTotal = document.getElementById('ap-total');
      apCardVisita = document.getElementById('ap-visita');
      apCardProveedor = document.getElementById('ap-proveedor');
      apCardContratista = document.getElementById('ap-contratista');
      apCardEmpleado = document.getElementById('ap-empleado');
      const cfg = { searchEnabled: true, itemSelectText: 'Seleccionar', placeholder: true, shouldSort: true };
      if (window.Choices) {
        if (apCliente) apChoices.cliente = new Choices(apCliente, cfg);
        if (apSedes) apChoices.sedes = new Choices(apSedes, cfg);
        if (apTipo) apChoices.tipo = new Choices(apTipo, cfg);
      }

      if (typeof $ !== 'undefined' && typeof $.fn.daterangepicker !== 'undefined' && apFecha) {
        const start = moment().subtract(29, 'days'), end = moment();
        $(apFecha).daterangepicker({
          opens: 'left',
          startDate: start, endDate: end,
          locale: { format: 'DD/MM/YYYY', applyLabel: 'Aplicar', cancelLabel: 'Cancelar' }
        });
      }

      // Cargar filtros iniciales Master Data
      initAccesoPeatonalFilters();

      queryAccesoPeatonal()
        .then(() => {
          renderAccesoPeatonal();
        })
        .catch(e => {
          UI.toast('No se pudo cargar Acceso Peatonal: ' + e.message);
        });

      apApply?.addEventListener('click', renderAccesoPeatonal);
    }

    function queryAccesoPeatonalDateParse(s) {
      if (!s) return null;
      const m = moment(
        s,
        ['YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DD HH:mm', 'YYYY-MM-DD',
          'DD/MM/YYYY HH:mm:ss', 'DD/MM/YYYY HH:mm', 'DD/MM/YYYY'],
        false
      );
      return m.isValid() ? m.toDate() : null;
    }

    async function queryAccesoPeatonal() {
      UI.showOverlay('Cargando accesos…', 'Consultando ACCESO_PEATONAL (últimos 5000)');
      try {
        // Límite de 5000 para mejor rendimiento
        const snap = await getQueryWithClienteFilter('ACCESO_PEATONAL')
          .orderBy('__name__', 'desc')
          .limit(5000)
          .get();
        apCache = snap.docs.map(d => {
          const x = d.data();
          const inStr = `${x.FECHA_INGRESO ?? ''} ${x.HORA_INGRESO ?? ''}`.trim();
          const outStr = `${x.FECHA_SALIDA ?? ''} ${x.HORA_FIN ?? ''}`.trim();
          const tsIn = queryAccesoPeatonalDateParse(inStr);
          const tsOut = queryAccesoPeatonalDateParse(outStr);
          const ts = tsIn || tsOut || null;
          return {
            id: d.id,
            CLIENTE: (x.CLIENTE || '').toString(),
            UNIDAD: (x.UNIDAD || '').toString(),
            TIPO_ACCESO: (x.TIPO_ACCESO || '').toString(),
            ESTADO: (x.ESTADO || '').toString(),
            EMPRESA: (x.EMPRESA || '').toString(),
            _ts: ts
          };
        });

        // Fetch assigned units logic
        let assignedUnits = [];
        if (window.accessControl?.userType === 'CLIENTE') {
          const userUnits = window.accessControl.getUnidadesAsignadas();
          if (userUnits.length > 0) {
            assignedUnits = userUnits;
          } else if (window.accessControl?.clienteAsignado) {
            assignedUnits = await getUnidadesFromClienteUnidad(window.accessControl.clienteAsignado);
          }
        }
        return assignedUnits;

      } finally {
        UI.hideOverlay();
      }
    }

    async function initAccesoPeatonalFilters() {
      const ac = window.accessControl;
      if (!apCliente || !apSedes) return;

      // CLIENTE Logic
      if (ac?.userType === 'CLIENTE') {
        const c = ac.clienteAsignado;

        // Lock Client
        if (apChoices.cliente) {
          apChoices.cliente.setChoices([{ value: c, label: c, selected: true, disabled: true }], 'value', 'label', true);
          apChoices.cliente.disable();
        }

        // Fetch Units
        let units = [];
        if (typeof getUnidadesFromClienteUnidad === 'function') units = await getUnidadesFromClienteUnidad(c);
        if (!units.length) {
          const doc = await db.collection('CLIENTE_UNIDAD').doc(c).get();
          if (doc.exists) units = doc.data().unidades || doc.data().UNIDADES || [];
        }

        // Filter Allowed
        const allowed = ac.getUnidadesAsignadas();
        if (allowed.length) units = units.filter(u => allowed.includes(u));
        units.sort();

        // Set Units
        if (apChoices.sedes) {
          if (units.length === 1) {
            const u = units[0];
            apChoices.sedes.setChoices([{ value: u, label: u, selected: true }], 'value', 'label', true);
            apChoices.sedes.disable();
            // Style
            const container = apSedes.closest('.choices');
            if (container) {
              container.style.opacity = '0.6';
              container.style.backgroundColor = '#e2e8f0';
            }
          } else {
            const choices = [{ value: '__ALL__', label: 'Todos', selected: true }];
            units.forEach(u => choices.push({ value: u, label: u }));
            apChoices.sedes.setChoices(choices, 'value', 'label', true);
            apChoices.sedes.enable();
          }
        }
      } else {
        // ADMIN: Load All Clients
        const snap = await db.collection('CLIENTE_UNIDAD').get();
        const clients = snap.docs.map(d => d.id).sort();

        if (apChoices.cliente) {
          const choices = [{ value: '__ALL__', label: 'Todos', selected: true }];
          clients.forEach(c => choices.push({ value: c, label: c }));
          apChoices.cliente.setChoices(choices, 'value', 'label', true);
        }
        // Leave Units empty or load all? Default all if 'Todos' selected
        // Logic for updating units on client change should be added if needed, 
        // but specifically requested for CLIENTE user locking.
      }
    }

    function getAPFilters() {
      let start = moment().subtract(29, 'days').startOf('day');
      let end = moment().endOf('day');
      if (typeof $ !== 'undefined' && typeof $.fn.daterangepicker !== 'undefined' && apFecha) {
        const v = $(apFecha).val();
        if (v && v.includes(' - ')) {
          const [a, b] = v.split(' - ');
          start = moment(a, 'DD/MM/YYYY').startOf('day');
          end = moment(b, 'DD/MM/YYYY').endOf('day');
        }
      }
      const cliente = apChoices.cliente ? apChoices.cliente.getValue(true) : (apCliente?.value || '__ALL__');
      const sede = apChoices.sedes ? apChoices.sedes.getValue(true) : (apSedes?.value || '__ALL__');
      const tipo = apChoices.tipo ? apChoices.tipo.getValue(true) : (apTipo?.value || '__ALL__');
      return { start, end, cliente, sede, tipo };
    }

    const normTxt = s => (s || '').toString().trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    function renderAccesoPeatonal() {
      const { start, end, cliente, sede, tipo } = getAPFilters();

      // Los datos en apCache ya vienen filtrados por cliente desde la BD
      // Solo aplicamos los filtros de rango de fecha y filtros de UI
      const filtered = apCache.filter(r => {
        const inRange = r._ts ? moment(r._ts).isBetween(start, end, undefined, '[]') : false;
        const inCliente = (cliente === '__ALL__') || (r.CLIENTE === cliente);
        const inSede = (sede === '__ALL__') || (r.UNIDAD === sede);
        const inTipo = (tipo === '__ALL__') || (r.TIPO_ACCESO === tipo);
        return inRange && inCliente && inSede && inTipo;
      });

      const total = filtered.length;
      const countByTipo = key => filtered.reduce((a, c) => a + (normTxt(c.TIPO_ACCESO) === key ? 1 : 0), 0);
      setCard(apCardTotal, total);
      setCard(apCardVisita, countByTipo('VISITA'));
      setCard(apCardProveedor, countByTipo('PROVEEDOR'));
      setCard(apCardContratista, countByTipo('CONTRATISTA'));

      // Línea por fecha
      {
        const labels = [];
        const map = new Map();
        for (let m = start.clone(); m.isSameOrBefore(end, 'day'); m.add(1, 'day')) {
          const key = m.format('DD/MM'); labels.push(key); map.set(key, 0);
        }
        filtered.forEach(r => {
          const key = moment(r._ts).format('DD/MM');
          if (map.has(key)) map.set(key, map.get(key) + 1);
        });
        const dataValues = labels.map(l => map.get(l) || 0);
        const totalAccesos = dataValues.reduce((a, b) => a + b, 0) || 1;

        // Crear dataset con labels de cantidad
        const datasetConfig = {
          label: 'Accesos',
          data: dataValues,
          borderColor: PALETTE.blue,
          backgroundColor: 'rgba(59,130,246,.12)',
          fill: true,
          tension: .33,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointBorderWidth: 2,
          pointBorderColor: '#fff',
          pointBackgroundColor: PALETTE.blue
        };

        drawAPChart('ap-chart-fecha', {
          type: 'line',
          data: { labels, datasets: [datasetConfig] },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: true,
                position: 'bottom',
                labels: {
                  font: { size: 11, weight: 'bold' },
                  color: themeInk(),
                  padding: 12,
                  usePointStyle: true
                }
              },
              tooltip: {
                backgroundColor: 'rgba(0,0,0,0.8)',
                padding: 10,
                cornerRadius: 6,
                titleFont: { size: 12, weight: 'bold' },
                bodyFont: { size: 11 },
                callbacks: {
                  label: (c) => `${c.dataset.label}: ${nf.format(c.raw)} (${pf(c.raw, totalAccesos)}%)`
                }
              },
              datalabels: {
                display: true,
                formatter: (v, ctx) => v > 0 ? nf.format(v) : '',
                anchor: 'end',
                align: 'top',
                offset: 10,
                font: { weight: 'bold', size: 11 },
                color: '#1f2937',
                backgroundColor: 'rgba(255,255,255,0.9)',
                borderRadius: 4,
                padding: 3
              }
            },
            scales: {
              y: {
                ticks: { color: themeInk() },
                grid: { color: 'rgba(0,0,0,0.05)' }
              },
              x: {
                ticks: { color: themeInk() },
                grid: { display: false }
              }
            }
          }
        });
      }

      // Donut estado
      {
        const counts = filtered.reduce((a, c) => { const k = c.ESTADO || 'SIN ESTADO'; a[k] = (a[k] || 0) + 1; return a; }, {});
        const labels = Object.keys(counts);
        const values = Object.values(counts);
        const sum = values.reduce((x, y) => x + y, 0) || 1;

        drawAPChart('ap-chart-estado', {
          type: 'doughnut',
          data: {
            labels,
            datasets: [{
              data: values,
              backgroundColor: [PALETTE.blue, PALETTE.amber, PALETTE.red, PALETTE.gray]
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '58%',
            plugins: {
              legend: {
                position: 'bottom',
                labels: {
                  font: { size: 11, weight: 'bold' },
                  color: themeInk(),
                  padding: 12,
                  generateLabels: (chart) => {
                    const data = chart.data;
                    return data.labels.map((label, i) => {
                      const value = data.datasets[0].data[i];
                      const pct = ((value / sum) * 100).toFixed(1);
                      return {
                        text: `${label}: ${nf.format(value)} (${pct}%)`,
                        fillStyle: data.datasets[0].backgroundColor[i],
                        hidden: false,
                        index: i,
                        pointStyle: 'circle'
                      };
                    });
                  }
                }
              },
              datalabels: {
                formatter: (v) => `${pf(v, sum)}%`,
                anchor: 'center',
                align: 'center',
                font: { weight: '700', size: 14 },
                color: '#fff'
              },
              tooltip: {
                callbacks: {
                  label: (c) => `${c.label}: ${nf.format(c.raw)} (${pf(c.raw, sum)}%)`
                }
              }
            }
          }
        });
      }

      // Barras por empresa
      {
        const map = filtered.reduce((a, c) => { const k = c.EMPRESA || 'SIN EMPRESA'; a[k] = (a[k] || 0) + 1; return a; }, {});
        const arr = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 20);
        const labels = arr.map(x => x[0]);
        const values = arr.map(x => x[1]);
        const total = values.reduce((a, b) => a + b, 0) || 1;

        drawAPChart('ap-chart-empresa', {
          type: 'bar',
          data: {
            labels,
            datasets: [{
              label: 'Accesos',
              data: values,
              backgroundColor: PALETTE.blue,
              borderRadius: 6,
              borderSkipped: false
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: 'rgba(0,0,0,0.8)',
                padding: 10,
                cornerRadius: 6,
                titleFont: { size: 12, weight: 'bold' },
                bodyFont: { size: 11 },
                callbacks: {
                  label: (c) => `${c.dataset.label}: ${nf.format(c.raw)} (${pf(c.raw, total)}%)`
                }
              },
              datalabels: {
                display: true,
                formatter: (v) => `${nf.format(v)} (${pf(v, total)}%)`,
                anchor: 'end',
                align: 'right',
                offset: 10,
                font: { weight: 'bold', size: 10 },
                color: '#1f2937'
              }
            },
            scales: {
              y: {
                ticks: {
                  color: themeInk(),
                  autoSkip: false,
                  font: { size: 11 }
                },
                grid: { display: false }
              },
              x: {
                ticks: { color: themeInk() },
                grid: { color: 'rgba(0,0,0,0.05)' }
              }
            }
          }
        });
      }

      // Heatmap 2h x día
      {
        const bins = Array(12).fill(0).map(() => Array(7).fill(0));
        filtered.forEach(r => {
          const m = moment(r._ts);
          const slot = Math.floor(m.hour() / 2);
          const dow = m.day();
          if (slot >= 0 && slot < 12 && dow >= 0 && dow < 7) bins[slot][dow] += 1;
        });

        const table = document.getElementById('ap-tabla-heatmap');
        if (table) {
          const dayHdr = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
            .map(d => d[0].toUpperCase() + d.slice(1, 3));
          const range = i => `${String(i * 2).padStart(2, '0')}:00 - ${String(i * 2 + 2).padStart(2, '0')}:00`;
          let html = `<thead><tr><th>rango_horario</th>${dayHdr.map(d => `<th>${d}</th>`).join('')}<th>Total</th></tr></thead><tbody>`;
          const colTotals = Array(7).fill(0);
          let max = 0, grand = 0;

          for (let i = 0; i < 12; i++) {
            const row = bins[i];
            const sum = row.reduce((a, b) => a + b, 0); grand += sum;
            html += `<tr><td>${range(i)}</td>`;
            for (let d = 0; d < 7; d++) { max = Math.max(max, row[d]); colTotals[d] += row[d]; html += `<td data-v="${row[d]}">${row[d]}</td>`; }
            html += `<td><b>${sum}</b></td></tr>`;
          }
          html += `</tbody><tfoot><tr><th>Total</th>${colTotals.map(v => `<th><b>${v}</b></th>`).join('')}<th><b>${grand}</b></th></tr></tfoot>`;
          table.innerHTML = html;

          table.querySelectorAll('tbody td[data-v]').forEach(td => {
            const v = +td.dataset.v || 0;
            const k = max ? v / max : 0;
            td.style.background = `rgba(14,165,233,${0.15 + 0.55 * k})`;
            td.style.color = k > .55 ? '#fff' : themeInk();
            td.style.textAlign = 'center';
            td.style.fontWeight = k > .8 ? '700' : '500';
          });
        }
      }

      // Barras por unidad
      {
        const map = filtered.reduce((a, c) => { const k = c.UNIDAD || 'SIN UNIDAD'; a[k] = (a[k] || 0) + 1; return a; }, {});
        const arr = Object.entries(map).sort((a, b) => b[1] - a[1]);
        const labels = arr.map(x => x[0]);
        const values = arr.map(x => x[1]);
        const total = values.reduce((a, b) => a + b, 0) || 1;

        drawAPChart('ap-chart-unidad', {
          type: 'bar',
          data: {
            labels,
            datasets: [{
              label: 'Accesos',
              data: values,
              backgroundColor: PALETTE.blueLt,
              borderRadius: 6,
              borderSkipped: false
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: true,
                position: 'bottom',
                labels: {
                  font: { size: 11, weight: 'bold' },
                  color: themeInk(),
                  padding: 12
                }
              },
              datalabels: {
                formatter: (v) => `${nf.format(v)}\n(${pf(v, total)}%)`,
                anchor: 'end',
                align: 'top',
                offset: 8,
                font: { weight: 'bold', size: 10 },
                color: '#1f2937'
              },
              tooltip: {
                callbacks: {
                  label: (c) => `${c.dataset.label}: ${nf.format(c.raw)} (${pf(c.raw, total)}%)`
                }
              }
            },
            scales: {
              y: {
                ticks: { color: themeInk() },
                grid: { color: 'rgba(0,0,0,0.05)' }
              },
              x: {
                ticks: {
                  color: themeInk(),
                  autoSkip: false,
                  maxRotation: 45,
                  minRotation: 0,
                  font: { size: 10 }
                },
                grid: { display: false }
              }
            }
          }
        });
      }

      applyKpiUnifiedHeights();
    }

    function drawAPChart(canvasId, config) {
      const el = document.getElementById(canvasId);
      if (!el) return;
      if (apCharts[canvasId]) apCharts[canvasId].destroy();
      apCharts[canvasId] = new Chart(el, config);
    }

    function setCard(el, value) {
      if (!el) return;
      const n = (typeof value === 'number' && isFinite(value)) ? value : 0;
      el.textContent = n.toLocaleString('es-PE');
    }

    // ============================================================================
    // 5D) KPI — RONDA GENERAL (FILTROS Y ESTADÍSTICAS)
    // ============================================================================
    let kpiRondaFilters = {
      cliente: '',
      unidad: '',
      fechaInicio: '',
      fechaFin: ''
    };

    function initKpiRondaGeneral() {

      // Cargar opciones de Cliente y Unidad
      loadKpiRondaClientesUnidades();

      // Event listeners de botones
      document.getElementById('kpi-ronda-aplicar')?.addEventListener('click', () => {
        loadKpiRondaData();
      });

      document.getElementById('kpi-ronda-limpiar')?.addEventListener('click', () => {
        // Limpiar filtros
        kpiRondaFilters = {
          cliente: '',
          unidad: '',
          fechaInicio: '',
          fechaFin: ''
        };
        document.getElementById('kpi-ronda-cliente').value = '';
        document.getElementById('kpi-ronda-unidad').value = '';
        document.getElementById('ronda-general-fecha-inicio').value = '';
        document.getElementById('ronda-general-fecha-fin').value = '';

        // Recargar con filtros vacíos
        loadKpiRondaData();
      });

      // Event listener para cambio de Cliente (actualiza Unidades)
      document.getElementById('kpi-ronda-cliente')?.addEventListener('change', async () => {
        const clienteSelect = document.getElementById('kpi-ronda-cliente');
        const cliente = clienteSelect?.value || '';

        if (cliente) {
          console.log('[RONDA GENERAL] Cliente cambió a:', cliente);
          await loadRondaGeneralUnidadesByCliente(cliente);
        }
      });

      // Event listeners para filtros de fecha
      document.getElementById('ronda-general-fecha-inicio')?.addEventListener('change', () => {
        kpiRondaFilters.fechaInicio = document.getElementById('ronda-general-fecha-inicio').value;
      });

      document.getElementById('ronda-general-fecha-fin')?.addEventListener('change', () => {
        kpiRondaFilters.fechaFin = document.getElementById('ronda-general-fecha-fin').value;
      });

      // Cargar datos iniciales con pequeño delay para asegurar que TODO está inicializado
      setTimeout(() => {
        loadKpiRondaData();
      }, 500);
    }

    async function loadKpiRondaClientesUnidades() {
      try {
        const clienteSelect = document.getElementById('kpi-ronda-cliente');
        if (!clienteSelect) return;

        // Si es usuario CLIENTE, mostrar SOLO su cliente
        if (accessControl && accessControl.userType === 'CLIENTE') {
          const clienteAsignado = accessControl.clienteAsignado;
          clienteSelect.innerHTML = `<option value="${clienteAsignado}">${clienteAsignado}</option>`;
          clienteSelect.disabled = true;
          clienteSelect.style.opacity = '0.6';
          clienteSelect.title = `Acceso restringido a: ${clienteAsignado}`;

          // Cargar unidades iniciales para CLIENTE
          await loadRondaGeneralUnidadesByCliente(clienteAsignado);
        } else {
          // ADMIN/SUPERVISOR: mostrar todos los clientes
          const snapshot = await db.collection('CLIENTE_UNIDAD').get();
          const clientes = [];

          snapshot.docs.forEach(doc => {
            clientes.push(doc.id);
          });

          clientes.sort((a, b) => a.localeCompare(b, 'es'));

          clienteSelect.innerHTML = '<option value="">Todos</option>';
          clientes.forEach(cliente => {
            const option = document.createElement('option');
            option.value = cliente;
            option.textContent = cliente;
            clienteSelect.appendChild(option);
          });
        }
      } catch (error) {
        console.error('Error al cargar clientes KPI:', error);
      }
    }

    async function loadRondaGeneralUnidadesByCliente(cliente) {
      try {
        const ac = window.accessControl;
        const unidadSelect = document.getElementById('kpi-ronda-unidad');
        if (!unidadSelect) return;

        console.log(`[RONDA GENERAL] Cargando unidades para cliente: ${cliente}`);

        // Obtener unidades DIRECTAMENTE DE CLIENTE_UNIDAD
        let unidades = await getUnidadesFromClienteUnidad(cliente);

        // ✅ CORRECCIÓN: Filtrar unidades permitidas si es usuario CLIENTE
        if (ac && ac.userType === 'CLIENTE') {
          const userAssignedUnits = ac.getUnidadesAsignadas();
          if (userAssignedUnits && userAssignedUnits.length > 0) {
            console.log('[RONDA GENERAL] Filtrando unidades por permisos:', userAssignedUnits);
            unidades = unidades.filter(u => userAssignedUnits.includes(u));
          }
        }
        console.log(`[RONDA GENERAL] Unidades finales:`, unidades);

        const esClienteRestringido = ac && ac.userType === 'CLIENTE';

        if (esClienteRestringido && unidades.length === 1) {
          const unidadUnica = unidades[0];
          unidadSelect.innerHTML = `<option value="${unidadUnica}" selected>${unidadUnica}</option>`;
          unidadSelect.disabled = true;
          unidadSelect.style.backgroundColor = '#e2e8f0';
          unidadSelect.style.opacity = '0.6';
          unidadSelect.title = `Acceso restringido a: ${unidadUnica}`;
        } else {
          unidadSelect.innerHTML = '<option value="">Todas</option>';
          unidades.forEach(unidad => {
            const option = document.createElement('option');
            option.value = unidad;
            option.textContent = unidad;
            unidadSelect.appendChild(option);
          });
          unidadSelect.disabled = false;
          unidadSelect.style.backgroundColor = '';
          unidadSelect.style.opacity = '1';
        }
      } catch (error) {
        console.error('[RONDA GENERAL] Error al cargar unidades:', error);
      }
    }

    async function loadKpiRondaData() {
      try {
        UI.showOverlay('Cargando...', 'Consultando datos de rondas (Optimizado)');

        // Obtener filtros actuales
        const clienteSelect = document.getElementById('kpi-ronda-cliente');
        const unidadSelect = document.getElementById('kpi-ronda-unidad');

        kpiRondaFilters.cliente = clienteSelect?.value || '';
        kpiRondaFilters.unidad = unidadSelect?.value || '';

        // CONSTRUIR CONSULTA (Server-Side Filtering)
        let query = getQueryWithClienteFilter('RONDAS_COMPLETADAS');

        // 1. Filtro por Cliente
        if (kpiRondaFilters.cliente) {
          query = query.where('cliente', '==', kpiRondaFilters.cliente);
        }

        // 2. Filtro por Unidad
        if (kpiRondaFilters.unidad) {
          query = query.where('unidad', '==', kpiRondaFilters.unidad);
        }

        // 3. Filtro por Fechas
        // NOTA IMPORTANTE: Se ha movido el filtrado de fechas al CLIENTE (Javascript)
        // porque en Firestore el campo 'horarioInicio' puede estar guardado como String o Timestamp.
        // Las consultas de servidor fallan si comparamos tipos distintos (Date vs String).

        /* BLOQUE FILTRO SERVIDOR COMENTADO POR COMPATIBILIDAD
        if (kpiRondaFilters.fechaInicio) { ... }
        if (kpiRondaFilters.fechaFin) { ... }
        */

        // 4. Límite aumentado para traer suficientes datos y filtrar localmente
        query = query.limit(2000);

        console.log('[KPI RONDA] Ejecutando consulta (Filtro Cliente/Unidad en Servidor, Fechas en Local)...', {
          cliente: kpiRondaFilters.cliente,
          unidad: kpiRondaFilters.unidad
        });

        const snapshot = await query.get();
        console.log(`[KPI RONDA] Registros obtenidos (raw): ${snapshot.size}`);

        // Helper robusto para fechas
        const parseDateSafe = (val) => {
          if (!val) return null;
          if (val.toDate && typeof val.toDate === 'function') return val.toDate(); // Timestamp
          if (val instanceof Date) return val;
          // Intentar parsear string ISO o simple
          const d = new Date(val);
          return isNaN(d.getTime()) ? null : d;
        };

        let registros = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            _dateObj: parseDateSafe(data.horarioInicio) // Pre-calcular fecha para ordenar/filtrar
          };
        });

        // FILTRADO LOCAL DE FECHAS
        if (kpiRondaFilters.fechaInicio || kpiRondaFilters.fechaFin) {
          const inicio = kpiRondaFilters.fechaInicio ? new Date(kpiRondaFilters.fechaInicio + 'T00:00:00') : null;
          const fin = kpiRondaFilters.fechaFin ? new Date(kpiRondaFilters.fechaFin + 'T23:59:59') : null;

          registros = registros.filter(r => {
            if (!r._dateObj) return false;
            if (inicio && r._dateObj < inicio) return false;
            if (fin && r._dateObj > fin) return false;
            return true;
          });
          console.log(`[KPI RONDA] Registros tras filtrado de fecha: ${registros.length}`);
        }

        // ORDENAMIENTO (Más reciente primero)
        registros.sort((a, b) => {
          const tA = a._dateObj ? a._dateObj.getTime() : 0;
          const tB = b._dateObj ? b._dateObj.getTime() : 0;
          return tB - tA; // Decendente
        });

        // Limitar a visualización (ej. 100 o más si se desea ver todo lo filtrado)
        // Guardamos todo en 'registros' para las gráficas, pero la tabla la limitamos si es necesario.
        // Para KPI es mejor pasar todos los filtrados a las gráficas.

        // Actualizar card de información (pasamos TODOS los registros filtrados)
        updateKpiRondaInfoCard(registros);

        UI.hideOverlay();
      } catch (error) {
        UI.toast('❌ Error al cargar datos: ' + error.message);
        UI.hideOverlay();
      }
    }

    function updateKpiRondaInfoCard(registros) {
      // Actualizar total
      const totalEl = document.getElementById('kpi-ronda-total');
      if (totalEl) {
        totalEl.textContent = registros.length.toLocaleString('es-PE');
      }

      // Actualizar texto de información
      const infoTextEl = document.getElementById('kpi-ronda-info-text');
      if (infoTextEl) {
        if (kpiRondaFilters.cliente || kpiRondaFilters.unidad || kpiRondaFilters.fechaInicio || kpiRondaFilters.fechaFin) {
          infoTextEl.textContent = 'Registros filtrados';
        } else {
          infoTextEl.textContent = 'Últimos 100 registros';
        }
      }

      // Actualizar información de filtros
      const filterInfoEl = document.getElementById('kpi-ronda-filter-info');
      if (filterInfoEl) {
        const filters = [];
        if (kpiRondaFilters.cliente) filters.push(`Cliente: ${kpiRondaFilters.cliente}`);
        if (kpiRondaFilters.unidad) filters.push(`Unidad: ${kpiRondaFilters.unidad}`);
        if (kpiRondaFilters.fechaInicio) filters.push(`Desde: ${kpiRondaFilters.fechaInicio}`);
        if (kpiRondaFilters.fechaFin) filters.push(`Hasta: ${kpiRondaFilters.fechaFin}`);

        if (filters.length > 0) {
          filterInfoEl.textContent = `🔍 Filtros: ${filters.join(' • ')}`;
        } else {
          filterInfoEl.textContent = '🔍 Sin filtros aplicados';
        }
      }

      // Cargar gráficos
      drawKpiRondaCharts(registros);

      // Cargar tabla
      fillKpiRondaTable(registros);
    }

    // Gráficos
    function drawKpiRondaCharts(registros) {
      drawKpiRondaEstadoChart(registros);
      drawKpiRondaUnidadesChart(registros);
      drawKpiRondaFechaChart(registros);
    }

    // Gráfico de Torta - Estado de Rondas
    let kpiRondaChartEstado = null;
    function drawKpiRondaEstadoChart(registros) {
      const ctx = document.getElementById('kpi-ronda-chart-estado');
      if (!ctx) return;

      // Contar por estado
      const estadoCounts = {};
      registros.forEach(r => {
        const estado = r.estado || 'No especificado';
        estadoCounts[estado] = (estadoCounts[estado] || 0) + 1;
      });

      // Colores por estado
      const estadoColors = {
        'TERMINADA': '#22c55e',
        'INCOMPLETA': '#f59e0b',
        'NO REALIZADA': '#ef4444',
        'INCOMPLETADA': '#f59e0b',
        'No especificado': '#9ca3af'
      };

      const labels = Object.keys(estadoCounts);
      const data = Object.values(estadoCounts);
      const colors = labels.map(l => estadoColors[l] || '#6366f1');

      // Destruir gráfico anterior si existe
      if (kpiRondaChartEstado) kpiRondaChartEstado.destroy();

      kpiRondaChartEstado = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{
            data: data,
            backgroundColor: colors,
            borderColor: '#fff',
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { font: { size: 12 }, padding: 15 }
            }
          }
        }
      });
    }

    // Gráfico de Barras - Rondas por Unidad
    let kpiRondaChartUnidades = null;
    function drawKpiRondaUnidadesChart(registros) {
      const ctx = document.getElementById('kpi-ronda-chart-unidades');
      if (!ctx) return;

      // Contar por unidad
      const unidadCounts = {};
      registros.forEach(r => {
        const unidad = r.unidad || 'Sin unidad';
        unidadCounts[unidad] = (unidadCounts[unidad] || 0) + 1;
      });

      const labels = Object.keys(unidadCounts).sort();
      const data = labels.map(l => unidadCounts[l]);

      // Destruir gráfico anterior si existe
      if (kpiRondaChartUnidades) kpiRondaChartUnidades.destroy();

      kpiRondaChartUnidades = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Cantidad de Rondas',
            data: data,
            backgroundColor: '#3b82f6',
            borderColor: '#1e40af',
            borderWidth: 1
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: true, labels: { font: { size: 11 } } }
          },
          scales: {
            x: { beginAtZero: true, ticks: { stepSize: 1 } }
          }
        }
      });
    }

    // Gráfico de Línea - Rondas por Fecha y Estado
    let kpiRondaChartFecha = null;
    function drawKpiRondaFechaChart(registros) {
      const ctx = document.getElementById('kpi-ronda-chart-fecha');
      if (!ctx) return;

      // Función auxiliar para convertir fecha
      const convertToDate = (value) => {
        if (!value) return null;

        // Si es un Timestamp de Firebase (con propiedades _seconds y _nanoseconds)
        if (value._seconds !== undefined || value._nanoseconds !== undefined) {
          try {
            const ms = (value._seconds || 0) * 1000 + (value._nanoseconds || 0) / 1000000;
            return new Date(ms);
          } catch (e) {
            return null;
          }
        }

        // Si es un Timestamp de Firebase con segundos y nanoseconds
        if (value.seconds !== undefined || value.nanoseconds !== undefined) {
          try {
            const ms = (value.seconds || 0) * 1000 + (value.nanoseconds || 0) / 1000000;
            return new Date(ms);
          } catch (e) {
            return null;
          }
        }

        // Si tiene método toDate()
        if (value.toDate && typeof value.toDate === 'function') return value.toDate();

        if (value instanceof Date) return value;
        if (typeof value === 'string') return new Date(value);
        return null;
      };

      // Agrupar por fecha y estado
      const dataByDate = {};
      registros.forEach(r => {
        const dateObj = convertToDate(r.horarioInicio);
        if (!dateObj || isNaN(dateObj)) return;

        const dateStr = dateObj.toLocaleDateString('es-PE');

        if (!dataByDate[dateStr]) {
          dataByDate[dateStr] = {
            'TERMINADA': 0,
            'INCOMPLETA': 0,
            'INCOMPLETADA': 0,
            'NO REALIZADA': 0
          };
        }

        const estado = r.estado || 'NO REALIZADA';
        dataByDate[dateStr][estado]++;
      });

      const labels = Object.keys(dataByDate).sort();
      const terminadas = labels.map(d => dataByDate[d]['TERMINADA'] || 0);
      const incompletas = labels.map(d => (dataByDate[d]['INCOMPLETA'] || 0) + (dataByDate[d]['INCOMPLETADA'] || 0));
      const noRealizadas = labels.map(d => dataByDate[d]['NO REALIZADA'] || 0);

      // Destruir gráfico anterior si existe
      if (kpiRondaChartFecha) kpiRondaChartFecha.destroy();

      kpiRondaChartFecha = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Completadas',
              data: terminadas,
              borderColor: '#22c55e',
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
              borderWidth: 2,
              tension: 0.4,
              fill: true
            },
            {
              label: 'Incompletas',
              data: incompletas,
              borderColor: '#f59e0b',
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              borderWidth: 2,
              tension: 0.4,
              fill: true
            },
            {
              label: 'No realizadas',
              data: noRealizadas,
              borderColor: '#ef4444',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              borderWidth: 2,
              tension: 0.4,
              fill: true
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'top', labels: { font: { size: 11 }, usePointStyle: true } }
          },
          scales: {
            x: {
              ticks: {
                font: { size: 10 },
                maxRotation: 45,
                minRotation: 0
              }
            },
            y: {
              beginAtZero: true,
              ticks: { stepSize: 1 },
              grace: '10%'
            }
          }
        }
      });
    }

    // Tabla de Información
    function fillKpiRondaTable(registros) {
      const tbody = document.getElementById('kpi-ronda-tabla-body');
      if (!tbody) return;

      tbody.innerHTML = '';

      if (registros.length === 0) {
        tbody.innerHTML = '<tr style="border-bottom: 1px solid #e2e8f0;"><td colspan="7" style="padding: 20px; text-align: center; color: #a0aec0;">No hay registros</td></tr>';
        return;
      }

      // Función auxiliar para convertir valor a Date
      const convertToDate = (value) => {
        if (!value) return null;

        // Si es un Timestamp de Firebase (con propiedades _seconds y _nanoseconds)
        if (value._seconds !== undefined || value._nanoseconds !== undefined) {
          try {
            const ms = (value._seconds || 0) * 1000 + (value._nanoseconds || 0) / 1000000;
            return new Date(ms);
          } catch (e) {
          }
        }

        // Si es un Timestamp de Firebase con segundos y nanoseconds (sin guión bajo)
        if (value.seconds !== undefined || value.nanoseconds !== undefined) {
          try {
            const ms = (value.seconds || 0) * 1000 + (value.nanoseconds || 0) / 1000000;
            return new Date(ms);
          } catch (e) {
          }
        }

        // Si tiene método toDate()
        if (value.toDate && typeof value.toDate === 'function') {
          try {
            return value.toDate();
          } catch (e) {
          }
        }

        // Si es una Date normal
        if (value instanceof Date) return value;

        // Si es un string ISO
        if (typeof value === 'string') {
          try {
            return new Date(value);
          } catch (e) {
          }
        }

        return null;
      };

      registros.forEach((r, idx) => {
        // Debug en primer registro
        if (idx === 0) {
        }

        // Convertir a Date
        let dateObj = convertToDate(r.horarioInicio);

        if (idx === 0) {
        }

        // Formatear fecha
        let fecha = '-';
        let hora = '-';
        if (dateObj && dateObj instanceof Date && !isNaN(dateObj)) {
          try {
            fecha = dateObj.toLocaleDateString('es-PE', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit'
            });
            hora = dateObj.toLocaleTimeString('es-PE', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            });
          } catch (e) {
          }
        } else {
          if (idx === 0) {
          }
        }

        if (idx === 0) {
        }

        // Contar QR desde el objeto puntosRegistrados (convertir a array si es necesario)
        let qrRegistrados = 0;
        let qrSinRegistrar = 0;

        // Convertir puntosRegistrados a array si es un objeto
        let puntosArray = Array.isArray(r.puntosRegistrados)
          ? r.puntosRegistrados
          : (r.puntosRegistrados ? Object.values(r.puntosRegistrados) : []);

        if (puntosArray.length > 0) {
          // Iterar sobre cada punto
          puntosArray.forEach((punto, pIdx) => {
            if (idx === 0);

            // Contar el punto actual si tiene qrEscaneado
            if (punto.qrEscaneado === true) qrRegistrados++;
            else if (punto.qrEscaneado === false) qrSinRegistrar++;
          });

          if (idx === 0) {
          }
        } else {
          // Fallback: usar puntosCompletados y puntosTotales si no hay datos
          qrRegistrados = r.puntosCompletados || 0;
          const qrTotal = r.puntosTotales || 0;
          qrSinRegistrar = qrTotal - qrRegistrados;
        }

        // Color de estado
        let estadoColor = '#9ca3af';
        if (r.estado === 'TERMINADA') estadoColor = '#22c55e';
        else if (r.estado === 'INCOMPLETA' || r.estado === 'INCOMPLETADA') estadoColor = '#f59e0b';
        else if (r.estado === 'NO REALIZADA') estadoColor = '#ef4444';

        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid #e2e8f0';
        row.innerHTML = `
        <td style="padding: 12px; border-right: 1px solid #e2e8f0; font-family: monospace; font-size: 12px;">${fecha}</td>
        <td style="padding: 12px; border-right: 1px solid #e2e8f0; font-family: monospace; font-size: 12px;">${hora}</td>
        <td style="padding: 12px; border-right: 1px solid #e2e8f0; font-size: 12px;">${r.unidad || '-'}</td>
        <td style="padding: 12px; border-right: 1px solid #e2e8f0; font-size: 12px;">${r.nombre || '-'}</td>
        <td style="padding: 12px; text-align: center; border-right: 1px solid #e2e8f0; font-weight: 600; color: #22c55e; font-size: 12px;">${qrRegistrados}</td>
        <td style="padding: 12px; text-align: center; border-right: 1px solid #e2e8f0; font-weight: 600; color: #ef4444; font-size: 12px;">${qrSinRegistrar}</td>
        <td style="padding: 12px; text-align: center;">
          <span style="background: ${estadoColor}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">
            ${r.estado || 'N/A'}
          </span>
        </td>
      `;
        tbody.appendChild(row);
      });
    }

    // ============================================================================
    // 5E) KPI — DETALLE DE RONDAS (TABLA COMPLETA CON FILTROS Y EXPORTACIÓN)
    // ============================================================================
    let detalleRondasFilters = {
      cliente: '',
      unidad: '',
      estado: '',
      fechaInicio: '',
      fechaFin: ''
    };

    function initDetalleRondas() {

      // Cargar opciones de Cliente y Unidad
      loadDetalleRondasClientesUnidades();

      // Event listeners de botones
      document.getElementById('detalle-rondas-aplicar')?.addEventListener('click', () => {
        loadDetalleRondasData();
      });

      document.getElementById('detalle-rondas-limpiar')?.addEventListener('click', () => {
        detalleRondasFilters = {
          cliente: '',
          unidad: '',
          estado: '',
          fechaInicio: '',
          fechaFin: ''
        };
        document.getElementById('detalle-rondas-cliente').value = '';
        document.getElementById('detalle-rondas-unidad').value = '';
        document.getElementById('detalle-rondas-estado').value = '';
        document.getElementById('detalle-rondas-fecha-inicio').value = '';
        document.getElementById('detalle-rondas-fecha-fin').value = '';

        loadDetalleRondasData();
      });

      document.getElementById('detalle-rondas-exportar')?.addEventListener('click', () => {
        exportDetalleRondasToExcel();
      });

      document.getElementById('detalle-rondas-pdf')?.addEventListener('click', () => {
        exportDetalleRondasToPDF();
      });

      // Event listener para cambio de Cliente
      document.getElementById('detalle-rondas-cliente')?.addEventListener('change', () => {
        loadDetalleRondasUnidadesPorCliente();
      });

      // Event listeners para filtros de fecha
      document.getElementById('detalle-rondas-fecha-inicio')?.addEventListener('change', () => {
        detalleRondasFilters.fechaInicio = document.getElementById('detalle-rondas-fecha-inicio').value;
      });

      document.getElementById('detalle-rondas-fecha-fin')?.addEventListener('change', () => {
        detalleRondasFilters.fechaFin = document.getElementById('detalle-rondas-fecha-fin').value;
      });

      // Cargar datos iniciales
      setTimeout(() => {
        loadDetalleRondasData();
      }, 500);
    }

    async function loadDetalleRondasClientesUnidades() {
      try {
        const clienteSelect = document.getElementById('detalle-rondas-cliente');
        if (!clienteSelect) return;

        // Si es usuario CLIENTE, mostrar SOLO su cliente
        if (accessControl && accessControl.userType === 'CLIENTE') {
          const clienteAsignado = accessControl.clienteAsignado;
          clienteSelect.innerHTML = `<option value="${clienteAsignado}">${clienteAsignado}</option>`;
          clienteSelect.disabled = true;
          clienteSelect.style.opacity = '0.6';
          clienteSelect.title = `Acceso restringido a: ${clienteAsignado}`;

          // Cargar unidades iniciales para CLIENTE
          await loadDetalleRondasUnidadesPorCliente();
        } else {
          // ADMIN/SUPERVISOR: mostrar todos los clientes de CLIENTE_UNIDAD
          const snapshot = await db.collection('CLIENTE_UNIDAD').get();
          const clientes = [];

          snapshot.docs.forEach(doc => {
            clientes.push(doc.id);
          });

          clientes.sort((a, b) => a.localeCompare(b, 'es'));

          clienteSelect.innerHTML = '<option value="">Todos</option>';
          clientes.forEach(cliente => {
            // Evitar duplicados si existieran
            const option = document.createElement('option');
            option.value = cliente;
            option.textContent = cliente;
            clienteSelect.appendChild(option);
          });
        }
      } catch (error) {
        console.error('Error cargando clientes:', error);
      }
    }

    async function loadDetalleRondasUnidadesPorCliente() {
      try {
        const clienteSelect = document.getElementById('detalle-rondas-cliente');
        const cliente = clienteSelect?.value || '';
        const unidadSelect = document.getElementById('detalle-rondas-unidad');

        if (!unidadSelect) return;

        // Limpiar select (mantener "Todas" si no es restricción estricta, o "Todas" como default)
        unidadSelect.innerHTML = '<option value="">Todas</option>';

        if (!cliente || cliente === 'Todos') return;

        // Usar helper existente getUnidadesFromClienteUnidad que ya funciona en otros módulos
        let unidades = [];
        try {
          if (typeof getUnidadesFromClienteUnidad === 'function') {
            unidades = await getUnidadesFromClienteUnidad(cliente);
          } else {
            // Fallback manual (soporta mayúsculas/minúsculas)
            const doc = await db.collection('CLIENTE_UNIDAD').doc(cliente).get();
            if (doc.exists) {
              const data = doc.data();
              unidades = data.unidades || data.UNIDADES || [];
            }
          }
        } catch (e) { console.error('Error fetching units:', e); }

        unidades.sort((a, b) => a.localeCompare(b, 'es'));

        const ac = window.accessControl;
        const esClienteRestringido = ac && ac.userType === 'CLIENTE';

        // Si usuario es CLIENTE y solo tiene 1 unidad disponible
        if (esClienteRestringido && unidades.length === 1) {
          const miUnidad = unidades[0];
          unidadSelect.innerHTML = `<option value="${miUnidad}" selected>${miUnidad}</option>`;
          unidadSelect.disabled = true;
          unidadSelect.style.backgroundColor = '#e2e8f0';
          unidadSelect.style.opacity = '0.6';
        } else {
          unidades.forEach(unidad => {
            const option = document.createElement('option');
            option.value = unidad;
            option.textContent = unidad;
            unidadSelect.appendChild(option);
          });
          unidadSelect.disabled = false;
          unidadSelect.style.backgroundColor = '';
          unidadSelect.style.opacity = '1';
        }

      } catch (error) {
        console.error('Error cargando unidades:', error);
      }
    }

    // Cargar mapa de usuarios para búsqueda rápida
    async function loadUsersMap() {
      if (Object.keys(usersMap).length > 0) return;
      try {
        const snap = await db.collection(COLLECTIONS.USERS).get();
        snap.forEach(doc => {
          const d = doc.data();
          const nombre = d.NOMBRES || '';
          const apellido = d.APELLIDOS || '';
          // Guardar nombre completo mapeado al ID (código de usuario)
          usersMap[doc.id] = `${nombre} ${apellido}`.trim() || doc.id;
        });
      } catch (e) {
        console.error("Error cargando mapa de usuarios:", e);
      }
    }

    async function loadDetalleRondasData() {
      try {
        UI.showOverlay('Cargando...', 'Consultando datos de rondas (Optimizado)');
        await loadUsersMap(); // Asegurar que tenemos los nombres de usuario cargados

        const clienteSelect = document.getElementById('detalle-rondas-cliente');
        const unidadSelect = document.getElementById('detalle-rondas-unidad');
        const estadoSelect = document.getElementById('detalle-rondas-estado');

        detalleRondasFilters.cliente = clienteSelect?.value || '';
        detalleRondasFilters.unidad = unidadSelect?.value || '';
        detalleRondasFilters.estado = estadoSelect?.value || '';

        // CONSTRUIR CONSULTA (Server-Side)
        let query = getQueryWithClienteFilter('RONDAS_COMPLETADAS');

        // 1. Cliente
        if (detalleRondasFilters.cliente) {
          query = query.where('cliente', '==', detalleRondasFilters.cliente);
        }
        // 2. Unidad
        if (detalleRondasFilters.unidad) {
          query = query.where('unidad', '==', detalleRondasFilters.unidad);
        }
        // 3. Estado
        if (detalleRondasFilters.estado) {
          query = query.where('estado', '==', detalleRondasFilters.estado);
        }

        // 4. Fechas
        if (detalleRondasFilters.fechaInicio) {
          const parts = detalleRondasFilters.fechaInicio.split('-');
          if (parts.length === 3) {
            const start = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0);
            if (!isNaN(start.getTime())) query = query.where('horarioInicio', '>=', start);
          }
        }
        if (detalleRondasFilters.fechaFin) {
          const parts = detalleRondasFilters.fechaFin.split('-');
          if (parts.length === 3) {
            const end = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999);
            if (!isNaN(end.getTime())) query = query.where('horarioInicio', '<=', end);
          }
        }

        // 5. Orden + Límite (SERVER-SIDE ORDER REMOVIDO TEMPORALMENTE)
        // query = query.orderBy('horarioInicio', 'desc');
        query = query.limit(500); // Límite para evitar sobrecarga

        const snapshot = await query.get();
        let registros = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data
          };
        });

        // ORDENAMIENTO CLIENT-SIDE (Emergency Fix)
        registros.sort((a, b) => {
          const parseDate = (val) => {
            if (!val) return 0;
            if (val.toDate) return val.toDate().getTime();
            if (val instanceof Date) return val.getTime();
            const d = new Date(val);
            return isNaN(d.getTime()) ? 0 : d.getTime();
          };
          return parseDate(b.horarioInicio) - parseDate(a.horarioInicio);
        });

        // Client-side filtering removed as it is now handled by the server
        // Sorting also handled by server
        // Actualizar información (Mostrando hasta 500 registros obtenidos del servidor)
        updateDetalleRondasInfo(registros);

        // Llenar tabla
        fillDetalleRondasTable(registros);

        UI.hideOverlay();
      } catch (error) {
        UI.toast('❌ Error al cargar datos: ' + error.message);
        UI.hideOverlay();
      }
    }

    function updateDetalleRondasInfo(registros) {
      const totalEl = document.getElementById('detalle-rondas-total');
      if (totalEl) {
        totalEl.textContent = registros.length.toLocaleString('es-PE');
      }

      const infoTextEl = document.getElementById('detalle-rondas-info-text');
      if (infoTextEl) {
        if (detalleRondasFilters.cliente || detalleRondasFilters.unidad || detalleRondasFilters.estado || detalleRondasFilters.fechaInicio || detalleRondasFilters.fechaFin) {
          infoTextEl.textContent = 'Registros filtrados (últimos 100)';
        } else {
          infoTextEl.textContent = 'Últimos 100 registros';
        }
      }
    }

    function fillDetalleRondasTable(registros) {
      const tbody = document.getElementById('detalle-rondas-tabla-body');
      if (!tbody) return;

      tbody.innerHTML = '';

      if (registros.length === 0) {
        tbody.innerHTML = '<tr style="border-bottom: 1px solid #e2e8f0;"><td colspan="9" style="padding: 20px; text-align: center; color: #a0aec0;">No hay registros</td></tr>';
        return;
      }

      const convertToDate = (value) => {
        if (!value) return null;

        // Si es un Timestamp de Firebase (con propiedades _seconds y _nanoseconds)
        if (value._seconds !== undefined || value._nanoseconds !== undefined) {
          try {
            const ms = (value._seconds || 0) * 1000 + (value._nanoseconds || 0) / 1000000;
            return new Date(ms);
          } catch (e) {
            return null;
          }
        }

        if (value.seconds !== undefined || value.nanoseconds !== undefined) {
          try {
            const ms = (value.seconds || 0) * 1000 + (value.nanoseconds || 0) / 1000000;
            return new Date(ms);
          } catch (e) {
            return null;
          }
        }

        if (value.toDate && typeof value.toDate === 'function') {
          try {
            return value.toDate();
          } catch (e) {
            return null;
          }
        }

        if (value instanceof Date) return value;

        if (typeof value === 'string') {
          try {
            return new Date(value);
          } catch (e) {
            return null;
          }
        }

        return null;
      };

      registros.forEach(r => {
        let fechaInicio = '-';
        let horaInicio = '-';
        let horaTermino = '-';

        const dateInicio = convertToDate(r.horarioInicio);
        if (dateInicio && dateInicio instanceof Date && !isNaN(dateInicio)) {
          fechaInicio = dateInicio.toLocaleDateString('es-PE', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          });
        }

        // Usar horarioRonda directamente (es la hora programada correcta en formato "HH:MM")
        // horarioInicio puede tener desajustes de zona horaria por cómo se construye en Cloud Functions
        if (r.horarioRonda && typeof r.horarioRonda === 'string' && r.horarioRonda.includes(':')) {
          horaInicio = r.horarioRonda;
        } else if (r.horarioInicio) {
          // Fallback: Si no hay horarioRonda, convertir correctamente el Timestamp a hora Perú (UTC-5)
          const dateInicio2 = convertToDate(r.horarioInicio);
          if (dateInicio2 && dateInicio2 instanceof Date && !isNaN(dateInicio2)) {
            // El Timestamp está en UTC (después de corrección en Cloud Functions)
            // Convertir a hora Perú (UTC-5): restar 5 horas
            // Ej: Si UTC es 23:10, Perú es 18:10
            const utcHoras = dateInicio2.getUTCHours();
            const utcMinutos = dateInicio2.getUTCMinutes();

            // Restar 5 horas para obtener la hora de Perú
            let peruHoras = utcHoras - 5;
            let peruMinutos = utcMinutos;

            // Ajustar si resulta negativo (día anterior)
            if (peruHoras < 0) {
              peruHoras += 24;
            }

            const hh = String(peruHoras).padStart(2, '0');
            const mm = String(peruMinutos).padStart(2, '0');
            horaInicio = `${hh}:${mm}`;
          }
        }

        const dateTermino = convertToDate(r.horarioTermino);
        if (dateTermino && dateTermino instanceof Date && !isNaN(dateTermino)) {
          // Convertir correctamente a hora Perú (UTC-5)
          const utcHoras = dateTermino.getUTCHours();
          const utcMinutos = dateTermino.getUTCMinutes();

          // Restar 5 horas para obtener la hora de Perú
          let peruHoras = utcHoras - 5;
          let peruMinutos = utcMinutos;

          // Ajustar si resulta negativo (día anterior)
          if (peruHoras < 0) {
            peruHoras += 24;
          }

          const hh = String(peruHoras).padStart(2, '0');
          const mm = String(peruMinutos).padStart(2, '0');
          horaTermino = `${hh}:${mm}`;
        }

        const estado = r.estado || 'N/A';

        // Clase CSS según estado
        let estadoClass = '';
        if (estado === 'TERMINADA') {
          estadoClass = 'estado-badge terminada';
        } else if (estado === 'INCOMPLETA' || estado === 'INCOMPLETADA') {
          estadoClass = 'estado-badge incompletada';
        } else if (estado === 'NO REALIZADA') {
          estadoClass = 'estado-badge no-realizada';
        }

        // Contar QR desde el objeto puntosRegistrados (convertir a array si es necesario)
        let qrRegistrados = 0;
        let qrSinRegistrar = 0;

        // Convertir puntosRegistrados a array si es un objeto
        let puntosArray = Array.isArray(r.puntosRegistrados)
          ? r.puntosRegistrados
          : (r.puntosRegistrados ? Object.values(r.puntosRegistrados) : []);

        if (puntosArray.length > 0) {
          // Iterar sobre cada punto
          puntosArray.forEach(punto => {
            // Contar el punto actual si tiene qrEscaneado
            if (punto.qrEscaneado === true) qrRegistrados++;
            else if (punto.qrEscaneado === false) qrSinRegistrar++;
          });
        } else {
          // Fallback: usar puntosCompletados y puntosTotales si no hay datos
          qrRegistrados = r.puntosCompletados || 0;
          const qrTotal = r.puntosTotales || 0;
          qrSinRegistrar = qrTotal - qrRegistrados;
        }

        // Obtener nombre de usuario desde email
        let usuarioNombre = "-";
        if (r.usuarioEmail) {
          // Extraer usuario (parte antes del @)
          const userCode = r.usuarioEmail.split('@')[0];
          // Buscar en el mapa, si no existe poner "-"
          usuarioNombre = usersMap[userCode] || "-";
        }

        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid #e2e8f0';
        row.innerHTML = `
        <td style="padding: 12px; border-right: 1px solid #e2e8f0;">${fechaInicio}</td>
        <td style="padding: 12px; border-right: 1px solid #e2e8f0;">${horaInicio}</td>
        <td style="padding: 12px; border-right: 1px solid #e2e8f0;">${horaTermino}</td>
        <td style="padding: 12px; border-right: 1px solid #e2e8f0;">${r.cliente || '-'}</td>
        <td style="padding: 12px; border-right: 1px solid #e2e8f0;">${r.unidad || '-'}</td>
        <td style="padding: 12px; border-right: 1px solid #e2e8f0;">${r.nombre || '-'}</td>
        <td style="padding: 12px; border-right: 1px solid #e2e8f0; font-weight: 500;">${usuarioNombre}</td>
        <td style="padding: 12px; text-align: center; border-right: 1px solid #e2e8f0; font-weight: 600; color: #22c55e;">${qrRegistrados}</td>
        <td style="padding: 12px; text-align: center; border-right: 1px solid #e2e8f0; font-weight: 600; color: #ef4444;">${qrSinRegistrar}</td>
        <td style="padding: 12px; text-align: center; border-right: 1px solid #e2e8f0;">
          <span class="${estadoClass}">${estado}</span>
        </td>
        <td style="padding: 12px; text-align: center;">
          <button class="btn-download-pdf" data-ronda-id="${r.id}" title="Descargar PDF" style="background: none; border: none; cursor: pointer; color: #3b82f6; font-size: 18px; padding: 4px; transition: all 0.3s ease; display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 6px;">
            ⬇️
          </button>
        </td>
      `;
        tbody.appendChild(row);
      });
    }

    function exportDetalleRondasToExcel() {
      try {
        const tbody = document.getElementById('detalle-rondas-tabla-body');
        if (!tbody) {
          UI.toast('❌ No se encontró la tabla');
          return;
        }

        const rows = tbody.querySelectorAll('tr');
        if (rows.length === 0) {
          UI.toast('⚠️ No hay datos para exportar');
          return;
        }

        const datos = [];

        // Encabezados (sin la columna Acciones)
        datos.push([
          'Fecha',
          'Hora Inicio',
          'Hora Término',
          'Cliente',
          'Unidad',
          'Nombre de Ronda',
          'Usuario',
          'QR Registrados',
          'QR Sin Registrar',
          'Estado'
        ]);

        // Filas
        let rowsExportadas = 0;
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          // Ahora hay 10 celdas (incluida la de Acciones), pero exportamos solo las primeras 9
          if (cells.length >= 9) {
            datos.push([
              cells[0].textContent.trim(),
              cells[1].textContent.trim(),
              cells[2].textContent.trim(),
              cells[3].textContent.trim(),
              cells[4].textContent.trim(),
              cells[5].textContent.trim(),
              cells[6].textContent.trim(), // Usuario
              cells[7].textContent.trim(), // QR Registrados
              cells[8].textContent.trim(), // QR Sin Registrar
              cells[9].textContent.trim()  // Estado
            ]);
            rowsExportadas++;
          }
        });

        // Verificar si hay datos
        if (rowsExportadas === 0) {
          UI.toast('⚠️ No hay registros válidos para exportar');
          return;
        }
        // Crear hoja de cálculo
        const worksheet = XLSX.utils.aoa_to_sheet(datos);

        // Ajustar ancho de columnas
        const colWidths = [15, 15, 15, 15, 15, 20, 20, 15, 15, 15];
        worksheet['!cols'] = colWidths.map(w => ({ wch: w }));

        // Crear libro
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Rondas Completadas');

        // Descargar
        const fileName = `DetalleRondas_${moment().format('YYYYMMDD_HHmmss')}.xlsx`;
        XLSX.writeFile(workbook, fileName);

        UI.toast(`✅ ${rowsExportadas} registros exportados correctamente`);
      } catch (error) {
        UI.toast('❌ Error al exportar: ' + error.message);
      }
    }

    // Función para exportar Detalle de Rondas a PDF con gráfico
    async function exportDetalleRondasToPDF() {
      try {
        const tbody = document.getElementById('detalle-rondas-tabla-body');
        if (!tbody || tbody.querySelectorAll('tr').length === 0) {
          UI.toast('No hay datos para exportar');
          return;
        }

        UI.showOverlay();

        // Cargar logo como base64
        let logoBase64 = null;
        try {
          const logoResponse = await fetch('logo_liberman.png');
          const logoBlob = await logoResponse.blob();
          logoBase64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(logoBlob);
          });
        } catch (e) {
        }

        // Obtener datos de la tabla
        const rows = tbody.querySelectorAll('tr');
        const tableData = [];
        let registrados = 0;
        let noRegistrados = 0;

        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 9) {
            const fila = [
              cells[0].textContent.trim(),
              cells[1].textContent.trim(),
              cells[2].textContent.trim(),
              cells[3].textContent.trim(),
              cells[4].textContent.trim(),
              cells[5].textContent.trim(),
              cells[6].textContent.trim(), // Usuario
              cells[7].textContent.trim(), // QR Registrados
              cells[8].textContent.trim(), // QR Sin Registrar
              cells[9].textContent.trim()  // Estado
            ];
            tableData.push(fila);
            registrados += parseInt(cells[7].textContent.trim()) || 0;
            noRegistrados += parseInt(cells[8].textContent.trim()) || 0;
          }
        });

        // Calcular totales
        const totalPuntos = registrados + noRegistrados;
        const porcentajeReg = totalPuntos > 0 ? ((registrados / totalPuntos) * 100).toFixed(1) : 0;
        const porcentajeNoReg = totalPuntos > 0 ? ((noRegistrados / totalPuntos) * 100).toFixed(1) : 0;

        // Crear gráfico de torta usando Canvas
        const chartCanvas = document.createElement('canvas');
        chartCanvas.width = 500;
        chartCanvas.height = 350;
        chartCanvas.style.display = 'none';
        document.body.appendChild(chartCanvas);

        const chartCtx = chartCanvas.getContext('2d');

        // Crear instancia de Chart.js
        const pieChart = new Chart(chartCtx, {
          type: 'doughnut',
          data: {
            labels: [
              `Registrados\n${registrados}\n(${porcentajeReg}%)`,
              `No Registrados\n${noRegistrados}\n(${porcentajeNoReg}%)`
            ],
            datasets: [{
              data: [registrados, noRegistrados],
              backgroundColor: ['#10b981', '#ef4444'],
              borderColor: ['#059669', '#dc2626'],
              borderWidth: 3,
              borderRadius: 5
            }]
          },
          options: {
            responsive: false,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: true,
                position: 'bottom',
                labels: {
                  font: { size: 16, weight: 'bold' },
                  padding: 20,
                  usePointStyle: true,
                  pointStyle: 'circle'
                }
              },
              tooltip: {
                enabled: true,
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                padding: 12,
                font: { size: 14 }
              }
            }
          }
        });

        // Esperar a que se renderice
        await new Promise(resolve => setTimeout(resolve, 800));
        const chartImage = chartCanvas.toDataURL('image/png');

        // Limpiar
        document.body.removeChild(chartCanvas);
        pieChart.destroy();

        // Crear documento PDF
        const docDef = {
          pageSize: 'A4',
          pageMargins: [40, 70, 40, 40],
          header: function (currentPage) {
            if (currentPage === 1) {
              return {
                columns: [
                  logoBase64 ? {
                    image: logoBase64,
                    width: 60,
                    height: 60
                  } : { text: '' },
                  {
                    text: 'REPORTE DE DETALLE DE RONDAS',
                    fontSize: 18,
                    bold: true,
                    alignment: 'center',
                    margin: [0, 20, 0, 0],
                    color: '#2c5aa0'
                  },
                  {
                    text: '',
                    width: 60
                  }
                ],
                margin: [40, 10, 40, 0]
              };
            }
          },
          footer: function (currentPage, pageCount) {
            return {
              text: `Página ${currentPage} de ${pageCount} | Generado: ${new Date().toLocaleString('es-PE')}`,
              alignment: 'center',
              fontSize: 9,
              margin: [0, 0, 0, 20],
              color: '#999'
            };
          },
          content: [
            {
              text: `Resumen de Puntos de Control`,
              fontSize: 14,
              bold: true,
              margin: [0, 10, 0, 15],
              color: '#2c5aa0'
            },
            {
              columns: [
                {
                  width: '45%',
                  stack: [
                    {
                      text: 'ESTADÍSTICAS',
                      fontSize: 12,
                      bold: true,
                      margin: [0, 0, 0, 10],
                      color: '#333'
                    },
                    {
                      table: {
                        widths: ['60%', '40%'],
                        body: [
                          [
                            { text: 'Total de Puntos:', bold: true, color: '#333', fontSize: 11 },
                            { text: totalPuntos.toString(), bold: true, color: '#2c5aa0', fontSize: 14, alignment: 'center' }
                          ],
                          [
                            { text: 'Registrados:', color: '#059669', bold: true, fontSize: 11 },
                            { text: `${registrados}\n(${porcentajeReg}%)`, color: '#059669', bold: true, fontSize: 12, alignment: 'center' }
                          ],
                          [
                            { text: 'No Registrados:', color: '#dc2626', bold: true, fontSize: 11 },
                            { text: `${noRegistrados}\n(${porcentajeNoReg}%)`, color: '#dc2626', bold: true, fontSize: 12, alignment: 'center' }
                          ]
                        ]
                      },
                      layout: {
                        hLineWidth: function (i, node) { return 1; },
                        vLineWidth: function (i, node) { return 1; },
                        hLineColor: function (i, node) { return '#e0e0e0'; },
                        vLineColor: function (i, node) { return '#e0e0e0'; },
                        paddingLeft: function (i, node) { return 10; },
                        paddingRight: function (i, node) { return 10; },
                        paddingTop: function (i, node) { return 8; },
                        paddingBottom: function (i, node) { return 8; }
                      }
                    }
                  ]
                },
                {
                  width: '55%',
                  alignment: 'center',
                  image: chartImage,
                  width: 280,
                  height: 200,
                  margin: [0, 0, 0, 0]
                }
              ],
              margin: [0, 0, 0, 30],
              columnGap: 20
            },
            {
              text: 'DETALLE DE RONDAS',
              fontSize: 12,
              bold: true,
              margin: [0, 20, 0, 10],
              color: '#2c5aa0'
            },
            {
              table: {
                headerRows: 1,
                widths: ['9%', '8%', '8%', '9%', '9%', '12%', '14%', '8%', '8%', '8%'],
                body: [
                  [
                    { text: 'FECHA', bold: true, fillColor: '#2c5aa0', color: 'white', alignment: 'center', fontSize: 10 },
                    { text: 'H.INI', bold: true, fillColor: '#2c5aa0', color: 'white', alignment: 'center', fontSize: 10 },
                    { text: 'H.TER', bold: true, fillColor: '#2c5aa0', color: 'white', alignment: 'center', fontSize: 10 },
                    { text: 'CLIENTE', bold: true, fillColor: '#2c5aa0', color: 'white', alignment: 'center', fontSize: 10 },
                    { text: 'UNIDAD', bold: true, fillColor: '#2c5aa0', color: 'white', alignment: 'center', fontSize: 10 },
                    { text: 'RONDA', bold: true, fillColor: '#2c5aa0', color: 'white', alignment: 'center', fontSize: 10 },
                    { text: 'USUARIO', bold: true, fillColor: '#2c5aa0', color: 'white', alignment: 'center', fontSize: 10 },
                    { text: 'REG', bold: true, fillColor: '#2c5aa0', color: 'white', alignment: 'center', fontSize: 10 },
                    { text: 'NO REG', bold: true, fillColor: '#2c5aa0', color: 'white', alignment: 'center', fontSize: 10 },
                    { text: 'ESTADO', bold: true, fillColor: '#2c5aa0', color: 'white', alignment: 'center', fontSize: 9 }
                  ],
                  ...tableData.map((fila) => [
                    { text: fila[0], fontSize: 9, alignment: 'center' },
                    { text: fila[1], fontSize: 9, alignment: 'center' },
                    { text: fila[2], fontSize: 9, alignment: 'center' },
                    { text: fila[3], fontSize: 9, alignment: 'center' },
                    { text: fila[4], fontSize: 9, alignment: 'center' },
                    { text: fila[5], fontSize: 9, alignment: 'center' },
                    { text: fila[6], fontSize: 9, alignment: 'center', color: '#333', bold: true }, // Usuario
                    { text: fila[7], fontSize: 9, alignment: 'center', color: '#059669', bold: true }, // Reg
                    { text: fila[8], fontSize: 9, alignment: 'center', color: '#dc2626', bold: true }, // No Reg
                    { text: fila[9], fontSize: 8, alignment: 'center' } // Estado
                  ])
                ]
              },
              layout: {
                hLineWidth: function (i, node) { return 0.5; },
                vLineWidth: function (i, node) { return 0.5; },
                hLineColor: function (i, node) { return '#d0d0d0'; },
                vLineColor: function (i, node) { return '#d0d0d0'; },
                fillColor: function (i, node) {
                  if (i === 0) return '#2c5aa0';
                  return (i % 2 === 0) ? '#f9f9f9' : null;
                },
                paddingLeft: function (i, node) { return 4; },
                paddingRight: function (i, node) { return 4; },
                paddingTop: function (i, node) { return 5; },
                paddingBottom: function (i, node) { return 5; }
              }
            },
            {
              text: `\nTotal de registros reportados: ${tableData.length}`,
              fontSize: 10,
              bold: true,
              margin: [0, 20, 0, 10]
            },
            {
              text: `Fecha de generación: ${new Date().toLocaleDateString('es-PE')} a las ${new Date().toLocaleTimeString('es-PE')}`,
              fontSize: 9,
              color: '#666',
              margin: [0, 0, 0, 0]
            }
          ]
        };

        // Generar y descargar PDF
        pdfMake.createPdf(docDef).download(`detalle_rondas_${new Date().getTime()}.pdf`);

        UI.hideOverlay();
        UI.toast('✅ PDF generado correctamente con gráfico y logo');

      } catch (e) {
        UI.hideOverlay();
        UI.toast('❌ Error al generar PDF: ' + e.message);
      }
    }

    // Función para descargar ronda individual en PDF
    async function descargarRondaPDF(rondaId) {
      try {
        // Mostrar overlay de carga
        UI.showOverlay('Generando PDF', 'Por favor espera...');

        // Obtener la data completa de la ronda desde Firebase directamente
        const doc = await db.collection('RONDAS_COMPLETADAS').doc(rondaId).get();
        if (!doc.exists) {
          UI.hideOverlay();
          UI.toast('❌ No se encontró la ronda en la base de datos');
          return;
        }

        const rondaCompleta = doc.data();

        // Cargar logo como base64
        let logoBase64 = null;
        try {
          const logoResponse = await fetch('logo_liberman.png');
          const logoBlob = await logoResponse.blob();
          logoBase64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(logoBlob);
          });
        } catch (e) {
        }

        // Convertir fecha de Timestamp a formato legible
        const convertToDate = (value) => {
          if (!value) return null;
          if (value._seconds || value._nanoseconds) {
            try {
              const ms = (value._seconds || 0) * 1000 + (value._nanoseconds || 0) / 1000000;
              return new Date(ms);
            } catch (e) { return null; }
          }
          if (value.seconds || value.nanoseconds) {
            try {
              const ms = (value.seconds || 0) * 1000 + (value.nanoseconds || 0) / 1000000;
              return new Date(ms);
            } catch (e) { return null; }
          }
          if (value.toDate && typeof value.toDate === 'function') {
            try { return value.toDate(); } catch (e) { return null; }
          }
          if (value instanceof Date) return value;
          if (typeof value === 'string') {
            try { return new Date(value); } catch (e) { return null; }
          }
          return null;
        };

        const dateInicio = convertToDate(rondaCompleta.horarioInicio);
        const dateTermino = convertToDate(rondaCompleta.horarioTermino);

        const fechaInicio = dateInicio ? dateInicio.toLocaleDateString('es-PE', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '-';
        const horaInicio = dateInicio ? dateInicio.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false }) : '-';
        const horaTermino = dateTermino ? dateTermino.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false }) : '-';

        // Contar QR
        let qrRegistrados = 0, qrSinRegistrar = 0;
        let puntosArray = Array.isArray(rondaCompleta.puntosRegistrados) ? rondaCompleta.puntosRegistrados : (rondaCompleta.puntosRegistrados ? Object.values(rondaCompleta.puntosRegistrados) : []);
        if (puntosArray.length > 0) {
          puntosArray.forEach(punto => {
            if (punto.qrEscaneado === true) qrRegistrados++;
            else if (punto.qrEscaneado === false) qrSinRegistrar++;
          });
        } else {
          qrRegistrados = rondaCompleta.puntosCompletados || 0;
          const qrTotal = rondaCompleta.puntosTotales || 0;
          qrSinRegistrar = qrTotal - qrRegistrados;
        }

        // Crear gráfico de torta
        let chartImage = null;
        const totalPuntos = qrRegistrados + qrSinRegistrar;
        if (totalPuntos > 0) {
          const chartCanvas = document.createElement('canvas');
          chartCanvas.width = 400;
          chartCanvas.height = 300;
          chartCanvas.style.display = 'none';
          document.body.appendChild(chartCanvas);

          const chartCtx = chartCanvas.getContext('2d');
          const porcentajeReg = ((qrRegistrados / totalPuntos) * 100).toFixed(1);
          const porcentajeNoReg = ((qrSinRegistrar / totalPuntos) * 100).toFixed(1);

          const pieChart = new Chart(chartCtx, {
            type: 'doughnut',
            data: {
              labels: [
                `Registrados\n${qrRegistrados}\n(${porcentajeReg}%)`,
                `Sin Registrar\n${qrSinRegistrar}\n(${porcentajeNoReg}%)`
              ],
              datasets: [{
                data: [qrRegistrados, qrSinRegistrar],
                backgroundColor: ['#10b981', '#ef4444'],
                borderColor: ['#059669', '#dc2626'],
                borderWidth: 3,
                borderRadius: 8
              }]
            },
            options: {
              responsive: false,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  display: true,
                  position: 'bottom',
                  labels: {
                    font: { size: 14, weight: 'bold' },
                    padding: 20,
                    usePointStyle: true,
                    pointStyle: 'circle',
                    color: '#2d3748'
                  }
                },
                tooltip: {
                  enabled: true,
                  backgroundColor: 'rgba(0, 0, 0, 0.8)',
                  padding: 12,
                  font: { size: 12 }
                }
              }
            }
          });

          await new Promise(resolve => setTimeout(resolve, 800));
          chartImage = chartCanvas.toDataURL('image/png');
          document.body.removeChild(chartCanvas);
          pieChart.destroy();
        }

        // Obtener detalles de puntos si existen
        let detallesPuntos = [];
        if (puntosArray && puntosArray.length > 0) {
          // DEBUG: Ver estructura exacta en consola para diagnosticar
          console.log('[PDF DEBUG] Puntos encontrados:', puntosArray);

          puntosArray.forEach((punto, idx) => {
            let ts = punto.horaEscaneo;

            // Fallback: buscar en respuestas.timestamp si no existe horaEscaneo
            if (!ts && punto.respuestas) {
              // A veces respuestas es un objeto, a veces array (si hubo múltiples respuestas)
              const respuestas = punto.respuestas;
              if (respuestas.timestamp) ts = respuestas.timestamp;
              else if (respuestas.fecha) ts = respuestas.fecha;
            }

            // Fallback nivel 2: Si el punto tiene timestamp directo (estructura plana)
            if (!ts && punto.timestamp) {
              ts = punto.timestamp;
            }

            let horaStr = '-';
            if (ts) {
              const dateObj = convertToDate(ts);
              if (dateObj) {
                horaStr = dateObj.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
              }
            } else if (punto.qrEscaneado) {
              console.warn(`[PDF DEBUG] Punto #${idx + 1} registrado pero SIN timestamp:`, punto);
            }

            detallesPuntos.push({
              numero: idx + 1,
              nombre: punto.nombre || `Punto ${idx + 1}`,
              estado: punto.qrEscaneado ? '✓ Registrado' : '✗ No Registrado',
              hora: horaStr
            });
          });
        }

        // Crear documento PDF
        const docDefinition = {
          pageSize: 'A4',
          pageMargins: [40, 80, 40, 40],
          header: function (currentPage) {
            if (currentPage === 1) {
              return {
                columns: [
                  logoBase64 ? {
                    image: logoBase64,
                    width: 60,
                    height: 60
                  } : { text: '' },
                  {
                    text: 'REPORTE DE RONDA',
                    fontSize: 18,
                    bold: true,
                    alignment: 'center',
                    margin: [0, 15, 0, 0],
                    color: '#2c5aa0'
                  },
                  {
                    text: '',
                    width: 60
                  }
                ],
                margin: [40, 15, 40, 0]
              };
            }
          },
          footer: function (currentPage, pageCount) {
            return {
              text: `Página ${currentPage} de ${pageCount} | Generado: ${new Date().toLocaleString('es-PE')}`,
              alignment: 'center',
              fontSize: 9,
              margin: [0, 0, 0, 15],
              color: '#999'
            };
          },
          styles: {
            subheader: { fontSize: 13, bold: true, color: '#2c5aa0', marginTop: 15, marginBottom: 10 },
            label: { fontSize: 11, bold: true, color: '#4a5568' },
            value: { fontSize: 11, color: '#2d3748' },
            tableHeader: { bold: true, fillColor: '#2c5aa0', color: 'white', alignment: 'center', fontSize: 10 },
            tableCell: { padding: 6, color: '#2d3748', fontSize: 10 }
          },
          content: [
            // Información General
            { text: 'INFORMACIÓN GENERAL', style: 'subheader' },
            {
              columns: [
                {
                  width: '50%',
                  layout: 'lightHorizontalLines',
                  table: {
                    widths: ['40%', '60%'],
                    body: [
                      [
                        { text: 'Cliente:', style: 'label' },
                        { text: rondaCompleta.cliente || '-', style: 'value' }
                      ],
                      [
                        { text: 'Unidad:', style: 'label' },
                        { text: rondaCompleta.unidad || '-', style: 'value' }
                      ],
                      [
                        { text: 'Ronda:', style: 'label' },
                        { text: rondaCompleta.nombre || '-', style: 'value' }
                      ]
                    ]
                  }
                },
                {
                  width: '50%',
                  layout: 'lightHorizontalLines',
                  table: {
                    widths: ['40%', '60%'],
                    body: [
                      [
                        { text: 'Estado:', style: 'label' },
                        {
                          text: rondaCompleta.estado || '-',
                          color: rondaCompleta.estado === 'TERMINADA' ? '#22c55e' :
                            (rondaCompleta.estado === 'INCOMPLETA' || rondaCompleta.estado === 'INCOMPLETADA') ? '#f59e0b' :
                              rondaCompleta.estado === 'NO REALIZADA' ? '#ef4444' : '#9ca3af',
                          bold: true,
                          fontSize: 11
                        }
                      ],
                      [
                        { text: 'Fecha:', style: 'label' },
                        { text: fechaInicio, style: 'value' }
                      ],
                      [
                        { text: 'Hora Inicio:', style: 'label' },
                        { text: horaInicio, style: 'value' }
                      ]
                    ]
                  }
                }
              ],
              columnGap: 20,
              marginBottom: 20
            },

            // Resumen de Puntos
            { text: 'RESUMEN DE PUNTOS DE CONTROL', style: 'subheader' },
            {
              columns: [
                {
                  width: '45%',
                  layout: 'lightHorizontalLines',
                  table: {
                    widths: ['60%', '40%'],
                    body: [
                      [
                        { text: 'Total Puntos:', style: 'label' },
                        { text: totalPuntos.toString(), style: 'value', alignment: 'center', color: '#3b82f6', bold: true }
                      ],
                      [
                        { text: 'Registrados:', style: 'label', color: '#059669' },
                        { text: qrRegistrados.toString(), style: 'value', alignment: 'center', color: '#059669', bold: true }
                      ],
                      [
                        { text: 'Sin Registrar:', style: 'label', color: '#dc2626' },
                        { text: qrSinRegistrar.toString(), style: 'value', alignment: 'center', color: '#dc2626', bold: true }
                      ]
                    ]
                  }
                },
                {
                  width: '55%',
                  alignment: 'center',
                  ...(chartImage ? { image: chartImage, width: 250, height: 180 } : {})
                }
              ],
              columnGap: 20,
              marginBottom: 20
            }
          ]
        };

        // Agregar tabla de detalles de puntos si existen
        if (detallesPuntos.length > 0) {
          docDefinition.content.push(
            { text: 'DETALLE DE PUNTOS DE CONTROL', style: 'subheader' },
            {
              layout: {
                hLineWidth: function (i, node) { return i === 0 || i === node.table.body.length ? 2 : 0.5; },
                vLineWidth: function (i, node) { return 0.5; },
                hLineColor: function (i, node) { return '#d0d0d0'; },
                vLineColor: function (i, node) { return '#d0d0d0'; },
                fillColor: function (i, node) {
                  if (i === 0) return '#2c5aa0';
                  return (i % 2 === 0) ? '#f9f9f9' : 'white';
                },
                paddingLeft: function (i, node) { return 8; },
                paddingRight: function (i, node) { return 8; },
                paddingTop: function (i, node) { return 6; },
                paddingBottom: function (i, node) { return 6; }
              },
              table: {
                headerRows: 1,
                widths: ['8%', '35%', '20%', '27%'],
                body: [
                  [
                    { text: '#', style: 'tableHeader' },
                    { text: 'PUNTO', style: 'tableHeader' },
                    { text: 'ESTADO', style: 'tableHeader' },
                    { text: 'HORA', style: 'tableHeader' }
                  ],
                  ...detallesPuntos.map(p => [
                    { text: p.numero.toString(), style: 'tableCell', alignment: 'center' },
                    { text: p.nombre, style: 'tableCell' },
                    {
                      text: p.estado,
                      style: 'tableCell',
                      color: p.estado.includes('Registrado') ? '#22c55e' : '#ef4444',
                      bold: true
                    },
                    { text: p.hora, style: 'tableCell', alignment: 'center' }
                  ])
                ]
              },
              marginBottom: 20
            }
          );
        }

        // Agregar pie de página
        docDefinition.content.push(
          { text: '\n' },
          {
            text: `Generado: ${new Date().toLocaleDateString('es-PE')} a las ${new Date().toLocaleTimeString('es-PE')}`,
            alignment: 'center',
            fontSize: 9,
            color: '#a0aec0'
          }
        );

        // Generar y descargar PDF
        UI.hideOverlay();
        if (window.pdfMake && window.pdfMake.createPdf) {
          window.pdfMake.createPdf(docDefinition).download(`Ronda_${rondaCompleta.cliente || 'SinCliente'}_${fechaInicio.replace(/\//g, '-')}_${rondaId.substring(0, 8)}.pdf`);
          UI.toast('✅ PDF descargado correctamente');
        } else {
          UI.toast('❌ Las librerías de PDF no están cargadas');
        }

      } catch (error) {
        UI.hideOverlay();
        UI.toast('❌ Error al generar PDF: ' + error.message);
      }
    }

    // Event Listener para botones de descarga PDF en tabla de rondas
    document.addEventListener('click', (ev) => {
      const btnPDF = ev.target.closest('.btn-download-pdf');
      if (btnPDF) {
        const rondaId = btnPDF.getAttribute('data-ronda-id');
        if (rondaId) {
          descargarRondaPDF(rondaId);
        }
      }
    });

    // ============================================================================
    // 6) INCIDENCIAS — FILTROS, TABLA Y EXPORTACIÓN
    // ============================================================================
    async function buscarIncidencias() {
      if (!incidenciasTbody) return;
      UI.showOverlay('Buscando…', 'Consultando incidencias');

      try {
        let q = getQueryWithClienteFilter(COLLECTIONS.INCIDENTS);

        // Fechas
        const fi = incFechaInicio?.value ? new Date(incFechaInicio.value) : null;
        const ff = incFechaFin?.value ? new Date(incFechaFin.value) : null;
        if (fi) q = q.where('timestamp', '>=', fi);
        if (ff) q = q.where('timestamp', '<=', new Date(ff.getFullYear(), ff.getMonth(), ff.getDate() + 1));

        // Cliente / Unidad / Estado
        const cli = incCliente?.value || '';
        const uni = incUnidad?.value || '';
        const est = incEstado?.value || '';
        if (cli) q = q.where('cliente', '==', cli);
        if (uni) q = q.where('unidad', '==', uni);
        if (est) q = q.where('estado', '==', est);

        const snap = await q.get();
        const rows = snap.docs.map(d => {
          const data = d.data();
          // Convertir timestamp a string para que persista en JSON
          const f = data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp || 0);
          const timestampStr = f instanceof Date && !Number.isNaN(f.getTime()) ? f.toISOString() : new Date().toISOString();

          return {
            id: d.id,
            ...data,
            timestampStr: timestampStr,  // Guardar fecha como string
            timestamp: undefined  // Eliminar objeto Timestamp que no se serializa bien
          };
        })
          .sort((a, b) => {
            const ad = new Date(a.timestampStr);
            const bd = new Date(b.timestampStr);
            return bd.getTime() - ad.getTime(); // desc
          });

        incidenciasTbody.innerHTML = rows.map(r => {
          const f = new Date(r.timestampStr);
          const t = f instanceof Date && !Number.isNaN(f.getTime()) ? f.toLocaleString('es-PE') : '';
          return `<tr>
          <td style="width:150px">${t}</td>
          <td>${r.cliente || ''}</td>
          <td>${r.unidad || ''}</td>
          <td>${r.tipoIncidente || ''}</td>
          <td>${r.detalleIncidente || ''}</td>
          <td>${r.Nivelderiesgo || ''}</td>
          <td>${r.estado || ''}</td>
          <td>${r.comentario || ''}</td>
          <td style="text-align:center; width:100px">
            <button class="btn btn--icon btn-edit-inc" data-id="${r.id}" title="Editar" aria-label="Editar incidencia" style="margin-right:6px">
              ✏️
            </button>
            <button class="btn btn--icon btn-pdf" data-id="${r.id}" title="Descargar PDF" aria-label="Descargar PDF">
              📄
            </button>
          </td>
        </tr>`;
        }).join('');

        incidenciasTbody.dataset.rows = JSON.stringify(rows);
        UI.toast(`Resultados: ${rows.length}`);
      } catch (e) {
        UI.confirm({ title: 'Error', message: 'No se pudo consultar incidencias.', kind: 'err' });
      } finally { UI.hideOverlay(); }
    }

    // Generar PDF para una incidencia con diseño profesional LIDERMAN
    async function generarPDFIncidencia(inc) {
      UI.showOverlay('Generando PDF...', 'Construyendo el reporte');
      try {
        // Convertir timestamp de Firebase correctamente
        let fechaSoloFecha = 'N/A';
        if (inc.timestampStr) {
          try {
            const f = new Date(inc.timestampStr);
            if (f instanceof Date && !Number.isNaN(f.getTime())) {
              fechaSoloFecha = f.toLocaleDateString('es-PE', { year: 'numeric', month: '2-digit', day: '2-digit' });
            }
          } catch (e) {
          }
        } else if (inc.timestamp) {
          // Fallback para casos donde timestamp venga en otro formato
          try {
            let f;
            if (inc.timestamp.toDate && typeof inc.timestamp.toDate === 'function') {
              f = inc.timestamp.toDate();
            } else if (typeof inc.timestamp === 'string') {
              f = new Date(inc.timestamp);
            } else if (typeof inc.timestamp === 'number') {
              f = new Date(inc.timestamp);
            }

            if (f instanceof Date && !Number.isNaN(f.getTime())) {
              fechaSoloFecha = f.toLocaleDateString('es-PE', { year: 'numeric', month: '2-digit', day: '2-digit' });
            }
          } catch (e) {
          }
        } else {
        }

        // Cargar foto desde Firebase Storage (CORS ahora configurado)
        let fotoDataUrl = null;
        if (inc.fotoURL) {
          try {
            let urlFinal = inc.fotoURL;

            // Asegurar que tiene alt=media
            if (!urlFinal.includes('alt=')) {
              urlFinal = urlFinal + (urlFinal.includes('?') ? '&' : '?') + 'alt=media';
            }

            const response = await fetch(urlFinal);
            if (response.ok) {
              const blob = await response.blob();
              fotoDataUrl = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => {
                  resolve(reader.result);
                };
                reader.onerror = () => {
                  resolve(null);
                };
                reader.readAsDataURL(blob);
              });
            } else {
            }
          } catch (e) {
          }
        }

        // Colores profesionales
        const colorPrimario = '#2c5aa0';
        const colorSecundario = '#c41e3a';

        // Construir contenido del PDF
        const content = [];

        // ENCABEZADO CON NÚMERO Y FECHA
        content.push({
          columns: [
            { text: `REPORTE Nº ${inc.id?.toString().slice(-3) || '---'}`, style: 'reportNumber', width: '60%' },
            {
              stack: [
                { text: 'Fecha:', fontSize: 10, bold: true, color: colorPrimario, alignment: 'right' },
                { text: fechaSoloFecha || 'N/A', fontSize: 11, bold: true, alignment: 'right' }
              ],
              width: '40%'
            }
          ],
          margin: [0, 0, 0, 15]
        });

        // LÍNEA SEPARADORA
        content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: colorPrimario }], margin: [0, 0, 0, 12] });

        // DATOS DEL REPORTE (TIPO, CLIENTE, RIESGO, UNIDAD)
        content.push({
          table: {
            widths: ['25%', '25%', '25%', '25%'],
            body: [
              [
                { text: 'Tipo de Incidente:', bold: true, color: colorPrimario, fontSize: 10 },
                { text: inc.tipoIncidente || '-', fontSize: 10 },
                { text: 'Nivel de Riesgo:', bold: true, color: colorPrimario, fontSize: 10 },
                { text: inc.Nivelderiesgo || '-', bold: true, color: colorSecundario, fontSize: 11 }
              ],
              [
                { text: 'Cliente:', bold: true, color: colorPrimario, fontSize: 10 },
                { text: inc.cliente || '-', fontSize: 10 },
                { text: 'Unidad/Sede:', bold: true, color: colorPrimario, fontSize: 10 },
                { text: inc.unidad || '-', fontSize: 10 }
              ]
            ]
          },
          layout: {
            hLineWidth: (i) => i === 0 ? 1 : 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => '#ddd',
            vLineColor: () => '#ddd',
            paddingLeft: () => 8,
            paddingRight: () => 8,
            paddingTop: () => 6,
            paddingBottom: () => 6
          },
          margin: [0, 0, 0, 12]
        });

        // SECCIÓN: DETALLE DEL INCIDENTE
        content.push({ text: 'DETALLE DEL INCIDENTE', style: 'sectionTitle', margin: [0, 0, 0, 8] });
        content.push({
          table: {
            widths: ['100%'],
            body: [
              [{ text: inc.detalleIncidente || 'Sin detalles registrados', alignment: 'left', fontSize: 10, margin: [5, 5, 5, 5] }]
            ]
          },
          layout: {
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            hLineColor: () => '#bbb',
            vLineColor: () => '#bbb',
            paddingLeft: () => 10,
            paddingRight: () => 10,
            paddingTop: () => 8,
            paddingBottom: () => 8
          },
          margin: [0, 0, 0, 12]
        });

        // INFORMACIÓN DEL REGISTRO (REPORTADO POR, ESTADO, PUESTO, SUPERVISOR)
        content.push({
          table: {
            widths: ['25%', '25%', '25%', '25%'],
            body: [
              [
                { text: 'Reportado por:', bold: true, color: colorPrimario, fontSize: 9 },
                { text: inc.registradoPor || '-', fontSize: 9 },
                { text: 'Puesto:', bold: true, color: colorPrimario, fontSize: 9 },
                { text: inc.puesto || '-', fontSize: 9 }
              ],
              [
                { text: 'Estado:', bold: true, color: colorPrimario, fontSize: 9 },
                { text: inc.estado || '-', fontSize: 9 },
                { text: 'Supervisor:', bold: true, color: colorPrimario, fontSize: 9 },
                { text: inc.supervisor || '-', fontSize: 9 }
              ]
            ]
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => '#ddd',
            vLineColor: () => '#ddd',
            paddingLeft: () => 6,
            paddingRight: () => 6,
            paddingTop: () => 5,
            paddingBottom: () => 5
          },
          margin: [0, 0, 0, 12]
        });

        // SECCIÓN: EVIDENCIA/COMENTARIOS
        content.push({ text: 'EVIDENCIA / COMENTARIOS:', style: 'sectionTitle', margin: [0, 15, 0, 8] });
        content.push({
          table: {
            widths: ['100%'],
            body: [
              [{ text: inc.comentario || 'Sin comentarios adicionales', alignment: 'left', fontSize: 10 }]
            ]
          },
          layout: {
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            hLineColor: () => '#bbb',
            vLineColor: () => '#bbb',
            paddingLeft: () => 10,
            paddingRight: () => 10,
            paddingTop: () => 8,
            paddingBottom: () => 8
          },
          margin: [0, 0, 0, 15]
        });

        // Agregar foto si existe
        if (fotoDataUrl) {
          content.push({ text: 'FOTOGRAFÍA DE EVIDENCIA:', style: 'sectionTitle', margin: [0, 15, 0, 8] });
          content.push({
            image: fotoDataUrl,
            width: 150,
            height: 150,
            alignment: 'center',
            margin: [0, 0, 0, 20]
          });
        } else if (inc.fotoURL) {
          // Si no se pudo descargar pero existe URL, mostrar texto con el link
          content.push({ text: 'FOTOGRAFÍA DE EVIDENCIA:', style: 'sectionTitle', margin: [0, 15, 0, 8] });
          content.push({
            text: '[Foto disponible en: ' + inc.fotoURL.substring(0, 50) + '...]',
            fontSize: 9,
            color: '#666',
            alignment: 'center',
            margin: [0, 0, 0, 20],
            italics: true
          });
        }

        // FIRMAS
        content.push({ text: '\n' });
        content.push({
          table: {
            widths: ['50%', '50%'],
            body: [
              [
                { text: '________________________________', alignment: 'center', fontSize: 9, margin: [0, 10, 0, 0] },
                { text: '________________________________', alignment: 'center', fontSize: 9, margin: [0, 10, 0, 0] }
              ],
              [
                { text: `Firma: ${inc.registradoPor || ''}`, alignment: 'center', fontSize: 9, margin: [0, 5, 0, 0] },
                { text: `Supervisor: ${inc.supervisor || ''}`, alignment: 'center', fontSize: 9, margin: [0, 5, 0, 0] }
              ],
              [
                { text: 'Reportado por', alignment: 'center', fontSize: 8, italics: true, color: '#666' },
                { text: 'Supervisor de Seguridad', alignment: 'center', fontSize: 8, italics: true, color: '#666' }
              ]
            ]
          },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: () => 0,
          }
        });

        // Definición completa del documento
        const docDefinition = {
          pageSize: 'A4',
          pageMargins: [40, 40, 40, 40],
          content: content,
          styles: {
            reportNumber: {
              fontSize: 20,
              bold: true,
              color: colorSecundario,
              margin: [0, 5, 0, 5]
            },
            sectionTitle: {
              fontSize: 11,
              bold: true,
              color: '#fff',
              fillColor: colorPrimario,
              alignment: 'left',
              margin: [0, 8, 0, 8],
              padding: [8, 8, 8, 8]
            }
          }
        };

        // Generar y descargar PDF
        if (window.pdfMake && pdfMake.createPdf) {
          pdfMake.createPdf(docDefinition).download(`Reporte_Incidencia_${inc.id || Date.now()}.pdf`);
          UI.toast('PDF descargado exitosamente');
        } else {
          UI.toast('Librería PDF no cargada');
        }
      } catch (err) {
        UI.toast('No se pudo generar el PDF');
      } finally {
        UI.hideOverlay();
      }
    }

    // Delegación de evento para botones en la tabla de incidencias
    if (incidenciasTbody) {
      incidenciasTbody.addEventListener('click', (ev) => {
        const btnPdf = ev.target.closest && ev.target.closest('.btn-pdf');
        const btnEdit = ev.target.closest && ev.target.closest('.btn-edit-inc');

        if (btnPdf) {
          const id = btnPdf.dataset.id;
          const raw = incidenciasTbody.dataset.rows;
          if (!raw) { UI.toast('Primero realiza una búsqueda'); return; }
          const rows = JSON.parse(raw);
          const inc = rows.find(x => x.id === id);
          if (!inc) { UI.toast('Incidencia no encontrada'); return; }
          generarPDFIncidencia(inc);
        } else if (btnEdit) {
          const id = btnEdit.dataset.id;
          const raw = incidenciasTbody.dataset.rows;
          if (!raw) { UI.toast('Primero realiza una búsqueda'); return; }
          const rows = JSON.parse(raw);
          const inc = rows.find(x => x.id === id);
          if (!inc) { UI.toast('Incidencia no encontrada'); return; }
          abrirModalEditarIncidencia(inc);
        }
      });
    }

    // Función para abrir visor de fotos expandible
    function abrirVisorFoto(fotoUrl) {
      // Crear overlay y modal
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:2000;display:flex;align-items:center;justify-content:center;cursor:pointer';

      const imgContainer = document.createElement('div');
      imgContainer.style.cssText = 'position:relative;max-width:90%;max-height:90%;background:#fff;padding:20px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.3)';

      const img = document.createElement('img');
      img.src = fotoUrl;
      img.style.cssText = 'max-width:100%;max-height:600px;object-fit:contain;display:block';
      img.alt = 'Foto expandida';

      const closeBtn = document.createElement('button');
      closeBtn.innerHTML = '✕';
      closeBtn.style.cssText = 'position:absolute;top:5px;right:5px;background:none;border:none;font-size:28px;cursor:pointer;color:#666;hover:color:#000';
      closeBtn.onclick = () => overlay.remove();

      imgContainer.appendChild(img);
      imgContainer.appendChild(closeBtn);
      overlay.appendChild(imgContainer);

      // Cerrar al hacer click fuera de la imagen
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.remove();
        }
      });

      // Cerrar con tecla ESC
      const handleEsc = (e) => {
        if (e.key === 'Escape') {
          overlay.remove();
          document.removeEventListener('keydown', handleEsc);
        }
      };
      document.addEventListener('keydown', handleEsc);

      document.body.appendChild(overlay);
    }

    // Función para generar PDF del Cuaderno (Cronología de Ocurrencias)
    async function generarPDFCuaderno() {
      const raw = cuadernoTbody?.dataset.rows;
      if (!raw) { UI.toast('Primero realiza una búsqueda'); return; }

      const rows = JSON.parse(raw);
      if (rows.length === 0) { UI.toast('No hay registros para exportar'); return; }

      UI.showOverlay('Generando PDF...', 'Creando cuaderno de ocurrencias');

      try {
        // Cargar logo
        let logoBase64 = null;
        try {
          const logoResponse = await fetch('logo_liberman.png');
          if (logoResponse.ok) {
            const logoBlob = await logoResponse.blob();
            logoBase64 = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.readAsDataURL(logoBlob);
            });
          }
        } catch (e) {
          console.warn('No se pudo cargar logo PDF', e);
        }

        const tableBody = [];

        // Encabezados
        const headers = [
          { text: 'FECHA', style: 'tableHeader' },
          { text: 'CLIENTE', style: 'tableHeader' },
          { text: 'TYPE', style: 'tableHeader' },
          { text: 'ENTRANTE', style: 'tableHeader' },
          { text: 'SALIENTE', style: 'tableHeader' },
          { text: 'USUARIO', style: 'tableHeader' },
          { text: 'COMENTARIO', style: 'tableHeader' }
        ];
        tableBody.push(headers);

        rows.forEach((r, idx) => {
          const fechaHora = r.timestampStr || 'N/A';
          const usuarioEntrante = r.usuarioEntrante?.id || r.usuarioEntrante?.nombre || '-';
          const usuarioSaliente = r.usuarioSaliente?.id || r.usuarioSaliente?.nombre || '-';
          const usuario = r.usuario || usuarioEntrante || usuarioSaliente || '-';

          tableBody.push([
            { text: fechaHora, style: 'tableCell', fontSize: 8 },
            { text: r.cliente || '-', style: 'tableCell', fontSize: 8 },
            { text: r.tipoRegistro || '-', style: 'tableCell', fontSize: 8, alignment: 'center' },
            { text: usuarioEntrante, style: 'tableCell', fontSize: 8 },
            { text: usuarioSaliente, style: 'tableCell', fontSize: 8 },
            { text: usuario, style: 'tableCell', fontSize: 8 },
            { text: r.comentario || '', style: 'tableCell', fontSize: 8 }
          ]);
        });

        const docDefinition = {
          pageSize: 'A4',
          pageOrientation: 'landscape',
          pageMargins: [30, 80, 30, 40],
          header: {
            margin: [30, 20, 30, 0],
            columns: [
              logoBase64 ? { image: logoBase64, width: 60 } : { text: '' },
              {
                stack: [
                  { text: 'LIDER CONTROL', style: 'headerTitle', alignment: 'center' },
                  { text: 'Cuaderno de Ocurrencias', style: 'headerSubtitle', alignment: 'center' }
                ],
                width: '*'
              },
              {
                text: `Generado: ${new Date().toLocaleDateString('es-PE')}`,
                alignment: 'right',
                fontSize: 9,
                margin: [0, 10, 0, 0]
              }
            ]
          },
          content: [
            {
              columns: [
                { text: `Total de Registros: ${rows.length}`, style: 'infoText', width: '33%' },
                { text: `Cliente: ${document.getElementById('cuaderno-cliente')?.value || 'Todos'}`, style: 'infoText', width: '33%' },
                { text: `Unidad: ${document.getElementById('cuaderno-unidad')?.value || 'Todas'}`, style: 'infoText', width: '33%' }
              ],
              margin: [0, 0, 0, 15]
            },
            {
              table: {
                headerRows: 1,
                widths: ['12%', '12%', '10%', '15%', '15%', '12%', '24%'],
                body: tableBody
              },
              layout: {
                fillColor: function (i, node) { return (i === 0) ? '#2c5aa0' : (i % 2 === 0) ? '#f3f4f6' : null; },
                hLineWidth: function (i, node) { return (i === 0 || i === node.table.body.length) ? 1 : 0.5; },
                vLineWidth: function (i, node) { return 0.5; },
                hLineColor: function (i, node) { return '#e5e7eb'; },
                vLineColor: function (i, node) { return '#e5e7eb'; }
              }
            }
          ],
          styles: {
            headerTitle: { fontSize: 18, bold: true, color: '#1e3a8a' },
            headerSubtitle: { fontSize: 14, color: '#4b5563', margin: [0, 5, 0, 0] },
            infoText: { fontSize: 10, color: '#4a5568' },
            tableHeader: { bold: true, fontSize: 9, color: 'white', alignment: 'center', margin: [0, 3, 0, 3] },
            tableCell: { margin: [0, 2, 0, 2] }
          }
        };

        pdfMake.createPdf(docDefinition).download(`Cuaderno_${new Date().getTime()}.pdf`);
        UI.toast('✅ PDF generado correctamente');

      } catch (error) {
        console.error(error);
        UI.toast('❌ Error al generar PDF');
      } finally {
        UI.hideOverlay();
      }
    }

    function abrirModalEditarIncidencia(inc) {
      // Crear modal HTML
      const modalHTML = `
      <div id="modal-edit-inc" class="modal-overlay" style="display:flex">
        <div class="modal-content" style="width:90%; max-width:800px; max-height:90vh; overflow-y:auto">
          <div class="modal-header">
            <h2>Editar Incidencia #${inc.id?.toString().slice(-3) || 'N/A'}</h2>
            <button class="btn-close-modal">✕</button>
          </div>
          <form id="form-edit-inc" class="modal-form">
            <div class="form-group">
              <label>Fecha</label>
              <input type="text" name="fecha" value="${inc.timestampStr || ''}" disabled readonly style="background:#f0f0f0">
            </div>
            
            <div class="form-row">
              <div class="form-group">
                <label>Cliente *</label>
                <input type="text" name="cliente" value="${inc.cliente || ''}" required>
              </div>
              <div class="form-group">
                <label>Unidad *</label>
                <input type="text" name="unidad" value="${inc.unidad || ''}" required>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Tipo de Incidente *</label>
                <input type="text" name="tipoIncidente" value="${inc.tipoIncidente || ''}" required>
              </div>
              <div class="form-group">
                <label>Nivel de Riesgo *</label>
                <select name="Nivelderiesgo" required>
                  <option value="">Seleccionar...</option>
                  <option value="BAJO" ${inc.Nivelderiesgo === 'BAJO' ? 'selected' : ''}>BAJO</option>
                  <option value="MEDIO" ${inc.Nivelderiesgo === 'MEDIO' ? 'selected' : ''}>MEDIO</option>
                  <option value="ALTO" ${inc.Nivelderiesgo === 'ALTO' ? 'selected' : ''}>ALTO</option>
                  <option value="CRÍTICO" ${inc.Nivelderiesgo === 'CRÍTICO' ? 'selected' : ''}>CRÍTICO</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label>Detalle del Incidente *</label>
              <textarea name="detalleIncidente" required style="min-height:100px">${inc.detalleIncidente || ''}</textarea>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Reportado por</label>
                <input type="text" name="registradoPor" value="${inc.registradoPor || ''}">
              </div>
              <div class="form-group">
                <label>Puesto</label>
                <input type="text" name="puesto" value="${inc.puesto || ''}">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Estado *</label>
                <select name="estado" required>
                  <option value="">Seleccionar...</option>
                  <option value="Pendiente" ${inc.estado === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
                  <option value="En proceso" ${inc.estado === 'En proceso' ? 'selected' : ''}>En proceso</option>
                  <option value="Resuelto" ${inc.estado === 'Resuelto' ? 'selected' : ''}>Resuelto</option>
                  <option value="Cerrado" ${inc.estado === 'Cerrado' ? 'selected' : ''}>Cerrado</option>
                </select>
              </div>
              <div class="form-group">
                <label>Supervisor</label>
                <input type="text" name="supervisor" value="${inc.supervisor || ''}">
              </div>
            </div>

            <div class="form-group">
              <label>Comentarios</label>
              <textarea name="comentario" style="min-height:80px">${inc.comentario || ''}</textarea>
            </div>

            <div class="form-group">
              <label>Foto/Evidencia</label>
              <div id="foto-preview-container" style="margin-top:10px; text-align:center">
                ${inc.fotoURL ? `<img id="foto-preview" src="${inc.fotoURL}" alt="Foto evidencia" style="max-width:100%; max-height:300px; border-radius:8px; border:1px solid #ddd; margin-bottom:10px">` : '<p style="color:#999">No hay foto asociada</p>'}
              </div>
            </div>

            <div class="form-group">
              <label>Comentario de Cierre (Supervisor)</label>
              <textarea name="comentarioCierre" style="min-height:80px">${inc.comentarioCierre || ''}</textarea>
            </div>

            <div class="modal-footer">
              <button type="button" class="btn" id="btn-cancel-edit" style="background:#ccc; color:#000">Cancelar</button>
              <button type="submit" class="btn" style="background:#2c5aa0; color:#fff">Guardar Cambios</button>
            </div>
          </form>
        </div>
      </div>
    `;

      // Insertar modal en el DOM
      const existingModal = document.getElementById('modal-edit-inc');
      if (existingModal) existingModal.remove();

      document.body.insertAdjacentHTML('beforeend', modalHTML);

      const modal = document.getElementById('modal-edit-inc');
      const form = document.getElementById('form-edit-inc');
      const btnCancel = document.getElementById('btn-cancel-edit');
      const btnClose = modal.querySelector('.btn-close-modal');

      // Cerrar modal
      const cerrarModal = () => modal.remove();
      btnCancel.addEventListener('click', cerrarModal);
      btnClose.addEventListener('click', cerrarModal);
      modal.addEventListener('click', (e) => {
        if (e.target === modal) cerrarModal();
      });

      // Guardar cambios
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        UI.showOverlay('Guardando...', 'Actualizando incidencia');
        try {
          const formData = new FormData(form);
          const updates = {};
          for (let [key, value] of formData) {
            updates[key] = value;
          }

          // Actualizar en Firestore
          await db.collection('INCIDENCIAS_REGISTRADAS').doc(inc.id).update(updates);
          UI.hideOverlay();
          UI.toast('Incidencia actualizada exitosamente');
          cerrarModal();
          // Recargar tabla
          document.getElementById('incidencias-btn-buscar')?.click();
        } catch (error) {
          UI.hideOverlay();
          UI.toast('Error al guardar: ' + error.message);
        }
      });
    }

    function limpiarIncidencias() {
      if (incFechaInicio) incFechaInicio.value = '';
      if (incFechaFin) incFechaFin.value = '';
      if (incCliente) incCliente.value = '';
      if (incUnidad) incUnidad.value = '';
      if (incEstado) incEstado.value = '';
      if (incidenciasTbody) incidenciasTbody.innerHTML = '';
      delete incidenciasTbody?.dataset.rows;
    }

    function exportarIncidenciasCSV() {
      // Redirigir a Excel
      exportarIncidenciasExcel();
    }

    function exportarIncidenciasExcel() {
      const raw = incidenciasTbody?.dataset.rows;
      if (!raw) { UI.toast('Primero realiza una búsqueda'); return; }

      try {
        if (!window.XLSX) {
          UI.toast('Librería XLSX no disponible');
          return;
        }

        const rows = JSON.parse(raw);
        const wb = XLSX.utils.book_new();

        // Encabezados con metadatos
        const headers = ['FECHA', 'CLIENTE', 'UNIDAD', 'CATEGORÍA', 'SUB CATEGORÍA', 'NIVEL DE RIESGO', 'ESTADO', 'COMENTARIO'];
        const ws_data = [
          ['LIDER CONTROL - REPORTE DE INCIDENCIAS'],
          [`Fecha Generación: ${new Date().toLocaleString('es-PE')}`],
          [`Total Registros: ${rows.length}`],
          [], // Espacio
          headers
        ];

        for (const r of rows) {
          // Parsear fecha robustamente
          let fechaStr = '';
          const parseDate = (val) => {
            if (!val) return null;
            if (val.toDate && typeof val.toDate === 'function') return val.toDate();
            if (val instanceof Date) return val;
            if (typeof val === 'number') return new Date(val);
            if (typeof val === 'string') {
              // Try ISO
              let d = new Date(val);
              if (!isNaN(d.getTime())) return d;
              // Try DD/MM/YYYY
              const parts = val.split(/[/\s,:-]+/);
              if (parts.length >= 3) {
                const day = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1;
                const year = parseInt(parts[2], 10);
                const hour = parts.length > 3 ? parseInt(parts[3], 10) : 0;
                const min = parts.length > 4 ? parseInt(parts[4], 10) : 0;
                d = new Date(year, month, day, hour, min);
                if (!isNaN(d.getTime())) return d;
              }
            }
            return null;
          };

          const fechaObj = parseDate(r.timestampStr) || parseDate(r.timestamp);
          if (fechaObj) {
            fechaStr = fechaObj.toLocaleString('es-PE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
          } else {
            fechaStr = r.timestampStr || 'N/A';
          }

          ws_data.push([
            fechaStr,
            r.cliente || '',
            r.unidad || '',
            r.tipoIncidente || '',
            r.detalleIncidente || '',
            r.Nivelderiesgo || '',
            r.estado || '',
            r.comentario || ''
          ]);
        }

        // Crear hoja
        const ws = XLSX.utils.aoa_to_sheet(ws_data);

        // Estilos de columnas
        ws['!cols'] = [
          { wch: 20 }, // FECHA
          { wch: 20 }, // CLIENTE
          { wch: 20 }, // UNIDAD
          { wch: 25 }, // CATEGORÍA
          { wch: 30 }, // SUB CATEGORÍA
          { wch: 15 }, // RIESGO
          { wch: 15 }, // ESTADO
          { wch: 40 }  // COMENTARIO
        ];

        // Estilo Título
        ws['A1'].font = { bold: true, size: 14, color: { rgb: 'FF2c5aa0' } };

        // Estilo Encabezados Tabla (Fila 5)
        const headerRow = 5;
        const colCount = 8;
        for (let c = 0; c < colCount; c++) {
          const cellRef = XLSX.utils.encode_cell({ r: headerRow - 1, c: c });
          if (!ws[cellRef]) ws[cellRef] = { v: '' }; // Asegurar celda
          ws[cellRef].s = {
            font: { bold: true, color: { rgb: 'FFFFFFFF' } },
            fill: { fgColor: { rgb: 'FF2c5aa0' } },
            alignment: { horizontal: 'center', vertical: 'center' }
          };
        }

        // Estilos para celdas de datos (alineación superior y wrap text)
        for (let r = headerRow; r < ws_data.length; r++) {
          for (let c = 0; c < colCount; c++) {
            const cellRef = XLSX.utils.encode_cell({ r: r, c: c });
            if (ws[cellRef]) {
              if (!ws[cellRef].s) ws[cellRef].s = {};
              ws[cellRef].s.alignment = { vertical: 'top', wrapText: true };

              // Colorear nivel de riesgo
              if (c === 5) { // Columna RIESGO
                const val = (ws[cellRef].v || '').toUpperCase();
                if (val === 'ALTO' || val === 'CRÍTICO') ws[cellRef].s.font = { color: { rgb: 'FFdc2626' }, bold: true };
                else if (val === 'MEDIO') ws[cellRef].s.font = { color: { rgb: 'FFd97706' }, bold: true };
                else if (val === 'BAJO') ws[cellRef].s.font = { color: { rgb: 'FF16a34a' }, bold: true };
              }
            }
          }
        }

        XLSX.utils.book_append_sheet(wb, ws, 'Incidencias');
        XLSX.writeFile(wb, `incidencias_${new Date().toISOString().split('T')[0]}.xlsx`);
        UI.toast('Exportado a Excel correctamente');
      } catch (e) {
        console.error(e);
        UI.toast('Error al exportar a Excel');
      }
    }

    incBtnBuscar?.addEventListener('click', buscarIncidencias);
    incBtnLimpiar?.addEventListener('click', limpiarIncidencias);
    incBtnExportar?.addEventListener('click', exportarIncidenciasCSV);

    // ============================================================================
    // 7) OTRAS SECCIONES (USUARIOS, CLIENTE/UNIDAD, ETC.)
    // ============================================================================

    // --- USUARIOS ---
    let usersPage = 1;
    const ITEMS_PER_PAGE = 50;
    let currentFilteredUsers = [];

    async function loadUsers() {
      if (!usersTbody) return;
      UI.showOverlay('Cargando usuarios…', 'Consultando base de datos');
      try {
        // Cargar TODOS los usuarios (límite de 1000 para mejor rendimiento)
        const snap = await db.collection(COLLECTIONS.USERS).limit(1000).get();

        let usuarios = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Si es SUPERVISOR, filtrar para excluir usuarios con TIPOACCESO = 'ADMIN'
        if (accessControl?.isSupervisor()) {
          usuarios = usuarios.filter(u => {
            // Mostrar usuarios que:
            // - NO tienen TIPOACCESO, O
            // - Tienen TIPOACCESO pero NO es 'ADMIN'
            return !u.TIPOACCESO || u.TIPOACCESO !== 'ADMIN';
          });
        }

        cachedUsers = usuarios;
        currentFilteredUsers = cachedUsers; // Inicializar
        renderUsers(cachedUsers);
      } catch (e) {
        UI.confirm({ title: 'Error', message: 'No se pudo cargar la lista de usuarios.', kind: 'err' });
      } finally { UI.hideOverlay(); }
    }

    function renderUsers(list) {
      if (!usersTbody) return;
      usersTbody.innerHTML = '';
      if (usersCountEl) usersCountEl.textContent = `(${list.length})`;

      // Paginación
      const totalPages = Math.ceil(list.length / ITEMS_PER_PAGE) || 1;
      if (usersPage > totalPages) usersPage = totalPages;
      if (usersPage < 1) usersPage = 1;

      const start = (usersPage - 1) * ITEMS_PER_PAGE;
      const end = start + ITEMS_PER_PAGE;
      const paginatedList = list.slice(start, end);

      const frag = document.createDocumentFragment();
      paginatedList.forEach(u => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
        <td>${u.id || ''}</td>
        <td>${u.NOMBRES || ''}</td>
        <td>${u.APELLIDOS || ''}</td>
        <td>${u.CLIENTE || ''}</td>
        <td>${u.UNIDAD || ''}</td>
        <td>${u.TIPO || ''}</td>
        <td>${u.ESTADO || ''}</td>
        <td class="row-actions">
          <button class="btn small secondary" data-act="edit" data-id="${u.id}">Editar</button>
          
          ${(accessControl && (accessControl.userType === 'ADMIN' || accessControl.userType === 'SUPERVISOR')) ?
            `<button class="btn small" style="background:#f59e0b; margin-left:4px;" data-act="reset" data-id="${u.id}" title="Restablecer Contraseña">🔑</button>`
            : ''}

          <button class="btn small danger" data-act="del" data-id="${u.id}">Eliminar</button>
        </td>`;
        frag.appendChild(tr);
      });
      usersTbody.appendChild(frag);

      // Actualizar controles de paginación
      const btnPrev = document.getElementById('btn-prev-users');
      const btnNext = document.getElementById('btn-next-users');
      const pageInfo = document.getElementById('page-info-users');

      if (btnPrev && btnNext && pageInfo) {
        btnPrev.disabled = usersPage === 1;
        btnNext.disabled = usersPage === totalPages;
        pageInfo.textContent = `Página ${usersPage} de ${totalPages}`;
      }
    }

    // Listeners de Paginación Usuarios
    document.getElementById('btn-prev-users')?.addEventListener('click', () => {
      if (usersPage > 1) {
        usersPage--;
        renderUsers(currentFilteredUsers);
      }
    });

    document.getElementById('btn-next-users')?.addEventListener('click', () => {
      const totalPages = Math.ceil(currentFilteredUsers.length / ITEMS_PER_PAGE);
      if (usersPage < totalPages) {
        usersPage++;
        renderUsers(currentFilteredUsers);
      }
    });

    // ===== FILTROS PREDICTIVOS PARA USUARIOS =====
    const filterInputs = {
      id: document.getElementById('filter-id'),
      nombres: document.getElementById('filter-nombres'),
      apellidos: document.getElementById('filter-apellidos'),
      cliente: document.getElementById('filter-cliente'),
      unidad: document.getElementById('filter-unidad'),
      tipo: document.getElementById('filter-tipo'),
      estado: document.getElementById('filter-estado')
    };

    const clearFiltersBtn = document.getElementById('clear-filters');

    function applyFilters() {
      const filters = {
        id: filterInputs.id?.value.toLowerCase().trim() || '',
        nombres: filterInputs.nombres?.value.toLowerCase().trim() || '',
        apellidos: filterInputs.apellidos?.value.toLowerCase().trim() || '',
        cliente: filterInputs.cliente?.value.toLowerCase().trim() || '',
        unidad: filterInputs.unidad?.value.toLowerCase().trim() || '',
        tipo: filterInputs.tipo?.value.toLowerCase().trim() || '',
        estado: filterInputs.estado?.value.toLowerCase().trim() || ''
      };

      const filtered = cachedUsers.filter(u => {
        return (
          (u.id || '').toLowerCase().includes(filters.id) &&
          (u.NOMBRES || '').toLowerCase().includes(filters.nombres) &&
          (u.APELLIDOS || '').toLowerCase().includes(filters.apellidos) &&
          (u.CLIENTE || '').toLowerCase().includes(filters.cliente) &&
          (u.UNIDAD || '').toLowerCase().includes(filters.unidad) &&
          (u.TIPO || '').toLowerCase().includes(filters.tipo) &&
          (u.ESTADO || '').toLowerCase().includes(filters.estado)
        );
      });

      currentFilteredUsers = filtered; // Actualizar lista actual
      usersPage = 1; // Resetear página
      renderUsers(filtered);
    }

    // Event listeners para cada filtro
    Object.values(filterInputs).forEach(input => {
      if (input) {
        input.addEventListener('input', applyFilters);
        input.addEventListener('keyup', applyFilters);
      }
    });

    // Botón para limpiar filtros
    if (clearFiltersBtn) {
      clearFiltersBtn.addEventListener('click', () => {
        Object.values(filterInputs).forEach(input => {
          if (input) input.value = '';
        });
        currentFilteredUsers = cachedUsers;
        usersPage = 1;
        renderUsers(cachedUsers);
      });
    }

    usersTbody?.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('button[data-act]');
      if (!btn) return;
      const id = btn.dataset.id;
      const act = btn.dataset.act;

      if (act === 'del') {
        const ok = await UI.confirm({ title: 'Eliminar usuario', message: `¿Eliminar "${id}"?`, kind: 'err', confirmText: 'Eliminar' });
        if (!ok) return;

        UI.showOverlay('Eliminando…', 'Actualizando');
        try {
          await db.collection(COLLECTIONS.USERS).doc(id).delete();
          cachedUsers = cachedUsers.filter(x => x.id !== id);
          currentFilteredUsers = currentFilteredUsers.filter(x => x.id !== id);
          renderUsers(currentFilteredUsers); // Renderizar lista actual
          UI.toast('Usuario eliminado');
        } catch (e) {
          UI.confirm({ title: 'Error', message: 'No se pudo eliminar.', kind: 'err' });
        } finally { UI.hideOverlay(); }

      } else if (act === 'reset') {
        openPasswordReset(id);
      } else if (act === 'edit') {
        const u = cachedUsers.find(x => x.id === id);
        if (!u) return;

        editNombres.value = u.NOMBRES ?? '';
        editApellidos.value = u.APELLIDOS ?? '';
        editTipo.value = u.TIPO ?? 'AGENTE';
        editEstado.value = u.ESTADO ?? 'ACTIVO';

        (async () => {
          UI.showOverlay('Cargando…', 'Obteniendo datos del usuario');
          try {
            // Usar la función genérica para cargar Cliente/Unidad
            await loadClienteUnidadFiltersGenerico('editCliente', 'editUnidad', false);

            // Establecer los valores del usuario
            editCliente.value = u.CLIENTE || '';

            // Actualizar unidades cuando se cargaron
            setTimeout(() => {
              editUnidad.value = u.UNIDAD || '';
            }, 100);

            editingUserId = id;
            openModal(editModal);
          } catch (e) {
            console.error('Error al cargar usuario:', e);
            UI.toast('❌ Error al cargar los datos del usuario');
          } finally {
            UI.hideOverlay();
          }
        })();
      }
    });

    editCancelBtn?.addEventListener('click', () => closeModal(editModal));
    editForm?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!editingUserId) return;

      const payload = {
        NOMBRES: editNombres.value.trim(),
        APELLIDOS: editApellidos.value.trim(),
        CLIENTE: editCliente.value || '',
        UNIDAD: editUnidad.value || '',
        TIPO: editTipo.value,
        ESTADO: editEstado.value
      };

      UI.showOverlay('Guardando…', 'Actualizando datos');
      try {
        await db.collection(COLLECTIONS.USERS).doc(editingUserId).set(payload, { merge: true });
        const u = cachedUsers.find(x => x.id === editingUserId);
        if (u) Object.assign(u, payload);
        // Re-aplicar filtros para actualizar la vista
        applyFilters();
        // renderUsers(cachedUsers); // Ya no directo
        UI.toast('Usuario actualizado');
        closeModal(editModal);
      } catch (e) {
        UI.confirm({ title: 'Error', message: 'No se pudo actualizar.', kind: 'err' });
      } finally { UI.hideOverlay(); }
    });

    // --- CLIENTE/UNIDAD ---
    let clientUnitPage = 1;
    let currentFilteredClientUnit = [];
    // let cachedClientesUnidades = []; // Removed to avoid lint error (already declared in scope)

    async function fetchClientsUnitsGlobal() {
      // Evitar recargar si ya tenemos datos (opcional, pero seguro por ahora recargar)
      // cachedClientesUnidades = []; // Limpiar antes de cargar

      try {
        // Obtener todos los CLIENTES desde CLIENTE_UNIDAD (límite 500)
        const clientesSnap = await db.collection(COLLECTIONS.CLIENT_UNITS).limit(500).get();
        const tempData = [];

        // Para cada CLIENTE, obtener sus UNIDADES y PUESTOS
        for (const clienteDoc of clientesSnap.docs) {
          const clienteId = clienteDoc.id;
          const clienteData = clienteDoc.data();

          // Obtener UNIDADES desde la SUBCOLECCIÓN
          const unidadesSnap = await db
            .collection(COLLECTIONS.CLIENT_UNITS)
            .doc(clienteId)
            .collection('UNIDADES')
            .get();

          // Para cada UNIDAD, obtener sus PUESTOS
          for (const unidadDoc of unidadesSnap.docs) {
            const unidadId = unidadDoc.id;
            const unidadData = unidadDoc.data();

            // Obtener PUESTOS desde la SUBCOLECCIÓN de UNIDAD
            const puestosSnap = await db
              .collection(COLLECTIONS.CLIENT_UNITS)
              .doc(clienteId)
              .collection('UNIDADES')
              .doc(unidadId)
              .collection('PUESTOS')
              .get();

            // Si hay puestos, agregar una entrada por cada puesto
            if (puestosSnap.size > 0) {
              puestosSnap.docs.forEach(puestoDoc => {
                const puestoId = puestoDoc.id;
                const puestoData = puestoDoc.data();
                tempData.push({
                  clienteId,
                  clienteData,
                  unidadId,
                  unidadData,
                  puestoId,
                  puestoData
                });
              });
            } else {
              // Si no hay puestos, agregar una entrada sin puesto
              tempData.push({
                clienteId,
                clienteData,
                unidadId,
                unidadData,
                puestoId: null,
                puestoData: null
              });
            }
          }

          // Si no hay unidades, agregar una entrada sin unidad
          if (unidadesSnap.size === 0) {
            tempData.push({
              clienteId,
              clienteData,
              unidadId: null,
              unidadData: null,
              puestoId: null,
              puestoData: null
            });
          }
        }

        cachedClientesUnidades = tempData;
        window.cachedClientesUnidades = tempData;
        return true;
      } catch (e) {
        console.error('Error cargando Cliente/Unidad:', e);
        throw e;
      }
    }

    async function loadClienteUnidad() {
      if (!clienteUnidadTbody) return;
      UI.showOverlay('Cargando cliente/unidad…', 'Consultando base de datos');
      try {
        await fetchClientsUnitsGlobal();
        currentFilteredClientUnit = cachedClientesUnidades; // Inicializar
        renderClienteUnidad(cachedClientesUnidades);
      } catch (e) {
        UI.confirm({ title: 'Error', message: 'No se pudo cargar Cliente/Unidad.', kind: 'err' });
      } finally { UI.hideOverlay(); }
    }

    function renderClienteUnidad(list) {
      if (!clienteUnidadTbody) return;

      // Filtrar siempre sobre el array completo que se recibe, o confiar en que 'list' ya es el filtrado.
      // En este diseño, 'renderClienteUnidad' recibe la lista YA filtrada si se llama desde el listener de búsqueda.
      // Pero si se llama desde load, recibe todo.
      // La paginación debe actuar sobre 'list'.

      // REVISIÓN: El listener llama a renderClienteUnidad pasando 'cachedClientesUnidades'.
      // Entonces el filtro se debe aplicar DENTRO de renderClienteUnidad O separar la lógica.
      // El código original filtraba dentro de renderClienteUnidad. Mantendremos eso pero actualizando el 'currentFiltered'.

      const term = norm(clienteUnidadSearchInput?.value || '');
      // Si la lista recibida es la global, aplicamos filtro.
      // Si ya viene filtrada (e.g. por alguna otra razón), re-filtrar no daña si el término coincide.

      const filtered = term
        ? list.filter(x =>
          norm(x.clienteId || '').includes(term) ||
          norm(x.unidadId || '').includes(term) ||
          norm(x.puestoId || '').includes(term)
        )
        : list;

      // Actualizar variable global de filtrados para que los botones de paginación sepan cuántos hay
      currentFilteredClientUnit = filtered;

      clienteUnidadTbody.innerHTML = '';

      // Paginación
      const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE) || 1;
      if (clientUnitPage > totalPages) clientUnitPage = totalPages;
      if (clientUnitPage < 1) clientUnitPage = 1;

      const start = (clientUnitPage - 1) * ITEMS_PER_PAGE;
      const end = start + ITEMS_PER_PAGE;
      const paginatedList = filtered.slice(start, end);

      const frag = document.createDocumentFragment();

      paginatedList.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
        <td>${row.clienteId || ''}</td>
        <td>${row.unidadId || '<i class="muted">Sin unidades</i>'}</td>
        <td>${row.puestoId || '<i class="muted">Sin puestos</i>'}</td>
        <td class="row-actions">
          <button class="btn small secondary" data-act="edit-cu" 
            data-id="${row.clienteId}" 
            data-unidad="${row.unidadId || ''}" 
            data-puesto="${row.puestoId || ''}">Editar</button>
        </td>`;
        frag.appendChild(tr);
      });

      clienteUnidadTbody.appendChild(frag);

      // Actualizar controles de paginación
      const btnPrev = document.getElementById('btn-prev-cu');
      const btnNext = document.getElementById('btn-next-cu');
      const pageInfo = document.getElementById('page-info-cu');

      if (btnPrev && btnNext && pageInfo) {
        btnPrev.disabled = clientUnitPage === 1;
        btnNext.disabled = clientUnitPage === totalPages;
        pageInfo.textContent = `Página ${clientUnitPage} de ${totalPages}`;
      }
    }

    // Listener de búsqueda
    clienteUnidadSearchInput?.addEventListener('input', () => {
      clientUnitPage = 1; // Resetear página al buscar
      renderClienteUnidad(cachedClientesUnidades);
    });

    // Listeners de Paginación Cliente/Unidad
    document.getElementById('btn-prev-cu')?.addEventListener('click', () => {
      if (clientUnitPage > 1) {
        clientUnitPage--;
        // Renderizar usando la lista cached, el render filtrará de nuevo y usará la página actualizada
        renderClienteUnidad(cachedClientesUnidades);
      }
    });

    document.getElementById('btn-next-cu')?.addEventListener('click', () => {
      const totalPages = Math.ceil(currentFilteredClientUnit.length / ITEMS_PER_PAGE);
      if (clientUnitPage < totalPages) {
        clientUnitPage++;
        renderClienteUnidad(cachedClientesUnidades);
      }
    });

    // Función para convertir a mayúsculas
    const toUpperCase = (str) => (str || '').toUpperCase().trim();

    // Botón para agregar nuevo CLIENTE
    cuAgregarClienteBtn?.addEventListener('click', () => {
      cuNuevoCliente.value = '';
      cuNuevaUnidadCliente.value = '';
      openModal(cuAgregarClienteModal);
    });

    // Botón para agregar UNIDAD a cliente existente
    cuAgregarUnidadBtn?.addEventListener('click', async () => {
      // Cargar clientes disponibles
      cuAgregarUnidadCliente.innerHTML = '<option value="">-- Seleccionar Cliente --</option>';
      cuNuevaUnidad.value = '';

      try {
        // Obtener clientes únicos desde cachedClientesUnidades
        const clientesUnicos = [...new Set(cachedClientesUnidades.map(c => c.clienteId))].sort();
        clientesUnicos.forEach(cliente => {
          const option = document.createElement('option');
          option.value = cliente;
          option.textContent = cliente;
          cuAgregarUnidadCliente.appendChild(option);
        });
      } catch (e) {
        console.error('Error cargando clientes:', e);
      }

      openModal(cuAgregarUnidadModal);
    });

    // Botón para agregar PUESTO a unidad
    cuAgregarPuestoBtn?.addEventListener('click', async () => {
      // Limpiar y cargar clientes disponibles
      cuAgregarPuestoCliente.innerHTML = '<option value="">-- Seleccionar Cliente --</option>';
      cuAgregarPuestoUnidad.innerHTML = '<option value="">-- Seleccionar Unidad --</option>';
      cuNuevoPuesto.value = '';

      try {
        // Obtener clientes únicos desde cachedClientesUnidades
        const clientesUnicos = [...new Set(cachedClientesUnidades.map(c => c.clienteId))].sort();
        clientesUnicos.forEach(cliente => {
          const option = document.createElement('option');
          option.value = cliente;
          option.textContent = cliente;
          cuAgregarPuestoCliente.appendChild(option);
        });
      } catch (e) {
        console.error('Error cargando clientes:', e);
      }

      openModal(cuAgregarPuestoModal);
    });

    // Evento para cargar unidades cuando cambia cliente en agregar puesto
    cuAgregarPuestoCliente?.addEventListener('change', async (ev) => {
      const clienteSeleccionado = ev.target.value;
      cuAgregarPuestoUnidad.innerHTML = '<option value="">-- Seleccionar Unidad --</option>';

      if (!clienteSeleccionado) return;

      try {
        // Obtener unidades desde la SUBCOLECCIÓN del cliente
        const unidadesSnap = await db
          .collection(COLLECTIONS.CLIENT_UNITS)
          .doc(clienteSeleccionado)
          .collection('UNIDADES')
          .get();

        unidadesSnap.docs.forEach(doc => {
          const option = document.createElement('option');
          option.value = doc.id;
          option.textContent = doc.id;
          cuAgregarPuestoUnidad.appendChild(option);
        });
      } catch (e) {
        console.error('Error cargando unidades:', e);
      }
    });

    // Cancelar modal agregar cliente
    cuAgregarClienteCancel?.addEventListener('click', () => closeModal(cuAgregarClienteModal));

    // Cancelar modal agregar unidad
    cuAgregarUnidadCancel?.addEventListener('click', () => closeModal(cuAgregarUnidadModal));

    // Cancelar modal agregar puesto
    cuAgregarPuestoCancel?.addEventListener('click', () => closeModal(cuAgregarPuestoModal));

    // Enviar formulario agregar CLIENTE
    cuAgregarClienteForm?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const nuevoCliente = toUpperCase(cuNuevoCliente.value);
      const nuevaUnidad = toUpperCase(cuNuevaUnidadCliente.value);

      if (!nuevoCliente || !nuevaUnidad) {
        UI.toast('Por favor completa todos los campos');
        return;
      }

      // Validar que el cliente no exista
      if (cachedClientesUnidades.some(c => c.clienteId === nuevoCliente)) {
        UI.toast('❌ Este cliente ya existe');
        return;
      }

      UI.showOverlay('Creando…', 'Agregando nuevo cliente');
      try {
        // Crear documento del cliente en CLIENTE_UNIDAD
        await db.collection(COLLECTIONS.CLIENT_UNITS).doc(nuevoCliente).set({
          creado: new Date(),
          descripcion: nuevoCliente
        });

        // Crear la primera UNIDAD en la SUBCOLECCIÓN
        await db
          .collection(COLLECTIONS.CLIENT_UNITS)
          .doc(nuevoCliente)
          .collection('UNIDADES')
          .doc(nuevaUnidad)
          .set({
            nombre: nuevaUnidad,
            creado: new Date()
          });

        // Recargar datos
        clienteUnidadSearchInput.value = ''; // Limpiar búsqueda para ver nuevo registro
        clientUnitPage = 1;
        await loadClienteUnidad();
        UI.toast('✅ Cliente y unidad agregados correctamente');
        closeModal(cuAgregarClienteModal);
      } catch (e) {
        console.error('Error:', e);
        UI.toast('❌ Error al crear cliente');
      } finally {
        UI.hideOverlay();
      }
    });

    // Enviar formulario agregar UNIDAD
    cuAgregarUnidadForm?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const cliente = toUpperCase(cuAgregarUnidadCliente.value);
      const nuevaUnidad = toUpperCase(cuNuevaUnidad.value);

      if (!cliente || !nuevaUnidad) {
        UI.toast('Por favor selecciona un cliente y escribe la unidad');
        return;
      }

      // Validar que la unidad no exista para este cliente
      if (cachedClientesUnidades.some(c => c.clienteId === cliente && c.unidadId === nuevaUnidad)) {
        UI.toast('❌ Esta unidad ya existe para este cliente');
        return;
      }

      UI.showOverlay('Creando…', 'Agregando unidad');
      try {
        // Crear UNIDAD en la SUBCOLECCIÓN del cliente
        await db
          .collection(COLLECTIONS.CLIENT_UNITS)
          .doc(cliente)
          .collection('UNIDADES')
          .doc(nuevaUnidad)
          .set({
            nombre: nuevaUnidad,
            creado: new Date()
          });

        // Recargar datos
        clienteUnidadSearchInput.value = ''; // Limpiar búsqueda para ver nueva unidad
        clientUnitPage = 1;
        await loadClienteUnidad();
        UI.toast('✅ Unidad agregada correctamente');
        closeModal(cuAgregarUnidadModal);
      } catch (e) {
        console.error('Error:', e);
        UI.toast('❌ Error al agregar unidad');
      } finally {
        UI.hideOverlay();
      }
    });

    // Enviar formulario agregar PUESTO
    cuAgregarPuestoForm?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const cliente = toUpperCase(cuAgregarPuestoCliente.value);
      const unidad = toUpperCase(cuAgregarPuestoUnidad.value);
      const nuevoPuesto = toUpperCase(cuNuevoPuesto.value);

      if (!cliente || !unidad || !nuevoPuesto) {
        UI.toast('Por favor completa todos los campos');
        return;
      }

      // Validar que el puesto no exista para esta unidad
      if (cachedClientesUnidades.some(c =>
        c.clienteId === cliente &&
        c.unidadId === unidad &&
        c.puestoId === nuevoPuesto
      )) {
        UI.toast('❌ Este puesto ya existe para esta unidad');
        return;
      }

      UI.showOverlay('Creando…', 'Agregando puesto');
      try {
        // Crear PUESTO en la SUBCOLECCIÓN de UNIDADES
        await db
          .collection(COLLECTIONS.CLIENT_UNITS)
          .doc(cliente)
          .collection('UNIDADES')
          .doc(unidad)
          .collection('PUESTOS')
          .doc(nuevoPuesto)
          .set({
            nombre: nuevoPuesto,
            creado: new Date()
          });

        // Recargar datos
        clienteUnidadSearchInput.value = ''; // Limpiar búsqueda para ver nuevo puesto
        clientUnitPage = 1;
        await loadClienteUnidad();
        UI.toast('✅ Puesto agregado correctamente');
        closeModal(cuAgregarPuestoModal);
      } catch (e) {
        UI.toast('❌ Error al agregar puesto');
      } finally {
        UI.hideOverlay();
      }
    });

    clienteUnidadTbody?.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('button[data-act="edit-cu"]');
      if (!btn) return;
      const docId = btn.dataset.id;
      const oldU = btn.dataset.unidad;
      const oldPuesto = btn.dataset.puesto || '';

      cuEditClienteOriginal.value = docId;
      cuEditUnidadOriginal.value = oldU;
      cuEditPuestoOriginal.value = oldPuesto;
      cuEditCliente.value = docId;
      cuEditCliente.disabled = true;
      cuEditUnidad.value = oldU;
      cuEditPuesto.value = oldPuesto;

      openModal(cuEditModal);
    });

    cuEditCancelBtn?.addEventListener('click', () => {
      closeModal(cuEditModal);
    });

    cuEditForm?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const docId = cuEditClienteOriginal.value;
      const oldU = cuEditUnidadOriginal.value;
      const oldPuesto = cuEditPuestoOriginal.value;
      const newUnidad = toUpperCase(cuEditUnidad.value);
      const newPuesto = toUpperCase(cuEditPuesto.value);

      if (!docId || !oldU || !newUnidad || !newPuesto) return;

      // Validar que haya cambios
      if (newUnidad === oldU && newPuesto === oldPuesto) {
        UI.toast('No hay cambios para guardar');
        return;
      }

      // Validar que la nueva unidad no exista (si cambió el nombre)
      if (newUnidad !== oldU) {
        if (cachedClientesUnidades.some(c => c.clienteId === docId && c.unidadId === newUnidad)) {
          UI.toast('❌ Esta unidad ya existe para este cliente');
          return;
        }
      }

      // Validar que el nuevo puesto no exista en la unidad (si cambió)
      if (newPuesto !== oldPuesto) {
        if (cachedClientesUnidades.some(c =>
          c.clienteId === docId &&
          c.unidadId === newUnidad &&
          c.puestoId === newPuesto
        )) {
          UI.toast('❌ Este puesto ya existe en esta unidad');
          return;
        }
      }

      UI.showOverlay('Guardando…', 'Actualizando datos');
      try {
        // Si cambió el nombre de unidad, renombrar documento UNIDAD
        if (newUnidad !== oldU) {
          // Copiar datos de UNIDAD antigua a nueva
          const unidadAntiguaSnap = await db
            .collection(COLLECTIONS.CLIENT_UNITS)
            .doc(docId)
            .collection('UNIDADES')
            .doc(oldU)
            .get();

          const unidadData = unidadAntiguaSnap.data() || {};

          // Crear nueva unidad
          await db
            .collection(COLLECTIONS.CLIENT_UNITS)
            .doc(docId)
            .collection('UNIDADES')
            .doc(newUnidad)
            .set(unidadData);

          // Copiar todos los PUESTOS a la nueva unidad
          const puestosSnap = await db
            .collection(COLLECTIONS.CLIENT_UNITS)
            .doc(docId)
            .collection('UNIDADES')
            .doc(oldU)
            .collection('PUESTOS')
            .get();

          for (const puestoDoc of puestosSnap.docs) {
            const puestoData = puestoDoc.data();
            await db
              .collection(COLLECTIONS.CLIENT_UNITS)
              .doc(docId)
              .collection('UNIDADES')
              .doc(newUnidad)
              .collection('PUESTOS')
              .doc(puestoDoc.id)
              .set(puestoData);
          }

          // Eliminar unidad antigua
          await db
            .collection(COLLECTIONS.CLIENT_UNITS)
            .doc(docId)
            .collection('UNIDADES')
            .doc(oldU)
            .delete();
        }

        // Si cambió el nombre de puesto, renombrar documento PUESTO
        if (newPuesto !== oldPuesto && oldPuesto) {
          // Copiar datos del PUESTO antiguo
          const puestoAntiguoSnap = await db
            .collection(COLLECTIONS.CLIENT_UNITS)
            .doc(docId)
            .collection('UNIDADES')
            .doc(newUnidad)
            .collection('PUESTOS')
            .doc(oldPuesto)
            .get();

          const puestoData = puestoAntiguoSnap.data() || {};

          // Crear nuevo puesto
          await db
            .collection(COLLECTIONS.CLIENT_UNITS)
            .doc(docId)
            .collection('UNIDADES')
            .doc(newUnidad)
            .collection('PUESTOS')
            .doc(newPuesto)
            .set(puestoData);

          // Eliminar puesto antiguo
          await db
            .collection(COLLECTIONS.CLIENT_UNITS)
            .doc(docId)
            .collection('UNIDADES')
            .doc(newUnidad)
            .collection('PUESTOS')
            .doc(oldPuesto)
            .delete();
        }

        // Recargar datos
        clienteUnidadSearchInput.value = ''; // Limpiar búsqueda para ver cambios
        await loadClienteUnidad();
        UI.toast('✅ Cambios guardados correctamente');
        closeModal(cuEditModal);
      } catch (e) {
        console.error('Error al actualizar:', e);
        UI.toast('❌ Error al guardar los cambios');
      } finally {
        UI.hideOverlay();
      }
    });

    // --- CUADERNO ---
    cuadernoBtnBuscar?.addEventListener('click', async () => {
      if (!cuadernoTbody) return;
      UI.showOverlay('Buscando…', 'Consultando cuaderno');

      try {
        // CORRECCIÓN: Filtrar por FECHA en servidor y CLIENTE/UNIDAD en memoria
        // Esto evita el error de "Índice Compuesto Requerido" si no existe en Firestore
        let q = getQueryWithClienteFilter(COLLECTIONS.LOGBOOK);

        // Helper para parsear "YYYY-MM-DD" como medianoche LOCAL
        const parseLocalDate = (dateStr) => {
          if (!dateStr) return null;
          const [y, m, d] = dateStr.split('-').map(Number);
          return new Date(y, m - 1, d);
        };

        const fi = cuadernoFechaInicio?.value ? parseLocalDate(cuadernoFechaInicio.value) : null;
        const ff = cuadernoFechaFin?.value ? parseLocalDate(cuadernoFechaFin.value) : null;

        const ac = window.accessControl;
        const isClientUser = ac && ac.userType === 'CLIENTE';

        // ESTRATEGIA: 
        // Admin -> Filtro Fecha en Server (Index Simple Timestamp)
        // Cliente -> Filtro Fecha en Memoria (Evita Index Compuesto Cliente+Timestamp que falta)
        if (!isClientUser) {
          if (fi) q = q.where('timestamp', '>=', fi);
          if (ff) {
            const nextDay = new Date(ff);
            nextDay.setDate(nextDay.getDate() + 1);
            q = q.where('timestamp', '<', nextDay);
          }
        }

        // Obtener datos (aumentado limit)
        const snap = await q.limit(2000).get();

        // Aplicar filtros en Memoria
        let rawRows = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Filtro Fecha Local (Para Cliente, y redundante para Admin)
        if (fi || ff) {
          rawRows = rawRows.filter(r => {
            const docDate = r.timestamp?.toDate ? r.timestamp.toDate() : new Date(r.timestamp);
            if (fi && docDate < fi) return false;
            if (ff) {
              const nextDay = new Date(ff);
              nextDay.setDate(nextDay.getDate() + 1);
              if (docDate >= nextDay) return false;
            }
            return true;
          });
        }

        const cli = cuadernoClienteSelect?.value || '';
        const uni = cuadernoUnidadSelect?.value || '';

        if (cli) rawRows = rawRows.filter(r => r.cliente === cli);
        if (uni) rawRows = rawRows.filter(r => r.unidad === uni);

        const rows = rawRows.map(data => {
          const f = data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp || 0);
          const fechaHoraStr = f instanceof Date && !Number.isNaN(f.getTime())
            ? f.toLocaleString('es-PE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
            : 'N/A';
          return {
            ...data,
            timestampStr: fechaHoraStr
          };
        })
          .sort((a, b) => {
            const ad = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp || 0);
            const bd = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp || 0);
            return ad.getTime() - bd.getTime();
          });

        cuadernoTbody.innerHTML = rows.map(r => {
          const f = r.timestamp?.toDate ? r.timestamp.toDate() : new Date(r.timestamp);
          const t = f instanceof Date && !Number.isNaN(f.getTime()) ? f.toLocaleString('es-PE') : '';

          // Extraer nombre de usuarioEntrante y usuarioSaliente (que son objetos)
          const usuarioEntrante = r.usuarioEntrante?.nombre || r.usuarioEntrante?.id || '';
          const usuarioSaliente = r.usuarioSaliente?.nombre || r.usuarioSaliente?.id || '';

          const fotoHTML = r.fotoURL ? `<img src="${r.fotoURL}" alt="Foto" style="width:50px;height:50px;object-fit:cover;cursor:pointer;border-radius:4px;border:1px solid #ddd" class="foto-miniatura" data-url="${r.fotoURL}" title="Haz clic para expandir">` : '<span style="color:#999">Sin foto</span>';
          return `<tr>
          <td style="width:150px">${t}</td>
          <td>${r.cliente || ''}</td>
          <td>${r.unidad || ''}</td>
          <td>${r.tipoRegistro || ''}</td>
          <td>${usuarioEntrante}</td>
          <td>${usuarioSaliente}</td>
          <td>${r.usuario || usuarioEntrante || usuarioSaliente || ''}</td>
          <td>${r.comentario || ''}</td>
          <td style="text-align:center">${fotoHTML}</td>
        </tr>`;
        }).join('');

        cuadernoTbody.dataset.rows = JSON.stringify(rows);
        UI.toast(`Resultados: ${rows.length}`);

        // Agregar event listener para fotos expandibles
        document.querySelectorAll('.foto-miniatura').forEach(img => {
          img.addEventListener('click', (e) => {
            const fotoUrl = e.target.dataset.url;
            if (fotoUrl) {
              abrirVisorFoto(fotoUrl);
            }
          });
        });
      } catch (e) {
        UI.confirm({ title: 'Error', message: 'No se pudo consultar el cuaderno.', kind: 'err' });
      } finally { UI.hideOverlay(); }
    });

    cuadernoBtnLimpiar?.addEventListener('click', () => {
      if (cuadernoClienteSelect) cuadernoClienteSelect.value = '';
      if (cuadernoUnidadSelect) cuadernoUnidadSelect.value = '';
      if (cuadernoFechaInicio) cuadernoFechaInicio.value = '';
      if (cuadernoFechaFin) cuadernoFechaFin.value = '';
      if (cuadernoTbody) cuadernoTbody.innerHTML = '';
      delete cuadernoTbody?.dataset.rows;
    });

    cuadernoBtnExportar?.addEventListener('click', () => {
      const raw = cuadernoTbody?.dataset.rows;
      if (!raw) { UI.toast('Primero realiza una búsqueda'); return; }
      const rows = JSON.parse(raw);

      try {
        const wb = XLSX.utils.book_new();

        // Encabezados de metadatos
        const ws_data = [
          ['LIDER CONTROL - CUADERNO DE OCURRENCIAS'],
          [`Fecha Generación: ${new Date().toLocaleString('es-PE')}`],
          [`Total Registros: ${rows.length}`],
          [], // Espacio
          ['FECHA Y HORA', 'CLIENTE', 'UNIDAD', 'TIPO', 'USUARIO ENTRANTE', 'USUARIO SALIENTE', 'USUARIO', 'COMENTARIO']
        ];

        // Datos
        rows.forEach(r => {
          const fechaHora = r.timestampStr || 'N/A';
          const usuarioEntrante = r.usuarioEntrante?.id || r.usuarioEntrante?.nombre || '';
          const usuarioSaliente = r.usuarioSaliente?.id || r.usuarioSaliente?.nombre || '';
          const usuario = r.usuario || usuarioEntrante || usuarioSaliente || '';

          ws_data.push([
            fechaHora,
            r.cliente || '',
            r.unidad || '',
            r.tipoRegistro || '',
            usuarioEntrante,
            usuarioSaliente,
            usuario,
            r.comentario || ''
          ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(ws_data);

        // Estilos de columnas
        ws['!cols'] = [
          { wch: 20 }, // Fecha
          { wch: 15 }, // Cliente
          { wch: 15 }, // Unidad
          { wch: 12 }, // Tipo
          { wch: 20 }, // Entrante
          { wch: 20 }, // Saliente
          { wch: 20 }, // Usuario
          { wch: 40 }  // Comentario
        ];

        // Estilo Título
        ws['A1'].font = { bold: true, size: 14, color: { rgb: 'FF2c5aa0' } };

        // Estilo Encabezados Tabla (Fila 5)
        const headerRow = 5;
        const colCount = 8;
        for (let c = 0; c < colCount; c++) {
          const cellRef = XLSX.utils.encode_cell({ r: headerRow - 1, c: c });
          if (!ws[cellRef]) ws[cellRef] = { v: '' }; // Asegurar celda
          ws[cellRef].s = {
            font: { bold: true, color: { rgb: 'FFFFFFFF' } },
            fill: { fgColor: { rgb: 'FF2c5aa0' } },
            alignment: { horizontal: 'center', vertical: 'center' }
          };
        }

        XLSX.utils.book_append_sheet(wb, ws, 'Cuaderno');
        XLSX.writeFile(wb, `Cuaderno_${moment().format('YYYYMMDD_HHmm')}.xlsx`);
        UI.toast('✅ Excel exportado correctamente');

      } catch (e) {
        console.error(e);
        UI.toast('❌ Error al exportar Excel');
      }
    });

    cuadernoBtnImprimirPDF?.addEventListener('click', () => {
      generarPDFCuaderno();
    });

    // ============================================================================
    // 7) TIEMPO DE CONEXIÓN - EVENT LISTENERS
    // ============================================================================
    tiempoConexionBtnBuscar?.addEventListener('click', async () => {
      UI.showOverlay('Buscando…', 'Consultando CONTROL_TIEMPOS_USUARIOS');
      try {
        // PATRÓN CUADERNO CON FILTRO DE ACCESO
        let q = getQueryWithClienteFilter('CONTROL_TIEMPOS_USUARIOS');

        // Aplicar filtros de fecha
        const fi = tiempoConexionFechaInicio?.value ? new Date(tiempoConexionFechaInicio.value) : null;
        const ff = tiempoConexionFechaFin?.value ? new Date(tiempoConexionFechaFin.value) : null;
        if (fi) q = q.where('horaInicio', '>=', fi);
        if (ff) q = q.where('horaInicio', '<=', new Date(ff.getFullYear(), ff.getMonth(), ff.getDate() + 1));

        // Aplicar filtros de cliente y unidad
        const clienteFiltro = accessControl.userType === 'CLIENTE'
          ? accessControl.clienteAsignado
          : tiempoConexionCliente?.value || '';

        const unidadFiltro = tiempoConexionUnidad?.value || '';

        if (clienteFiltro) {
          q = q.where('cliente', '==', clienteFiltro);
        }
        if (unidadFiltro) {
          q = q.where('unidad', '==', unidadFiltro);
        }

        // Aplicar filtro de usuario si está seleccionado
        const usr = tiempoConexionUsuario?.value || '';
        if (usr) {
          q = q.where('usuarioID', '==', usr);
        }

        // Ejecutar query
        const snap = await q.orderBy('horaInicio', 'desc').limit(1000).get();

        // Cargar caché de usuarios para mapear usuarioID a cliente/unidad
        const usuariosCache = {};
        const usuariosSnap = await db.collection(COLLECTIONS.USERS).get();
        usuariosSnap.forEach(doc => {
          const userData = doc.data();
          usuariosCache[doc.id] = {
            cliente: userData.CLIENTE || '',
            unidad: userData.UNIDAD || ''
          };
        });

        // Mapear datos enriquecidos - EXTRAYENDO CAMPOS CORRECTOS DE FIREBASE
        const rows = snap.docs.map(d => {
          const data = d.data();
          const usuarioID = data.usuarioID || data.usuario || '';
          const usuarioData = usuariosCache[usuarioID] || {};

          // Extraer datos de Firebase correctamente
          const horaInicio = data.horaInicio?.toDate ? data.horaInicio.toDate() : new Date(data.horaInicio || 0);
          const horaCierre = data.horaCierre?.toDate ? data.horaCierre.toDate() : (data.horaFin?.toDate ? data.horaFin.toDate() : null);

          // Solo la FECHA de horaInicio
          const fechaStr = horaInicio instanceof Date && !Number.isNaN(horaInicio.getTime())
            ? horaInicio.toLocaleDateString('es-PE', { year: 'numeric', month: '2-digit', day: '2-digit' })
            : 'N/A';

          // Solo la HORA de horaInicio
          const horaInicioStr = horaInicio instanceof Date && !Number.isNaN(horaInicio.getTime())
            ? horaInicio.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
            : '--';

          // Solo la HORA de horaCierre
          const horaCierreStr = horaCierre instanceof Date && !Number.isNaN(horaCierre.getTime())
            ? horaCierre.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
            : '--';

          // Calcular duración
          let duracion = '--';
          if (horaInicio instanceof Date && horaCierre instanceof Date) {
            duracion = calcularDuracionTiempo(horaInicio, horaCierre);
          }

          return {
            id: d.id,
            ...data,
            nombreUsuario: data.nombreUsuario || '',
            cliente: data.cliente || usuarioData.cliente || '',
            unidad: data.unidad || usuarioData.unidad || '',
            fechaStr,
            horaInicioStr,
            horaCierreStr,
            duracion
          };
        });

        // Renderizar tabla
        tiempoConexionTbody.innerHTML = rows.map(r => {
          return `<tr>
          <td>${r.nombreUsuario || ''}</td>
          <td>${r.cliente || ''}</td>
          <td>${r.unidad || ''}</td>
          <td>${r.fechaStr}</td>
          <td>${r.horaInicioStr}</td>
          <td>${r.horaCierreStr}</td>
          <td>${r.duracion}</td>
        </tr>`;
        }).join('');

        tiempoConexionTbody.dataset.rows = JSON.stringify(rows);
        UI.toast(`Resultados: ${rows.length}`);
      } catch (e) {
        UI.confirm({ title: 'Error', message: 'No se pudieron cargar los datos de Tiempo de Conexión.', kind: 'err' });
      } finally {
        UI.hideOverlay();
      }
    });

    tiempoConexionBtnLimpiar?.addEventListener('click', () => {
      if (tiempoConexionFechaInicio) tiempoConexionFechaInicio.value = '';
      if (tiempoConexionFechaFin) tiempoConexionFechaFin.value = '';
      if (tiempoConexionCliente) tiempoConexionCliente.value = '';
      if (tiempoConexionUnidad) tiempoConexionUnidad.value = '';
      if (tiempoConexionUsuario) tiempoConexionUsuario.value = '';
      if (tiempoConexionTbody) tiempoConexionTbody.innerHTML = '';
      delete tiempoConexionTbody?.dataset.rows;
    });

    tiempoConexionBtnExportar?.addEventListener('click', async () => {
      const raw = tiempoConexionTbody?.dataset.rows;
      if (!raw) { UI.toast('Primero realiza una búsqueda'); return; }
      const rows = JSON.parse(raw);

      // Crear libro XLS con datos correctos
      let html = '<table border="1"><tr style="background-color:#2c5aa0;color:white;font-weight:bold;">';
      html += '<th>USUARIO</th><th>CLIENTE</th><th>UNIDAD</th><th>FECHA</th><th>HORA INICIO</th><th>HORA FIN</th><th>TIEMPO CONEXIÓN</th></tr>';

      rows.forEach(r => {
        html += `<tr>
        <td>${r.nombreUsuario || ''}</td>
        <td>${r.cliente || ''}</td>
        <td>${r.unidad || ''}</td>
        <td>${r.fechaStr}</td>
        <td>${r.horaInicioStr}</td>
        <td>${r.horaCierreStr}</td>
        <td>${r.duracion}</td>
      </tr>`;
      });

      html += '</table>';

      const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'tiempo_conexion.xls';
      a.click();
      URL.revokeObjectURL(a.href);
      UI.toast('Exportación completada');
    });

    // Función para exportar a PDF
    async function exportarTiempoConexionPDF() {
      const raw = tiempoConexionTbody?.dataset.rows;
      if (!raw) { UI.toast('Primero realiza una búsqueda'); return; }
      const rows = JSON.parse(raw);

      try {
        // Cargar logo
        const logoUrl = 'logo_liberman.png';
        const logoImg = await new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = logoUrl;
        });

        // Convertir imagen a base64
        let logoBase64 = null;
        if (logoImg) {
          const canvas = document.createElement('canvas');
          canvas.width = logoImg.width;
          canvas.height = logoImg.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(logoImg, 0, 0);
          logoBase64 = canvas.toDataURL('image/png');
        }

        // Crear documento PDF
        const docDef = {
          pageSize: 'A4',
          pageMargins: [40, 60, 40, 40],
          header: function () {
            return {
              columns: [
                {
                  image: logoBase64 || null,
                  width: 50,
                  height: 50,
                  margin: [0, 0, 0, 0]
                },
                {
                  text: 'REPORTE DE TIEMPO DE CONEXIÓN',
                  fontSize: 16,
                  bold: true,
                  alignment: 'center',
                  margin: [0, 15, 0, 0]
                },
                {
                  text: 'LiderControl',
                  fontSize: 10,
                  alignment: 'right',
                  margin: [0, 15, 0, 0]
                }
              ]
            };
          },
          footer: function (currentPage, pageCount) {
            return {
              text: `Página ${currentPage} de ${pageCount}`,
              alignment: 'center',
              fontSize: 10,
              margin: [0, 0, 0, 20]
            };
          },
          content: [
            {
              text: `Fecha de reporte: ${new Date().toLocaleDateString('es-PE')}`,
              fontSize: 10,
              margin: [0, 0, 0, 15],
              color: '#666'
            },
            {
              table: {
                headerRows: 1,
                widths: ['15%', '12%', '12%', '13%', '13%', '13%', '22%'],
                body: [
                  [
                    { text: 'USUARIO', bold: true, fillColor: '#2c5aa0', color: 'white', alignment: 'center' },
                    { text: 'CLIENTE', bold: true, fillColor: '#2c5aa0', color: 'white', alignment: 'center' },
                    { text: 'UNIDAD', bold: true, fillColor: '#2c5aa0', color: 'white', alignment: 'center' },
                    { text: 'FECHA', bold: true, fillColor: '#2c5aa0', color: 'white', alignment: 'center' },
                    { text: 'HORA INICIO', bold: true, fillColor: '#2c5aa0', color: 'white', alignment: 'center' },
                    { text: 'HORA FIN', bold: true, fillColor: '#2c5aa0', color: 'white', alignment: 'center' },
                    { text: 'TIEMPO CONEXIÓN', bold: true, fillColor: '#2c5aa0', color: 'white', alignment: 'center' }
                  ],
                  ...rows.map((r, idx) => [
                    { text: r.nombreUsuario || '', fontSize: 9 },
                    { text: r.cliente || '', fontSize: 9 },
                    { text: r.unidad || '', fontSize: 9 },
                    { text: r.fechaStr || '', fontSize: 9 },
                    { text: r.horaInicioStr || '', fontSize: 9 },
                    { text: r.horaCierreStr || '', fontSize: 9 },
                    { text: r.duracion || '', fontSize: 9, bold: true, color: '#3b82f6' }
                  ])
                ]
              },
              layout: {
                fillColor: function (i, node) {
                  return (i % 2 === 0 && i > 0) ? '#f5f5f5' : null;
                }
              }
            },
            {
              text: `Total de registros: ${rows.length}`,
              fontSize: 10,
              margin: [0, 20, 0, 0],
              bold: true
            }
          ]
        };

        // Generar y descargar PDF
        pdfMake.createPdf(docDef).download('tiempo_conexion.pdf');
        UI.toast('PDF generado correctamente');
      } catch (e) {
        UI.toast('Error al generar PDF');
      }
    }

    tiempoConexionBtnPdf?.addEventListener('click', () => {
      exportarTiempoConexionPDF();
    });

    // ============================================================================
    // 8) INICIALIZACIÓN PRINCIPAL DE LA APLICACIÓN
    // ============================================================================
    logoutBtn?.addEventListener('click', async () => {
      try { await auth.signOut(); location.replace('index.html'); }
      catch (e) { ; UI.toast('No se pudo cerrar sesión'); }
    });

    // Cargar filtros de cuaderno una vez autenticado (y también por hook de navegación)
    const tryLoadCuadernoFilters = () => {
      if (!cuadernoFiltersLoaded) {
        cuadernoFiltersLoaded = true;
        loadCuadernoFilters();
      }
    };

    // ============================================================================
    // CONTROL DE ACCESO BASADO EN ROLES
    // ============================================================================
    window.accessControl = null;

    /**
     * Crea una query con filtro automático por cliente
     * Si el usuario es CLIENTE, filtra por su cliente asignado
     * Si es ADMIN, devuelve la query sin filtro
     */
    function getQueryWithClienteFilter(collectionName) {
      let query = db.collection(collectionName);
      const clienteFiltro = window.accessControl?.getClienteFilter();
      if (clienteFiltro) {
        // Soportar ambos campos: 'cliente' (minúsculas) y 'CLIENTE' (mayúsculas)
        const isAccesoPeatonal = collectionName === 'ACCESO_PEATONAL';
        const fieldName = isAccesoPeatonal ? 'CLIENTE' : 'cliente';
        query = query.where(fieldName, '==', clienteFiltro);
      } else {
      }
      return query;
    }



    // Monitor de seguridad: Impide que se muestren vistas sin permisos
    const securityMonitor = setInterval(() => {
      if (!window.accessControl) return;

      // Validar que NO se muestren vistas bloqueadas
      window.accessControl.restrictedViews.forEach(restrictedView => {
        const view = document.getElementById(restrictedView);
        if (view && view.classList.contains('shown')) {
          view.classList.remove('shown');
          UI.showError(
            '🔒 Violación de Seguridad',
            'Se detectó un intento de acceso no autorizado. La sesión será cerrada.'
          );
          setTimeout(() => {
            auth.signOut();
            location.replace('index.html');
          }, 2000);
        }
      });
    }, 500); // Verifica cada 500ms

    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        location.replace('index.html');
      } else {
        currentUser = user;
        const name = user.displayName || user.email || 'Usuario';
        if (userNameEl) userNameEl.textContent = name;
        if (userMetaEl) userMetaEl.textContent = 'Bienvenido(a)';
        if (avatarEl) avatarEl.textContent = (name[0] || 'U').toUpperCase();

        // ===== INICIALIZAR CONTROL DE ACCESO =====
        window.accessControl = new AccessControl(db, auth);
        const accessInitialized = await window.accessControl.initialize(user);

        if (accessInitialized) {
          // Aplicar restricciones de vista al DOM
          window.accessControl.applyDOMRestrictions();

          // Log de acceso para debug
        } else {
          // Por seguridad, cerrar sesión si no se puede verificar permisos
          UI.showError('Error de Seguridad', 'No se pudo verificar tus permisos. Intenta de nuevo.');
          setTimeout(() => {
            auth.signOut();
          }, 2000);
          return;
        }

        // Filtros de cuaderno e incidencias al arranque (ligero)
        tryLoadCuadernoFilters();
        loadIncidenciasFilters();

        // Cargar clientes para Rondas y QR después de que accessControl esté listo
        loadRondaClientes();
        loadQRClientes();
        loadRondas();

        initResumenDashboard();
        initIncidenciasHmDashboard(); // Initialize H&M Dashboard
      }
    });

    /* ===== DETALLE ACCESO DASHBOARD ===== */
    let daCache = [];
    let daCharts = {};

    function initDetalleAccesoDashboard() {
      const daFecha = document.getElementById('da-fecha');
      const daApply = document.getElementById('da-apply');
      const daExport = document.getElementById('da-export');
      const daSearch = document.getElementById('da-search');
      const daSort = document.getElementById('da-sort');

      if (daFecha && typeof $ !== 'undefined' && typeof $.fn.daterangepicker !== 'undefined') {
        $(daFecha).daterangepicker({
          startDate: moment().subtract(29, 'days'),
          endDate: moment(),
          locale: { format: 'DD/MM/YYYY' }
        });
      }

      initDetalleAccesoFilters(); // Cargar Filtros Master Data
      queryDetalleAcceso();
      daApply?.addEventListener('click', renderDetalleAcceso);
      daExport?.addEventListener('click', exportarDetalleAccesoExcel);
      daSearch?.addEventListener('input', () => renderDetalleAccesoTable(daCache));
      daSort?.addEventListener('change', () => renderDetalleAccesoTable(daCache));
    }

    async function queryDetalleAcceso() {
      UI.showOverlay('Cargando accesos…', 'Consultando ACCESO_PEATONAL');
      try {
        const snap = await getQueryWithClienteFilter('ACCESO_PEATONAL').get();
        daCache = snap.docs.map(d => {
          const x = d.data();
          const inStr = `${x.FECHA_INGRESO ?? ''} ${x.HORA_INGRESO ?? ''}`.trim();
          const outStr = `${x.FECHA_SALIDA ?? ''} ${x.HORA_FIN ?? ''}`.trim();
          const tsIn = queryAccesoPeatonalDateParse(inStr);
          const tsOut = queryAccesoPeatonalDateParse(outStr);
          const ts = tsIn || tsOut || null;

          let duracion = 'N/A';
          if (tsIn && tsOut) {
            const dur = moment(tsOut).diff(moment(tsIn), 'minutes');
            const h = Math.floor(dur / 60);
            const m = dur % 60;
            duracion = h > 0 ? `${h}h ${m}m` : `${m}m`;
          }

          return {
            id: d.id,
            FECHA_INGRESO: x.FECHA_INGRESO || '',
            HORA_INGRESO: x.HORA_INGRESO || '',
            FECHA_SALIDA: x.FECHA_SALIDA || '',
            HORA_FIN: x.HORA_FIN || '',
            CLIENTE: (x.CLIENTE || '').toString(),
            UNIDAD: (x.UNIDAD || '').toString(),
            TIPO_ACCESO: (x.TIPO_ACCESO || '').toString(),
            ESTADO: (x.ESTADO || '').toString(),
            EMPRESA: (x.EMPRESA || '').toString(),
            USUARIO: (x.USUARIO || '').toString(),
            _ts: ts,
            duracion: duracion
          };
        });

        let assignedUnits = [];
        if (window.accessControl?.userType === 'CLIENTE') {
          const userUnits = window.accessControl.getUnidadesAsignadas();
          if (userUnits.length > 0) {
            assignedUnits = userUnits;
          } else if (window.accessControl?.clienteAsignado) {
            assignedUnits = await getUnidadesFromClienteUnidad(window.accessControl.clienteAsignado);
          }
        }

        // populateDetalleAccesoFilters(daCache, assignedUnits);
        renderDetalleAcceso();
      } finally {
        UI.hideOverlay();
      }
    }

    async function initDetalleAccesoFilters() {
      // IDs confirmados en Step 153/160 (da-cliente, da-unidad)
      const daCliente = document.getElementById('da-cliente');
      const daSedes = document.getElementById('da-unidad');

      if (!daCliente || !daSedes) return;

      const ac = window.accessControl;

      // --- LÓGICA USUARIO CLIENTE ---
      if (ac?.userType === 'CLIENTE') {
        const c = ac.clienteAsignado;

        // 1. Bloquear Cliente
        daCliente.innerHTML = `<option value="${c}">${c}</option>`;
        daCliente.disabled = true;
        daCliente.style.backgroundColor = '#e2e8f0';

        // 2. Obtener Unidades (Master Data + Fallback)
        let units = [];
        if (typeof getUnidadesFromClienteUnidad === 'function') {
          units = await getUnidadesFromClienteUnidad(c);
        }
        // Fallback manual si falla el helper
        if (!units || units.length === 0) {
          const doc = await db.collection('CLIENTE_UNIDAD').doc(c).get();
          if (doc.exists) {
            const d = doc.data();
            units = d.unidades || d.UNIDADES || [];
          }
        }

        // 3. Filtrar por asignación del usuario
        const allowed = ac.getUnidadesAsignadas();
        if (allowed && allowed.length > 0) {
          units = units.filter(u => allowed.includes(u));
        }
        units.sort();

        // 4. Configurar Select de Unidad
        if (units.length === 1) {
          daSedes.innerHTML = `<option value="${units[0]}">${units[0]}</option>`;
          daSedes.disabled = true;
          daSedes.style.backgroundColor = '#e2e8f0';
        } else {
          // NOTA: Detalle Acceso usa '__ALL__' para "Todos" según código previo
          daSedes.innerHTML = '<option value="__ALL__">Todos</option>' +
            units.map(u => `<option value="${u}">${u}</option>`).join('');
          daSedes.disabled = false;
          daSedes.style.backgroundColor = '';
        }

      } else {
        // --- LÓGICA ADMIN / SUPERVISOR ---
        try {
          const snap = await db.collection('CLIENTE_UNIDAD').get();
          const clients = snap.docs.map(d => d.id).sort();

          daCliente.innerHTML = '<option value="__ALL__">Todos</option>' +
            clients.map(c => `<option value="${c}">${c}</option>`).join('');
          daCliente.disabled = false;

          // Unidad por defecto
          daSedes.innerHTML = '<option value="__ALL__">Todos</option>';
          daSedes.disabled = false; // Se habilitará/llenará mejor con un listener de cambio de cliente, pero por ahora Init básico
        } catch (e) {
          console.error("Error cargando clientes ADMIN:", e);
        }
      }
    }


    function getDetalleAccesoFilters() {
      let start = moment().subtract(29, 'days').startOf('day');
      let end = moment().endOf('day');

      const daFecha = document.getElementById('da-fecha');
      if (daFecha && typeof $ !== 'undefined' && typeof $.fn.daterangepicker !== 'undefined') {
        const v = $(daFecha).val();
        if (v && v.includes(' - ')) {
          const [a, b] = v.split(' - ');
          start = moment(a, 'DD/MM/YYYY').startOf('day');
          end = moment(b, 'DD/MM/YYYY').endOf('day');
        }
      }

      const cliente = document.getElementById('da-cliente')?.value || '__ALL__';
      const unidad = document.getElementById('da-unidad')?.value || '__ALL__';
      const tipo = document.getElementById('da-tipo')?.value || '__ALL__';
      const estado = document.getElementById('da-estado')?.value || '__ALL__';

      return { start, end, cliente, unidad, tipo, estado };
    }

    function renderDetalleAcceso() {
      const { start, end, cliente, unidad, tipo, estado } = getDetalleAccesoFilters();

      const filtered = daCache.filter(r => {
        const inRange = r._ts ? moment(r._ts).isBetween(start, end, undefined, '[]') : false;
        const inCliente = (cliente === '__ALL__') || (r.CLIENTE === cliente);
        const inUnidad = (unidad === '__ALL__') || (r.UNIDAD === unidad);
        const inTipo = (tipo === '__ALL__') || (r.TIPO_ACCESO === tipo);
        const inEstado = (estado === '__ALL__') || (r.ESTADO === estado);
        return inRange && inCliente && inUnidad && inTipo && inEstado;
      });

      // Update summary cards
      const countByType = (key) => filtered.reduce((a, c) => a + (c.TIPO_ACCESO === key ? 1 : 0), 0);

      setCard(document.getElementById('da-total'), filtered.length);
      setCard(document.getElementById('da-visita'), countByType('VISITA'));
      setCard(document.getElementById('da-proveedor'), countByType('PROVEEDOR'));
      setCard(document.getElementById('da-contratista'), countByType('CONTRATISTA'));
      setCard(document.getElementById('da-empleado'), countByType('EMPLEADO'));

      // Chart 1: Línea por fecha
      {
        const labels = [];
        const map = new Map();
        for (let m = start.clone(); m.isSameOrBefore(end, 'day'); m.add(1, 'day')) {
          const key = m.format('DD/MM');
          labels.push(key);
          map.set(key, 0);
        }
        filtered.forEach(r => {
          const key = moment(r._ts).format('DD/MM');
          if (map.has(key)) map.set(key, map.get(key) + 1);
        });
        const dataValues = labels.map(l => map.get(l) || 0);
        const totalAccesos = dataValues.reduce((a, b) => a + b, 0) || 1;



        drawDAChart('da-chart-fecha', {
          type: 'line',
          data: {
            labels,
            datasets: [{
              label: 'Accesos por Fecha',
              data: dataValues,
              borderColor: PALETTE.blue,
              backgroundColor: 'rgba(59,130,246,.15)',
              fill: true,
              tension: .4,
              pointRadius: 8,
              pointHoverRadius: 11,
              pointBorderWidth: 3,
              pointBorderColor: '#fff',
              pointBackgroundColor: PALETTE.blue,
              borderWidth: 4,
              segment: { borderDash: [] },
              datalabels: {
                display: function (context) {
                  return context.value > 0;
                },
                align: 'top',
                anchor: 'end',
                offset: 20,
                font: { size: 13, weight: 'bold' },
                color: '#fff',
                backgroundColor: '#3b82f6',
                borderRadius: 6,
                padding: 8,
                formatter: function (value) {
                  const pct = pf(value, totalAccesos);
                  return `${nf.format(value)}\n${pct}%`;
                }
              }
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 20, bottom: 20, left: 20, right: 20 } },
            interaction: { mode: 'nearest', intersect: false },
            plugins: {
              legend: {
                display: true,
                position: 'top',
                labels: { font: { size: 13, weight: 'bold' }, padding: 20 }
              },
              tooltip: {
                enabled: true,
                backgroundColor: 'rgba(0,0,0,0.95)',
                padding: 16,
                cornerRadius: 10,
                titleFont: { size: 15, weight: 'bold' },
                bodyFont: { size: 14, weight: 'bold' },
                displayColors: true,
                borderColor: '#fff',
                borderWidth: 2,
                callbacks: {
                  label: (c) => `${nf.format(c.raw)} accesos (${pf(c.raw, totalAccesos)}%)`
                }
              }
            },
            scales: {
              y: {
                ticks: { color: themeInk(), font: { size: 13, weight: '600' }, stepSize: 1 },
                grid: { color: 'rgba(0,0,0,0.08)' },
                beginAtZero: true
              },
              x: {
                ticks: { color: themeInk(), font: { size: 12 } },
                grid: { display: false }
              }
            }
          }
        });
      }

      // Chart 2: Pie - Distribución por Tipo
      {
        const map = new Map();
        filtered.forEach(r => {
          const k = r.TIPO_ACCESO || 'SIN TIPO';
          map.set(k, (map.get(k) || 0) + 1);
        });
        const labels = Array.from(map.keys());
        const values = Array.from(map.values());
        const sum = values.reduce((x, y) => x + y, 0) || 1;

        drawDAChart('da-chart-tipo', {
          type: 'pie',
          data: {
            labels: labels.map((l, i) => `${l}\n${nf.format(values[i])} (${pf(values[i], sum)}%)`),
            datasets: [{
              data: values,
              backgroundColor: [PALETTE.blue, PALETTE.amber, PALETTE.purple, PALETTE.red, PALETTE.green],
              borderColor: '#fff',
              borderWidth: 3,
              hoverBorderWidth: 4,
              hoverOffset: 12,
              datalabels: {
                color: '#fff',
                font: { size: 14, weight: 'bold' },
                formatter: function (value, context) {
                  return `${nf.format(value)}\n${pf(value, sum)}%`;
                },
                textStrokeColor: '#000',
                textStrokeWidth: 2,
                offset: 0,
                align: 'center',
                anchor: 'center'
              }
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 40, bottom: 40, left: 20, right: 20 } },
            interaction: { mode: 'point', intersect: true },
            plugins: {
              legend: {
                position: 'bottom',
                labels: {
                  color: themeInk(),
                  padding: 20,
                  font: { size: 14, weight: 'bold' },
                  usePointStyle: true,
                  pointStyle: 'circle',
                  generateLabels: (chart) => {
                    const data = chart.data;
                    return data.labels.map((label, i) => ({
                      text: label,
                      fillStyle: data.datasets[0].backgroundColor[i],
                      hidden: false,
                      index: i
                    }));
                  }
                }
              },
              tooltip: {
                enabled: true,
                backgroundColor: 'rgba(0,0,0,0.95)',
                padding: 16,
                cornerRadius: 10,
                titleFont: { size: 15, weight: 'bold' },
                bodyFont: { size: 14, weight: 'bold' },
                borderColor: '#fff',
                borderWidth: 2,
                callbacks: {
                  label: (c) => `${nf.format(c.raw)} (${pf(c.raw, sum)}%)`
                }
              }
            }
          }
        });
      }

      // Chart 3: Bar - Top Clientes
      {
        const map = new Map();
        filtered.forEach(r => {
          const k = r.CLIENTE || 'SIN CLIENTE';
          map.set(k, (map.get(k) || 0) + 1);
        });
        const arr = Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
        const labels = arr.map(x => x[0]);
        const values = arr.map(x => x[1]);
        const total = values.reduce((a, b) => a + b, 0) || 1;

        drawDAChart('da-chart-clientes', {
          type: 'bar',
          data: {
            labels: labels.map((l, i) => `${l}\n${nf.format(values[i])}`),
            datasets: [{
              label: 'Accesos',
              data: values,
              backgroundColor: PALETTE.blue,
              borderRadius: 8,
              borderSkipped: false,
              hoverBackgroundColor: PALETTE.cyan,
              hoverBorderRadius: 8,
              datalabels: {
                color: '#fff',
                font: { size: 12, weight: 'bold' },
                formatter: function (value) {
                  return `${nf.format(value)} (${pf(value, total)}%)`;
                },
                anchor: 'end',
                align: 'end',
                offset: 12,
                backgroundColor: '#3b82f6',
                borderRadius: 4,
                padding: 8
              }
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 20, bottom: 20, left: 20, right: 120 } },
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: { display: true, position: 'top', labels: { font: { size: 13, weight: 'bold' }, padding: 15 } },
              tooltip: {
                enabled: true,
                backgroundColor: 'rgba(0,0,0,0.95)',
                padding: 16,
                cornerRadius: 10,
                titleFont: { size: 15, weight: 'bold' },
                bodyFont: { size: 14, weight: 'bold' },
                borderColor: '#fff',
                borderWidth: 2,
                callbacks: { label: (c) => `${nf.format(c.raw)} (${pf(c.raw, total)}%)` }
              }
            },
            scales: {
              x: {
                ticks: { color: themeInk(), font: { size: 13, weight: '600' } },
                grid: { color: 'rgba(0,0,0,0.08)' },
                beginAtZero: true
              },
              y: {
                ticks: { color: themeInk(), font: { size: 12, weight: 'bold' } },
                grid: { display: false }
              }
            }
          }
        });
      }

      // Chart 4: Doughnut - Estado de Accesos
      {
        const map = new Map();
        filtered.forEach(r => {
          const k = r.ESTADO || 'SIN ESTADO';
          map.set(k, (map.get(k) || 0) + 1);
        });
        const labels = Array.from(map.keys());
        const values = Array.from(map.values());
        const sum = values.reduce((x, y) => x + y, 0) || 1;

        drawDAChart('da-chart-estado', {
          type: 'doughnut',
          data: {
            labels: labels.map((l, i) => `${l}\n${nf.format(values[i])} (${pf(values[i], sum)}%)`),
            datasets: [{
              data: values,
              backgroundColor: [PALETTE.green, PALETTE.amber, PALETTE.red],
              borderColor: '#fff',
              borderWidth: 3,
              hoverBorderWidth: 4,
              hoverOffset: 12,
              datalabels: {
                color: '#fff',
                font: { size: 14, weight: 'bold' },
                formatter: function (value) {
                  return `${nf.format(value)}\n${pf(value, sum)}%`;
                },
                textStrokeColor: '#000',
                textStrokeWidth: 2,
                offset: 0,
                align: 'center',
                anchor: 'center'
              }
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 40, bottom: 40, left: 20, right: 20 } },
            cutout: '58%',
            interaction: { mode: 'point', intersect: true },
            plugins: {
              legend: {
                position: 'bottom',
                labels: {
                  color: themeInk(),
                  padding: 20,
                  font: { size: 14, weight: 'bold' },
                  usePointStyle: true,
                  pointStyle: 'circle',
                  generateLabels: (chart) => {
                    const data = chart.data;
                    return data.labels.map((label, i) => ({
                      text: label,
                      fillStyle: data.datasets[0].backgroundColor[i],
                      hidden: false,
                      index: i
                    }));
                  }
                }
              },
              tooltip: {
                enabled: true,
                backgroundColor: 'rgba(0,0,0,0.95)',
                padding: 16,
                cornerRadius: 10,
                titleFont: { size: 15, weight: 'bold' },
                bodyFont: { size: 14, weight: 'bold' },
                borderColor: '#fff',
                borderWidth: 2,
                callbacks: {
                  label: (c) => `${nf.format(c.raw)} (${pf(c.raw, sum)}%)`
                }
              }
            }
          }
        });
      }

      // Chart 5: Bar - Accesos por Unidad
      {
        const map = new Map();
        filtered.forEach(r => {
          const k = r.UNIDAD || 'SIN UNIDAD';
          map.set(k, (map.get(k) || 0) + 1);
        });
        const arr = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
        const labels = arr.map(x => x[0]);
        const values = arr.map(x => x[1]);
        const total = values.reduce((a, b) => a + b, 0) || 1;

        drawDAChart('da-chart-unidad', {
          type: 'bar',
          data: {
            labels: labels.map((l, i) => `${l}\n${nf.format(values[i])}`),
            datasets: [{
              label: 'Accesos',
              data: values,
              backgroundColor: PALETTE.blueLt,
              borderRadius: 8,
              borderSkipped: false,
              hoverBackgroundColor: PALETTE.blue,
              hoverBorderRadius: 8,
              datalabels: {
                color: '#fff',
                font: { size: 12, weight: 'bold' },
                formatter: function (value) {
                  return `${nf.format(value)}\n${pf(value, total)}%`;
                },
                anchor: 'end',
                align: 'top',
                offset: 12,
                backgroundColor: '#60a5fa',
                borderRadius: 4,
                padding: 8
              }
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 20, bottom: 20, left: 20, right: 20 } },
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: { display: true, position: 'top', labels: { font: { size: 13, weight: 'bold' }, padding: 15 } },
              tooltip: {
                enabled: true,
                backgroundColor: 'rgba(0,0,0,0.95)',
                padding: 16,
                cornerRadius: 10,
                titleFont: { size: 15, weight: 'bold' },
                bodyFont: { size: 14, weight: 'bold' },
                borderColor: '#fff',
                borderWidth: 2,
                callbacks: { label: (c) => `${nf.format(c.raw)} (${pf(c.raw, total)}%)` }
              }
            },
            scales: {
              y: {
                ticks: { color: themeInk(), font: { size: 13, weight: '600' } },
                grid: { color: 'rgba(0,0,0,0.08)' },
                beginAtZero: true
              },
              x: {
                ticks: { color: themeInk(), autoSkip: false, maxRotation: 45, minRotation: 0, font: { size: 12, weight: 'bold' } },
                grid: { display: false }
              }
            }
          }
        });
      }

      // Chart 6: Bar - Accesos por Empresa
      {
        const map = new Map();
        filtered.forEach(r => {
          const k = r.EMPRESA || 'SIN EMPRESA';
          map.set(k, (map.get(k) || 0) + 1);
        });
        const arr = Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15);
        const labels = arr.map(x => x[0]);
        const values = arr.map(x => x[1]);
        const total = values.reduce((a, b) => a + b, 0) || 1;

        drawDAChart('da-chart-empresa', {
          type: 'bar',
          data: {
            labels: labels.map((l, i) => `${l}\n${nf.format(values[i])}`),
            datasets: [{
              label: 'Accesos',
              data: values,
              backgroundColor: PALETTE.purple,
              borderRadius: 8,
              borderSkipped: false,
              hoverBackgroundColor: PALETTE.pink,
              hoverBorderRadius: 8,
              datalabels: {
                color: '#fff',
                font: { size: 12, weight: 'bold' },
                formatter: function (value) {
                  return `${nf.format(value)}\n${pf(value, total)}%`;
                },
                anchor: 'end',
                align: 'top',
                offset: 12,
                backgroundColor: '#8b5cf6',
                borderRadius: 4,
                padding: 8
              }
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 20, bottom: 20, left: 20, right: 20 } },
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: { display: true, position: 'top', labels: { font: { size: 13, weight: 'bold' }, padding: 15 } },
              tooltip: {
                enabled: true,
                backgroundColor: 'rgba(0,0,0,0.95)',
                padding: 16,
                cornerRadius: 10,
                titleFont: { size: 15, weight: 'bold' },
                bodyFont: { size: 14, weight: 'bold' },
                borderColor: '#fff',
                borderWidth: 2,
                callbacks: { label: (c) => `${nf.format(c.raw)} (${pf(c.raw, total)}%)` }
              }
            },
            scales: {
              y: {
                ticks: { color: themeInk(), font: { size: 13, weight: '600' } },
                grid: { color: 'rgba(0,0,0,0.08)' },
                beginAtZero: true
              },
              x: {
                ticks: { color: themeInk(), autoSkip: false, maxRotation: 45, minRotation: 0, font: { size: 12, weight: 'bold' } },
                grid: { display: false }
              }
            }
          }
        });
      }

      // Render table
      renderDetalleAccesoTable(filtered);
    }

    function drawDAChart(canvasId, config) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (daCharts[canvasId]) daCharts[canvasId].destroy();

      // NO SOBRESCRIBIR opciones que ya existen
      if (!config.options) config.options = {};
      if (!config.options.plugins) config.options.plugins = {};

      // Solo aplicar valores por defecto si no existen
      if (!config.options.responsive) config.options.responsive = true;
      if (!config.options.maintainAspectRatio) config.options.maintainAspectRatio = false;

      // NO reemplazar tooltip ni legend si ya existen en config
      // Solo agregar defaults si no están presentes
      if (!config.options.plugins.tooltip) {
        config.options.plugins.tooltip = {
          enabled: true,
          mode: 'index',
          intersect: false,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          padding: 12
        };
      }

      if (!config.options.plugins.legend) {
        config.options.plugins.legend = {
          display: true,
          position: 'top'
        };
      }

      daCharts[canvasId] = new Chart(ctx, config);
    }

    function renderDetalleAccesoTable(filtered) {
      const tbody = document.getElementById('da-tbody');
      if (!tbody) return;

      const search = document.getElementById('da-search')?.value.toUpperCase() || '';
      const sort = document.getElementById('da-sort')?.value || 'fecha-desc';

      let data = filtered.filter(r => {
        const txt = `${r.CLIENTE}|${r.UNIDAD}|${r.USUARIO}`.toUpperCase();
        return txt.includes(search);
      });

      if (sort === 'fecha-desc') {
        data.sort((a, b) => (b._ts || 0) - (a._ts || 0));
      } else if (sort === 'fecha-asc') {
        data.sort((a, b) => (a._ts || 0) - (b._ts || 0));
      } else if (sort === 'cliente') {
        data.sort((a, b) => a.CLIENTE.localeCompare(b.CLIENTE));
      }

      tbody.innerHTML = data.slice(0, 500).map(r => `
      <tr>
        <td>${r.FECHA_INGRESO} ${r.HORA_INGRESO}</td>
        <td>${r.CLIENTE}</td>
        <td>${r.UNIDAD}</td>
        <td>${r.TIPO_ACCESO}</td>
        <td>${r.USUARIO}</td>
        <td>${r.EMPRESA}</td>
        <td>${r.ESTADO}</td>
        <td>${r.duracion}</td>
      </tr>
    `).join('');
    }

    function exportarDetalleAccesoExcel() {
      const { start, end, cliente, unidad, tipo, estado } = getDetalleAccesoFilters();
      const filtered = daCache.filter(r => {
        const inRange = r._ts ? moment(r._ts).isBetween(start, end, undefined, '[]') : false;
        const inCliente = (cliente === '__ALL__') || (r.CLIENTE === cliente);
        const inUnidad = (unidad === '__ALL__') || (r.UNIDAD === unidad);
        const inTipo = (tipo === '__ALL__') || (r.TIPO_ACCESO === tipo);
        const inEstado = (estado === '__ALL__') || (r.ESTADO === estado);
        return inRange && inCliente && inUnidad && inTipo && inEstado;
      });

      let html = `<table><thead><tr><th>FECHA_INGRESO</th><th>HORA_INGRESO</th><th>FECHA_SALIDA</th><th>HORA_SALIDA</th><th>CLIENTE</th><th>UNIDAD</th><th>TIPO_ACCESO</th><th>ESTADO</th><th>EMPRESA</th><th>USUARIO</th><th>DURACION</th></tr></thead><tbody>`;

      filtered.forEach(r => {
        html += `<tr>
        <td>${r.FECHA_INGRESO}</td>
        <td>${r.HORA_INGRESO}</td>
        <td>${r.FECHA_SALIDA}</td>
        <td>${r.HORA_FIN}</td>
        <td>${r.CLIENTE}</td>
        <td>${r.UNIDAD}</td>
        <td>${r.TIPO_ACCESO}</td>
        <td>${r.ESTADO}</td>
        <td>${r.EMPRESA}</td>
        <td>${r.USUARIO}</td>
        <td>${r.duracion}</td>
      </tr>`;
      });

      html += '</tbody></table>';

      const blob = new Blob([html], { type: 'application/vnd.ms-excel; charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Detalle_Acceso_${moment().format('YYYYMMDD_HHmmss')}.xls`;
      link.click();
    }

    // ============================================================================
    // CREAR RONDAS - PROGRAMADOR DE HORARIOS
    // ============================================================================
    const crearRondaForm = document.getElementById('crearRondaForm');
    const rondaCliente = document.getElementById('ronda-cliente');
    const rondaUnidad = document.getElementById('ronda-unidad');
    const rondaNombre = document.getElementById('ronda-nombre');
    const rondaPuntosContainer = document.getElementById('rondaPuntosContainer');
    const rondaHorario = document.getElementById('ronda-horario');
    const rondaTolerancia = document.getElementById('ronda-tolerancia');
    const rondaToleranciaTipo = document.getElementById('ronda-tolerancia-tipo');
    const rondaFrecuencia = document.getElementById('ronda-frecuencia');
    const rondaDiasSemanales = document.getElementById('rondaDiasSemanales');
    const rondaDiasMes = document.getElementById('rondaDiasMes');
    const rondasListContainer = document.getElementById('rondasListContainer');

    // Elementos de filtros de Rondas Creadas
    const rondasFilterCliente = document.getElementById('rondas-filter-cliente');
    const rondasFilterUnidad = document.getElementById('rondas-filter-unidad');
    const rondasFilterClear = document.getElementById('rondas-filter-clear');

    let rondaList = [];
    let rondasFilters = {
      cliente: '',
      unidad: ''
    };

    // Cargar clientes para rondas (Master Data)
    async function loadRondaClientes() {
      try {
        if (!rondaCliente) return;

        const ac = window.accessControl;
        const firestore = firebase.firestore();

        // LÓGICA CLIENTE
        if (ac?.userType === 'CLIENTE') {
          const c = ac.clienteAsignado;

          // 1. Bloquear Cliente
          rondaCliente.innerHTML = `<option value="${c}">${c}</option>`;
          rondaCliente.disabled = true;
          rondaCliente.style.backgroundColor = '#e2e8f0';

          // 2. Obtener Unidades (Master Data + Fallback)
          let units = [];
          // Helper global
          if (typeof getUnidadesFromClienteUnidad === 'function') {
            units = await getUnidadesFromClienteUnidad(c);
          }
          // Fallback manual
          if (!units || units.length === 0) {
            const doc = await firestore.collection('CLIENTE_UNIDAD').doc(c).get();
            if (doc.exists) {
              const d = doc.data();
              if (d.unidades || d.UNIDADES) units = d.unidades || d.UNIDADES;
              else {
                const subSnap = await firestore.collection('CLIENTE_UNIDAD').doc(c).collection('UNIDADES').get();
                units = subSnap.docs.map(sd => sd.id);
              }
            }
          }

          // 3. Filtrar permitidas
          const allowed = ac.getUnidadesAsignadas();
          if (allowed && allowed.length > 0) {
            units = units.filter(u => allowed.includes(u));
          }

          // Deduplicar
          units = [...new Set(units)];
          units.sort();

          // 4. Configurar Unidad
          if (rondaUnidad) {
            if (units.length === 1) {
              rondaUnidad.innerHTML = `<option value="${units[0]}">${units[0]}</option>`;
              rondaUnidad.disabled = true;
              rondaUnidad.style.backgroundColor = '#e2e8f0';
            } else {
              rondaUnidad.innerHTML = '<option value="">Seleccionar Unidad</option>' +
                units.map(u => `<option value="${u}">${u}</option>`).join('');
              rondaUnidad.disabled = false;
              rondaUnidad.style.backgroundColor = '';
            }
          }

        } else {
          // LÓGICA ADMIN
          const snap = await firestore.collection('CLIENTE_UNIDAD').get();
          const clientes = snap.docs.map(d => d.id).sort((a, b) => a.localeCompare(b, 'es'));

          rondaCliente.innerHTML = '<option value="">Seleccionar Cliente</option>' +
            clientes.map(c => `<option value="${c}">${c}</option>`).join('');
          rondaCliente.disabled = false;
        }

      } catch (e) {
        console.error("Error loadRondaClientes:", e);
      }
    }

    // Cargar unidades cuando cambia cliente en rondas (Listener Admin)
    if (rondaCliente) {
      rondaCliente.addEventListener('change', async () => {
        const selectedCliente = rondaCliente.value;
        if (!selectedCliente) {
          if (rondaUnidad) rondaUnidad.innerHTML = '<option value="">Seleccionar Unidad</option>';
          rondaPuntosContainer.innerHTML = '<p style="color: #999; text-align: center;">Selecciona un cliente y unidad primero</p>';
          return;
        }

        try {
          const firestore = firebase.firestore();
          let units = [];

          // Estrategia híbrida
          const subSnap = await firestore.collection('CLIENTE_UNIDAD').doc(selectedCliente).collection('UNIDADES').get();
          if (!subSnap.empty) {
            units = subSnap.docs.map(d => d.id);
          } else {
            const doc = await firestore.collection('CLIENTE_UNIDAD').doc(selectedCliente).get();
            if (doc.exists) {
              const d = doc.data();
              units = d.unidades || d.UNIDADES || [];
            }
          }

          units.sort((a, b) => a.localeCompare(b, 'es'));

          if (rondaUnidad) {
            rondaUnidad.innerHTML = '<option value="">Seleccionar Unidad</option>' +
              units.map(u => `<option value="${u}">${u}</option>`).join('');
          }
        } catch (e) {
          if (rondaUnidad) rondaUnidad.innerHTML = '<option value="">Error al cargar unidades</option>';
        }
      });
    }

    // Cargar QRs cuando cambia unidad
    if (rondaUnidad) {
      rondaUnidad.addEventListener('change', async () => {
        const selectedCliente = rondaCliente?.value;
        const selectedUnidad = rondaUnidad.value;

        if (!selectedCliente || !selectedUnidad) {
          rondaPuntosContainer.innerHTML = '<p style="color: #999; text-align: center;">Selecciona cliente y unidad primero</p>';
          return;
        }

        try {
          const snap = await db.collection('QR_CODES')
            .where('cliente', '==', selectedCliente)
            .where('unidad', '==', selectedUnidad)
            .get();

          if (snap.empty) {
            rondaPuntosContainer.innerHTML = '<p style="color: #999; text-align: center;">No hay QRs para esta unidad</p>';
            return;
          }

          let html = '';
          snap.docs.forEach(doc => {
            const qrData = doc.data();

            // Verificar si el QR tiene preguntas asignadas
            const tienePreguntas = qrData.requireQuestion === 'si' && qrData.questions && qrData.questions.length > 0;
            const preguntasTexto = tienePreguntas
              ? `<div style="margin-top: 8px; padding: 8px; background-color: #e8f4f8; border-left: 3px solid #0284c7; border-radius: 4px;">
                 <small style="color: #0284c7; font-weight: 600;">📋 Preguntas asignadas:</small>
                 <ul style="margin: 6px 0 0 20px; padding: 0; font-size: 12px; color: #333;">
                   ${qrData.questions.map(q => `<li>${q}</li>`).join('')}
                 </ul>
               </div>`
              : '';

            html += `
            <label style="display: flex; align-items: flex-start; gap: 10px; padding: 12px; border-bottom: 1px solid #eee; cursor: pointer; border-radius: 6px; transition: background 0.2s;">
              <input type="checkbox" class="ronda-punto-qr" value="${doc.id}" data-nombre="${qrData.nombre || 'N/A'}" data-id="${doc.id}" style="margin-top: 4px; cursor: pointer;" />
              <div style="flex: 1;">
                <strong>${qrData.nombre || 'Sin nombre'}</strong>
                <small style="color: #999; display: block; margin-top: 2px;">${doc.id}</small>
                ${preguntasTexto}
              </div>
            </label>
          `;
          });
          rondaPuntosContainer.innerHTML = html;
        } catch (e) {
          rondaPuntosContainer.innerHTML = '<p style="color: red;">Error cargando QRs</p>';
        }
      });
    }

    // Mostrar/ocultar opciones de frecuencia
    if (rondaFrecuencia) {
      rondaFrecuencia.addEventListener('change', (e) => {
        const value = e.target.value;
        rondaDiasSemanales.style.display = value === 'semanal' ? 'block' : 'none';
        rondaDiasMes.style.display = value === 'dias-especificos' ? 'block' : 'none';
      });
    }

    // Guardar ronda
    if (crearRondaForm) {
      crearRondaForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const cliente = rondaCliente?.value;
        const unidad = rondaUnidad?.value;
        const nombre = rondaNombre?.value?.trim();
        const horario = rondaHorario?.value;
        const tolerancia = parseInt(rondaTolerancia?.value || 0);
        const toleranciaTipo = rondaToleranciaTipo?.value;
        const frecuencia = rondaFrecuencia?.value;

        if (!cliente || !unidad || !nombre || !horario || !frecuencia) {
          if (UI && UI.toast) UI.toast('❌ Por favor completa todos los campos');
          return;
        }

        // Obtener QRs seleccionados con sus preguntas
        const checkboxes = document.querySelectorAll('.ronda-punto-qr:checked');
        if (checkboxes.length === 0) {
          if (UI && UI.toast) UI.toast('❌ Selecciona al menos un punto de ronda');
          return;
        }

        // Construir puntos de ronda con información de QR incluyendo preguntas
        const puntosRonda = [];
        for (const cb of checkboxes) {
          const qrId = cb.value;
          const nombre = cb.dataset.nombre;

          try {
            // Obtener documento del QR para traer sus preguntas
            const qrDoc = await db.collection('QR_CODES').doc(qrId).get();
            if (qrDoc.exists) {
              const qrData = qrDoc.data();
              puntosRonda.push({
                qrId: qrId,
                nombre: nombre,
                requireQuestion: qrData.requireQuestion || 'no',
                questions: qrData.questions || []
              });
            } else {
              puntosRonda.push({
                qrId: qrId,
                nombre: nombre,
                requireQuestion: 'no',
                questions: []
              });
            }
          } catch (e) {
            puntosRonda.push({
              qrId: qrId,
              nombre: nombre,
              requireQuestion: 'no',
              questions: []
            });
          }
        }

        console.log('DEBUG - puntosRonda después de construcción:', puntosRonda);
        console.log('DEBUG - Es array?', Array.isArray(puntosRonda));

        // GARANTIZAR que puntosRonda es un array válido
        if (!Array.isArray(puntosRonda) || puntosRonda.length === 0) {
          console.warn('⚠️ ADVERTENCIA - puntosRonda no es array válido, convirtiendo a array vacío');
          puntosRonda = [];
        }

        // Validar días según frecuencia
        let diasConfig = null;
        if (frecuencia === 'semanal') {
          const diasSemanalesCbs = document.querySelectorAll('input[name="dia-semana"]:checked');
          if (diasSemanalesCbs.length === 0) {
            if (UI && UI.toast) UI.toast('❌ Selecciona al menos un día de la semana');
            return;
          }
          diasConfig = Array.from(diasSemanalesCbs).map(cb => cb.value);
        } else if (frecuencia === 'dias-especificos') {
          const diasMesInput = document.getElementById('ronda-dias-mes')?.value?.trim();
          if (!diasMesInput) {
            if (UI && UI.toast) UI.toast('❌ Ingresa los días del mes');
            return;
          }
          diasConfig = diasMesInput.split(',').map(d => parseInt(d.trim())).filter(d => d >= 1 && d <= 31);
          if (diasConfig.length === 0) {
            if (UI && UI.toast) UI.toast('❌ Ingresa días válidos (1-31)');
            return;
          }
        }

        const submitBtn = crearRondaForm.querySelector('button[type="submit"]');
        const editingId = submitBtn?.dataset.editingId;

        const rondaData = {
          cliente,
          unidad,
          nombre,
          horario,
          tolerancia,
          toleranciaTipo,
          frecuencia,
          diasConfig,
          puntosRonda: Array.isArray(puntosRonda) ? puntosRonda : [],
          activa: true
        };

        console.log('DEBUG - rondaData.puntosRonda:', rondaData.puntosRonda);
        console.log('DEBUG - rondaData.puntosRonda es array?', Array.isArray(rondaData.puntosRonda));

        try {
          UI.showOverlay('Guardando...', editingId ? 'Actualizando ronda' : 'Creando ronda');

          if (editingId) {
            // Actualizar ronda existente (sin tocar createdAt)
            await db.collection('Rondas_QR').doc(editingId).update(rondaData);
            const index = rondaList.findIndex(r => r.id === editingId);
            if (index !== -1) {
              rondaList[index] = { id: editingId, ...rondaList[index], ...rondaData };
            }
            if (UI && UI.toast) UI.toast('✅ Ronda actualizada exitosamente');
          } else {
            // Crear ronda nueva - Usar serverTimestamp para garantizar timestamp correcto en Firestore
            const newRonda = {
              id: `ronda_${Date.now()}`,
              ...rondaData,
              createdAt: firebase.firestore.FieldValue.serverTimestamp(),
              updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            // DEBUG: Verificar tipo de createdAt antes de guardar
            console.log('DEBUG - Tipo de createdAt antes de guardar:', typeof newRonda.createdAt);
            console.log('DEBUG - createdAt value:', newRonda.createdAt);

            await db.collection('Rondas_QR').doc(newRonda.id).set(newRonda);
            rondaList.push(newRonda);
            if (UI && UI.toast) UI.toast('✅ Ronda creada exitosamente');
          }

          // Resetear formulario
          crearRondaForm.reset();
          rondaPuntosContainer.innerHTML = '<p style="color: #999; text-align: center;">Selecciona un cliente y unidad primero</p>';

          // Resetear botón
          if (submitBtn) {
            submitBtn.textContent = '➕ Crear Ronda';
            submitBtn.style.background = '';
            delete submitBtn.dataset.editingId;
          }
          const formTitle = document.querySelector('[data-form-title]');
          if (formTitle) {
            formTitle.textContent = '📋 Crear Nueva Ronda';
            formTitle.style.color = '';
          }

          renderRondasList();
        } catch (error) {
          if (UI && UI.toast) UI.toast('❌ Error: ' + error.message);
        } finally {
          UI.hideOverlay();
        }
      });
    }

    // Manejador del botón Cancelar Edición
    const cancelBtn = document.getElementById('ronda-btn-cancelar');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        // Resetear formulario
        crearRondaForm.reset();
        rondaPuntosContainer.innerHTML = '<p style="color: #999; text-align: center;">Selecciona un cliente y unidad primero</p>';

        // Resetear botón submit
        const submitBtn = crearRondaForm?.querySelector('button[type="submit"]');
        if (submitBtn) {
          submitBtn.textContent = '➕ Crear Ronda';
          submitBtn.style.background = '';
          delete submitBtn.dataset.editingId;
        }

        // Resetear título
        const formTitle = document.querySelector('[data-form-title]');
        if (formTitle) {
          formTitle.textContent = '📋 Crear Nueva Ronda';
          formTitle.style.color = '';
        }

        // Ocultar botón cancelar
        cancelBtn.style.display = 'none';
        delete cancelBtn.dataset.editingId;

        if (UI && UI.toast) UI.toast('❌ Edición cancelada');
      });
    }

    // Renderizar lista de rondas
    function renderRondasList() {
      // Aplicar filtro de cliente según restricciones de usuario
      let rondasFiltradas = rondaList;

      if (window.accessControl?.userType === 'CLIENTE' && window.accessControl?.clienteAsignado) {
        // Si es cliente, filtrar solo sus rondas
        rondasFiltradas = rondaList.filter(r => r.cliente === window.accessControl.clienteAsignado);
      }

      // Aplicar filtros de la UI
      if (rondasFilters.cliente) {
        rondasFiltradas = rondasFiltradas.filter(r => r.cliente === rondasFilters.cliente);
      }
      if (rondasFilters.unidad) {
        rondasFiltradas = rondasFiltradas.filter(r => r.unidad === rondasFilters.unidad);
      }

      // Actualizar opciones de filtros
      updateRondasFilterOptions();

      if (rondasFiltradas.length === 0) {
        rondasListContainer.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%); 
                    border-radius: 12px; border: 2px dashed #999;">
          <p style="color: #999; font-size: 16px; margin: 0;">
            📋 No hay rondas creadas
          </p>
          <p style="color: #bbb; font-size: 12px; margin: 8px 0 0 0;">
            Crea tu primera ronda usando el formulario arriba
          </p>
        </div>
      `;
        return;
      }

      let html = `
      <div style="display: grid; gap: 16px;">
    `;
      rondasFiltradas.forEach((ronda, index) => {
        try {
          console.log('DEBUG - Renderizando ronda:', ronda.nombre);
          console.log('DEBUG - ronda.puntosRonda:', ronda.puntosRonda);
          console.log('DEBUG - Es array?', Array.isArray(ronda.puntosRonda));
          const gradients = ['#e0f7fa', '#f3e5f5', '#e8f5e9', '#fff3e0', '#fce4ec'];
          const gradient = gradients[index % gradients.length];
          const borderColor = ['#00bcd4', '#9c27b0', '#4caf50', '#ff9800', '#e91e63'][index % 5];

          html += `
          <div style="background: ${gradient}; border-left: 5px solid ${borderColor}; 
                      border-radius: 12px; padding: 16px; 
                      box-shadow: 0 2px 8px rgba(0,0,0,0.08); transition: all 0.3s ease;
                      position: relative; overflow: hidden;">
            
            <!-- Background decorativo -->
            <div style="position: absolute; top: -30px; right: -30px; width: 80px; height: 80px; 
                        background: ${borderColor}; opacity: 0.05; border-radius: 50%;"></div>
            
            <div style="position: relative; z-index: 1;">
              <!-- Header con nombre y estado -->
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                <div>
                  <h4 style="margin: 0; color: ${borderColor}; font-size: 18px; font-weight: 600;">
                    📍 ${ronda.nombre}
                  </h4>
                  <p style="margin: 4px 0 0; color: #666; font-size: 13px;">
                    <span style="background: ${borderColor}; color: white; padding: 2px 8px; border-radius: 12px; 
                                 font-size: 11px; font-weight: 500;">
                      ${ronda.cliente} • ${ronda.unidad}
                    </span>
                  </p>
                </div>
                <div style="background: ${borderColor}; color: white; padding: 6px 12px; 
                         border-radius: 20px; font-size: 12px; font-weight: 600;">
                ${ronda.activa ? '🟢 ACTIVA' : '🔴 INACTIVA'}
              </div>
            </div>

            <!-- Detalles en grid 2x2 -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 12px 0;">
              <!-- Horario -->
              <div style="background: rgba(255,255,255,0.6); padding: 10px; border-radius: 8px; 
                         border-left: 3px solid ${borderColor};">
                <p style="margin: 0; font-size: 11px; color: #999; text-transform: uppercase; font-weight: 500;">
                  ⏰ Horario
                </p>
                <p style="margin: 4px 0 0; font-size: 14px; font-weight: 600; color: #333;">
                  ${ronda.horario}
                </p>
              </div>

              <!-- Frecuencia -->
              <div style="background: rgba(255,255,255,0.6); padding: 10px; border-radius: 8px;
                         border-left: 3px solid ${borderColor};">
                <p style="margin: 0; font-size: 11px; color: #999; text-transform: uppercase; font-weight: 500;">
                  📅 Frecuencia
                </p>
                <p style="margin: 4px 0 0; font-size: 14px; font-weight: 600; color: #333;">
                  ${ronda.frecuencia.charAt(0).toUpperCase() + ronda.frecuencia.slice(1)}
                </p>
              </div>

              <!-- Tolerancia -->
              <div style="background: rgba(255,255,255,0.6); padding: 10px; border-radius: 8px;
                         border-left: 3px solid ${borderColor};">
                <p style="margin: 0; font-size: 11px; color: #999; text-transform: uppercase; font-weight: 500;">
                  ⏱️ Tolerancia
                </p>
                <p style="margin: 4px 0 0; font-size: 14px; font-weight: 600; color: #333;">
                  ${ronda.tolerancia} ${ronda.toleranciaTipo}
                </p>
              </div>

              <!-- Puntos -->
              <div style="background: rgba(255,255,255,0.6); padding: 10px; border-radius: 8px;
                         border-left: 3px solid ${borderColor};">
                <p style="margin: 0; font-size: 11px; color: #999; text-transform: uppercase; font-weight: 500;">
                  📍 Puntos
                </p>
                <p style="margin: 4px 0 0; font-size: 14px; font-weight: 600; color: ${borderColor};">
                  ${ronda.puntosRonda.length} punto${ronda.puntosRonda.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            <!-- Detalles de puntos -->
            <div style="margin: 12px 0; padding: 10px; background: rgba(255,255,255,0.6); 
                       border-radius: 8px; max-height: 120px; overflow-y: auto;">
              <p style="margin: 0 0 6px; font-size: 11px; color: #999; font-weight: 600; text-transform: uppercase;">
                Puntos de Ronda:
              </p>
              <div style="display: flex; flex-direction: column; gap: 8px;">
                ${Array.isArray(ronda.puntosRonda) ? ronda.puntosRonda.map(p => {
            const tienePreguntas = p.requireQuestion === 'si' && p.questions && p.questions.length > 0;
            return `
                    <div style="padding: 8px; background: white; border-radius: 6px; border-left: 3px solid ${borderColor};">
                      <div style="display: flex; align-items: center; gap: 6px; margin-bottom: ${tienePreguntas ? '6px' : '0'};">
                        <span style="background: ${borderColor}; color: white; padding: 2px 6px; border-radius: 4px; 
                                   font-size: 10px; font-weight: 600;">
                          ${p.nombre}
                        </span>
                        ${tienePreguntas ? '<span style="font-size: 12px; color: #0284c7;">📋</span>' : ''}
                      </div>
                      ${tienePreguntas ? `
                        <div style="font-size: 11px; color: #333; margin-left: 8px;">
                          <strong style="color: #0284c7;">Preguntas:</strong>
                          <ul style="margin: 4px 0 0 16px; padding: 0; list-style: none;">
                            ${p.questions.map(q => `<li style="margin: 2px 0; color: #555;">• ${q}</li>`).join('')}
                          </ul>
                        </div>
                      ` : ''}
                    </div>
                  `;
          }).join('') : '<div style="color: #999; font-size: 11px;">Sin puntos asignados</div>'}
              </div>
            </div>

            <!-- Botones de acciones -->
            <div style="display: flex; gap: 8px; margin-top: 12px; justify-content: flex-end;">
              <button type="button" class="btn small" style="background: #4CAF50; border: none; color: white; 
                                                            padding: 8px 12px; border-radius: 6px; cursor: pointer;
                                                            font-size: 12px; font-weight: 600; transition: all 0.2s;"
                      onmouseover="this.style.background='#45a049'" onmouseout="this.style.background='#4CAF50'"
                      onclick="editRonda('${ronda.id}')">
                ✏️ Editar
              </button>
              <button type="button" class="btn small" style="background: #f44336; border: none; color: white; 
                                                            padding: 8px 12px; border-radius: 6px; cursor: pointer;
                                                            font-size: 12px; font-weight: 600; transition: all 0.2s;"
                      onmouseover="this.style.background='#da190b'" onmouseout="this.style.background='#f44336'"
                      onclick="showDeleteRondaModal('${ronda.id}', '${ronda.nombre}')">
                🗑️ Eliminar
              </button>
            </div>
          </div>
        </div>
      `;
        } catch (e) {
          console.error('ERROR - Error renderizando ronda:', ronda.nombre);
          console.error('ERROR - Detalles del error:', e);
          console.error('ERROR - Stack:', e.stack);
        }
      });
      html += '</div>';
      try {
        rondasListContainer.innerHTML = html;
      } catch (e) {
        console.error('ERROR - Error al renderizar HTML de rondas:', e);
        console.error('ERROR - HTML que causó error:', html.substring(0, 500));
      }
    }

    // Actualizar opciones de filtros en Rondas Creadas (Master Data)
    async function updateRondasFilterOptions() {
      try {
        const ac = window.accessControl;
        const firestore = firebase.firestore();

        if (!rondasFilterCliente) return;

        // LÓGICA CLIENTE
        if (ac?.userType === 'CLIENTE') {
          const c = ac.clienteAsignado;

          // 1. Cliente
          rondasFilterCliente.innerHTML = `<option value="${c}">${c}</option>`;
          rondasFilterCliente.value = c;
          // No deshabilitamos para permitir 'ver', pero solo tiene una opción. O deshabilitar si prefieren UX lock.
          // Para filtros listado, a veces es mejor dejarlo enabled pero con 1 opción.
          // Pero consistency:
          rondasFilterCliente.disabled = true;

          // 2. Unidades
          let units = [];
          if (typeof getUnidadesFromClienteUnidad === 'function') {
            units = await getUnidadesFromClienteUnidad(c);
          }
          if (!units || !units.length) {
            const doc = await firestore.collection('CLIENTE_UNIDAD').doc(c).get();
            if (doc.exists) {
              const d = doc.data();
              if (d.unidades || d.UNIDADES) units = d.unidades || d.UNIDADES;
            }
          }

          const allowed = ac.getUnidadesAsignadas();
          if (allowed && allowed.length > 0) units = units.filter(u => allowed.includes(u));

          // Deduplicar
          units = [...new Set(units)];
          units.sort();

          if (rondasFilterUnidad) {
            if (units.length === 1) {
              rondasFilterUnidad.innerHTML = `<option value="${units[0]}" selected>${units[0]}</option>`;
              rondasFilterUnidad.value = units[0];
              rondasFilterUnidad.disabled = true;
              rondasFilterUnidad.style.backgroundColor = '#e2e8f0';
            } else {
              rondasFilterUnidad.innerHTML = '<option value="">Todas las Unidades</option>' +
                units.map(u => `<option value="${u}">${u}</option>`).join('');
              rondasFilterUnidad.disabled = false;
              rondasFilterUnidad.style.backgroundColor = '';
            }
          }

        } else {
          // LÓGICA ADMIN
          // Solo cargamos si está vacío o si queremos refrescar? Mejor cargar siempre para asegurar.
          // O optimizar:
          const snap = await firestore.collection('CLIENTE_UNIDAD').get();
          const clientes = snap.docs.map(d => d.id).sort();

          const current = rondasFilterCliente.value;
          rondasFilterCliente.innerHTML = '<option value="">Todos los Clientes</option>' +
            clientes.map(c => `<option value="${c}">${c}</option>`).join('');
          rondasFilterCliente.value = current;
          rondasFilterCliente.disabled = false;

          // Unidades dependen del cliente seleccionado?
          // En filtros de listado, normalmente "Todas las Unidades" muestra TODAS las unidades de TODOS los clientes (si no hay cliente seleccionado)
          // O solo las del cliente seleccionado.
          // La implementación anterior mostraba 'unidadesUnicos' de las rondas cargadas.
          // Mantendremos simple: Si hay cliente seleccionado, cargar sus unidades. Si no, vaciar o todas?
          // Mejor: Si es Admin y no hay cliente, "Todas las Unidades" (vacío/genérico).
          // Cuando seleccione cliente, cargaremos unidades (listener change).
        }

      } catch (e) { console.error("Error updateRondasFilterOptions", e); }
    }

    // Aplicar filtros en Rondas Creadas
    function applyRondasFilters() {
      rondasFilters.cliente = rondasFilterCliente?.value || '';
      rondasFilters.unidad = rondasFilterUnidad?.value || '';
      renderRondasList();
    }

    // Buscador Manual Rondas
    const rondasFilterSearch = document.getElementById('rondas-filter-search');

    async function performRondaSearch() {
      if (UI && UI.showOverlay) UI.showOverlay('Buscando Rondas...');
      try {
        const cliente = rondasFilterCliente?.value;
        const unidad = rondasFilterUnidad?.value;

        let query = firebase.firestore().collection('Rondas_QR');

        // Seguridad
        if (window.accessControl?.userType === 'CLIENTE') {
          query = query.where('cliente', '==', window.accessControl.clienteAsignado);
          if (unidad) query = query.where('unidad', '==', unidad);
        } else {
          if (cliente) query = query.where('cliente', '==', cliente);
          if (unidad) query = query.where('unidad', '==', unidad);
        }

        const snap = await query.get();
        rondaList = snap.docs.map(doc => {
          const data = doc.data();
          // Normalizar puntos
          const puntosRondaNormalizado = Array.isArray(data.puntosRonda)
            ? data.puntosRonda
            : (data.puntosRonda && typeof data.puntosRonda === 'object'
              ? Object.values(data.puntosRonda)
              : []);
          return { id: doc.id, ...data, puntosRonda: puntosRondaNormalizado };
        });

        // Actualizar filtros internos
        rondasFilters.cliente = cliente || '';
        rondasFilters.unidad = unidad || '';

        renderRondasList();

        if (snap.empty) {
          if (rondasListContainer) rondasListContainer.innerHTML = '<div class="empty-state" style="padding:40px; text-align:center;">📋<p>No se encontraron resultados</p></div>';
          if (UI && UI.toast) UI.toast('⚠️ No se encontraron rondas');
        }

      } catch (e) {
        console.error("Error searching Rondas", e);
        if (UI && UI.toast) UI.toast('❌ Error buscando rondas');
      } finally {
        if (UI && UI.hideOverlay) UI.hideOverlay();
      }
    }

    if (rondasFilterSearch) {
      rondasFilterSearch.addEventListener('click', performRondaSearch);
    }

    // Event listeners para filtros de Rondas Creadas
    if (rondasFilterCliente) {
      rondasFilterCliente.addEventListener('change', () => {
        // Solo actualizar unidades, NO filtrar
        updateRondasFilterOptions();
      });
    }
    if (rondasFilterUnidad) {
      // rondasFilterUnidad.addEventListener('change', applyRondasFilters); // Deshabilitado
    }
    if (rondasFilterClear) {
      rondasFilterClear.addEventListener('click', () => {
        rondasFilters = { cliente: '', unidad: '' };
        if (rondasFilterCliente && !rondasFilterCliente.disabled) rondasFilterCliente.value = '';
        if (rondasFilterUnidad && !rondasFilterUnidad.disabled) rondasFilterUnidad.value = '';
        // Limpiar lista
        rondaList = [];
        renderRondasList();
      });
    }
    window.showDeleteRondaModal = (rondaId, rondaNombre) => {
      const modal = document.getElementById('deleteRondaModal');
      const nameDisplay = document.getElementById('deleteRondaName');
      const confirmBtn = document.getElementById('deleteRondaConfirm');
      const cancelBtn = document.getElementById('deleteRondaCancel');

      nameDisplay.textContent = rondaNombre;
      modal.style.display = 'flex';

      // Remover listeners anteriores
      const newConfirmBtn = confirmBtn.cloneNode(true);
      confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
      const newCancelBtn = cancelBtn.cloneNode(true);
      cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

      // Agregar nuevos listeners
      document.getElementById('deleteRondaConfirm').addEventListener('click', () => {
        deleteRonda(rondaId);
        modal.style.display = 'none';
      });
      document.getElementById('deleteRondaCancel').addEventListener('click', () => {
        modal.style.display = 'none';
      });
    };

    // Eliminar ronda
    window.deleteRonda = async (rondaId) => {
      try {
        UI.showOverlay('Eliminando...', 'Borrando ronda');
        await db.collection('Rondas_QR').doc(rondaId).delete();
        rondaList = rondaList.filter(r => r.id !== rondaId);
        renderRondasList();
        if (UI && UI.toast) UI.toast('✅ Ronda eliminada');
      } catch (error) {
        if (UI && UI.toast) UI.toast('❌ Error: ' + error.message);
      } finally {
        UI.hideOverlay();
      }
    };

    // Editar ronda
    window.editRonda = (rondaId) => {
      const ronda = rondaList.find(r => r.id === rondaId);
      if (!ronda) {
        if (UI && UI.toast) UI.toast('❌ Ronda no encontrada');
        return;
      }

      // Llenar el formulario con los datos de la ronda
      if (rondaCliente) rondaCliente.value = ronda.cliente;

      // Trigger change para cargar unidades
      rondaCliente.dispatchEvent(new Event('change'));

      setTimeout(() => {
        if (rondaUnidad) rondaUnidad.value = ronda.unidad;
        rondaUnidad.dispatchEvent(new Event('change'));
      }, 300);

      setTimeout(() => {
        if (rondaNombre) rondaNombre.value = ronda.nombre;
        if (rondaHorario) rondaHorario.value = ronda.horario;
        if (rondaTolerancia) rondaTolerancia.value = ronda.tolerancia;
        if (rondaToleranciaTipo) rondaToleranciaTipo.value = ronda.toleranciaTipo;
        if (rondaFrecuencia) {
          rondaFrecuencia.value = ronda.frecuencia;
          rondaFrecuencia.dispatchEvent(new Event('change'));
        }

        // Marcar los QRs seleccionados
        setTimeout(() => {
          document.querySelectorAll('.ronda-punto-qr').forEach(cb => {
            cb.checked = ronda.puntosRonda.some(p => p.qrId === cb.value);
          });
        }, 100);

        // Llenar días según frecuencia
        if (ronda.frecuencia === 'semanal' && ronda.diasConfig) {
          document.querySelectorAll('input[name="dia-semana"]').forEach(cb => {
            cb.checked = ronda.diasConfig.includes(cb.value);
          });
        } else if (ronda.frecuencia === 'dias-especificos' && ronda.diasConfig) {
          const diasMesInput = document.getElementById('ronda-dias-mes');
          if (diasMesInput) {
            diasMesInput.value = ronda.diasConfig.join(', ');
          }
        }
      }, 600);

      // Scroll al formulario
      document.getElementById('crearRondaForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

      // Cambiar título temporalmente
      const formTitle = document.querySelector('[data-form-title]');
      if (formTitle) {
        formTitle.textContent = `✏️ Editando: ${ronda.nombre}`;
        formTitle.style.color = '#ff9800';
      }

      // Modificar el botón submit
      const submitBtn = crearRondaForm?.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.textContent = '💾 Actualizar Ronda';
        submitBtn.style.background = '#ff9800';
        submitBtn.dataset.editingId = rondaId;
      }

      // Mostrar botón de cancelar
      const cancelBtn = document.getElementById('ronda-btn-cancelar');
      if (cancelBtn) {
        cancelBtn.style.display = 'inline-block';
        cancelBtn.dataset.editingId = rondaId;
      }

      if (UI && UI.toast) UI.toast('📝 Ronda cargada en el formulario');
    };

    // Cargar rondas existentes (MODO MANUAL)
    async function loadRondas() {
      try {
        rondaList = [];
        renderRondasList();
        // Inicializar filtros pero NO cargar datos
        await updateRondasFilterOptions();

        if (rondasListContainer) {
          rondasListContainer.innerHTML = '<div class="empty-state" style="padding:40px; text-align:center;">📋<p>Selecciona filtros y haz clic en "Buscar"</p></div>';
        }
      } catch (e) {
        console.error('ERROR - Error al inicializar rondas:', e);
      }
    }

    // Inicializar cuando se carga
    // Nota: loadRondaClientes(), loadQRClientes() y loadRondas() se llamarán después de que accessControl esté inicializado
    // loadRondaClientes();
    // loadRondas();

  } // <-- CIERRE DEL else { window.__wiredCuadernoInc__ = true; }

  // ===== QR GENERATOR =====
  const qrForm = document.getElementById('qrForm');
  const qrCliente = document.getElementById('qr-cliente');
  const qrUnidad = document.getElementById('qr-unidad');
  const qrNombre = document.getElementById('qr-nombre');
  const qrLatitude = document.getElementById('qr-latitude');
  const qrLongitude = document.getElementById('qr-longitude');
  const qrWidth = document.getElementById('qr-width');
  const qrHeight = document.getElementById('qr-height');
  const qrGetLocationBtn = document.getElementById('qr-get-location');
  const qrListContainer = document.getElementById('qrListContainer');
  const qrPreviewContainer = document.getElementById('qr-preview-container');

  // Elementos para preguntas
  const qrRequireQuestion = document.getElementById('qr-require-question');
  const qrQuestionsContainer = document.getElementById('qr-questions-container');
  const qrQuestionsList = document.getElementById('qr-questions-list');
  const qrBtnAddQuestion = document.getElementById('qr-btn-add-question');

  let qrList = [];
  let qrQuestionsCount = 0;

  // Función para generar vista previa del QR
  function updateQRPreview() {
    const nombre = qrNombre?.value?.trim();
    const lat = qrLatitude?.value?.trim();
    const lng = qrLongitude?.value?.trim();
    const width = Math.min(Math.max(parseInt(qrWidth?.value || 200), 50), 500);
    const height = Math.min(Math.max(parseInt(qrHeight?.value || 200), 50), 500);

    if (!nombre || !lat || !lng) {
      qrPreviewContainer.innerHTML = `
        <div style="text-align: center; color: #a0aec0;">
          <div style="font-size: 32px; margin-bottom: 12px;">📊</div>
          <p style="margin: 0; font-weight: 600;">Completa el formulario</p>
          <p style="margin: 4px 0 0 0; font-size: 12px;">Nombre y geolocalización son requeridos</p>
        </div>
      `;
      return;
    }

    const qrData = `${nombre}|${lat}|${lng}`;

    try {
      // Generar QR usando QRCode.js library (agregado dinámicamente)
      const canvas = document.createElement('canvas');
      QRCode.toCanvas(canvas, qrData, {
        errorCorrectionLevel: 'H',
        type: 'image/png',
        quality: 0.95,
        margin: 1,
        width: width,
        height: height,
        color: { dark: '#000000', light: '#FFFFFF' }
      }, (err) => {
        if (err) {
          qrPreviewContainer.innerHTML = `<p style="color: red;">Error generando QR</p>`;
          return;
        }
        qrPreviewContainer.innerHTML = `
          <div style="text-align: center;">
            <img src="${canvas.toDataURL()}" style="max-width: 100%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);" />
            <p style="margin: 12px 0 0; color: #718096; font-size: 12px;">Tamaño: ${width}x${height}px</p>
          </div>
        `;
      });
    } catch (e) {
      qrPreviewContainer.innerHTML = `
        <div style="text-align: center; color: #a0aec0;">
          <div style="font-size: 32px; margin-bottom: 12px;">✅</div>
          <p style="margin: 0; font-weight: 600;">QR Válido</p>
          <p style="margin: 4px 0 0 0; font-size: 12px;">Se generará al crear</p>
        </div>
      `;
    }
  }

  // Agregar listeners para actualizar preview
  if (qrNombre) qrNombre.addEventListener('input', updateQRPreview);
  if (qrLatitude) qrLatitude.addEventListener('input', updateQRPreview);
  if (qrLongitude) qrLongitude.addEventListener('input', updateQRPreview);
  if (qrWidth) qrWidth.addEventListener('change', updateQRPreview);
  if (qrHeight) qrHeight.addEventListener('change', updateQRPreview);

  // Event listener para "Se requiere pregunta"
  if (qrRequireQuestion) {
    qrRequireQuestion.addEventListener('change', (e) => {
      const requireQuestion = e.target.value === 'si';
      qrQuestionsContainer.style.display = requireQuestion ? 'block' : 'none';

      if (requireQuestion) {
        // Limpiar lista y agregar primera pregunta vacía
        qrQuestionsList.innerHTML = '';
        qrQuestionsCount = 0;
        addQuestion();
      } else {
        // Limpiar preguntas
        qrQuestionsList.innerHTML = '';
        qrQuestionsCount = 0;
        qrBtnAddQuestion.style.display = 'none';
      }
    });
  }

  // Función para agregar pregunta
  function addQuestion() {
    if (qrQuestionsCount >= 3) return; // Máximo 3 preguntas

    const questionId = `qr-question-${qrQuestionsCount}`;
    const questionDiv = document.createElement('div');
    questionDiv.className = 'question-input-group';
    questionDiv.id = questionId;
    questionDiv.style.display = 'flex';
    questionDiv.style.gap = '8px';
    questionDiv.style.alignItems = 'flex-start';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'question-input';
    input.placeholder = `Pregunta ${qrQuestionsCount + 1}`;
    input.style.flex = '1';
    input.style.padding = '8px 12px';
    input.style.borderRadius = '6px';
    input.style.border = '1px solid #ddd';
    input.style.fontSize = '14px';
    input.name = `question_${qrQuestionsCount}`;

    questionDiv.appendChild(input);

    // Botón para eliminar pregunta (solo si hay más de una)
    if (qrQuestionsCount > 0) {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn-remove-question';
      removeBtn.innerHTML = '✕';
      removeBtn.style.padding = '8px 12px';
      removeBtn.style.borderRadius = '6px';
      removeBtn.style.border = '1px solid #ff6b6b';
      removeBtn.style.backgroundColor = '#ffe0e0';
      removeBtn.style.color = '#ff6b6b';
      removeBtn.style.cursor = 'pointer';
      removeBtn.style.fontSize = '16px';
      removeBtn.style.fontWeight = 'bold';
      removeBtn.onclick = (e) => {
        e.preventDefault();
        removeQuestion(questionId);
      };
      questionDiv.appendChild(removeBtn);
    }

    qrQuestionsList.appendChild(questionDiv);
    qrQuestionsCount++;

    // Mostrar/ocultar botón agregar
    updateAddQuestionButton();
  }

  // Función para eliminar pregunta
  function removeQuestion(questionId) {
    const questionDiv = document.getElementById(questionId);
    if (questionDiv) {
      questionDiv.remove();
      qrQuestionsCount--;
      updateAddQuestionButton();
    }
  }

  // Función para actualizar visibilidad del botón agregar
  function updateAddQuestionButton() {
    qrBtnAddQuestion.style.display = qrQuestionsCount > 0 && qrQuestionsCount < 3 ? 'block' : 'none';
  }

  // Event listener para botón agregar pregunta
  if (qrBtnAddQuestion) {
    qrBtnAddQuestion.addEventListener('click', (e) => {
      e.preventDefault();
      if (qrQuestionsCount < 3) {
        addQuestion();
      }
    });
  }


  // Cargar clientes desde CLIENTE_UNIDAD
  // Cargar clientes desde CLIENTE_UNIDAD (QR Generator)
  async function loadQRClientes() {
    try {
      if (!qrCliente) return;

      // Esperar Firebase
      if (!firebase.apps.length) await new Promise(r => setTimeout(r, 500));
      if (!firebase.apps.length) return;

      const ac = window.accessControl;
      const firestore = firebase.firestore();

      // --- LÓGICA CLIENTE ---
      if (ac?.userType === 'CLIENTE') {
        const c = ac.clienteAsignado;

        // 1. Bloquear Cliente
        qrCliente.innerHTML = `<option value="${c}">${c}</option>`;
        qrCliente.disabled = true;
        qrCliente.style.backgroundColor = '#e2e8f0';

        // 2. Obtener Unidades (Master Data + Fallback)
        let units = [];
        // Intentar helper global
        if (typeof getUnidadesFromClienteUnidad === 'function') {
          units = await getUnidadesFromClienteUnidad(c);
        }
        // Fallback manual: campo 'unidades' o subcolección 'UNIDADES'
        if (!units || units.length === 0) {
          const doc = await firestore.collection('CLIENTE_UNIDAD').doc(c).get();
          if (doc.exists) {
            const d = doc.data();
            if (d.unidades || d.UNIDADES) {
              units = d.unidades || d.UNIDADES; // Array
            } else {
              // Fallback a subcolección si el campo no existe
              const subSnap = await firestore.collection('CLIENTE_UNIDAD').doc(c).collection('UNIDADES').get();
              units = subSnap.docs.map(sd => sd.id);
            }
          }
        }

        // 3. Filtrar permitidas
        const allowed = ac.getUnidadesAsignadas();
        if (allowed && allowed.length > 0) {
          units = units.filter(u => allowed.includes(u));
        }
        units.sort();

        // 4. Configurar Select Unidad
        if (qrUnidad) {
          if (units.length === 1) {
            qrUnidad.innerHTML = `<option value="${units[0]}">${units[0]}</option>`;
            qrUnidad.disabled = true;
            qrUnidad.style.backgroundColor = '#e2e8f0';
          } else {
            qrUnidad.innerHTML = '<option value="">Seleccionar Unidad</option>' +
              units.map(u => `<option value="${u}">${u}</option>`).join('');
            qrUnidad.disabled = false;
            qrUnidad.style.backgroundColor = '';
          }
        }

      } else {
        // --- LÓGICA ADMIN ---
        const snap = await firestore.collection('CLIENTE_UNIDAD').get();
        const clientes = snap.docs.map(d => d.id).sort();

        qrCliente.innerHTML = '<option value="">Seleccionar Cliente</option>' +
          clientes.map(c => `<option value="${c}">${c}</option>`).join('');
        qrCliente.disabled = false;

        // Reset Unidad
        if (qrUnidad) qrUnidad.innerHTML = '<option value="">Seleccionar Unidad</option>';
      }

    } catch (e) {
      console.error("Error loadQRClientes:", e);
      if (UI && UI.toast) UI.toast('❌ Error al cargar clientes QR');
    }
  }

  // Listener para cambio de cliente (SOLO ADMINS o cambios manuales)
  if (qrCliente) {
    qrCliente.addEventListener('change', async () => {
      const selectedCliente = qrCliente.value;
      if (!qrUnidad) return;

      if (!selectedCliente) {
        qrUnidad.innerHTML = '<option value="">Seleccionar Unidad</option>';
        return;
      }

      // Si el usuario es CLIENTE, ya se cargó en loadQRClientes, ignora esto o re-ejecuta filtro?
      // Mejor re-ejecutar lógica genérica de carga segura

      try {
        const firestore = firebase.firestore();
        let units = [];

        // Estrategia híbrida: Subcolección 'UNIDADES' (legado Rondas?) o Campo 'unidades'
        // Primero probamos subcolección para consistencia con lógica previa de Rondas
        const subSnap = await firestore.collection('CLIENTE_UNIDAD').doc(selectedCliente).collection('UNIDADES').get();
        if (!subSnap.empty) {
          units = subSnap.docs.map(d => d.id);
        } else {
          // Fallback a documento principal
          const doc = await firestore.collection('CLIENTE_UNIDAD').doc(selectedCliente).get();
          if (doc.exists) {
            const d = doc.data();
            units = d.unidades || d.UNIDADES || [];
          }
        }

        units.sort();

        qrUnidad.innerHTML = '<option value="">Seleccionar Unidad</option>' +
          units.map(u => `<option value="${u}">${u}</option>`).join('');

      } catch (e) {
        console.error("Error cambiando cliente QR:", e);
        qrUnidad.innerHTML = '<option value="">Error carga</option>';
      }
    });
  }

  // Obtener geolocalización actual
  if (qrGetLocationBtn) {
    qrGetLocationBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (navigator.geolocation) {
        if (UI && UI.showOverlay) UI.showOverlay('Obteniendo ubicación...', 'Leyendo GPS');
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (qrLatitude) qrLatitude.value = pos.coords.latitude.toFixed(6);
            if (qrLongitude) qrLongitude.value = pos.coords.longitude.toFixed(6);
            if (UI && UI.hideOverlay) UI.hideOverlay();
            if (UI && UI.toast) UI.toast('✅ Ubicación obtenida');
          },
          (err) => {
            if (UI && UI.hideOverlay) UI.hideOverlay();
            if (UI && UI.toast) UI.toast('❌ Error al obtener ubicación: ' + err.message);
          }
        );
      } else {
        if (UI && UI.toast) UI.toast('❌ Geolocalización no disponible');
      }
    });

    // Variables para el mapa
    let mapInstance = null;
    let mapMarker = null;
    let selectedLat = -12.0464;
    let selectedLng = -77.0428; // Lima, Perú por defecto
    let currentLayer = 'street';
    let tileLayers = {};

    // Elementos del modal del mapa
    const mapModal = document.getElementById('qr-map-modal');
    const mapOpenBtn = document.getElementById('qr-open-map');
    const mapCloseBtn = document.getElementById('qr-map-close');
    const mapCancelBtn = document.getElementById('qr-map-cancel');
    const mapSaveBtn = document.getElementById('qr-map-save');
    const mapContainer = document.getElementById('qr-map-container');
    const addressSearch = document.getElementById('qr-address-search');
    const searchBtn = document.getElementById('qr-search-btn');
    const mapLatDisplay = document.getElementById('qr-map-lat-display');
    const mapLngDisplay = document.getElementById('qr-map-lng-display');

    function initMap() {
      if (mapInstance) mapInstance.remove();

      // Usar valores actuales si existen
      if (qrLatitude?.value && qrLongitude?.value) {
        selectedLat = parseFloat(qrLatitude.value);
        selectedLng = parseFloat(qrLongitude.value);
      }

      mapInstance = L.map('qr-map-container').setView([selectedLat, selectedLng], 13);

      // Definir capas de mapa
      tileLayers.street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
      });

      tileLayers.satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '© Esri',
        maxZoom: 19
      });

      tileLayers.terrain = L.tileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19
      });

      // Agregar capa inicial
      tileLayers[currentLayer].addTo(mapInstance);

      mapMarker = L.marker([selectedLat, selectedLng], {
        draggable: true,
        icon: L.icon({
          iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          popupAnchor: [1, -34],
          shadowSize: [41, 41]
        })
      }).addTo(mapInstance);

      // Actualizar coordenadas cuando se arrastra el marcador
      mapMarker.on('dragend', () => {
        const coords = mapMarker.getLatLng();
        selectedLat = coords.lat;
        selectedLng = coords.lng;
        mapLatDisplay.value = selectedLat.toFixed(6);
        mapLngDisplay.value = selectedLng.toFixed(6);
      });

      // Click en el mapa para colocar marcador
      mapInstance.on('click', (e) => {
        selectedLat = e.latlng.lat;
        selectedLng = e.latlng.lng;
        mapMarker.setLatLng([selectedLat, selectedLng]);
        mapLatDisplay.value = selectedLat.toFixed(6);
        mapLngDisplay.value = selectedLng.toFixed(6);
      });

      mapLatDisplay.value = selectedLat.toFixed(6);
      mapLngDisplay.value = selectedLng.toFixed(6);

      // Event listeners para cambiar capas
      document.querySelectorAll('.map-layer-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const layer = btn.dataset.layer;

          // Remover capa actual
          mapInstance.removeLayer(tileLayers[currentLayer]);

          // Agregar nueva capa
          tileLayers[layer].addTo(mapInstance);
          currentLayer = layer;

          // Actualizar estilos de botones
          document.querySelectorAll('.map-layer-btn').forEach(b => {
            b.style.background = 'white';
            b.style.borderColor = '#e2e8f0';
            b.style.color = '#718096';
          });
          btn.style.background = '#3b82f6';
          btn.style.borderColor = '#3b82f6';
          btn.style.color = 'white';
        });
      });
    }

    // Abrir modal del mapa
    if (mapOpenBtn) {
      mapOpenBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (mapModal) {
          mapModal.style.display = 'flex';
          setTimeout(initMap, 100);
        }
      });
    }

    // Cerrar modal
    function closeMapModal() {
      if (mapModal) mapModal.style.display = 'none';
      if (mapInstance) mapInstance.remove();
      mapInstance = null;
    }

    if (mapCloseBtn) mapCloseBtn.addEventListener('click', closeMapModal);
    if (mapCancelBtn) mapCancelBtn.addEventListener('click', closeMapModal);

    // Guardar ubicación
    if (mapSaveBtn) {
      mapSaveBtn.addEventListener('click', () => {
        if (qrLatitude) qrLatitude.value = selectedLat.toFixed(6);
        if (qrLongitude) qrLongitude.value = selectedLng.toFixed(6);
        closeMapModal();
        if (UI && UI.toast) UI.toast('✅ Ubicación guardada');
      });
    }

    // Búsqueda de dirección/empresa/poi
    if (searchBtn) {
      searchBtn.addEventListener('click', async () => {
        const address = addressSearch?.value?.trim();
        const searchType = document.getElementById('qr-search-type')?.value || 'address';
        const province = document.getElementById('qr-search-province')?.value || '';

        if (!address) {
          if (UI && UI.toast) UI.toast('❌ Ingresa un término de búsqueda');
          return;
        }

        try {
          if (UI && UI.showOverlay) UI.showOverlay('Buscando...', 'Conectando con Nominatim');

          // Construir query según tipo de búsqueda
          let queryAddress = address;

          if (searchType === 'company' || searchType === 'poi') {
            // Para empresas y lugares importantes
            queryAddress = address;
          } else if (searchType === 'coordinates') {
            // Si es coordenadas, parseolas directamente
            const coords = address.split(',');
            if (coords.length === 2) {
              const lat = parseFloat(coords[0].trim());
              const lng = parseFloat(coords[1].trim());
              if (!isNaN(lat) && !isNaN(lng)) {
                selectedLat = lat;
                selectedLng = lng;
                if (mapInstance) {
                  mapInstance.setView([selectedLat, selectedLng], 15);
                  mapMarker.setLatLng([selectedLat, selectedLng]);
                }
                mapLatDisplay.value = selectedLat.toFixed(6);
                mapLngDisplay.value = selectedLng.toFixed(6);
                if (UI && UI.hideOverlay) UI.hideOverlay();
                if (UI && UI.toast) UI.toast('✅ Coordenadas aplicadas');
                return;
              }
            }
            if (UI && UI.hideOverlay) UI.hideOverlay();
            if (UI && UI.toast) UI.toast('❌ Formato de coordenadas inválido. Usa: lat, lng');
            return;
          } else {
            // Para direcciones, agregar provincia/país
            if (province) {
              queryAddress = address + ', ' + province;
            }
            queryAddress = queryAddress + ', Peru';
          }

          const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryAddress)}&limit=5`
          );

          const results = await response.json();

          if (UI && UI.hideOverlay) UI.hideOverlay();

          if (results.length > 0) {
            const result = results[0];
            selectedLat = parseFloat(result.lat);
            selectedLng = parseFloat(result.lon);

            if (mapInstance) {
              mapInstance.setView([selectedLat, selectedLng], 15);
              mapMarker.setLatLng([selectedLat, selectedLng]);
            }

            mapLatDisplay.value = selectedLat.toFixed(6);
            mapLngDisplay.value = selectedLng.toFixed(6);
            if (UI && UI.toast) UI.toast('✅ Ubicación encontrada: ' + result.display_name.substring(0, 50) + '...');
          } else {
            if (UI && UI.toast) UI.toast('❌ No se encontró la ubicación. Intenta con otro término');
          }
        } catch (error) {
          if (UI && UI.hideOverlay) UI.hideOverlay();
          if (UI && UI.toast) UI.toast('❌ Error en la búsqueda: ' + error.message);
        }
      });
    }

    // Enter en búsqueda
    if (addressSearch) {
      addressSearch.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchBtn?.click();
      });
    }

    // Cerrar modal al hacer click fuera
    if (mapModal) {
      mapModal.addEventListener('click', (e) => {
        if (e.target === mapModal) closeMapModal();
      });
    }

    // ===== FILTROS Y DESCARGA DE QRs =====
    const filterCliente = document.getElementById('qr-filter-cliente');
    const filterUnidad = document.getElementById('qr-filter-unidad');
    const filterSearchBtn = document.getElementById('qr-filter-search'); // Nuevo botón Buscar
    const filterClearBtn = document.getElementById('qr-filter-clear');
    const downloadAllBtn = document.getElementById('qr-download-all');

    // Cargar filtros directamente de Firestore (Master Data Logic)
    async function loadQRFiltersFromCache() {
      // Indicador visual de carga
      if (filterCliente && !filterCliente.dataset.loading) {
        filterCliente.innerHTML = '<option>Validando permisos...</option>';
        filterCliente.dataset.loading = 'true';
      }

      // Esperar inicialización COMPLETA (incluyendo userType)
      if (!window.accessControl || !window.accessControl?.userType || !firebase || !firebase.apps.length) {
        setTimeout(loadQRFiltersFromCache, 500);
        return;
      }

      // Limpiar flag de carga
      if (filterCliente) delete filterCliente.dataset.loading;

      try {
        const firestore = firebase.firestore();
        const ac = window.accessControl;

        // LÓGICA CLIENTE
        if (ac?.userType === 'CLIENTE') {
          const c = ac.clienteAsignado;

          // 1. Cliente
          if (filterCliente) {
            filterCliente.innerHTML = `<option value="${c}">${c}</option>`;
            filterCliente.value = c;
            filterCliente.disabled = true;
          }

          // 2. Unidades
          let units = [];
          if (typeof getUnidadesFromClienteUnidad === 'function') {
            units = await getUnidadesFromClienteUnidad(c);
          }
          if (!units || !units.length) {
            const doc = await firestore.collection('CLIENTE_UNIDAD').doc(c).get();
            if (doc.exists) {
              const d = doc.data();
              if (d.unidades || d.UNIDADES) units = d.unidades || d.UNIDADES;
              else {
                const subSnap = await firestore.collection('CLIENTE_UNIDAD').doc(c).collection('UNIDADES').get();
                units = subSnap.docs.map(sd => sd.id);
              }
            }
          }

          const allowed = ac.getUnidadesAsignadas();
          if (allowed && allowed.length > 0) units = units.filter(u => allowed.includes(u));

          // Deduplicar
          units = [...new Set(units)];
          units.sort();

          if (filterUnidad) {
            if (units.length === 1) {
              filterUnidad.innerHTML = `<option value="${units[0]}" selected>${units[0]}</option>`;
              filterUnidad.value = units[0];
              filterUnidad.disabled = true;
              filterUnidad.style.backgroundColor = '#e2e8f0';
            } else {
              filterUnidad.innerHTML = '<option value="">Todas las Unidades</option>' +
                units.map(u => `<option value="${u}">${u}</option>`).join('');
              filterUnidad.disabled = false;
              filterUnidad.style.backgroundColor = '';
            }
          }

        } else {
          // LÓGICA ADMIN
          const snap = await firestore.collection('CLIENTE_UNIDAD').get();
          const clientes = snap.docs.map(d => d.id).sort((a, b) => a.localeCompare(b, 'es'));

          if (filterCliente) {
            filterCliente.innerHTML = '<option value="">Todos los Clientes</option>' +
              clientes.map(c => `<option value="${c}">${c}</option>`).join('');
            filterCliente.disabled = false;
          }
          // Unidad se carga al cambiar cliente (listener existente updateQRUnitFilter)
        }
      } catch (e) { console.error('Error loading QR filters:', e); }

      // Ya no llamamos a updateQRUnitFilter() aquí porque ya lo manejamos arriba para CLIENTE
      // Y para ADMIN empieza vacío hasta que seleccione.
    }

    async function updateQRUnitFilter() {
      const selectedCliente = filterCliente?.value || '';

      if (!selectedCliente) {
        if (filterUnidad) filterUnidad.innerHTML = '<option value="">Todas las Unidades</option>';
        return;
      }

      try {
        const firestore = firebase.firestore();
        const snap = await firestore.collection('CLIENTE_UNIDAD').doc(selectedCliente).collection('UNIDADES').get();
        const units = snap.docs.map(d => d.id).sort((a, b) => a.localeCompare(b, 'es'));

        if (filterUnidad) {
          const currentVal = filterUnidad.value;
          filterUnidad.innerHTML = '<option value="">Todas las Unidades</option>' +
            units.map(u => `<option value="${u}">${u}</option>`).join('');
          if (currentVal && units.includes(currentVal)) {
            filterUnidad.value = currentVal;
          } else {
            filterUnidad.value = '';
          }
        }
      } catch (e) { console.error('Error loading QR units:', e); }
    }

    // Aplicar filtros
    function applyFilters() {
      const clienteFilter = filterCliente?.value || '';
      const unidadFilter = filterUnidad?.value || '';

      let filtered = qrList;

      if (clienteFilter) {
        filtered = filtered.filter(q => q.cliente === clienteFilter);
      }

      if (unidadFilter) {
        filtered = filtered.filter(q => q.unidad === unidadFilter);
      }

      renderQRList(filtered);
    }

    // Buscador manual de QRs
    async function performQRSearch() {
      if (UI && UI.showOverlay) UI.showOverlay('Buscando QRs...');
      try {
        const cliente = filterCliente?.value;
        const unidad = filterUnidad?.value;

        let query = firebase.firestore().collection('QR_CODES');

        // Aplicar seguridad y filtros
        if (window.accessControl?.userType === 'CLIENTE') {
          query = query.where('cliente', '==', window.accessControl.clienteAsignado);
          if (unidad) query = query.where('unidad', '==', unidad);
        } else {
          if (cliente) query = query.where('cliente', '==', cliente);
          if (unidad) query = query.where('unidad', '==', unidad);
        }

        const snap = await query.get();
        qrList = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        renderQRList(qrList);

        if (snap.empty) {
          if (qrListContainer) qrListContainer.innerHTML = '<div class="qr-empty-state" style="grid-column:1/-1; text-align:center; padding:40px; color:#a0aec0;"><strong>No se encontraron resultados</strong><p>Intenta con otros filtros</p></div>';
          if (UI && UI.toast) UI.toast('⚠️ No se encontraron resultados');
        }
      } catch (e) {
        console.error('Error searching QR:', e);
        if (UI && UI.toast) UI.toast('❌ Error en la búsqueda');
      } finally {
        if (UI && UI.hideOverlay) UI.hideOverlay();
      }
    }

    if (filterSearchBtn) {
      filterSearchBtn.addEventListener('click', performQRSearch);
    }

    // Event listeners de filtros
    if (filterCliente) {
      filterCliente.addEventListener('change', async () => {
        if (filterUnidad) filterUnidad.value = ''; // Reset unit on client change
        // NO aplicar filtros automáticamente, solo actualizar dropdowns
        await updateQRUnitFilter();
      });
    }

    if (filterUnidad) {
      // filterUnidad.addEventListener('change', applyFilters); // Deshabilitado
    }

    if (filterClearBtn) {
      filterClearBtn.addEventListener('click', () => {
        if (filterCliente && !filterCliente.disabled) filterCliente.value = '';
        if (filterUnidad && !filterUnidad.disabled) filterUnidad.value = '';
        // Limpiar lista
        qrList = [];
        renderQRList();
        if (qrListContainer) qrListContainer.innerHTML = '<div class="qr-empty-state" style="grid-column:1/-1;"><strong>Filtros limpios</strong><p>Selecciona y busca de nuevo</p></div>';
      });
    }

    // Descargar todos los QRs en PDF
    if (downloadAllBtn) {
      downloadAllBtn.addEventListener('click', () => {
        // Mostrar modal para elegir tamaño
        const sizeModal = document.getElementById('qrSizeModal');
        if (sizeModal) {
          sizeModal.style.display = 'block';
          sizeModal.setAttribute('aria-hidden', 'false');
        }
      });
    }

    // Manejar el formulario de tamaño
    const qrSizeForm = document.getElementById('qrSizeForm');
    const qrSizeModal = document.getElementById('qrSizeModal');
    const qrSizeCancel = document.getElementById('qrSizeCancel');

    if (qrSizeCancel) {
      qrSizeCancel.addEventListener('click', () => {
        if (qrSizeModal) {
          qrSizeModal.style.display = 'none';
          qrSizeModal.setAttribute('aria-hidden', 'true');
        }
      });
    }

    if (qrSizeForm) {
      qrSizeForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const bulkWidth = parseInt(document.getElementById('qrBulkWidth')?.value || 80);
        const bulkHeight = parseInt(document.getElementById('qrBulkHeight')?.value || 80);

        // Cerrar modal
        if (qrSizeModal) {
          qrSizeModal.style.display = 'none';
          qrSizeModal.setAttribute('aria-hidden', 'true');
        }

        // Proceder con la descarga
        await downloadAllQRsWithSize(bulkWidth, bulkHeight);
      });
    }

    // Función para descargar todos con tamaño específico
    async function downloadAllQRsWithSize(qrWidth, qrHeight) {
      const clienteFilter = filterCliente?.value || '';
      const unidadFilter = filterUnidad?.value || '';

      let qrsToDownload = qrList;

      if (clienteFilter) {
        qrsToDownload = qrsToDownload.filter(q => q.cliente === clienteFilter);
      }

      if (unidadFilter) {
        qrsToDownload = qrsToDownload.filter(q => q.unidad === unidadFilter);
      }

      if (qrsToDownload.length === 0) {
        if (UI && UI.toast) UI.toast('❌ No hay QRs para descargar');
        return;
      }

      if (UI && UI.showOverlay) UI.showOverlay('Generando PDF...', 'Procesando ' + qrsToDownload.length + ' QRs');

      try {
        // Esperar a que todas las imágenes QR se generen
        const qrImages = [];

        for (const qr of qrsToDownload) {
          await new Promise(resolve => {
            const tempContainer = document.createElement('div');
            tempContainer.style.display = 'none';
            tempContainer.style.width = '256px';
            tempContainer.style.height = '256px';
            document.body.appendChild(tempContainer);

            new QRCode(tempContainer, {
              text: qr.id,
              width: 256,
              height: 256,
              correctLevel: QRCode.CorrectLevel.H
            });

            setTimeout(() => {
              const canvas = tempContainer.querySelector('canvas');
              if (canvas) {
                qrImages.push({
                  data: canvas.toDataURL('image/png'),
                  qr: qr
                });
              }
              if (document.body.contains(tempContainer)) {
                document.body.removeChild(tempContainer);
              }
              resolve();
            }, 300);
          });
        }

        if (window.pdfMake) {
          const timestamp = moment().format('DD/MM/YYYY HH:mm:ss');
          const docContent = [];

          // Título
          docContent.push({
            text: 'Reporte de Códigos QR',
            fontSize: 20,
            bold: true,
            alignment: 'center',
            margin: [0, 0, 0, 10]
          });

          // Resumen
          docContent.push({
            text: `Total de QRs: ${qrsToDownload.length} | Generado: ${timestamp}`,
            fontSize: 10,
            color: '#666',
            alignment: 'center',
            margin: [0, 0, 0, 20]
          });

          // GRID de QRs (4 columnas)
          const body = [];
          let currentRow = [];
          const columns = 4;

          qrImages.forEach((item, idx) => {
            // Cada celda contiene una tabla anidada para crear el efecto de "tarjeta" con bordes independientes
            currentRow.push({
              table: {
                widths: ['*'],
                body: [
                  [
                    {
                      stack: [
                        { text: item.qr.nombre || 'Sin Nombre', fontSize: 9, bold: true, alignment: 'center', margin: [0, 2, 0, 2] },
                        { image: item.data, width: qrWidth, height: qrHeight, alignment: 'center', margin: [0, 0, 0, 2] }
                      ],
                      alignment: 'center',
                      margin: [5, 5, 5, 5],
                      fillColor: '#ffffff'
                    }
                  ]
                ]
              },
              layout: {
                hLineWidth: function () { return 1; },
                vLineWidth: function () { return 1; },
                hLineColor: function () { return 'black'; },
                vLineColor: function () { return 'black'; }
              },
              margin: [5, 5, 5, 5], // Espaciado entre "tarjetas"
              border: [false, false, false, false] // Sin borde en la celda contenedora
            });

            if (currentRow.length === columns) {
              body.push(currentRow);
              currentRow = [];
            }
          });

          // Rellenar última fila
          if (currentRow.length > 0) {
            while (currentRow.length < columns) {
              currentRow.push({ text: '', border: [false, false, false, false] });
            }
            body.push(currentRow);
          }

          if (body.length > 0) {
            docContent.push({
              table: {
                headerRows: 0,
                widths: ['25%', '25%', '25%', '25%'],
                body: body
              },
              layout: 'noBorders', // Tabla principal invisible
              margin: [0, 0, 0, 0]
            });
          }

          const docDefinition = {
            content: docContent,
            pageSize: 'A4',
            pageOrientation: 'portrait',
            pageMargins: [20, 20, 20, 20]
          };

          const pdfName = `QRs_Grid_${moment().format('YYYYMMDD_HHmmss')}.pdf`;
          pdfMake.createPdf(docDefinition).download(pdfName);
          if (UI && UI.toast) UI.toast('✅ PDF de QRs descargado');
        } else {
          if (UI && UI.toast) UI.toast('❌ pdfMake no disponible');
        }
      } catch (error) {
        if (UI && UI.toast) UI.toast('❌ Error: ' + error.message);
      } finally {
        if (UI && UI.hideOverlay) UI.hideOverlay();
      }
    }

    // Actualizar filtros cuando se agregan QRs
    const originalRenderQRList = renderQRList;
    window.renderQRListWithFilters = function (filtered) {
      // NO actualizamos opciones automáticamente para no perder estado de filtros, ni dependemos de la lista visual
      originalRenderQRList(filtered);
    };

    // Llamar a la función original pero con actualización de filtros
    renderQRList = function (filtered) {
      // NO actualizamos opciones automáticamente, se cargan de cache global
      originalRenderQRList(filtered);
    };

    // Inicializar filtros
    loadQRFiltersFromCache();
  }

  // Agregar QR
  if (qrForm) {
    qrForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const cliente = qrCliente?.value?.trim();
      const unidad = qrUnidad?.value?.trim();
      const nombre = qrNombre?.value?.trim();
      const lat = parseFloat(qrLatitude?.value || 0);
      const lng = parseFloat(qrLongitude?.value || 0);
      const width = parseInt(qrWidth?.value || 200);
      const height = parseInt(qrHeight?.value || 200);
      const requireQuestion = qrRequireQuestion?.value === 'si';

      if (!cliente || !unidad || !nombre || !lat || !lng) {
        if (UI && UI.toast) UI.toast('❌ Por favor completa todos los campos');
        return;
      }

      // Validar y recopilar preguntas
      let questions = [];
      if (requireQuestion) {
        const questionInputs = qrQuestionsList.querySelectorAll('.question-input');
        if (questionInputs.length === 0) {
          if (UI && UI.toast) UI.toast('❌ Por favor agrega al menos una pregunta');
          return;
        }

        questions = Array.from(questionInputs).map((input, idx) => {
          const text = input.value?.trim();
          if (!text) {
            if (UI && UI.toast) UI.toast(`❌ La pregunta ${idx + 1} está vacía`);
            throw new Error(`Pregunta ${idx + 1} requerida`);
          }
          return text;
        });
      }

      const qrData = {
        cliente,
        unidad,
        nombre,
        latitude: lat,
        longitude: lng,
        width: width,
        height: height,
        requireQuestion,
        questions: questions,
        createdAt: new Date().toISOString(),
        id: `qr_${Date.now()}`
      };

      try {
        // Guardar en Firebase
        const firestore = firebase.firestore();
        await firestore.collection('QR_CODES').doc(qrData.id).set(qrData);

        // Agregar a lista local
        qrList.push(qrData);

        // Limpiar formulario
        qrForm.reset();
        qrQuestionsContainer.style.display = 'none';
        qrQuestionsList.innerHTML = '';
        qrQuestionsCount = 0;

        // Actualizar vista
        renderQRList();

        if (UI && UI.toast) UI.toast('✅ QR creado y guardado en Firebase');
      } catch (error) {
        if (UI && UI.toast) UI.toast('❌ Error al guardar QR: ' + error.message);
      }
    });
  }
  // Renderizar lista de QR
  function renderQRList(filteredList = null) {
    const listToRender = filteredList !== null ? filteredList : qrList;

    if (listToRender.length === 0) {
      qrListContainer.innerHTML = '<div class="qr-empty-state" style="grid-column:1/-1;"><strong>No hay QRs generados</strong><p>Completa el formulario y haz click en "Agregar QR"</p></div>';
      return;
    }

    qrListContainer.innerHTML = '';

    listToRender.forEach(qr => {
      const item = document.createElement('div');
      item.className = 'qr-item';

      // Crear contenedor para el QR
      const qrContainer = document.createElement('div');
      qrContainer.className = 'qr-item-canvas';

      // Generar QR en el contenedor - Solo con el ID único
      new QRCode(qrContainer, {
        text: qr.id,
        width: 160,
        height: 160,
        correctLevel: QRCode.CorrectLevel.H
      });

      // Info del QR
      const info = document.createElement('div');
      info.className = 'qr-item-info';
      info.innerHTML = `
        <strong>${qr.nombre}</strong>
        <small>${qr.cliente} - ${qr.unidad}</small>
        <small>📍 ${qr.latitude.toFixed(4)}, ${qr.longitude.toFixed(4)}</small>
      `;

      // Acciones
      const actions = document.createElement('div');
      actions.className = 'qr-item-actions';

      const btnDescargar = document.createElement('button');
      btnDescargar.type = 'button';
      btnDescargar.className = 'btn-descargar';
      btnDescargar.textContent = '📥 Descargar';
      btnDescargar.onclick = () => downloadQR(qr.id, qr.nombre);

      const btnEliminar = document.createElement('button');
      btnEliminar.type = 'button';
      btnEliminar.className = 'btn-eliminar';
      btnEliminar.textContent = '🗑️ Eliminar';
      btnEliminar.onclick = () => deleteQR(qr.id);

      actions.appendChild(btnDescargar);
      actions.appendChild(btnEliminar);

      item.appendChild(qrContainer);
      item.appendChild(info);
      item.appendChild(actions);

      qrListContainer.appendChild(item);
    });
  }

  // Cargar QRs cuando accedemos a la vista
  let qrClientesLoaded = false;
  document.addEventListener('click', (ev) => {
    const toQR = ev.target.closest('[data-target="view-crear-qr"]');
    if (toQR && !qrClientesLoaded) {
      qrClientesLoaded = true;
      loadQRClientes();
      // Cargar QRs existentes de Firebase con filtro de cliente
      // Cargar QRs existentes de Firebase con filtro de cliente
      // DESHABILITADO: Carga automática. Ahora es manual con botón BUSCAR.
      qrList = [];
      renderQRList();

      // Mostrar mensaje inicial si hay contenedor
      if (qrListContainer) {
        qrListContainer.innerHTML = '<div class="qr-empty-state" style="grid-column:1/-1;"><strong>Selecciona filtros y haz clic en "Buscar"</strong><p>Para ver los QRs generados</p></div>';
      }
    }
  });

  // Funciones globales para eliminar y descargar
  window.deleteQR = function (id) {
    const qr = qrList.find(q => q.id === id);
    if (!qr) {
      if (UI && UI.toast) UI.toast('❌ QR no encontrado');
      return;
    }

    // Mostrar modal de confirmación
    const deleteQRModal = document.getElementById('deleteQRModal');
    const deleteQRName = document.getElementById('deleteQRName');
    const deleteQRConfirm = document.getElementById('deleteQRConfirm');
    const deleteQRCancel = document.getElementById('deleteQRCancel');

    deleteQRName.textContent = qr.nombre + ' (' + qr.cliente + ' - ' + qr.unidad + ')';
    deleteQRModal.style.display = 'flex';

    // Manejar cancelación
    deleteQRCancel.onclick = () => {
      deleteQRModal.style.display = 'none';
    };

    // Manejar confirmación
    deleteQRConfirm.onclick = async () => {
      try {
        const firestore = firebase.firestore();
        await firestore.collection('QR_CODES').doc(id).delete();
        qrList = qrList.filter(q => q.id !== id);
        renderQRList();
        deleteQRModal.style.display = 'none';
        if (UI && UI.toast) UI.toast('✅ QR eliminado correctamente');
      } catch (e) {
        if (UI && UI.toast) UI.toast('❌ Error al eliminar QR');
      }
    };

    // Cerrar modal si se hace clic fuera
    deleteQRModal.addEventListener('click', (e) => {
      if (e.target === deleteQRModal) {
        deleteQRModal.style.display = 'none';
      }
    });
  };

  window.downloadQR = function (id, nombre) {
    const qr = qrList.find(q => q.id === id);
    if (!qr) {
      if (UI && UI.toast) UI.toast('❌ QR no encontrado');
      return;
    }

    try {
      // Crear contenedor temporal para generar QR
      const tempContainer = document.createElement('div');
      tempContainer.style.display = 'none';
      tempContainer.style.width = '256px';
      tempContainer.style.height = '256px';
      document.body.appendChild(tempContainer);

      if (window.QRCode) {
        new QRCode(tempContainer, {
          text: qr.id,
          width: 256,
          height: 256,
          correctLevel: QRCode.CorrectLevel.H
        });

        // Esperar a que se genere el QR
        setTimeout(() => {
          try {
            // Obtener canvas del QR
            let qrCanvas = null;
            const img = tempContainer.querySelector('img');

            if (img) {
              // Si es imagen, convertir a canvas
              qrCanvas = document.createElement('canvas');
              qrCanvas.width = 256;
              qrCanvas.height = 256;
              const ctx = qrCanvas.getContext('2d');
              const tempImg = new Image();
              tempImg.onload = function () {
                ctx.drawImage(tempImg, 0, 0);
                generatePDFWithQR(qrCanvas.toDataURL('image/png'));
              };
              tempImg.src = img.src;
            } else {
              // Si ya es canvas
              const canvas = tempContainer.querySelector('canvas');
              if (canvas) {
                generatePDFWithQR(canvas.toDataURL('image/png'));
              }
            }

            function generatePDFWithQR(imageDataUrl) {
              if (!window.pdfMake) {
                if (UI && UI.toast) UI.toast('❌ pdfMake no disponible');
                if (document.body.contains(tempContainer)) document.body.removeChild(tempContainer);
                return;
              }

              const timestamp = moment().format('DD/MM/YYYY HH:mm:ss');

              const docDefinition = {
                content: [
                  {
                    text: 'Código QR',
                    fontSize: 20,
                    bold: true,
                    alignment: 'center',
                    margin: [0, 0, 0, 20]
                  },
                  {
                    text: 'Nombre: ' + (nombre || 'N/A'),
                    fontSize: 12,
                    margin: [0, 0, 0, 8]
                  },
                  {
                    text: 'Cliente: ' + (qr.cliente || 'N/A'),
                    fontSize: 12,
                    margin: [0, 0, 0, 8]
                  },
                  {
                    text: 'Unidad: ' + (qr.unidad || 'N/A'),
                    fontSize: 12,
                    margin: [0, 0, 0, 8]
                  },
                  {
                    text: 'Ubicación: ' + (qr.latitude || 0) + ', ' + (qr.longitude || 0),
                    fontSize: 12,
                    margin: [0, 0, 0, 20]
                  },
                  {
                    image: imageDataUrl,
                    width: qr.width || 200,
                    height: qr.height || 200,
                    alignment: 'center',
                    margin: [0, 20, 0, 20]
                  },
                  {
                    text: 'Generado: ' + timestamp,
                    fontSize: 10,
                    color: '#666',
                    alignment: 'center'
                  }
                ],
                pageSize: 'A4',
                margin: [40, 40, 40, 40]
              };

              try {
                const pdfName = `QR_${nombre}_${moment().format('YYYYMMDD_HHmmss')}.pdf`;
                pdfMake.createPdf(docDefinition).download(pdfName);
                if (UI && UI.toast) UI.toast('✅ QR descargado en PDF');
              } catch (pdfError) {
                if (UI && UI.toast) UI.toast('❌ Error al generar PDF');
              }

              // Limpiar
              if (document.body.contains(tempContainer)) {
                document.body.removeChild(tempContainer);
              }
            }
          } catch (innerError) {
            if (UI && UI.toast) UI.toast('❌ Error al procesar QR');
            if (document.body.contains(tempContainer)) document.body.removeChild(tempContainer);
          }
        }, 500);

      } else {
        if (UI && UI.toast) UI.toast('❌ Librería QR no disponible');
      }
    } catch (e) {
      if (UI && UI.toast) UI.toast('❌ Error: ' + e.message);
    }
  };

  // ==================== CONTROL VEHICULAR ====================
  // Variables globales para Control Vehicular
  let cvData = [];
  let cvChartFecha = null;
  let cvChartEstado = null;

  // Función para cargar datos de Control Vehicular
  async function loadControlVehicularData() {
    try {
      // Validar que db esté disponible
      if (!window.db) {
        UI.toast('Esperando inicialización de Firebase...');
        return;
      }

      try {
        const snapshot = await getQueryWithClienteFilter('ACCESO_VEHICULAR').orderBy('timestamp', 'desc').get();
        cvData = [];

        snapshot.forEach(doc => {
          const data = doc.data();
          cvData.push({
            id: doc.id,
            ...data,
            timestamp: data.timestamp?.toDate?.() || new Date(data.timestamp || 0)
          });
        });
      } catch (firebaseErr) {
        UI.toast('Sin datos disponibles');
        cvData = [];
      }

      fillControlVehicularTable();
      updateControlVehicularCharts();
      updateControlVehicularCards();
    } catch (err) {
      UI.toast('Error al cargar datos');
    }
  }

  // Función para llenar la tabla de Control Vehicular
  function fillControlVehicularTable() {
    const tbody = document.getElementById('cv-tbody');
    if (!tbody) return;

    const fechaInicio = document.getElementById('cv-fecha-inicio')?.value;
    const fechaFin = document.getElementById('cv-fecha-fin')?.value;
    const cliente = document.getElementById('cv-cliente')?.value;
    const unidad = document.getElementById('cv-unidad')?.value;
    const estado = document.getElementById('cv-estado')?.value;

    let filtered = cvData.filter(row => {
      if (!row.timestamp) return false;

      const rowDate = row.timestamp instanceof Date ? row.timestamp : new Date(row.timestamp);
      const dateStr = rowDate.toISOString().split('T')[0];

      if (fechaInicio && dateStr < fechaInicio) return false;
      if (fechaFin && dateStr > fechaFin) return false;
      if (cliente && row.cliente !== cliente) return false;
      if (unidad && row.unidad !== unidad) return false;
      if (estado && row.estado !== estado) return false;

      return true;
    });

    tbody.innerHTML = filtered.map(row => {
      // Convertir fechaIngreso
      let fechaIngresoStr = '';
      if (row.fechaIngreso) {
        let tsIngreso;
        if (row.fechaIngreso.toDate) {
          // Es un Timestamp de Firestore
          tsIngreso = row.fechaIngreso.toDate();
        } else if (row.fechaIngreso instanceof Date) {
          tsIngreso = row.fechaIngreso;
        } else {
          tsIngreso = new Date(row.fechaIngreso);
        }
        if (tsIngreso instanceof Date && !isNaN(tsIngreso)) {
          fechaIngresoStr = tsIngreso.toLocaleString('es-PE');
        }
      }

      // Convertir fechaSalida
      let fechaSalidaStr = '';
      if (row.fechaSalida) {
        let tsSalida;
        if (row.fechaSalida.toDate) {
          // Es un Timestamp de Firestore
          tsSalida = row.fechaSalida.toDate();
        } else if (row.fechaSalida instanceof Date) {
          tsSalida = row.fechaSalida;
        } else {
          tsSalida = new Date(row.fechaSalida);
        }
        if (tsSalida instanceof Date && !isNaN(tsSalida)) {
          fechaSalidaStr = tsSalida.toLocaleString('es-PE');
        }
      }

      let estadoColor = '#999';
      if (row.estado === 'ingreso') estadoColor = '#10b981';
      if (row.estado === 'salida') estadoColor = '#3b82f6';

      // HTML para la imagen (miniatura clickeable)
      let imagenHTML = '';
      if (row.fotoURL) {
        const escapedUrl = row.fotoURL.replace(/"/g, '&quot;');
        imagenHTML = `<img src="${escapedUrl}" alt="Foto" style="width: 40px; height: 40px; border-radius: 4px; cursor: pointer; object-fit: cover;" onclick="event.stopPropagation(); showImageModal('${escapedUrl}');" />`;
      } else {
        imagenHTML = '<span style="color: #999; font-size: 11px;">Sin foto</span>';
      }

      return `<tr>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${fechaIngresoStr}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${fechaSalidaStr}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${row.placa || ''}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${row.cliente || ''}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${row.unidad || ''}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${row.puesto || ''}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${row.usuario || ''}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${row.usuarioSalida || ''}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">
          <span style="display: inline-block; padding: 4px 12px; background: ${estadoColor}20; color: ${estadoColor}; border-radius: 12px; font-weight: 600; font-size: 11px;">
            ${row.estado || ''}
          </span>
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${row.observaciones || ''}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${row.comentarioSalida || ''}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">${imagenHTML}</td>
      </tr>`;
    }).join('');

    UI.toast(`Resultados: ${filtered.length}`);
  }

  // Función para actualizar tarjetas de resumen
  function updateControlVehicularCards() {
    const fechaInicio = document.getElementById('cv-fecha-inicio')?.value;
    const fechaFin = document.getElementById('cv-fecha-fin')?.value;
    const cliente = document.getElementById('cv-cliente')?.value;
    const unidad = document.getElementById('cv-unidad')?.value;
    const estado = document.getElementById('cv-estado')?.value;

    let filtered = cvData.filter(row => {
      if (!row.timestamp) return false;

      const rowDate = row.timestamp instanceof Date ? row.timestamp : new Date(row.timestamp);
      const dateStr = rowDate.toISOString().split('T')[0];

      if (fechaInicio && dateStr < fechaInicio) return false;
      if (fechaFin && dateStr > fechaFin) return false;
      if (cliente && row.cliente !== cliente) return false;
      if (unidad && row.unidad !== unidad) return false;
      if (estado && row.estado !== estado) return false;

      return true;
    });

    // Total de registros (Ingresados = total de documentos)
    const total = filtered.length;

    // Pendientes de Salida = registros con estado "ingreso"
    const pendientes = filtered.filter(r => r.estado === 'ingreso').length;

    // Salidas = registros con estado "salida"
    const salidas = filtered.filter(r => r.estado === 'salida').length;

    const totalEl = document.getElementById('cv-total');
    const ingresadosEl = document.getElementById('cv-ingresados');
    const pendientesEl = document.getElementById('cv-pendientes');
    const salidasEl = document.getElementById('cv-salidas');

    if (totalEl) totalEl.textContent = total;
    if (ingresadosEl) ingresadosEl.textContent = total;
    if (pendientesEl) pendientesEl.textContent = pendientes;
    if (salidasEl) salidasEl.textContent = salidas;
  }

  // Función para actualizar gráficos
  function updateControlVehicularCharts() {
    const fechaInicio = document.getElementById('cv-fecha-inicio')?.value;
    const fechaFin = document.getElementById('cv-fecha-fin')?.value;
    const cliente = document.getElementById('cv-cliente')?.value;
    const unidad = document.getElementById('cv-unidad')?.value;
    const estado = document.getElementById('cv-estado')?.value;

    let filtered = cvData.filter(row => {
      if (!row.timestamp) return false;

      const rowDate = row.timestamp instanceof Date ? row.timestamp : new Date(row.timestamp);
      const dateStr = rowDate.toISOString().split('T')[0];

      if (fechaInicio && dateStr < fechaInicio) return false;
      if (fechaFin && dateStr > fechaFin) return false;
      if (cliente && row.cliente !== cliente) return false;
      if (unidad && row.unidad !== unidad) return false;
      if (estado && row.estado !== estado) return false;

      return true;
    });

    // Chart por fecha (línea)
    const fechasMap = {};
    filtered.forEach(row => {
      const ts = row.timestamp instanceof Date ? row.timestamp : new Date(row.timestamp);
      const dateStr = ts.toISOString().split('T')[0];
      fechasMap[dateStr] = (fechasMap[dateStr] || 0) + 1;
    });

    const sortedFechas = Object.keys(fechasMap).sort();
    const ctxFecha = document.getElementById('cv-chart-fecha')?.getContext('2d');
    if (ctxFecha) {
      if (cvChartFecha) cvChartFecha.destroy();
      cvChartFecha = new Chart(ctxFecha, {
        type: 'line',
        data: {
          labels: sortedFechas,
          datasets: [{
            label: 'Accesos por Fecha',
            data: sortedFechas.map(f => fechasMap[f]),
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.3,
            pointBackgroundColor: '#3b82f6',
            pointRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: { legend: { display: true } }
        }
      });
    }

    // Chart por estado (doughnut)
    const estadosMap = {};
    filtered.forEach(row => {
      const est = row.estado || 'Sin Estado';
      estadosMap[est] = (estadosMap[est] || 0) + 1;
    });

    const estadoLabels = Object.keys(estadosMap);
    const estadoData = Object.values(estadosMap);
    const estadoColors = {
      'ingreso': '#10b981',
      'salida': '#3b82f6',
      'Sin Estado': '#999'
    };

    const ctxEstado = document.getElementById('cv-chart-estado')?.getContext('2d');
    if (ctxEstado) {
      if (cvChartEstado) cvChartEstado.destroy();
      cvChartEstado = new Chart(ctxEstado, {
        type: 'doughnut',
        data: {
          labels: estadoLabels,
          datasets: [{
            data: estadoData,
            backgroundColor: estadoLabels.map(e => estadoColors[e] || '#999'),
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: { legend: { position: 'bottom' } }
        }
      });
    }
  }

  // Event listeners para Control Vehicular
  document.getElementById('cv-btn-buscar')?.addEventListener('click', () => {
    fillControlVehicularTable();
    updateControlVehicularCharts();
    updateControlVehicularCards();
  });

  document.getElementById('cv-btn-limpiar')?.addEventListener('click', () => {
    const fechaInicio = document.getElementById('cv-fecha-inicio');
    const fechaFin = document.getElementById('cv-fecha-fin');
    const cliente = document.getElementById('cv-cliente');
    const unidad = document.getElementById('cv-unidad');
    const estado = document.getElementById('cv-estado');

    if (fechaInicio) fechaInicio.value = '';
    if (fechaFin) fechaFin.value = '';
    if (cliente) cliente.value = '';
    if (unidad) unidad.value = '';
    if (estado) estado.value = '';

    cvData = [];
    loadControlVehicularData();
  });

  document.getElementById('cv-btn-excel')?.addEventListener('click', exportControlVehicularExcel);
  document.getElementById('cv-btn-pdf')?.addEventListener('click', exportControlVehicularPDF);

  // Cargar clientes para select (Control Vehicular)
  async function loadControlVehicularFilters() {
    try {
      if (!window.db) return;

      const clienteSelect = document.getElementById('cv-cliente');
      const unidadSelect = document.getElementById('cv-unidad');
      if (!clienteSelect || !unidadSelect) return;

      const ac = window.accessControl;

      // Lógica robusta para CLIENTE
      if (ac?.userType === 'CLIENTE') {
        const c = ac.clienteAsignado;
        // Bloquear Cliente
        clienteSelect.innerHTML = `<option value="${c}">${c}</option>`;
        clienteSelect.disabled = true;
        clienteSelect.style.backgroundColor = '#e2e8f0';

        // Cargar Unidades (Master Data + Fallback)
        let units = [];
        if (typeof getUnidadesFromClienteUnidad === 'function') {
          units = await getUnidadesFromClienteUnidad(c);
        }
        // Fallback manual
        if (!units || units.length === 0) {
          const doc = await db.collection('CLIENTE_UNIDAD').doc(c).get();
          if (doc.exists) {
            const d = doc.data();
            units = d.unidades || d.UNIDADES || [];
          }
        }

        // Filtrar permitidas
        const allowed = ac.getUnidadesAsignadas();
        if (allowed && allowed.length > 0) {
          units = units.filter(u => allowed.includes(u));
        }
        units.sort();

        if (units.length === 1) {
          unidadSelect.innerHTML = `<option value="${units[0]}">${units[0]}</option>`;
          unidadSelect.disabled = true;
          unidadSelect.style.backgroundColor = '#e2e8f0';
        } else {
          unidadSelect.innerHTML = '<option value="">Todas</option>' +
            units.map(u => `<option value="${u}">${u}</option>`).join('');
          unidadSelect.disabled = false;
        }

      } else {
        // ADMIN: Cargar todo de CLIENTE_UNIDAD
        const snap = await db.collection('CLIENTE_UNIDAD').get();
        const clients = snap.docs.map(d => d.id).sort();

        clienteSelect.innerHTML = '<option value="">Todos</option>' +
          clients.map(c => `<option value="${c}">${c}</option>`).join('');

        // Unidades vacías hasta seleccionar cliente (o cargar todas? mejor vacio/todas)
        unidadSelect.innerHTML = '<option value="">Todas</option>';
      }

    } catch (err) {
      console.error("Error loadControlVehicularFilters:", err);
    }
  }

  // Función para exportar a Excel
  async function exportControlVehicularExcel() {
    try {
      const fechaInicio = document.getElementById('cv-fecha-inicio')?.value;
      const fechaFin = document.getElementById('cv-fecha-fin')?.value;
      const cliente = document.getElementById('cv-cliente')?.value;
      const estado = document.getElementById('cv-estado')?.value;

      let filtered = cvData.filter(row => {
        if (!row.timestamp) return false;

        const rowDate = row.timestamp instanceof Date ? row.timestamp : new Date(row.timestamp);
        const dateStr = rowDate.toISOString().split('T')[0];

        if (fechaInicio && dateStr < fechaInicio) return false;
        if (fechaFin && dateStr > fechaFin) return false;
        if (cliente && row.cliente !== cliente) return false;
        if (estado && row.estado !== estado) return false;

        return true;
      });

      const excelData = filtered.map(row => {
        const ts = row.timestamp instanceof Date ? row.timestamp : new Date(row.timestamp);
        const fechaHora = ts.toLocaleString('es-PE');

        return {
          'Fecha/Hora': fechaHora,
          'Placa': row.placa || '',
          'Tipo Acceso': row.tipoAcceso || '',
          'Operador': row.operador || '',
          'Cliente': row.cliente || '',
          'Estado': row.estado || '',
          'Observación': row.observacion || ''
        };
      });

      const ws = XLSX.utils.json_to_sheet(excelData);
      ws['!cols'] = [
        { wch: 20 },
        { wch: 12 },
        { wch: 15 },
        { wch: 20 },
        { wch: 20 },
        { wch: 18 },
        { wch: 30 }
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Control Vehicular');
      XLSX.writeFile(wb, 'ControlVehicular.xlsx');
      UI.toast('Excel exportado exitosamente');
    } catch (err) {
      UI.toast('Error al exportar Excel');
    }
  }

  // Función para exportar a PDF
  async function exportControlVehicularPDF() {
    try {
      // Validar que pdfMake esté disponible
      if (!window.pdfMake || !window.pdfMake.createPdf) {
        UI.toast('Las librerías de PDF se están cargando, intenta de nuevo en unos segundos');
        return;
      }

      UI.showOverlay('Generando PDF', 'Por favor espera...');

      const fechaInicio = document.getElementById('cv-fecha-inicio')?.value;
      const fechaFin = document.getElementById('cv-fecha-fin')?.value;
      const cliente = document.getElementById('cv-cliente')?.value;
      const unidad = document.getElementById('cv-unidad')?.value;
      const estado = document.getElementById('cv-estado')?.value;

      let filtered = cvData.filter(row => {
        if (!row.timestamp) return false;

        const rowDate = row.timestamp instanceof Date ? row.timestamp : new Date(row.timestamp);
        const dateStr = rowDate.toISOString().split('T')[0];

        if (fechaInicio && dateStr < fechaInicio) return false;
        if (fechaFin && dateStr > fechaFin) return false;
        if (cliente && row.cliente !== cliente) return false;
        if (unidad && row.unidad !== unidad) return false;
        if (estado && row.estado !== estado) return false;

        return true;
      });

      // Cargar logo
      let logoBase64 = '';
      try {
        const res = await fetch('logo_liberman.png');
        const blob = await res.blob();
        const reader = new FileReader();
        await new Promise((resolve, reject) => {
          reader.onload = () => {
            logoBase64 = reader.result;
            resolve();
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch (e) {
      }

      // Estadísticas
      const total = filtered.length;
      const ingresados = total;
      const pendientes = filtered.filter(r => r.estado === 'ingreso').length;
      const salidas = filtered.filter(r => r.estado === 'salida').length;

      // Crear gráfico estado en canvas
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 300;
      const ctx = canvas.getContext('2d');

      let chartImage = null;
      if (total > 0) {
        const ingresoCount = pendientes;
        const salidaCount = salidas;
        const porcentajeIngreso = ((ingresoCount / total) * 100).toFixed(1);
        const porcentajeSalida = ((salidaCount / total) * 100).toFixed(1);

        const chartEstado = new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: [
              `Pendiente de Salida\n${ingresoCount}\n(${porcentajeIngreso}%)`,
              `Salidas Autorizadas\n${salidaCount}\n(${porcentajeSalida}%)`
            ],
            datasets: [{
              data: [ingresoCount, salidaCount],
              backgroundColor: ['#f59e0b', '#3b82f6'],
              borderColor: ['#d97706', '#1e40af'],
              borderWidth: 3,
              borderRadius: 8
            }]
          },
          options: {
            responsive: false,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: true,
                position: 'bottom',
                labels: {
                  font: { size: 13, weight: 'bold' },
                  padding: 15,
                  usePointStyle: true,
                  pointStyle: 'circle',
                  color: '#2d3748'
                }
              },
              tooltip: {
                enabled: true,
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                padding: 12,
                font: { size: 12 }
              }
            }
          }
        });

        await new Promise(r => setTimeout(r, 900));
        chartImage = canvas.toDataURL('image/png');
        chartEstado.destroy();
      }
      canvas.remove();

      // Tabla de estadísticas mejorada
      const statsTable = {
        headerRows: 1,
        widths: ['25%', '25%', '25%', '25%'],
        body: [
          [
            { text: 'Total Accesos', style: 'statHeader', fillColor: '#3b82f6' },
            { text: 'Ingresados', style: 'statHeader', fillColor: '#10b981' },
            { text: 'Pendientes', style: 'statHeader', fillColor: '#f59e0b' },
            { text: 'Salidas', style: 'statHeader', fillColor: '#8b5cf6' }
          ],
          [
            { text: total.toString(), style: 'statValue', fillColor: '#dbeafe' },
            { text: ingresados.toString(), style: 'statValue', fillColor: '#dcfce7' },
            { text: pendientes.toString(), style: 'statValue', fillColor: '#fef3c7' },
            { text: salidas.toString(), style: 'statValue', fillColor: '#ede9fe' }
          ]
        ],
        layout: {
          hLineWidth: function () { return 1; },
          vLineWidth: function () { return 1; },
          hLineColor: function () { return '#e5e7eb'; },
          vLineColor: function () { return '#e5e7eb'; },
          paddingLeft: function () { return 8; },
          paddingRight: function () { return 8; },
          paddingTop: function () { return 10; },
          paddingBottom: function () { return 10; }
        }
      };

      // Tabla de detalle mejorada
      const detailTableData = filtered.map(row => {
        // Convertir fechaIngreso
        let fechaIngresoStr = '';
        if (row.fechaIngreso) {
          let tsIngreso;
          if (row.fechaIngreso.toDate) {
            tsIngreso = row.fechaIngreso.toDate();
          } else if (row.fechaIngreso instanceof Date) {
            tsIngreso = row.fechaIngreso;
          } else {
            tsIngreso = new Date(row.fechaIngreso);
          }
          if (tsIngreso instanceof Date && !isNaN(tsIngreso)) {
            fechaIngresoStr = tsIngreso.toLocaleString('es-PE');
          }
        }

        // Convertir fechaSalida
        let fechaSalidaStr = '';
        if (row.fechaSalida) {
          let tsSalida;
          if (row.fechaSalida.toDate) {
            tsSalida = row.fechaSalida.toDate();
          } else if (row.fechaSalida instanceof Date) {
            tsSalida = row.fechaSalida;
          } else {
            tsSalida = new Date(row.fechaSalida);
          }
          if (tsSalida instanceof Date && !isNaN(tsSalida)) {
            fechaSalidaStr = tsSalida.toLocaleString('es-PE');
          }
        }

        let estadoColor = '#999';
        let estadoBgColor = '#f3f4f6';
        if (row.estado === 'ingreso') {
          estadoColor = '#d97706';
          estadoBgColor = '#fef3c7';
        }
        if (row.estado === 'salida') {
          estadoColor = '#1e40af';
          estadoBgColor = '#dbeafe';
        }

        return [
          { text: fechaIngresoStr, fontSize: 8, style: 'detailCell' },
          { text: fechaSalidaStr, fontSize: 8, style: 'detailCell' },
          { text: row.placa || '', fontSize: 8, style: 'detailCell', bold: true },
          { text: row.cliente || '', fontSize: 8, style: 'detailCell' },
          { text: row.unidad || '', fontSize: 8, style: 'detailCell' },
          { text: row.puesto || '', fontSize: 8, style: 'detailCell' },
          { text: row.usuario || '', fontSize: 8, style: 'detailCell' },
          { text: row.usuarioSalida || '', fontSize: 8, style: 'detailCell' },
          { text: row.estado?.toUpperCase() || '', fontSize: 8, bold: true, color: estadoColor, fillColor: estadoBgColor, alignment: 'center' },
          { text: row.observaciones || '', fontSize: 8, style: 'detailCell' }
        ];
      });

      const detailTable = {
        headerRows: 1,
        widths: ['9%', '9%', '8%', '11%', '9%', '8%', '9%', '9%', '11%', '17%'],
        body: [
          [
            { text: 'F/H Ingreso', style: 'detailHeader' },
            { text: 'F/H Salida', style: 'detailHeader' },
            { text: 'Placa', style: 'detailHeader' },
            { text: 'Cliente', style: 'detailHeader' },
            { text: 'Unidad', style: 'detailHeader' },
            { text: 'Puesto', style: 'detailHeader' },
            { text: 'Usr Ingreso', style: 'detailHeader' },
            { text: 'Usr Salida', style: 'detailHeader' },
            { text: 'Estado', style: 'detailHeader' },
            { text: 'Observaciones', style: 'detailHeader' }
          ],
          ...detailTableData
        ],
        layout: {
          hLineWidth: function (i) { return i === 0 || i === 1 ? 2 : 0.5; },
          vLineWidth: function () { return 0.5; },
          hLineColor: function () { return '#e5e7eb'; },
          vLineColor: function () { return '#e5e7eb'; },
          fillColor: function (i) {
            if (i === 0) return '#2c5aa0';
            return i % 2 === 0 ? '#f9fafb' : 'white';
          },
          paddingLeft: function () { return 4; },
          paddingRight: function () { return 4; },
          paddingTop: function () { return 5; },
          paddingBottom: function () { return 5; }
        }
      };

      // Construir documento PDF
      const docDef = {
        pageSize: 'A4',
        pageMargins: [40, 80, 40, 40],
        header: function (currentPage) {
          if (currentPage === 1) {
            return {
              columns: [
                logoBase64 ? {
                  image: logoBase64,
                  width: 70,
                  height: 70
                } : { text: '' },
                {
                  stack: [
                    {
                      text: 'CONTROL VEHICULAR',
                      fontSize: 20,
                      bold: true,
                      color: '#2c5aa0',
                      alignment: 'center'
                    },
                    {
                      text: 'Reporte de Accesos',
                      fontSize: 12,
                      color: '#64748b',
                      alignment: 'center',
                      margin: [0, 5, 0, 0]
                    }
                  ]
                },
                {
                  text: '',
                  width: 70
                }
              ],
              margin: [40, 15, 40, 20]
            };
          }
        },
        footer: function (currentPage, pageCount) {
          return {
            columns: [
              {
                text: `${new Date().toLocaleDateString('es-PE')} ${new Date().toLocaleTimeString('es-PE')}`,
                fontSize: 9,
                color: '#999'
              },
              {
                text: `Página ${currentPage} de ${pageCount}`,
                alignment: 'right',
                fontSize: 9,
                color: '#999'
              }
            ],
            margin: [40, 0, 40, 15]
          };
        },
        content: [
          // Sección de estadísticas
          {
            stack: [
              {
                text: '📊 RESUMEN DE ESTADÍSTICAS',
                style: 'sectionTitle',
                margin: [0, 0, 0, 12]
              },
              {
                table: statsTable,
                margin: [0, 0, 0, 20]
              }
            ]
          },

          // Sección de gráfico y distribución
          {
            stack: [
              {
                text: '🥧 DISTRIBUCIÓN POR ESTADO',
                style: 'sectionTitle',
                margin: [0, 0, 0, 12]
              },
              chartImage ? {
                image: chartImage,
                width: 280,
                height: 210,
                alignment: 'center'
              } : {
                text: 'No hay datos para generar gráfico',
                alignment: 'center',
                color: '#cbd5e0',
                italics: true,
                margin: [0, 20, 0, 20]
              }
            ],
            margin: [0, 0, 0, 25]
          },

          // Sección de detalle
          {
            stack: [
              {
                text: '📋 DETALLE DE ACCESOS VEHICULARES',
                style: 'sectionTitle',
                margin: [0, 0, 0, 12]
              },
              {
                table: detailTable,
                margin: [0, 0, 0, 15]
              }
            ]
          },

          // Resumen final
          {
            stack: [
              {
                text: `Total de registros reportados: ${total}`,
                fontSize: 11,
                bold: true,
                color: '#2c5aa0',
                margin: [0, 15, 0, 5]
              },
              {
                text: `Generado: ${new Date().toLocaleDateString('es-PE')} a las ${new Date().toLocaleTimeString('es-PE')}`,
                fontSize: 9,
                color: '#999'
              }
            ]
          }
        ],
        styles: {
          sectionTitle: {
            fontSize: 13,
            bold: true,
            color: '#2c5aa0',
            border: [false, false, false, true],
            borderColor: '#cbd5e0',
            paddingBottom: 8
          },
          statHeader: {
            fontSize: 11,
            bold: true,
            color: 'white',
            alignment: 'center'
          },
          statValue: {
            fontSize: 16,
            bold: true,
            color: '#2c5aa0',
            alignment: 'center'
          },
          detailHeader: {
            fontSize: 9,
            bold: true,
            color: 'white',
            alignment: 'center',
            fillColor: '#2c5aa0'
          },
          detailCell: {
            alignment: 'left'
          }
        }
      };

      UI.hideOverlay();
      window.pdfMake.createPdf(docDef).download(`ControlVehicular_${new Date().getTime()}.pdf`);
      UI.toast('✅ PDF exportado correctamente');

    } catch (err) {
      UI.hideOverlay();
      UI.toast('❌ Error al exportar PDF');
    }
  }

  // ============================================================================
  // INCIDENCIA QR (RONDA MANUAL)
  // ============================================================================
  let iqrCharts = {
    fecha: null,
    estado: null,
    cliente: null,
    unidad: null
  };
  let iqrAllData = [];
  let iqrChoices = {
    cliente: null,
    unidad: null
  };

  async function initIncidenciaQR() {
    const cfg = { searchEnabled: true, itemSelectText: 'Seleccionar', placeholder: true, allowHTML: false };

    // Solo inicializar Choices si no están ya inicializados
    if (window.Choices && !iqrChoices.cliente) {
      try {
        iqrChoices.cliente = new Choices('#iqr-cliente', cfg);
        iqrChoices.unidad = new Choices('#iqr-unidad', cfg);
      } catch (e) {
      }
    }

    // Agregar listener al cliente para cargar unidades desde CLIENTE_UNIDAD
    const clienteSelect = document.getElementById('iqr-cliente');
    if (clienteSelect) {
      clienteSelect.removeEventListener('change', handleIQRClienteChange);
      clienteSelect.addEventListener('change', handleIQRClienteChange);
    }

    // Agregar listeners (una sola vez)
    const btnAplicar = document.getElementById('iqr-btn-aplicar');
    const btnLimpiar = document.getElementById('iqr-btn-limpiar');
    const btnExcel = document.getElementById('iqr-btn-excel');
    const btnPdf = document.getElementById('iqr-btn-pdf');

    // Remover listeners anteriores para evitar duplicados
    if (btnAplicar) {
      btnAplicar.removeEventListener('click', loadAndRenderIncidenciaQR);
      btnAplicar.addEventListener('click', async () => {
        await loadAndRenderIncidenciaQR();
      });
    }

    if (btnLimpiar) {
      btnLimpiar.removeEventListener('click', limpiarFiltrosIQR);
      btnLimpiar.addEventListener('click', limpiarFiltrosIQR);
    }

    if (btnExcel) {
      btnExcel.removeEventListener('click', exportIncidenciaQRExcel);
      btnExcel.addEventListener('click', exportIncidenciaQRExcel);
    }

    if (btnPdf) {
      btnPdf.removeEventListener('click', exportIncidenciaQRPDF);
      btnPdf.addEventListener('click', exportIncidenciaQRPDF);
    }

    // Cargar filtros iniciales (Master Data)
    await initIQRFilters();

    // Cargar datos iniciales
    await loadAndRenderIncidenciaQR();
  }

  async function handleIQRClienteChange(clientOverride) {
    const clienteSelect = document.getElementById('iqr-cliente');
    const unidadSelect = document.getElementById('iqr-unidad');

    // Obtener valor (prioridad: override > select.value)
    // Obtener valor (prioridad: override es string > select.value)
    let clienteValue = null;
    if (typeof clientOverride === 'string') {
      clienteValue = clientOverride;
    } else if (clienteSelect) {
      clienteValue = clienteSelect.value;
    }

    if (clienteValue && clienteValue !== 'Todos') {
      let unidades = [];
      try {
        // Intentar obtener unidades (con fallback si la función global falla)
        if (typeof getUnidadesFromClienteUnidad === 'function') {
          unidades = await getUnidadesFromClienteUnidad(clienteValue);
        }

        // Fallback manual si está vacío o no existe función
        if (!unidades || unidades.length === 0) {
          console.log('[IQR] Usando fallback manual para unidades de:', clienteValue);
          const doc = await db.collection('CLIENTE_UNIDAD').doc(clienteValue).get();
          if (doc.exists) {
            const d = doc.data();
            unidades = d.unidades || d.UNIDADES || [];
            if (d.UNIDADES && Array.isArray(d.UNIDADES)) {
              // Merge if both exist
              unidades = [...new Set([...unidades, ...d.UNIDADES])];
            }
            // Nota: Si están en subcolección, este fallback simple no lo cubre, 
            // pero getUnidadesFromClienteUnidad debería cubrirlo.
            // Asumimos array simple para la mayoría.
          }
        }
      } catch (e) {
        console.error('[IQR] Error obteniendo unidades:', e);
      }

      // ✅ FILTRAR: userType === 'CLIENTE'
      const ac = window.accessControl;
      if (ac?.userType === 'CLIENTE') {
        const userAssignedUnits = ac.getUnidadesAsignadas();
        if (userAssignedUnits && userAssignedUnits.length > 0) {
          unidades = unidades.filter(u => userAssignedUnits.includes(u));
        }
      }

      unidades.sort();

      if (iqrChoices.unidad) {
        try {
          iqrChoices.unidad.clearStore();
          // Reset styles
          const container = document.getElementById('iqr-unidad')?.closest('.choices');
          if (container) {
            container.style.opacity = '1';
            container.style.pointerEvents = 'auto';
            container.style.backgroundColor = '';
          }

          if (ac && ac.userType === 'CLIENTE' && unidades.length === 1) {
            const u = unidades[0];
            iqrChoices.unidad.setChoices(
              [{ value: u, label: u, selected: true }],
              'value', 'label', true
            );
            iqrChoices.unidad.disable();

            if (container) {
              container.style.opacity = '0.6';
              container.style.pointerEvents = 'none';
              container.style.backgroundColor = '#e2e8f0';
            }
          } else {
            // Mostrar todas las disponibles (filtradas)
            const choices = [{ value: 'Todas', label: 'Todas', selected: true }];
            unidades.forEach(u => choices.push({ value: u, label: u }));

            iqrChoices.unidad.setChoices(choices, 'value', 'label', true);
            iqrChoices.unidad.enable();
          }
        } catch (e) {
          console.error('Error actualizando unidades en IQR:', e);
        }
      }
    } else {
      // Caso "Todos" (o vacío)
      if (iqrChoices.unidad) {
        try {
          iqrChoices.unidad.clearStore();
          iqrChoices.unidad.setChoices(
            [{ value: 'Todas', label: 'Todas', selected: true }],
            'value', 'label', true
          );
          iqrChoices.unidad.enable();
        } catch (e) {
          console.error('Error reset unidades IQR:', e);
        }
      }
    }
  }

  function limpiarFiltrosIQR() {
    document.getElementById('iqr-fecha-inicio').value = '';
    document.getElementById('iqr-fecha-fin').value = '';
    if (iqrChoices.cliente) {
      try {
        iqrChoices.cliente.setChoiceByValue('Todos');
      } catch (e) {
        // Si falla, simplemente continuar
        const select = document.getElementById('iqr-cliente');
        if (select) select.value = 'Todos';
      }
    }
    if (iqrChoices.unidad) {
      try {
        iqrChoices.unidad.setChoiceByValue('Todos');
      } catch (e) {
        const select = document.getElementById('iqr-unidad');
        if (select) select.value = 'Todas';
      }
    }
    loadAndRenderIncidenciaQR();
  }

  async function loadAndRenderIncidenciaQR() {
    UI.showOverlay('Cargando Incidencias QR…', 'Consultando RONDA_MANUAL');
    try {
      const clienteSelect = document.getElementById('iqr-cliente');
      const clienteVal = clienteSelect?.value;
      const unidadSelect = document.getElementById('iqr-unidad');
      const unidadVal = unidadSelect?.value;

      let query = getQueryWithClienteFilter('RONDA_MANUAL');

      // Aplicar filtro de cliente si está seleccionado
      if (clienteVal && clienteVal !== 'Todos') {
        query = query.where('cliente', '==', clienteVal);
      }

      // Aplicar filtro de unidad si está seleccionado
      if (unidadVal && unidadVal !== 'Todas') {
        query = query.where('unidad', '==', unidadVal);
      }

      // NOTA: Se ha removido el orderBy('timestamp') para evitar el error de índice compuesto inexistente de Firestore.
      // El ordenamiento se realizará en memoria después de obtener los datos.

      query = query.limit(1000);

      const snapshot = await query.get();

      iqrAllData = snapshot.docs.map(doc => {
        const data = doc.data();

        // Parsear fecha - puede venir en varios formatos
        let fecha = new Date();
        const parseRobustDate = (val) => {
          if (!val) return null;
          if (val.toDate && typeof val.toDate === 'function') return val.toDate();
          if (val instanceof Date) return val;
          if (typeof val === 'number') return new Date(val);
          if (typeof val === 'string') {
            // Check for DD/MM/YYYY format specifically (with slashes)
            if (val.includes('/')) {
              const parts = val.split(/[/\s,:-]+/);
              if (parts.length >= 3) {
                const day = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1;
                const year = parseInt(parts[2], 10);
                const hour = parts.length > 3 ? parseInt(parts[3], 10) : 0;
                const min = parts.length > 4 ? parseInt(parts[4], 10) : 0;
                const d = new Date(year, month, day, hour, min);
                if (!isNaN(d.getTime())) return d;
              }
            }
            // Fallback to ISO or other formats
            let d = new Date(val);
            if (!isNaN(d.getTime())) return d;
          }
          return null;
        };

        if (data.fechaHora) {
          fecha = parseRobustDate(data.fechaHora) || new Date();
        } else if (data.timestamp) {
          fecha = parseRobustDate(data.timestamp) || new Date();
        }

        return {
          id: doc.id,
          ...data,
          fecha: fecha,
        };
      });
      // Ya no repoblamos filtros aquí para evitar resetear la selección del usuario.
      // Los filtros se inicializan una vez en initIQRFilters() y se actualizan por eventos (change).
      // populateIncidenciaQRFilters(); 

      // Renderizar todo
      renderIncidenciaQR();
    } catch (e) {
      UI.toast('Error al cargar datos de Incidencia QR: ' + e.message);
    } finally {
      UI.hideOverlay();
    }
  }

  async function initIQRFilters() {
    const clienteSelect = document.getElementById('iqr-cliente');
    const unidadSelect = document.getElementById('iqr-unidad');

    if (!clienteSelect) return;

    try {
      // Bloquear si es usuario CLIENTE
      if (window.accessControl?.userType === 'CLIENTE') {
        const clienteAsignado = window.accessControl.clienteAsignado;

        if (iqrChoices.cliente) {
          iqrChoices.cliente.clearStore();
          iqrChoices.cliente.setChoices(
            [{ value: clienteAsignado, label: clienteAsignado, selected: true, disabled: true }],
            'value', 'label', true
          );
          iqrChoices.cliente.disable();
        } else {
          clienteSelect.innerHTML = `<option value="${clienteAsignado}">${clienteAsignado}</option>`;
          clienteSelect.disabled = true;
        }
        // Cargar unidades iniciales para el cliente (pasando valor explícito para asegurar carga)
        await handleIQRClienteChange(clienteAsignado);
      } else {
        // ADMIN/SUPERVISOR: Cargar todos desde CLIENTE_UNIDAD (Master Data)
        const snapshot = await db.collection('CLIENTE_UNIDAD').get();
        const clientes = snapshot.docs.map(doc => doc.id).sort();

        if (iqrChoices.cliente) {
          iqrChoices.cliente.clearStore();
          // Preservar selección si existe (aunque en init suele ser vacío/Todos)
          const current = clienteSelect.value;
          const choices = [{ value: 'Todos', label: 'Todos', selected: !current || current === 'Todos' }];

          clientes.forEach(c => choices.push({ value: c, label: c, selected: c === current }));
          iqrChoices.cliente.setChoices(choices, 'value', 'label', true);
          iqrChoices.cliente.enable();
        } else {
          clienteSelect.innerHTML = '<option value="Todos">Todos</option>' +
            clientes.map(c => `<option value="${c}">${c}</option>`).join('');
        }
      }

      // Inicializar Unidades a "Todas" si está vacío
      if (iqrChoices.unidad && (!unidadSelect.value)) {
        iqrChoices.unidad.setChoices([{ value: 'Todas', label: 'Todas', selected: true }], 'value', 'label', true);
      }

    } catch (e) {
      console.error("Error initIQRFilters:", e);
    }
  }

  function renderIncidenciaQR() {
    const filteredData = getFilteredIncidenciaQRData();
    updateIncidenciaQRStats(filteredData);
    renderIncidenciaQRCharts(filteredData);
    renderIncidenciaQRTable(filteredData);
  }

  function getFilteredIncidenciaQRData() {
    let data = [...iqrAllData];
    // Filtro de cliente - SOLO si se seleccionó algo diferente a "Todos"
    const clienteSelect = document.getElementById('iqr-cliente');
    const clienteVal = clienteSelect?.value;
    if (clienteVal && clienteVal !== 'Todos' && clienteVal.trim() !== '') {
      const beforeCount = data.length;
      data = data.filter(d => d.cliente && d.cliente.trim() === clienteVal.trim());
    }

    // Filtro de unidad - SOLO si se seleccionó algo diferente a "Todas"
    const unidadSelect = document.getElementById('iqr-unidad');
    const unidadVal = unidadSelect?.value;
    if (unidadVal && unidadVal !== 'Todas' && unidadVal.trim() !== '') {
      const beforeCount = data.length;
      data = data.filter(d => d.unidad && d.unidad.trim() === unidadVal.trim());
    }

    // Filtro de fechas usando timestamp
    const fechaInicio = document.getElementById('iqr-fecha-inicio')?.value;
    const fechaFin = document.getElementById('iqr-fecha-fin')?.value;
    if (fechaInicio) {
      const start = new Date(fechaInicio);
      start.setHours(0, 0, 0, 0);
      const beforeCount = data.length;
      data = data.filter(d => {
        let ts = d.timestamp;
        if (ts && ts.toDate) ts = ts.toDate();
        else if (typeof ts === 'string') ts = new Date(ts);
        return ts >= start;
      });
    }
    if (fechaFin) {
      const end = new Date(fechaFin);
      end.setHours(23, 59, 59, 999);
      const beforeCount = data.length;
      data = data.filter(d => {
        let ts = d.timestamp;
        if (ts && ts.toDate) ts = ts.toDate();
        else if (typeof ts === 'string') ts = new Date(ts);
        return ts <= end;
      });
    }

    // ORDENAR POR TIMESTAMP: MÁS RECIENTE PRIMERO (descendente)
    data.sort((a, b) => {
      let tsA = a.fecha || new Date(0);
      let tsB = b.fecha || new Date(0);
      return tsB - tsA; // Descendente: más reciente primero
    });

    if (data.length > 0);
    return data;
  }

  function updateIncidenciaQRStats(data) {
    const total = data.length;
    document.getElementById('iqr-total').textContent = total;
  }

  function renderIncidenciaQRCharts(data) {
    // Gráfico de Incidencias por Fecha (usando timestamp)
    const byDate = {};
    data.forEach(d => {
      // Use normalized 'fecha' from loading step
      let ts = d.fecha instanceof Date ? d.fecha : new Date();
      // Safety check just in case
      if (isNaN(ts.getTime())) ts = new Date();

      const dateKey = ts.toISOString().split('T')[0];
      byDate[dateKey] = (byDate[dateKey] || 0) + 1;
    });
    const sortedDates = Object.keys(byDate).sort();
    // Convertir fechas a formato dd/mm/yyyy para mostrar en el gráfico
    const formattedDates = sortedDates.map(d => {
      const [year, month, day] = d.split('-');
      return `${day}/${month}/${year}`;
    });
    if (iqrCharts.fecha) iqrCharts.fecha.destroy();
    const ctxFecha = document.getElementById('iqr-chart-fecha')?.getContext('2d');
    if (ctxFecha) {
      iqrCharts.fecha = new Chart(ctxFecha, {
        type: 'line',
        data: {
          labels: formattedDates,
          datasets: [{
            label: 'Incidencias por Fecha',
            data: sortedDates.map(d => byDate[d]),
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            tension: 0.4,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } }
        }
      });
    }

    // Gráfico de Cantidad de Incidencias por Punto (nombrePunto)
    const byPunto = {};
    data.forEach(d => {
      const punto = d.nombrePunto || 'Sin Punto';
      byPunto[punto] = (byPunto[punto] || 0) + 1;
    });
    if (iqrCharts.estado) iqrCharts.estado.destroy();
    const ctxEstado = document.getElementById('iqr-chart-estado')?.getContext('2d');
    if (ctxEstado) {
      iqrCharts.estado = new Chart(ctxEstado, {
        type: 'doughnut',
        data: {
          labels: Object.keys(byPunto),
          datasets: [{
            data: Object.values(byPunto),
            backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#f97316', '#06b6d4']
          }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }

    // Gráfico de Cantidad de Registros por Usuario
    const byUsuario = {};
    data.forEach(d => {
      let usuario = d.usuario || d.user || d.nombreUsuario || d.registradoPor;
      if (!usuario && (d.uid || d.userId || d.idUsuario)) {
        const uid = d.uid || d.userId || d.idUsuario;
        const u = cachedUsers.find(x => x.id === uid);
        if (u) usuario = `${u.NOMBRES} ${u.APELLIDOS}`;
      }
      usuario = usuario || 'Sin usuario';
      byUsuario[usuario] = (byUsuario[usuario] || 0) + 1;
    });
    if (iqrCharts.cliente) iqrCharts.cliente.destroy();
    const ctxCliente = document.getElementById('iqr-chart-cliente')?.getContext('2d');
    if (ctxCliente) {
      iqrCharts.cliente = new Chart(ctxCliente, {
        type: 'bar',
        data: {
          labels: Object.keys(byUsuario),
          datasets: [{
            label: 'Cantidad de Registros por Usuario',
            data: Object.values(byUsuario),
            backgroundColor: '#3b82f6'
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y' }
      });
    }

    // Gráfico de Incidencias por Unidad
    const byUnidad = {};
    data.forEach(d => {
      const unidad = d.unidad || 'Sin unidad';
      byUnidad[unidad] = (byUnidad[unidad] || 0) + 1;
    });
    if (iqrCharts.unidad) iqrCharts.unidad.destroy();
    const ctxUnidad = document.getElementById('iqr-chart-unidad')?.getContext('2d');
    if (ctxUnidad) {
      iqrCharts.unidad = new Chart(ctxUnidad, {
        type: 'bar',
        data: {
          labels: Object.keys(byUnidad),
          datasets: [{
            label: 'Incidencias por Unidad',
            data: Object.values(byUnidad),
            backgroundColor: '#10b981'
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y' }
      });
    }
  }

  function renderChart(existingChart, canvasId, config, setChart) {
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;

    if (existingChart) existingChart.destroy();
    const newChart = new Chart(ctx, config);
    setChart(newChart);
  }

  function renderIncidenciaQRTable(data) {
    const tbody = document.getElementById('iqr-tbody');
    if (!tbody) {
      return;
    }

    tbody.innerHTML = '';
    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; padding: 20px; color: #a0aec0;">No hay datos para mostrar</td></tr>';
      return;
    }

    data.forEach((d, index) => {
      const fila = document.createElement('tr');

      // Parsear timestamp - FORMATO: dd/mm/yyyy hh:mm
      let timestampStr = '-';
      if (d.timestamp) {
        let ts = d.timestamp;
        if (ts.toDate) {
          ts = ts.toDate();
        } else if (typeof ts === 'string') {
          ts = new Date(ts);
        }
        if (ts instanceof Date && !Number.isNaN(ts.getTime())) {
          const day = String(ts.getDate()).padStart(2, '0');
          const month = String(ts.getMonth() + 1).padStart(2, '0');
          const year = ts.getFullYear();
          const hours = String(ts.getHours()).padStart(2, '0');
          const minutes = String(ts.getMinutes()).padStart(2, '0');
          timestampStr = `${day}/${month}/${year} ${hours}:${minutes}`;
        }
      } else if (d.fecha instanceof Date) {
        const day = String(d.fecha.getDate()).padStart(2, '0');
        const month = String(d.fecha.getMonth() + 1).padStart(2, '0');
        const year = d.fecha.getFullYear();
        const hours = String(d.fecha.getHours()).padStart(2, '0');
        const minutes = String(d.fecha.getMinutes()).padStart(2, '0');
        timestampStr = `${day}/${month}/${year} ${hours}:${minutes}`;
      } else if (typeof d.fechaHora === 'string') {
        timestampStr = d.fechaHora;
      }

      // Determinar estado - FORZAR A COMPLETADA (Solicitud usuario)
      const tieneRespuestas = true; // d.respuestas && Object.keys(d.respuestas).length > 0;
      const estadoClass = 'iqr-estado-completado'; // tieneRespuestas ? 'iqr-estado-completado' : 'iqr-estado-pendiente';
      const estadoText = '✓ Completada'; // tieneRespuestas ? '✓ Completada' : '⏳ Pendiente';

      // Construir QR
      const codigoQR = d.codigoQRleido || d.qrId || 'N/A';

      // Obtener primera pregunta y respuesta si existen
      let pregunta = '-';
      let respuesta = '-';

      if (d.preguntas && typeof d.preguntas === 'object') {
        const preguntasKeys = Object.keys(d.preguntas);
        if (preguntasKeys.length > 0) {
          pregunta = d.preguntas[preguntasKeys[0]];
        }
      }

      if (d.respuestas && typeof d.respuestas === 'object') {
        const respuestasKeys = Object.keys(d.respuestas);
        if (respuestasKeys.length > 0) {
          respuesta = d.respuestas[respuestasKeys[0]];
        }
      }

      const fotoCell = d.foto ? `<img src="${d.foto}" alt="Foto" style="max-width: 40px; cursor: pointer;" onclick="showImageModal('${d.foto}')">` : '-';

      // PUESTO: obtener el puesto del registro
      const puestoDisplay = d.puesto || '-';

      // PUNTO: obtener el nombrePunto
      const puntoDisplay = d.nombrePunto || '-';

      // USUARIO: Resolver nombre de usuario (sin fallback a nombrePunto)
      let usuarioDisplay = d.usuario || d.user || d.nombreUsuario || d.registradoPor;
      if (!usuarioDisplay && (d.uid || d.userId || d.idUsuario)) {
        if (typeof cachedUsers !== 'undefined') {
          const u = cachedUsers.find(x => x.id === (d.uid || d.userId || d.idUsuario));
          if (u) usuarioDisplay = `${u.NOMBRES} ${u.APELLIDOS}`;
        }
      }
      usuarioDisplay = usuarioDisplay || '-';

      fila.innerHTML = `
        <td>${timestampStr}</td>
        <td>${usuarioDisplay}</td>
        <td>${d.cliente || '-'}</td>
        <td>${d.unidad || '-'}</td>
        <td><span class="iqr-badge">${codigoQR}</span></td>
        <td>${pregunta}</td>
        <td>${respuesta}</td>
        <td>${puestoDisplay}</td>
        <td>${puntoDisplay}</td>
        <td><span class="${estadoClass}">${estadoText}</span></td>
        <td class="iqr-foto-cell">${fotoCell}</td>
      `;
      tbody.appendChild(fila);

      if (index === 0) {
      }
    });
  }

  async function exportIncidenciaQRExcel() {
    try {
      UI.showOverlay('Exportando Excel…', 'Preparando documento...');
      const data = getFilteredIncidenciaQRData();

      // Preparar datos para Excel
      const headers = ['Fecha/Hora', 'Usuario', 'Cliente', 'Unidad', 'QR', 'Pregunta', 'Respuesta', 'Puesto', 'Punto de Control', 'Estado'];
      const excelData = [headers];

      data.forEach(d => {
        // Parsear fecha robustamente
        let fechaStr = '';
        const fechaObj = d.fecha instanceof Date ? d.fecha : new Date(d.fechaHora || d.timestamp || 0);
        if (!isNaN(fechaObj.getTime())) {
          fechaStr = fechaObj.toLocaleString('es-PE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        }

        // Obtener primera pregunta y respuesta
        let pregunta = '';
        let respuesta = '';

        if (d.preguntas && typeof d.preguntas === 'object') {
          const preguntasKeys = Object.keys(d.preguntas);
          if (preguntasKeys.length > 0) {
            pregunta = d.preguntas[preguntasKeys[0]];
          }
        }

        if (d.respuestas && typeof d.respuestas === 'object') {
          const respuestasKeys = Object.keys(d.respuestas);
          if (respuestasKeys.length > 0) {
            respuesta = d.respuestas[respuestasKeys[0]];
          }
        }

        const codigoQR = d.codigoQRleido || d.qrId || '';
        const tieneRespuestas = d.respuestas && Object.keys(d.respuestas).length > 0;
        const estado = tieneRespuestas ? 'Completada' : 'Pendiente';

        // Resolver usuario para Excel
        let usuarioDisplay = d.usuario || d.user || d.nombreUsuario || d.registradoPor;
        if (!usuarioDisplay && (d.uid || d.userId || d.idUsuario)) {
          if (typeof cachedUsers !== 'undefined') {
            const u = cachedUsers.find(x => x.id === (d.uid || d.userId || d.idUsuario));
            if (u) usuarioDisplay = `${u.NOMBRES} ${u.APELLIDOS}`;
          }
        }
        usuarioDisplay = usuarioDisplay || '';

        excelData.push([
          fechaStr,
          usuarioDisplay,
          d.cliente || '',
          d.unidad || '',
          codigoQR,
          pregunta,
          respuesta,
          d.puesto || '',
          d.nombrePunto || '',
          estado
        ]);
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(excelData);

      // Estilos básicos
      const wscols = [
        { wch: 20 }, // Fecha
        { wch: 25 }, // Usuario
        { wch: 20 }, // Cliente
        { wch: 20 }, // Unidad
        { wch: 15 }, // QR
        { wch: 30 }, // Pregunta
        { wch: 30 }, // Respuesta
        { wch: 20 }, // Puesto
        { wch: 20 }, // Punto
        { wch: 15 }  // Estado
      ];
      ws['!cols'] = wscols;

      XLSX.utils.book_append_sheet(wb, ws, 'Incidencias QR');
      XLSX.writeFile(wb, `IncidenciaQR_${new Date().getTime()}.xlsx`);

      UI.hideOverlay();
      UI.toast('✅ Excel exportado correctamente');
    } catch (err) {
      console.error(err);
      UI.hideOverlay();
      UI.toast('❌ Error al exportar Excel: ' + err.message);
    }
  }

  async function exportIncidenciaQRPDF() {
    try {
      UI.showOverlay('Exportando PDF…', 'Preparando documento...');
      const data = getFilteredIncidenciaQRData();

      // Cargar logo
      let logoBase64 = null;
      try {
        const logoResponse = await fetch('logo_liberman.png');
        if (logoResponse.ok) {
          const logoBlob = await logoResponse.blob();
          logoBase64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(logoBlob);
          });
        }
      } catch (e) {
        console.warn('No se pudo cargar el logo para PDF', e);
      }

      const tableBody = [];

      // Headers de la tabla (SIN FOTO)
      const headers = [
        { text: 'FECHA', style: 'tableHeader' },
        { text: 'USUARIO', style: 'tableHeader' },
        { text: 'CLIENTE', style: 'tableHeader' },
        { text: 'UNIDAD', style: 'tableHeader' },
        { text: 'PUNTO CONTROL', style: 'tableHeader' },
        { text: 'ESTADO', style: 'tableHeader' }
      ];
      tableBody.push(headers);

      data.forEach(d => {
        // Parsear fecha
        let fechaStr = '';
        const fechaObj = d.fecha instanceof Date ? d.fecha : new Date(d.fechaHora || d.timestamp || 0);
        if (!isNaN(fechaObj.getTime())) {
          fechaStr = fechaObj.toLocaleString('es-PE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        }

        // const tieneRespuestas = d.respuestas && Object.keys(d.respuestas).length > 0;
        const estado = 'Completada'; // tieneRespuestas ? 'Completada' : 'Pendiente';
        const estadoColor = '#10b981'; // tieneRespuestas ? '#10b981' : '#f59e0b';

        // Resolver usuario para PDF
        let usuarioDisplay = d.usuario || d.user || d.nombreUsuario || d.registradoPor;
        if (!usuarioDisplay && (d.uid || d.userId || d.idUsuario)) {
          if (typeof cachedUsers !== 'undefined') {
            const u = cachedUsers.find(x => x.id === (d.uid || d.userId || d.idUsuario));
            if (u) usuarioDisplay = `${u.NOMBRES} ${u.APELLIDOS}`;
          }
        }
        usuarioDisplay = usuarioDisplay || '-';

        tableBody.push([
          { text: fechaStr, fontSize: 9 },
          { text: usuarioDisplay, fontSize: 9 },
          { text: d.cliente || '-', fontSize: 9 },
          { text: d.unidad || '-', fontSize: 9 },
          { text: d.nombrePunto || '-', fontSize: 9 },
          { text: estado, fontSize: 9, bold: true, color: estadoColor }
        ]);
      });

      const docDefinition = {
        pageSize: 'A4',
        pageOrientation: 'landscape', // Horizontal para mejor visualización
        pageMargins: [30, 80, 30, 40], // Margen superior amplio para logo
        header: {
          margin: [30, 20, 30, 0],
          columns: [
            logoBase64 ? { image: logoBase64, width: 60 } : { text: '' },
            {
              stack: [
                { text: 'LIDER CONTROL', style: 'headerTitle', alignment: 'center' },
                { text: 'Reporte de Rondas Manuales (Incidencia QR)', style: 'headerSubtitle', alignment: 'center' }
              ],
              width: '*'
            },
            {
              text: `Generado: ${new Date().toLocaleDateString('es-PE')}`,
              alignment: 'right',
              fontSize: 9,
              margin: [0, 10, 0, 0]
            }
          ]
        },
        content: [
          {
            table: {
              headerRows: 1,
              widths: ['15%', '20%', '15%', '15%', '20%', '15%'],
              body: tableBody
            },
            layout: {
              fillColor: function (i, node) { return (i === 0) ? '#2c5aa0' : (i % 2 === 0) ? '#f3f4f6' : null; },
              hLineWidth: function (i, node) { return (i === 0 || i === node.table.body.length) ? 1 : 0.5; },
              vLineWidth: function (i, node) { return 0.5; },
              hLineColor: function (i, node) { return '#e5e7eb'; },
              vLineColor: function (i, node) { return '#e5e7eb'; }
            }
          }
        ],
        styles: {
          headerTitle: { fontSize: 18, bold: true, color: '#1e3a8a' },
          headerSubtitle: { fontSize: 14, color: '#4b5563', margin: [0, 5, 0, 0] },
          tableHeader: { bold: true, fontSize: 10, color: 'white', alignment: 'center' }
        }
      };

      pdfMake.createPdf(docDefinition).download(`Reporte_IncidenciaQR_${new Date().getTime()}.pdf`);
      UI.hideOverlay();
      UI.toast('✅ PDF exportado correctamente');

    } catch (e) {
      console.error(e);
      UI.hideOverlay();
      UI.toast('❌ Error al exportar PDF: ' + e.message);
    }
  }

  // Cuando se selecciona Incidencia QR, cargar datos
  const iqrBtn = document.querySelector('[data-target="kpi-incidencia-qr"]');
  if (iqrBtn) {
    iqrBtn.addEventListener('click', initIncidenciaQR);
  }

  // Cuando se selecciona Control Vehicular, cargar datos
  const cvBtn = document.querySelector('[data-target="kpi-control-vehicular"]');
  if (cvBtn) {
    cvBtn.addEventListener('click', () => {
      loadControlVehicularFilters();
      loadControlVehicularData();
    });
  }

  // Cuando se selecciona H&M, cargar datos
  // Cuando se selecciona H&M, cargar datos
  const hmBtn = document.querySelector('[data-target="kpi-incidencias-hm"]');

  function checkHmAccess() {
    // 1. Si accessControl no está definido aún, retornamos false (seguro)
    if (typeof accessControl === 'undefined' || !accessControl) return false;

    // 2. ADMIN y SUPERVISOR siempre tienen acceso
    if (accessControl.userType === 'ADMIN' || accessControl.userType === 'SUPERVISOR') return true;

    // 3. Cliente HM tiene acceso
    if (accessControl.userType === 'CLIENTE') {
      const cli = (accessControl.clienteAsignado || '').toUpperCase().replace(/\s+/g, '');
      // Permitir 'HM', 'H&M'
      return cli === 'HM' || cli === 'H&M';
    }

    // 4. Cualquier otro rol (Supervisores, Agentes sin rol admin, otros clientes) -> Denegado
    return false;
  }

  function updateHmTabVisibility() {
    if (!hmBtn) return;

    if (checkHmAccess()) {
      // Usuario autorizado: mostrar
      hmBtn.style.display = '';
      hmBtn.classList.remove('hidden');
    } else {
      // Usuario no autorizado: ocultar
      hmBtn.style.display = 'none';
      hmBtn.classList.add('hidden');
    }
  }

  // Verificar visibilidad periódicamente para manejar la carga asíncrona de auth
  setInterval(updateHmTabVisibility, 1500);

  if (hmBtn) {
    hmBtn.addEventListener('click', (e) => {
      if (!checkHmAccess()) {
        e.preventDefault();
        e.stopPropagation();
        UI.showError('Acceso Restringido', 'Solo administradores o personal de H&M pueden ver este dashboard.');
        return;
      }
      initIncidenciasHmDashboard();
    });
  }

  // ============================================================================
  // DASHBOARD INCIDENCIAS H&M
  // ============================================================================
  let hmCharts = {};
  let hmCachedData = [];
  let hmLogoBase64 = null;

  function initIncidenciasHmDashboard() {
    // Fix: daterangepicker uses jQuery
    const $datePicker = $('#hm-filtro-fecha');
    const refreshBtn = document.getElementById('hm-btn-refresh');

    if ($datePicker.length) {
      // Default: last 30 days
      const start = moment().subtract(29, 'days');
      const end = moment();
      // Initialize only if not already initialized
      if (!$datePicker.data('daterangepicker')) {
        $datePicker.daterangepicker({
          startDate: start,
          endDate: end,
          locale: { format: 'DD/MM/YYYY', applyLabel: 'Aplicar', cancelLabel: 'Cancelar' }
        });
        $datePicker.val(`${start.format('DD/MM/YYYY')} - ${end.format('DD/MM/YYYY')}`);
      }
    }

    refreshBtn?.addEventListener('click', queryAndRenderHmDashboard);

    // Export Buttons
    document.getElementById('hm-btn-excel')?.addEventListener('click', exportHmExcel);
    document.getElementById('hm-btn-pdf')?.addEventListener('click', printHmPdf);

    // Load Logo for PDF
    loadHmLogoBase64();

    // Initial load
    queryAndRenderHmDashboard();
  }

  async function queryAndRenderHmDashboard() {
    UI.showOverlay('Cargando Información...', 'Obteniendo datos');
    try {
      const dateRange = $('#hm-filtro-fecha').val();
      let startDate = null, endDate = null;

      if (dateRange) {
        const parts = dateRange.split(' - ');
        if (parts.length === 2) {
          startDate = moment(parts[0], 'DD/MM/YYYY').toDate();
          endDate = moment(parts[1], 'DD/MM/YYYY').endOf('day').toDate();
        }
      }

      // Fetch data
      // Fetch data
      // Using string literal to avoid ReferenceError if COLLECTIONS is not in scope
      let query = db.collection('INCIDENCIASHYM_REGISTRADAS');

      const snap = await query.limit(2000).get(); // Limit for safety

      // Process and Filter Data
      const rawData = snap.docs.map(doc => {
        const d = doc.data();
        // Parse date - try Timestamp or String
        let dateObj = null;
        if (d.fechaRegistro && d.fechaRegistro.toDate) {
          dateObj = d.fechaRegistro.toDate();
        } else if (d.fechaRegistro) {
          // Try parsing string YYYY-MM-DD or DD/MM/YYYY
          dateObj = moment(d.fechaRegistro, ['YYYY-MM-DD', 'DD/MM/YYYY']).toDate();
        }

        return {
          id: doc.id,
          ...d,
          fechaParsed: dateObj
        };
      });

      // Filter by Date Range client-side to handle potential format variances safely
      hmCachedData = rawData.filter(d => {
        if (!d.fechaParsed) return false;
        if (startDate && d.fechaParsed < startDate) return false;
        if (endDate && d.fechaParsed > endDate) return false;
        return true;
      });

      // Populate Unit Dropdown
      const unitSelect = document.getElementById('hm-filtro-unidad');
      const currentUnit = unitSelect ? unitSelect.value : '';

      if (unitSelect) {
        const uniqueUnits = [...new Set(rawData.map(d => d.unida || d.unidad || ''))].filter(u => u).sort();

        // Save valid selection or reset if unavailable (optional, but better to keep previous if possible)
        // Re-build options
        // Keep "Todas"
        unitSelect.innerHTML = '<option value="">Todas las Unidades</option>';
        uniqueUnits.forEach(u => {
          const option = document.createElement('option');
          option.value = u;
          option.textContent = u;
          if (u === currentUnit) option.selected = true;
          unitSelect.appendChild(option);
        });
      }

      // Filter by Unit
      if (currentUnit) {
        hmCachedData = hmCachedData.filter(d => {
          const u = d.unida || d.unidad || '';
          return u === currentUnit;
        });
      }

      console.log(`H&M Incidents: Loaded ${hmCachedData.length} (Total raw: ${rawData.length})`);

      updateHmCharts();
      updateHmStatsAndTable();

    } catch (e) {
      console.error('Error loading H&M Dashboard:', e);
      UI.toast('Error al cargar datos H&M');
    } finally {
      UI.hideOverlay();
    }
  }

  function updateHmCharts() {
    const ctxCategoria = document.getElementById('hm-chart-categoria');
    const ctxSubCategoria = document.getElementById('hm-chart-subcategoria');
    const ctxUnidad = document.getElementById('hm-chart-unidad');
    const ctxFecha = document.getElementById('hm-chart-fecha');
    const ctxValor = document.getElementById('hm-chart-valor');

    if (!ctxCategoria || !ctxSubCategoria || !ctxUnidad || !ctxFecha || !ctxValor) return;

    // 1. Pie: Por Categoría (tipoIncidente)
    const categorias = {};
    hmCachedData.forEach(d => {
      const cat = d.tipoIncidente || 'Sin Categoría';
      categorias[cat] = (categorias[cat] || 0) + 1;
    });
    renderPieChart('hm-cat', ctxCategoria, categorias, 'Categoría');

    // 2. Pie: Por Subcategoría (subCategoria)
    const subcategorias = {};
    hmCachedData.forEach(d => {
      const sub = d.subCategoria || 'Sin Subcategoría';
      subcategorias[sub] = (subcategorias[sub] || 0) + 1;
    });
    renderPieChart('hm-sub', ctxSubCategoria, subcategorias, 'Subcategoría');

    // 3. Bar: Por Unidad (unidad)
    const unidades = {};
    hmCachedData.forEach(d => {
      const u = d.unida || d.unidad || 'Sin Unidad'; // Check both 'unida' (requested) and 'unidad'
      unidades[u] = (unidades[u] || 0) + 1;
    });
    renderBarChart('hm-unit', ctxUnidad, unidades, 'Incidentes por Unidad', '#3b82f6');

    // 4. Bar: Por Fecha (fechaRegistro)
    const fechas = {};
    hmCachedData.forEach(d => {
      if (d.fechaParsed) {
        const fStr = moment(d.fechaParsed).format('DD/MM/YYYY');
        fechas[fStr] = (fechas[fStr] || 0) + 1;
      }
    });
    // Sort dates
    const sortedDates = Object.keys(fechas).sort((a, b) => moment(a, 'DD/MM/YYYY') - moment(b, 'DD/MM/YYYY'));
    const sortedFechaData = {};
    sortedDates.forEach(k => sortedFechaData[k] = fechas[k]);
    renderBarChart('hm-date', ctxFecha, sortedFechaData, 'Incidentes por Fecha', '#10b981');

    // 5. Line: Comparativo Valor (Mensual)
    const monthlyValues = {}; // { 'YYYY-MM': { producto: 0, recuperacion: 0 } }

    hmCachedData.forEach(d => {
      if (d.fechaParsed) {
        const mStr = moment(d.fechaParsed).format('YYYY-MM'); // Sort key
        const label = moment(d.fechaParsed).format('MMM YYYY');

        if (!monthlyValues[mStr]) monthlyValues[mStr] = { label: label, producto: 0, recuperacion: 0 };

        // Parse values safely
        let valProd = parseHmValue(d.valorProductos) || parseHmValue(d.valorProducto);


        let valRec = parseHmValue(d.valorRecuperacion);


        monthlyValues[mStr].producto += valProd;
        monthlyValues[mStr].recuperacion += valRec;
      }
    });

    const sortedMonths = Object.keys(monthlyValues).sort();
    const labels = sortedMonths.map(m => monthlyValues[m].label);
    const dataProd = sortedMonths.map(m => parseFloat(monthlyValues[m].producto.toFixed(2)));
    const dataRec = sortedMonths.map(m => parseFloat(monthlyValues[m].recuperacion.toFixed(2)));

    renderLineComparisonChart('hm-val', ctxValor, labels, dataProd, dataRec);
  }

  function updateHmStatsAndTable() {
    const tableBody = document.getElementById('hm-tabla-body');
    const totalEl = document.getElementById('hm-kpi-total');
    const valorProdEl = document.getElementById('hm-kpi-valor-producto');
    const valorRecEl = document.getElementById('hm-kpi-valor-recupero');

    if (!tableBody) return;

    // Calculate Totals
    let totalCount = hmCachedData.length;
    let sumProd = 0;
    let sumRec = 0;

    let rowsHtml = '';

    hmCachedData.forEach(d => {
      // Validation for totals
      let valProd = parseHmValue(d.valorProductos) || parseHmValue(d.valorProducto);


      let valRec = parseHmValue(d.valorRecuperacion);


      sumProd += valProd;
      sumRec += valRec;

      // Build Table Row
      const fechaStr = d.fechaParsed ? moment(d.fechaParsed).format('DD/MM/YYYY HH:mm') : '-';
      const unidad = d.unida || d.unidad || '-';
      const usuario = d.usuarioNombre || d.usuario || '-';
      const categoria = d.tipoIncidente || '-';
      const subcategoria = d.subCategoria || '-';
      const obs = d.observaciones || '-';

      rowsHtml += `
            <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px;">${fechaStr}</td>
                <td style="padding: 10px;">${unidad}</td>
                <td style="padding: 10px;">${usuario}</td>
                <td style="padding: 10px;">${categoria}</td>
                <td style="padding: 10px;">${subcategoria}</td>
                <td style="padding: 10px; text-align: right; color: #ef4444;">S/ ${valProd.toFixed(2)}</td>
                <td style="padding: 10px; text-align: right; color: #10b981;">S/ ${valRec.toFixed(2)}</td>
                <td style="padding: 10px; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${obs}">${obs}</td>
            </tr>
        `;
    });

    // Update Stats UI
    if (totalEl) totalEl.textContent = totalCount;
    if (valorProdEl) valorProdEl.textContent = 'S/ ' + sumProd.toLocaleString('es-PE', { minimumFractionDigits: 2 });
    if (valorRecEl) valorRecEl.textContent = 'S/ ' + sumRec.toLocaleString('es-PE', { minimumFractionDigits: 2 });

    // Conditional Highlighting
    if (valorProdEl && valorRecEl) {
      // Assuming structure: .kpi-card > h3, div#id
      // We need to find the card container.
      const cardProd = valorProdEl.closest ? valorProdEl.closest('.kpi-card') : valorProdEl.parentElement;
      const cardRec = valorRecEl.closest ? valorRecEl.closest('.kpi-card') : valorRecEl.parentElement;

      const highlightStyle = { bg: '#fef9c3', border: '2px solid #facc15' };

      // Reset
      if (cardProd) { cardProd.style.backgroundColor = ''; cardProd.style.border = ''; }
      if (cardRec) { cardRec.style.backgroundColor = ''; cardRec.style.border = ''; }

      if (sumProd > sumRec) {
        if (cardProd) {
          cardProd.style.backgroundColor = highlightStyle.bg;
          cardProd.style.border = highlightStyle.border;
        }
      } else if (sumRec > sumProd) {
        if (cardRec) {
          cardRec.style.backgroundColor = highlightStyle.bg;
          cardRec.style.border = highlightStyle.border;
        }
      }
    }

    // Update Table UI
    tableBody.innerHTML = rowsHtml;
  }

  function parseHmValue(val) {
    if (val === undefined || val === null) return 0;

    // Conversión inicial a número
    let result = 0;

    if (typeof val === 'number') {
      result = val;
    } else if (typeof val === 'string') {
      let str = val.toString();
      // Remove "S/." or "S/" and spaces
      str = str.replace(/S\/\.?\s*/gi, '').trim();

      // Heuristic for Comma vs Dot:
      // 1. If it has a DOT, assume standard format (1,234.56). Remove commas.
      if (str.indexOf('.') > -1) {
        str = str.replace(/,/g, '');
      }
      // 2. If it has NO DOT and has a COMMA:
      else if (str.indexOf(',') > -1) {
        // Check if comma looks like a decimal (,XX or ,X)
        if (/,\d{1,2}$/.test(str)) {
          str = str.replace(',', '.');
        }
        // Else if it looks like thousands (,XXX), remove it
        else {
          str = str.replace(/,/g, '');
        }
      }
      // Remove non-numeric chars (except dot and minus)
      const clean = str.replace(/[^0-9.-]+/g, '');
      result = parseFloat(clean) || 0;
    } else {
      result = 0;
    }

    // DEBUG: Log valores sospechosos
    if (result >= 4000 && result <= 5000) {
      console.warn('[parseHmValue] Valor sospechoso detectado:', result, '| Entrada:', val);
    }

    // CORRECCIÓN MEJORADA: Detectar si el valor está en centavos
    // Casos a corregir:
    // - Valores entre 100 y 9999 que sean divisibles por 100 (ej: 4995, 2990, 5000)
    // - Estos son probablemente 49.95, 29.90, 50.00 en soles
    if (result > 100 && result < 10000 && result % 100 === 0) {
      const original = result;
      result = result / 100;
      console.log('[parseHmValue] CORRECCIÓN APLICADA:', original, '→', result);
    }
    // Caso más agresivo: si está entre 1000-99999 pero parece un valor en centavos
    else if (result >= 1000 && result <= 99999 && result % 100 === 0) {
      // Dividir para ver si resulta un número razonable (entre 10 y 999.99)
      const divided = result / 100;
      if (divided >= 10 && divided <= 999.99) {
        console.log('[parseHmValue] CORRECCIÓN APLICADA (rango 1000-99999):', result, '→', divided);
        result = divided;
      }
    }

    return result;
  }

  function loadHmLogoBase64() {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = function () {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      try {
        hmLogoBase64 = canvas.toDataURL('image/png');
      } catch (e) { console.warn('Cannot convert logo to base64', e); }
    };
    img.onerror = function () { console.warn('Could not load logo_liberman.png'); };
    // Assuming logo_liberman.png is in the root or accessible relative path
    img.src = 'logo_liberman.png';
  }

  function exportHmExcel() {
    if (!hmCachedData || hmCachedData.length === 0) {
      UI.toast('No hay datos para exportar');
      return;
    }

    let tableContent = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
            <!--[if gte mso 9]>
            <xml>
            <x:ExcelWorkbook>
                <x:ExcelWorksheets>
                    <x:ExcelWorksheet>
                        <x:Name>Incidencias H&M</x:Name>
                        <x:WorksheetOptions>
                            <x:DisplayGridlines/>
                        </x:WorksheetOptions>
                    </x:ExcelWorksheet>
                </x:ExcelWorksheets>
            </x:ExcelWorkbook>
            </xml>
            <![endif]-->
            <style>
                body { font-family: Arial, sans-serif; }
                table { border-collapse: collapse; width: 100%; }
                th, td { border: 1px solid #000000; padding: 8px; text-align: left; }
                th { background-color: #CC0000; color: #FFFFFF; font-weight: bold; }
                .currency { text-align: right; }
                .title { font-size: 18px; font-weight: bold; text-align: center; margin-bottom: 20px; }
                .red-text { color: #CC0000; }
            </style>
        </head>
        <body>
            <div style="text-align:center; padding: 20px;">
                ${hmLogoBase64 ? `<img src="${hmLogoBase64}" width="150" />` : '<h1 class="red-text">LIBERMAN</h1>'}
                <h2 class="title" style="color: #CC0000;">REPORTE DE INCIDENCIAS H&M</h2>
                <p>Generado: ${moment().format('DD/MM/YYYY HH:mm')}</p>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Fecha</th>
                        <th>Unidad</th>
                        <th>Usuario</th>
                        <th>Categoría</th>
                        <th>Subcategoría</th>
                        <th>Valor Producto</th>
                        <th>Valor Recupero</th>
                        <th>Observaciones</th>
                    </tr>
                </thead>
                <tbody>
    `;

    hmCachedData.forEach(d => {
      const fechaStr = d.fechaParsed ? moment(d.fechaParsed).format('DD/MM/YYYY HH:mm') : '-';
      const unidad = d.unida || d.unidad || '-';
      const usuario = d.usuarioNombre || d.usuario || '-';
      const categoria = d.tipoIncidente || '-';
      const subcategoria = d.subCategoria || '-';
      const obs = d.observaciones || '-';

      let valProd = parseHmValue(d.valorProductos) || parseHmValue(d.valorProducto);
      let valRec = parseHmValue(d.valorRecuperacion);

      tableContent += `
            <tr>
                <td>${fechaStr}</td>
                <td>${unidad}</td>
                <td>${usuario}</td>
                <td>${categoria}</td>
                <td>${subcategoria}</td>
                <td class="currency">S/ ${valProd.toFixed(2)}</td>
                <td class="currency">S/ ${valRec.toFixed(2)}</td>
                <td>${obs}</td>
            </tr>
        `;
    });

    tableContent += `
                </tbody>
            </table>
        </body>
        </html>
    `;

    const blob = new Blob([tableContent], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Reporte_Incidencias_HM_${moment().format('YYYYMMDD')}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function printHmPdf() {
    if (!hmCachedData || hmCachedData.length === 0) {
      UI.toast('No hay datos para exportar');
      return;
    }

    const bodyData = [];
    // Header
    bodyData.push([
      { text: 'Fecha', style: 'tableHeader' },
      { text: 'Unidad', style: 'tableHeader' },
      { text: 'Usuario', style: 'tableHeader' },
      { text: 'Categoría', style: 'tableHeader' },
      { text: 'Subcat.', style: 'tableHeader' },
      { text: 'V. Prod.', style: 'tableHeader' },
      { text: 'V. Rec.', style: 'tableHeader' },
      { text: 'Obs.', style: 'tableHeader' }
    ]);

    let sumProd = 0;
    let sumRec = 0;

    hmCachedData.forEach(d => {
      const fechaStr = d.fechaParsed ? moment(d.fechaParsed).format('DD/MM/YYYY') : '-';
      const unidad = d.unida || d.unidad || '-';
      const usuario = d.usuarioNombre || d.usuario || '-';
      const categoria = d.tipoIncidente || '-';
      const subcategoria = d.subCategoria || '-';
      const obs = d.observaciones || '-';

      let valProd = parseHmValue(d.valorProductos) || parseHmValue(d.valorProducto);
      let valRec = parseHmValue(d.valorRecuperacion);

      sumProd += valProd;
      sumRec += valRec;

      bodyData.push([
        { text: fechaStr, fontSize: 9 },
        { text: unidad, fontSize: 9 },
        { text: usuario, fontSize: 9 },
        { text: categoria, fontSize: 9 },
        { text: subcategoria, fontSize: 9 },
        { text: `S/ ${valProd.toFixed(2)}`, fontSize: 9, alignment: 'right' },
        { text: `S/ ${valRec.toFixed(2)}`, fontSize: 9, alignment: 'right' },
        { text: obs, fontSize: 8 }
      ]);
    });

    // Totals Row
    bodyData.push([
      { text: 'TOTAL', colSpan: 5, alignment: 'right', bold: true },
      {}, {}, {}, {},
      { text: `S/ ${sumProd.toFixed(2)}`, alignment: 'right', bold: true },
      { text: `S/ ${sumRec.toFixed(2)}`, alignment: 'right', bold: true },
      {}
    ]);

    const docDefinition = {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [20, 20, 20, 20],
      content: [
        {
          columns: [
            hmLogoBase64 ? { image: hmLogoBase64, width: 100 } : { text: 'LIBERMAN', fontSize: 20, bold: true, color: '#CC0000' },
            { text: 'REPORTE DE INCIDENCIAS H&M', style: 'header', alignment: 'right', margin: [0, 10, 0, 0] }
          ]
        },
        { text: `Generado el: ${moment().format('DD/MM/YYYY HH:mm')}`, alignment: 'right', margin: [0, 0, 0, 20], fontSize: 10 },
        {
          table: {
            headerRows: 1,
            widths: ['auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', '*'],
            body: bodyData
          },
          layout: {
            fillColor: function (rowIndex, node, columnIndex) {
              return (rowIndex === 0) ? '#CC0000' : (rowIndex % 2 === 0) ? '#f3f4f6' : null;
            }
          }
        }
      ],
      styles: {
        header: {
          fontSize: 18,
          bold: true,
          color: '#CC0000'
        },
        tableHeader: {
          bold: true,
          fontSize: 10,
          color: 'white',
          fillColor: '#CC0000',
          alignment: 'center'
        }
      },
      defaultStyle: {
        font: 'Roboto'
      }
    };

    pdfMake.createPdf(docDefinition).open();
  }

  function renderPieChart(id, canvas, dataObj, label) {
    if (hmCharts[id]) hmCharts[id].destroy();
    const labels = Object.keys(dataObj);
    const data = Object.values(dataObj);
    const bgColors = labels.map((_, i) => getColorByIndex(i));

    hmCharts[id] = new Chart(canvas, {
      type: 'pie',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: bgColors
        }]
      },
      options: {
        plugins: {
          legend: { position: 'right' },
          datalabels: {
            color: '#fff',
            formatter: (val, ctx) => {
              let sum = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
              let percentage = (val * 100 / sum).toFixed(1) + "%";
              return percentage;
            }
          }
        }
      }
    });
  }

  function renderBarChart(id, canvas, dataObj, label, color) {
    if (hmCharts[id]) hmCharts[id].destroy();
    const labels = Object.keys(dataObj);
    const data = Object.values(dataObj);

    hmCharts[id] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: label,
          data: data,
          backgroundColor: color
        }]
      },
      options: {
        scales: {
          y: { beginAtZero: true }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
  }

  function renderLineComparisonChart(id, canvas, labels, dataA, dataB) {
    if (hmCharts[id]) hmCharts[id].destroy();

    hmCharts[id] = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Valor Producto',
            data: dataA,
            borderColor: '#ef4444', // Red
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            tension: 0.3,
            fill: true
          },
          {
            label: 'Valor Recuperación',
            data: dataB,
            borderColor: '#10b981', // Green
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            tension: 0.3,
            fill: true
          }
        ]
      },
      options: {
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function (value, index, values) {
                return 'S/ ' + value.toLocaleString('es-PE', { minimumFractionDigits: 2 });
              }
            }
          }
        },
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: function (context) {
                let label = context.dataset.label || '';
                if (label) {
                  label += ': ';
                }
                if (context.parsed.y !== null) {
                  label += 'S/ ' + context.parsed.y.toLocaleString('es-PE', { minimumFractionDigits: 2 });
                }
                return label;
              }
            }
          }
        }
      }
    });
  }

  function getColorByIndex(i) {
    const colors = [
      '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
      '#ec4899', '#6366f1', '#14b8a6', '#f97316', '#06b6d4'
    ];
    return colors[i % colors.length];
  }

}); // Cierre DOMContentLoaded

// Función para mostrar modal de imagen ampliada
function showImageModal(imageUrl) {
  // Crear modal si no existe
  let modal = document.getElementById('cv-image-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'cv-image-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      padding: 20px;
      box-sizing: border-box;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
      position: relative;
      background: white;
      border-radius: 12px;
      max-width: 90vw;
      max-height: 90vh;
      overflow: auto;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    `;

    const img = document.createElement('img');
    img.id = 'cv-modal-image';
    img.style.cssText = `
      width: 100%;
      height: auto;
      display: block;
      border-radius: 12px;
    `;

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✕';
    closeBtn.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      background: #ef4444;
      color: white;
      border: none;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      font-size: 24px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      transition: background 0.3s;
    `;
    closeBtn.onmouseover = () => closeBtn.style.background = '#dc2626';
    closeBtn.onmouseout = () => closeBtn.style.background = '#ef4444';
    closeBtn.onclick = () => {
      modal.style.display = 'none';
    };

    content.appendChild(img);
    content.appendChild(closeBtn);
    modal.appendChild(content);
    document.body.appendChild(modal);

    // Cerrar al hacer clic en el fondo
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });
  }

  // Mostrar imagen
  document.getElementById('cv-modal-image').src = imageUrl;
  modal.style.display = 'flex';

  // Cerrar con tecla Esc
  const handleKeyPress = (e) => {
    if (e.key === 'Escape') {
      modal.style.display = 'none';
      document.removeEventListener('keydown', handleKeyPress);
    }
  };
  document.addEventListener('keydown', handleKeyPress);
}

// === FIX: ensure mobile overlay does not block clicks after resize ===
window.addEventListener('resize', () => {
  try {
    if (window.innerWidth >= 1024) {
      document.getElementById('sidebar')?.classList.remove('show');
      document.getElementById('menu-overlay')?.classList.remove('show');
    }
  } catch (e) { /* noop */ }
});

// === Opcional: actualizar color por tema dinámicamente ===

(function listenThemeChanges() {
  try {
    const mql = window.matchMedia?.('(prefers-color-scheme: dark)');
    const apply = () => {
      if (!window.Chart?.defaults) return;
      const ink = getComputedStyle(document.documentElement).getPropertyValue('--fg')?.trim() || '#111';
      Chart.defaults.color = ink;
    };
    mql?.addEventListener?.('change', apply);
    const obs = new MutationObserver((() => {
      let t; return () => { clearTimeout(t); t = setTimeout(apply, 50); };
    })());
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  } catch (e) { /* noop */ }
})();


// ============================================================================
// GESTIÓN DE TIPOS DE INCIDENCIAS (NUEVO MÓDULO)
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  // Referencias DOM
  const views = {
    main: document.getElementById('view-tipo-incidencias'),
    content: document.getElementById('ti-content'),
    catList: document.getElementById('ti-cat-list'),
    detailsCard: document.getElementById('ti-details-card'),
    subcatList: document.getElementById('ti-subcat-list'),
    detailTitle: document.getElementById('ti-detail-title')
  };

  const inputs = {
    cliente: document.getElementById('ti-cliente'),
    unidad: document.getElementById('ti-unidad'),
    newSub: document.getElementById('ti-new-sub')
  };

  const btns = {
    cargar: document.getElementById('ti-btn-cargar'),
    addCat: document.getElementById('ti-btn-add-cat'),
    delCat: document.getElementById('ti-btn-del-cat'),
    formSub: document.getElementById('ti-form-add-sub')
  };

  // Estado local
  let currentCatId = null;

  // 1. Cargar Clientes al Iniciar
  async function loadTIClients() {
    try {
      const db = firebase.firestore();
      const snap = await db.collection('CLIENTE_UNIDAD').get();
      const clientes = [];

      snap.forEach(doc => {
        // El ID del documento ES el nombre del cliente
        clientes.push(doc.id);
      });

      clientes.sort();
      inputs.cliente.innerHTML = '<option value="">Seleccione Cliente</option>' +
        clientes.map(c => `<option value="${c}">${c}</option>`).join('');

    } catch (error) {
      console.error('Error cargando clientes:', error);
      UI.toast('❌ Error al cargar clientes');
    }
  }

  // 2. Cargar Unidades al Seleccionar Cliente
  inputs.cliente.addEventListener('change', async () => {
    const cliente = inputs.cliente.value;
    inputs.unidad.innerHTML = '<option value="">Cargando...</option>';
    inputs.unidad.disabled = true;

    if (!cliente) {
      inputs.unidad.innerHTML = '<option value="">Seleccione Unidad</option>';
      return;
    }

    try {
      const db = firebase.firestore();
      // CORRECCIÓN: Usar subcolección UNIDADES directamente
      // Esto asegura que coincida con el resto del sistema (getUnidadesFromClienteUnidad)
      const snap = await db.collection('CLIENTE_UNIDAD')
        .doc(cliente)
        .collection('UNIDADES')
        .get();

      let listaUnidades = [];
      snap.forEach(doc => {
        listaUnidades.push(doc.id);
      });

      listaUnidades.sort();
      inputs.unidad.innerHTML = '<option value="">Seleccione Unidad</option>' +
        listaUnidades.map(u => `<option value="${u}">${u}</option>`).join('');
      inputs.unidad.disabled = false;

    } catch (error) {
      console.error('Error cargando unidades:', error);
      UI.toast('❌ Error al cargar unidades');
      inputs.unidad.innerHTML = '<option value="">Error</option>';
    }
  });

  // 3. Cargar Tipos (Categorías)
  btns.cargar.addEventListener('click', async () => {
    const cliente = inputs.cliente.value;
    const unidad = inputs.unidad.value;

    if (!cliente || !unidad) {
      UI.toast('⚠️ Seleccione Cliente y Unidad primero');
      return;
    }

    UI.showOverlay('Cargando Tipos...');
    views.content.style.display = 'none'; // ocultar mientras carga

    try {
      const db = firebase.firestore();
      // Ruta: TIPO_INCIDENCIAS/{cliente}/UNIDADES/{unidad}/TIPO
      const tipoRef = db.collection('TIPO_INCIDENCIAS').doc(cliente)
        .collection('UNIDADES').doc(unidad)
        .collection('TIPO');

      const snap = await tipoRef.get();

      renderCategories(snap.docs);
      views.content.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start;';
      views.detailsCard.style.display = 'none'; // reset detalle

    } catch (error) {
      console.error('Error cargando tipos:', error);
      UI.toast('❌ Error consultando tipos de incidencia');
    } finally {
      UI.hideOverlay();
    }
  });

  function renderCategories(docs) {
    if (docs.length === 0) {
      views.catList.innerHTML = '<div class="empty-state">No hay categorías configuradas.</div>';
      return;
    }

    views.catList.innerHTML = '';
    const ul = document.createElement('ul');
    ul.style.cssText = 'list-style: none; padding: 0; margin: 0;';

    docs.forEach(doc => {
      const data = doc.data();
      const li = document.createElement('li');
      li.style.cssText = 'padding: 10px 15px; border-bottom: 1px solid #f1f5f9; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background 0.2s;';
      li.innerHTML = `
                <span class="cat-name" style="font-weight: 500;">${doc.id}</span>
                <span class="muted" style="font-size: 12px;">${(data.DETALLES || []).length} items</span>
            `;

      li.onclick = () => {
        // Highlight select
        Array.from(ul.children).forEach(c => c.style.background = 'transparent');
        li.style.background = '#eff6ff';
        loadSubcategories(doc);
      };

      ul.appendChild(li);
    });

    views.catList.appendChild(ul);
  }

  // 4. Cargar Subcategorías
  function loadSubcategories(docSnapshot) {
    currentCatId = docSnapshot.id;
    const data = docSnapshot.data();
    const detalles = data.DETALLES || [];

    views.detailTitle.textContent = currentCatId;
    views.detailsCard.style.display = 'block';

    views.subcatList.innerHTML = '';
    if (detalles.length === 0) {
      views.subcatList.innerHTML = '<li class="muted" style="padding: 10px; font-style: italic;">Sin sub-tipos registrados.</li>';
    } else {
      detalles.forEach(sub => {
        const li = document.createElement('li');
        li.style.cssText = 'padding: 8px 0; border-bottom: 1px dashed #e2e8f0; display: flex; justify-content: space-between; align-items: center;';

        const span = document.createElement('span');
        span.textContent = sub;

        const btnDel = document.createElement('button');
        btnDel.innerHTML = '✕';
        btnDel.className = 'btn icon-btn danger small';
        btnDel.style.cssText = 'padding: 2px 8px; font-size: 12px; margin-left: 10px;';
        btnDel.onclick = () => deleteSubcategory(sub);

        li.appendChild(span);
        li.appendChild(btnDel);
        views.subcatList.appendChild(li);
      });
    }
  }

  // 5. Agregar Categoría
  btns.addCat.addEventListener('click', async () => {
    const cliente = inputs.cliente.value;
    const unidad = inputs.unidad.value;

    if (!cliente || !unidad) return UI.toast('⚠️ Seleccione Cliente y Unidad');

    const name = prompt('Nombre de la Nueva Categoría (ej. ROBO):');
    if (!name || !name.trim()) return;

    const cleanName = name.trim().toUpperCase();

    UI.showOverlay('Creando categoría...');
    try {
      const db = firebase.firestore();
      const docRef = db.collection('TIPO_INCIDENCIAS').doc(cliente)
        .collection('UNIDADES').doc(unidad)
        .collection('TIPO').doc(cleanName);

      // Verificar si existe para no sobrescribir sin querer (aunque set merge es seguro)
      const doc = await docRef.get();
      if (doc.exists) {
        UI.toast('⚠️ Esa categoría ya existe');
      } else {
        await docRef.set({
          DETALLES: [],
          actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()
        });
        UI.toast('✅ Categoría creada');
        // Recargar lista
        btns.cargar.click();
      }

    } catch (error) {
      console.error(error);
      UI.toast('❌ Error al crear categoría');
    } finally {
      UI.hideOverlay();
    }
  });

  // 6. Eliminar Categoría
  btns.delCat.addEventListener('click', async () => {
    if (!currentCatId) return;
    const confirmDel = confirm(`¿Estás seguro de eliminar la categoría "${currentCatId}" y todos sus detalles? esta acción no se puede deshacer.`);
    if (!confirmDel) return;

    const cliente = inputs.cliente.value;
    const unidad = inputs.unidad.value;

    UI.showOverlay('Eliminando...');
    try {
      const db = firebase.firestore();
      await db.collection('TIPO_INCIDENCIAS').doc(cliente)
        .collection('UNIDADES').doc(unidad)
        .collection('TIPO').doc(currentCatId)
        .delete();

      UI.toast('🗑️ Categoría eliminada');
      views.detailsCard.style.display = 'none';
      currentCatId = null;
      // Recargar lista
      btns.cargar.click();

    } catch (error) {
      console.error(error);
      UI.toast('❌ Error eliminando categoría');
    } finally {
      UI.hideOverlay();
    }
  });

  // 7. Agregar Subcategoría
  btns.formSub.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentCatId) return;

    const val = inputs.newSub.value.trim().toUpperCase();
    if (!val) return;

    const cliente = inputs.cliente.value;
    const unidad = inputs.unidad.value;

    UI.showOverlay('Guardando...');
    try {
      const db = firebase.firestore();
      const docRef = db.collection('TIPO_INCIDENCIAS').doc(cliente)
        .collection('UNIDADES').doc(unidad)
        .collection('TIPO').doc(currentCatId);

      await docRef.update({
        DETALLES: firebase.firestore.FieldValue.arrayUnion(val),
        actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()
      });

      UI.toast('✅ Sub-tipo agregado');
      inputs.newSub.value = '';

      // Recargar sublista solamente
      const updatedDoc = await docRef.get();
      loadSubcategories(updatedDoc);

    } catch (error) {
      console.error(error);
      UI.toast('❌ Error guardando sub-tipo');
    } finally {
      UI.hideOverlay();
    }
  });

  // 8. Eliminar Subcategoría
  async function deleteSubcategory(subName) {
    if (!confirm(`¿Quitar "${subName}" de la lista?`)) return;

    const cliente = inputs.cliente.value;
    const unidad = inputs.unidad.value;

    UI.showOverlay('Actualizando...');
    try {
      const db = firebase.firestore();
      const docRef = db.collection('TIPO_INCIDENCIAS').doc(cliente)
        .collection('UNIDADES').doc(unidad)
        .collection('TIPO').doc(currentCatId);

      await docRef.update({
        DETALLES: firebase.firestore.FieldValue.arrayRemove(subName),
        actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()
      });

      UI.toast('🗑️ Sub-tipo eliminado');

      // Recargar sublista
      const updatedDoc = await docRef.get();
      loadSubcategories(updatedDoc);

    } catch (error) {
      console.error(error);
      UI.toast('❌ Error eliminando sub-tipo');
    } finally {
      UI.hideOverlay();
    }
  }

  // Inicializar
  if (views.main) {
    loadTIClients();
  }
});
