import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, X } from 'lucide-react';

/**
 * Política de privacidad dentro de la app. La fuente única es
 * public/privacidad.html (también es la URL pública que pide App Store
 * Connect). No se usa un iframe porque netlify.toml manda
 * `X-Frame-Options: DENY` / `frame-ancestors 'none'`: se lee el archivo
 * (mismo origen) y se muestra su <main>. Es contenido propio y estático.
 */
export const URL_PRIVACIDAD = '/privacidad.html';

export function PrivacidadPanel({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!abierto || html) return;
    fetch(URL_PRIVACIDAD)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((texto) => {
        const doc = new DOMParser().parseFromString(texto, 'text/html');
        // Sin el encabezado de marca: la hoja ya tiene su título.
        doc.querySelector('.marca')?.remove();
        doc.querySelector('h1')?.remove();
        setHtml(doc.querySelector('.tarjeta')?.innerHTML ?? '');
      })
      .catch(() => setError(true));
  }, [abierto, html]);

  useEffect(() => {
    if (!abierto) return;
    const t = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', t);
    return () => window.removeEventListener('keydown', t);
  }, [abierto, onCerrar]);

  return createPortal(
    <AnimatePresence>
      {abierto && (
        <>
          <motion.div key="fondo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCerrar}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 70 }} />
          <motion.div key="hoja" role="dialog" aria-modal="true" aria-label="Política de privacidad"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            style={{
              position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 71, margin: '0 auto', maxWidth: 640, height: '92dvh',
              background: '#F2F2F7', borderRadius: '14px 14px 0 0', display: 'flex', flexDirection: 'column',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 10px' }}>
              <span style={{ flex: 1, fontSize: 17, fontWeight: 600, color: '#000' }}>Política de privacidad</span>
              <button type="button" onClick={onCerrar} aria-label="Cerrar"
                style={{ width: 32, height: 32, borderRadius: 16, border: 'none', background: '#E3E3E8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X style={{ width: 17, height: 17, color: '#3C3C43' }} />
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 16px max(env(safe-area-inset-bottom), 24px)' }}>
              {error ? (
                <p style={{ padding: 24, textAlign: 'center', color: '#8E8E93' }}>No se pudo cargar la política. Revisa tu conexión.</p>
              ) : html === null ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                  <Loader2 className="animate-spin" style={{ width: 22, height: 22, color: '#8E8E93' }} />
                </div>
              ) : (
                <div className="texto-legal" style={{ background: '#fff', borderRadius: 12, padding: '18px 18px 8px', fontSize: 15, lineHeight: 1.55, color: '#1C1C1E' }}
                  dangerouslySetInnerHTML={{ __html: html }} />
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
