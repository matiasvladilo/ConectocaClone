// Configuración de conexión a Supabase.
// Sale de VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (ver .env.local.example).
//
// M-05: antes había valores de reserva embebidos acá, que apuntaban a un
// proyecto Supabase distinto y ya abandonado. Un despliegue con las variables
// mal configuradas no fallaba: arrancaba callado contra el proyecto equivocado,
// y el síntoma que llegaba era "la app está vacía", que no se parece en nada a
// la causa. Ahora falla fuerte y en el arranque, que es cuando se puede
// arreglar.

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY. ' +
    'Copiá .env.local.example a .env.local y completá los valores del proyecto, ' +
    'o definilos como variables de entorno del build (Netlify: Site settings → Environment variables).'
  );
}

// Id del proyecto a partir de la URL (https://abcdef.supabase.co -> abcdef)
export const projectId = supabaseUrl
  .replace(/^https?:\/\//, '')
  .replace('.supabase.co', '');

export const publicAnonKey = supabaseAnonKey;
