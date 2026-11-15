import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  autorizar,
  autorizarPropioOConPermiso,
  permisosDeRol,
  tienePermiso,
  type Permiso,
} from './authz.ts';

const NEGOCIO_A = 'aaaaaaaa-0000-0000-0000-000000000000';
const NEGOCIO_B = 'bbbbbbbb-0000-0000-0000-000000000000';

const admin = { role: 'admin', businessId: NEGOCIO_A };
const production = { role: 'production', businessId: NEGOCIO_A };
const dispatch = { role: 'dispatch', businessId: NEGOCIO_A };
const local = { role: 'local', businessId: NEGOCIO_A };
const worker = { role: 'worker', businessId: NEGOCIO_A };
const adminDeB = { role: 'admin', businessId: NEGOCIO_B };

// ─── Matriz de permisos ───────────────────────────────────────────────────────

test('admin tiene todos los permisos de la matriz', () => {
  const todos = permisosDeRol('admin');
  const permisosConocidos = [
    'productos.leer', 'productos.escribir', 'productos.kardex',
    'categorias.gestionar', 'areas.gestionar', 'materias_primas.gestionar',
    'recetas.leer', 'recetas.gestionar', 'nutricion.leer', 'etiquetas.generar',
    'etiquetas.configurar', 'pedidos.leer_de_otros', 'pedidos.editar',
    'pedidos.cambiar_estado', 'pedidos.cambiar_estado_area', 'produccion.ordenes',
    'asistencia.ver_de_otros', 'asistencia.gestionar',
    'notificaciones.enviar_a_otros', 'negocio.ver_miembros',
    'distribucion.reposicion',
  ] satisfies Permiso[];

  for (const permiso of permisosConocidos) {
    assert.ok(todos.includes(permiso), `admin debería tener ${permiso}`);
  }
});

test('un rol sin definir o desconocido no tiene ningún permiso', () => {
  assert.deepEqual(permisosDeRol(undefined), []);
  assert.deepEqual(permisosDeRol(null), []);
  assert.deepEqual(permisosDeRol(''), []);
  assert.deepEqual(permisosDeRol('superadmin'), []);
  assert.equal(tienePermiso({ role: 'superadmin', businessId: NEGOCIO_A }, 'productos.escribir'), false);
});

test('todos los roles pueden leer el catálogo: es la base de armar un pedido', () => {
  for (const perfil of [admin, production, dispatch, local, worker, { role: 'user', businessId: NEGOCIO_A }]) {
    assert.equal(tienePermiso(perfil, 'productos.leer'), true, `${perfil.role} debería leer productos`);
  }
});

// ─── Regresión de los hallazgos corregidos ────────────────────────────────────

test('A-09: un local no puede escribir productos (antes no había chequeo de rol)', () => {
  assert.equal(tienePermiso(local, 'productos.escribir'), false);
  assert.equal(tienePermiso(worker, 'productos.escribir'), false);
  assert.equal(tienePermiso(admin, 'productos.escribir'), true);
  assert.equal(tienePermiso(production, 'productos.escribir'), true);
});

test('A-03: leer una receta exige el mismo rol que modificarla', () => {
  for (const perfil of [local, worker, dispatch]) {
    assert.equal(tienePermiso(perfil, 'recetas.leer'), false, `${perfil.role} no debería leer recetas`);
  }
  assert.equal(tienePermiso(admin, 'recetas.leer'), true);
  assert.equal(tienePermiso(production, 'recetas.leer'), true);
});

test('A-05: notificar a otro usuario no está al alcance de los roles operativos básicos', () => {
  assert.equal(tienePermiso(local, 'notificaciones.enviar_a_otros'), false);
  assert.equal(tienePermiso(worker, 'notificaciones.enviar_a_otros'), false);
  assert.equal(tienePermiso({ role: 'user', businessId: NEGOCIO_A }, 'notificaciones.enviar_a_otros'), false);
  assert.equal(tienePermiso(dispatch, 'notificaciones.enviar_a_otros'), true);
});

test('M-08: el listado de miembros (con correos) es solo de admin', () => {
  assert.equal(tienePermiso(admin, 'negocio.ver_miembros'), true);
  for (const perfil of [production, dispatch, local, worker]) {
    assert.equal(tienePermiso(perfil, 'negocio.ver_miembros'), false, `${perfil.role} no debería ver miembros`);
  }
});

// ─── autorizar(): pertenencia, rol y aislamiento entre negocios ───────────────

