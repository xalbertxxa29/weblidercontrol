/**
 * CLOUD FUNCTION: Crear ronda de prueba con tiempo ya vencido
 * URL: https://southamerica-east1-incidencias-85d73.cloudfunctions.net/crearRondaPrueba
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

exports.crearRondaPrueba = functions
  .region('southamerica-east1')
  .https
  .onRequest(async (req, res) => {
    try {
      const ahora = new Date();
      const hace30Min = new Date(ahora.getTime() - 30 * 60000);
      const horas = String(hace30Min.getHours()).padStart(2, '0');
      const minutos = String(hace30Min.getMinutes()).padStart(2, '0');

      const rondaPrueba = {
        nombre: 'RONDA_PRUEBA_VENCIDA',
        cliente: 'TEST',
        horario: `${horas}:${minutos}`,
        tolerancia: 0,
        frecuencia: 'diaria',
        createdAt: admin.firestore.Timestamp.now(),
        puntosRonda: {
          0: {
            nombre: 'Punto Test',
            codigoQR: 'TEST_QR',
            qrEscaneado: false
          }
        }
      };

      await db.collection('Rondas_QR').doc('ronda_prueba_vencida').set(rondaPrueba);

      res.json({
        success: true,
        mensaje: 'Ronda de prueba creada',
        ronda: rondaPrueba,
        ahora: ahora.toISOString(),
        horaVencida: `${horas}:${minutos}`,
        debeDetectarse: true
      });

    } catch (error) {
      res.status(500).json({
        error: error.message
      });
    }
  });
