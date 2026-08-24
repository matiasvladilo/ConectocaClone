import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2";

const app = new Hono();

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  console.error('CRITICAL: Missing required environment variables');
  console.error('SUPABASE_URL:', SUPABASE_URL ? 'Set' : 'Missing');
  console.error('SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'Missing');
  console.error('SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY ? 'Set' : 'Missing');
}

console.log('Environment variables validated');
console.log('Server starting...');

const supabaseAdmin = createClient(
  SUPABASE_URL ?? '',
  SUPABASE_SERVICE_ROLE_KEY ?? '',
);

const supabaseAuth = createClient(
  SUPABASE_URL ?? '',
  SUPABASE_ANON_KEY ?? '',
);

app.use('*', logger(console.log));

app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// ─── Row Converters ──────────────────────────────────────────────────────────

function toProfile(r: any) {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    businessId: r.business_id,
    address: r.address || '',
    notificationPrefs: {
      orderStatus: r.notification_pref_order_status ?? true,
      production: r.notification_pref_production ?? false,
    },
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toBusiness(r: any) {
  return {
    id: r.id,
    name: r.name,
    inviteCode: r.invite_code,
    ownerId: r.owner_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toProduct(r: any) {
  const ingredients = (r.product_ingredients || []).map((pi: any) => ({
    ingredientId: pi.ingredient_id,
    quantity: pi.quantity,
  }));
  return {
    id: r.id,
    name: r.name,
    description: r.description || '',
    price: Number(r.price),
    image: r.image_url || '',
    imageUrl: r.image_url || '',
    stock: r.stock,
    minStock: r.min_stock != null ? Number(r.min_stock) : undefined,
    unlimitedStock: r.unlimited_stock,
    trackStock: r.track_stock,
    allowDecimal: r.allow_decimal || false,
    category: r.categories?.name || r.category_name || 'General',
    categoryId: r.category_id,
    sku: r.sku || '', // se normaliza a '' para que los formularios no lidien con null
    productionAreaId: r.production_area_id,
    ingredients,
    laborCost: Number(r.labor_cost) || 0,
    businessId: r.business_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toCategory(r: any) {
  return {
    id: r.id,
    name: r.name,
    description: r.description || '',
    color: r.color || '#0047BA',
    parentId: r.parent_id || null,
    businessId: r.business_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toProductionArea(r: any) {
  return {
    id: r.id,
    name: r.name,
    description: r.description || '',
    color: r.color || '#0059FF',
    icon: r.icon || 'Briefcase',
    businessId: r.business_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toIngredient(r: any) {
  return {
    id: r.id,
    name: r.name,
    unit: r.unit,
    currentStock: Number(r.current_stock),
    minStock: Number(r.min_stock),
    maxStock: r.max_stock != null ? Number(r.max_stock) : undefined,
    costPerUnit: r.cost_per_unit != null ? Number(r.cost_per_unit) : undefined,
    supplier: r.supplier || '',
    businessId: r.business_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toStockEvent(r: any) {
  return {
    id: r.id,
    productId: r.product_id,
    productName: r.product_name,
    type: r.type,
    quantity: Number(r.quantity),
    stockAfter: r.stock_after != null ? Number(r.stock_after) : undefined,
    orderId: r.order_id || undefined,
    createdAt: r.created_at,
  };
}

/**
 * Único punto de entrada para escribir en el kardex desde el Edge Function.
 *
 * INVARIANTE DE LA FEATURE: toda escritura a `products.stock` tiene que pasar
 * por acá. Antes este INSERT estaba inline en PUT /products/:id y por eso los
 * otros tres caminos que mueven stock (borrado de pedido, orden de producción
 * terminada y la ruta legacy POST /orders) se olvidaron de registrar: el kardex
 * se veía completo sin estarlo, y eso después no se puede detectar ni
 * reconstruir. La única excepción legítima es la RPC create_order_with_stock,
 * que hace su propio INSERT dentro de la misma transacción que el descuento.
 *
 * Dos criterios deliberados:
 *  - `quantity <= 0` se ignora en silencio: no es un movimiento real y además
 *    violaría el CHECK (quantity > 0) de la tabla.
 *  - Un error del INSERT se loguea pero NO se lanza: el evento es historia, no
 *    parte de la operación. Un kardex incompleto es malo, pero tumbar el ajuste
 *    de stock del usuario es peor.
 */
async function registrarStockEvent(params: {
  businessId: string;
  productId: string;
  productName: string;
  type: 'despacho' | 'reposicion' | 'merma' | 'ajuste' | 'devolucion';
  quantity: number;      // siempre positiva; el signo lo da el type
  stockAfter: number;
  createdBy?: string | null;
  orderId?: string | null;
}): Promise<void> {
  if (!(params.quantity > 0)) return;

  const { error } = await supabaseAdmin.from('stock_events').insert({
    business_id: params.businessId,
    product_id: params.productId,
    product_name: params.productName,
    type: params.type,
    quantity: params.quantity,
    stock_after: params.stockAfter,
    order_id: params.orderId ?? null,
    created_by: params.createdBy ?? null,
  });

  if (error) {
    console.error('Error registrando stock_event:', error);
  }
}

function toOrderItem(r: any) {
  return {
    id: r.id,
    productId: r.product_id,
    name: r.product_name,
    quantity: r.quantity,
    price: Number(r.price),
    productionAreaId: r.production_area_id,
    productionAreaName: r.production_area?.name || null,
    productionAreaColor: r.production_area?.color || null,
    productionAreaIcon: r.production_area?.icon || null,
    areaStatus: r.area_status,
  };
}

function toOrder(r: any) {
  const items = (r.order_items || []).map(toOrderItem);
  return {
    id: r.id,
    userId: r.user_id,
    businessId: r.business_id,
    products: items,
    total: Number(r.total),
    deadline: r.deadline,
    status: r.status,
    progress: r.progress,
    notes: r.notes || '',
    areaStatuses: r.area_statuses || {},
    itemStatuses: r.item_statuses || {},
    customerName: r.customer_name || 'Cliente',
    deliveryAddress: r.delivery_address || 'Sin direccion registrada',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toNotification(r: any) {
  return {
    id: r.id,
    userId: r.user_id,
    businessId: r.business_id,
    title: r.title,
    message: r.message,
    type: r.type,
    orderId: r.order_id,
    read: r.read,
    createdAt: r.created_at,
  };
}

function toAttendance(r: any) {
  return {
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    businessId: r.business_id,
    localId: r.local_id,
    localName: r.local_name,
    checkIn: r.check_in,
    checkOut: r.check_out,
    date: r.date,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// Normalize order_status to handle both English and Spanish variants
const ORDER_STATUS_MAP: Record<string, string> = {
  pending: 'pending',
  in_progress: 'in_progress',
  completed: 'completed',
  dispatched: 'dispatched',
  delivered: 'delivered',
  cancelled: 'cancelled',
  despachado: 'dispatched',
  entregado: 'delivered',
};

const VALID_NOTIFICATION_TYPES = new Set([
  'order_created', 'order_updated', 'order_completed', 'order_cancelled',
  'info', 'warning', 'error',
  'attendance_check_in', 'attendance_check_out',
  'product_created', 'product_updated',
]);

// ─── Auth Helpers ─────────────────────────────────────────────────────────────

async function verifyAuth(authHeader: string | null) {
  if (!authHeader) {
    return { error: 'No authorization header', userId: null };
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return { error: 'Invalid authorization header format', userId: null };
  }

  const token = parts[1];
  if (!token || token.length < 20) {
    return { error: 'Invalid token', userId: null };
  }

  try {
    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
    if (error) return { error: `Invalid JWT: ${error.message}`, userId: null };
    if (!user) return { error: 'User not found', userId: null };
    console.log(`Auth OK: ${user.id} (${user.email})`);
    return { error: null, userId: user.id, user };
  } catch (err) {
    console.error('Auth exception:', err);
    return { error: 'Authentication error', userId: null };
  }
}

async function getProfile(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? toProfile(data) : null;
}

// Roles habilitados para gestionar materias primas y recetas.
// Coincide con lo que la app ya muestra en pantalla (App.tsx: los botones de
// Materias Primas y Recetas solo aparecen para admin y production), así que el
// permiso real del servidor y lo que ve el usuario van juntos.
const ROLES_MATERIAS_PRIMAS = ['admin', 'production'];

function puedeGestionarMateriasPrimas(profile: any) {
  return !!profile?.role && ROLES_MATERIAS_PRIMAS.includes(profile.role);
}

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get("/make-server-6d979413/health", (c) => {
  return c.json({ status: "ok" });
});

// ─── AUTH ROUTES ──────────────────────────────────────────────────────────────

app.post("/make-server-6d979413/auth/reset-password", async (c) => {
  try {
    const { email } = await c.req.json();
    if (!email) return c.json({ error: 'Email es requerido' }, 400);

    await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo: `${SUPABASE_URL}/auth/v1/verify`,
    });

    return c.json({
      success: true,
      message: 'Si el correo existe en nuestro sistema, recibiras un enlace de recuperacion'
    });
  } catch (_err) {
    return c.json({
      success: true,
      message: 'Si el correo existe en nuestro sistema, recibiras un enlace de recuperacion'
    });
  }
});

app.post("/make-server-6d979413/signup", async (c) => {
  try {
    const { email, password, name, role, businessAction, businessCode, businessName } = await c.req.json();

    if (!email || !password || !name) {
      return c.json({ error: 'Email, password y nombre son requeridos' }, 400);
    }

    if (!businessAction || !['create', 'join'].includes(businessAction)) {
      return c.json({ error: 'Debes seleccionar crear o unirte a un negocio' }, 400);
    }

    let businessId = '';
    let business: any = null;

    if (businessAction === 'create') {
      if (!businessName || businessName.trim().length < 3) {
        return c.json({ error: 'El nombre del negocio debe tener al menos 3 caracteres' }, 400);
      }

      const inviteCode = businessName.includes('Demo') && businessName.includes('Oca')
        ? 'DEMOCODE'
        : Math.random().toString(36).substring(2, 10).toUpperCase();

      if (inviteCode === 'DEMOCODE') {
        const { data: existingDemo } = await supabaseAdmin
          .from('businesses')
          .select('*')
          .eq('invite_code', 'DEMOCODE')
          .maybeSingle();

        if (existingDemo) {
          business = toBusiness(existingDemo);
          businessId = existingDemo.id;
          console.log(`Reusing demo business: ${business.name} (${businessId})`);
        } else {
          const { data: newBiz, error: bizErr } = await supabaseAdmin
            .from('businesses')
            .insert({
              name: businessName.trim(),
              invite_code: inviteCode,
              owner_id: null,
            })
            .select()
            .single();
          if (bizErr) throw bizErr;
          business = toBusiness(newBiz);
          businessId = newBiz.id;
          console.log(`Demo business created: ${businessName} (${businessId})`);
        }
      } else {
        const { data: newBiz, error: bizErr } = await supabaseAdmin
          .from('businesses')
          .insert({
            name: businessName.trim(),
            invite_code: inviteCode,
            owner_id: null,
          })
          .select()
          .single();
        if (bizErr) throw bizErr;
        business = toBusiness(newBiz);
        businessId = newBiz.id;
        console.log(`Business created: ${businessName} (${businessId})`);
      }
    } else {
      if (!businessCode || businessCode.trim().length === 0) {
        return c.json({ error: 'Debes proporcionar un codigo de invitacion' }, 400);
      }

      const { data: existingBiz } = await supabaseAdmin
        .from('businesses')
        .select('*')
        .eq('invite_code', businessCode.trim().toUpperCase())
        .maybeSingle();

      if (!existingBiz) {
        return c.json({ error: 'Codigo de invitacion invalido' }, 404);
      }

      business = toBusiness(existingBiz);
      businessId = existingBiz.id;
      console.log(`User joining business: ${business.name} (${businessId})`);
    }

    const userRole = businessAction === 'create' ? 'admin' : (role || 'user');

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      user_metadata: { name, role: userRole, businessId },
      email_confirm: true
    });

    if (error) {
      if (error.message.includes('already registered') || error.message.includes('already been registered')) {
        return c.json({ error: 'Este email ya esta registrado. Por favor inicia sesion.' }, 400);
      }
      return c.json({ error: error.message }, 400);
    }

    if (!data.user) return c.json({ error: 'Error al crear usuario' }, 500);

    const userId = data.user.id;

    // Set owner on newly created business
    if (businessAction === 'create' && !business.ownerId) {
      await supabaseAdmin
        .from('businesses')
        .update({ owner_id: userId })
        .eq('id', businessId);
    }

    // Create profile
    const { error: profileErr } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: userId,
        name,
        email,
        role: userRole,
        business_id: businessId,
        notification_pref_order_status: true,
        notification_pref_production: false,
      });

    if (profileErr) {
      console.error('Error creating profile:', profileErr.message);
    }

    console.log(`User ${email} created and associated with business ${businessId}`);

    return c.json({
      success: true,
      user: { id: userId, email, name, role: userRole, businessId },
      business: {
        id: businessId,
        name: business.name,
        inviteCode: business.inviteCode
      }
    });
  } catch (error: any) {
    console.error('Error in signup:', error);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
});

// ─── PROFILE ROUTES ───────────────────────────────────────────────────────────

app.get("/make-server-6d979413/profile", async (c) => {
  const { error, userId, user } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    let profile = await getProfile(userId!);

    if (!profile && user) {
      console.log(`Profile not found, creating from metadata for user ${userId}`);
      const meta = user.user_metadata || {};
      const { data: newRow, error: insertErr } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: userId,
          name: meta.name || user.email?.split('@')[0] || 'Usuario',
          email: user.email || '',
          role: meta.role || 'user',
          business_id: meta.businessId || null,
          notification_pref_order_status: true,
          notification_pref_production: false,
        })
        .select()
        .single();

      if (insertErr) {
        console.error('Error creating profile:', insertErr.message);
        return c.json({ error: 'No se pudo crear el perfil' }, 500);
      }
      profile = toProfile(newRow);
    }

    if (!profile) return c.json({ error: 'Perfil no encontrado' }, 404);

    return c.json(profile);
  } catch (err: any) {
    console.error('Error getting profile:', err);
    return c.json({ error: 'Error al obtener perfil' }, 500);
  }
});

app.put("/make-server-6d979413/profile", async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const updates = await c.req.json();

    const updateData: any = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.address !== undefined) updateData.address = updates.address;
    if (updates.notificationPrefs) {
      if (updates.notificationPrefs.orderStatus !== undefined)
        updateData.notification_pref_order_status = updates.notificationPrefs.orderStatus;
      if (updates.notificationPrefs.production !== undefined)
        updateData.notification_pref_production = updates.notificationPrefs.production;
    }

    const { data, error: updateErr } = await supabaseAdmin
      .from('profiles')
      .update(updateData)
      .eq('id', userId)
      .select()
      .single();

    if (updateErr) return c.json({ error: 'Perfil no encontrado' }, 404);

    return c.json(toProfile(data));
  } catch (err: any) {
    console.error('Error updating profile:', err);
    return c.json({ error: 'Error al actualizar perfil' }, 500);
  }
});

// ─── BUSINESS ROUTES ──────────────────────────────────────────────────────────

app.get("/make-server-6d979413/business", async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const profile = await getProfile(userId!);
    if (!profile?.businessId) return c.json({ error: 'Usuario no asociado a ningun negocio' }, 404);

    const { data: biz } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .eq('id', profile.businessId)
      .maybeSingle();

    if (!biz) return c.json({ error: 'Negocio no encontrado' }, 404);

    const isOwner = biz.owner_id === userId;
    return c.json({
      data: {
        id: biz.id,
        name: biz.name,
        inviteCode: isOwner ? biz.invite_code : undefined,
        isOwner,
        createdAt: biz.created_at,
      }
    });
  } catch (err: any) {
    console.error('Error getting business:', err);
    return c.json({ error: 'Error al obtener negocio' }, 500);
  }
});

app.post("/make-server-6d979413/business/regenerate-code", async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const profile = await getProfile(userId!);
    if (!profile?.businessId) return c.json({ error: 'Usuario no asociado a ningun negocio' }, 404);

    const { data: biz } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .eq('id', profile.businessId)
      .maybeSingle();

    if (!biz) return c.json({ error: 'Negocio no encontrado' }, 404);
    if (biz.owner_id !== userId) return c.json({ error: 'Solo el propietario puede regenerar el codigo' }, 403);

    const newCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    await supabaseAdmin
      .from('businesses')
      .update({ invite_code: newCode })
      .eq('id', biz.id);

    return c.json({ data: { inviteCode: newCode } });
  } catch (err: any) {
    console.error('Error regenerating invite code:', err);
    return c.json({ error: 'Error al regenerar codigo de invitacion' }, 500);
  }
});

app.get("/make-server-6d979413/business/members", async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const profile = await getProfile(userId!);
    if (!profile?.businessId) return c.json({ error: 'Usuario no asociado a ningun negocio' }, 404);

    const { data: members } = await supabaseAdmin
      .from('profiles')
      .select('id, name, email, role, created_at')
      .eq('business_id', profile.businessId)
      .order('created_at', { ascending: true });

    const { data: biz } = await supabaseAdmin
      .from('businesses')
      .select('id, name')
      .eq('id', profile.businessId)
      .maybeSingle();

    return c.json({
      data: {
        business: { id: biz?.id, name: biz?.name },
        members: (members || []).map((m: any) => ({
          id: m.id,
          name: m.name,
          email: m.email,
          role: m.role,
          createdAt: m.created_at,
        })),
        totalMembers: (members || []).length,
      }
    });
  } catch (err: any) {
    console.error('Error getting members:', err);
    return c.json({ error: 'Error al obtener miembros del negocio' }, 500);
  }
});

