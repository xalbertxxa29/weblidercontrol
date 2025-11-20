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
  async fetchUserAccessType(username) {
    try {
      const docSnap = await this.db.collection('USUARIOS').doc(username).get();
      
      if (!docSnap.exists) {
        console.warn(`[AccessControl] Usuario ${username} no encontrado en USUARIOS`);
        return { tipoAcceso: null, cliente: null, unidad: null };
      }

      const data = docSnap.data();
      const tipoAcceso = data?.TIPOACCESO;
      const cliente = data?.CLIENTE;      // Campo para filtro de CLIENTE
      const unidad = data?.UNIDAD;        // Campo opcional para filtro de UNIDAD
      
      return { tipoAcceso, cliente, unidad };
    } catch (error) {
      console.error('[AccessControl] Error al obtener datos del usuario:', error);
      return { tipoAcceso: null, cliente: null, unidad: null };
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
      console.error('[AccessControl] No se pudo extraer username del email');
      return false;
    }

    // Obtener tipo de acceso Y datos del cliente
    const { tipoAcceso, cliente, unidad } = await this.fetchUserAccessType(username);
    
    this.userType = tipoAcceso;
    this.clienteAsignado = cliente;  // Guardar CLIENTE para filtros
    this.unidadAsignada = unidad;    // Guardar UNIDAD para filtros
    
    if (!this.userType) {
      console.warn('[AccessControl] Usuario sin TIPOACCESO definido, restringiendo acceso');
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
      console.error('[AccessControl] Usuario no autenticado');
      return false;
    }
    
    if (this.canAccessView(viewId)) {
      return true;
    }
    
    console.warn(`[ACCESS DENIED] Usuario ${this.userType} intentó acceder a ${viewId}`);
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
   */
  getUnidadFilter() {
    if (this.userType === 'CLIENTE' && this.unidadAsignada) {
      return this.unidadAsignada;
    }
    return null; // ADMIN/SUPERVISOR: sin filtro
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
