# Fichas de tienda — La Oca (`info.laoca.app`)

Textos listos para pegar en App Store Connect y Google Play Console.
Redactados el 2026-11-22. Revisalos antes de publicar: son una propuesta, no
una decisión tomada.

## Criterio de redacción (leer antes de editar)

El texto posiciona la app como **producto general para negocios con varios
locales**, no como herramienta interna de La Oca. No es maquillaje: el registro
deja crear un negocio nuevo o sumarse a uno con código de invitación
(`supabase/functions/make-server-6d979413/index.ts:564`), así que cualquiera
puede usarla.

Importa para la revisión: Apple rechaza por la guía **4.2 (Minimum
Functionality)** las apps que solo sirven a la empresa que las publica, y
empuja esos casos a Apple Business Manager / Custom Apps. Si la ficha dijera
"sistema interno de La Oca", nos estaríamos metiendo solos en ese camino.
Describir lo que la app realmente hace —multi-negocio, autoservicio— es lo
correcto y además es lo más seguro.

No prometer nada que no esté: cada línea de abajo corresponde a una pantalla
que existe hoy.

---

# App Store

### Nombre (máx. 30)
```
La Oca: Pedidos y Stock
```
> 23 caracteres. El nombre del ícono en el teléfono sigue siendo "La Oca"
> (`capacitor.config.ts` → `appName`); el de la ficha puede ser más descriptivo
> y ayuda a que la encuentren.

### Subtítulo (máx. 30)
```
Pedidos entre locales y bodega
```
> 30 justos.

### Texto promocional (máx. 170, se puede cambiar sin nueva versión)
```
Tus locales piden desde el teléfono, la bodega despacha con la guía impresa y el stock se descuenta solo. Sin planillas, sin mensajes de WhatsApp perdidos.
```

### Descripción (máx. 4000)
```
La Oca conecta tus locales con la bodega o el taller central. Cada local pide
desde el teléfono, quien despacha ve todos los pedidos en una sola pantalla, y
el stock se ajusta solo al preparar y entregar.

Pensada para negocios con varios puntos de venta: panaderías, pastelerías,
distribuidoras, cadenas de locales y cualquier operación donde un centro
abastece a varias sucursales.

PEDIDOS
• Cada local arma su pedido desde el catálogo, con precios actualizados.
• Historial completo con filtros, para revisar qué se pidió y cuándo.
• Edición de pedidos ya hechos, con el stock recalculado al instante.
• Puedes limitar qué categorías ve y pide cada local.

DESPACHO Y PRODUCCIÓN
• Panel de despacho con todos los pedidos del día en una pantalla.
• Guías de entrega listas para imprimir, en formato estándar o térmico.
• Vista de producción por área de trabajo, al estilo de una pantalla de cocina.

STOCK
• Descuento automático al preparar y despachar.
• Control por lotes con consumo FIFO: sale primero lo que entró primero.
• Ajustes manuales con registro de quién los hizo.
• Alertas de stock mínimo para no quedarte sin un producto.

PRODUCTOS
• Catálogo con fotos, categorías, SKU y precios.
• Escáner de códigos de barras con la cámara del teléfono.
• Fichas de etiquetado nutricional e ingredientes, con alérgenos.

ANALÍTICAS
• Ventas por local, por producto y por período.
• Valor del inventario y rotación.

EQUIPO
• Roles distintos para administración, bodega, producción y locales: cada uno
  ve solo lo que le toca.
• Invitación de miembros con un código.
• Notificaciones configurables por tipo, para que cada uno reciba lo suyo.

CÓMO EMPEZAR
Creá una cuenta, registrá tu negocio y sumá a tu equipo con el código de
invitación que te entrega la app. Si tu negocio ya está en La Oca, pedile el
código a quien lo administra.

La app necesita conexión a internet y acceso a la cámara solo para escanear
códigos de barras.
```

### Palabras clave (máx. 100, separadas por coma, sin espacios)
```
inventario,distribuidora,panaderia,despacho,bodega,reposicion,proveedor,sucursal,catalogo,mayorista
```
> 99 caracteres. **No** repetir palabras que ya están en el nombre o el
> subtítulo ("pedidos", "stock", "locales"): Apple ya las indexa de ahí y
> repetirlas desperdicia el cupo.

### URLs
| Campo | Valor |
|---|---|
| Privacy Policy URL | `https://conectocadev.netlify.app/privacidad.html` |
| Support URL | `https://conectocadev.netlify.app/soporte.html` — creada el 2026-11-22 (`public/soporte.html`). **Todavía no desplegada:** vive en la rama, hay que subirla a Netlify antes de poner la URL en la ficha |
| Marketing URL | opcional, se puede dejar vacío |

### Categoría
- Primaria: **Business**
- Secundaria: **Productivity**

### Clasificación por edad
Todas las preguntas del cuestionario en **None / Ninguno**. Resultado esperado:
**4+**. La app no tiene contenido generado por usuarios visible al público, ni
apuestas, ni contenido para adultos.

### App Privacy — qué declarar

Marcar **"Yes, we collect data from this app"**.

