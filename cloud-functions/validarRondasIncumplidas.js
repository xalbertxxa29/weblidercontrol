/**
 * CLOUD FUNCTION: validarRondasIncumplidas
 * Propósito: Validar automáticamente las rondas que no fueron completadas dentro del tiempo permitido
 * Ejecución: Scheduled (cada 5 minutos)
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

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
  const segundos = String(fecha.getSeconds()).padStart(2, '0');
  return `${año}-${mes}-${dia}_${horas}:${minutos}:${segundos}`;
}

function debeEjecutarseHoy(ronda, fechaHoy) {
  // Si no tiene frecuencia especificada, asumir que debe validarse
  if (!ronda.frecuencia) return true;

  const frecuencia = (ronda.frecuencia || '').toLowerCase().trim();
  
  // Validar si la frecuencia coincide con hoy
  // Diaria: siempre
  if (frecuencia.includes('diaria') || frecuencia === 'diario') {
    return true;
  }
  
  // Semanal: validar día de la semana (si está configurado)
  if (frecuencia.includes('semanal') || frecuencia === 'semanal') {
    // Por ahora asumir que se debe validar
    return true;
  }
  
  // Si tiene cualquier otra frecuencia, validar
  return true;
}

/**
 * Verifica que la ronda sea del día actual
 * Esto evita marcar como incumplidas rondas de días anteriores
 */
function esRondaDeHoy(ronda, ahora = new Date()) {
  if (!ronda.createdAt) return true; // Si no tiene fecha, asumir que es de hoy
  
  let fechaCreacion;
  
  // Manejar tanto Timestamp de Firestore como Date regular
  if (ronda.createdAt.toDate) {
    fechaCreacion = ronda.createdAt.toDate();
  } else if (ronda.createdAt instanceof Date) {
    fechaCreacion = ronda.createdAt;
  } else {
    return true;
  }
  
  const fechaHoyFormato = formatearFecha(ahora);
  const fechaCreacionFormato = formatearFecha(fechaCreacion);
  
  const esHoy = fechaHoyFormato === fechaCreacionFormato;
  console.log(`    Validación de fecha: Hoy=${fechaHoyFormato}, Creación=${fechaCreacionFormato}, EsHoy=${esHoy}`);
  
  return esHoy;
}

function verificarTiempoLimite(horaFin, toleranciaMinutos = 0, ahora = new Date()) {
  if (!horaFin) return { tiempoLimiteAlcanzado: false, minutosRestantes: 0 };

  const partes = horaFin.split(':');
  if (partes.length < 2) return { tiempoLimiteAlcanzado: false, minutosRestantes: 0 };

  const [horas, minutos] = partes.map(Number);
  
  const tiempoLimite = new Date(ahora);
  tiempoLimite.setHours(horas, minutos, 0, 0);
  tiempoLimite.setMinutes(tiempoLimite.getMinutes() + toleranciaMinutos);

  const ahoraTime = ahora.getTime();
  const tiempoLimiteTime = tiempoLimite.getTime();
  const minutosRestantes = Math.ceil((tiempoLimiteTime - ahoraTime) / 60000);

  return {
    tiempoLimiteAlcanzado: ahoraTime > tiempoLimiteTime,
    minutosRestantes
  };
}

async function registrarRondasIncumplidas(rondasIncumplidas) {
  const timestamp = new Date().toISOString();
  let registradas = 0;

  for (const { rondasId, ronda, fecha } of rondasIncumplidas) {
    try {
      // Obtener hora de inicio (de la ronda)
      let horaInicio = ronda.horarioInicio || ronda.hora_inicio || '';
      let horaTermino = ronda.horario || ronda.hora_fin || ronda.horarioTermino || '';
      let tolerancia = ronda.tolerancia || ronda.tolerancia_minutos || 0;

      // Crear timestamps para horarioInicio y horarioTermino
      const ahora = new Date();
      
      // horarioInicio: cuando debió comenzar la ronda (hoy a la hora indicada)
      const inicioPartes = horaInicio.split(':');
      const timestampInicio = new Date(ahora);
      if (inicioPartes.length >= 2) {
        timestampInicio.setHours(parseInt(inicioPartes[0]), parseInt(inicioPartes[1]), 0, 0);
      }
      
      // horarioTermino: cuando debió terminar (timestampInicio + tolerancia)
      const timestampTermino = new Date(timestampInicio);
      timestampTermino.setMinutes(timestampTermino.getMinutes() + tolerancia);

      // Crear estructura de documento incumplido
      let puntosRegistrados = {};
      
      if (ronda.puntosRonda && typeof ronda.puntosRonda === 'object') {
        // Si es un objeto, convertir a array
        const puntosArray = Array.isArray(ronda.puntosRonda) 
          ? ronda.puntosRonda 
          : Object.values(ronda.puntosRonda);
        
        puntosArray.forEach((punto, index) => {
          puntosRegistrados[index] = {
            nombre: punto.nombre || punto.descripcion || `Punto ${index + 1}`,
            codigoQR: punto.codigoQR || punto.codigo || '',
            qrEscaneado: false,
            foto: null,
            timestamp
          };
        });
      } else {
        // Si no hay puntos, crear uno genérico
        puntosRegistrados[0] = {
          nombre: ronda.nombre || 'Punto General',
          codigoQR: '',
          qrEscaneado: false,
          foto: null,
          timestamp
        };
      }

      const documentoIncumplida = {
        cliente: ronda.cliente || '',
        unidad: ronda.unidad || '',
        usuario: ronda.usuario || ronda.agente || '',
        estado: 'NO REALIZADA',
        horarioInicio: admin.firestore.Timestamp.fromDate(timestampInicio),
        horarioTermino: admin.firestore.Timestamp.fromDate(timestampTermino),
        rondasId: rondasId,
        nombre: ronda.nombre || '',
        puntosRegistrados,
        createdAt: admin.firestore.Timestamp.now(),
        timestamp,
        fecha: fecha
      };

      // Generar ID único con fecha y hora de la ronda: ronda_xyz_2025-11-22_1700
      // HHMM es la hora del horario programado de la ronda (no la hora actual)
      let horaRondaFormato = '0000'; // default
      if (horaTermino) {
        const horaPartes = horaTermino.split(':');
        if (horaPartes.length >= 2) {
          const horas = String(parseInt(horaPartes[0])).padStart(2, '0');
          const minutos = String(parseInt(horaPartes[1])).padStart(2, '0');
          horaRondaFormato = `${horas}${minutos}`;
        }
      }
      const docIdUnico = `${rondasId}_${fecha}_${horaRondaFormato}`;

      // Guardar en RONDAS_COMPLETADAS con ID único que incluye fecha/hora
      await db.collection('RONDAS_COMPLETADAS').doc(docIdUnico).set(documentoIncumplida);
      
      console.log(`✓ Ronda incumplida registrada: ${docIdUnico}`);
      registradas++;
    } catch (error) {
      console.error(`✗ Error registrando ronda ${rondasId}:`, error.message);
    }
  }

  return registradas;
}

