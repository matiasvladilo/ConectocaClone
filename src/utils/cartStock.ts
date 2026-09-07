/**
 * Cuánto de un producto se puede agregar realmente al pedido.
 *
 * Existe por un bug reportado desde los locales: "si queda 1 solo producto no
 * deja pedirlo". El chequeo anterior era todo-o-nada — si la cantidad pedida
 * superaba el stock, no agregaba NADA y solo mostraba "Solo hay 1 unidades
 * disponibles". Con stock alto eso no se nota; con 1 unidad, cualquier cantidad
 * habitual (6, 10, una caja) rebotaba y el local leía eso como "la app no me
 * deja pedir este producto". Probarlo agregando 1 unidad —lo que hace quien
 * revisa el bug— es justo el único caso que sí pasaba.
 *
 * Ahora se recorta a lo disponible en vez de rechazar. El tope se mantiene: la
 * RPC create_order_with_stock también lo valida en el servidor (`stock < qty`)
 * y ahí el rechazo tumba el pedido ENTERO, así que dejar pasar de más en el
 * cliente cambiaría un aviso molesto por un pedido que explota al confirmar.
 */

export interface ProductoConStock {
  /** -1 es la señal legada de stock ilimitado. */
  stock: number;
  /** false = stock no controlado (ilimitado). undefined se trata como true. */
  trackStock?: boolean;
}

export interface DecisionAgregar {
  /** Cuánto agregar. 0 = no se puede agregar nada. */
  agregable: number;
  /** true si se pidió más de lo que había y se recortó. */
  recortada: boolean;
  /** Cuánto quedaba libre (Infinity si es ilimitado). */
  disponible: number;
}

export function calcularCantidadAgregable(
  producto: ProductoConStock,
  cantidadPedida: number,
  cantidadEnCarrito: number,
): DecisionAgregar {
  const ilimitado = producto.trackStock === false || producto.stock === -1;

  if (ilimitado) {
    return { agregable: Math.max(0, cantidadPedida), recortada: false, disponible: Infinity };
  }

  // Lo que ya está en el carrito cuenta contra el stock: son unidades que este
  // mismo pedido va a descontar.
  const disponible = Math.max(0, producto.stock - cantidadEnCarrito);

  if (cantidadPedida <= 0 || disponible === 0) {
    return { agregable: 0, recortada: false, disponible };
  }

  if (cantidadPedida > disponible) {
    return { agregable: disponible, recortada: true, disponible };
  }

  return { agregable: cantidadPedida, recortada: false, disponible };
}
