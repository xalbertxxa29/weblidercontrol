/**
 * CLOUD FUNCTION: validarRondasDiarias (Mejorado)
 * Propósito: Validar automáticamente que las rondas diarias se cumplan
 * Ejecución: Cada 1 minuto (de forma más frecuente para capturar el momento justo)
 * 
 * FLUJO:
 * 1. Obtiene todas las rondas con frecuencia='diaria' de Rondas_QR
 * 2. Para cada ronda, genera ID basado en fecha actual: rondaId_YYYY_MM_DD_HHMM
 * 3. Verifica si existe documento en RONDAS_COMPLETADAS con ese ID
 * 4. Calcula la hora límite (horario + tolerancia)
 * 5. Si ya pasó la hora límite y NO existe el documento:
 *    - Crea documento de ronda "NO REALIZADA" con ese ID único
 * 6. Si el documento existe, la ronda fue realizada (completada)
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const logger = require('./logger');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Zona horaria: Perú UTC-5
const ZONA_HORARIA_OFFSET = -5;

function obtenerAhoraEnZonaLocal() {
  const ahora = new Date();
  const offset = ZONA_HORARIA_OFFSET * 60 * 60 * 1000;
  return new Date(ahora.getTime() + offset);
}

function formatearFecha(fecha) {
  const año = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${año}-${mes}-${dia}`;
}

function formatearFechaConHora(fecha) {
  const año = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  const horas = String(fecha.getHours()).padStart(2, '0');
  const minutos = String(fecha.getMinutes()).padStart(2, '0');
  return `${año}${mes}${dia}${horas}${minutos}`;
}

function generarIdRonda(rondaId, horario, fecha) {
  /**
   * Genera ID único para la ronda del día
   * Formato: rondaId_YYYY_MM_DD_HHMM
   * Ejemplo: ronda_1764030974912_2025_11_30_1937
   * 
   * IMPORTANTE: Es crítico que este ID sea EXACTAMENTE consistente
   * porque se usa como clave única en Firestore
   */
  // Validar que horario tenga formato correcto
  if (!horario || typeof horario !== 'string' || !horario.includes(':')) {
    console.warn(`⚠️ ADVERTENCIA: Horario inválido para generarIdRonda: "${horario}"`);
    return null;
  }
  
  const partes = horario.split(':');
  let horas = parseInt(partes[0], 10);
  let minutos = parseInt(partes[1], 10);
  
  // Validar valores
  if (isNaN(horas) || isNaN(minutos) || horas < 0 || horas > 23 || minutos < 0 || minutos > 59) {
    console.warn(`⚠️ ADVERTENCIA: Valores de horario inválidos - H:${horas} M:${minutos}`);
    return null;
  }
  
  const horasFormatadas = String(horas).padStart(2, '0');
  const minutosFormateados = String(minutos).padStart(2, '0');
  
  const año = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  
  const idGenerado = `${rondaId}_${año}_${mes}_${dia}_${horasFormatadas}${minutosFormateados}`;
  
  return idGenerado;
}

function calcularHoraLimite(horario, tolerancia, toleranciaTipo = 'minutos') {
  /**
   * Calcula la hora límite cuando debe completarse la ronda
   * horario: "19:37" (hora de inicio)
   * tolerancia: 1 (cantidad)
   * toleranciaTipo: "minutos" o "horas"
   * 
   * Retorna el Date cuando vence la ronda
   * IMPORTANTE: Usa la zona horaria local (UTC-5) para Perú
   */
  const ahora = obtenerAhoraEnZonaLocal();
  const [horas, minutos] = horario.split(':').map(Number);
  
  const horaInicio = new Date(ahora);
  horaInicio.setHours(horas, minutos, 0, 0);
  
  const horaLimite = new Date(horaInicio);
  
  if (toleranciaTipo.toLowerCase() === 'horas') {
    horaLimite.setHours(horaLimite.getHours() + tolerancia);
  } else {
    // minutos (default)
    horaLimite.setMinutes(horaLimite.getMinutes() + tolerancia);
  }
  
  return horaLimite;
}

function yaAlcanzoHoraLimite(horario, tolerancia, toleranciaTipo, ahora) {
  /**
   * Verifica si ya pasó la hora límite para completar la ronda
   */
  const horaLimite = calcularHoraLimite(horario, tolerancia, toleranciaTipo);
  return ahora.getTime() >= horaLimite.getTime();
}

