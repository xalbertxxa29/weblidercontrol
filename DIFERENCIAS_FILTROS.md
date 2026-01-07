# 📋 DIFERENCIAS DE FILTROS: CLIENTE Y UNIDAD

## 🔍 Comparación de las 3 secciones

### 1️⃣ **CREAR QR** (menu.html línea 1020-1048)
```javascript
// Selectores HTML planos (sin Choices.js)
<select id="qr-cliente" required></select>
<select id="qr-unidad" required></select>

// Event listener directo
qrCliente.addEventListener('change', async () => {
  const selectedCliente = qrCliente.value;  // ✅ Valor directo
  // ... cargar unidades ...
  qrUnidad.innerHTML = '<option>...</option>';  // ✅ HTML directo
});
```


TIPO_INCIDENCIAS/
  ├─ CLIENTE_A/
  │  └─ UNIDADES/
  │     ├─ UNIDAD_1/
  │     │  └─ TIPO/
  │     │     ├─ TIPO_1/
  │     │     │      └─ sub categoria1/
  │     │     │      └─ sub categoria2
  │     │     └─ TIPO_2/
  │     │
  │     └─ UNIDAD_2/
  │        └─ TIPO/
  │           └─ TIPO_3/



### 2️⃣ **CREAR RONDAS** (menu.html línea 1204-1210)
```javascript
// Selectores HTML planos (sin Choices.js)
<select id="ronda-cliente" required></select>
<select id="ronda-unidad" required></select>

// Event listener directo (IGUAL que CREAR QR)
rondaCliente.addEventListener('change', async () => {
  const selectedCliente = rondaCliente.value;  // ✅ Valor directo
  // ... cargar unidades ...
  rondaUnidad.innerHTML = '<option>...</option>';  // ✅ HTML directo
});
```

---

### 3️⃣ **KPI - RESUMEN** (menu.html línea 127-131)
```javascript
// Selectores HTML planos PERO se convierten a Choices.js
<select id="resumen-filtro-cliente"></select>
<select id="resumen-filtro-unidad"></select>

// Se convierten a Choices.js
resumenChoices.cliente = new Choices('#resumen-filtro-cliente', cfg);
resumenChoices.unidad = new Choices('#resumen-filtro-unidad', cfg);

// Event listener se llama a function update
clienteSelect.addEventListener('change', async () => {
  await updateResumenUnidadesPorCliente();
});

// Dentro de updateResumenUnidadesPorCliente:
const cliente = clienteSelect?.value || '';  // ⚠️ Valor puede ser diferente en Choices
// ... cargar unidades ...
resumenChoices.unidad.setChoices([...]);  // ✅ Usa setChoices de Choices.js
```

---

## ⚠️ **DIFERENCIA CLAVE ENCONTRADA**

| Sección | Tipo de Select | Valor | Actualización |
|---------|----------------|-------|---------------|
| **Crear QR** | HTML plano | `.value` directo | `.innerHTML` |
| **Crear Rondas** | HTML plano | `.value` directo | `.innerHTML` |
| **KPI Resumen** | **Choices.js** | `.value` (puede ser diferente) | `.setChoices()` |

---

## 🐛 **PROBLEMA POTENCIAL**

Cuando usas **Choices.js**, el valor puede NO coincidir exactamente con lo que esperas:

```javascript
// En Choices.js
const cliente = clienteSelect.value;  // Podrías obtener "TODOS" en lugar de "Todos"
// ❌ Comparación fallará: cliente === 'Todos'
```

---

## ✅ **SOLUCIÓN: USAR CHOICES.JS MÉTODO CORRECTO**

Con Choices.js debes usar `.getValue(true)`:

```javascript
// CORRECTO para Choices.js
const cliente = resumenChoices.cliente.getValue(true);  // Retorna el valor seleccionado

// En updateResumenUnidadesPorCliente:
if (cliente === 'Todos' || !cliente) { ... }
```

---

## 📝 **RESUMEN DE DIFERENCIAS**

1. ✅ **Crear QR** - Usa selectores HTML planos → Acceso directo a `.value`
2. ✅ **Crear Rondas** - Usa selectores HTML planos → Acceso directo a `.value`
3. ⚠️ **KPI Resumen** - Usa Choices.js → Debe usar `.getValue(true)` o `.value` del select original

---

## 🔧 **RECOMENDACIÓN**

Para mantener consistencia, en **KPI Resumen** deberías:
- Usar `document.getElementById('resumen-filtro-cliente').value` directamente
- O usar `resumenChoices.cliente.getValue(true)` si usas Choices.js

Actualizar línea 854 de:
```javascript
const cliente = clienteSelect?.value || '';
```

A:
```javascript
const cliente = resumenChoices.cliente.getValue(true) || '';
```
