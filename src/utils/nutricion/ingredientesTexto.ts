// Generación automática de la lista de ingredientes de la etiqueta.
//
// Se arma desde la receta existente, en orden decreciente de cantidad
// incorporada a la formulación. Los ingredientes compuestos se expanden con la
// declaración LITERAL del fabricante; nunca se deducen porcentajes internos que
// el proveedor no entregó.

export interface IngredienteParaTexto {
  nombre: string;
  /** Gramos incorporados a la formulación. Define el orden. */
  gramos: number;
  /** Declaración del fabricante para ingredientes compuestos. */
  ingredientesDeclarados?: string | null;
}

/**
 * Los nombres se guardan en Título ("Mix Queque Neutro", "Cacao Amargo") porque
 * así se leen mejor en las pantallas de gestión, pero la etiqueta los declara en
 * minúscula dentro de una oración. Se baja todo y después se capitaliza solo la
 * primera letra de la frase.
 *
 * Efecto conocido: un nombre propio ("Nestlé") también queda en minúscula. Para
 * esos casos está `ingredientes_texto_override` en product_label_profile, que
 * pisa este texto sin tocar la receta.
 */
function aMinuscula(nombre: string): string {
  return nombre.trim().toLowerCase().replace(/\s+/g, ' ');
}

function capitalizarPrimera(texto: string): string {
  if (!texto) return texto;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function ordenarPorCantidad(ingredientes: IngredienteParaTexto[]): IngredienteParaTexto[] {
  // Array.prototype.sort es estable, así que los empates conservan el orden en
  // que están cargados en la receta en vez de reordenarse solos entre cálculos.
  return [...ingredientes].sort((a, b) => b.gramos - a.gramos);
}

/**
 * "Mix queque neutro (harina de trigo..., azúcar, ...), cacao amargo, huevos,
 * aceite vegetal."
 */
export function generarTextoIngredientes(ingredientes: IngredienteParaTexto[]): string {
  const ordenados = ordenarPorCantidad(ingredientes);
  if (ordenados.length === 0) return '';

  const partes = ordenados.map((ing) => {
    const nombre = aMinuscula(ing.nombre);
    const declarados = (ing.ingredientesDeclarados || '').trim();
    // El punto final del compuesto se saca: va dentro de un paréntesis en medio
    // de una oración más larga.
    if (declarados) return `${nombre} (${declarados.replace(/\.$/, '')})`;
    return nombre;
  });

  return `${capitalizarPrimera(partes.join(', '))}.`;
}