function yaAlcanzoHoraLimiteMas2Min(horario, tolerancia, toleranciaTipo, ahora) {
  /**
   * Verifica si ya pasaron 2 minutos DESPUÉS de la tolerancia
   * Esto asegura que se cree el documento solo después de que la ronda debería haber terminado
   * 
   * Ejemplo:
   * - Horario: 21:12
   * - Tolerancia: 3 minutos
   * - Hora límite: 21:15
   * - Crear documento a partir de: 21:17 (21:15 + 2 minutos)
   */
  const horaLimite = calcularHoraLimite(horario, tolerancia, toleranciaTipo);
  const horaCreacionDocumento = new Date(horaLimite);
  horaCreacionDocumento.setMinutes(horaCreacionDocumento.getMinutes() + 2);
  return ahora.getTime() >= horaCreacionDocumento.getTime();
}

function obtenerMinutosRestantes(horario, tolerancia, toleranciaTipo, ahora) {
  /**
   * Retorna cuántos minutos faltan para que venza la ronda
   */
  const horaLimite = calcularHoraLimite(horario, tolerancia, toleranciaTipo);
  const diferencia = horaLimite.getTime() - ahora.getTime();
  return Math.ceil(diferencia / 60000);
}

async function crearRondaNoRealizada(rondaId, ronda, fechaFormato, idDocumento) {
  /**
   * Crea un documento en RONDAS_COMPLETADAS indicando que la ronda NO fue realizada
   * IMPORTANTE: TRIPLE verificación para evitar absolutamente cualquier sobrescritura
   */
  console.log(`\n🔍 VERIFICACIÓN PREVIA A CREACIÓN (ID: ${idDocumento})`);
  
  const [horas, minutos] = ronda.horario.split(':');
  const ahora = obtenerAhoraEnZonaLocal();
  
  // ============================================================================
  // VERIFICACIÓN 1: ¿Existe el documento antes de crearlo?
  // ============================================================================
  let docExistente = null;
  try {
    const docExistenteSnapshot = await db.collection('RONDAS_COMPLETADAS').doc(idDocumento).get();
    
    if (docExistenteSnapshot.exists) {
      docExistente = docExistenteSnapshot.data();
      console.log(`\n   ❌ ABORTO DE CREACIÓN: DOCUMENTO YA EXISTE`);
      console.log(`      Documento ID: ${idDocumento}`);
      console.log(`      Estado actual: "${docExistente.estado || 'DESCONOCIDO'}"`);
      console.log(`      Generado automáticamente: ${docExistente.generadoAutomaticamente === true ? 'SÍ (Sistema)' : 'NO (Manual)'}`);
      console.log(`      Creado en: ${docExistente.createdAt ? docExistente.createdAt.toDate() : 'N/A'}`);
      console.log(`   🛑 No se sobrescribirá este documento`);
      return false; // ABORTAR - No sobrescribir
    }
  } catch (e) {
    console.log(`   ⚠️ ERROR al verificar existencia: ${e.message}`);
    console.log(`   🛑 Abortando creación por seguridad (error en verificación)`);
    return false; // ABORTAR - Seguridad: no crear si hay error
  }
  
  // ============================================================================
  // VERIFICACIÓN 2: Búsqueda secundaria con whereEqualTo para doble check
  // ============================================================================
  try {
    const querySnapshot = await db.collection('RONDAS_COMPLETADAS')
      .where('rondaId', '==', rondaId)
      .where('fecha', '==', fechaFormato)
      .get();
    
    if (!querySnapshot.empty) {
      console.log(`\n   ⚠️ BÚSQUEDA ALTERNATIVA: Se encontraron ${querySnapshot.size} documento(s)`);
      querySnapshot.forEach((doc) => {
        console.log(`      - ${doc.id}: Estado="${doc.data().estado}"`);
      });
      console.log(`   🛑 No se creará nuevo documento (ya existe por búsqueda alternativa)`);
      return false; // ABORTAR - Ya existe por búsqueda alternativa
    }
  } catch (e) {
    console.log(`   ℹ️ Búsqueda alternativa no disponible: ${e.message}`);
    // Continuar con la creación (esto es menos crítico)
  }
  
  // ============================================================================
  // CONSTRUCCIÓN DEL DOCUMENTO
  // ============================================================================
  // CRÍTICO: Construir timestampInicio correctamente para que coincida con horarioRonda
  // Parsear el horario programado (ej: "18:10")
  const [horasInt, minutosInt] = [parseInt(horas), parseInt(minutos)];
  
  // SOLUCIÓN CORRECTA: Crear la fecha UTC que corresponde a la hora local en Perú (UTC-5)
  // 1. Obtener la fecha actual en UTC
  const ahora_utc = new Date();
  
  // 2. Crear un Date que represente "hoy" en hora local de Perú
  // Para esto, convertimos la hora local de Perú (que sería UTC-5) a UTC
  // Ejemplo: Si en Perú son las 18:10, en UTC son las 23:10 (18:10 + 5 horas)
  const timestampInicio = new Date(Date.UTC(
    ahora_utc.getUTCFullYear(),
    ahora_utc.getUTCMonth(),
    ahora_utc.getUTCDate(),
    horasInt + 5,  // Sumar 5 horas para convertir hora local Perú a UTC
    minutosInt,
    0,
    0
  ));
  
  // Log para verificar que se está guardando correctamente
  console.log(`   📍 horarioRonda (valor string): ${ronda.horario}`);
  console.log(`   📍 Horas parseadas: ${horasInt}, Minutos: ${minutosInt}`);
  console.log(`   📍 Hora en Perú (hora local): ${horasInt}:${String(minutosInt).padStart(2, '0')}`);
  console.log(`   📍 Hora UTC correspondiente: ${timestampInicio.toUTCString()}`);
  console.log(`   📍 Timestamp Firebase (ms desde epoch): ${timestampInicio.getTime()}`);
  
  const toleranciaTipo = ronda.toleranciaTipo || 'minutos';
  const tolerancia = ronda.tolerancia || 0;
  
  const timestampTermino = new Date(timestampInicio);
  if (toleranciaTipo.toLowerCase() === 'horas') {
    timestampTermino.setUTCHours(timestampTermino.getUTCHours() + tolerancia);
  } else {
    timestampTermino.setUTCMinutes(timestampTermino.getUTCMinutes() + tolerancia);
  }
  
  // Construir puntos de ronda
  let puntosRegistrados = {};
  if (ronda.puntosRonda && Array.isArray(ronda.puntosRonda) && ronda.puntosRonda.length > 0) {
    ronda.puntosRonda.forEach((punto, index) => {
      puntosRegistrados[index] = {
        nombre: punto.nombre || `Punto ${index + 1}`,
        qrId: punto.qrId || '',
        requireQuestion: punto.requireQuestion || 'no',
        questions: punto.questions || [],
        qrEscaneado: false,
        foto: null,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      };
    });
  } else {
    puntosRegistrados[0] = {
      nombre: ronda.nombre || 'Punto General',
      qrId: '',
      requireQuestion: 'no',
      questions: [],
      qrEscaneado: false,
      foto: null,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    };
  }
  
  const documentoNoRealizada = {
    // Identificadores
    rondaId: rondaId,
    nombre: ronda.nombre || '',
    
    // Ubicación
    cliente: ronda.cliente || '',
    unidad: ronda.unidad || '',
    
    // Horarios
    horarioInicio: admin.firestore.Timestamp.fromDate(timestampInicio),
    horarioTermino: admin.firestore.Timestamp.fromDate(timestampTermino),
    horarioRonda: ronda.horario,
    
    // Tolerancia
    tolerancia: tolerancia,
    toleranciaTipo: toleranciaTipo,
    
    // Datos de realización
    estado: 'NO REALIZADA',
    fecha: fechaFormato,
    
    // Puntos de ronda
    puntosRegistrados: puntosRegistrados,
    
    // Metadata
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    timestamp: new Date().toISOString(),
    generadoAutomaticamente: true,
    
    // Campo de seguridad: timestamp exacto de creación para evitar conflictos
    _creationTimestamp: Date.now()
  };
  
  // ============================================================================
  // VERIFICACIÓN 3: Una última verificación justo antes de .set()
  // ============================================================================
  try {
    const docFinalCheck = await db.collection('RONDAS_COMPLETADAS').doc(idDocumento).get();
    
    if (docFinalCheck.exists) {
      console.log(`\n   ❌ VERIFICACIÓN FINAL FALLÓ: El documento existe (verificación final)`);
      console.log(`      ID: ${idDocumento}`);
      return false; // ABORTAR - No sobrescribir
    }
  } catch (e) {
    console.log(`   ⚠️ Error en verificación final: ${e.message}`);
    return false; // ABORTAR - Seguridad: no crear si hay error
  }
  
  // ============================================================================
  // CREACIÓN SEGURA DEL DOCUMENTO
  // ============================================================================
  try {
    // USAR set() CON merge: false (NO mezclar con datos existentes)
    await db.collection('RONDAS_COMPLETADAS')
      .doc(idDocumento)
      .set(documentoNoRealizada, { merge: false });
    
    console.log(`\n   ✅ DOCUMENTO CREADO EXITOSAMENTE: ${idDocumento}`);
    console.log(`      Estado: NO REALIZADA`);
    console.log(`      Generado por: Sistema automático`);
    
    // ✅ REGISTRAR LOG DE AUDITORÍA
    try {
      await logger.registrarValidacionAutomatica(
        'RONDAS_COMPLETADAS',
        idDocumento,
        'NO_REALIZADA',
        {
          razon: 'Ronda no completada dentro del plazo',
          ronda: ronda.nombre,
          horarioProgramado: ronda.horario,
          tolerancia: tolerancia,
          cliente: ronda.cliente,
          unidad: ronda.unidad
        }
      );
    } catch (logError) {
      console.error(`   ⚠️ Error registrando log de auditoría:`, logError.message);
      // Continuar aunque falle el log
    }
    
    return true;
    
  } catch (error) {
    console.error(`\n   ❌ ERROR al crear documento ${idDocumento}`);
    console.error(`      Mensaje: ${error.message}`);
    console.error(`      Código: ${error.code}`);
    return false;
  }
}