/**
 * Verifica si un SKU ya está usado por otro producto del mismo negocio.
 * `excludeProductId` permite editar un producto sin que choque contra sí mismo.
 * Devuelve el mensaje de error si hay duplicado, o null si está libre.
 */
async function checkDuplicateSku(
  businessId: string,
  sku: string,
  excludeProductId?: string
): Promise<string | null> {
  if (!sku) return null; // SKU vacío es válido: el campo es opcional

  let query = supabaseAdmin
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('sku', sku);

  if (excludeProductId) query = query.neq('id', excludeProductId);

  // Este pre-chequeo es solo una comodidad de UX (mensaje de error más claro);
  // la garantía real de unicidad la da el índice único de la base, que el
  // insert/update siguiente respeta igual aunque esta consulta falle.
  const { count, error } = await query;
  if (error) {
    console.error('Error verificando SKU duplicado:', error);
  }
  return count && count > 0 ? `Ya existe un producto con el SKU "${sku}"` : null;
}

// ─── PRODUCT ROUTES ───────────────────────────────────────────────────────────

app.get("/make-server-6d979413/products", async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const profile = await getProfile(userId!);
    if (!profile?.businessId) return c.json({ error: 'Usuario no asociado a ningun negocio' }, 404);

    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '1000');
    const offset = (page - 1) * limit;

    const { data: products, count } = await supabaseAdmin
      .from('products')
      .select('*, categories(name), product_ingredients(ingredient_id, quantity)', { count: 'exact' })
      .eq('business_id', profile.businessId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const total = count ?? 0;
    const result = (products || []).map(toProduct);

    return c.json({
      data: result,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: offset + limit < total,
        hasPrev: page > 1,
      }
    });
  } catch (err: any) {
    console.error('Error getting products:', err);
    return c.json({ error: 'Error al obtener productos' }, 500);
  }
});

app.post("/make-server-6d979413/products", async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const profile = await getProfile(userId!);
    if (!profile?.businessId) return c.json({ error: 'Usuario no asociado a ningun negocio' }, 404);

    const body = await c.req.json();
    const { name, description, price, image, imageUrl, stock, categoryId, productionAreaId, ingredients, unlimitedStock, allowDecimal, laborCost, sku, minStock } = body;

    if (!name || price === undefined || price === null) {
      return c.json({ error: 'Nombre y precio son requeridos' }, 400);
    }

    const skuNorm = (sku || '').trim();
    const skuError = await checkDuplicateSku(profile.businessId, skuNorm);
    if (skuError) return c.json({ error: skuError }, 400);

    const isUnlimited = unlimitedStock === true || parseInt(stock) === -1;
    const { data: newProduct, error: insertErr } = await supabaseAdmin
      .from('products')
      .insert({
        business_id: profile.businessId,
        name,
        description: description || '',
        price: parseFloat(price),
        image_url: imageUrl || image || '',
        stock: isUnlimited ? 0 : (stock !== undefined ? parseInt(stock) : 100),
        min_stock: minStock !== undefined && minStock !== null && minStock !== '' ? Number(minStock) : null,
        unlimited_stock: isUnlimited,
        track_stock: !isUnlimited,
        allow_decimal: allowDecimal === true,
        category_id: categoryId || null,
        sku: skuNorm || null, // null (no '') para que el índice único parcial ignore los vacíos
        production_area_id: productionAreaId || null,
        labor_cost: laborCost !== undefined ? Number(laborCost) : 0,
      })
      .select('*, categories(name)')
      .single();

    if (insertErr) {
      console.error('Error creating product:', insertErr);
      // Igual que en el PUT: si skuNorm está vacío, el 23505 vino de otro
      // índice y no del SKU, así que cae al 500 genérico en vez de decir
      // 'Ya existe un producto con el SKU ""'.
      if (insertErr.code === '23505' && skuNorm) {
        return c.json({ error: `Ya existe un producto con el SKU "${skuNorm}"` }, 400);
      }
      return c.json({ error: 'Error al crear producto' }, 500);
    }

    // Save product-ingredient relations
    if (ingredients && Array.isArray(ingredients) && ingredients.length > 0) {
      const piRows = ingredients
        .filter((ing: any) => ing.ingredientId && ing.quantity)
        .map((ing: any) => ({
          product_id: newProduct.id,
          ingredient_id: ing.ingredientId,
          quantity: ing.quantity,
        }));

      if (piRows.length > 0) {
        await supabaseAdmin.from('product_ingredients').insert(piRows);
      }
    }

    // Fetch back with ingredients
    const { data: fullProduct } = await supabaseAdmin
      .from('products')
      .select('*, categories(name), product_ingredients(ingredient_id, quantity)')
      .eq('id', newProduct.id)
      .single();

    console.log(`Product created: ${name} for business ${profile.businessId}`);
    return c.json({ data: toProduct(fullProduct || newProduct) });
  } catch (err: any) {
    console.error('Error creating product:', err);
    return c.json({ error: 'Error al crear producto' }, 500);
  }
});

