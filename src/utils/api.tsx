import { projectId, publicAnonKey } from './supabase/info';
import { createClient } from '@supabase/supabase-js';
import { createClient as getSharedClient } from './supabase/client';
import type { FichaNutricional } from './nutricion/tipos';

export const API_BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-6d979413`;

// Refresca el access token usando el refresh token (que sigue siendo válido aunque
// el access token haya expirado). Deduplica llamadas concurrentes: si el polling
// dispara varios 401 a la vez, todos esperan el mismo refresh en lugar de pelearse.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const supabase = getSharedClient();
        const { data, error } = await supabase.auth.refreshSession();
        if (error || !data.session) return null;
        return data.session.access_token;
      } catch {
        return null;
      } finally {
        // Liberar para permitir un futuro refresh; se limpia tras resolver.
        setTimeout(() => { refreshPromise = null; }, 0);
      }
    })();
  }
  return refreshPromise;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  color?: string;
  parentId?: string | null; // null o ausente = categoría raíz. Un solo nivel de anidamiento.
  createdAt: string;
  updatedAt?: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image?: string;
  imageUrl?: string;
  stock: number;
  minStock?: number; // Umbral de "stock bajo" por SKU. undefined = usar el default del panel.
  unlimitedStock?: boolean; // New: If true, stock is not controlled
  trackStock?: boolean; // Legacy: If false, stock is not controlled
  category?: string;
  categoryId?: string;
  sku?: string; // SKU / código de barras (EAN-13, UPC, Code128...). Opcional, único por negocio.
  productionAreaId?: string; // New: ID of production area assigned to this product
  ingredients?: ProductIngredient[]; // New: Recipe ingredients for this product
  laborCost?: number; // Costo de mano de obra (opcional), separado de los ingredientes
  // Suma de cantidad_restante × costo_unitario de los lotes vivos de este
  // producto. Solo viene poblado en GET /products (lista); undefined si el
  // producto no tiene lotes (fuera de alcance, o en alcance sin stock).
  lotsValue?: number;
  createdAt?: string;
  updatedAt?: string;
}

// New: Production Area interface
export interface ProductionArea {
  id: string;
  name: string;
  description?: string;
  color?: string; // Color for visual identification
  icon?: string; // Icon name from lucide-react
  businessId: string;
  createdAt: string;
  updatedAt?: string;
}

// New: Order item with area tracking
export interface OrderItemWithArea {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  productionAreaId?: string; // Which area this item belongs to
  areaStatus?: 'pending' | 'in_progress' | 'completed'; // Status for this specific area
}

export interface Order {
  id: string;
  userId: string;
  businessId?: string; // Added businessId
  products: Array<OrderItemWithArea>; // Updated to use new type
  total: number;
  deadline: string;
  status: 'pending' | 'in_progress' | 'completed' | 'dispatched' | 'delivered' | 'cancelled';
  progress: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  deliveryAddress?: string;
  customerName?: string;
  areaStatuses?: Record<string, 'pending' | 'in_progress' | 'completed'>; // Status by area ID
  itemStatuses?: Record<string, 'pending' | 'in_progress' | 'completed'>; // Status by item (product) ID
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'local' | 'admin' | 'production' | 'dispatch' | 'worker' | 'pastry' | 'user';
  businessId?: string;
  address?: string;
  notificationPrefs: {
    orderStatus: boolean;
    production: boolean;
  };
  createdAt: string;
}

export interface Business {
  id: string;
  name: string;
  inviteCode?: string;
  isOwner?: boolean;
  createdAt: string;
}

export interface BusinessMember {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationInfo;
}

async function fetchAPI(
  endpoint: string,
  options: RequestInit = {},
  token?: string
) {
  // Ejecuta el request con el token dado. Devuelve la respuesta cruda para que el
  // caller decida si reintentar (401) o procesar el cuerpo.
  const doFetch = (authToken: string) =>
    fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
        Authorization: `Bearer ${authToken}`,
      },
    });

  try {
    let response = await doFetch(token || publicAnonKey);

    // Si el request iba autenticado y devolvió 401, lo más probable es que el
    // access token haya expirado (típico al volver de segundo plano). El refresh
    // token sigue válido: refrescamos una vez y reintentamos antes de rendirnos.
    if (response.status === 401 && token) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        response = await doFetch(newToken);
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Error desconocido' }));
      const errorMessage = error.error || error.message || `HTTP error! status: ${response.status}`;

      // For 401 errors, always throw to trigger logout in App.tsx
      // This is important to handle expired sessions properly
      if (response.status === 401) {
        throw new Error(errorMessage);
      }

      // Only log detailed errors for non-expected cases
      // Don't spam console with "already registered" errors (these are expected)
      if (!errorMessage.includes('ya está registrado') &&
        !errorMessage.includes('already registered')) {
        console.error(`API Error [${endpoint}]:`, {
          status: response.status,
          statusText: response.statusText,
          error: errorMessage,
          token: token ? 'present' : 'missing'
        });
      }

      throw new Error(errorMessage);
    }

    return response.json();
  } catch (err: any) {
    // If it's a network error or other exception
    // Don't spam console with "already registered" errors (these are expected)
    const errMessage = err?.message || '';
    if (!errMessage.includes('ya está registrado') &&
      !errMessage.includes('already registered')) {
      console.error(`Fetch error [${endpoint}]:`, err.message || err);
    }
    throw err;
  }
}

// Auth API
export const authAPI = {
  signup: async (
    email: string,
    password: string,
    name: string,
    role: 'local' | 'admin' | 'production' | 'dispatch' | 'worker' | 'user',
    businessAction: 'create' | 'join',
    businessName?: string,
    businessCode?: string
  ) => {
    return fetchAPI('/signup', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        name,
        role: role || 'user',
        businessAction,
        businessName,
        businessCode
      }),
    });
  },

  resetPassword: async (email: string): Promise<{ success: boolean; message: string }> => {
    return fetchAPI('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },
};

// Profile API
export const profileAPI = {
  get: async (token: string): Promise<UserProfile> => {
    return fetchAPI('/profile', {}, token);
  },

  update: async (token: string, updates: Partial<UserProfile>): Promise<UserProfile> => {
    return fetchAPI('/profile', {
      method: 'PUT',
      body: JSON.stringify(updates),
    }, token);
  },
};

// Orders API
export const ordersAPI = {
  getAll: async (token: string, page: number = 1, limit: number = 50): Promise<PaginatedResponse<Order>> => {
    const response = await fetchAPI(
      `/orders?page=${page}&limit=${limit}`,
      {},
      token
    );
    return response;
  },

  create: async (
    token: string,
    orderData: {
      products: Array<{
        productId: string;
        name: string;
        quantity: number;
        price: number;
      }>;
      deadline: string;
      total: number;
      notes?: string;
      deliveryAddress?: string;
      customerName?: string;
    }
  ): Promise<Order> => {
    // Creación de pedido vía RPC create_order_with_stock: descuenta stock de forma
    // atómica en el servidor (FOR UPDATE) y crea el pedido en la misma transacción.

    // Initialize Supabase Client
    const supabase = createClient(
      `https://${projectId}.supabase.co`,
      publicAnonKey,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      }
    );

    // Traer productos frescos solo para enriquecer cada item con su productionAreaId.
    // El descuento de stock NO se hace en el cliente: lo hace atómicamente la
    // función create_order_with_stock en el servidor.
    const productsResponse = await productsAPI.getAll(token);
    const freshProducts = Array.isArray(productsResponse) ? productsResponse : (productsResponse as any).data || [];

    // 4. Construct Order Object
    const newOrderId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Enrich products with productionAreaId from definition
    const enrichedProducts = orderData.products.map(item => {
      const productDef = freshProducts.find((p: any) => p.id === item.productId);
      return {
        ...item,
        productionAreaId: productDef?.productionAreaId || null,
        areaStatus: 'pending' as const
      };
    });

    // Get User and Business ID from Supabase Auth
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id || 'unknown';
    // Get businessId from user metadata or profile
    const businessId = user?.user_metadata?.businessId || '';

    if (!businessId) {
      console.warn('⚠️ Creating order without businessId. It might not be visible.');
    }

    const newOrder: Order = {
      id: newOrderId,
      userId: userId,
      businessId: businessId, // CRITICAL: Assign order to business
      products: enrichedProducts,
      total: orderData.total,
      deadline: orderData.deadline,
      status: 'pending',
      progress: 0,
      notes: orderData.notes,
      createdAt: now,
      updatedAt: now,
      deliveryAddress: orderData.deliveryAddress,
      customerName: orderData.customerName,
      areaStatuses: {}
    };

    // 5. Crear pedido + descontar stock atómicamente vía RPC
    const { error } = await supabase.rpc('create_order_with_stock', {
      order_id: newOrderId,
      new_data: newOrder
    });

    if (error) {
      console.error('RPC Error creating order:', error);
      const stockMatch = (error.message || '').match(/STOCK_INSUFICIENTE:(.+)/);
      if (stockMatch) {
        throw new Error(`Stock insuficiente para "${stockMatch[1].trim()}"`);
      }
      throw new Error(`Error guardando pedido: ${error.message}`);
    }

    return newOrder;
  },

  update: async (
    token: string,
    orderId: string,
    updates: Partial<Order>
  ): Promise<Order> => {
    const response = await fetchAPI(
      `/orders/${orderId}`,
      {
        method: 'PUT',
        body: JSON.stringify(updates),
      },
      token
    );
    return response?.data || response;
  },

  updateWithStock: async (
    token: string,
    orderId: string,
    updates: {
      products: Array<{
        productId: string;
        name: string;
        quantity: number;
        price: number;
        productionAreaId?: string | null;
        areaStatus?: string;
      }>;
      total: number;
      notes?: string;
      deadline?: string;
      customerName?: string;
      deliveryAddress?: string;
    }
  ): Promise<void> => {
    // Igual patrón que ordersAPI.create: la reconciliación de stock/lotes y el
    // reemplazo de order_items pasan en el servidor, en una sola transacción
    // (RPC update_order_with_stock) — no se calcula ningún delta acá.
    const supabase = createClient(
      `https://${projectId}.supabase.co`,
      publicAnonKey,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { error } = await supabase.rpc('update_order_with_stock', {
      p_order_id: orderId,
      new_data: updates,
    });

    if (error) {
      console.error('RPC Error updating order:', error);
      const stockMatch = (error.message || '').match(/STOCK_INSUFICIENTE:(.+)/);
      if (stockMatch) {
        throw new Error(`Stock insuficiente para "${stockMatch[1].trim()}"`);
      }
      // La RPC rechaza si el pedido no es del negocio del usuario o su rol no
      // puede editar (mismo criterio que canEditOrder, pero del lado servidor).
      if (error.message?.includes('NO_AUTORIZADO')) {
        throw new Error('No tenés permiso para editar este pedido');
      }
      throw new Error(`Error guardando pedido: ${error.message}`);
    }
  },

  updateStatus: async (
    token: string,
    orderId: string,
    status: Order['status'],
    progress: number
  ): Promise<Order> => {
    // Map frontend status to backend status
    const statusMap: Record<string, string> = {
      pending: 'pending',
      in_progress: 'in_progress',
      completed: 'completed',
      dispatched: 'despachado',
      delivered: 'entregado',
      cancelled: 'cancelled',
    };

    const backendStatus = statusMap[status] || status;

    const response = await fetchAPI(
      `/orders/${orderId}/status`,
      {
        method: 'PUT',
        body: JSON.stringify({ status: backendStatus, progress }),
      },
      token
    );
    return response?.data || response;
  },

  updateAreaStatus: async (
    token: string,
    orderId: string,
    areaId: string,
    status: 'pending' | 'in_progress' | 'completed'
  ): Promise<Order> => {
    const response = await fetchAPI(
      `/orders/${orderId}/area-status`,
      {
        method: 'PUT',
        body: JSON.stringify({ areaId, status }),
      },
      token
    );
    return response?.data || response;
  },

  delete: async (token: string, orderId: string): Promise<{ deleted: boolean }> => {
    const response = await fetchAPI(
      `/orders/${orderId}`,
      {
        method: 'DELETE',
      },
      token
    );
    return response?.data || response;
  },
};

