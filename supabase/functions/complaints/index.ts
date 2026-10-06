import { Hono, type MiddlewareHandler } from 'npm:hono@4.12.5';
import { cors } from 'npm:hono@4.12.5/cors';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  AdminComplaintError,
  authorizeAdmin,
  createAdminComplaintService,
  parseComplaintListQuery,
  parseRetryKinds,
  parseStatus,
  type AdminContext,
} from './adminService.ts';
import { createResendMailer, type ComplaintMailer } from './mailer.ts';
import { isAllowedComplaintOrigin } from './domain.ts';
import { createPublicComplaintService, PublicComplaintError } from './publicService.ts';
import {
  ComplaintNotFoundError,
  createSupabaseComplaintRepository,
} from './repository.ts';

function optionalEnv(name: string): string | null {
  return Deno.env.get(name)?.trim() || null;
}

function requiredEnv(name: string): string {
  const value = optionalEnv(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const supabaseUrl = requiredEnv('SUPABASE_URL');
const anonKey = requiredEnv('SUPABASE_ANON_KEY');
const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
const businessId = requiredEnv('COMPLAINTS_BUSINESS_ID');
// El correo es opcional: sin estos tres valores los reclamos igual se guardan
// y se ven en el panel, solo que no se envía ningún aviso.
const recipientEmail = optionalEnv('COMPLAINTS_RECIPIENT_EMAIL');
const fromEmail = optionalEnv('COMPLAINTS_FROM_EMAIL');
const resendApiKey = optionalEnv('RESEND_API_KEY');
const emailEnabled = Boolean(recipientEmail && fromEmail && resendApiKey);
const appPublicUrl = requiredEnv('APP_PUBLIC_URL');
const rateLimitSecret = requiredEnv('COMPLAINTS_RATE_LIMIT_SECRET');

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const supabaseAuth = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const repository = createSupabaseComplaintRepository(supabase);
const mailer = emailEnabled ? createResendMailer({ apiKey: resendApiKey! }) : null;
const disabledMailer: ComplaintMailer = {
  send: async () => {
    throw new Error('El correo de reclamos no está configurado');
  },
};
const publicService = createPublicComplaintService({
  businessId,
  appPublicUrl,
  rateLimitSecret,
  recipientEmail: recipientEmail ?? '',
  fromEmail: fromEmail ?? '',
  repository,
  mailer,
});
const adminService = createAdminComplaintService({
  repository,
  mailer: mailer ?? disabledMailer,
  fromEmail: fromEmail ?? '',
  recipientEmail: recipientEmail ?? '',
  appPublicUrl,
});

type ComplaintsEnv = { Variables: { admin: AdminContext } };

export const app = new Hono<ComplaintsEnv>();


app.use('/complaints/*', cors({
  origin: origin => isAllowedComplaintOrigin(origin, appPublicUrl) ? origin : undefined,
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  maxAge: 600,
}));

app.get('/complaints/public/branches', async c => {
  const result = await publicService.getBranches();
  return c.json(result, 200, { 'Cache-Control': 'public, max-age=300' });
});

app.post('/complaints/public/complaints', async c => {
  const form = await c.req.formData();
  const result = await publicService.submit({
    fields: {
      originType: String(form.get('originType') || ''),
      branchId: String(form.get('branchId') || ''),
      email: String(form.get('email') || ''),
      name: String(form.get('name') || ''),
      phone: String(form.get('phone') || ''),
      description: String(form.get('description') || ''),
      honeypot: String(form.get('website') || ''),
    },
    files: form.getAll('files').filter((value): value is File => value instanceof File),
    formToken: String(form.get('formToken') || ''),
    ip: c.req.header('cf-connecting-ip')
      || c.req.header('x-forwarded-for')?.split(',')[0].trim()
      || 'unknown',
  });
  return c.json({ caseNumber: result.caseNumber, receivedAt: result.receivedAt }, 201);
});

const requireAdmin: MiddlewareHandler<ComplaintsEnv> = async (c, next) => {
  const authorization = c.req.header('authorization') ?? '';
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  const admin = await authorizeAdmin({
    token: match?.[1] ?? '',
    expectedBusinessId: businessId,
    auth: {
      async getUser(token) {
        const { data, error } = await supabaseAuth.auth.getUser(token);
        if (error || !data.user) return null;
        return { id: data.user.id };
      },
      async getProfile(userId) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, role, business_id')
          .eq('id', userId)
          .maybeSingle();
        if (error) throw error;
        return data
          ? { id: data.id, role: data.role, businessId: data.business_id }
          : null;
      },
    },
  });
  c.set('admin', admin);
  await next();
};

async function jsonBody(request: { json(): Promise<unknown> }): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AdminComplaintError('VALIDATION_ERROR', 'El cuerpo JSON no es válido.');
  }
}

app.get('/complaints/admin/complaints', requireAdmin, async c => {
  const query = parseComplaintListQuery(new URL(c.req.url).searchParams);
  return c.json(await adminService.list(query, c.get('admin')));
});

app.get('/complaints/admin/complaints/:id', requireAdmin, async c => {
  return c.json(await adminService.getDetail(c.req.param('id'), c.get('admin')));
});

app.patch('/complaints/admin/complaints/:id/status', requireAdmin, async c => {
  const status = parseStatus(await jsonBody(c.req));
  return c.json(await adminService.setStatus(c.req.param('id'), status, c.get('admin')));
});

app.post('/complaints/admin/complaints/:id/retry-emails', requireAdmin, async c => {
  const kinds = parseRetryKinds(await jsonBody(c.req));
  return c.json(await adminService.retryEmails(c.req.param('id'), kinds, c.get('admin')));
});

app.post('/complaints/admin/attachments/:id/signed-url', requireAdmin, async c => {
  return c.json(await adminService.createAttachmentUrl(c.req.param('id'), c.get('admin')));
});

app.onError((error, c) => {
  if (error instanceof PublicComplaintError) {
    const status = error.code === 'RATE_LIMITED' ? 429 : 400;
    return c.json({ code: error.code, message: error.message }, status);
  }

  if (error instanceof AdminComplaintError) {
    if (error.code === 'UNAUTHORIZED') {
      return c.json({ code: error.code, message: error.message }, 401);
    }
    if (error.code === 'FORBIDDEN') {
      return c.json({ code: error.code, message: error.message }, 403);
    }
    if (error.code === 'NOT_FOUND') {
      return c.json({ code: error.code, message: error.message }, 404);
    }
    return c.json({ code: error.code, message: error.message }, 400);
  }

  if (error instanceof ComplaintNotFoundError) {
    return c.json({ code: 'NOT_FOUND', message: 'El recurso solicitado no existe.' }, 404);
  }

  console.error('Unexpected complaints function error', error);
  return c.json({
    code: 'INTERNAL_ERROR',
    message: 'No pudimos procesar la solicitud. Intenta nuevamente.',
  }, 500);
});

Deno.serve(app.fetch);
