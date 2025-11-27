/**
 * SCRIPT DE DIAGNÓSTICO SIMPLE
 * 
 * Ejecutar con:
 * cd cloud-functions
 * node DIAGNOSTICO_SIMPLE.js
 */

const admin = require('firebase-admin');

// Usar las credenciales de default (el proyecto está autenticado)
if (!admin.apps.length) {
  admin.initializeApp({
    databaseURL: 'https://incidencias-85d73-default-rtdb.firebaseio.com'
  });
}

const db = admin.database();

async function main() {
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  DIAGNÓSTICO: ¿Por qué no se crea documento?');
  console.log('════════════════════════════════════════════════════════════\n');

  try {
    // 1. Verificar que existe Rondas_QR
    console.log('1️⃣  Buscando Rondas_QR...');
    const rondasQRSnapshot = await db.ref('Rondas_QR').get();
    
    if (!rondasQRSnapshot.exists()) {
      console.log('   ❌ NO EXISTE Rondas_QR\n');
      process.exit(1);
    }

    const rondasQR = rondasQRSnapshot.val();
    const rondasIDs = Object.keys(rondasQR);
    console.log(`   ✅ Encontradas ${rondasIDs.length} rondas\n`);

    // 2. Mostrar estructura de cada ronda
    console.log('2️⃣  Analizando estructura de rondas:\n');
    
    for (let i = 0; i < Math.min(rondasIDs.length, 3); i++) {
      const id = rondasIDs[i];
      const ronda = rondasQR[id];
      
      console.log(`   📌 Ronda ${i + 1}: ${ronda.nombre || id}`);
      console.log(`      Campos disponibles:`);
      console.log(`        - nombre: ${ronda.nombre || '❌'}`);
      console.log(`        - cliente: ${ronda.cliente || '❌'}`);
      console.log(`        - horario: ${ronda.horario || '❌'}`);
      console.log(`        - horarioTermino: ${ronda.horarioTermino || '❌'}`);
      console.log(`        - hora_fin: ${ronda.hora_fin || '❌'}`);
      console.log(`        - tolerancia: ${ronda.tolerancia || '❌'}`);
      console.log(`        - tolerancia_minutos: ${ronda.tolerancia_minutos || '❌'}`);
      console.log(`        - frecuencia: ${ronda.frecuencia || '❌'}`);
      console.log(`        - agente_id: ${ronda.agente_id || '❌'}`);
      console.log(`        - id (del objeto): ${id}`);
      console.log(`        - puntosRonda: ${ronda.puntosRonda ? '✅ (OBJETO)' : '❌'}`);
      console.log(`\n`);
    }

    // 3. Verificar RONDAS_COMPLETADAS
    console.log('3️⃣  Verificando RONDAS_COMPLETADAS...\n');
    
    const rondasCompletadasSnapshot = await db.ref('RONDAS_COMPLETADAS').get();
    
    if (!rondasCompletadasSnapshot.exists()) {
      console.log('   ⚠️  RONDAS_COMPLETADAS no existe aún (será creada cuando haya rondas completadas)\n');
    } else {
      const completadas = rondasCompletadasSnapshot.val();
      console.log(`   ✅ RONDAS_COMPLETADAS existe`);
      console.log(`      Rondas: ${Object.keys(completadas).length}\n`);
      
      // Mostrar un ejemplo
      const primerRonda = Object.keys(completadas)[0];
      if (primerRonda) {
        console.log(`      Ejemplo (${primerRonda}):`);
        console.log(`        Documentos: ${Object.keys(completadas[primerRonda]).length}\n`);
      }
    }

    // 4. Diagnóstico de por qué no se crean documentos
    console.log('4️⃣  ANÁLISIS: Razones por las que NO se crean documentos\n');

    let problemasEncontrados = [];

    // Verificar la primera ronda
    if (rondasIDs.length > 0) {
      const primerRonda = rondasQR[rondasIDs[0]];
      const horaFin = primerRonda.hora_fin || primerRonda.horario || primerRonda.horarioTermino;
      const tolerancia = primerRonda.tolerancia_minutos || primerRonda.tolerancia || 0;
      const frecuencia = primerRonda.frecuencia;

      if (!horaFin) {
        problemasEncontrados.push('❌ Campo de horario no encontrado (esperaba: hora_fin, horario, o horarioTermino)');
      }

      if (!frecuencia) {
        problemasEncontrados.push('❌ Campo frecuencia no encontrado');
      }

      if (frecuencia && !['DIARIA', 'DIARIO', 'diaria', 'diario'].some(f => frecuencia.toUpperCase().includes(f))) {
        problemasEncontrados.push(`⚠️  Frecuencia "${frecuencia}" no es reconocida como DIARIA`);
      }

      // Verificar hora
      if (horaFin) {
        const ahora = new Date();
        const horaActual = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
        
        const [horaFin_h, horaFin_m] = horaFin.split(':').map(Number);
        const tiempoLimite = new Date(ahora);
        tiempoLimite.setHours(horaFin_h, horaFin_m + tolerancia, 0, 0);
        
        const pasóTiempo = ahora > tiempoLimite;
        
        if (!pasóTiempo) {
          const minutosFaltan = Math.ceil((tiempoLimite - ahora) / 60000);
          problemasEncontrados.push(`⏳ Tiempo límite aún no alcanzado (faltan ${minutosFaltan} minutos)`);
        } else {
          console.log(`   ✅ Tiempo límite YA pasó (${Math.abs(Math.ceil((tiempoLimite - ahora) / 60000))} minutos atrás)`);
        }
      }
    }

    if (problemasEncontrados.length > 0) {
      console.log('   Problemas encontrados:\n');
      problemasEncontrados.forEach(p => console.log(`   ${p}`));
      console.log('');
    } else {
      console.log('   ✅ No se encontraron problemas obvios');
      console.log('   La ronda debería ser detectada cuando se ejecute el Cloud Function\n');
    }

    // 5. Recomendaciones
    console.log('5️⃣  RECOMENDACIONES:\n');
    
    if (!problemasEncontrados.some(p => p.includes('tiempo límite aún no alcanzado'))) {
      console.log('   ✅ Espera a que el Cloud Function se ejecute (cada 5 minutos)');
      console.log('   ✅ Revisa RONDAS_COMPLETADAS en 5-10 minutos\n');
    } else {
      console.log('   ⏳ Espera a que sea después de la hora límite\n');
    }

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error de conexión:', error.message);
    console.log('\nVerifica que:');
    console.log('  1. Tienes acceso a Internet');
    console.log('  2. Firebase está configurado correctamente');
    console.log('  3. El proyecto incidencias-85d73 está activo\n');
    process.exit(1);
  }
}

main();
