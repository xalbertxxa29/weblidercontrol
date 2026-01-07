/**
 * CLOUD FUNCTION: migrarTipoIncidencias()
 * 
 * Ejecutar una sola vez en Firebase Console:
 * 1. Ir a Cloud Functions
 * 2. Crear nueva función
 * 3. Copiar este código
 * 4. Runtime: Node.js 18
 * 5. Trigger: Cloud Pub/Sub (crear tema "migrate-tipo-incidencias" o ejecutar manualmente)
 * 6. Presionar Deploy
 * 7. Ejecutar: gcloud functions call migraTipoIncidencias
 */

const admin = require('firebase-admin');
const db = admin.firestore();

async function migraTipoIncidencias() {
  try {
    console.log('🚀 Iniciando migración de TIPO_INCIDENCIAS...');
    
    const clientesSnap = await db.collection('TIPO_INCIDENCIAS').get();
    let totalDocumentos = 0;

    for (const clienteDoc of clientesSnap.docs) {
      const cliente = clienteDoc.id;
      console.log(`📦 Procesando cliente: ${cliente}`);

      const unidadesSnap = await db
        .collection('TIPO_INCIDENCIAS')
        .doc(cliente)
        .collection('UNIDADES')
        .get();

      for (const unidadDoc of unidadesSnap.docs) {
        const unidad = unidadDoc.id;

        const tiposSnap = await db
          .collection('TIPO_INCIDENCIAS')
          .doc(cliente)
          .collection('UNIDADES')
          .doc(unidad)
          .collection('TIPO')
          .get();

        for (const tipoDoc of tiposSnap.docs) {
          const tipo = tipoDoc.id;

          // Crear documento plano en TIPO_INCIDENCIAS_FLAT
          await db.collection('TIPO_INCIDENCIAS_FLAT').add({
            cliente: cliente,
            unidad: unidad,
            tipo: tipo,
            activo: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });

          totalDocumentos++;
        }
      }
    }

    console.log(`✅ Migración completada! ${totalDocumentos} documentos creados`);
    return { success: true, documentos: totalDocumentos };

  } catch (error) {
    console.error('❌ Error en migración:', error);
    throw error;
  }
}

// Exportar para Cloud Function
exports.migraTipoIncidencias = async (req, res) => {
  try {
    const resultado = await migraTipoIncidencias();
    res.status(200).json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
