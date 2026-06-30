import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from './info';

let supabaseClient: ReturnType<typeof createSupabaseClient> | null = null;

// Clave de preferencia "mantener sesión iniciada". Si vale 'false', la sesión vive
// en sessionStorage (se borra al cerrar el navegador); de lo contrario en localStorage
// (persiste entre reinicios). La preferencia en sí siempre va en localStorage.
const REMEMBER_KEY = 'conectoca_remember_session';

function activeStorage(): Storage {
  return localStorage.getItem(REMEMBER_KEY) === 'false' ? sessionStorage : localStorage;
}

// Storage híbrido para Supabase: lee/escribe el token en el store elegido según la
// preferencia del usuario, y al borrar limpia ambos para no dejar sesiones colgando.
const hybridStorage = {
  getItem: (key: string) => activeStorage().getItem(key),
  setItem: (key: string, value: string) => activeStorage().setItem(key, value),
  removeItem: (key: string) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  },
};

// Llamar ANTES de iniciar sesión para que el token se persista en el store correcto.
export function setRememberSession(remember: boolean) {
  if (remember) {
    localStorage.removeItem(REMEMBER_KEY); // recordar es el comportamiento por defecto
  } else {
    localStorage.setItem(REMEMBER_KEY, 'false');
  }
}

export function createClient() {
  if (!supabaseClient) {
    supabaseClient = createSupabaseClient(
      `https://${projectId}.supabase.co`,
      publicAnonKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          storage: hybridStorage,
        }
      }
    );
  }
  return supabaseClient;
}
