/**
 * Autorización centralizada de make-server.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO: antes cada una de las ~60 rutas repetía a mano
 * el par "chequear rol" + "chequear que el recurso sea de mi negocio". Cuatro
 * rutas de recetas, el GET de un pedido y el POST de notificaciones se
 * olvidaron de la segunda mitad, y las rutas de productos se olvidaron de la
 * primera. Ese es exactamente el modo de falla que tiene una regla copiada a
 * mano en 60 lugares: no se nota lo que falta, porque no hay con qué
 * compararlo. Acá la matriz está escrita una sola vez y es lo que se compara.
 *
 * El módulo es PURO a propósito (no importa Supabase ni Hono): así se puede
 * probar con `node --test`, que es lo único que corre en este entorno — no hay
 * Deno instalado para ejercitar el Edge Function completo.
 */

export type Rol =
  | 'admin'
  | 'production'
  | 'dispatch'
  | 'pastry'
  | 'local'
  | 'worker'
  | 'user';

/** Lo mínimo que necesita saber la autorización sobre quién pide. */
export interface PerfilAutorizable {
  role?: string | null;
  businessId?: string | null;
}

/**
 * Permisos de la aplicación. El nombre describe la ACCIÓN, no la ruta: varias
 * rutas comparten permiso (las cuatro de recetas, por ejemplo) y es justamente
 * eso lo que hace que no se puedan desincronizar entre sí.
 */
export type Permiso =
  // Catálogo
  | 'productos.leer'
  | 'productos.escribir'
  | 'productos.kardex'
  | 'categorias.gestionar'
  | 'areas.gestionar'
  // Materias primas, recetas y etiquetado
  | 'materias_primas.gestionar'
  | 'recetas.leer'
  | 'recetas.gestionar'
  | 'nutricion.leer'
  | 'etiquetas.generar'
  | 'etiquetas.configurar'
  // Pedidos
  | 'pedidos.leer_de_otros'
  | 'pedidos.editar'
  | 'pedidos.cambiar_estado'
  | 'pedidos.cambiar_estado_area'
  // Operación interna
  | 'produccion.ordenes'
  | 'asistencia.ver_de_otros'
  | 'asistencia.gestionar'
  | 'notificaciones.enviar_a_otros'
  | 'negocio.ver_miembros';

/**
 * Matriz rol → permisos. Única fuente de verdad.
 *
 * Criterio de cada fila: reproducir el permiso que la ruta YA aplicaba, para no
 * alterar la lógica comercial, salvo donde no había ninguno. Los tres casos que
 * ESTRECHAN el permiso respecto del comportamiento anterior están marcados con
 * [ESTRECHA] y se eligieron para que coincidan con lo que la propia interfaz ya
 * muestra (mismo criterio que el proyecto venía usando en ROLES_MATERIAS_PRIMAS):
 * si la pantalla nunca se le ofreció a un rol, el servidor tampoco debería
 * aceptarle la escritura.
 */
const MATRIZ: Record<Permiso, readonly Rol[]> = {
  // Cualquier miembro del negocio ve el catálogo: es la base de armar un pedido.
  'productos.leer': ['admin', 'production', 'dispatch', 'pastry', 'local', 'worker', 'user'],

  // [ESTRECHA] Antes POST/PUT/DELETE /products solo exigían tener negocio, sin
  // rol: un `local` podía cambiar precios y stock de todo el negocio por API.
  // La pantalla de Gestión de Productos solo se le ofrece a admin y production
  // (App.tsx:1953).
  'productos.escribir': ['admin', 'production'],

  'productos.kardex': ['admin', 'production'],

  // El servidor ya era admin-only acá, aunque la pantalla de categorías se le
  // ofrece también a production (App.tsx:1971). Se conserva admin-only: abrirlo
  // sería relajar un permiso, y eso no es trabajo de un endurecimiento.
  'categorias.gestionar': ['admin'],
  'areas.gestionar': ['admin'],

  'materias_primas.gestionar': ['admin', 'production'],

  // [ESTRECHA] GET /products/:id/ingredients no chequeaba rol: exponía la receta
  // y el costo por unidad de cada materia prima a cualquier usuario autenticado.
  // Se alinea con sus tres rutas hermanas de escritura.
  'recetas.leer': ['admin', 'production'],
  'recetas.gestionar': ['admin', 'production'],

  'nutricion.leer': ['admin', 'production', 'dispatch', 'pastry', 'local', 'worker', 'user'],
  'etiquetas.generar': ['admin', 'production'],
  'etiquetas.configurar': ['admin'],

  // "Staff": ve los pedidos de todo el negocio, no solo los propios.
  'pedidos.leer_de_otros': ['admin', 'production', 'dispatch', 'pastry'],
  'pedidos.editar': ['admin', 'dispatch', 'production'],
  'pedidos.cambiar_estado': ['admin', 'production', 'dispatch', 'pastry'],
  'pedidos.cambiar_estado_area': ['admin', 'production', 'dispatch'],

  'produccion.ordenes': ['admin', 'production'],
  'asistencia.ver_de_otros': ['admin', 'production'],
  'asistencia.gestionar': ['admin'],

  // [ESTRECHA] POST /notifications aceptaba cualquier targetUserId de cualquier
  // usuario autenticado: se podía escribir en la bandeja de cualquier persona
  // de cualquier negocio. Notificar a otro es una acción de operación.
  'notificaciones.enviar_a_otros': ['admin', 'production', 'dispatch'],

  // [ESTRECHA] Devolvía nombre, correo, rol y fecha de alta de todo el negocio a
  // cualquier rol. El listado de miembros es una pantalla de administración.
  'negocio.ver_miembros': ['admin'],
};

