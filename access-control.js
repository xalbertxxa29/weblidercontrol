/**
 * access-control.js
 * Sistema de control de acceso basado en roles desde Firestore
 * 
 * Flujo:
 * 1. Usuario se conecta: prueba@liderman.com.pe
 * 2. Se extrae el username: "prueba"
 * 3. Se consulta colección USUARIOS y documento "prueba"
 * 4. Se verifica campo TIPOACCESO
 *    - ADMIN: acceso total
 *    - SUPERVISOR: acceso total excepto no ve usuarios con TIPOACCESO='ADMIN'
 *    - CLIENTE: sin acceso a CLIENTES/UNIDADES ni USUARIOS
 */

class AccessControl {
  constructor(db, auth) {
    this.db = db;
    this.auth = auth;
    this.currentUser = null;
    this.userType = null;
    this.clienteAsignado = null;  // Campo CLIENTE del usuario
    this.unidadAsignada = null;   // Campo UNIDAD del usuario (opcional)
    this.restrictedViews = [];
  }

  /**
   * Extrae el username del email
   * Ejemplo: prueba@liderman.com.pe → prueba
   */
  extractUsername(email) {
    if (!email) return null;
    const parts = email.split('@');
    return parts[0].toLowerCase();
  }

  /**
   * Obtiene el tipo de acceso y datos adicionales del usuario desde Firestore
   * @returns {Promise<{tipoAcceso: string, cliente: string, unidad: string}>}
   */
  async fetchUserAccessType(username, email) {
    try {
      console.log(`[AccessControl] Fetching profile for: "${username}"`);
      let docSnap = await this.db.collection('USUARIOS').doc(username).get();

      // Fallback 1: Attempt with trimmed username (just in case)
      if (!docSnap.exists) {
        console.warn(`[AccessControl] Not found with "${username}", trying trimmed version...`);
        docSnap = await this.db.collection('USUARIOS').doc(username.trim()).get();
      }

      // NUEVO: Fallback 1.5 - Intentar ID como EMAIL completo
      if (!docSnap.exists && email) {
        docSnap = await this.db.collection('USUARIOS').doc(email).get();
      }

      // Fallback 2: Attempt to find by EMAIL field (if ID is different from username)
      if (!docSnap.exists && email) {
        console.warn(`[AccessControl] Not found by ID. Searching by email: ${email}`);

        // Try 'CORREO' field
        let querySnap = await this.db.collection('USUARIOS').where('CORREO', '==', email).limit(1).get();

        // Try 'email' field if 'CORREO' yielded nothing
        if (querySnap.empty) {
          querySnap = await this.db.collection('USUARIOS').where('email', '==', email).limit(1).get();
        }

        if (!querySnap.empty) {
          console.log(`[AccessControl] Found profile via email search.`);
          docSnap = querySnap.docs[0];
        }
      }

      if (!docSnap.exists) {
        console.error(`[AccessControl] User profile not found for: ${username}`);
        if (window.UI) window.UI.toast(`⚠️ Usuario no encontrado: ${username}`, 5000);
        return { tipoAcceso: null, cliente: null, unidad: null, unidades: null };
      }

      console.log(`[AccessControl] Profile found. Data:`, docSnap.data());

      const data = docSnap.data();
      const tipoAcceso = data?.TIPOACCESO;
      // Trim values to prevent whitespace issues
      const cliente = data?.CLIENTE && typeof data.CLIENTE === 'string' ? data.CLIENTE.trim() : data?.CLIENTE;
      const unidad = data?.UNIDAD && typeof data.UNIDAD === 'string' ? data.UNIDAD.trim() : data?.UNIDAD;

      const unidades = data?.UNIDADES;    // Campo opcional: Lista de unidades permitidas

      return { tipoAcceso, cliente, unidad, unidades };
    } catch (error) {
      console.error(`[AccessControl] Error fetching profile:`, error);
      if (window.UI) window.UI.toast(`❌ Error Acceso: ${error.message}`, 5000);
      return { tipoAcceso: null, cliente: null, unidad: null, unidades: null };
    }
  }

  /**
   * Determina las vistas restringidas según el tipo de acceso
   */
  getRestrictedViews(accessType) {
    const restricted = [];

    if (accessType === 'CLIENTE') {
      // CLIENTE no tiene acceso a:
      restricted.push('view-usuarios');        // Usuarios
      restricted.push('view-cliente-unidad');  // Cliente/Unidad
      restricted.push('view-tipo-incidencias');// Tipo Incidencias
    }

    if (accessType === 'SUPERVISOR') {
      // SUPERVISOR tiene acceso a todo igual que ADMIN
      // Las restricciones de no ver usuarios ADMIN se manejan en el filtrado de datos
    }

    // ADMIN tiene acceso a todo

    return restricted;
  }

