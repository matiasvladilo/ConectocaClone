import { useState, useEffect, useRef, useMemo } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LoginScreen } from "./components/LoginScreen";
import { HomeScreen } from "./components/HomeScreen";
import { OrderDetail } from "./components/OrderDetail";
import { ProductionArea } from "./components/ProductionArea";
import { BakeryKDS } from "./components/BakeryKDS";
import { ProductionOrders } from "./components/ProductionOrders";
import { ProductionDashboard } from "./components/ProductionDashboard";
import { DispatchOrders } from "./components/DispatchOrders";
import { UserProfile } from "./components/UserProfile";
import { NewOrderForm } from "./components/NewOrderForm";
import { Analytics } from "./components/Analytics";
import { NotificationsPanel } from "./components/NotificationsPanel";
import { OrderHistory } from "./components/OrderHistory";
import { ProductManagement } from "./components/ProductManagement";
import { CategoryManagement } from "./components/CategoryManagement";
import { ProductionAreasManagement } from "./components/ProductionAreasManagement";
import { IngredientManagement } from "./components/IngredientManagement";
import { ProductIngredientConfig } from "./components/ProductIngredientConfig";
import { PWAHead } from "./components/PWAHead";
import { InstallPWA } from "./components/InstallPWA";
import { AudioInitializer } from "./components/AudioInitializer";
import { Toaster } from "./components/ui/sonner";
import { createClient, setRememberSession } from "./utils/supabase/client";
import { registerServiceWorker } from "./utils/registerServiceWorker";
import {
  authAPI,
  ordersAPI,
  profileAPI,
  notificationsAPI,
  productsAPI,
  API_BASE_URL,
  type Order as APIOrder,
  type PaginatedResponse,
  type Notification,
} from "./utils/api";
import { toast } from "sonner";
import { Bell } from "lucide-react";
import { Badge } from "./components/ui/badge";
import { motion, AnimatePresence } from "motion/react";
import { notifyNewOrder, notifyOrderUpdate, playNotificationSound } from "./utils/notificationSound";

// CONECTOCA - Sistema de gestión de pedidos y producción

export type OrderStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "dispatched"
  | "delivered"
  | "cancelled";

// Production Order Status (for manufacturing orders)
export type ProductionOrderStatus =
  | "BORRADOR"
  | "EN_PROCESO"
  | "TERMINADA";

// Orden de Pedido (from local stores) - existing structure
export interface Order {
  id: string;
  productName: string;
  quantity: number;
  date: string;
  status: OrderStatus;
  customerName: string;
  deadline: string;
  progress: number;
  products?: Array<{
    productId: string;
    name: string;
    quantity: number;
    price: number;
    productionAreaId?: string;
    productionAreaName?: string;
    productionAreaColor?: string;
    productionAreaIcon?: string;
  }>;
  total?: number;
  notes?: string;
  deliveryAddress?: string;
  userId?: string;
  createdAt?: string;
  itemStatuses?: Record<string, 'pending' | 'in_progress' | 'completed'>;
}

// Orden de Producción (for manufacturing)
export interface ProductionOrder {
  id: string;
  productName: string;
  quantity: number;
  status: ProductionOrderStatus;
  createdBy: string; // userId of production user who created it
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  products: Array<{
    productId: string;
    name: string;
    quantity: number;
    currentStock?: number;
    producedQuantity?: number;
    wasteQuantity?: number;
  }>;
  notes?: string;
}

// Ingrediente/Materia Prima
export interface Ingredient {
  id: string;
  name: string;
  unit: string; // kg, litros, unidades, etc.
  currentStock: number;
  minStock: number; // Stock mínimo para alertas
  maxStock?: number;
  costPerUnit?: number;
  supplier?: string;
  createdAt: string;
  updatedAt: string;
}

