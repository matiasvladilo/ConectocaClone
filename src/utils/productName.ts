/**
 * Composición del nombre de producto a partir de campos fijos.
 *
 * El campo Nombre era texto libre y cada persona lo escribía distinto, así que el
 * mismo producto entraba dos o tres veces con nombres diferentes. Estos campos
 * imponen un orden y un formato únicos: marca, presentación, unidades por paquete.
 *
 * Solo se usa al CREAR. Editar un producto viejo sigue siendo texto libre:
 * descomponer un nombre existente requeriría adivinar, y adivinar mal renombraría
 * productos en producción.
 */

export interface ProductNameParts {
  marca: string;
  cantidad: string;   // número de la presentación, como texto
  unidad: string;     // uno de UNIDADES_PRESENTACION, o '' si no se eligió
  unidadOtro: string; // solo se usa cuando unidad === 'otro'
  unidades: string;   // unidades por paquete, como texto
}

export const partesVacias: ProductNameParts = {
  marca: '',
  cantidad: '',
  unidad: '',
  unidadOtro: '',
  unidades: '',
};

// Lista CERRADA a propósito. No se ofrece 'cc' aunque se use en la práctica:
// tener 'ml' y 'cc' como opciones distintas para la misma magnitud reintroduce
// exactamente la inconsistencia que este formulario viene a eliminar.
export const UNIDADES_PRESENTACION = [
  { value: 'ml', label: 'ml' },
  { value: 'L', label: 'L' },
  { value: 'g', label: 'g' },
  { value: 'kg', label: 'kg' },
  { value: 'un', label: 'un' },
  { value: 'otro', label: 'Otro…' },
];

export function componerNombre(p: ProductNameParts): string {
  const partes: string[] = [];

  // Se colapsan los espacios internos pero NO se fuerza capitalización: pasar a
  // Título rompería nombres legítimos como "Coca-Cola ZERO". La comparación de
  // duplicados es case-insensitive, así que la consistencia de mayúsculas se
  // resuelve por ahí y no mutilando lo que el usuario escribió.
  const marca = p.marca.trim().replace(/\s+/g, ' ');
  if (marca) partes.push(marca);

  const cantidad = p.cantidad.trim();
  const unidad = (p.unidad === 'otro' ? p.unidadOtro : p.unidad).trim();
  // Los dos o ninguno: "Coca Cola 591" sin unidad es ambiguo y no aporta.
  if (cantidad && unidad) partes.push(`${cantidad}${unidad}`);

  const unidades = parseInt(p.unidades.trim(), 10);
  if (Number.isFinite(unidades) && unidades > 1) partes.push(`${unidades} unidades`);

  return partes.join(' ');
}
