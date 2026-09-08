// Consolidación de alérgenos a partir de los declarados por cada materia prima.
//
// Regla que no se negocia: NUNCA se infiere una traza que el proveedor no
// declaró. Este módulo solo agrupa lo que ya está cargado.

export interface AlergenoCatalogo {
  id: string;
  codigo: string;
  nombre: string;
  /** Forma en minúscula para intercalar en la frase de la etiqueta. */
  nombreEtiqueta: string;
  orden: number;
}

export interface AlergenosDeIngrediente {
  ingredienteId: string;
  contiene: AlergenoCatalogo[];
  trazas: AlergenoCatalogo[];
}

export interface AlergenosConsolidados {
  contiene: AlergenoCatalogo[];
  trazas: AlergenoCatalogo[];
  textoContiene: string;
  textoTrazas: string;
}

/** ["a"] → "a" · ["a","b"] → "a y b" · ["a","b","c"] → "a, b y c" */
export function unirEnFrase(partes: string[]): string {
  if (partes.length === 0) return '';
  if (partes.length === 1) return partes[0];
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}

function dedupYOrdenar(lista: AlergenoCatalogo[]): AlergenoCatalogo[] {
  const porCodigo = new Map<string, AlergenoCatalogo>();
  for (const a of lista) {
    if (!porCodigo.has(a.codigo)) porCodigo.set(a.codigo, a);
  }
  // Orden explícito del catálogo, no alfabético: así "trigo (gluten)" va siempre
  // primero y la frase queda igual en todas las etiquetas.
  return [...porCodigo.values()].sort((x, y) => x.orden - y.orden || x.codigo.localeCompare(y.codigo));
}

export function consolidarAlergenos(porIngrediente: AlergenosDeIngrediente[]): AlergenosConsolidados {
  const contiene = dedupYOrdenar(porIngrediente.flatMap((i) => i.contiene));

  const codigosPresentes = new Set(contiene.map((a) => a.codigo));

  // Un alérgeno que YA está declarado como presente no se repite como traza:
  // "Contiene leche. Puede contener trazas de leche." es contradictorio y en la
  // práctica confunde a quien lee la etiqueta por una alergia.
  const trazas = dedupYOrdenar(porIngrediente.flatMap((i) => i.trazas)).filter(
    (a) => !codigosPresentes.has(a.codigo),
  );

  const textoContiene = contiene.length
    ? `Contiene ${unirEnFrase(contiene.map((a) => a.nombreEtiqueta))}.`
    : '';

  const textoTrazas = trazas.length
    ? `Puede contener trazas de ${unirEnFrase(trazas.map((a) => a.nombreEtiqueta))}.`
    : '';

  return { contiene, trazas, textoContiene, textoTrazas };
}