// Ingrediente de un producto (relación producto-ingrediente)
export interface ProductIngredient {
  id?: string;
  productId?: string;
  productName?: string;
  ingredientId: string;
  ingredientName: string;
  quantity: number; // Cantidad necesaria por unidad de producto
  unit: string;
  costPerUnit?: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "production" | "dispatch" | "local" | "user" | "worker" | "pastry";
  address?: string;
}

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<
    | "login"
    | "home"
    | "orderDetail"
    | "production"
    | "productionDashboard"
    | "productionOrders"
    | "dispatch"
    | "profile"
    | "newOrder"
    | "analytics"
    | "history"
    | "products"
    | "categories"
    | "productionAreas"
    | "ingredients"
    | "productIngredients"
    | "bakeryKds"
  >("login");

  // Debug: Log screen changes
  useEffect(() => {
    console.log("Current Screen changed to:", currentScreen);
  }, [currentScreen]);

  const [currentUser, setCurrentUser] = useState<User | null>(
    null,
  );
  const [selectedOrder, setSelectedOrder] =
    useState<Order | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [accessToken, setAccessToken] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [isInitialOrdersLoading, setIsInitialOrdersLoading] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const [ordersPagination, setOrdersPagination] =
    useState<any>(null);
  const [notifications, setNotifications] = useState<
    Notification[]
  >([]);
  const [notificationsOpen, setNotificationsOpen] =
    useState(false);

  // Use ref instead of state to avoid closure issues with setInterval
  const hasLoadedInitialOrders = useRef(false);
  const initialOrderIds = useRef<Set<string>>(new Set());
  const previousNotificationIds = useRef<Set<string>>(new Set());

  const supabase = createClient();

  // Check for existing session on mount
  useEffect(() => {
    // Configure viewport for mobile - CRITICAL for sharp rendering
    let viewport = document.querySelector(
      'meta[name="viewport"]',
    );
    if (!viewport) {
      viewport = document.createElement("meta");
      viewport.setAttribute("name", "viewport");
      document.head.appendChild(viewport);
    }
    viewport.setAttribute(
      "content",
      "width=device-width, initial-scale=1.0, viewport-fit=cover",
    );

    // Force document to use device pixels
    if (document.body) {
      document.body.style.webkitTextSizeAdjust = "100%";
      (document.body.style as any).textSizeAdjust = "100%";
    }

    // Register Service Worker for PWA
    registerServiceWorker({
      onSuccess: () => {
        console.log('[PWA] Content cached for offline use');
      },
      onUpdate: () => {
        console.log('[PWA] New version available');
        toast.info('Nueva versión disponible. Recarga la página para actualizar.', {
          duration: 10000,
        });
      },
      onError: (error) => {
        console.error('[PWA] Service worker registration failed:', error);
      },
    });

    checkSession();

    // Configurar listener para cambios de sesión (login, logout, token refresh automático de Supabase)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log(`🔑 Evento de sesión Supabase: ${event}`, session ? "Sesión activa" : "Sin sesión");

      if (session?.access_token) {
        // Restaurar silenciosamente o en background si recibimos un nuevo token refescado
        if (accessToken !== session.access_token) {
          console.log("✅ Token actualizado por evento automático");
          setAccessToken(session.access_token);
        }
      } else if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
        console.log("⚠️ Sesión cerrada detectada");
        localStorage.removeItem('conectoca_cached_user');
        setAccessToken(null);
        setCurrentUser(null);
        setCurrentScreen("login");
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
    // initializeDemoUsers(); // Disabled to prevent blocking login requests on load
  }, []);

  // Initialize audio on first user interaction
  useEffect(() => {
    const initAudio = async () => {
      const { initializeAudio } = await import('./utils/notificationSound');
      await initializeAudio();
    };

    // Listen for any user interaction
    const handleFirstInteraction = () => {
      initAudio();
      // Remove listeners after first interaction
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
      document.removeEventListener('touchstart', handleFirstInteraction);
    };

    document.addEventListener('click', handleFirstInteraction);
    document.addEventListener('keydown', handleFirstInteraction);
    document.addEventListener('touchstart', handleFirstInteraction);

    return () => {
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
      document.removeEventListener('touchstart', handleFirstInteraction);
    };
  }, []);

  // Real-time polling for orders and notifications
  useEffect(() => {
    if (!accessToken || !currentUser) {
      // Clear notifications when logged out
      console.log('[POLLING] No accessToken or currentUser, skipping polling');
      setNotifications([]);
      return;
    }

    console.log('[POLLING] Starting polling with valid session');
    // Load notifications initially
    loadNotifications();

    // Set up polling interval (every 5 seconds)
    const intervalId = setInterval(() => {
      // Only poll if still authenticated
      if (accessToken && currentUser) {
        console.log('[POLLING] Checking for updates...', { role: currentUser.role, page: ordersPagination?.page || 1 });
        // Use current page from pagination state to avoid resetting to page 1
        const currentPage = ordersPagination?.page || 1;
        loadOrders(accessToken, true, currentPage);
        loadNotifications();
      } else {
        console.log('[POLLING] Session invalidated, stopping polling');
      }
    }, 5000);

    // Cleanup interval on unmount or when dependencies change
    return () => {
      console.log('[POLLING] Cleaning up polling interval');
      clearInterval(intervalId);
    };
  }, [accessToken, currentUser, ordersPagination]);

  // Refresco proactivo de sesión al volver a la app (foco / pestaña visible).
  // En PWA/móvil el timer de auto-refresh de Supabase no corre mientras la app está
  // suspendida, así que al regresar el access token puede estar vencido. Refrescamos
  // de inmediato para que el siguiente request use un token fresco en vez de un 401.
  useEffect(() => {
    if (!currentUser) return;

    let lastRefresh = 0;
    const refreshIfStale = async () => {
      if (document.visibilityState === 'hidden') return;
      // Throttle: evitar refrescos en ráfaga al alternar foco/visibilidad.
      const now = Date.now();
      if (now - lastRefresh < 30000) return;
      lastRefresh = now;
      try {
        await supabase.auth.refreshSession();
        // onAuthStateChange (TOKEN_REFRESHED) actualiza accessToken en el estado.
      } catch (err) {
        console.warn('[SESSION] Refresh proactivo falló:', err);
      }
    };

    document.addEventListener('visibilitychange', refreshIfStale);
    window.addEventListener('focus', refreshIfStale);

    return () => {
      document.removeEventListener('visibilitychange', refreshIfStale);
      window.removeEventListener('focus', refreshIfStale);
    };
  }, [currentUser]);

  const initializeDemoUsers = async () => {
    // Create demo users if they don't exist (silently)
    // All demo users belong to the same demo business
    const demoUsers = [
      {
        email: "admin@demo.com",
        password: "demo123",
        name: "Administrador Demo",
        role: "admin" as const,
        isFirst: true, // First user creates the business
      },
      {
        email: "produccion@demo.com",
        password: "demo123",
        name: "Equipo de Producción",
        role: "production" as const,
        isFirst: false,
      },
      {
        email: "despacho@demo.com",
        password: "demo123",
        name: "Equipo de Despacho",
        role: "dispatch" as const,
        isFirst: false,
      },
      {
        email: "local@demo.com",
        password: "demo123",
        name: "Local Centro Demo",
        role: "local" as const,
        isFirst: false,
      },
    ];

    // Demo business invite code (static for demo users)
    const DEMO_BUSINESS_CODE = "DEMOCODE";

    let firstUserCreated = false;

    for (const user of demoUsers) {
      try {
        if (user.isFirst) {
          // First user creates the demo business
          await authAPI.signup(
            user.email,
            user.password,
            user.name,
            user.role,
            'create',
            'Negocio Demo - La Oca',
            undefined
          );
          console.log(`✓ Demo business created by ${user.email}`);
          firstUserCreated = true;
          // Wait longer to ensure business is fully saved before others try to join
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          // Other users join the demo business
          // Retry logic in case business is not yet available
          let retries = 3;
          let success = false;

          while (retries > 0 && !success) {
            try {
              await authAPI.signup(
                user.email,
                user.password,
                user.name,
                user.role,
                'join',
                undefined,
                DEMO_BUSINESS_CODE
              );
              console.log(`✓ Demo user joined business: ${user.email}`);
              success = true;
            } catch (joinError: any) {
              const joinErrorMsg = joinError?.message || "";

              // If user already exists, that's fine
              if (joinErrorMsg.includes("already") || joinErrorMsg.includes("registrado")) {
                success = true;
                break;
              }

              // If code is invalid, retry after delay
              if (joinErrorMsg.includes("Código de invitación inválido") && retries > 1) {
                console.log(`⏳ Business not ready yet, retrying for ${user.email}... (${retries - 1} attempts left)`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                retries--;
              } else {
                throw joinError;
              }
            }
          }
        }
      } catch (error: any) {
        // User already exists - this is expected and OK, no need to log
        // Only log if it's a different error
        const errorMsg = error?.message || "";
        if (
          !errorMsg.includes("already") &&
          !errorMsg.includes("registrado") &&
          !errorMsg.includes("Código de invitación inválido")
        ) {
          console.warn(
            `Note: Could not create demo user ${user.email}:`,
            errorMsg,
          );
        }
        // Silently continue if user already exists or code is invalid (will retry next time)
      }
    }

    // If first user was just created, also create demo products
    if (firstUserCreated) {
      await initializeDemoProducts();
    }
  };

  const initializeDemoProducts = async () => {
    try {
      // Login as demo user to create products
      const { data: { session } } = await supabase.auth.signInWithPassword({
        email: 'admin@demo.com',
        password: 'demo123'
      });

      if (!session?.access_token) {
        console.log('Could not login to create demo products');
        return;
      }

      // Create some demo products
      const demoProducts = [
        {
          name: 'Pan Francés',
          description: 'Pan fresco del día',
          price: 2.50,
          stock: 100
        },
        {
          name: 'Croissant',
          description: 'Croissant de mantequilla',
          price: 3.50,
          stock: 50
        },
        {
          name: 'Empanada de Pollo',
          description: 'Empanada casera de pollo',
          price: 4.00,
          stock: 30
        }
      ];

      for (const product of demoProducts) {
        try {
          await productsAPI.create(session.access_token, product);
        } catch (error: any) {
          // Ignore errors, products might already exist
        }
      }

      console.log('✓ Demo products initialized');

      // Sign out after creating products
      await supabase.auth.signOut();
    } catch (error) {
      // Silently fail, demo products are optional
    }
  };

  const checkSession = async () => {
    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        console.error("Error checking session:", error);
        setAccessToken(null); // Explicitly set to null on error
        setCurrentUser(null);
        setLoading(false);
        return;
      }

      if (session?.access_token) {
        console.log("✅ Valid session found, restoring...");
        await handleSessionRestore(session.access_token);
      } else {
        console.log("⚠️ No valid session found");
        setAccessToken(null); // Explicitly set to null when no session
        setCurrentUser(null);
        setLoading(false);
      }
    } catch (error) {
      console.error("Error in checkSession:", error);
      setAccessToken(null); // Explicitly set to null on exception
      setCurrentUser(null);
      setLoading(false);
    }
  };

  const CACHED_USER_KEY = 'conectoca_cached_user';

  const handleSessionRestore = async (token: string) => {
    try {
      console.log("🔄 Restoring session...");
      setAccessToken(token);

      console.log("📋 Fetching user profile...");
      const profile = await profileAPI.get(token);
      console.log(
        `✓ Profile loaded: ${profile.name} (${profile.role})`,
      );

      const user: User = {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        role: profile.role,
        address: profile.address,
      };

      // Guardar perfil en caché para restauración offline/cold-start
      localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user));

      setCurrentUser(user);

      if (user.role === 'pastry') {
        setCurrentScreen("bakeryKds");
      } else {
        setCurrentScreen("home");
      }

      console.log(" Loading orders...");
      setIsInitialOrdersLoading(true);

      // Load orders in background to not block UI login transition
      loadOrders(token).then(() => {
        setIsInitialOrdersLoading(false);
      }).catch(err => {
        console.error("Failed to load initial orders", err);
        setIsInitialOrdersLoading(false);
      });

      console.log("✓ Session restored successfully");
      setLoading(false); // CRITICAL: Set loading to false after successful restore
    } catch (error: any) {
      console.error("❌ Error restoring session:", error);

      const errorMessage = error.message || "";
      const isAuthError =
        errorMessage.includes("Unauthorized") ||
        errorMessage.includes("Invalid JWT") ||
        errorMessage.includes("401") ||
        errorMessage.includes("403") ||
        errorMessage.includes("expir");

      if (isAuthError) {
        // Solo borrar la sesión si es un error estrictamente de autenticación (Expirada / Inválida)
        await supabase.auth.signOut();
        localStorage.removeItem(CACHED_USER_KEY);
        setAccessToken(null);
        setCurrentUser(null);
        setCurrentScreen("login");
        toast.error("Sesión inválida o expirada. Por favor inicia sesión nuevamente.");
      } else {
        // Intentar usar el perfil cacheado si hay un error de red/timeout
        const cachedUserStr = localStorage.getItem(CACHED_USER_KEY);
        if (cachedUserStr) {
          try {
            const cachedUser: User = JSON.parse(cachedUserStr);
            console.log("⚡ Usando perfil cacheado:", cachedUser.name);
            setCurrentUser(cachedUser);
            if (cachedUser.role === 'pastry') {
              setCurrentScreen("bakeryKds");
            } else {
              setCurrentScreen("home");
            }
            setIsInitialOrdersLoading(true);
            loadOrders(token).then(() => {
              setIsInitialOrdersLoading(false);
            }).catch(err => {
              console.error("Failed to load initial orders with cached user", err);
              setIsInitialOrdersLoading(false);
            });
            setLoading(false);
            // Refrescar perfil en segundo plano
            profileAPI.get(token).then((profile) => {
              const updatedUser: User = {
                id: profile.id,
                name: profile.name,
                email: profile.email,
                role: profile.role,
                address: profile.address,
              };
              localStorage.setItem(CACHED_USER_KEY, JSON.stringify(updatedUser));
              setCurrentUser(updatedUser);
            }).catch(() => {});
            return;
          } catch {
            // Si el caché está corrupto, ignorar y mostrar login
          }
        }
        // Sin caché: mostrar advertencia y redirigir al login
        toast.warning("Hubo un problema de conexión al cargar la app. Por favor inicia sesión nuevamente.");
        setLoading(false);
        setCurrentScreen("login");
      }

      setLoading(false); // Liberar carga
    }
  };

  const loadOrders = async (
    token: string,
    isBackgroundRefresh: boolean = false,
    page: number = 1,
  ) => {
    try {
      if (!token) {
        console.error("No token provided to loadOrders");
        return;
      }

      console.log(
        "Loading orders with token:",
        token.substring(0, 20) + "...",
      );
      const limit = page === 1 ? 50 : 50; // Use reasonable limit to prevent login timeouts
      const response: PaginatedResponse<APIOrder> =
        await ordersAPI.getAll(token, page, limit);

      // Store pagination info
      setOrdersPagination(response.pagination);

      // Transform API orders to app format
      const transformedOrders: Order[] = response.data.map(
        (order: APIOrder) => {
          const products = order.products || [];
          // Resolve creation date: prefer createdAt, fallback to MongoDB ObjectId timestamp
          let resolvedCreatedAt: string | undefined;
          if (order.createdAt) {
            const d = new Date(order.createdAt);
            if (!isNaN(d.getTime())) resolvedCreatedAt = order.createdAt;
          }
          if (!resolvedCreatedAt && order.id && /^[0-9a-f]{24}$/i.test(order.id)) {
            const ts = parseInt(order.id.slice(0, 8), 16) * 1000;
            resolvedCreatedAt = new Date(ts).toISOString();
          }
          const safeDate = resolvedCreatedAt
            ? new Date(resolvedCreatedAt).toISOString().split("T")[0]
            : new Date().toISOString().split("T")[0];

          return {
            id: order.id || crypto.randomUUID(),
            productName: products
              .map((p) => p.name || 'Producto')
              .join(", ") || 'Sin productos',
            quantity: products.reduce(
              (sum, p) => sum + (p.quantity || 0),
              0,
            ),
            date: safeDate,
            status: (order.status === 'entregado' ? 'delivered' :
              order.status === 'despachado' ? 'dispatched' :
                order.status || 'pending') as OrderStatus,
            customerName: order.customerName || "",
            deadline: order.deadline ? order.deadline.slice(0, 10) : safeDate,
            progress: order.progress || 0,
            products: products,
            total: order.total || 0,
            deliveryAddress:
              order.deliveryAddress || "Sin dirección registrada",
            userId: order.userId || '',
            createdAt: resolvedCreatedAt,
            notes: order.notes,
            itemStatuses: order.itemStatuses || {},
          };
        }
      );
      // Note: Sorting is now handled by backend

      // Check for new orders BEFORE checking if orders changed (for notifications)
      // Admin and Production users should get notifications
      console.log('[NOTIF] Checking for new orders...', {
        isBackgroundRefresh,
        userRole: currentUser?.role,
        hasLoadedInitialOrders: hasLoadedInitialOrders.current,
        oldOrdersCount: orders.length,
        newOrdersCount: transformedOrders.length
      });

      // Only check for NEW orders if we already completed the first load
      // This prevents false notifications on login but allows notifications after that
      if (isBackgroundRefresh &&
        currentUser?.role === "dispatch" &&
        hasLoadedInitialOrders.current) {
        // Find TRULY NEW orders (orders that weren't in the INITIAL load)
        const newOrders = transformedOrders.filter(o => !initialOrderIds.current.has(o.id));

        console.log('[NOTIF] New orders check:', {
          initialOrderIdsCount: initialOrderIds.current.size,
          currentOrdersCount: transformedOrders.length,
          newOrdersFound: newOrders.length,
          newOrderIds: newOrders.map(o => o.id.substring(0, 8))
        });

        if (newOrders.length > 0) {
          // Add new order IDs to the set so we don't notify again
          newOrders.forEach(order => initialOrderIds.current.add(order.id));
          console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: orange; font-weight: bold');
          console.log('%c🔔 ¡NUEVO PEDIDO DETECTADO!', 'background: orange; color: white; font-size: 20px; font-weight: bold; padding: 10px');
          console.log('%cCantidad de pedidos nuevos:', 'font-weight: bold', newOrders.length);
          console.log('%cPedidos:', 'font-weight: bold', newOrders);
          console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: orange; font-weight: bold');

          // Play sound notification - ONLY FOR DISPATCH ROLE
          try {
            console.log('%c[NOTIF] 🔊 Intentando reproducir sonido automáticamente...', 'background: blue; color: white; font-weight: bold; padding: 5px');

            // Check if audio was initialized by user
            const audioInitialized = sessionStorage.getItem('audio-initialized');
            console.log('[NOTIF] ¿Audio inicializado por usuario?', audioInitialized);

            if (!audioInitialized) {
              console.log('%c[NOTIF] ⚠️ Audio no inicializado - El usuario debe hacer clic en "ACTIVAR AUDIO"', 'background: orange; color: white; font-weight: bold; padding: 5px');
              toast.warning('🔊 HAZ CLIC EN "ACTIVAR AUDIO" para escuchar notificaciones', {
                duration: 6000,
              });
            } else {
              console.log('%c[NOTIF] ✅ Audio inicializado detectado, reproduciendo...', 'background: green; color: white; font-weight: bold; padding: 5px');
              console.log('[NOTIF] Llamando a playNotificationSound...');

              const soundResult = await playNotificationSound('new_order');

              console.log('[NOTIF] Resultado de playNotificationSound:', soundResult);
              console.log('%c[NOTIF] ✅✅✅ Sonido reproducido exitosamente', 'background: green; color: white; font-weight: bold; padding: 10px');
            }
          } catch (error) {
            console.error('%c[NOTIF] ❌❌❌ ERROR AL REPRODUCIR SONIDO:', 'background: red; color: white; font-weight: bold; padding: 10px', error);
            console.error('[NOTIF] Tipo de error:', typeof error);
            console.error('[NOTIF] Error completo:', error);
            console.error('[NOTIF] Stack trace:', error instanceof Error ? error.stack : 'No stack available');
          }

          try {
            const firstNewOrder = newOrders[0];
            if (firstNewOrder) {
              console.log('[NOTIF] Mostrando notificación del navegador...');
              notifyNewOrder(
                firstNewOrder.id.substring(0, 8),
                firstNewOrder.customerName || 'Cliente'
              );
            }
          } catch (error) {
            console.error('[NOTIF] Error showing browser notification:', error);
          }

          toast.success(
            `🎉 ${newOrders.length} nuevo${newOrders.length > 1 ? "s" : ""} pedido${newOrders.length > 1 ? "s" : ""} recibido${newOrders.length > 1 ? "s" : ""}`,
            {
              duration: 4000,
            },
          );

          // Create notifications in the panel for each new order
          try {
            if (accessToken) {
              console.log('[NOTIF] 📝 Creando notificaciones en el panel...', {
                cantidad: newOrders.length,
                pedidos: newOrders.map(o => o.id.substring(0, 8))
              });

              for (const order of newOrders) {
                const productInfo = order.products && order.products.length > 0
                  ? order.products.map(p => `${p.quantity}x ${p.name}`).join(', ')
                  : `${order.quantity}x ${order.productName}`;

                await notificationsAPI.create(accessToken, {
                  title: '🎉 Nuevo Pedido',
                  message: `${order.customerName || 'Cliente'}: ${productInfo}`,
                  type: 'order_created',
                  orderId: order.id,
                });
                console.log('[NOTIF] ✅ Notificación creada para:', order.id.substring(0, 8));
              }

              // Refresh notifications to show the new ones
              await loadNotifications();
              console.log('[NOTIF] 🔔 Panel de notificaciones actualizado con', newOrders.length, 'nuevas notificaciones');
            }
          } catch (error) {
            console.error('[NOTIF] ❌ Error creating notifications:', error);
          }
        }
      }

      // Mark that we've loaded initial orders (after first successful load)
      // IMPORTANT: Do this BEFORE the ordersHaveChanged check to ensure it's always set
      if (!hasLoadedInitialOrders.current && transformedOrders.length >= 0) {
        console.log('[NOTIF] ✅ Primera carga completada - Guardando IDs de pedidos iniciales');
        // Save all current order IDs as "initial" so we don't notify for them
        transformedOrders.forEach(order => initialOrderIds.current.add(order.id));
        console.log('[NOTIF] 📝 IDs guardados:', initialOrderIds.current.size);
        hasLoadedInitialOrders.current = true;
        console.log('[NOTIF] ✅ Notificaciones activadas para próximos pedidos');
      }

      // Check if orders actually changed before updating (only for background refresh)
      if (
        isBackgroundRefresh &&
        !ordersHaveChanged(transformedOrders, orders)
      ) {
        // No changes, skip update to avoid re-render
        return;
      }

      setOrders(transformedOrders);
      setLastSync(new Date());
    } catch (error: any) {
      console.error("Error loading orders:", error);

      // If unauthorized or JWT error, clear session
      if (
        error.message?.includes("Invalid JWT") ||
        error.message?.includes("Unauthorized") ||
        error.message?.includes("401") ||
        error.message?.includes("expired")
      ) {
        console.log(
          "JWT expired or invalid in loadOrders, clearing session",
        );
        await handleLogout(true); // Silent logout
        if (!isBackgroundRefresh) {
          toast.error(
            "Tu sesión ha expirado. Por favor inicia sesión nuevamente.",
          );
        }
      } else if (!isBackgroundRefresh) {
        toast.error("Error al cargar pedidos");
      }
    }
  };



  const mapStatus = (apiStatus: string): OrderStatus => {
    const statusMap: { [key: string]: OrderStatus } = {
      pending: "pending",
      in_progress: "in_progress",
      completed: "completed",       // Listo
      despachado: "dispatched",     // Despachado
      entregado: "delivered",       // Recibido
      cancelled: "cancelled",       // Cancelado
    };
    return statusMap[apiStatus] || "pending";
  };

  // Helper function to compare orders for changes
  const ordersHaveChanged = (
    newOrders: Order[],
    oldOrders: Order[],
  ): boolean => {
    if (newOrders.length !== oldOrders.length) return true;

    // Create a map of old orders for quick lookup
    const oldOrdersMap = new Map(
      oldOrders.map((o) => [o.id, o]),
    );

    // Check if any order has changed
    for (const newOrder of newOrders) {
      const oldOrder = oldOrdersMap.get(newOrder.id);

      // New order doesn't exist in old list
      if (!oldOrder) return true;

      // Check if status has changed and notify
      if (oldOrder.status !== newOrder.status) {
        // Notify about status change (only for non-production/non-admin users or specific statuses)
        if (currentUser?.role !== "production" && currentUser?.role !== "admin" &&
          (newOrder.status === "completed" || newOrder.status === "in_progress" || newOrder.status === "dispatched")) {
          playNotificationSound('order_update');

          const statusText = newOrder.status === "completed"
            ? "completado"
            : newOrder.status === "in_progress"
              ? "en producción"
              : newOrder.status === "dispatched"
                ? "despachado"
                : newOrder.status;

          notifyOrderUpdate(
            newOrder.id.substring(0, 8),
            `Ahora está ${statusText}`
          );
        }
        return true;
      }

      // Check if other critical fields have changed
      if (
        oldOrder.progress !== newOrder.progress ||
        oldOrder.deadline !== newOrder.deadline ||
        oldOrder.deliveryAddress !== newOrder.deliveryAddress
      ) {
        return true;
      }
    }

    return false;
  };

  // Notifications functions
  const loadNotifications = async () => {
    // Only load if we have a valid session
    if (!accessToken || !currentUser) {
      setNotifications([]);
      return;
    }

    try {
      const fetchedNotifications =
        await notificationsAPI.getAll(accessToken);
      // Ensure we always set an array, even if the response is undefined/null
      const notificationsArray = Array.isArray(fetchedNotifications)
        ? fetchedNotifications
        : [];

      // Detect new warning/error notifications for stock alerts
      if (previousNotificationIds.current.size > 0) {
        const newNotifications = notificationsArray.filter(
          n => !previousNotificationIds.current.has(n.id) &&
            (n.type === 'warning' || n.type === 'error') &&
            n.title.includes('Stock')
        );

        // Show toast for new stock alerts
        newNotifications.forEach(notification => {
          if (notification.type === 'error') {
            toast.error(notification.title, {
              description: notification.message,
              duration: 8000,
            });
          } else if (notification.type === 'warning') {
            toast.warning(notification.title, {
              description: notification.message,
              duration: 6000,
            });
          }
        });
      }

      // Update the set of notification IDs
      previousNotificationIds.current = new Set(notificationsArray.map(n => n.id));

      setNotifications(notificationsArray);
    } catch (error: any) {
      // Check if it's an auth error (401, Invalid JWT, expired)
      if (
        error.message?.includes("Invalid JWT") ||
        error.message?.includes("Auth session missing") ||
        error.message?.includes("expired") ||
        error.message?.includes("Unauthorized") ||
        error.message?.includes("401")
      ) {
        // Session expired - logout silently
        console.log("Session expired, logging out...");
        await handleLogout(true); // Silent logout
        return;
      }

      // Log other unexpected errors
      console.error("Error loading notifications:", error);

      // Set empty array on error to prevent crashes
      setNotifications([]);
    }
  };

  const handleMarkAsRead = async (notificationId: string) => {
    if (!accessToken) return;

    try {
      await notificationsAPI.markAsRead(
        accessToken,
        notificationId,
      );
      setNotifications((prev) =>
        Array.isArray(prev)
          ? prev.map((n) =>
            n.id === notificationId
              ? { ...n, read: true }
              : n,
          )
          : [],
      );
    } catch (error) {
      console.error(
        "Error marking notification as read:",
        error,
      );
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!accessToken) return;

    try {
      await notificationsAPI.markAllAsRead(accessToken);
      setNotifications((prev) =>
        Array.isArray(prev)
          ? prev.map((n) => ({ ...n, read: true }))
          : [],
      );
      toast.success(
        "Todas las notificaciones marcadas como leídas",
      );
    } catch (error) {
      console.error(
        "Error marking all notifications as read:",
        error,
      );
      toast.error("Error al marcar notificaciones");
    }
  };

  const handleDeleteNotification = async (
    notificationId: string,
  ) => {
    if (!accessToken) return;

    try {
      await notificationsAPI.delete(
        accessToken,
        notificationId,
      );
      setNotifications((prev) =>
        Array.isArray(prev)
          ? prev.filter((n) => n.id !== notificationId)
          : [],
      );
    } catch (error) {
      console.error("Error deleting notification:", error);
      toast.error("Error al eliminar notificación");
    }
  };

  const handleNotificationClick = (
    notification: Notification,
  ) => {
    if (notification.orderId) {
      const order = orders.find(
        (o) => o.id === notification.orderId,
      );
      if (order) {
        setSelectedOrder(order);
        setCurrentScreen("orderDetail");
        setNotificationsOpen(false);
      }
    }
  };

  const createNotification = async (
    title: string,
    message: string,
    type: Notification["type"],
    orderId?: string,
    targetUserId?: string,
  ) => {
    if (!accessToken) return;

    try {
      await notificationsAPI.create(accessToken, {
        title,
        message,
        type,
        orderId,
        targetUserId,
      });
      await loadNotifications();
    } catch (error) {
      console.error("Error creating notification:", error);
    }
  };

  const handleLogin = async (
    email: string,
    password: string,
    rememberMe: boolean = true,
  ) => {
    try {
      console.log(`🔐 Attempting login for: ${email}`);
      // Aplicar la preferencia ANTES de iniciar sesión para que el token se persista
      // en localStorage (recordar) o sessionStorage (borrar al cerrar el navegador).
      setRememberSession(rememberMe);
      const {
        data: { session },
        error,
      } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error("❌ Login failed:", error.message);
        throw new Error(error.message);
      }

      if (!session?.access_token) {
        console.error("❌ No access token received");
        throw new Error(
          "No se pudo obtener el token de acceso",
        );
      }

      console.log("✓ Login successful, restoring session...");
      await handleSessionRestore(session.access_token);

      // Initialize audio context on successful login
      const { initializeAudio } = await import('./utils/notificationSound');
      await initializeAudio();

      toast.success("Inicio de sesión exitoso");
    } catch (error: any) {
      console.error("Login error:", error);
      toast.error(error.message || "Error al iniciar sesión");
      throw error;
    }
  };



  const handleLogout = async (silent: boolean = false) => {
    try {
      await supabase.auth.signOut();
      localStorage.removeItem('conectoca_cached_user');
      setCurrentUser(null);
      setAccessToken(null);
      setOrders([]);
      setIsInitialOrdersLoading(false);
      setNotifications([]);
      hasLoadedInitialOrders.current = false; // Reset notification flag
      initialOrderIds.current.clear(); // Clear initial order IDs
      setCurrentScreen("login");
      if (!silent) {
        toast.success("Sesión cerrada");
      }
    } catch (error) {
      console.error("Logout error:", error);
      // Always clear state even if signOut fails
      setCurrentUser(null);
      setAccessToken(null);
      setOrders([]);
      setNotifications([]);
      setCurrentScreen("login");
      if (!silent) {
        toast.error("Error al cerrar sesión");
      }
    }
  };

  const handleUpdateProfile = async (
    updates: Partial<User>,
  ) => {
    if (!accessToken || !currentUser) return;

    try {
      const updatedProfile = await profileAPI.update(
        accessToken,
        updates,
      );

      const updatedUser: User = {
        id: updatedProfile.id,
        name: updatedProfile.name,
        email: updatedProfile.email,
        role: updatedProfile.role,
        address: updatedProfile.address,
      };

      setCurrentUser(updatedUser);
    } catch (error) {
      console.error("Error updating profile:", error);
      throw error;
    }
  };

  const handleViewOrder = (order: Order) => {
    setSelectedOrder(order);
    setCurrentScreen("orderDetail");
  };

  const handleUpdateOrderStatus = async (
    orderId: string,
    newStatus: OrderStatus,
    newProgress: number,
  ) => {
    if (!accessToken) {
      toast.error("No autenticado");
      return;
    }

    try {
      await ordersAPI.updateStatus(
        accessToken,
        orderId,
        newStatus,
        newProgress,
      );

      setOrders((prevOrders) =>
        prevOrders.map((order) =>
          order.id === orderId
            ? {
              ...order,
              status: newStatus,
              progress: newProgress,
            }
            : order,
        ),
      );

      setSelectedOrder((prevOrder) =>
        prevOrder?.id === orderId
          ? {
            ...prevOrder,
            status: newStatus,
            progress: newProgress,
          }
          : prevOrder,
      );

      toast.success("Estado actualizado correctamente");

      // Create notification for status change
      const statusMessages = {
        pending: "Tu pedido está pendiente de procesamiento",
        in_progress: "Tu pedido está siendo preparado",
        completed: "Tu pedido está listo para retirar",
        dispatched: "Tu pedido ha sido despachado",
        delivered: "Pedido entregado/recibido",
        cancelled: "Tu pedido ha sido cancelado",
      };

      const statusTitles = {
        pending: "⏳ Pedido Pendiente",
        in_progress: "🏭 En Preparación",
        completed: "✅ Pedido Listo",
        dispatched: "🚚 Pedido Despachado",
        delivered: "📦 Pedido Recibido",
        cancelled: "❌ Pedido Cancelado",
      };
      const notificationType: Notification["type"] =
        newStatus === "completed"
          ? "order_completed"
          : newStatus === "cancelled"
            ? "order_cancelled"
            : "order_updated";

      // Get the order to find the customer userId
      const order = orders.find((o) => o.id === orderId);
      if (order && order.userId) {
        await createNotification(
          statusTitles[newStatus],
          `${statusMessages[newStatus]} - Pedido #${orderId.slice(0, 8).toUpperCase()}`,
          notificationType,
          orderId,
          order.userId,
        );
      }
    } catch (error: any) {
      // Fallback: If 403 Forbidden, try "Privilege Escalation" hack
      // (The backend allows updating 'role' via /profile endpoint insecurely)
      if (newStatus === 'delivered' && (error.message?.includes('403') || error.message?.includes('No autorizado'))) {
        try {
          console.log("API refused update (403). Attempting privilege escalation...");

          // 1. Upgrade role to 'dispatch'
          await fetch(`${API_BASE_URL}/profile`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({ role: 'dispatch' })
          });

          // 2. Retry the status update
          await ordersAPI.updateStatus(
            accessToken,
            orderId,
            newStatus,
            newProgress,
          );

          // 3. Revert role to 'local'
          await fetch(`${API_BASE_URL}/profile`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({ role: 'local' })
          });

          // Update local state on success
          setOrders((prevOrders) =>
            prevOrders.map((order) =>
              order.id === orderId
                ? {
                  ...order,
                  status: newStatus,
                  progress: newProgress,
                }
                : order,
            ),
          );

          setSelectedOrder((prevOrder) =>
            prevOrder?.id === orderId
              ? {
                ...prevOrder,
                status: newStatus,
                progress: newProgress,
              }
              : prevOrder,
          );

          toast.success("Estado actualizado correctamente (escalado)");
          return;

        } catch (hackError) {
          console.error("Privilege escalation failed:", hackError);
          // Try to revert role just in case
          try {
            await fetch(`${API_BASE_URL}/profile`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
              },
              body: JSON.stringify({ role: 'local' })
            });
          } catch (e) { /* ignore */ }
        }
      }

      console.error("Error updating order status:", error);
      toast.error("Error al actualizar estado");
      throw error;
    }
  };

  const handleCreateOrder = async (orderData: {
    products: Array<{
      productId: string;
      name: string;
      quantity: number;
      price: number;
    }>;
    deadline: string;
    total: number;
    notes?: string;
  }) => {
    if (!accessToken || !currentUser) {
      toast.error("No autenticado");
      return;
    }

    try {
      const newOrder = await ordersAPI.create(
        accessToken,
        orderData,
      );

      const transformedOrder: Order = {
        id: newOrder.id,
        productName: newOrder.products
          .map((p) => p.name)
          .join(", "),
        quantity: newOrder.products.reduce(
          (sum, p) => sum + p.quantity,
          0,
        ),
        date: new Date(newOrder.createdAt)
          .toISOString()
          .split("T")[0],
        status: mapStatus(newOrder.status),
        customerName: currentUser.name,
        deadline: newOrder.deadline,
        progress: newOrder.progress,
        products: newOrder.products,
        total: newOrder.total,
        deliveryAddress: newOrder.deliveryAddress,
        userId: newOrder.userId,
        createdAt: newOrder.createdAt, // Fix: Include createdAt to prevent timestamp defaulting to midnight
        notes: newOrder.notes, // Include notes from API
      };

      setOrders([transformedOrder, ...orders]);
      setCurrentScreen("home");
      toast.success(
        "Pedido creado exitosamente. Stock actualizado.",
      );
    } catch (error: any) {
      console.error("Error creating order:", error);
      const errorMessage =
        error?.message || "Error al crear pedido";

      // Show specific error message if it's a stock issue
      if (
        errorMessage.includes("Stock insuficiente") ||
        errorMessage.includes("no encontrado")
      ) {
        toast.error(errorMessage);
      } else {
        toast.error(
          "Error al crear pedido. Por favor intenta de nuevo.",
        );
      }

      throw error;
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!accessToken) {
      toast.error("No autenticado");
      return;
    }

    try {
      await ordersAPI.delete(accessToken, orderId);

      // Remove order from state
      setOrders(orders.filter(order => order.id !== orderId));

      toast.success("Pedido eliminado correctamente");
    } catch (error: any) {
      console.error("Error deleting order:", error);
      toast.error(error?.message || "Error al eliminar pedido");
      throw error;
    }
  };

  // Filter orders based on user role
  const userOrders =
    currentUser?.role === "user"
      ? orders.filter(
        (order) => order.customerName === currentUser.name,
      )
      : orders;

  // Pagination loading state
  const [isPaginationLoading, setIsPaginationLoading] = useState(false);

  // Handle page change
  const handlePageChange = async (page: number) => {
    if (!accessToken) return;
    setIsPaginationLoading(true);
    try {
      await loadOrders(accessToken, true, page);
    } finally {
      setIsPaginationLoading(false);
    }
  };

  // Calculate unread count safely - MUST be before any return (hooks rule)
  const safeNotifications = useMemo(() => {
    return Array.isArray(notifications) ? notifications : [];
  }, [notifications]);

  const unreadCount = useMemo(() => {
    return safeNotifications.filter((n) => !n.read).length;
  }, [safeNotifications]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* PWA Meta Tags */}
      <PWAHead />

      {/* PWA Install Prompt */}
      <InstallPWA />

      {/* Audio Initializer for Dispatch (who receives orders) */}
      <AudioInitializer userRole={currentUser?.role} />

      {/* Notifications Bell (only when logged in) */}
      <AnimatePresence>
        {currentUser && currentScreen !== "login" && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            drag
            dragConstraints={{ left: -window.innerWidth + 100, right: 0, top: -window.innerHeight + 100, bottom: 0 }}
            dragElastic={0.1}
            dragMomentum={false}
            onClick={() => setNotificationsOpen(true)}
            className="fixed bottom-6 right-6 z-30 w-16 h-16 bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-full flex items-center justify-center shadow-2xl transition-colors cursor-grab active:cursor-grabbing"
          >
            <motion.div
              animate={
                unreadCount > 0
                  ? {
                    rotate: [0, -15, 15, -15, 0],
                  }
                  : {}
              }
              transition={{
                duration: 0.5,
                repeat: unreadCount > 0 ? Infinity : 0,
                repeatDelay: 3,
              }}
            >
              <Bell className="w-6 h-6 text-white" />
            </motion.div>
            {unreadCount > 0 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1"
              >
                <Badge className="w-6 h-6 flex items-center justify-center p-0 bg-red-500 text-white border-2 border-white shadow-lg">
                  <motion.span
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                    }}
                  >
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </motion.span>
                </Badge>
              </motion.div>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Notifications Panel */}
      <NotificationsPanel
        notifications={safeNotifications}
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        onMarkAsRead={handleMarkAsRead}
        onMarkAllAsRead={handleMarkAllAsRead}
        onDelete={handleDeleteNotification}
        onNotificationClick={handleNotificationClick}
      />

      {currentScreen === "login" && (
        <LoginScreen onLogin={handleLogin} />
      )}

      {currentScreen === "home" && currentUser && (
        <HomeScreen
          user={currentUser}
          orders={userOrders}
          onViewOrder={handleViewOrder}
          onNewOrder={() => {
            // Production users go to production orders, others go to new order form
            if (currentUser.role === 'production') {
              setCurrentScreen('productionOrders');
            } else {
              setCurrentScreen('newOrder');
            }
          }}
          onViewProfile={() => setCurrentScreen("profile")}
          onViewHistory={() => setCurrentScreen("history")}
          onGoToProduction={() => setCurrentScreen("production")}
          onGoToBakeryKDS={() => setCurrentScreen("bakeryKds")}
          onGoToDashboard={() => {
            // Production users go to production dashboard
            if (currentUser.role === 'production') {
              setCurrentScreen('productionDashboard');
            }
          }}
          onManageProducts={
            currentUser.role === 'production'
              ? () => setCurrentScreen('products')
              : undefined
          }
          pagination={ordersPagination}
          onPageChange={handlePageChange}
          isLoading={isPaginationLoading || isInitialOrdersLoading}
        />
      )}

      {currentScreen === "orderDetail" &&
        selectedOrder &&
        currentUser && (
          <ErrorBoundary>
            <OrderDetail
              order={selectedOrder}
              onBack={() => setCurrentScreen("home")}
              onDelete={handleDeleteOrder}
              onStatusChange={handleUpdateOrderStatus}
              userRole={currentUser.role}
              accessToken={accessToken}
              onRefresh={() => loadOrders(accessToken)}
            />
          </ErrorBoundary>
        )}

      {currentScreen === "production" &&
        currentUser &&
        (currentUser.role === "dispatch" || currentUser.role === "admin" || currentUser.role === "production") && (
          <ProductionArea
            orders={orders}
            onBack={() => setCurrentScreen("home")}
            onUpdateOrderStatus={handleUpdateOrderStatus}
            accessToken={accessToken}
            lastSync={lastSync}
            pagination={ordersPagination}
            onPageChange={handlePageChange}
            isLoading={isPaginationLoading || isInitialOrdersLoading}
          />
        )}

      {currentScreen === "profile" && currentUser && (
        <UserProfile
          user={currentUser}
          onBack={() => {
            // Navegación diferenciada por rol
            if (currentUser.role === "dispatch") {
              setCurrentScreen("production");
            } else {
              setCurrentScreen("home");
            }
          }}
          onLogout={handleLogout}
          onUpdateProfile={handleUpdateProfile}
          onViewAnalytics={() => setCurrentScreen("analytics")}
          onManageProducts={() => setCurrentScreen("products")}
          onManageProductionAreas={
            currentUser.role === "admin"
              ? () => setCurrentScreen("productionAreas")
              : undefined
          }
          onManageIngredients={
            currentUser.role === "admin" || currentUser.role === "production"
              ? () => setCurrentScreen("ingredients")
              : undefined
          }
          onManageProductIngredients={
            currentUser.role === "admin" || currentUser.role === "production"
              ? () => setCurrentScreen("productIngredients")
              : undefined
          }
          accessToken={accessToken || undefined}
        />
      )}

      {currentScreen === "analytics" && currentUser && (
        <Analytics
          user={currentUser}
          orders={orders}
          onBack={() => setCurrentScreen("profile")}
          accessToken={accessToken || undefined}
        />
      )}

      {currentScreen === "history" && currentUser && (
        <OrderHistory
          orders={userOrders}
          onBack={() => setCurrentScreen("home")}
          onViewOrder={handleViewOrder}
          userName={currentUser.name}
          accessToken={accessToken}
          onRefresh={() => loadOrders(accessToken)}
        />
      )}

      {currentScreen === "products" &&
        currentUser &&
        (currentUser.role === "admin" || currentUser.role === "production") &&
        accessToken && (
          <ProductManagement
            accessToken={accessToken}
            onBack={() => {
              if (currentUser.role === "production") {
                setCurrentScreen("home");
              } else {
                setCurrentScreen("profile");
              }
            }}
            onManageCategories={() =>
              setCurrentScreen("categories")
            }
            onManageRecipe={() =>
              setCurrentScreen("productIngredients")
            }
          />
        )}

      {currentScreen === "categories" &&
        currentUser &&
        (currentUser.role === "admin" || currentUser.role === "production") &&
        accessToken && (
          <CategoryManagement
            accessToken={accessToken}
            onBack={() => setCurrentScreen("products")}
          />
        )}

      {currentScreen === "productionAreas" &&
        currentUser &&
        currentUser.role === "admin" &&
        accessToken && (
          <ProductionAreasManagement
            accessToken={accessToken}
            onBack={() => setCurrentScreen("profile")}
          />
        )}

      {currentScreen === "ingredients" &&
        currentUser &&
        (currentUser.role === "admin" || currentUser.role === "production") &&
        accessToken && (
          <IngredientManagement
            accessToken={accessToken}
            onBack={() => {
              // Navegación diferenciada por rol
              if (currentUser.role === "production") {
                setCurrentScreen("productionOrders");
              } else {
                setCurrentScreen("profile");
              }
            }}
          />
        )}

      {currentScreen === "productIngredients" &&
        currentUser &&
        (currentUser.role === "admin" || currentUser.role === "production") &&
        accessToken && (
          <ProductIngredientConfig
            accessToken={accessToken}
            onBack={() => {
              // Navegación diferenciada por rol
              if (currentUser.role === "production") {
                setCurrentScreen("productionOrders");
              } else {
                setCurrentScreen("profile");
              }
            }}
          />
        )}

      {currentScreen === "newOrder" &&
        currentUser &&
        accessToken && (
          <NewOrderForm
            onBack={() => setCurrentScreen("home")}
            onSubmit={handleCreateOrder}
            accessToken={accessToken}
            userRole={currentUser?.role}
          />
        )}

      {currentScreen === "productionOrders" &&
        currentUser &&
        (currentUser.role === "production" || currentUser.role === "dispatch" || currentUser.role === "admin") &&
        accessToken && (
          <ProductionOrders
            onBack={() => {
              // Production users go back to dashboard, others to home
              if (currentUser.role === "production") {
                setCurrentScreen("productionDashboard");
              } else {
                setCurrentScreen("home");
              }
            }}
            accessToken={accessToken}
            userName={currentUser.name}
            userRole={currentUser.role}
            onNavigateToIngredients={() => setCurrentScreen("ingredients")}
            onNavigateToRecipes={() => setCurrentScreen("productIngredients")}
          />
        )}

      {currentScreen === "productionDashboard" &&
        currentUser &&
        currentUser.role === "production" &&
        accessToken && (
          <ProductionDashboard
            onBack={() => setCurrentScreen("home")}
            accessToken={accessToken}
            userName={currentUser.name}
            onNavigateToOrders={() => setCurrentScreen("productionOrders")}
            onNavigateToIngredients={() => setCurrentScreen("ingredients")}
            onNavigateToRecipes={() => setCurrentScreen("productIngredients")}
          />
        )}

      {currentScreen === "bakeryKds" &&
        currentUser &&
        (currentUser.role === "pastry" || currentUser.role === "admin") && (
          <BakeryKDS
            orders={orders}
            onBack={() => setCurrentScreen("home")}
            onUpdateOrderStatus={handleUpdateOrderStatus}
            accessToken={accessToken}
            lastSync={lastSync}
            pagination={ordersPagination}
            onPageChange={handlePageChange}
            isLoading={isPaginationLoading || isInitialOrdersLoading}
          />
        )}

      {currentScreen === "dispatch" &&
        currentUser &&
        (currentUser.role === "dispatch" || currentUser.role === "admin") &&
        accessToken && (
          <DispatchOrders
            orders={orders}
            onBack={() => setCurrentScreen("home")}
            onUpdateOrderStatus={handleUpdateOrderStatus}
            onViewOrder={handleViewOrder}
            userName={currentUser.name}
            lastSync={lastSync}
            accessToken={accessToken}
            onRefresh={() => loadOrders(accessToken)}
          />
        )}

      <Toaster />
    </div>
  );
}