test('sin negocio asignado no se autoriza nada, ni siquiera a un admin', () => {
  const r = autorizar({ perfil: { role: 'admin', businessId: null }, permiso: 'productos.leer' });
  assert.equal(r.ok, false);
  assert.equal(r.status, 404);
});

test('un perfil nulo no pasa', () => {
  assert.equal(autorizar({ perfil: null, permiso: 'productos.leer' }).ok, false);
  assert.equal(autorizar({ perfil: undefined, permiso: 'productos.leer' }).ok, false);
});

test('A-03/A-04: el recurso de otro negocio se rechaza aun con el rol correcto', () => {
  const r = autorizar({
    perfil: admin,
    permiso: 'recetas.gestionar',
    recursoBusinessId: NEGOCIO_B,
  });
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
  assert.equal(r.error, 'No tienes permiso');
});

test('el recurso del propio negocio se autoriza con el rol correcto', () => {
  const r = autorizar({
    perfil: admin,
    permiso: 'recetas.gestionar',
    recursoBusinessId: NEGOCIO_A,
  });
  assert.equal(r.ok, true);
});

test('un recurso sin negocio asignado se trata como ajeno, no como libre', () => {
  const r = autorizar({ perfil: admin, permiso: 'pedidos.editar', recursoBusinessId: null });
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
});

test('omitir recursoBusinessId no desactiva el chequeo de rol', () => {
  const r = autorizar({ perfil: local, permiso: 'productos.escribir' });
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
});

test('el rol se evalúa antes del negocio: un 403 por rol no revela si el id existe en otro negocio', () => {
  // `local` no tiene el permiso Y el recurso es de otro negocio. El mensaje
  // tiene que ser el del rol ('No autorizado'), no el del negocio
  // ('No tienes permiso'), para no filtrar la existencia del recurso.
  const r = autorizar({
    perfil: local,
    permiso: 'recetas.gestionar',
    recursoBusinessId: NEGOCIO_B,
  });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'No autorizado');
});

// ─── autorizarPropioOConPermiso(): borrado de pedidos ─────────────────────────

const USUARIO = 'user-1';
const OTRO_USUARIO = 'user-2';

test('un local puede borrar su propio pedido aunque su rol no tenga el permiso', () => {
  const r = autorizarPropioOConPermiso({
    perfil: local,
    permiso: 'pedidos.editar',
    usuarioId: USUARIO,
    recursoUsuarioId: USUARIO,
    recursoBusinessId: NEGOCIO_A,
  });
  assert.equal(r.ok, true);
});

test('A-10: un local NO puede borrar el pedido de otro local del mismo negocio', () => {
  const r = autorizarPropioOConPermiso({
    perfil: local,
    permiso: 'pedidos.editar',
    usuarioId: USUARIO,
    recursoUsuarioId: OTRO_USUARIO,
    recursoBusinessId: NEGOCIO_A,
  });
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
});

test('el staff puede borrar el pedido de otro usuario de su negocio', () => {
  for (const perfil of [admin, dispatch, production]) {
    const r = autorizarPropioOConPermiso({
      perfil,
      permiso: 'pedidos.editar',
      usuarioId: USUARIO,
      recursoUsuarioId: OTRO_USUARIO,
      recursoBusinessId: NEGOCIO_A,
    });
    assert.equal(r.ok, true, `${perfil.role} debería poder borrar`);
  }
});

test('ser dueño del recurso no salta el aislamiento entre negocios', () => {
  const r = autorizarPropioOConPermiso({
    perfil: adminDeB,
    permiso: 'pedidos.editar',
    usuarioId: USUARIO,
    recursoUsuarioId: USUARIO,
    recursoBusinessId: NEGOCIO_A,
  });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'No tienes permiso');
});

test('un recursoUsuarioId nulo no cuenta como propio', () => {
  const r = autorizarPropioOConPermiso({
    perfil: local,
    permiso: 'pedidos.editar',
    usuarioId: USUARIO,
    recursoUsuarioId: null,
    recursoBusinessId: NEGOCIO_A,
  });
  assert.equal(r.ok, false);
});

test('para comprar: solo admin ve la reposición sugerida', () => {
  assert.equal(tienePermiso(admin, 'distribucion.reposicion'), true);
  for (const perfil of [production, dispatch, local, worker, { role: 'pastry', businessId: NEGOCIO_A }, { role: 'user', businessId: NEGOCIO_A }]) {
    assert.equal(tienePermiso(perfil, 'distribucion.reposicion'), false, `${perfil.role} no debería verla`);
  }
});
