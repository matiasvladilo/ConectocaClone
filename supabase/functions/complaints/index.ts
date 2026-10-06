import { Hono } from 'npm:hono@4.12.5';
import { cors } from 'npm:hono@4.12.5/cors';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createResendMailer } from './mailer.ts';
import { createPublicComplaintService, PublicComplaintError } from './publicService.ts';
import { createSupabaseComplaintRepository } from './repository.ts';

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const supabaseUrl = requiredEnv('SUPABASE_URL');
const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
const businessId = requiredEnv('COMPLAINTS_BUSINESS_ID');
const recipientEmail = requiredEnv('COMPLAINTS_RECIPIENT_EMAIL');
const fromEmail = requiredEnv('COMPLAINTS_FROM_EMAIL');
const resendApiKey = requiredEnv('RESEND_API_KEY');
const appPublicUrl = requiredEnv('APP_PUBLIC_URL');
const rateLimitSecret = requiredEnv('COMPLAINTS_RATE_LIMIT_SECRET');

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const publicService = createPublicComplaintService({
  businessId,
  appPublicUrl,
  rateLimitSecret,
  recipientEmail,
  fromEmail,
  repository: createSupabaseComplaintRepository(supabase),
  mailer: createResendMailer({ apiKey: resendApiKey }),
});

export const app = new Hono();

const allowedOrigins = new Set([
  new URL(appPublicUrl).origin,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

app.use('/complaints/*', cors({
  origin: origin => allowedOrigins.has(origin) ? origin : undefined,
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

app.onError((error, c) => {
  if (error instanceof PublicComplaintError) {
    const status = error.code === 'RATE_LIMITED' ? 429 : 400;
    return c.json({ code: error.code, message: error.message }, status);
  }

  console.error('Unexpected complaints function error', error);
  return c.json({
    code: 'INTERNAL_ERROR',
    message: 'No pudimos procesar la solicitud. Intenta nuevamente.',
  }, 500);
});

Deno.serve(app.fetch);
