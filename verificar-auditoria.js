#!/usr/bin/env node

/**
 * VERIFICADOR: Sistema de Auditoría WebLiderControl
 * 
 * Ejecutar con: node verificar-auditoria.js
 * 
 * Este script verifica que todo esté correctamente implementado
 */

const fs = require('fs');
const path = require('path');

// Colores para consola
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  bold: '\x1b[1m'
};

const CHECK = `${colors.green}✅${colors.reset}`;
const CROSS = `${colors.red}❌${colors.reset}`;
const WARN = `${colors.yellow}⚠️${colors.reset}`;
const INFO = `${colors.blue}ℹ️${colors.reset}`;

let resultados = {
  archivos: { ok: 0, fallo: 0 },
  contenido: { ok: 0, fallo: 0 },
  total: { ok: 0, fallo: 0 }
};

console.log(`${colors.bold}${colors.blue}
╔═══════════════════════════════════════════════════════════════╗
║   VERIFICADOR: Sistema de Auditoría WebLiderControl         ║
╚═══════════════════════════════════════════════════════════════╝
${colors.reset}`);

// Archivos que deben existir
const archivosRequeridos = [
  { ruta: 'cloud-functions/logger.js', tipo: 'Cloud Function', desc: 'Módulo principal de logging' },
  { ruta: 'cloud-functions/auditoria.js', tipo: 'Cloud Function', desc: 'Endpoints HTTP' },
  { ruta: 'cloud-functions/validarRondasDiarias.js', tipo: 'Cloud Function', desc: 'Validación diaria (MODIFICADO)' },
  { ruta: 'cloud-functions/validarRondasIncumplidas.js', tipo: 'Cloud Function', desc: 'Validación incumplidas (MODIFICADO)' },
  { ruta: 'cloud-functions/SETUP_INDICES.js', tipo: 'Configuración', desc: 'Script de configuración de índices' },
  { ruta: 'DOCUMENTACION_AUDITORIA.md', tipo: 'Documentación', desc: 'Documentación completa' },
  { ruta: 'EJEMPLO_LOGS_FRONTEND.js', tipo: 'Ejemplos', desc: 'Ejemplos de uso en frontend' },
  { ruta: 'PANEL_AUDITORIA.html', tipo: 'UI', desc: 'Dashboard de visualización' },
  { ruta: 'RESUMEN_AUDITORIA.md', tipo: 'Resumen', desc: 'Resumen del sistema' },
  { ruta: 'IMPLEMENTACION_PASO_A_PASO.md', tipo: 'Guía', desc: 'Guía de implementación' },
  { ruta: 'ARQUITECTURA.md', tipo: 'Arquitectura', desc: 'Diagrama de arquitectura' }
];

console.log(`\n${colors.bold}1. VERIFICACIÓN DE ARCHIVOS${colors.reset}\n`);

archivosRequeridos.forEach(archivo => {
  const rutaCompleta = path.join(__dirname, archivo.ruta);
  const existe = fs.existsSync(rutaCompleta);
  
  if (existe) {
    console.log(`${CHECK} ${archivo.ruta}`);
    console.log(`   └─ ${colors.bold}${archivo.tipo}${colors.reset}: ${archivo.desc}`);
    resultados.archivos.ok++;
    resultados.total.ok++;
  } else {
    console.log(`${CROSS} ${archivo.ruta} ${colors.red}(NO EXISTE)${colors.reset}`);
    console.log(`   └─ ${colors.bold}${archivo.tipo}${colors.reset}: ${archivo.desc}`);
    resultados.archivos.fallo++;
    resultados.total.fallo++;
  }
});

// Verificar contenido de archivos
console.log(`\n${colors.bold}2. VERIFICACIÓN DE CONTENIDO${colors.reset}\n`);

const verificacionesContenido = [
  {
    archivo: 'cloud-functions/logger.js',
    buscar: ['registrarAccion', 'registrarCambioEstadoRonda', 'TIPOS_ACCION'],
    desc: 'Funciones principales de logger'
  },
  {
    archivo: 'cloud-functions/auditoria.js',
    buscar: ['agregarLog', 'obtenerHistorial', 'obtenerLogsPorUsuario'],
    desc: 'Endpoints HTTP'
  },
  {
    archivo: 'cloud-functions/validarRondasDiarias.js',
    buscar: ['const logger', 'logger.registrarValidacionAutomatica'],
    desc: 'Integración de logging en validarRondasDiarias'
  },
  {
    archivo: 'cloud-functions/validarRondasIncumplidas.js',
    buscar: ['const logger', 'logger.registrarValidacionAutomatica'],
    desc: 'Integración de logging en validarRondasIncumplidas'
  }
];