// Notification types
export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'order_created' | 'order_updated' | 'order_completed' | 'order_cancelled' | 'info' | 'warning' | 'error' | 'attendance_check_in' | 'attendance_check_out' | 'product_created' | 'product_updated';
  orderId?: string;
  read: boolean;
  createdAt: string;
}

// Notifications API
export const notificationsAPI = {
  getAll: async (token: string): Promise<Notification[]> => {
    const response = await fetchAPI('/notifications', {}, token);
    // Return the data array or empty array if not present
    return response?.data || [];
  },

  create: async (token: string, notification: {
    title: string;
    message: string;
    type: Notification['type'];
    orderId?: string;
    targetUserId?: string;
  }): Promise<Notification> => {
    const response = await fetchAPI('/notifications', {
      method: 'POST',
      body: JSON.stringify(notification),
    }, token);
    return response?.data || response;
  },

  markAsRead: async (token: string, notificationId: string): Promise<Notification> => {
    const response = await fetchAPI(`/notifications/${notificationId}/read`, {
      method: 'PATCH',
    }, token);
    return response?.data || response;
  },

  markAllAsRead: async (token: string): Promise<{ updated: number }> => {
    const response = await fetchAPI('/notifications/read-all', {
      method: 'PATCH',
    }, token);
    return response?.data || response;
  },

  delete: async (token: string, notificationId: string): Promise<{ deleted: boolean }> => {
    const response = await fetchAPI(`/notifications/${notificationId}`, {
      method: 'DELETE',
    }, token);
    return response?.data || response;
  },
};