/** Permisos de un rol. Rol desconocido o ausente ⇒ ninguno. */
export function permisosDeRol(role?: string | null): Permiso[] {
  if (!role) return [];
  return (Object.keys(MATRIZ) as Permiso[]).filter(p =>
    (MATRIZ[p] as readonly string[]).includes(role)
  );
}

/** ¿Este perfil tiene este permiso? No dice nada sobre el negocio del recurso. */
export function tienePermiso(perfil: PerfilAutorizable | null | undefined, permiso: Permiso): boolean {
  const role = perfil?.role;
  if (!role) return false;
  return (MATRIZ[permiso] as readonly string[]).includes(role);
}

export interface ResultadoAutorizacion {
  ok: boolean;
  /** Código HTTP a devolver cuando `ok` es false. */
  status?: 403 | 404;
  /** Mensaje a devolver cuando `ok` es false. */
  error?: string;
}

const OK: ResultadoAutorizacion = { ok: true };

export interface OpcionesAutorizacion {
  perfil: PerfilAutorizable | null | undefined;
  permiso: Permiso;
  /**
   * `business_id` del recurso que se está tocando, cuando la ruta carga un
   * recurso existente. `undefined` = la ruta no toca un recurso concreto
   * (listados y creaciones, que ya quedan acotadas por el businessId del
   * perfil). `null` = el recurso existe pero no tiene negocio asignado, que se
   * trata como "no es mío".
   */
  recursoBusinessId?: string | null;
}

/**
 * Chequeo completo: pertenencia a un negocio, permiso por rol y, si la ruta
 * carga un recurso, que ese recurso sea del mismo negocio.
 *
 * El orden importa. La pertenencia va primero porque sin negocio no hay nada
 * que autorizar, y el aislamiento entre inquilinos va ÚLTIMO para que un
 * usuario sin el rol necesario reciba 403 por el rol y no aprenda, por la
 * diferencia de mensajes, si el id que probó existe en otro negocio.
 */
export function autorizar(opciones: OpcionesAutorizacion): ResultadoAutorizacion {
  const { perfil, permiso, recursoBusinessId } = opciones;

  if (!perfil?.businessId) {
    return { ok: false, status: 404, error: 'Usuario no asociado a ningun negocio' };
  }

  if (!tienePermiso(perfil, permiso)) {
    return { ok: false, status: 403, error: 'No autorizado' };
  }

  if (recursoBusinessId !== undefined && recursoBusinessId !== perfil.businessId) {
    return { ok: false, status: 403, error: 'No tienes permiso' };
  }

  return OK;
}

/**
 * Caso aparte de `autorizar`: acciones que el dueño del recurso puede hacer
 * sobre lo suyo aunque su rol no tenga el permiso general.
 *
 * Hoy aplica a borrar un pedido. Antes el DELETE solo validaba el negocio, sin
 * rol: un local podía borrar el pedido de otro local (y con él restituir stock
 * y escribir devoluciones en el kardex). Exigir el permiso a secas habría
 * sacado el botón de cancelar al local sobre su propio pedido, que es un uso
 * legítimo y existente (OrderDetail.tsx:707 lo muestra a todos los roles). La
 * regla queda: tu rol te autoriza, o es tuyo.
 */
export function autorizarPropioOConPermiso(opciones: OpcionesAutorizacion & {
  usuarioId: string;
  recursoUsuarioId?: string | null;
}): ResultadoAutorizacion {
  const { perfil, recursoBusinessId, usuarioId, recursoUsuarioId } = opciones;

  if (!perfil?.businessId) {
    return { ok: false, status: 404, error: 'Usuario no asociado a ningun negocio' };
  }

  const esPropio = Boolean(recursoUsuarioId) && recursoUsuarioId === usuarioId;
  if (!esPropio && !tienePermiso(perfil, opciones.permiso)) {
    return { ok: false, status: 403, error: 'No autorizado' };
  }

  // El aislamiento entre negocios no lo salta ni el dueño del recurso: si el
  // recurso es de otro negocio, que el user_id coincida significa que el perfil
  // cambió de negocio, no que el acceso sea legítimo.
  if (recursoBusinessId !== undefined && recursoBusinessId !== perfil.businessId) {
    return { ok: false, status: 403, error: 'No tienes permiso' };
  }

  return OK;
}
