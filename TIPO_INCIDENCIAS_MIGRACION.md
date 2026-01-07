# 🚀 MIGRACIÓN: TIPO_INCIDENCIAS → TIPO_INCIDENCIAS_FLAT

## ❌ PROBLEMA
La estructura jerárquica de TIPO_INCIDENCIAS causa que:
- Firestore NO puede hacer una consulta única
- Necesita múltiples loops anidados
- Faltan clientes, unidades y tipos en la tabla
- Es MUY lento (N+N+N consultas en lugar de 1)

## ✅ SOLUCIÓN
Crear una colección **plana** `TIPO_INCIDENCIAS_FLAT` con estructura simple:

```json
{
  "cliente": "LIDERMAN",
  "unidad": "CHORRILLOS",
  "tipo": "ACTO DE SEGURIDAD Y SALUD OCUPACIONAL",
  "activo": true,
  "createdAt": Timestamp
}
```

---

## 📋 PASOS A SEGUIR

### **PASO 1: Crear colección TIPO_INCIDENCIAS_FLAT en Firebase**

1. Ve a [Firebase Console](https://console.firebase.google.com)
2. Selecciona tu proyecto
3. Ve a **Firestore Database**
4. Haz clic en **Crear colección**
5. Nombre: `TIPO_INCIDENCIAS_FLAT`
6. Presiona **Continuar**
7. Presiona **Guardar** (no necesita documentos iniciales, se llenarán con la migración)

---

### **PASO 2: Ejecutar Cloud Function para migrar datos**

#### **Opción A: Desde Firebase Console (MÁS FÁCIL)**

1. Ve a **Cloud Functions** en Firebase Console
2. Haz clic en **Crear función**
3. Configura:
   - **Nombre**: `migraTipoIncidencias`
   - **Trigger**: Cloud Pub/Sub
   - **Crear nuevo tema**: `migrate-tipo-incidencias`
   - **Runtime**: Node.js 18
4. Presiona **Guardar**
5. En la pestaña **Código**, reemplaza `index.js` con el contenido de [migraTipoIncidencias.js](./cloud-functions/migraTipoIncidencias.js)
6. Presiona **Deploy**
7. Una vez deployada, haz clic en el nombre de la función
8. Ve a la pestaña **Trigger**
9. Haz clic en el tema `migrate-tipo-incidencias`
10. Presiona **Publicar mensaje**
11. En el campo **Datos del mensaje**, escribe: `{}`
12. Presiona **Publicar**

#### **Opción B: Desde Terminal (gcloud CLI)**

```bash
# 1. Asegúrate de tener gcloud instalado
gcloud functions deploy migraTipoIncidencias \
  --runtime nodejs18 \
  --trigger-topic migrate-tipo-incidencias \
  --entry-point migraTipoIncidencias

# 2. Ejecutar la función
gcloud functions call migraTipoIncidencias
```

---

### **PASO 3: Verificar migración**

1. Ve a **Firestore Database**
2. Abre la colección `TIPO_INCIDENCIAS_FLAT`
3. Deberías ver todos tus tipos de incidencia en formato plano

**Ejemplo:**
```
documento_1: { cliente: "LIDERMAN", unidad: "CHORRILLOS", tipo: "ACTO DE SEGURIDAD...", activo: true }
documento_2: { cliente: "LAP", unidad: "UNIDADES", tipo: "INTRUSIÓN", activo: true }
documento_3: { cliente: "INCHCAPE", unidad: "DERBY SURCO DFSK", tipo: "...", activo: true }
```

---

### **PASO 4: Probar en la aplicación**

1. Abre tu aplicación en `localhost:5200`
2. Ve a **Tipo Incidencia** en el menú lateral
3. Deberías ver TODOS los clientes, unidades y tipos

**Ahora debería mostrar:**
- ✅ TODOS los clientes (LIDERMAN, LAP, INCHCAPE, etc.)
- ✅ TODAS las unidades por cliente
- ✅ TODOS los tipos por unidad
- ✅ La búsqueda funciona rápidamente

---

## 📊 RESULTADO ESPERADO

| CLIENTE | UNIDAD | TIPO | ACCIONES |
|---------|--------|------|----------|
| LIDERMAN | CHORRILLOS | ACTO DE SEGURIDAD Y SALUD OCUPACIONAL | Editar |
| LIDERMAN | CHORRILLOS | ACTO DE SISTEMA MEDIO AMBIENTAL | Editar |
| LIDERMAN | LINCE | INTRUSIÓN | Editar |
| LAP | ... | ... | Editar |
| INCHCAPE | ... | ... | Editar |

---

## ⚡ VENTAJAS

| Antes (Jerárquico) | Después (Plano) |
|-------------------|-----------------|
| N+N+N consultas | 1 sola consulta |
| Muy lento | RÁPIDO |
| Faltan datos | ✅ TODOS los datos |
| Difícil de filtrar | ✅ Fácil de filtrar |

---

## 🔧 SOPORTE

Si hay problemas:

1. **No aparecen datos**: Verifica que la migración se ejecutó correctamente
2. **Pocos datos**: Revisa la colección TIPO_INCIDENCIAS original
3. **Error de permisos**: Asegúrate que la Cloud Function tiene permisos de lectura/escritura en Firestore

---

## ✅ CHECKLIST FINAL

- [ ] Colección `TIPO_INCIDENCIAS_FLAT` creada en Firestore
- [ ] Cloud Function `migraTipoIncidencias` deployada
- [ ] Migración ejecutada exitosamente
- [ ] Documentos visibles en `TIPO_INCIDENCIAS_FLAT`
- [ ] Tabla "Tipo Incidencia" en app muestra todos los clientes
- [ ] Búsqueda funciona correctamente
