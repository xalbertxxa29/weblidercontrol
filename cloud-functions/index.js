/**
 * INDEX.JS - Exportar todas las Cloud Functions
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Exportar funciones de validación
exports.validarRondasIncumplidas = require('./validarRondasIncumplidas').validarRondasIncumplidas;
exports.validarRondasDiarias = require('./validarRondasDiarias').validarRondasDiarias;
exports.validarRondasDiariasHTTP = require('./validarRondasDiarias').validarRondasDiariasHTTP;
exports.validarRondasManual = require('./validarManual').validarRondasManual;

exports.crearRondaEn2Min = require('./crearRondaEn2Min').crearRondaEn2Min;
exports.verDetallesRonda = require('./verDetallesRonda').verDetallesRonda;

// Funciones Administrativas
exports.adminResetPassword = require('./adminUsers').adminResetPassword;
exports.corregirRondasHistoricas = require('./corregirHistorico').corregirRondasHistoricas;

// Función de diagnóstico
exports.diagnostico = functions
  .region('southamerica-east1')
  .https
  .onRequest(async (req, res) => {
    try {
      const resultado = {
        timestamp: new Date().toISOString(),
        colecciones: {}
      };

      // Obtener todas las colecciones
      const colecciones = await db.listCollections();
      resultado.coleccionesEncontradas = colecciones.map(c => c.id);

      // Analizar cada colección
      for (const colRef of colecciones) {
        const docs = await colRef.limit(3).get();

        resultado.colecciones[colRef.id] = {
          totalDocs: docs.size,
          primerosDocs: []
        };

        docs.forEach(doc => {
          resultado.colecciones[colRef.id].primerosDocs.push({
            id: doc.id,
            campos: Object.keys(doc.data())
          });
        });
      }

      res.json(resultado);

    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({
        error: error.message
      });
    }
  });