// Categories API
export const categoriesAPI = {
  getAll: async (token: string): Promise<Category[]> => {
    const response = await fetchAPI('/categories', {}, token);
    return response?.data || [];
  },

  create: async (token: string, category: {
    name: string;
    description?: string;
    color?: string;
    parentId?: string | null;
  }): Promise<Category> => {
    const response = await fetchAPI('/categories', {
      method: 'POST',
      body: JSON.stringify(category),
    }, token);
    return response?.data || response;
  },

  update: async (token: string, categoryId: string, updates: Partial<Category>): Promise<Category> => {
    const response = await fetchAPI(`/categories/${categoryId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }, token);
    return response?.data || response;
  },

  delete: async (token: string, categoryId: string): Promise<{ deleted: boolean }> => {
    const response = await fetchAPI(`/categories/${categoryId}`, {
      method: 'DELETE',
    }, token);
    return response?.data || response;
  },
};

// Products API
export const productsAPI = {
  getAll: async (token: string): Promise<Product[]> => {
    // Explicitly set limit to 1000 to ensure we get all products
    // (Backend defaults to 20 if not specified)
    const response = await fetchAPI('/products?limit=1000', {}, token);
    return response?.data || [];
  },

  create: async (token: string, product: {
    name: string;
    description: string;
    price: number;
    stock: number;
    category?: string;
    categoryId?: string;
    imageUrl?: string;
    productionAreaId?: string;
    ingredients?: Array<{ ingredientId: string; quantity: number }>;
    laborCost?: number;
    sku?: string;
  }): Promise<Product> => {
    const response = await fetchAPI('/products', {
      method: 'POST',
      body: JSON.stringify(product),
    }, token);
    return response?.data || response;
  },

  // `modo` y `costoUnitario` no son campos del producto: son metadato del
  // ajuste que el backend usa para clasificar el movimiento en el kardex y
  // para crear el lote cuando corresponde. No se persisten tal cual en
  // products (costoUnitario pasa a ser el costo del lote nuevo).
  update: async (token: string, productId: string, updates: Partial<Product> & { ingredients?: Array<{ ingredientId: string; quantity: number }>; modo?: 'sumar' | 'total'; costoUnitario?: number }): Promise<Product> => {
    const response = await fetchAPI(`/products/${productId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }, token);
    return response?.data || response;
  },

  delete: async (token: string, productId: string): Promise<{ deleted: boolean }> => {
    const response = await fetchAPI(`/products/${productId}`, {
      method: 'DELETE',
    }, token);
    return response?.data || response;
  },

  // Precio real que va a cobrar un pedido por `quantity` unidades de un
  // producto con costeo por lotes FIFO. Es una simulación de solo lectura
  // (función `previsualizar_precio_lotes` en Postgres, mismo recorrido que
  // create_order_with_stock) — no reserva ni toca ningún lote. Se usa para
  // que el carrito muestre el cobro real antes de confirmar, en vez de
  // price × quantity, que puede quedar lejos del total si la cantidad pedida
  // cruza dos lotes de costo distinto. Devuelve null ante cualquier error
  // (producto fuera de alcance, sin sesión, etc.): el llamador debe tratarlo
  // como "no hay previsualización disponible" y no bloquear el flujo normal.
  previewLotPrice: async (
    token: string,
    productId: string,
    quantity: number
  ): Promise<{ precioUnitario: number; total: number } | null> => {
    const supabase = createClient(
      `https://${projectId}.supabase.co`,
      publicAnonKey,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data, error } = await supabase.rpc('previsualizar_precio_lotes', {
      p_product_id: productId,
      p_cantidad: quantity,
    });

    if (error || !data || data.length === 0) {
      return null;
    }

    return {
      precioUnitario: Number(data[0].precio_unitario),
      total: Number(data[0].total),
    };
  },
};