verificacionesContenido.forEach(verificacion => {
  const rutaCompleta = path.join(__dirname, verificacion.archivo);
  
  if (fs.existsSync(rutaCompleta)) {
    const contenido = fs.readFileSync(rutaCompleta, 'utf8');
    const encontrados = verificacion.buscar.filter(buscar => contenido.includes(buscar));
    
    if (encontrados.length === verificacion.buscar.length) {
      console.log(`${CHECK} ${verificacion.archivo}`);
      console.log(`   └─ ${colors.bold}${verificacion.desc}${colors.reset}: Verificado`);
      resultados.contenido.ok++;
      resultados.total.ok++;
    } else {
      const faltantes = verificacion.buscar.filter(b => !encontrados.includes(b));
      console.log(`${WARN} ${verificacion.archivo}`);
      console.log(`   └─ ${colors.bold}${verificacion.desc}${colors.reset}: Faltan [${faltantes.join(', ')}]`);
      resultados.contenido.fallo++;
      resultados.total.fallo++;
    }
  } else {
    console.log(`${CROSS} ${verificacion.archivo} ${colors.red}(archivo no encontrado)${colors.reset}`);
    resultados.contenido.fallo++;
    resultados.total.fallo++;
  }
});

// Verificar package.json
console.log(`\n${colors.bold}3. VERIFICACIÓN DE DEPENDENCIAS${colors.reset}\n`);

const packageJsonPath = path.join(__dirname, 'cloud-functions/package.json');
if (fs.existsSync(packageJsonPath)) {
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const dependenciasRequeridas = ['firebase-admin', 'firebase-functions'];
    
    dependenciasRequeridas.forEach(dep => {
      if (packageJson.dependencies && packageJson.dependencies[dep]) {
        console.log(`${CHECK} ${dep}: ${packageJson.dependencies[dep]}`);
        resultados.total.ok++;
      } else {
        console.log(`${CROSS} ${dep} ${colors.red}(NO INSTALADO)${colors.reset}`);
        resultados.total.fallo++;
      }
    });
  } catch (e) {
    console.log(`${CROSS} Error leyendo package.json: ${e.message}`);
    resultados.total.fallo++;
  }
} else {
  console.log(`${WARN} package.json no encontrado`);
  resultados.total.fallo++;
}

// Resumen
console.log(`\n${colors.bold}╔════════════════════════════════════════════════════════════════╗${colors.reset}`);
console.log(`${colors.bold}║ RESUMEN DE VERIFICACIÓN${colors.reset}`);
console.log(`${colors.bold}╚════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

console.log(`${colors.bold}Archivos:${colors.reset}`);
console.log(`  ${CHECK} Correctos: ${resultados.archivos.ok}`);
console.log(`  ${CROSS} Faltantes: ${resultados.archivos.fallo}`);

console.log(`\n${colors.bold}Contenido:${colors.reset}`);
console.log(`  ${CHECK} Verificado: ${resultados.contenido.ok}`);
console.log(`  ${WARN} Incompleto: ${resultados.contenido.fallo}`);

console.log(`\n${colors.bold}TOTAL:${colors.reset}`);
console.log(`  ${CHECK} OK: ${resultados.total.ok}`);
console.log(`  ${CROSS} ERRORES: ${resultados.total.fallo}`);

// Estado final
console.log(`\n${colors.bold}ESTADO FINAL:${colors.reset}`);
if (resultados.total.fallo === 0) {
  console.log(`\n${CHECK} ${colors.bold}${colors.green}¡TODO OK! Sistema de auditoría completamente implementado${colors.reset}\n`);
} else if (resultados.total.fallo < 3) {
  console.log(`\n${WARN} ${colors.bold}${colors.yellow}Sistema implementado pero revisa los avisos${colors.reset}\n`);
} else {
  console.log(`\n${CROSS} ${colors.bold}${colors.red}Hay problemas a resolver${colors.reset}\n`);
}

// Checklist de próximos pasos
console.log(`${colors.bold}PRÓXIMOS PASOS:${colors.reset}\n`);
const pasosRequeridos = [
  '[ ] Desplegar Cloud Functions (firebase deploy)',
  '[ ] Crear índices en Firestore',
  '[ ] Integrar logging en frontend (script.js)',
  '[ ] Abrir Panel de Auditoría en navegador',
  '[ ] Probar registrar un log manual',
  '[ ] Verificar logs en Firestore Console'
];

pasosRequeridos.forEach(paso => {
  console.log(`   ${paso}`);
});

console.log(`\n${colors.bold}DOCUMENTACIÓN:${colors.reset}\n`);
console.log(`   • Leer: DOCUMENTACION_AUDITORIA.md`);
console.log(`   • Guía: IMPLEMENTACION_PASO_A_PASO.md`);
console.log(`   • Diagrama: ARQUITECTURA.md`);

console.log(`\n${colors.bold}ENDPOINTS DISPONIBLES:${colors.reset}\n`);
console.log(`   POST https://southamerica-east1-incidencias-85d73.cloudfunctions.net/agregarLog`);
console.log(`   GET https://southamerica-east1-incidencias-85d73.cloudfunctions.net/obtenerHistorial?coleccion=RONDAS_COMPLETADAS&documentoId=...`);
console.log(`   GET https://southamerica-east1-incidencias-85d73.cloudfunctions.net/obtenerLogsPorUsuario?usuario=...`);
console.log(`   GET https://southamerica-east1-incidencias-85d73.cloudfunctions.net/obtenerLogsPorTipoAccion?tipoAccion=CREAR`);
console.log(`   GET https://southamerica-east1-incidencias-85d73.cloudfunctions.net/obtenerLogsPorColeccion?coleccion=RONDAS_COMPLETADAS\n`);

console.log(`${colors.bold}═══════════════════════════════════════════════════════════════${colors.reset}\n`);

module.exports = resultados;
