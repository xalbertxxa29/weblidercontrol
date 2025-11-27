/**
 * SCRIPT DIAGNOSTICO - Para entender qué está pasando
 * Ejecuta manualmente la validación de rondas
 */

const admin = require('firebase-admin');
const path = require('path');

// Obtener credenciales del proyecto
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
let serviceAccount;

try {
  serviceAccount = require(serviceAccountPath);
  console.log('✓ Archivo de credenciales encontrado');
} catch (e) {
  console.error('❌ No se encontró serviceAccountKey.json');
  console.log('   Intenta descargar las credenciales de Firebase Console:');
  console.log('   Proyecto Settings > Service Accounts > Generate New Private Key');
  process.exit(1);
}

// Inicializar
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://incidencias-85d73-default-rtdb.firebaseio.com'
});

const db = admin.database();

// Funciones copiadas del Cloud Function
function formatearFecha(fecha) {
  const año = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${año}-${mes}-${dia}`;
}

function debeEjecutarseHoy(ronda, fechaHoy) {
  if (!ronda.frecuencia) {
    console.log('   ⚠️ Sin campo frecuencia');
    return false;
  }

  const diaSemana = new Date(`${fechaHoy}T00:00:00`).toLocaleDateString('es-ES', {
    weekday: 'long'
  }).toUpperCase();

  const frecuencia = (ronda.frecuencia || '').toUpperCase().trim();

  if (frecuencia === 'DIARIA' || frecuencia === 'DIARIO') return true;
  if (frecuencia === 'LUNES_VIERNES' && ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES'].includes(diaSemana)) return true;
  if (frecuencia === 'FINES_SEMANA' && ['SÁBADO', 'DOMINGO'].includes(diaSemana)) return true;
  if (frecuencia.includes(diaSemana)) return true;
  if (frecuencia.includes('DIARIA')) return true;

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

async function diagnosticar() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║          DIAGNÓSTICO DE RONDAS INCUMPLIDAS                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const hoy = formatearFecha(new Date());
  const ahora = new Date();
  
  console.log(`📅 Fecha: ${hoy}`);
  console.log(`⏰ Hora: ${ahora.getHours()}:${String(ahora.getMinutes()).padStart(2, '0')}`);
  console.log(`🕐 UTC: ${ahora.toISOString()}\n`);

  try {
    // 1. Obtener rondas
    console.log('📍 PASO 1: Buscando rondas...\n');
    
    let rondasSnapshot = await db.ref('Rondas_QR').get();
    
    if (!rondasSnapshot.exists()) {
      console.log('❌ No hay rondas en Rondas_QR, buscando en RONDAS_PROGRAMADAS...');
      rondasSnapshot = await db.ref('RONDAS_PROGRAMADAS').get();
      
      if (!rondasSnapshot.exists()) {
        console.log('❌ No hay rondas en RONDAS_PROGRAMADAS tampoco');
        process.exit(0);
      }
    }

    const rondas = rondasSnapshot.val();
    console.log(`✅ Encontradas ${Object.keys(rondas).length} rondas\n`);

    // 2. Verificar cada ronda
    let incumplidas = 0;
    
    for (const rondasId in rondas) {
      const ronda = rondas[rondasId];
      
      console.log(`\n🔍 Ronda: ${ronda.nombre || rondasId}`);
      console.log(`   ID: ${rondasId}`);
      console.log(`   Cliente: ${ronda.cliente || 'N/A'}`);
      
      // Verificar campos
      let horaFin = ronda.hora_fin || ronda.horario || ronda.horarioTermino;
      let tolerancia = ronda.tolerancia_minutos || ronda.tolerancia || 0;
      
      console.log(`   Horario: ${horaFin || '❌ NO ENCONTRADO'}`);
      console.log(`   Tolerancia: ${tolerancia} minutos`);
      console.log(`   Frecuencia: ${ronda.frecuencia || '❌ NO ENCONTRADA'}`);
      
      if (!horaFin) {
        console.log(`   ⏭️ OMITIDA: Sin horario\n`);
        continue;
      }

      // Verificar si debe ejecutarse hoy
      if (!debeEjecutarseHoy(ronda, hoy)) {
        console.log(`   ⏭️ OMITIDA: No debe ejecutarse hoy\n`);
        continue;
      }

      // Verificar tiempo límite
      const { tiempoLimiteAlcanzado, minutosRestantes } = verificarTiempoLimite(
        horaFin,
        tolerancia,
        ahora
      );

      if (!tiempoLimiteAlcanzado) {
        console.log(`   ⏳ EN TIEMPO: Faltan ${minutosRestantes} minutos\n`);
        continue;
      }

      console.log(`   ⏰ TIEMPO LÍMITE PASADO: Hace ${Math.abs(minutosRestantes)} minutos\n`);

      // Verificar si fue completada
      const rondasCompletadasRef = db.ref(`RONDAS_COMPLETADAS/${rondasId}/${hoy}`);
      const fueCompletada = await rondasCompletadasRef.get();

      if (fueCompletada.exists()) {
        console.log(`   ✅ COMPLETADA: Existe en RONDAS_COMPLETADAS\n`);
        continue;
      }

      console.log(`   ❌ NO COMPLETADA: No existe en RONDAS_COMPLETADAS`);
      console.log(`   🔴 ESTADO: INCUMPLIDA\n`);
      
      incumplidas++;
    }

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log(`║  RESULTADO: ${incumplidas} ronda(s) incumplida(s)                        ║`);
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

diagnosticar();