app.put("/make-server-6d979413/products/:id", async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const productId = c.req.param('id');
    const profile = await getProfile(userId!);
    if (!profile?.businessId) return c.json({ error: 'Usuario no asociado a ningun negocio' }, 404);

    // Se traen stock y unlimited_stock además de los campos de permisos: el
    // registro en el kardex necesita el stock PREVIO para calcular el delta.
    const { data: existing } = await supabaseAdmin
      .from('products')
      .select('id, business_id, stock, unlimited_stock')
      .eq('id', productId)
      .maybeSingle();

    if (!existing) return c.json({ error: 'Producto no encontrado' }, 404);
    if (existing.business_id !== profile.businessId) return c.json({ error: 'No tienes permiso' }, 403);

    const updates = await c.req.json();
    const { ingredients, imageUrl, image, name, description, price, stock, categoryId, productionAreaId, unlimitedStock, trackStock, allowDecimal, laborCost, sku, modo, minStock } = updates;

    let skuNorm: string | undefined;
    if (sku !== undefined) {
      skuNorm = (sku || '').trim();
      const skuError = await checkDuplicateSku(profile.businessId, skuNorm, productId);
      if (skuError) return c.json({ error: skuError }, 400);
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (price !== undefined) updateData.price = parseFloat(price);
    if (stock !== undefined) {
      const stockVal = parseInt(stock);
      if (stockVal === -1) {
        // Legacy signal: -1 means unlimited stock
        updateData.stock = 0;
        updateData.unlimited_stock = true;
        updateData.track_stock = false;
      } else {
        updateData.stock = stockVal;
      }
    }
    if (imageUrl !== undefined || image !== undefined) updateData.image_url = imageUrl || image || '';
    if (categoryId !== undefined) updateData.category_id = categoryId;
    if (productionAreaId !== undefined) updateData.production_area_id = productionAreaId;
    if (unlimitedStock !== undefined) {
      updateData.unlimited_stock = unlimitedStock;
      updateData.track_stock = !unlimitedStock;
      if (unlimitedStock) updateData.stock = 0;
    }
    if (trackStock !== undefined) updateData.track_stock = trackStock;
    if (allowDecimal !== undefined) updateData.allow_decimal = allowDecimal === true;
    if (laborCost !== undefined) updateData.labor_cost = Number(laborCost) || 0;
    // '' se guarda como null (sin umbral), no como 0: un umbral de 0 significaría
    // "avisame solo cuando esté agotado", que es una intención distinta a "no lo configuré".
    if (minStock !== undefined) {
      updateData.min_stock = minStock === null || minStock === '' ? null : Number(minStock);
    }
    if (skuNorm !== undefined) updateData.sku = skuNorm || null;

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('products')
      .update(updateData)
      .eq('id', productId)
      .select('*, categories(name)')
      .single();

    if (updateErr) {
      console.error('Error updating product:', updateErr);
      // La condición `skuNorm !== undefined` importa: si el request no traía sku,
      // un 23505 vino de otro índice y el mensaje diría 'SKU "undefined"'.
      if (updateErr.code === '23505' && skuNorm !== undefined) {
        return c.json({ error: `Ya existe un producto con el SKU "${skuNorm}"` }, 400);
      }
      return c.json({ error: 'Error al actualizar producto' }, 500);
    }

    // Kardex: se registra el movimiento sin pedirle ningún dato nuevo al usuario.
    // El tipo se deduce del modo con el que hizo el ajuste (lo manda
    // StockAdjustDialog) más el signo del delta:
    //   'sumar'  + delta > 0  -> reposicion  (llegó mercadería)
    //   'sumar'  + delta < 0  -> merma       (rotura / vencimiento)
    //   'total'               -> ajuste      (corrección de conteo)
    // Si el request no trae `modo` (ej. el formulario completo de edición, o el
    // ajuste que hace EditOrderDialog), se registra como 'ajuste': es el tipo
    // neutro y no ensucia el análisis de reposiciones.
    //
    // Solo se registra cuando el request cambió el stock Y el update resultante
    // NO tocó unlimited_stock: al pasar un producto a stock ilimitado el backend
    // fuerza stock = 0, y eso no es un movimiento real de mercadería.
    // Se mira `updateData.unlimited_stock` (el resultado post-procesamiento) y
    // no el campo crudo `unlimitedStock` del body: el signal legado `stock: -1`
    // también setea `updateData.unlimited_stock = true` sin que el body traiga
    // la clave `unlimitedStock`, y ese caso hay que excluirlo igual.
    const esAjusteDeStock =
      stock !== undefined &&
      updateData.unlimited_stock === undefined &&
      existing.unlimited_stock !== true;

    if (esAjusteDeStock) {
      const stockAnterior = Number(existing.stock);
      const stockNuevo = Number(updated.stock);
      const delta = stockNuevo - stockAnterior;

      if (delta !== 0) {
        const tipo = modo === 'sumar'
          ? (delta > 0 ? 'reposicion' : 'merma')
          : 'ajuste';

        // registrarStockEvent no lanza si el INSERT falla: solo loguea. El
        // evento es historia, no parte de la operación, así que un kardex
        // incompleto es mejor que un ajuste de stock que no se guarda.
        await registrarStockEvent({
          businessId: profile.businessId,
          productId,
          productName: updated.name,
          type: tipo,
          quantity: Math.abs(delta),
          stockAfter: stockNuevo,
          createdBy: userId,
        });
      }
    }

    // Update product-ingredient relations if provided.
    // El chequeo de rol va acá adentro, no al principio de la ruta: este endpoint
    // tambien lo usan otros roles para actualizar solo el stock (desde pedidos),
    // y bloquear la ruta entera les romperia ese flujo.
    if (ingredients !== undefined && Array.isArray(ingredients)) {
      if (!puedeGestionarMateriasPrimas(profile)) {
        return c.json({ error: 'No tenes permiso para gestionar recetas' }, 403);
      }

      await supabaseAdmin.from('product_ingredients').delete().eq('product_id', productId);

      if (ingredients.length > 0) {
        const piRows = ingredients
          .filter((ing: any) => ing.ingredientId && ing.quantity)
          .map((ing: any) => ({
            product_id: productId,
            ingredient_id: ing.ingredientId,
            quantity: ing.quantity,
          }));
        if (piRows.length > 0) {
          await supabaseAdmin.from('product_ingredients').insert(piRows);
        }
      }
    }

    const { data: fullProduct } = await supabaseAdmin
      .from('products')
      .select('*, categories(name), product_ingredients(ingredient_id, quantity)')
      .eq('id', productId)
      .single();

    console.log(`Product updated: ${updated.name}`);
    return c.json({ data: toProduct(fullProduct || updated) });
  } catch (err: any) {
    console.error('Error updating product:', err);
    return c.json({ error: 'Error al actualizar producto' }, 500);
  }
});

app.delete("/make-server-6d979413/products/:id", async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const productId = c.req.param('id');
    const profile = await getProfile(userId!);
    if (!profile?.businessId) return c.json({ error: 'Usuario no asociado a ningun negocio' }, 404);

    const { data: existing } = await supabaseAdmin
      .from('products')
      .select('id, business_id, name')
      .eq('id', productId)
      .maybeSingle();

    if (!existing) return c.json({ error: 'Producto no encontrado' }, 404);
    if (existing.business_id !== profile.businessId) return c.json({ error: 'No tienes permiso' }, 403);

    await supabaseAdmin.from('products').delete().eq('id', productId);

    console.log(`Product deleted: ${existing.name}`);
    return c.json({ data: { deleted: true } });
  } catch (err: any) {
    console.error('Error deleting product:', err);
    return c.json({ error: 'Error al eliminar producto' }, 500);
  }
});

// ─── PRODUCT INGREDIENTS (nested under /products/:id) ────────────────────────

app.get('/make-server-6d979413/products/:id/ingredients', async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const productId = c.req.param('id');

    const { data: product } = await supabaseAdmin
      .from('products')
      .select('id, name')
      .eq('id', productId)
      .maybeSingle();

    if (!product) return c.json({ error: 'Product not found' }, 404);

    const { data: relations } = await supabaseAdmin
      .from('product_ingredients')
      .select('*, ingredients(name, unit, cost_per_unit, current_stock)')
      .eq('product_id', productId);

    const result = (relations || []).map((r: any) => ({
      id: r.id,
      productId,
      productName: product.name,
      ingredientId: r.ingredient_id,
      ingredientName: r.ingredients?.name || 'Unknown',
      quantity: r.quantity,
      unit: r.ingredients?.unit || '',
      costPerUnit: r.ingredients?.cost_per_unit || 0,
    }));

    return c.json({ data: result });
  } catch (err: any) {
    console.error('Error getting product ingredients:', err);
    return c.json({ error: 'Failed to get product ingredients' }, 500);
  }
});

app.put('/make-server-6d979413/products/:id/ingredients', async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const profile = await getProfile(userId!);
    if (!puedeGestionarMateriasPrimas(profile)) {
      return c.json({ error: 'No tenes permiso para gestionar recetas' }, 403);
    }

    const productId = c.req.param('id');
    const { ingredients } = await c.req.json();

    const { data: product } = await supabaseAdmin
      .from('products')
      .select('id, name')
      .eq('id', productId)
      .maybeSingle();

    if (!product) return c.json({ error: 'Product not found' }, 404);

    await supabaseAdmin.from('product_ingredients').delete().eq('product_id', productId);

    const result = [];
    if (ingredients && Array.isArray(ingredients)) {
      for (const ing of ingredients) {
        if (!ing.ingredientId || !ing.quantity) continue;
        const { data: row } = await supabaseAdmin
          .from('product_ingredients')
          .insert({ product_id: productId, ingredient_id: ing.ingredientId, quantity: ing.quantity })
          .select('*, ingredients(name, unit, cost_per_unit)')
          .single();
        if (row) {
          result.push({
            id: row.id,
            productId,
            productName: product.name,
            ingredientId: row.ingredient_id,
            ingredientName: row.ingredients?.name || 'Unknown',
            quantity: row.quantity,
            unit: row.ingredients?.unit || '',
            costPerUnit: row.ingredients?.cost_per_unit || 0,
          });
        }
      }
    }

    return c.json({ data: result });
  } catch (err: any) {
    console.error('Error updating product ingredients:', err);
    return c.json({ error: 'Failed to update product ingredients' }, 500);
  }
});

app.post('/make-server-6d979413/products/:id/ingredients', async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const profile = await getProfile(userId!);
    if (!puedeGestionarMateriasPrimas(profile)) {
      return c.json({ error: 'No tenes permiso para gestionar recetas' }, 403);
    }

    const productId = c.req.param('id');
    const { ingredientId, quantity } = await c.req.json();

    if (!ingredientId || !quantity || quantity <= 0) {
      return c.json({ error: 'ingredientId and quantity are required' }, 400);
    }

    const { data: product } = await supabaseAdmin
      .from('products')
      .select('id, name')
      .eq('id', productId)
      .maybeSingle();
    if (!product) return c.json({ error: 'Product not found' }, 404);

    const { data: ingredient } = await supabaseAdmin
      .from('ingredients')
      .select('id, name, unit, cost_per_unit')
      .eq('id', ingredientId)
      .maybeSingle();
    if (!ingredient) return c.json({ error: 'Ingredient not found' }, 404);

    await supabaseAdmin
      .from('product_ingredients')
      .upsert({ product_id: productId, ingredient_id: ingredientId, quantity },
        { onConflict: 'product_id,ingredient_id' });

    const { data: row } = await supabaseAdmin
      .from('product_ingredients')
      .select('id')
      .eq('product_id', productId)
      .eq('ingredient_id', ingredientId)
      .single();

    return c.json({
      data: {
        id: row?.id,
        productId,
        productName: product.name,
        ingredientId,
        ingredientName: ingredient.name,
        quantity,
        unit: ingredient.unit,
        costPerUnit: ingredient.cost_per_unit || 0,
      }
    }, 201);
  } catch (err: any) {
    console.error('Error adding ingredient to product:', err);
    return c.json({ error: 'Failed to add ingredient to product' }, 500);
  }
});

app.delete('/make-server-6d979413/products/:productId/ingredients/:ingredientId', async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const profile = await getProfile(userId!);
    if (!puedeGestionarMateriasPrimas(profile)) {
      return c.json({ error: 'No tenes permiso para gestionar recetas' }, 403);
    }

    const productId = c.req.param('productId');
    const ingredientId = c.req.param('ingredientId');

    const { data: relation } = await supabaseAdmin
      .from('product_ingredients')
      .select('id')
      .eq('product_id', productId)
      .eq('ingredient_id', ingredientId)
      .maybeSingle();

    if (!relation) return c.json({ error: 'Product-ingredient relationship not found' }, 404);

    await supabaseAdmin
      .from('product_ingredients')
      .delete()
      .eq('product_id', productId)
      .eq('ingredient_id', ingredientId);

    return c.json({ data: { deleted: true } });
  } catch (err: any) {
    console.error('Error removing ingredient from product:', err);
    return c.json({ error: 'Failed to remove ingredient from product' }, 500);
  }
});

