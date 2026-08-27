# Restricción de edición de pedidos por perfil

## Objetivo

Una vez creado un pedido, solo los perfiles `dispatch` (Distribución) y `admin`
pueden modificarlo. Los perfiles `local`, `production` y los demás no deben
tener acceso a esa operación.

## Diseño

- La interfaz calcula el permiso a partir del rol actual y muestra los controles
  de edición únicamente a `dispatch` y `admin`.
- El formulario de edición recibe el rol del usuario y se cierra o bloquea si no
  está autorizado, evitando aperturas desde rutas o estados de interfaz no
  previstos.
- El endpoint `PUT /orders/:id` obtiene el perfil del usuario autenticado y
  rechaza con HTTP 403 a cualquier rol distinto de `dispatch` o `admin` antes de
  aplicar cambios de pedido o inventario.
- Se conserva la edición para Distribución y Admin, incluidos los estados de
  pedido que la aplicación actualmente permite editar (`pending`,
  `in_progress`, `completed`).

## Pruebas

- Prueba unitaria de la regla de roles: solo `dispatch` y `admin` reciben
  permiso de edición.
- Compilación de TypeScript/Vite para comprobar los componentes afectados.
- Revisión estática del endpoint para confirmar que la validación ocurre antes
  de cualquier actualización.

## Fuera de alcance

- No cambian permisos para crear, eliminar, cambiar estado ni marcar pedidos
  como recibidos.
- No se modifica el flujo de despacho ni el catálogo.