async function verificarYValidarRondasDiarias() {
  /**
   * Función principal que verifica y valida todas las rondas diarias
   */
  const ahora = obtenerAhoraEnZonaLocal();
  const fechaFormato = formatearFecha(ahora);
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`VALIDACIÓN DE RONDAS DIARIAS`);
  console.log(`Hora local (UTC-5): ${ahora.toISOString()}`);
  console.log(`Fecha: ${fechaFormato}`);
  console.log(`${'='.repeat(80)}\n`);
  
  try {
    // 1. Obtener TODAS las rondas de Rondas_QR
    const rondasSnapshot = await db.collection('Rondas_QR').get();
    
    if (rondasSnapshot.empty) {
      console.log('ℹ️ No hay rondas configuradas en Rondas_QR');
      return {
        success: true,
        message: 'Sin rondas',
        rondasProcesadas: 0,
        rondasNoRealizadas: 0
      };
    }
    
    let rondasProcesadas = 0;
    let rondasNoRealizadas = 0;
    let rondasRealizadas = 0;
    let rondasPendientes = 0;
    
    // 2. Procesar cada ronda
    for (const doc of rondasSnapshot.docs) {
      const ronda = doc.data();
      const rondaId = doc.id;
      rondasProcesadas++;
      
      console.log(`\n📋 Ronda ${rondasProcesadas}: ${ronda.nombre || 'Sin nombre'}`);
      console.log(`   ID: ${rondaId}`);
      console.log(`   Cliente: ${ronda.cliente || 'N/A'}`);
      console.log(`   Unidad: ${ronda.unidad || 'N/A'}`);
      
      // Validar que sea ronda diaria
      if (!ronda.frecuencia || ronda.frecuencia.toLowerCase() !== 'diaria') {
        console.log(`   ⏭️ No es ronda diaria (frecuencia: ${ronda.frecuencia})`);
        continue;
      }
      
      console.log(`   ✓ Frecuencia: DIARIA`);
      
      // Validar que tenga horario
      if (!ronda.horario) {
        console.log(`   ❌ Sin horario configurado`);
        continue;
      }
      
      console.log(`   Horario: ${ronda.horario}`);
      
      // Obtener tolerancia
      const tolerancia = ronda.tolerancia || 0;
      const toleranciaTipo = ronda.toleranciaTipo || 'minutos';
      console.log(`   Tolerancia: ${tolerancia} ${toleranciaTipo}`);
      
      // Generar ID único para hoy: rondaId_YYYYMMDD_HHMM
      const idDocumentoHoy = generarIdRonda(rondaId, ronda.horario, ahora);
      console.log(`   ID esperado: ${idDocumentoHoy}`);
      
      // Verificar si ya pasó la hora límite ORIGINAL
      const minutosRestantes = obtenerMinutosRestantes(ronda.horario, tolerancia, toleranciaTipo, ahora);
      
      if (!yaAlcanzoHoraLimite(ronda.horario, tolerancia, toleranciaTipo, ahora)) {
        console.log(`   ⏳ Aún dentro del tiempo permitido (${minutosRestantes} minutos restantes)`);
        rondasPendientes++;
        continue;
      }
      
      console.log(`   ⏰ Tiempo límite ALCANZADO (hace ${Math.abs(minutosRestantes)} minutos)`);
      
      // ======================================================================
      // VERIFICACIÓN 1: ¿Ya existe el documento?
      // ======================================================================
      let docYaExiste = false;
      let estadoDocumento = null;
      
      try {
        const docSnapshot = await db.collection('RONDAS_COMPLETADAS').doc(idDocumentoHoy).get();
        
        if (docSnapshot.exists) {
          docYaExiste = true;
          estadoDocumento = docSnapshot.data().estado || 'REALIZADA';
          console.log(`   ✅ COMPLETADA - Estado: ${estadoDocumento}`);
          rondasRealizadas++;
          continue; // SKIP - No hacer nada más, document ya existe
        }
      } catch (e) {
        console.log(`   ⚠️ Error crítico verificando documento: ${e.message}`);
        console.log(`   🛑 Saltando esta ronda por seguridad`);
        continue; // SKIP - Seguridad: no proceder si hay error
      }
      
      // ======================================================================
      // VERIFICACIÓN 2: ¿Ha pasado la tolerancia + 2 minutos?
      // ======================================================================
      if (!yaAlcanzoHoraLimiteMas2Min(ronda.horario, tolerancia, toleranciaTipo, ahora)) {
        const minutosFaltantes = obtenerMinutosRestantes(ronda.horario, tolerancia + 2, toleranciaTipo, ahora);
        console.log(`   ⏳ Esperando 2 minutos después de la tolerancia (${minutosFaltantes} minutos restantes)`);
        rondasPendientes++;
        continue; // SKIP - Aún no es hora de crear
      }
      
      console.log(`   🔴 PROCEDIENDO A CREAR DOCUMENTO - Ya pasó la hora límite + 2 minutos`);
      
      // ======================================================================
      // VERIFICACIÓN 3: VERIFICACIÓN FINAL JUSTO ANTES DE CREAR
      // ======================================================================
      try {
        const docSnapshotFinal = await db.collection('RONDAS_COMPLETADAS').doc(idDocumentoHoy).get();
        
        if (docSnapshotFinal.exists) {
          const estadoFinal = docSnapshotFinal.data().estado || 'REALIZADA';
          console.log(`   ⚠️ VERIFICACIÓN FINAL: Documento ya existe!`);
          console.log(`      ID: ${idDocumentoHoy}`);
          console.log(`      Estado: ${estadoFinal}`);
          console.log(`   🛑 ABORTO: No sobrescribiendo`);
          rondasRealizadas++;
          continue; // SKIP - No crear si ya existe
        }
      } catch (e) {
        console.log(`   ⚠️ Error en verificación final: ${e.message}`);
        console.log(`   🛑 ABORTO: Por seguridad, no crear con error`);
        continue; // SKIP - No crear si hay error en verificación
      }
      
      // ======================================================================
      // CREAR DOCUMENTO (Solo si pasó todas las verificaciones)
      // ======================================================================
      const creado = await crearRondaNoRealizada(rondaId, ronda, fechaFormato, idDocumentoHoy);
      
      if (creado) {
        rondasNoRealizadas++;
      }
    }
    
    // Resumen
    console.log(`\n${'='.repeat(80)}`);
    console.log(`RESUMEN DE VALIDACIÓN`);
    console.log(`Rondas procesadas: ${rondasProcesadas}`);
    console.log(`✅ Realizadas: ${rondasRealizadas}`);
    console.log(`🔴 No realizadas: ${rondasNoRealizadas}`);
    console.log(`⏳ Pendientes (dentro de tiempo): ${rondasPendientes}`);
    console.log(`${'='.repeat(80)}\n`);
    
    return {
      success: true,
      rondasProcesadas,
      rondasRealizadas,
      rondasNoRealizadas,
      rondasPendientes,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('❌ Error fatal:', error);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// Exportar función HTTP (para pruebas manuales)
exports.validarRondasDiariasHTTP = functions
  .region('southamerica-east1')
  .https
  .onRequest(async (req, res) => {
    try {
      const resultado = await verificarYValidarRondasDiarias();
      res.json(resultado);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

// Exportar función programada (cada 1 minuto)
exports.validarRondasDiarias = functions
  .region('southamerica-east1')
  .pubsub
  .schedule('every 1 minutes')
  .onRun(async (context) => {
    const resultado = await verificarYValidarRondasDiarias();
    return resultado;
  });