exports.validarRondasIncumplidas = functions
  .region('southamerica-east1')
  .pubsub
  .schedule('every 5 minutes')
  .onRun(async (context) => {
    console.log('=== INICIO: Validar Rondas Incumplidas ===');
    console.log(`Hora actual: ${new Date().toISOString()}`);
    
    try {
      const hoy = formatearFecha(new Date());
      const ahora = new Date();
      const rondasSnapshot = await db.collection('Rondas_QR').get();
      
      if (rondasSnapshot.empty) {
        console.log('No hay rondas en Rondas_QR');
        return { success: true, message: 'Sin rondas' };
      }

      let rondasIncumplidas = [];
      let rondasValidadas = 0;

      for (const doc of rondasSnapshot.docs) {
        const ronda = doc.data();
        const rondasId = doc.id;
        rondasValidadas++;

        let horaFin = ronda.horario || ronda.hora_fin || ronda.horarioTermino;
        let tolerancia = ronda.tolerancia || ronda.tolerancia_minutos || 0;

        console.log(`\nEvaluando ronda ${rondasId}:`, {
          nombre: ronda.nombre,
          horaFin,
          tolerancia,
          createdAt: ronda.createdAt ? ronda.createdAt.toDate?.() || ronda.createdAt : 'sin fecha'
        });

        if (!horaFin) {
          console.log(`  ❌ Sin horario`);
          continue;
        }

        if (!debeEjecutarseHoy(ronda, hoy)) {
          console.log(`  ❌ No es para hoy (frecuencia: ${ronda.frecuencia})`);
          continue;
        }

        // ✅ VALIDACIÓN CRÍTICA: Verificar que la ronda sea de HOY
        if (!esRondaDeHoy(ronda, ahora)) {
          console.log(`  ⚠️  Ronda es de otro día, se ignora`);
          continue;
        }

        const { tiempoLimiteAlcanzado, minutosRestantes } = verificarTiempoLimite(
          horaFin,
          tolerancia,
          ahora
        );

        if (!tiempoLimiteAlcanzado) {
          console.log(`  ⏳ Faltan ${minutosRestantes} minutos para vencer`);
          continue;
        }

        // Verificar si fue completada HOY
        // Buscar documentos que tengan el patrón: rondasId_FECHA_HORA
        try {
          const fechaHoyFormato = formatearFecha(ahora);
          const snapshot = await db.collection('RONDAS_COMPLETADAS')
            .where('rondasId', '==', rondasId)
            .where('fecha', '==', fechaHoyFormato)
            .get();
          
          if (!snapshot.empty) {
            console.log(`  ✓ Completada hoy (${snapshot.docs.length} registro/s)`);
            continue;
          }
        } catch (e) {
          console.log(`  ℹ️  Error verificando completadas: ${e.message}`);
          // Continuar verificando por ID único
        }

        console.log(`  🔴 INCUMPLIDA`);
        rondasIncumplidas.push({
          rondasId,
          ronda,
          fecha: hoy
        });
      }

      console.log(`\n📊 Resumen: ${rondasValidadas} validadas, ${rondasIncumplidas.length} incumplidas`);

      if (rondasIncumplidas.length > 0) {
        const registradas = await registrarRondasIncumplidas(rondasIncumplidas);
        console.log(`✓ ${registradas} rondas incumplidas registradas`);
      }

      return {
        success: true,
        rondasValidadas,
        rondasIncumplidas: rondasIncumplidas.length,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('✗ Error:', error);
      return { success: false, error: error.message };
    }
  });