| Tipo de dato | ¿Se recoge? | Uso | Vinculado a identidad | Para rastreo |
|---|---|---|---|---|
| Email | Sí | Funcionalidad de la app, autenticación | Sí | No |
| Nombre | Sí | Funcionalidad de la app | Sí | No |
| User ID | Sí | Funcionalidad de la app | Sí | No |
| Fotos (imágenes de producto) | Sí | Funcionalidad de la app | Sí | No |
| Otros datos (pedidos, productos, stock del negocio) | Sí | Funcionalidad de la app | Sí | No |

- **Tracking: NO.** La app no tiene SDK de publicidad ni analítica de terceros,
  así que no corresponde el permiso de App Tracking Transparency.
- **Cámara:** se usa para escanear códigos de barras y **no se guarda ninguna
  imagen** de la cámara. La cámara no es un "tipo de dato recogido" en este
  formulario; va declarada como permiso en `Info.plist`
  (`NSCameraUsageDescription`), que ya está.
- Si alguna de estas afirmaciones deja de ser cierta (por ejemplo si se agrega
  analítica), hay que actualizar el formulario: Apple lo audita.

### App Review Information

```
Sign-in required: Yes
Usuario:    contacto@laoca.info
Contraseña: (la que guardó el dueño — NO está en el repo)
```

Notas para el revisor:
```
La cuenta de prueba es administradora del negocio "Panadería Demo", que ya
tiene productos, categorías y un área de producción cargados, de modo que todas
las pantallas tienen datos.

La app requiere cuenta porque cada negocio ve solo sus propios productos,
pedidos y stock. Cualquiera puede registrarse y crear su propio negocio desde
la pantalla de inicio de sesión ("Crear negocio"), o sumarse a uno existente
con un código de invitación.

El acceso a la cámara se usa únicamente para escanear códigos de barras de
productos (Productos → escanear). No se almacena ninguna imagen de la cámara.

La cuenta se puede eliminar desde la app: Mi cuenta → Eliminar cuenta.
```

---

# Google Play

### Nombre de la app (máx. 30)
```
La Oca: Pedidos y Stock
```

### Descripción corta (máx. 80)
```
Tus locales piden, la bodega despacha y el stock se descuenta solo.
```
> 67 caracteres.

### Descripción completa (máx. 4000)
Usar la misma que la de App Store (arriba). Play acepta el mismo texto; los
viñetas con `•` se renderizan bien.

### Categoría y etiquetas
- Categoría: **Empresa** (Business)
- Etiquetas sugeridas: Inventario, Gestión de empresas, Productividad

### Datos de contacto
| Campo | Valor |
|---|---|
| Correo | `contacto@laoca.info` |
| Sitio web | `https://conectocadev.netlify.app` |
| Política de privacidad | `https://conectocadev.netlify.app/privacidad.html` |

### Data safety — qué responder

- ¿Tu app recopila o comparte datos de usuario? → **Sí**
- ¿Los datos están cifrados en tránsito? → **Sí** (todo va por HTTPS a Supabase)
- ¿Los usuarios pueden pedir que se eliminen sus datos? → **Sí**, y hay
  eliminación de cuenta dentro de la app (Mi cuenta → Eliminar cuenta). Indicar
  esa ruta cuando lo pregunte.

| Categoría | Tipo | Recogido | Compartido | Obligatorio | Propósito |
|---|---|---|---|---|---|
| Información personal | Nombre | Sí | No | Sí | Funciones de la app |
| Información personal | Dirección de correo | Sí | No | Sí | Funciones de la app, gestión de la cuenta |
| Información personal | User ID | Sí | No | Sí | Funciones de la app |
| Fotos y videos | Fotos | Sí | No | No | Funciones de la app (imágenes de producto) |
| Actividad en la app | Otras acciones | Sí | No | Sí | Funciones de la app (pedidos, stock) |

- **Compartido: No** en todo. Los datos van solo al backend propio (Supabase);
  "compartir" en el formulario de Google significa entregarlos a un tercero, y
  un proveedor de infraestructura no cuenta.
- La app **no** recoge ubicación, contactos, mensajes, ni datos financieros.

### Clasificación de contenido (cuestionario IARC)
Todo en **No**. Es una app de gestión: sin violencia, sin contenido sexual, sin
lenguaje ofensivo, sin apuestas, sin compras dentro de la app, sin contenido
generado por usuarios de acceso público. Resultado esperado: **para todos los
públicos**.

### Audiencia objetivo
- Edad: **18 y más** (es una herramienta de trabajo).
- No dirigida a menores → evita las obligaciones de Families Policy.

---

## Pendientes antes de poder completar las fichas

1. **Support URL para Apple** — es obligatoria y hoy no existe. Decidir entre
   una página de contacto en el sitio o usar el correo.
2. **Contraseña del revisor** — la tiene el dueño, no está en el repo.
3. **Capturas** — ver la tarea #16: las actuales muestran nombres de locales y
   montos de venta reales.
4. **Gráfico de funciones 1024×500** para Play — tarea #9.