// Movimientos de stock de un producto. Solo admin: es información de gestión,
// no operativa. No hay ruta GET /products/:id, así que este path no colisiona.
app.get('/make-server-6d979413/products/:id/stock-events', async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const productId = c.req.param('id');
    const profile = await getProfile(userId!);
    if (!profile?.businessId) return c.json({ error: 'Usuario no asociado a ningun negocio' }, 404);
    if (profile.role !== 'admin') return c.json({ error: 'No autorizado' }, 403);

    // El tope duro evita que un limit gigante en la query traiga la tabla entera.
    // Number.isFinite atrapa el `limit=abc`: sin esto parseInt devuelve NaN,
    // Math.min(NaN, 200) es NaN y la query sale rota.
    const limitCrudo = parseInt(c.req.query('limit') || '50');
    const limit = Number.isFinite(limitCrudo) && limitCrudo > 0
      ? Math.min(limitCrudo, 200)
      : 50;

    // El filtro por business_id no es redundante con el product_id: evita que
    // un id de otro negocio devuelva datos si se lo pasan a mano.
    const { data, error: queryErr } = await supabaseAdmin
      .from('stock_events')
      .select('*')
      .eq('business_id', profile.businessId)
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(limit);

    // Se chequea el error explícitamente: si la tabla no existe o RLS bloquea,
    // `data` viene null y devolver 200 con [] haría que la UI diga "todavía no
    // hay movimientos". Ese es el peor mensaje posible acá, porque enmascara un
    // kardex roto como "todavía no hay datos" y nadie lo va a investigar.
    if (queryErr) {
      console.error('Error consultando stock_events:', queryErr);
      return c.json({ error: 'Error al obtener movimientos' }, 500);
    }

    return c.json({ data: (data || []).map(toStockEvent) });
  } catch (err: any) {
    console.error('Error getting stock events:', err);
    return c.json({ error: 'Error al obtener movimientos' }, 500);
  }
});

// ─── UPLOAD PRODUCT IMAGE ─────────────────────────────────────────────────────

