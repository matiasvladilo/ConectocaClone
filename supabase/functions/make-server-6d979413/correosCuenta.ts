/**
 * Correos de cuenta (verificar correo y recuperar contraseña) enviados con
 * Resend desde el dominio de La Oca, en vez de los de Supabase Auth.
 *
 * Por qué no los de Supabase: su servidor de correo por defecto es de prueba
 * (pocos envíos por hora, remitente genérico, en inglés) y el enlace de
 * recuperación apuntaba a `/auth/v1/verify`, sin ninguna pantalla en la app
 * para escribir la contraseña nueva.
 *
 * Cómo funciona: el Edge Function pide el enlace a Supabase con
 * `auth.admin.generateLink` (no envía nada) y toma su `hashed_token`. Con eso
 * arma un enlace propio a la app (`APP_PUBLIC_URL/?cuenta=...&token_hash=...`),
 * donde la pantalla AccionCuenta llama a `verifyOtp`. Así el enlace no depende
 * de la lista de redirecciones permitidas del proyecto.
 */

export type AccionCuenta = 'verificar' | 'nueva-clave';

/** Tipos de OTP de Supabase que corresponden a cada acción. */
export type TipoOtp = 'signup' | 'magiclink' | 'recovery';

export const REMITENTE_CUENTA = 'La Oca <no-responder@laoca.info>';

export function enlaceCuenta(appUrl: string, accion: AccionCuenta, tokenHash: string, tipo: TipoOtp): string {
  const base = appUrl.replace(/\/+$/, '');
  const q = new URLSearchParams({ cuenta: accion, token_hash: tokenHash, type: tipo });
  return `${base}/?${q.toString()}`;
}

const escapar = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Correo simple y legible en cualquier cliente: una tarjeta, un botón, el enlace en texto. */
export function plantillaCorreo(opciones: {
  titulo: string;
  parrafos: string[];
  boton: string;
  url: string;
  pie: string;
}): { html: string; text: string } {
  const { titulo, parrafos, boton, url, pie } = opciones;
  const p = parrafos
    .map((t) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.5;color:#1c1c1e">${escapar(t)}</p>`)
    .join('');
  const html = `<!doctype html><html><body style="margin:0;background:#f2f2f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;padding:32px 28px">
<tr><td>
<p style="margin:0 0 20px;font-size:20px;font-weight:700;color:#0c3c84">La Oca</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#000">${escapar(titulo)}</h1>
${p}
<p style="margin:24px 0"><a href="${escapar(url)}" style="display:inline-block;background:#007aff;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;padding:14px 24px;border-radius:12px">${escapar(boton)}</a></p>
<p style="margin:0 0 6px;font-size:13px;color:#8e8e93">Si el botón no funciona, copia este enlace en el navegador:</p>
<p style="margin:0 0 20px;font-size:13px;word-break:break-all"><a href="${escapar(url)}" style="color:#007aff">${escapar(url)}</a></p>
<p style="margin:0;font-size:13px;line-height:1.4;color:#8e8e93">${escapar(pie)}</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = `${titulo}\n\n${parrafos.join('\n\n')}\n\n${boton}: ${url}\n\n${pie}`;
  return { html, text };
}

export function correoVerificacion(nombre: string, url: string) {
  return {
    subject: 'Confirma tu correo para usar La Oca',
    ...plantillaCorreo({
      titulo: 'Confirma tu correo',
      parrafos: [
        `Hola${nombre ? ` ${nombre}` : ''}, gracias por crear tu cuenta.`,
        'Toca el botón para confirmar que este correo es tuyo. Después podrás iniciar sesión.',
      ],
      boton: 'Confirmar mi correo',
      url,
      pie: 'Si no creaste una cuenta en La Oca, ignora este correo.',
    }),
  };
}

export function correoRecuperacion(url: string) {
  return {
    subject: 'Crea una nueva contraseña para La Oca',
    ...plantillaCorreo({
      titulo: 'Crea una nueva contraseña',
      parrafos: [
        'Recibimos un pedido para cambiar la contraseña de tu cuenta.',
        'Toca el botón para elegir una nueva. El enlace vence en 1 hora y sirve una sola vez.',
      ],
      boton: 'Crear nueva contraseña',
      url,
      pie: 'Si no fuiste tú, ignora este correo: tu contraseña no cambia.',
    }),
  };
}

/** Envía con Resend. Lanza si falla: el llamador decide qué responder. */
export async function enviarCorreoCuenta(
  apiKey: string,
  correo: { to: string; subject: string; html: string; text: string },
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const r = await fetchFn('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: REMITENTE_CUENTA, ...correo }),
      signal: controller.signal,
    });
    if (!r.ok) throw new Error(`Resend rechazó el envío (${r.status})`);
  } finally {
    clearTimeout(timer);
  }
}