  /**
   * Inicializa el control de acceso para el usuario actual
   */
  async initialize(user) {
    if (!user) {
      this.currentUser = null;
      this.userType = null;
      this.clienteAsignado = null;
      this.unidadAsignada = null;
      this.restrictedViews = [];
      return false;
    }

    this.currentUser = user;
    const username = this.extractUsername(user.email);

    if (!username) {
      return false;
    }

    // Obtener tipo de acceso Y datos del cliente
    const { tipoAcceso, cliente, unidad, unidades } = await this.fetchUserAccessType(username, user.email);

    this.userType = tipoAcceso;
    this.clienteAsignado = cliente; // Guardar cliente asignado
    console.log(`[AccessControl] Initialized. UserType: ${this.userType}, Cliente: ${this.clienteAsignado}`);

    // Soporte robusto para UNIDADES (Array o String separado por comas)
    let listaUnidades = [];

    if (unidades) {
      if (Array.isArray(unidades)) {
        listaUnidades = unidades;
      } else if (typeof unidades === 'string') {
        // Soporte para string: "HUÁNUCO" o "HUÁNUCO, AREQUIPA"
        listaUnidades = unidades.split(',').map(u => u.trim()).filter(Boolean);
      }
    }

    // Si no hay lista en UNIDADES, intentar con el campo legado UNIDAD
    if (listaUnidades.length === 0 && unidad) {
      listaUnidades = [unidad];
    }

    this.unidadesAsignadas = listaUnidades;
    this.unidadAsignada = unidad;    // Mantener compatibilidad legado

    if (!this.userType) {
      this.userType = 'CLIENTE';
    }

    this.restrictedViews = this.getRestrictedViews(this.userType);

    return true;
  }

  /**
   * Verifica si una vista está disponible para el usuario
   */
  canAccessView(viewId) {
    return !this.restrictedViews.includes(viewId);
  }

  /**
   * Oculta los elementos de navegación y vistas restringidas en el DOM
   */
  applyDOMRestrictions() {
    // Ocultar botones del menú navBar
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach((item) => {
      const target = item.getAttribute('data-target');
      if (target && !this.canAccessView(target)) {
        item.style.display = 'none';
      }
    });

    // Ocultar vistas
    const views = document.querySelectorAll('.view');
    views.forEach((view) => {
      const viewId = view.getAttribute('id');
      if (viewId && !this.canAccessView(viewId)) {
        view.style.display = 'none';
      }
    });
  }

  /**
   * Valida si el usuario puede acceder a una vista específica
   * Usado para prevención de acceso directo
   */
  validateViewAccess(viewId) {
    if (!this.currentUser) {
      return false;
    }

    if (this.canAccessView(viewId)) {
      return true;
    }
    return false;
  }

  /**
   * Obtiene el filtro de cliente para las consultas
   * Si el usuario es CLIENTE, retorna el cliente asignado
   * Si es ADMIN/SUPERVISOR, retorna null (sin filtro - ve TODOS los clientes)
   */
  getClienteFilter() {
    // SUPERVISOR ve todos los clientes (sin filtro)
    if (this.userType === 'SUPERVISOR') {
      return null;
    }

    if (this.userType === 'CLIENTE' && this.clienteAsignado) {
      return this.clienteAsignado;
    }
    return null; // ADMIN: sin filtro
  }

  /**
   * Obtiene el filtro de unidad para las consultas (opcional)
   * DEPRECATED: Usar getUnidadesAsignadas() preferiblemente
   */
  getUnidadFilter() {
    if (this.userType === 'CLIENTE' && this.unidadAsignada) {
      return this.unidadAsignada;
    }
    return null; // ADMIN/SUPERVISOR: sin filtro
  }

  /**
   * Retorna lista de unidades permitidas para el usuario
   * Si está vacío, significa que puede ver TODAS las unidades del cliente
   */
  getUnidadesAsignadas() {
    if (this.userType === 'CLIENTE') {
      return this.unidadesAsignadas || [];
    }
    return [];
  }

  /**
   * Verifica si el usuario actual es SUPERVISOR
   */
  isSupervisor() {
    return this.userType === 'SUPERVISOR';
  }

  /**
   * Verifica si el usuario actual es ADMIN
   */
  isAdmin() {
    return this.userType === 'ADMIN';
  }

  /**
   * Obtiene las opciones de filtro de usuarios para la vista de USUARIOS
   * Los SUPERVISORES no pueden ver usuarios con TIPOACCESO='ADMIN'
   */
  getUserTypeFilter() {
    if (this.userType === 'SUPERVISOR') {
      // SUPERVISOR no puede ver usuarios ADMIN
      return { excludeUserTypes: ['ADMIN'] };
    }
    return null; // ADMIN: sin restricciones
  }

  /**
   * Obtiene un resumen del acceso actual
   */
  getSummary() {
    let accessLevel = 'Limited';
    if (this.userType === 'ADMIN') {
      accessLevel = 'Full (Admin)';
    } else if (this.userType === 'SUPERVISOR') {
      accessLevel = 'Full (Supervisor)';
    }

    return {
      user: this.currentUser?.email,
      username: this.extractUsername(this.currentUser?.email),
      userType: this.userType,
      clienteAsignado: this.clienteAsignado,
      unidadAsignada: this.unidadAsignada,
      restrictedViews: this.restrictedViews,
      accessLevel: accessLevel
    };
  }
}

// Exportar para uso en menu.js
window.AccessControl = AccessControl;