// Ingredients API (Materias Primas)
export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
  maxStock?: number;
  costPerUnit?: number;
  supplier?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductIngredient {
  id?: string;
  productId?: string;
  productName?: string;
  ingredientId: string;
  ingredientName?: string;
  quantity: number;
  unit?: string;
  costPerUnit?: number;
}

export const ingredientsAPI = {
  getAll: async (token: string): Promise<Ingredient[]> => {
    const response = await fetchAPI('/ingredients', {}, token);
    return response?.data || [];
  },

  create: async (token: string, ingredient: {
    name: string;
    unit: string;
    currentStock: number;
    minStock: number;
    maxStock?: number;
    costPerUnit?: number;
    supplier?: string;
  }): Promise<Ingredient> => {
    const response = await fetchAPI('/ingredients', {
      method: 'POST',
      body: JSON.stringify(ingredient),
    }, token);
    return response?.data || response;
  },

  update: async (token: string, ingredientId: string, updates: Partial<Ingredient>): Promise<Ingredient> => {
    const response = await fetchAPI(`/ingredients/${ingredientId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }, token);
    return response?.data || response;
  },

  delete: async (token: string, ingredientId: string): Promise<{ deleted: boolean }> => {
    const response = await fetchAPI(`/ingredients/${ingredientId}`, {
      method: 'DELETE',
    }, token);
    return response?.data || response;
  },

  // Adjust stock (add or subtract)
  adjustStock: async (token: string, ingredientId: string, adjustment: number, reason?: string): Promise<Ingredient> => {
    const response = await fetchAPI(`/ingredients/${ingredientId}/adjust-stock`, {
      method: 'POST',
      body: JSON.stringify({ adjustment, reason }),
    }, token);
    return response?.data || response;
  },

  // Get low stock ingredients (below minStock)
  getLowStock: async (token: string): Promise<Ingredient[]> => {
    const response = await fetchAPI('/ingredients/low-stock', {}, token);
    return response?.data || [];
  },
};

// Product Ingredients API (relación producto-ingrediente)
export const productIngredientsAPI = {
  // Get ingredients for a specific product
  getByProduct: async (token: string, productId: string): Promise<ProductIngredient[]> => {
    const response = await fetchAPI(`/products/${productId}/ingredients`, {}, token);
    return response?.data || [];
  },

  // Set ingredients for a product (replaces existing)
  setIngredients: async (token: string, productId: string, ingredients: Array<{
    ingredientId: string;
    quantity: number;
  }>): Promise<ProductIngredient[]> => {
    const response = await fetchAPI(`/products/${productId}/ingredients`, {
      method: 'PUT',
      body: JSON.stringify({ ingredients }),
    }, token);
    return response?.data || response;
  },

  // Add a single ingredient to a product
  addIngredient: async (token: string, productId: string, ingredientId: string, quantity: number): Promise<ProductIngredient> => {
    const response = await fetchAPI(`/products/${productId}/ingredients`, {
      method: 'POST',
      body: JSON.stringify({ ingredientId, quantity }),
    }, token);
    return response?.data || response;
  },

  // Remove an ingredient from a product
  removeIngredient: async (token: string, productId: string, ingredientId: string): Promise<{ deleted: boolean }> => {
    const response = await fetchAPI(`/products/${productId}/ingredients/${ingredientId}`, {
      method: 'DELETE',
    }, token);
    return response?.data || response;
  },
};

// ─── Nutrición y etiquetas ────────────────────────────────────────────────────
//
// El motor de cálculo vive en src/utils/nutricion y es puro. Esta capa solo trae
// y guarda datos; ninguna fórmula pasa por acá.

/**
 * Extiende el tipo que consume el motor. Que herede de `FichaNutricional` no es
 * cosmético: si el endpoint deja de devolver un campo que el cálculo necesita,
 * el compilador lo marca acá en vez de aparecer como un NaN en una etiqueta.
 */
export interface FichaNutricionalAPI extends FichaNutricional {
  ingredientId: string;
  marca: string;
  fuente: string;
  actualizadoEn?: string | null;
  updatedAt?: string;
}

export interface AlergenoAPI {
  id: string;
  codigo: string;
  nombre: string;
  nombreEtiqueta: string;
  orden: number;
  businessId?: string | null;
}

export interface AlergenosDeMateriaPrima {
  contiene: AlergenoAPI[];
  trazas: AlergenoAPI[];
}

export interface LabelProfile {
  productId: string;
  pesoFinalPromedioG: number | null;
  pesoPorcionG: number | null;
  porcionesPorEnvase: number | null;
  porcionDescripcion: string;
  denominacionLegal: string;
  descripcionEtiqueta: string;
  conservacion: string;
  vidaUtilDias: number | null;
  ingredientesTextoOverride: string;
  alergenosTextoOverride: string;
  trazasTextoOverride: string;
  updatedAt?: string;
}

export interface LabelSettings {
  businessId: string;
  razonSocial: string;
  rut: string;
  direccion: string;
  telefono: string;
  email: string;
  plantaElaboradora: string;
  logoFrontalUrl: string;
  anchoMmDefault: number;
  altoMmDefault: number;
}

export interface LabelVersion {
  id: string;
  productId: string;
  productName: string;
  version: number;
  estado: 'borrador' | 'lista';
  snapshot: Record<string, unknown>;
  regulationVersion: string;
  calculatedAt: string;
  createdBy?: string | null;
  anchoMm: number | null;
  altoMm: number | null;
  createdAt: string;
}

/** Una línea de receta con todo lo necesario para calcularla. */
export interface LineaDataset {
  ingredienteId: string;
  nombre: string;
  /** ingredients.unit. `cantidad` está en ESTA unidad, no en gramos. */
  unidad: string;
  cantidad: number;
  ficha: FichaNutricionalAPI | null;
  contiene: AlergenoAPI[];
  trazas: AlergenoAPI[];
}

export interface NutritionDataset {
  product: { id: string; name: string };
  lineas: LineaDataset[];
  labelProfile: LabelProfile | null;
  labelSettings: LabelSettings | null;
}

export const nutritionAPI = {
  getAllergens: async (token: string): Promise<AlergenoAPI[]> => {
    const response = await fetchAPI('/nutrition/allergens', {}, token);
    return response?.data || [];
  },

  /** Fichas + alérgenos de todas las materias primas del negocio, en una llamada. */
  getIngredientNutrition: async (
    token: string,
  ): Promise<{ fichas: FichaNutricionalAPI[]; alergenos: Record<string, AlergenosDeMateriaPrima> }> => {
    const response = await fetchAPI('/nutrition/ingredients', {}, token);
    return response?.data || { fichas: [], alergenos: {} };
  },

  /**
   * Guarda la ficha de una materia prima. Upsert.
   *
   * `contiene`/`trazas` son arrays de allergen_id y REEMPLAZAN lo que hubiera.
   * Omitirlos deja los alérgenos como están: un guardado que solo toca nutrientes
   * no borra lo ya cargado.
   */
  saveIngredientNutrition: async (
    token: string,
    ingredientId: string,
    ficha: Partial<FichaNutricionalAPI> & { contiene?: string[]; trazas?: string[] },
  ): Promise<FichaNutricionalAPI> => {
    const response = await fetchAPI(`/nutrition/ingredients/${ingredientId}`, {
      method: 'PUT',
      body: JSON.stringify(ficha),
    }, token);
    return response?.data || response;
  },

  getProductDataset: async (token: string, productId: string): Promise<NutritionDataset> => {
    const response = await fetchAPI(`/nutrition/products/${productId}/dataset`, {}, token);
    return response?.data || response;
  },

  saveLabelProfile: async (
    token: string,
    productId: string,
    perfil: Partial<LabelProfile>,
  ): Promise<LabelProfile> => {
    const response = await fetchAPI(`/nutrition/products/${productId}/label-profile`, {
      method: 'PUT',
      body: JSON.stringify(perfil),
    }, token);
    return response?.data || response;
  },

  getLabelSettings: async (token: string): Promise<LabelSettings | null> => {
    const response = await fetchAPI('/nutrition/label-settings', {}, token);
    return response?.data ?? null;
  },

  saveLabelSettings: async (token: string, settings: Partial<LabelSettings>): Promise<LabelSettings> => {
    const response = await fetchAPI('/nutrition/label-settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }, token);
    return response?.data || response;
  },

  getLabelVersions: async (token: string, productId: string): Promise<LabelVersion[]> => {
    const response = await fetchAPI(`/nutrition/products/${productId}/label-versions`, {}, token);
    return response?.data || [];
  },

  createLabelVersion: async (
    token: string,
    productId: string,
    payload: {
      estado: 'borrador' | 'lista';
      snapshot: Record<string, unknown>;
      regulationVersion: string;
      calculatedAt?: string;
      anchoMm?: number;
      altoMm?: number;
    },
  ): Promise<LabelVersion> => {
    const response = await fetchAPI(`/nutrition/products/${productId}/label-versions`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }, token);
    return response?.data || response;
  },
};

// Attendance API
export interface AttendanceRecord {
  id: string;
  userId: string;
  userName: string;
  localId: string;
  localName: string;
  checkIn: string;
  checkOut?: string;
  date: string;
  status: 'active' | 'completed';
}

export interface LocalUser {
  id: string;
  name: string;
  email: string;
  role: 'local';
}

export const attendanceAPI = {
  getLocals: async (token?: string): Promise<LocalUser[]> => {
    const response = await fetchAPI('/attendance/locals', {}, token);
    return response?.data || [];
  },

  checkIn: async (localId: string, token?: string): Promise<AttendanceRecord> => {
    const response = await fetchAPI('/attendance/check-in', {
      method: 'POST',
      body: JSON.stringify({ localId }),
    }, token);
    return response?.data || response;
  },

  checkOut: async (recordId: string, token?: string): Promise<AttendanceRecord> => {
    const response = await fetchAPI(`/attendance/check-out/${recordId}`, {
      method: 'PUT',
    }, token);
    return response?.data || response;
  },

  getMyRecords: async (token?: string): Promise<AttendanceRecord[]> => {
    const response = await fetchAPI('/attendance/my-records', {}, token);
    return response?.data || [];
  },

  getAllRecords: async (token: string): Promise<AttendanceRecord[]> => {
    const response = await fetchAPI('/attendance/all-records', {}, token);
    return response?.data || [];
  },

  getRecordsByDate: async (date: string, token?: string): Promise<AttendanceRecord[]> => {
    const response = await fetchAPI(`/attendance/records/${date}`, {}, token);
    return response?.data || [];
  },

  updateRecord: async (recordId: string, updates: Partial<AttendanceRecord>, token: string): Promise<AttendanceRecord> => {
    const response = await fetchAPI(`/attendance/records/${recordId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }, token);
    return response?.data || response;
  },

  deleteRecord: async (recordId: string, token: string): Promise<{ deleted: boolean }> => {
    const response = await fetchAPI(`/attendance/records/${recordId}`, {
      method: 'DELETE',
    }, token);
    return response?.data || response;
  },
};

