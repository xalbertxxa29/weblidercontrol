/**
 * SCRIPT DE PRUEBA - Ejecutar manualmente la validación de rondas
 * 
 * USO:
 * 1. Instala el proyecto: npm install en la carpeta cloud-functions
 * 2. Ejecuta: node PRUEBA_MANUAL_RONDAS.js
 * 
 * Esto simulará lo que hace el Cloud Function cada 5 minutos
 */

const admin = require('firebase-admin');

// Inicializar con credenciales
try {
  admin.initializeApp({
    databaseURL: 'https://incidencias-85d73-default-rtdb.firebaseio.com'
  });
} catch (e) {
  // Ya inicializado
}

const db = admin.database();

// Copiar las funciones del Cloud Function
function formatearFecha(fecha) {
  const año = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${año}-${mes}-${dia}`;
}

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

async function registrarRondasIncumplidas(rondasIncumplidas) {
  const updates = {};
  const timestamp = new Date().toISOString();

  rondasIncumplidas.forEach(({ rondasId, ronda, fecha }) => {
    updates[`RONDAS_INCUMPLIDAS/${rondasId}/${fecha}`] = {
      agente: ronda.agente,
      agente_id: ronda.agente_id,
      cliente: ronda.cliente,
      unidad: ronda.unidad,
      nombre_ronda: ronda.nombre,
      hora_inicio: ronda.hora_inicio,
      hora_fin: ronda.hora_fin,
      tolerancia_minutos: ronda.tolerancia_minutos || 0,
      motivo: 'No completada dentro del tiempo permitido',
      fecha_registro: fecha,
      timestamp_deteccion: timestamp,
      estado: 'INCUMPLIDA'
    };

    updates[`RONDAS_PROGRAMADAS/${rondasId}/estado`] = 'INCUMPLIDA';
    updates[`RONDAS_PROGRAMADAS/${rondasId}/timestamp_incumplimiento`] = timestamp;
    updates[`Rondas_QR/${rondasId}/estado`] = 'INCUMPLIDA';
    updates[`Rondas_QR/${rondasId}/timestamp_incumplimiento`] = timestamp;
    
    updates[`NOTIFICACIONES/${rondasId}/${fecha}`] = {
      tipo: 'RONDA_INCUMPLIDA',
      titulo: `Ronda Incumplida: ${ronda.nombre}`,
      descripcion: `La ronda ${ronda.nombre} del agente ${ronda.agente} no fue completada`,
      agente_id: ronda.agente_id,
      cliente: ronda.cliente,
      unidad: ronda.unidad,
      fecha: fecha,
      timestamp: timestamp,
      leida: false
    };
  });

  await db.ref().update(updates);
  console.log(`✓ Registradas ${rondasIncumplidas.length} rondas como incumplidas`);
}

async function validarRondas() {
  console.log('\n=== VALIDACIÓN MANUAL DE RONDAS ===\n');
  const timestamp = new Date().toISOString();
  
  try {
    // 1. Obtener rondas de Rondas_QR
    let rondasSnapshot = await db.ref('Rondas_QR').get();
    
    if (!rondasSnapshot.exists()) {
      console.log('❌ No hay rondas en Rondas_QR');
      rondasSnapshot = await db.ref('RONDAS_PROGRAMADAS').get();
      
      if (!rondasSnapshot.exists()) {
        console.log('❌ No hay rondas en RONDAS_PROGRAMADAS tampoco');
        process.exit(0);
      }
    }

    const rondas = rondasSnapshot.val();
    const hoy = formatearFecha(new Date());
    const ahora = new Date();
    let rondasIncumplidas = [];
    let rondasValidadas = 0;

    console.log(`📅 Fecha de hoy: ${hoy}`);
    console.log(`⏰ Hora actual: ${ahora.getHours()}:${String(ahora.getMinutes()).padStart(2, '0')}\n`);

    // 2. Iterar cada ronda
    for (const rondasId in rondas) {
      const ronda = rondas[rondasId];
      rondasValidadas++;

      console.log(`\n🔍 Analizando: ${ronda.nombre} (ID: ${rondasId})`);
      console.log(`   Agente: ${ronda.agente}`);
      console.log(`   Horario: ${ronda.hora_inicio} - ${ronda.hora_fin}`);
      console.log(`   Tolerancia: ${ronda.tolerancia_minutos} minutos`);
      console.log(`   Frecuencia: ${ronda.frecuencia}`);

      // Validar datos
      if (!ronda.hora_inicio || !ronda.hora_fin || !ronda.agente_id) {
        console.log(`   ⚠️ Datos incompletos, omitiendo`);
        continue;
      }

      // Verificar si debe ejecutarse hoy
      if (!debeEjecutarseHoy(ronda, hoy)) {
        console.log(`   ⏭️ No debe ejecutarse hoy`);
        continue;
      }

      // Verificar tiempo límite
      const { tiempoLimiteAlcanzado, minutosRestantes } = verificarTiempoLimite(
        ronda.hora_fin,
        ronda.tolerancia_minutos || 0,
        ahora
      );

      if (!tiempoLimiteAlcanzado) {
        console.log(`   ✅ Aún dentro del tiempo permitido (faltan ${minutosRestantes} minutos)`);
        continue;
      }

      console.log(`   ⏰ TIEMPO LÍMITE ALCANZADO (${minutosRestantes} minutos atrás)`);

      // Verificar si fue completada
      const rondasCompletadasRef = db.ref(`RONDAS_COMPLETADAS/${rondasId}/${hoy}`);
      let fueCompletada = await rondasCompletadasRef.get();
      
      if (!fueCompletada.exists()) {
        if (ronda.completada === true || ronda.estado === 'COMPLETADA') {
          console.log(`   ✅ Fue completada (campo en Rondas_QR)`);
          continue;
        }
      } else {
        console.log(`   ✅ Fue completada (en RONDAS_COMPLETADAS)`);
        continue;
      }

      // RONDA INCUMPLIDA
      console.log(`   ❌ RONDA INCUMPLIDA - Registrando...`);
      rondasIncumplidas.push({
        rondasId,
        ronda,
        fecha: hoy
      });
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`Total validadas: ${rondasValidadas}`);
    console.log(`Total incumplidas: ${rondasIncumplidas.length}`);
    console.log(`${'='.repeat(50)}\n`);

    // 3. Registrar incumplidas
    if (rondasIncumplidas.length > 0) {
      console.log('📝 Guardando rondas incumplidas...\n');
      await registrarRondasIncumplidas(rondasIncumplidas);
      
      console.log('\n✅ RONDAS INCUMPLIDAS REGISTRADAS EXITOSAMENTE');
      console.log('\nVerifica en Firebase Console:');
      console.log('  1. RONDAS_INCUMPLIDAS → ' + rondasIncumplidas[0].rondasId);
      console.log('  2. NOTIFICACIONES → ' + rondasIncumplidas[0].rondasId);
    } else {
      console.log('ℹ️ No hay rondas incumplidas en este momento');
    }

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Ejecutar validación
validarRondas();
