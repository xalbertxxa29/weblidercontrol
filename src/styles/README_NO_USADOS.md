# ⚠️ Archivos CSS NO UTILIZADOS

Los siguientes archivos en la carpeta `src/styles/` **NO se están utilizando** en la aplicación actual:

## Archivos Obsoletos:

1. **filters.css** - Estilos antiguos para filtros (ahora en menu.css)
2. **filtros-resumen.css** - Estilos descontinuados 
3. **kpi-resumen-new.css** - Versión antigua del resumen
4. **kpi.css** - Archivo obsoleto de KPI
5. **responsive.css** - Responsividad antigua
6. **resumen-layout.css** - Layout antiguo (reemplazado por menu.css)

## Archivo Activo:

✅ **menu.css** - Este es el único archivo CSS que se está usando actualmente

## Razón:

Durante el desarrollo, todos los estilos fueron consolidados en `menu.css` para mantener una única fuente de verdad y evitar conflictos de CSS.

## Acción Recomendada:

- ✅ Mantener como referencia/backup (opcional)
- 🗑️ Pueden eliminarse si no se necesitan como respaldo

## HTML Reference:

El archivo `menu.html` solo carga:
```html
<link rel="stylesheet" href="menu.css" />
```

No hay referencias a ninguno de los archivos en `src/styles/`