// Business API
export const businessAPI = {
  get: async (token: string): Promise<Business> => {
    const response = await fetchAPI('/business', {}, token);
    return response?.data || response;
  },

  regenerateCode: async (token: string): Promise<{ inviteCode: string }> => {
    const response = await fetchAPI('/business/regenerate-code', {
      method: 'POST',
    }, token);
    return response?.data || response;
  },

  getMembers: async (token: string): Promise<{ business: { id: string; name: string }; members: BusinessMember[]; totalMembers: number }> => {
    const response = await fetchAPI('/business/members', {}, token);
    return response?.data || response;
  },
};

// Production Areas API
export const productionAreasAPI = {
  getAll: async (token: string): Promise<ProductionArea[]> => {
    const response = await fetchAPI('/production-areas', {}, token);
    return response?.data || [];
  },

  create: async (token: string, area: {
    name: string;
    description?: string;
    color?: string;
    icon?: string;
  }): Promise<ProductionArea> => {
    const response = await fetchAPI('/production-areas', {
      method: 'POST',
      body: JSON.stringify(area),
    }, token);
    return response?.data || response;
  },

  update: async (token: string, areaId: string, updates: Partial<ProductionArea>): Promise<ProductionArea> => {
    const response = await fetchAPI(`/production-areas/${areaId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }, token);
    return response?.data || response;
  },

  delete: async (token: string, areaId: string): Promise<{ deleted: boolean }> => {
    const response = await fetchAPI(`/production-areas/${areaId}`, {
      method: 'DELETE',
    }, token);
    return response?.data || response;
  },
};

export interface StockEvent {
  id: string;
  productId: string;
  productName: string;
  // 'devolucion' = stock que volvió porque se borró un pedido. Es una entrada,
  // igual que 'reposicion', pero se distingue para no inflar la señal de
  // reposiciones reales.
  type: 'despacho' | 'reposicion' | 'merma' | 'ajuste' | 'devolucion';
  quantity: number;   // siempre positiva: el signo lo da el `type`
  stockAfter?: number;
  orderId?: string;
  createdAt: string;
}

export const stockEventsAPI = {
  getByProduct: async (token: string, productId: string, limit: number = 50): Promise<StockEvent[]> => {
    const response = await fetchAPI(`/products/${productId}/stock-events?limit=${limit}`, {}, token);
    return response?.data || [];
  },
};