app.post("/make-server-6d979413/upload-product-image", async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const profile = await getProfile(userId!);
    if (!profile?.businessId) return c.json({ error: 'Usuario no asociado a ningun negocio' }, 404);

    const formData = await c.req.formData();
    const file = formData.get('file') as File;

    if (!file) return c.json({ error: 'No se proporciono ningun archivo' }, 400);
    if (!file.type.startsWith('image/')) return c.json({ error: 'El archivo debe ser una imagen' }, 400);
    if (file.size > 5 * 1024 * 1024) return c.json({ error: 'La imagen no debe superar los 5MB' }, 400);

    const bucketName = `make-6d979413-products`;
    const fileExt = file.name.split('.').pop();
    const fileName = `${profile.businessId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from(bucketName)
      .upload(fileName, buffer, { contentType: file.type, upsert: false });

    if (uploadError) {
      console.error('Error uploading file:', uploadError);
      return c.json({ error: `Error al subir la imagen: ${uploadError.message}` }, 500);
    }

    const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
      .from(bucketName)
      .createSignedUrl(fileName, 31536000);

    if (signedUrlError) {
      return c.json({ error: 'Error al crear la URL de la imagen' }, 500);
    }

    return c.json({ url: signedUrlData.signedUrl, path: uploadData.path });
  } catch (err: any) {
    console.error('Error in upload-product-image:', err);
    return c.json({ error: 'Error al subir la imagen' }, 500);
  }
});

// ─── ORDER ROUTES ─────────────────────────────────────────────────────────────

app.get("/make-server-6d979413/orders", async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const profile = await getProfile(userId!);
    if (!profile?.businessId) return c.json({ error: 'Usuario no asociado a ningun negocio' }, 404);

    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = (page - 1) * limit;

    const isStaff = ['admin', 'production', 'dispatch', 'pastry'].includes(profile.role);

    let query = supabaseAdmin
      .from('orders')
      .select('*, order_items(*, production_area:production_areas(name, color, icon))', { count: 'exact' })
      .eq('business_id', profile.businessId)
      .order('created_at', { ascending: false });

    if (!isStaff) {
      query = query.eq('user_id', userId);
    }

    const { data: orders, count } = await query.range(offset, offset + limit - 1);

    if (!orders || orders.length === 0) {
      return c.json({
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0, hasNext: false, hasPrev: false }
      });
    }

    // Batch fetch customer profiles for enrichment
    const userIds = [...new Set(orders.map((o: any) => o.user_id))];
    const { data: customerProfiles } = await supabaseAdmin
      .from('profiles')
      .select('id, name, address')
      .in('id', userIds as string[]);

    const profileMap: Record<string, any> = {};
    (customerProfiles || []).forEach((p: any) => { profileMap[p.id] = p; });

    const enrichedOrders = orders.map((order: any) => {
      const customer = profileMap[order.user_id];
      const mapped = toOrder(order);
      if (customer) {
        if (!order.customer_name) mapped.customerName = customer.name || 'Cliente';
        if (!order.delivery_address) mapped.deliveryAddress = customer.address || 'Sin direccion registrada';
      }
      return mapped;
    });

    const total = count ?? 0;
    return c.json({
      data: enrichedOrders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: offset + limit < total,
        hasPrev: page > 1,
      }
    });
  } catch (err: any) {
    console.error('Error getting orders:', err);
    return c.json({ error: 'Error al obtener pedidos', details: err.message }, 500);
  }
});

app.get("/make-server-6d979413/orders/:id", async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const orderId = c.req.param('id');
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('*, order_items(*, production_area:production_areas(name, color, icon))')
      .eq('id', orderId)
      .maybeSingle();

    if (!order) return c.json({ error: 'Pedido no encontrado' }, 404);

    const profile = await getProfile(userId!);
    const isStaff = ['admin', 'production', 'dispatch', 'pastry'].includes(profile?.role || '');
    if (order.user_id !== userId && !isStaff) return c.json({ error: 'No autorizado' }, 403);

    return c.json(toOrder(order));
  } catch (err: any) {
    console.error('Error getting order:', err);
    return c.json({ error: 'Error al obtener pedido' }, 500);
  }
});

app.post("/make-server-6d979413/orders", async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const profile = await getProfile(userId!);
    if (!profile?.businessId) return c.json({ error: 'Usuario no asociado a ningun negocio' }, 404);

    const { products, deadline, total, notes } = await c.req.json();
    if (!products || !deadline) return c.json({ error: 'Productos y fecha limite son requeridos' }, 400);

    // Validate and update stock for each product
    for (const item of products) {
      const { data: product } = await supabaseAdmin
        .from('products')
        .select('id, name, stock, unlimited_stock, track_stock, business_id')
        .eq('id', item.productId)
        .maybeSingle();

      if (!product) return c.json({ error: `Producto "${item.name}" no encontrado` }, 404);
      if (product.business_id !== profile.businessId) {
        return c.json({ error: `Producto "${item.name}" no pertenece a tu negocio` }, 403);
      }

      const isUnlimited = product.unlimited_stock === true || product.track_stock === false || product.stock === -1;
      if (!isUnlimited && product.stock < item.quantity) {
        return c.json({
          error: `Stock insuficiente para "${item.name}". Disponible: ${product.stock}, Solicitado: ${item.quantity}`
        }, 400);
      }

      if (!isUnlimited) {
        const stockNuevo = product.stock - item.quantity;
        await supabaseAdmin
          .from('products')
          .update({ stock: stockNuevo })
          .eq('id', item.productId);

        // Mismo tipo que usa la RPC create_order_with_stock: es exactamente el
        // mismo hecho (salida por pedido de un local).
        // orderId va null a propósito: el pedido todavía no existe (se crea más
        // abajo). Registrar acá y no después es deliberado: si la creación del
        // pedido falla, el stock ya se descontó igual, y un evento sin order_id
        // es mucho mejor que un descuento invisible.
        await registrarStockEvent({
          businessId: profile.businessId,
          productId: product.id,
          productName: product.name,
          type: 'despacho',
          quantity: item.quantity,
          stockAfter: stockNuevo,
          createdBy: userId,
        });
      }
    }

    // Calculate area statuses
    const areaStatuses: Record<string, string> = {};
    for (const item of products) {
      if (item.productionAreaId) {
        areaStatuses[item.productionAreaId] = 'pending';
      }
    }

    // Create order
    const { data: newOrder, error: orderErr } = await supabaseAdmin
      .from('orders')
      .insert({
        business_id: profile.businessId,
        user_id: userId,
        status: 'pending',
        progress: 0,
        total: parseFloat(total),
        deadline,
        notes: notes || null,
        delivery_address: profile.address || null,
        customer_name: profile.name || null,
        area_statuses: areaStatuses,
        item_statuses: {},
      })
      .select()
      .single();

    if (orderErr) {
      console.error('Error creating order:', orderErr);
      return c.json({ error: 'Error al crear pedido' }, 500);
    }

    // Insert order items
    const itemRows = products.map((item: any) => ({
      order_id: newOrder.id,
      product_id: item.productId,
      product_name: item.name,
      quantity: item.quantity,
      price: item.price,
      production_area_id: item.productionAreaId || null,
      area_status: 'pending',
    }));

    await supabaseAdmin.from('order_items').insert(itemRows);

    // Fetch complete order
    const { data: fullOrder } = await supabaseAdmin
      .from('orders')
      .select('*, order_items(*, production_area:production_areas(name, color, icon))')
      .eq('id', newOrder.id)
      .single();

    console.log(`Order created: ${newOrder.id} for business ${profile.businessId}`);
    return c.json(toOrder(fullOrder || newOrder));
  } catch (err: any) {
    console.error('Error creating order:', err);
    return c.json({ error: 'Error al crear pedido' }, 500);
  }
});

app.put("/make-server-6d979413/orders/:id", async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const orderId = c.req.param('id');
    const profile = await getProfile(userId!);

    const { data: currentOrder } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (!currentOrder) return c.json({ error: 'Pedido no encontrado' }, 404);
    if (currentOrder.business_id !== profile?.businessId) return c.json({ error: 'No autorizado' }, 403);

    const allowedRoles = ['admin', 'production', 'dispatch', 'local'];
    if (!allowedRoles.includes(profile?.role || '') && currentOrder.user_id !== userId) {
      return c.json({ error: 'No tienes permiso para editar este pedido' }, 403);
    }

    const updates = await c.req.json();
    const { products, total, notes, deadline, customerName, deliveryAddress, status } = updates;

    const updateData: any = {};
    if (total !== undefined) updateData.total = parseFloat(total);
    if (notes !== undefined) updateData.notes = notes;
    if (deadline !== undefined) updateData.deadline = deadline;
    if (customerName !== undefined) updateData.customer_name = customerName;
    if (deliveryAddress !== undefined) updateData.delivery_address = deliveryAddress;
    if (status !== undefined) updateData.status = ORDER_STATUS_MAP[status] || status;

    const { data: updated } = await supabaseAdmin
      .from('orders')
      .update(updateData)
      .eq('id', orderId)
      .select()
      .single();

    // Update products/items if provided
    if (products && Array.isArray(products)) {
      await supabaseAdmin.from('order_items').delete().eq('order_id', orderId);
      const itemRows = products.map((item: any) => ({
        order_id: orderId,
        product_id: item.productId,
        product_name: item.name,
        quantity: item.quantity,
        price: item.price,
        production_area_id: item.productionAreaId || null,
        area_status: item.areaStatus || 'pending',
      }));
      await supabaseAdmin.from('order_items').insert(itemRows);
    }

    const { data: fullOrder } = await supabaseAdmin
      .from('orders')
      .select('*, order_items(*, production_area:production_areas(name, color, icon))')
      .eq('id', orderId)
      .single();

    return c.json(toOrder(fullOrder || updated));
  } catch (err: any) {
    console.error('Error updating order:', err);
    return c.json({ error: 'Error al actualizar el pedido' }, 500);
  }
});

app.put("/make-server-6d979413/orders/:id/status", async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const orderId = c.req.param('id');
    const profile = await getProfile(userId!);
    const { status, progress } = await c.req.json();

    const userRole = profile?.role || '';
    const isPowerUser = ['production', 'dispatch', 'admin', 'pastry'].includes(userRole);
    const isLocalDelivering = ['local', 'user'].includes(userRole) &&
      ['entregado', 'delivered'].includes(status);

    if (!isPowerUser && !isLocalDelivering) return c.json({ error: 'No autorizado' }, 403);

    const { data: currentOrder } = await supabaseAdmin
      .from('orders')
      .select('id, business_id')
      .eq('id', orderId)
      .maybeSingle();

    if (!currentOrder) return c.json({ error: 'Pedido no encontrado' }, 404);

    const normalizedStatus = ORDER_STATUS_MAP[status] || 'pending';
    const { data: updated } = await supabaseAdmin
      .from('orders')
      .update({
        status: normalizedStatus,
        progress: progress !== undefined ? progress : undefined,
      })
      .eq('id', orderId)
      .select()
      .single();

    const { data: fullOrder } = await supabaseAdmin
      .from('orders')
      .select('*, order_items(*, production_area:production_areas(name, color, icon))')
      .eq('id', orderId)
      .single();

    return c.json(toOrder(fullOrder || updated));
  } catch (err: any) {
    console.error('Error updating order status:', err);
    return c.json({ error: 'Error al actualizar estado del pedido' }, 500);
  }
});

app.put("/make-server-6d979413/orders/:id/area-status", async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const orderId = c.req.param('id');
    const profile = await getProfile(userId!);

    if (!['production', 'dispatch', 'admin'].includes(profile?.role || '')) {
      return c.json({ error: 'No autorizado' }, 403);
    }

    const { areaId, status } = await c.req.json();
    if (!areaId || !status) return c.json({ error: 'areaId y status son requeridos' }, 400);

    const { data: currentOrder } = await supabaseAdmin
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', orderId)
      .maybeSingle();

    if (!currentOrder) return c.json({ error: 'Pedido no encontrado' }, 404);

    // Update items in this area
    const normalAreaStatus = ['in_progress', 'completed', 'pending'].includes(status) ? status : 'pending';
    await supabaseAdmin
      .from('order_items')
      .update({ area_status: normalAreaStatus })
      .eq('order_id', orderId)
      .eq('production_area_id', areaId);

    // Get updated items to recalculate order status
    const { data: allItems } = await supabaseAdmin
      .from('order_items')
      .select('area_status, production_area_id')
      .eq('order_id', orderId);

    // Build updated area statuses
    const updatedAreaStatuses = { ...(currentOrder.area_statuses || {}), [areaId]: status };

    // Calculate overall progress
    const allAreaStatuses = Object.values(updatedAreaStatuses);
    let overallStatus = currentOrder.status;
    let overallProgress = currentOrder.progress;

    if (allAreaStatuses.length > 0 && allAreaStatuses.every((s: any) => s === 'completed')) {
      overallStatus = 'completed';
      overallProgress = 100;
    } else if (allAreaStatuses.some((s: any) => s === 'in_progress')) {
      overallStatus = 'in_progress';
      const completedCount = allAreaStatuses.filter((s: any) => s === 'completed').length;
      overallProgress = Math.round((completedCount / allAreaStatuses.length) * 100);
    }

    await supabaseAdmin
      .from('orders')
      .update({
        area_statuses: updatedAreaStatuses,
        status: overallStatus,
        progress: overallProgress,
      })
      .eq('id', orderId);

    const { data: fullOrder } = await supabaseAdmin
      .from('orders')
      .select('*, order_items(*, production_area:production_areas(name, color, icon))')
      .eq('id', orderId)
      .single();

    return c.json(toOrder(fullOrder || currentOrder));
  } catch (err: any) {
    console.error('Error updating order area status:', err);
    return c.json({ error: 'Error al actualizar estado del area' }, 500);
  }
});

app.delete("/make-server-6d979413/orders/:id", async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const orderId = c.req.param('id');
    const profile = await getProfile(userId!);
    if (!profile?.businessId) return c.json({ error: 'Usuario no asociado a ningun negocio' }, 404);

    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('*, order_items(product_id, quantity)')
      .eq('id', orderId)
      .maybeSingle();

    if (!order) return c.json({ error: 'Pedido no encontrado' }, 404);
    if (order.business_id !== profile.businessId) return c.json({ error: 'No tienes permiso' }, 403);

    // Restore stock for each item
    for (const item of (order.order_items || [])) {
      if (!item.product_id) continue;
      // name y business_id se traen para poder registrar el evento del kardex.
      const { data: product } = await supabaseAdmin
        .from('products')
        .select('id, name, business_id, stock, unlimited_stock, track_stock')
        .eq('id', item.product_id)
        .maybeSingle();

      if (product) {
        const isUnlimited = product.unlimited_stock === true || product.track_stock === false;
        if (!isUnlimited) {
          const stockNuevo = product.stock + item.quantity;
          await supabaseAdmin
            .from('products')
            .update({ stock: stockNuevo })
            .eq('id', item.product_id);

          // Sin este evento el kardex mentía de la peor forma: el 'despacho'
          // original quedaba registrado y el stock volvía sin dejar rastro, así
          // que la demanda del producto se veía más alta de lo que fue.
          await registrarStockEvent({
            businessId: product.business_id,
            productId: product.id,
            productName: product.name,
            type: 'devolucion',
            quantity: item.quantity,
            stockAfter: stockNuevo,
            createdBy: userId,
            orderId,
          });
        }
      }
    }

    await supabaseAdmin.from('orders').delete().eq('id', orderId);

    console.log(`Order deleted: ${orderId}`);
    return c.json({ success: true, message: 'Pedido eliminado correctamente' });
  } catch (err: any) {
    console.error('Error deleting order:', err);
    return c.json({ error: 'Error al eliminar pedido' }, 500);
  }
});

// ─── NOTIFICATIONS ROUTES ─────────────────────────────────────────────────────

app.get('/make-server-6d979413/notifications', async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) {
    if (!error.includes('Auth session missing')) console.error('Auth error in GET notifications:', error);
    return c.json({ error }, 401);
  }

  try {
    const { data: notifications } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    return c.json({ data: (notifications || []).map(toNotification) });
  } catch (err: any) {
    console.error('Error fetching notifications:', err);
    return c.json({ error: 'Failed to fetch notifications' }, 500);
  }
});

app.post('/make-server-6d979413/notifications', async (c) => {
  const { error, userId: authUserId } = await verifyAuth(c.req.header('Authorization'));
  if (error) {
    if (!error.includes('Auth session missing')) console.error('Auth error in POST notifications:', error);
    return c.json({ error }, 401);
  }

  try {
    const profile = await getProfile(authUserId!);
    const { title, message, type, orderId, targetUserId } = await c.req.json();

    if (!title || !message || !type) {
      return c.json({ error: 'Missing required fields: title, message, type' }, 400);
    }

    const targetId = targetUserId || authUserId;
    const notifType = VALID_NOTIFICATION_TYPES.has(type) ? type : 'info';

    const { data: notification, error: insertErr } = await supabaseAdmin
      .from('notifications')
      .insert({
        user_id: targetId,
        business_id: profile?.businessId || null,
        title,
        message,
        type: notifType,
        order_id: orderId || null,
        read: false,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    return c.json({ data: toNotification(notification) }, 201);
  } catch (err: any) {
    console.error('Error creating notification:', err);
    return c.json({ error: 'Failed to create notification' }, 500);
  }
});

app.patch('/make-server-6d979413/notifications/read-all', async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) {
    if (!error.includes('Auth session missing')) console.error('Auth error in PATCH read-all:', error);
    return c.json({ error }, 401);
  }

  try {
    const { data } = await supabaseAdmin
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false)
      .select('id');

    return c.json({ data: { updated: (data || []).length } });
  } catch (err: any) {
    console.error('Error marking all notifications as read:', err);
    return c.json({ error: 'Failed to update notifications' }, 500);
  }
});

app.patch('/make-server-6d979413/notifications/:id/read', async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) {
    if (!error.includes('Auth session missing')) console.error('Auth error in PATCH notification:', error);
    return c.json({ error }, 401);
  }

  try {
    const notificationId = c.req.param('id');
    const { data: notification } = await supabaseAdmin
      .from('notifications')
      .select('id, user_id')
      .eq('id', notificationId)
      .maybeSingle();

    if (!notification) return c.json({ error: 'Notification not found' }, 404);
    if (notification.user_id !== userId) return c.json({ error: 'Unauthorized' }, 403);

    const { data: updated } = await supabaseAdmin
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId)
      .select()
      .single();

    return c.json({ data: toNotification(updated) });
  } catch (err: any) {
    console.error('Error marking notification as read:', err);
    return c.json({ error: 'Failed to update notification' }, 500);
  }
});

app.delete('/make-server-6d979413/notifications/:id', async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) {
    if (!error.includes('Auth session missing')) console.error('Auth error in DELETE notification:', error);
    return c.json({ error }, 401);
  }

  try {
    const notificationId = c.req.param('id');
    const { data: notification } = await supabaseAdmin
      .from('notifications')
      .select('id, user_id')
      .eq('id', notificationId)
      .maybeSingle();

    if (!notification) return c.json({ error: 'Notification not found' }, 404);
    if (notification.user_id !== userId) return c.json({ error: 'Unauthorized' }, 403);

    await supabaseAdmin.from('notifications').delete().eq('id', notificationId);

    return c.json({ data: { deleted: true } });
  } catch (err: any) {
    console.error('Error deleting notification:', err);
    return c.json({ error: 'Failed to delete notification' }, 500);
  }
});

// ─── CATEGORIES ROUTES ────────────────────────────────────────────────────────

/**
 * Valida que `parentId` sirva como padre. Devuelve el mensaje de error a mostrar,
 * o null si está todo bien.
 *
 * La regla "un solo nivel" vive acá y no en la base: Postgres no permite un CHECK
 * con subconsulta, así que no hay forma de expresarla como constraint. Este es el
 * único punto que la hace cumplir — si se agrega otra ruta que escriba parent_id,
 * tiene que llamar a esta función.
 */
async function validarPadreDeCategoria(
  businessId: string,
  parentId: string | null | undefined,
  categoriaId?: string,
): Promise<string | null> {
  if (!parentId) return null; // sin padre = categoría raíz, siempre válido

  const { data: padre } = await supabaseAdmin
    .from('categories')
    .select('id, business_id, parent_id')
    .eq('id', parentId)
    .maybeSingle();

  if (!padre) return 'La categoría padre no existe';

  // El autopadre se compara con el id que devolvió la consulta (canónico para
  // Postgres), no con el `parentId` crudo del body: `uuid` normaliza mayúsculas
  // y la forma con llaves, así que dos strings distintos en JS ("===" los deja
  // pasar) pueden resolver a la misma fila. Comparar acá, después del lookup,
  // cierra ese hueco.
  if (categoriaId && padre.id === categoriaId) {
    return 'Una categoría no puede ser su propia categoría padre';
  }

  if (padre.business_id !== businessId) return 'La categoría padre no es de este negocio';
  if (padre.parent_id) return 'No se pueden crear subcategorías dentro de una subcategoría';

  // Mover bajo un padre algo que ya tiene hijas dejaría un árbol de tres niveles.
  if (categoriaId) {
    const { count, error: countErr } = await supabaseAdmin
      .from('categories')
      .select('id', { count: 'exact', head: true })
      .eq('parent_id', categoriaId);
    // Este chequeo falla cerrado (a diferencia del resto del archivo): es el
    // único lugar que hace cumplir la regla de un solo nivel, y un error acá
    // que se trate como "no tiene hijas" deja pasar un árbol de tres niveles
    // sin que nada lo vuelva a validar después. El chequeo de productos, en
    // cambio, puede fallar abierto porque la FK RESTRICT lo frena igual.
    if (countErr) return 'No se pudo verificar si la categoría tiene subcategorías';
    if (count && count > 0) {
      return 'Esta categoría tiene subcategorías: no se puede convertir en subcategoría';
    }
  }

  return null;
}

app.get('/make-server-6d979413/categories', async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const profile = await getProfile(userId!);
    if (!profile?.businessId) return c.json({ error: 'Usuario no asociado a ningun negocio' }, 404);

    const { data } = await supabaseAdmin
      .from('categories')
      .select('*')
      .eq('business_id', profile.businessId)
      .order('created_at', { ascending: false });

    return c.json({ data: (data || []).map(toCategory) });
  } catch (err: any) {
    console.error('Error fetching categories:', err);
    return c.json({ error: 'Failed to fetch categories' }, 500);
  }
});

app.post('/make-server-6d979413/categories', async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const profile = await getProfile(userId!);
    if (profile?.role !== 'admin') return c.json({ error: 'Unauthorized: Admin access required' }, 403);
    if (!profile.businessId) return c.json({ error: 'Usuario no asociado a ningun negocio' }, 404);

    const { name, description, color, parentId } = await c.req.json();
    if (!name) return c.json({ error: 'Missing required field: name' }, 400);

    const errorPadre = await validarPadreDeCategoria(profile.businessId, parentId);
    if (errorPadre) return c.json({ error: errorPadre }, 400);

    // `parent_id` solo viaja si de verdad pidieron una subcategoría. Si este
    // Function se despliega antes de aplicar la migración, la columna no existe
    // y PostgREST devuelve PGRST204 por cualquier campo desconocido del insert:
    // mandarlo siempre rompería TODA la creación de categorías, no solo las
    // subcategorías. Condicionándolo, ese orden de despliegue degrada a "las
    // subcategorías todavía no andan" en vez de dejar la pantalla inutilizable.
    const { data: category, error: insertErr } = await supabaseAdmin
      .from('categories')
      .insert({
        business_id: profile.businessId,
        name,
        description: description || '',
        color: color || '#0047BA',
        ...(parentId ? { parent_id: parentId } : {}),
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    return c.json({ data: toCategory(category) }, 201);
  } catch (err: any) {
    console.error('Error creating category:', err);
    return c.json({ error: 'Failed to create category' }, 500);
  }
});

app.put('/make-server-6d979413/categories/:id', async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const profile = await getProfile(userId!);
    if (profile?.role !== 'admin') return c.json({ error: 'Unauthorized: Admin access required' }, 403);

    const categoryId = c.req.param('id');
    const { data: existing } = await supabaseAdmin
      .from('categories')
      .select('id, business_id')
      .eq('id', categoryId)
      .maybeSingle();

    if (!existing) return c.json({ error: 'Category not found' }, 404);
    if (existing.business_id !== profile.businessId) return c.json({ error: 'No tienes permiso' }, 403);

    const body = await c.req.json();
    const updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.color !== undefined) updateData.color = body.color;

    // `null` es un valor válido y significa "convertirla en categoría raíz", así
    // que se distingue de `undefined` (= no se tocó el padre).
    if (body.parentId !== undefined) {
      // Se usa existing.business_id y no profile.businessId: el PUT no valida
      // que el perfil tenga negocio, pero ya comprobó que el de la categoría
      // coincide, así que este es el valor que seguro existe. Por la misma
      // razón se pasa existing.id (canónico, salió de la consulta) y no el
      // categoryId crudo del route param, para que la comparación de autopadre
      // sea consistente con el id que Postgres realmente usa.
      const errorPadre = await validarPadreDeCategoria(existing.business_id, body.parentId, existing.id);
      if (errorPadre) return c.json({ error: errorPadre }, 400);
      updateData.parent_id = body.parentId || null;
    }

    // El error del update se mira: si no, `updated` viene null, toCategory(null)
    // explota al leer r.id y el usuario recibe un 500 genérico que no dice nada.
    // El caso más probable es haber desplegado esto antes de aplicar la
    // migración de parent_id: PostgREST responde PGRST204 y conviene que el
    // mensaje lo delate en vez de esconderlo.
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('categories')
      .update(updateData)
      .eq('id', categoryId)
      .select()
      .single();

    if (updateErr) {
      console.error('Error updating category:', updateErr);
      return c.json({ error: `No se pudo actualizar la categoria: ${updateErr.message}` }, 500);
    }

    return c.json({ data: toCategory(updated) });
  } catch (err: any) {
    console.error('Error updating category:', err);
    return c.json({ error: 'Failed to update category' }, 500);
  }
});

app.delete('/make-server-6d979413/categories/:id', async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const profile = await getProfile(userId!);
    if (profile?.role !== 'admin') return c.json({ error: 'Unauthorized: Admin access required' }, 403);

    const categoryId = c.req.param('id');
    const { data: category } = await supabaseAdmin
      .from('categories')
      .select('id, business_id, name')
      .eq('id', categoryId)
      .maybeSingle();

    if (!category) return c.json({ error: 'Category not found' }, 404);
    if (category.business_id !== profile.businessId) return c.json({ error: 'No tienes permiso' }, 403);

    // Va antes del chequeo de productos: una categoría padre normalmente no
    // tiene productos propios, así que sin esto el borrado pasaría el único
    // chequeo que hay y la FK RESTRICT tiraría un 500 sin explicar nada.
    const { count: hijas } = await supabaseAdmin
      .from('categories')
      .select('id', { count: 'exact', head: true })
      .eq('parent_id', categoryId);

    if (hijas && hijas > 0) {
      return c.json({
        error: `No se puede eliminar la categoria porque tiene ${hijas} subcategoria(s)`
      }, 400);
    }

    // Check if any products use this category
    const { count } = await supabaseAdmin
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', categoryId);

    if (count && count > 0) {
      return c.json({
        error: `No se puede eliminar la categoria porque tiene ${count} producto(s) asociado(s)`
      }, 400);
    }

    await supabaseAdmin.from('categories').delete().eq('id', categoryId);

    return c.json({ data: { deleted: true } });
  } catch (err: any) {
    console.error('Error deleting category:', err);
    return c.json({ error: 'Failed to delete category' }, 500);
  }
});

// ─── PRODUCTION AREAS ROUTES ──────────────────────────────────────────────────

app.get('/make-server-6d979413/production-areas', async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const profile = await getProfile(userId!);
    if (!profile?.businessId) return c.json({ error: 'User has no associated business' }, 400);

    const { data } = await supabaseAdmin
      .from('production_areas')
      .select('*')
      .eq('business_id', profile.businessId)
      .order('created_at', { ascending: false });

    return c.json({ data: (data || []).map(toProductionArea) });
  } catch (err: any) {
    console.error('Error fetching production areas:', err);
    return c.json({ error: 'Failed to fetch production areas' }, 500);
  }
});

app.post('/make-server-6d979413/production-areas', async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const profile = await getProfile(userId!);
    if (profile?.role !== 'admin') return c.json({ error: 'Unauthorized: Admin access required' }, 403);
    if (!profile.businessId) return c.json({ error: 'User has no associated business' }, 400);

    const { name, description, color, icon } = await c.req.json();
    if (!name || !name.trim()) return c.json({ error: 'Name is required' }, 400);

    // Check for duplicate name in business
    const { count: dupCount } = await supabaseAdmin
      .from('production_areas')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', profile.businessId)
      .ilike('name', name.trim());

    if (dupCount && dupCount > 0) {
      return c.json({ error: `Production area "${name}" already exists in your business` }, 400);
    }

    const { data: area, error: insertErr } = await supabaseAdmin
      .from('production_areas')
      .insert({
        business_id: profile.businessId,
        name: name.trim(),
        description: description?.trim() || '',
        color: color || '#0059FF',
        icon: icon || 'Briefcase',
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    return c.json({ data: toProductionArea(area) }, 201);
  } catch (err: any) {
    console.error('Error creating production area:', err);
    return c.json({ error: 'Failed to create production area' }, 500);
  }
});

app.put('/make-server-6d979413/production-areas/:id', async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const profile = await getProfile(userId!);
    if (profile?.role !== 'admin') return c.json({ error: 'Unauthorized: Admin access required' }, 403);

    const areaId = c.req.param('id');
    const { data: existing } = await supabaseAdmin
      .from('production_areas')
      .select('id, business_id, name')
      .eq('id', areaId)
      .maybeSingle();

    if (!existing) return c.json({ error: 'Production area not found' }, 404);
    if (existing.business_id !== profile.businessId) return c.json({ error: 'Unauthorized' }, 403);

    const { name, description, color, icon } = await c.req.json();

    if (name && name.trim() !== existing.name) {
      const { count: dupCount } = await supabaseAdmin
        .from('production_areas')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', profile.businessId)
        .ilike('name', name.trim())
        .neq('id', areaId);

      if (dupCount && dupCount > 0) {
        return c.json({ error: `Production area "${name}" already exists in your business` }, 400);
      }
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (color !== undefined) updateData.color = color;
    if (icon !== undefined) updateData.icon = icon;

    const { data: updated } = await supabaseAdmin
      .from('production_areas')
      .update(updateData)
      .eq('id', areaId)
      .select()
      .single();

    return c.json({ data: toProductionArea(updated) });
  } catch (err: any) {
    console.error('Error updating production area:', err);
    return c.json({ error: 'Failed to update production area' }, 500);
  }
});

app.delete('/make-server-6d979413/production-areas/:id', async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const profile = await getProfile(userId!);
    if (profile?.role !== 'admin') return c.json({ error: 'Unauthorized: Admin access required' }, 403);

    const areaId = c.req.param('id');
    const { data: area } = await supabaseAdmin
      .from('production_areas')
      .select('id, business_id, name')
      .eq('id', areaId)
      .maybeSingle();

    if (!area) return c.json({ error: 'Production area not found' }, 404);
    if (area.business_id !== profile.businessId) return c.json({ error: 'Unauthorized' }, 403);

    const { count } = await supabaseAdmin
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('production_area_id', areaId);

    if (count && count > 0) {
      return c.json({
        error: `Cannot delete production area because it has ${count} product(s) assigned to it.`
      }, 400);
    }

    await supabaseAdmin.from('production_areas').delete().eq('id', areaId);

    return c.json({ data: { deleted: true } });
  } catch (err: any) {
    console.error('Error deleting production area:', err);
    return c.json({ error: 'Failed to delete production area' }, 500);
  }
});

// ─── INGREDIENTS ROUTES ───────────────────────────────────────────────────────

app.get('/make-server-6d979413/ingredients', async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const profile = await getProfile(userId!);
    if (!profile?.businessId) return c.json({ error: 'Usuario no asociado a ningun negocio' }, 404);

    const { data } = await supabaseAdmin
      .from('ingredients')
      .select('*')
      .eq('business_id', profile.businessId)
      .order('name', { ascending: true });

    return c.json({ data: (data || []).map(toIngredient) });
  } catch (err: any) {
    console.error('Error retrieving ingredients:', err);
    return c.json({ error: 'Failed to retrieve ingredients' }, 500);
  }
});

app.post('/make-server-6d979413/ingredients', async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const profile = await getProfile(userId!);
    if (!profile?.businessId) return c.json({ error: 'Usuario no asociado a ningun negocio' }, 404);
    if (!puedeGestionarMateriasPrimas(profile)) {
      return c.json({ error: 'No tenes permiso para gestionar materias primas' }, 403);
    }

    const { name, unit, currentStock, minStock, maxStock, costPerUnit, supplier } = await c.req.json();

    if (!name || !unit || currentStock === undefined || minStock === undefined) {
      return c.json({ error: 'Name, unit, currentStock, and minStock are required' }, 400);
    }

    // Check for duplicate name in business
    const { count: dupCount } = await supabaseAdmin
      .from('ingredients')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', profile.businessId)
      .ilike('name', name.trim());

    if (dupCount && dupCount > 0) {
      return c.json({ error: `La materia prima "${name}" ya existe en este negocio` }, 400);
    }

    const { data: ingredient, error: insertErr } = await supabaseAdmin
      .from('ingredients')
      .insert({
        business_id: profile.businessId,
        name: name.trim(),
        unit: unit.trim(),
        current_stock: Number(currentStock),
        min_stock: Number(minStock),
        max_stock: maxStock !== undefined ? Number(maxStock) : null,
        cost_per_unit: costPerUnit !== undefined ? Number(costPerUnit) : null,
        supplier: supplier?.trim() || null,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    return c.json({ data: toIngredient(ingredient) }, 201);
  } catch (err: any) {
    console.error('Error creating ingredient:', err);
    return c.json({ error: 'Failed to create ingredient' }, 500);
  }
});

app.put('/make-server-6d979413/ingredients/:id', async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const ingredientId = c.req.param('id');
    const profile = await getProfile(userId!);
    if (!profile?.businessId) return c.json({ error: 'Usuario no asociado a ningun negocio' }, 404);
    if (!puedeGestionarMateriasPrimas(profile)) {
      return c.json({ error: 'No tenes permiso para gestionar materias primas' }, 403);
    }

    const { data: existing } = await supabaseAdmin
      .from('ingredients')
      .select('*')
      .eq('id', ingredientId)
      .maybeSingle();

    if (!existing) return c.json({ error: 'Ingredient not found' }, 404);
    if (existing.business_id !== profile.businessId) return c.json({ error: 'Unauthorized' }, 403);

    const updates = await c.req.json();
    const updateData: any = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.unit !== undefined) updateData.unit = updates.unit;
    if (updates.currentStock !== undefined) updateData.current_stock = Number(updates.currentStock);
    if (updates.minStock !== undefined) updateData.min_stock = Number(updates.minStock);
    if (updates.maxStock !== undefined) updateData.max_stock = Number(updates.maxStock);
    if (updates.costPerUnit !== undefined) updateData.cost_per_unit = Number(updates.costPerUnit);
    if (updates.supplier !== undefined) updateData.supplier = updates.supplier;

    const { data: updated } = await supabaseAdmin
      .from('ingredients')
      .update(updateData)
      .eq('id', ingredientId)
      .select()
      .single();

    // Check if stock crossed below minimum threshold
    const prevStock = Number(existing.current_stock);
    const newStock = Number(updated.current_stock);
    const minStock = Number(updated.min_stock);

    if (newStock <= minStock && prevStock > minStock) {
      console.log(`Low stock alert for ${updated.name}: ${newStock} (min: ${minStock})`);

      // Notify admin and production users of the same business
      const { data: notifyUsers } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('business_id', profile.businessId)
        .in('role', ['admin', 'production', 'pastry']);

      const title = newStock === 0 ? 'Stock Agotado de Materia Prima' : 'Stock Bajo de Materia Prima';
      const message = newStock === 0
        ? `El ingrediente "${updated.name}" se ha agotado. Stock actual: 0 ${updated.unit}.`
        : `El ingrediente "${updated.name}" esta por debajo del minimo. Stock: ${newStock} ${updated.unit} (min: ${minStock}).`;
      const notifType = newStock === 0 ? 'error' : 'warning';

      const notifRows = (notifyUsers || []).map((u: any) => ({
        user_id: u.id,
        business_id: profile.businessId,
        title,
        message,
        type: notifType,
        read: false,
      }));

      if (notifRows.length > 0) {
        await supabaseAdmin.from('notifications').insert(notifRows);
      }
    }

    return c.json({ data: toIngredient(updated) });
  } catch (err: any) {
    console.error('Error updating ingredient:', err);
    return c.json({ error: 'Failed to update ingredient' }, 500);
  }
});

app.delete('/make-server-6d979413/ingredients/:id', async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const ingredientId = c.req.param('id');
    const profile = await getProfile(userId!);
    if (!profile?.businessId) return c.json({ error: 'Usuario no asociado a ningun negocio' }, 404);
    if (!puedeGestionarMateriasPrimas(profile)) {
      return c.json({ error: 'No tenes permiso para gestionar materias primas' }, 403);
    }

    const { data: ingredient } = await supabaseAdmin
      .from('ingredients')
      .select('id, business_id, name')
      .eq('id', ingredientId)
      .maybeSingle();

    if (!ingredient) return c.json({ error: 'Ingredient not found' }, 404);
    if (ingredient.business_id !== profile.businessId) return c.json({ error: 'Unauthorized' }, 403);

    // Check if used in any product recipes
    const { count } = await supabaseAdmin
      .from('product_ingredients')
      .select('id', { count: 'exact', head: true })
      .eq('ingredient_id', ingredientId);

    if (count && count > 0) {
      return c.json({
        error: `No se puede eliminar esta materia prima porque esta siendo usada en ${count} receta(s).`
      }, 400);
    }

    await supabaseAdmin.from('ingredients').delete().eq('id', ingredientId);

    return c.json({ data: { deleted: true } });
  } catch (err: any) {
    console.error('Error deleting ingredient:', err);
    return c.json({ error: 'Failed to delete ingredient' }, 500);
  }
});

// ─── ATTENDANCE ROUTES ────────────────────────────────────────────────────────

app.get('/make-server-6d979413/attendance/locals', async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const profile = await getProfile(userId!);
    if (!profile?.businessId) return c.json({ error: 'Usuario no asociado a ningun negocio' }, 404);

    const { data: locals } = await supabaseAdmin
      .from('profiles')
      .select('id, name, email, role')
      .eq('business_id', profile.businessId)
      .eq('role', 'local')
      .not('email', 'like', '%@demo.com');

    return c.json({ data: locals || [] });
  } catch (err: any) {
    console.error('Error getting locals:', err);
    return c.json({ error: 'Failed to get locals' }, 500);
  }
});

app.post('/make-server-6d979413/attendance/check-in', async (c) => {
  const { error, userId, user } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const body = await c.req.json().catch(() => ({}));
    const { localId } = body;
    if (!localId) return c.json({ error: 'Debes seleccionar un local' }, 400);

    const profile = await getProfile(userId!);
    if (!profile?.businessId) return c.json({ error: 'Usuario no asociado a ningun negocio' }, 404);

    const userName = profile.name || user?.email || 'Usuario';

    const { data: local } = await supabaseAdmin
      .from('profiles')
      .select('id, name, role, business_id')
      .eq('id', localId)
      .maybeSingle();

    if (!local || local.role !== 'local') return c.json({ error: 'Local no valido' }, 400);
    if (local.business_id !== profile.businessId) return c.json({ error: 'El local no pertenece a tu negocio' }, 403);

    // Check for active check-in
    const { data: activeRecord } = await supabaseAdmin
      .from('attendance_records')
      .select('id, local_name')
      .eq('user_id', userId)
      .eq('business_id', profile.businessId)
      .eq('status', 'active')
      .is('check_out', null)
      .maybeSingle();

    if (activeRecord) {
      return c.json({
        error: `Ya tienes una asistencia activa en ${activeRecord.local_name}. Debes marcar salida primero.`
      }, 400);
    }

    const now = new Date();
    const today = now.toISOString().split('T')[0];

    const { data: record, error: insertErr } = await supabaseAdmin
      .from('attendance_records')
      .insert({
        user_id: userId,
        user_name: userName,
        business_id: profile.businessId,
        local_id: localId,
        local_name: local.name,
        check_in: now.toISOString(),
        check_out: null,
        date: today,
        status: 'active',
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    // Create check-in notification
    const checkInTime = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    await supabaseAdmin.from('notifications').insert({
      user_id: userId,
      business_id: profile.businessId,
      title: 'Entrada registrada',
      message: `Has marcado entrada en ${local.name} a las ${checkInTime}`,
      type: 'attendance_check_in',
      read: false,
    });

    console.log(`Check-in: ${userName} at ${local.name}`);
    return c.json({ data: toAttendance(record) });
  } catch (err: any) {
    console.error('Error in check-in:', err);
    return c.json({ error: 'Failed to check in' }, 500);
  }
});

app.put('/make-server-6d979413/attendance/check-out/:recordId', async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const recordId = c.req.param('recordId');
    const { data: record } = await supabaseAdmin
      .from('attendance_records')
      .select('*')
      .eq('id', recordId)
      .maybeSingle();

    if (!record) return c.json({ error: 'Registro no encontrado' }, 404);
    if (record.user_id !== userId) return c.json({ error: 'No autorizado' }, 403);
    if (record.check_out) return c.json({ error: 'Ya has marcado salida para este registro' }, 400);

    const now = new Date();
    const { data: updated } = await supabaseAdmin
      .from('attendance_records')
      .update({ check_out: now.toISOString(), status: 'completed' })
      .eq('id', recordId)
      .select()
      .single();

    // Calculate time worked
    const diffMs = now.getTime() - new Date(record.check_in).getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const timeWorked = diffHours > 0 ? `${diffHours}h ${diffMinutes}min` : `${diffMinutes} minutos`;

    const checkOutTime = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    await supabaseAdmin.from('notifications').insert({
      user_id: userId,
      business_id: record.business_id,
      title: 'Salida registrada',
      message: `Has marcado salida de ${record.local_name} a las ${checkOutTime}. Tiempo trabajado: ${timeWorked}`,
      type: 'attendance_check_out',
      read: false,
    });

    console.log(`Check-out: ${record.user_name}`);
    return c.json({ data: toAttendance(updated) });
  } catch (err: any) {
    console.error('Error in check-out:', err);
    return c.json({ error: 'Failed to check out' }, 500);
  }
});

app.get('/make-server-6d979413/attendance/my-records', async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const { data: records } = await supabaseAdmin
      .from('attendance_records')
      .select('*')
      .eq('user_id', userId)
      .order('check_in', { ascending: false });

    return c.json({ data: (records || []).map(toAttendance) });
  } catch (err: any) {
    console.error('Error getting attendance records:', err);
    return c.json({ error: 'Failed to get attendance records' }, 500);
  }
});

app.get('/make-server-6d979413/attendance/all-records', async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const profile = await getProfile(userId!);
    if (!['admin', 'production'].includes(profile?.role || '')) {
      return c.json({ error: 'Unauthorized: Admin or production access required' }, 403);
    }
    if (!profile?.businessId) return c.json({ error: 'Usuario no asociado a ningun negocio' }, 404);

    const { data: records } = await supabaseAdmin
      .from('attendance_records')
      .select('*')
      .eq('business_id', profile.businessId)
      .order('check_in', { ascending: false });

    return c.json({ data: (records || []).map(toAttendance) });
  } catch (err: any) {
    console.error('Error getting all attendance records:', err);
    return c.json({ error: 'Failed to get attendance records' }, 500);
  }
});

app.get('/make-server-6d979413/attendance/records/:date', async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const date = c.req.param('date');
    const profile = await getProfile(userId!);
    if (!profile?.businessId) return c.json({ error: 'Usuario no asociado a ningun negocio' }, 404);

    const isAdmin = ['admin', 'production'].includes(profile.role);

    let query = supabaseAdmin
      .from('attendance_records')
      .select('*')
      .eq('business_id', profile.businessId)
      .eq('date', date)
      .order('check_in', { ascending: false });

    if (!isAdmin) {
      query = query.eq('user_id', userId);
    }

    const { data: records } = await query;

    return c.json({ data: (records || []).map(toAttendance) });
  } catch (err: any) {
    console.error('Error getting attendance by date:', err);
    return c.json({ error: 'Failed to get attendance records' }, 500);
  }
});

app.put('/make-server-6d979413/attendance/records/:recordId', async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const profile = await getProfile(userId!);
    if (profile?.role !== 'admin') return c.json({ error: 'Unauthorized: Admin access required' }, 403);

    const recordId = c.req.param('recordId');
    const { data: record } = await supabaseAdmin
      .from('attendance_records')
      .select('id, business_id')
      .eq('id', recordId)
      .maybeSingle();

    if (!record) return c.json({ error: 'Record not found' }, 404);
    if (record.business_id !== profile.businessId) return c.json({ error: 'Unauthorized' }, 403);

    const body = await c.req.json();
    const updateData: any = {};
    if (body.checkIn !== undefined) updateData.check_in = body.checkIn;
    if (body.checkOut !== undefined) updateData.check_out = body.checkOut;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.userName !== undefined) updateData.user_name = body.userName;
    if (body.localName !== undefined) updateData.local_name = body.localName;

    const { data: updated } = await supabaseAdmin
      .from('attendance_records')
      .update(updateData)
      .eq('id', recordId)
      .select()
      .single();

    return c.json({ data: toAttendance(updated) });
  } catch (err: any) {
    console.error('Error updating attendance record:', err);
    return c.json({ error: 'Failed to update attendance record' }, 500);
  }
});

app.delete('/make-server-6d979413/attendance/records/:recordId', async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const profile = await getProfile(userId!);
    if (profile?.role !== 'admin') return c.json({ error: 'Unauthorized: Admin access required' }, 403);

    const recordId = c.req.param('recordId');
    const { data: record } = await supabaseAdmin
      .from('attendance_records')
      .select('id, business_id')
      .eq('id', recordId)
      .maybeSingle();

    if (!record) return c.json({ error: 'Record not found' }, 404);
    if (record.business_id !== profile.businessId) return c.json({ error: 'Unauthorized' }, 403);

    await supabaseAdmin.from('attendance_records').delete().eq('id', recordId);

    return c.json({ data: { deleted: true } });
  } catch (err: any) {
    console.error('Error deleting attendance record:', err);
    return c.json({ error: 'Failed to delete attendance record' }, 500);
  }
});

// ─── PRODUCTION ORDERS ROUTES ─────────────────────────────────────────────────

app.get('/make-server-6d979413/production-orders', async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const profile = await getProfile(userId!);
    if (!profile?.businessId) return c.json({ error: 'User or business not found' }, 404);

    const { data: orders } = await supabaseAdmin
      .from('production_orders')
      .select('*')
      .eq('business_id', profile.businessId)
      .order('created_at', { ascending: false });

    const mapped = (orders || []).map((o: any) => ({
      id: o.id,
      productName: o.product_name,
      quantity: o.quantity,
      status: o.status,
      createdBy: o.created_by,
      createdAt: o.created_at,
      updatedAt: o.updated_at,
      products: o.products || [],
      notes: o.notes,
      businessId: o.business_id,
      completedAt: o.completed_at,
    }));

    return c.json({ orders: mapped });
  } catch (err: any) {
    console.error('Error getting production orders:', err);
    return c.json({ error: 'Failed to get production orders' }, 500);
  }
});

app.post('/make-server-6d979413/production-orders', async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const profile = await getProfile(userId!);
    if (!profile?.businessId) return c.json({ error: 'User or business not found' }, 404);
    if (!['production', 'admin'].includes(profile.role)) {
      return c.json({ error: 'Unauthorized: Production or Admin role required' }, 403);
    }

    const { products, notes } = await c.req.json();
    if (!products || !Array.isArray(products) || products.length === 0) {
      return c.json({ error: 'Products array is required' }, 400);
    }

    const validatedProducts = [];
    for (const item of products) {
      if (!item.productId || !item.quantity || item.quantity <= 0) {
        return c.json({ error: 'Each product must have productId and quantity > 0' }, 400);
      }
      const { data: product } = await supabaseAdmin
        .from('products')
        .select('id, name, stock')
        .eq('id', item.productId)
        .maybeSingle();

      if (!product) return c.json({ error: `Product ${item.productId} not found` }, 404);

      validatedProducts.push({
        productId: item.productId,
        name: product.name,
        quantity: item.quantity,
        currentStock: product.stock || 0,
      });
    }

    const productName = validatedProducts.length === 1
      ? validatedProducts[0].name
      : `${validatedProducts.length} productos`;

    const totalQty = validatedProducts.reduce((sum, p) => sum + p.quantity, 0);

    const { data: newOrder, error: insertErr } = await supabaseAdmin
      .from('production_orders')
      .insert({
        business_id: profile.businessId,
        created_by: userId,
        status: 'BORRADOR',
        product_name: productName,
        quantity: totalQty,
        notes: notes || null,
        products: validatedProducts,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    const order = {
      id: newOrder.id,
      productName: newOrder.product_name,
      quantity: newOrder.quantity,
      status: newOrder.status,
      createdBy: newOrder.created_by,
      createdAt: newOrder.created_at,
      updatedAt: newOrder.updated_at,
      products: newOrder.products,
      notes: newOrder.notes,
      businessId: newOrder.business_id,
    };

    return c.json({ order }, 201);
  } catch (err: any) {
    console.error('Error creating production order:', err);
    return c.json({ error: 'Failed to create production order' }, 500);
  }
});

app.patch('/make-server-6d979413/production-orders/:orderId/status', async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const profile = await getProfile(userId!);
    if (!profile) return c.json({ error: 'User not found' }, 404);
    if (!['production', 'admin'].includes(profile.role)) {
      return c.json({ error: 'Unauthorized: Production or Admin role required' }, 403);
    }

    const orderId = c.req.param('orderId');
    const { data: productionOrder } = await supabaseAdmin
      .from('production_orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (!productionOrder) return c.json({ error: 'Production order not found' }, 404);
    if (productionOrder.business_id !== profile.businessId) return c.json({ error: 'Unauthorized' }, 403);

    const { status, products: productsUpdate } = await c.req.json();
    const validStatuses = ['BORRADOR', 'EN_PROCESO', 'TERMINADA'];
    if (!status || !validStatuses.includes(status)) {
      return c.json({ error: 'Invalid status. Must be: BORRADOR, EN_PROCESO, or TERMINADA' }, 400);
    }

    const now = new Date().toISOString();
    let updatedProducts = productionOrder.products;

    // If completing, update produced/waste quantities
    if (status === 'TERMINADA' && productsUpdate && Array.isArray(productsUpdate)) {
      updatedProducts = productionOrder.products.map((p: any) => {
        const upd = productsUpdate.find((u: any) => u.productId === p.productId);
        if (upd) {
          return {
            ...p,
            producedQuantity: upd.producedQuantity !== undefined ? Number(upd.producedQuantity) : p.quantity,
            wasteQuantity: upd.wasteQuantity !== undefined ? Number(upd.wasteQuantity) : 0,
          };
        }
        return p;
      });
    }

    // If starting production: deduct ingredients from stock
    if (status === 'EN_PROCESO' && productionOrder.status === 'BORRADOR') {
      const insufficientErrors: string[] = [];
      const deductions: Array<{ ingredientId: string; newStock: number; ingredient: any; totalNeeded: number }> = [];

      for (const item of productionOrder.products) {
        const { data: piRelations } = await supabaseAdmin
          .from('product_ingredients')
          .select('ingredient_id, quantity')
          .eq('product_id', item.productId);

        for (const rel of (piRelations || [])) {
          const { data: ingredient } = await supabaseAdmin
            .from('ingredients')
            .select('*')
            .eq('id', rel.ingredient_id)
            .maybeSingle();

          if (!ingredient) continue;

          const totalNeeded = rel.quantity * item.quantity;
          const newStock = Number(ingredient.current_stock) - totalNeeded;

          if (newStock < 0) {
            insufficientErrors.push(
              `${ingredient.name}: necesita ${totalNeeded} ${ingredient.unit}, solo hay ${ingredient.current_stock} ${ingredient.unit}`
            );
          } else {
            deductions.push({ ingredientId: rel.ingredient_id, newStock, ingredient, totalNeeded });
          }
        }
      }

      if (insufficientErrors.length > 0) {
        return c.json({ error: 'Stock insuficiente de materias primas', details: insufficientErrors }, 400);
      }

      // Apply all stock deductions
      const lowStockIngredients = [];
      for (const item of deductions) {
        await supabaseAdmin
          .from('ingredients')
          .update({ current_stock: item.newStock })
          .eq('id', item.ingredientId);

        if (item.newStock <= Number(item.ingredient.min_stock)) {
          lowStockIngredients.push({
            name: item.ingredient.name,
            currentStock: item.newStock,
            minStock: Number(item.ingredient.min_stock),
            unit: item.ingredient.unit,
          });
        }
      }

      // Notify on low stock
      if (lowStockIngredients.length > 0) {
        const { data: notifyUsers } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('business_id', profile.businessId)
          .in('role', ['admin', 'production', 'pastry']);

        const notifRows = [];
        for (const ing of lowStockIngredients) {
          const title = ing.currentStock === 0 ? 'Stock Agotado de Materia Prima' : 'Stock Bajo de Materia Prima';
          const message = ing.currentStock === 0
            ? `El ingrediente "${ing.name}" se ha agotado. Stock actual: 0 ${ing.unit}.`
            : `El ingrediente "${ing.name}" esta bajo el minimo. Stock: ${ing.currentStock} ${ing.unit} (min: ${ing.minStock}).`;
          const notifType = ing.currentStock === 0 ? 'error' : 'warning';

          for (const u of (notifyUsers || [])) {
            notifRows.push({
              user_id: (u as any).id,
              business_id: profile.businessId,
              title,
              message,
              type: notifType,
              read: false,
            });
          }
        }
        if (notifRows.length > 0) {
          await supabaseAdmin.from('notifications').insert(notifRows);
        }
      }
    }

    // If completing: add produced quantities to product stock
    if (status === 'TERMINADA' && productionOrder.status !== 'TERMINADA') {
      for (const item of updatedProducts) {
        // name y business_id se traen para poder registrar el evento del kardex.
        const { data: product } = await supabaseAdmin
          .from('products')
          .select('id, name, business_id, stock')
          .eq('id', item.productId)
          .maybeSingle();

        if (product) {
          const qtyToAdd = item.producedQuantity !== undefined ? item.producedQuantity : item.quantity;
          const stockNuevo = (product.stock || 0) + qtyToAdd;
          await supabaseAdmin
            .from('products')
            .update({ stock: stockNuevo })
            .eq('id', item.productId);

          // Se registra como 'reposicion' y no como un tipo nuevo: es stock que
          // entra, igual que la mercadería que llega de un proveedor. La
          // Distribuidora no usa órdenes de producción (solo compra), así que
          // este camino no afecta sus productos; se tapa igual para que el
          // kardex no mienta sobre los productos de panadería/pastelería.
          await registrarStockEvent({
            businessId: product.business_id,
            productId: product.id,
            productName: product.name,
            type: 'reposicion',
            quantity: qtyToAdd,
            stockAfter: stockNuevo,
            createdBy: userId,
          });
        }
      }
    }

    const { data: updatedOrder } = await supabaseAdmin
      .from('production_orders')
      .update({
        status,
        products: updatedProducts,
        completed_at: status === 'TERMINADA' ? now : productionOrder.completed_at,
      })
      .eq('id', orderId)
      .select()
      .single();

    const order = {
      id: updatedOrder.id,
      productName: updatedOrder.product_name,
      quantity: updatedOrder.quantity,
      status: updatedOrder.status,
      createdBy: updatedOrder.created_by,
      createdAt: updatedOrder.created_at,
      updatedAt: updatedOrder.updated_at,
      products: updatedOrder.products,
      notes: updatedOrder.notes,
      businessId: updatedOrder.business_id,
      completedAt: updatedOrder.completed_at,
    };

    return c.json({ order });
  } catch (err: any) {
    console.error('Error updating production order status:', err);
    return c.json({ error: 'Failed to update production order status' }, 500);
  }
});

app.delete('/make-server-6d979413/production-orders/:orderId', async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const profile = await getProfile(userId!);
    if (!profile) return c.json({ error: 'User not found' }, 404);
    if (!['production', 'admin'].includes(profile.role)) {
      return c.json({ error: 'Unauthorized: Production or Admin role required' }, 403);
    }

    const orderId = c.req.param('orderId');
    const { data: productionOrder } = await supabaseAdmin
      .from('production_orders')
      .select('id, business_id, status')
      .eq('id', orderId)
      .maybeSingle();

    if (!productionOrder) return c.json({ error: 'Production order not found' }, 404);
    if (productionOrder.business_id !== profile.businessId) return c.json({ error: 'Unauthorized' }, 403);
    if (productionOrder.status !== 'BORRADOR') return c.json({ error: 'Only BORRADOR orders can be deleted' }, 400);

    await supabaseAdmin.from('production_orders').delete().eq('id', orderId);

    return c.json({ data: { deleted: true } });
  } catch (err: any) {
    console.error('Error deleting production order:', err);
    return c.json({ error: 'Failed to delete production order' }, 500);
  }
});

console.log('Server initialized - Ready to handle requests');
console.log('Base path: /make-server-6d979413');

Deno.serve(app.fetch);
