/**
 * SCRIPT: Configurar índices en Firestore para los logs
 * 
 * Ejecutar con:
 * firebase firestore:indexes --project=incidencias-85d73
 * 
 * O crear manualmente desde la consola de Firebase
 */

// ============================================================================
// ÍNDICES RECOMENDADOS PARA OPTIMIZAR QUERIES
// ============================================================================

/*
Para que el sistema de logs funcione óptimamente, crear los siguientes índices
compuestos en Firestore:

1. Para obtenerLogsPorUsuario()
   Colección: logs
   Campos:
   - usuario (Ascending)
   - timestamp (Descending)
   
   Query que usa:
   db.collection('logs')
     .where('usuario', '==', usuario)
     .orderBy('timestamp', 'desc')
     .limit(100)

2. Para obtenerLogsPorTipoAccion()
   Colección: logs
   Campos:
   - tipoAccion (Ascending)
   - timestamp (Descending)
   
   Query que usa:
   db.collection('logs')
     .where('tipoAccion', '==', tipoAccion)
     .orderBy('timestamp', 'desc')
     .limit(100)

3. Para obtenerLogsPorColeccion()
   Colección: logs
   Campos:
   - coleccion (Ascending)
   - timestamp (Descending)
   
   Query que usa:
   db.collection('logs')
     .where('coleccion', '==', coleccion)
     .orderBy('timestamp', 'desc')
     .limit(100)

4. Para obtenerHistorialDocumento()
   Colección: logs
   Campos:
   - coleccion (Ascending)
   - documentoId (Ascending)
   - timestamp (Descending)
   
   Query que usa:
   db.collection('logs')
     .where('coleccion', '==', coleccion)
     .where('documentoId', '==', documentoId)
     .orderBy('timestamp', 'desc')
     .limit(50)

5. Para búsquedas por rango de fechas (opcional)
   Colección: logs
   Campos:
   - coleccion (Ascending)
   - timestamp (Ascending)
   
   Query que usa:
   db.collection('logs')
     .where('coleccion', '==', coleccion)
     .where('timestamp', '>=', fechaInicio)
     .where('timestamp', '<=', fechaFin)
     .orderBy('timestamp', 'desc')

6. Búsqueda por usuario y tipo de acción (opcional)
   Colección: logs
   Campos:
   - usuario (Ascending)
   - tipoAccion (Ascending)
   - timestamp (Descending)
   
   Query que usa:
   db.collection('logs')
     .where('usuario', '==', usuario)
     .where('tipoAccion', '==', tipoAccion)
     .orderBy('timestamp', 'desc')
*/

// ============================================================================
// PASOS PARA CREAR ÍNDICES MANUALMENTE
// ============================================================================

/*
1. Ir a Firebase Console:
   https://console.firebase.google.com/project/incidencias-85d73/firestore

2. Seleccionar "Firestore Database"

3. Ir a la pestaña "Índices"

4. Crear cada uno de los índices arriba descritos

5. Alternativamente, ejecutar desde CLI:
   firebase firestore:indexes --project=incidencias-85d73

   O crear un archivo firestore.indexes.json en la raíz del proyecto:
*/

// Ejemplo de firestore.indexes.json:
const firestoreIndexes = {
  "indexes": [
    {
      "collectionGroup": "logs",
      "queryScope": "Collection",
      "fields": [
        { "fieldPath": "usuario", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "logs",
      "queryScope": "Collection",
      "fields": [
        { "fieldPath": "tipoAccion", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "logs",
      "queryScope": "Collection",
      "fields": [
        { "fieldPath": "coleccion", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "logs",
      "queryScope": "Collection",
      "fields": [
        { "fieldPath": "coleccion", "order": "ASCENDING" },
        { "fieldPath": "documentoId", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "logs",
      "queryScope": "Collection",
      "fields": [
        { "fieldPath": "usuario", "order": "ASCENDING" },
        { "fieldPath": "tipoAccion", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    }
  ]
};

// ============================================================================
// ESTRUCTURA DE SEGURIDAD (Firestore Rules)
// ============================================================================

/*
Las reglas de seguridad deben permitir:
1. Lectura de logs SOLO a usuarios autenticados
2. Escritura de logs SOLO desde Cloud Functions
3. No permitir eliminación de logs (auditoría inmutable)

Agregar a firestore.rules:

match /logs/{document=**} {
  // Solo lectura para usuarios autenticados
  allow read: if request.auth != null;
  
  // Solo escritura desde Cloud Functions
  allow write: if false;
  
  // Crear logs desde backend (Cloud Functions)
  allow create: if request.auth.uid != null || request.resource.data.sistema == 'weblidercontrol';
}

O más restrictivo:

match /logs/{document=**} {
  // Nadie puede leer/escribir directamente (solo Cloud Functions)
  allow read, write: if false;
}
*/

// ============================================================================
// LIMPIEZA Y MANTENIMIENTO (Opcional)
// ============================================================================

/*
Para archivar logs antiguos después de 90 días:

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const db = admin.firestore();

exports.archivarLogsAntiguos = functions
  .pubsub
  .schedule('0 2 * * *') // Diariamente a las 2 AM
  .onRun(async (context) => {
    const hace90Dias = new Date();
    hace90Dias.setDate(hace90Dias.getDate() - 90);
    
    const snapshot = await db.collection('logs')
      .where('timestamp', '<', admin.firestore.Timestamp.fromDate(hace90Dias))
      .get();
    
    let batch = db.batch();
    let count = 0;
    
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
      count++;
      
      if (count === 500) {
        batch.commit();
        batch = db.batch();
        count = 0;
      }
    });
    
    if (count > 0) {
      await batch.commit();
    }
    
    console.log(`✓ ${snapshot.size} logs antiguos archivados`);
    return null;
  });
*/

// ============================================================================
// SCRIPT PARA VERIFICAR LA COLECCIÓN LOGS
// ============================================================================

async function verificarColeccionLogs() {
  const admin = require('firebase-admin');
  const db = admin.firestore();
  
  try {
    // Contar documentos en logs
    const snapshot = await db.collection('logs').get();
    console.log(`Total de logs: ${snapshot.size}`);
    
    // Logs más recientes
    const recientes = await db.collection('logs')
      .orderBy('timestamp', 'desc')
      .limit(5)
      .get();
    
    console.log('\n📋 Últimos 5 logs:');
    recientes.forEach(doc => {
      const log = doc.data();
      console.log(`- ${log.timestamp}: ${log.usuario} - ${log.tipoAccion}`);
    });
    
    // Logs por tipo de acción
    const porTipo = await db.collection('logs')
      .get();
    
    const tiposAccion = {};
    porTipo.forEach(doc => {
      const tipo = doc.data().tipoAccion;
      tiposAccion[tipo] = (tiposAccion[tipo] || 0) + 1;
    });
    
    console.log('\n📊 Logs por tipo de acción:');
    Object.entries(tiposAccion).forEach(([tipo, count]) => {
      console.log(`- ${tipo}: ${count}`);
    });
    
    // Logs por usuario (top 5)
    const porUsuario = {};
    porTipo.forEach(doc => {
      const usuario = doc.data().usuario;
      porUsuario[usuario] = (porUsuario[usuario] || 0) + 1;
    });
    
    const top5Usuarios = Object.entries(porUsuario)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    console.log('\n👥 Top 5 usuarios más activos:');
    top5Usuarios.forEach(([usuario, count]) => {
      console.log(`- ${usuario}: ${count} acciones`);
    });
    
  } catch (error) {
    console.error('Error verificando logs:', error);
  }
}

module.exports = {
  firestoreIndexes,
  verificarColeccionLogs
};
