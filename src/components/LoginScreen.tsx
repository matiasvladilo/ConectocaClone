import React, { useState, useMemo } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { Shield, UserIcon as UserCircle, KeyRound, ArrowLeft, Mail, Lock, Sparkles } from 'lucide-react';
import logo from '../assets/logo-icon.png';
import { toast } from 'sonner';
import { authAPI } from '../utils/api';
import { motion } from 'motion/react';

interface LoginScreenProps {
  onLogin: (email: string, password: string) => Promise<void>;
}

// Frases motivacionales con emojis (30 frases únicas)
const motivationalPhrases = [
  { emoji: '☀️', text: 'Hoy puede ser un gran día si tú decides que así sea.' },
  { emoji: '🌿', text: 'Empieza despacio, pero empieza.' },
  { emoji: '☕', text: 'Un buen café y la mejor actitud: la jornada ya está ganada.' },
  { emoji: '🥑', text: 'Sigue, aunque sea a paso de palta madura, pero sigue.' },
  { emoji: '💛', text: 'Hazlo con alegría, que el trabajo también puede brillar.' },
  { emoji: '🌈', text: 'El día se ve mejor cuando tú decides mirarlo bonito.' },
  { emoji: '😊', text: 'La sonrisa es la mejor herramienta de gestión.' },
  { emoji: '✨', text: 'Hoy gestionamos sueños, no solo tareas.' },
  { emoji: '⚙️', text: 'Tu buena vibra es parte del proceso productivo.' },
  { emoji: '🌟', text: 'Cada día es una nueva oportunidad de sorprenderte.' },
  { emoji: '🎯', text: 'Cada pedido es una oportunidad para brillar.' },
  { emoji: '🚀', text: 'Despega con energía, aterriza con resultados.' },
  { emoji: '💪', text: 'Tu esfuerzo de hoy es el éxito de mañana.' },
  { emoji: '🎨', text: 'Crea con pasión, entrega con orgullo.' },
  { emoji: '🌺', text: 'Florece donde estés plantado.' },
  { emoji: '🔥', text: 'Enciende tu motivación, ilumina tu día.' },
  { emoji: '🎵', text: 'Trabaja con ritmo, vive con armonía.' },
  { emoji: '🌸', text: 'Pequeños pasos también hacen grandes caminos.' },
  { emoji: '⭐', text: 'Brilla con luz propia, no con la de otros.' },
  { emoji: '🎪', text: 'La vida es mejor cuando trabajas con alegría.' },
  { emoji: '🌻', text: 'Gira siempre hacia el sol, como un girasol.' },
  { emoji: '🦋', text: 'Las mejores transformaciones empiezan hoy.' },
  { emoji: '🎁', text: 'Cada día es un regalo, ábrelo con ilusión.' },
  { emoji: '🌙', text: 'Incluso en la oscuridad, siempre hay luz.' },
  { emoji: '🍀', text: 'La suerte favorece a quienes trabajan con constancia.' },
  { emoji: '🎈', text: 'Mantente elevado, mantén tu espíritu arriba.' },
  { emoji: '🌊', text: 'Fluye con los cambios, adapta y prospera.' },
  { emoji: '🏔️', text: 'La cima se ve mejor desde la base.' },
  { emoji: '🎭', text: 'Elige ser protagonista de tu propia historia.' },
  { emoji: '🌱', text: 'Lo que siembras hoy, lo cosechas mañana.' }
];

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'local' | 'admin' | 'production' | 'dispatch' | 'worker' | 'pastry' | 'user'>('user');
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPasswordRecovery, setShowPasswordRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [rememberMe, setRememberMe] = useState(true); // Remember session by default

  // Business fields
  const [businessAction, setBusinessAction] = useState<'create' | 'join'>('create');
  const [businessName, setBusinessName] = useState('');
  const [businessCode, setBusinessCode] = useState('');

  // Seleccionar una frase aleatoria al cargar (solo una vez, sin rotación automática)
  const currentPhrase = useMemo(() => {
    const randomIndex = Math.floor(Math.random() * motivationalPhrases.length);
    return motivationalPhrases[randomIndex];
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      toast.error('Por favor completa todos los campos');
      return;
    }

    if (isCreatingAccount && !name) {
      toast.error('Por favor ingresa tu nombre');
      return;
    }

    if (isCreatingAccount && businessAction === 'create' && (!businessName || businessName.trim().length < 3)) {
      toast.error('El nombre del negocio debe tener al menos 3 caracteres');
      return;
    }

    if (isCreatingAccount && businessAction === 'join' && (!businessCode || businessCode.trim().length === 0)) {
      toast.error('Debes ingresar un código de invitación');
      return;
    }

    setIsLoading(true);

    try {
      if (isCreatingAccount) {
        // Sign up
        await authAPI.signup(
          email,
          password,
          name,
          role,
          businessAction,
          businessAction === 'create' ? businessName : undefined,
          businessAction === 'join' ? businessCode : undefined
        );

        if (businessAction === 'create') {
          toast.success(`¡Negocio "${businessName}" creado exitosamente! Iniciando sesión...`);
        } else {
          toast.success('¡Te has unido al negocio exitosamente! Iniciando sesión...');
        }

        // Automatically log in after signup
        await onLogin(email, password);
      } else {
        // Login
        await onLogin(email, password);
      }
    } catch (error: any) {
      console.error('Auth error:', error);

      // Provide more helpful error messages
      let errorMessage = 'Error en la autenticación';
      if (error.message?.includes('Invalid login credentials')) {
        errorMessage = isCreatingAccount
          ? 'Error al crear la cuenta. Por favor intenta de nuevo.'
          : 'Credenciales incorrectas. Verifica tu email y contraseña o usa las credenciales de demo.';
      } else if (error.message?.includes('already registered') || error.message?.includes('ya está registrado')) {
        errorMessage = 'Este email ya está registrado. Por favor inicia sesión.';
        setIsCreatingAccount(false);
      } else {
        errorMessage = error.message || errorMessage;
      }

      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleMode = () => {
    setIsCreatingAccount(!isCreatingAccount);
    setPassword('');
    setName('');
  };

  const handlePasswordRecovery = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!recoveryEmail) {
      toast.error('Por favor ingresa tu correo electrónico');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recoveryEmail)) {
      toast.error('Por favor ingresa un correo electrónico válido');
      return;
    }

    setIsLoading(true);

    try {
      const response = await authAPI.resetPassword(recoveryEmail);

      if (response.success) {
        toast.success(response.message || 'Se ha enviado un enlace de recuperación a tu correo');
        setRecoveryEmail('');

        // Wait a bit before returning to login
        setTimeout(() => {
          setShowPasswordRecovery(false);
        }, 1500);
      } else {
        toast.error('Error al enviar el enlace de recuperación');
      }
    } catch (error: any) {
      console.error('Password recovery error:', error);

      // Show generic success message for security (don't reveal if email exists)
      toast.success('Si el correo existe en nuestro sistema, recibirás un enlace de recuperación');
      setRecoveryEmail('');

      setTimeout(() => {
        setShowPasswordRecovery(false);
      }, 1500);
    } finally {
      setIsLoading(false);
    }
  };

  // Password Recovery View
  if (showPasswordRecovery) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-3 sm:p-4 md:p-6 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #0047BA 0%, #0078FF 100%)'
        }}
      >
        {/* Decorative elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            className="absolute -top-24 -right-24 w-64 h-64 sm:w-96 sm:h-96 bg-white/5 rounded-full blur-3xl"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.5, 0.3]
            }}
            transition={{ duration: 8, repeat: Infinity }}
          />
          <motion.div
            className="absolute -bottom-24 -left-24 w-64 h-64 sm:w-96 sm:h-96 bg-yellow-400/10 rounded-full blur-3xl"
            animate={{
              scale: [1.2, 1, 1.2],
              opacity: [0.2, 0.4, 0.2]
            }}
            transition={{ duration: 10, repeat: Infinity }}
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-md relative z-10"
        >
          <Card
            className="w-full shadow-2xl border border-[#E0EDFF] backdrop-blur-sm"
            style={{
              borderRadius: '16px',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.2)'
            }}
          >
            <CardHeader className="text-center space-y-3 sm:space-y-4 pb-4 sm:pb-6 pt-6 sm:pt-8 px-4 sm:px-6">
              <motion.div
                className="flex flex-col items-center justify-center gap-3 sm:gap-4"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.3 }}
              >
                <div
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center relative"
                  style={{
                    background: 'linear-gradient(135deg, #0059FF 0%, #0047BA 100%)',
                    boxShadow: '0 8px 24px rgba(0, 89, 255, 0.3)'
                  }}
                >
                  <KeyRound className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                  <div className="absolute inset-0 rounded-full bg-white/20 animate-pulse" />
                </div>
                <div className="space-y-2">
                  <CardTitle className="text-[#0047BA] text-2xl sm:text-[28px]" style={{ fontWeight: 600 }}>
                    Recuperar Acceso
                  </CardTitle>
                  <CardDescription className="text-[#4B5563] text-sm sm:text-[15px] px-2">
                    Ingresa tu correo para recibir un enlace de recuperación
                  </CardDescription>
                </div>
              </motion.div>
            </CardHeader>

            <CardContent className="px-4 sm:px-8 pb-6 sm:pb-8">
              <form onSubmit={handlePasswordRecovery} className="space-y-4 sm:space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="recovery-email" className="flex items-center gap-2 text-[#0047BA] text-sm" style={{ fontWeight: 500 }}>
                    <Mail className="w-4 h-4" />
                    Correo electrónico
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                    <Input
                      id="recovery-email"
                      type="email"
                      placeholder="tu@email.com"
                      value={recoveryEmail}
                      onChange={(e) => setRecoveryEmail(e.target.value)}
                      required
                      className="pl-10 sm:pl-11 h-11 sm:h-12 bg-white border-[#CBD5E1] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 transition-all text-sm sm:text-base"
                      style={{ borderRadius: '10px' }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5">
                    Te enviaremos un enlace seguro para restablecer tu contraseña
                  </p>
                </div>

                <motion.div whileTap={{ scale: 0.98 }}>
                  <Button
                    type="submit"
                    className="w-full h-11 sm:h-12 text-white relative overflow-hidden group text-sm sm:text-[15px]"
                    disabled={isLoading}
                    style={{
                      background: 'linear-gradient(90deg, #0059FF 0%, #004BCE 100%)',
                      borderRadius: '9999px',
                      boxShadow: '0 4px 14px rgba(0, 89, 255, 0.4)',
                      fontWeight: 600
                    }}
                  >
                    <span className="relative z-10">
                      {isLoading ? 'Enviando...' : 'Enviar enlace de recuperación'}
                    </span>
                    <div className="absolute inset-0 bg-gradient-to-r from-[#006DFF] to-[#0059FF] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Button>
                </motion.div>
              </form>

              {/* Info box */}
              <div className="mt-4 sm:mt-5 p-3 sm:p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200/50">
                <p className="text-xs text-blue-900">
                  💡 <strong>Nota:</strong> El enlace de recuperación será válido por 1 hora.
                  Revisa tu bandeja de spam si no ves el correo en unos minutos.
                </p>
              </div>

              <div className="mt-5 sm:mt-6 text-center">
                <motion.button
                  onClick={() => setShowPasswordRecovery(false)}
                  className="flex items-center gap-2 text-[#2563EB] hover:text-[#0047BA] mx-auto group transition-colors text-sm"
                  disabled={isLoading}
                  type="button"
                  whileHover={{ x: -4 }}
                  transition={{ duration: 0.2 }}
                  style={{ fontWeight: 500 }}
                >
                  <ArrowLeft className="w-4 h-4 group-hover:animate-pulse" />
                  <span className="underline">Volver al inicio de sesión</span>
                </motion.button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // Main Login View
  return (
    <div
      className="min-h-screen flex items-center justify-center p-3 sm:p-4 md:p-6 relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #0047BA 0%, #0078FF 100%)'
      }}
    >
      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute -top-24 -right-24 w-64 h-64 sm:w-96 sm:h-96 bg-white/5 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3]
          }}
          transition={{ duration: 8, repeat: Infinity }}
        />
        <motion.div
          className="absolute -bottom-24 -left-24 w-64 h-64 sm:w-96 sm:h-96 bg-yellow-400/10 rounded-full blur-3xl"
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.2, 0.4, 0.2]
          }}
          transition={{ duration: 10, repeat: Infinity }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md relative z-10"
      >
        <Card
          className="w-full shadow-2xl border border-[#E0EDFF] backdrop-blur-sm"
          style={{
            borderRadius: '16px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.2)'
          }}
        >
          <CardHeader className="text-center space-y-4 pb-6 pt-8">
            <motion.div
              className="flex flex-col items-center justify-center gap-4"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.3 }}
            >
              {/* Logo */}
              <motion.div
                className="relative rounded-full flex items-center justify-center shadow-lg"
                style={{ width: '7rem', height: '7rem', backgroundColor: '#0c3c84' }}
                whileHover={{ scale: 1.05 }}
                transition={{ duration: 0.2 }}
              >
                <img
                  src={logo}
                  alt="La Oca Logo"
                  className="object-contain relative z-10"
                  style={{ width: '5rem', height: '5rem', imageRendering: 'crisp-edges' }}
                />
              </motion.div>

              {/* Title with accent */}
              <div className="space-y-2 relative">
                <div className="absolute -top-2 -right-8">
                  <Sparkles className="w-5 h-5 text-[#FFD43B]" />
                </div>
                <CardTitle
                  className="text-[#0047BA] tracking-tight"
                  style={{ fontSize: '32px', fontWeight: 600 }}
                >
                  CONECTOCA
                </CardTitle>
                <div className="h-1 w-24 mx-auto rounded-full bg-gradient-to-r from-[#0059FF] to-[#FFD43B]" />
                <CardDescription
                  className="text-[#4B5563] mt-3"
                  style={{ fontSize: '15px' }}
                >
                  {isCreatingAccount ? 'Crea tu cuenta' : 'Conecta con tu centro de fabricación'}
                </CardDescription>
              </div>
            </motion.div>
          </CardHeader>

          <CardContent className="px-8 pb-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              {isCreatingAccount && (
                <>
                  <motion.div
                    className="space-y-2"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    transition={{ duration: 0.3 }}
                  >
                    <Label htmlFor="name" className="flex items-center gap-2 text-[#0047BA]" style={{ fontSize: '14px', fontWeight: 500 }}>
                      <UserCircle className="w-4 h-4" />
                      Nombre completo
                    </Label>
                    <div className="relative">
                      <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <Input
                        id="name"
                        type="text"
                        placeholder="Juan Pérez"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        className="pl-11 h-12 bg-white border-[#CBD5E1] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 transition-all"
                        style={{ borderRadius: '10px' }}
                      />
                    </div>
                  </motion.div>

                  {/* Role Selector - Only show when joining a business */}
                  {businessAction === 'join' && (
                    <motion.div
                      className="space-y-2"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      transition={{ duration: 0.3, delay: 0.1 }}
                    >
                      <Label htmlFor="role" className="flex items-center gap-2 text-[#0047BA]" style={{ fontSize: '14px', fontWeight: 500 }}>
                        <Shield className="w-4 h-4" />
                        Rol
                      </Label>
                      <Select value={role} onValueChange={(value: 'local' | 'admin' | 'production' | 'dispatch' | 'worker' | 'pastry' | 'user') => setRole(value)}>
                        <SelectTrigger
                          className="h-12 bg-white border-[#CBD5E1] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                          style={{ borderRadius: '10px' }}
                        >
                          <SelectValue placeholder="Selecciona tu rol" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-gray-500"></div>
                              <span>Usuario</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="local">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-green-500"></div>
                              <span>Local</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="worker">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                              <span>Trabajador</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="admin">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                              <span>Administrador</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="production">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                              <span>Producción</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="dispatch">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-red-500"></div>
                              <span>Despacho</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="pastry">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-pink-500"></div>
                              <span>Pastelería</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-500 mt-1.5">
                        {role === 'user' && '👤 Acceso básico a pedidos y perfil'}
                        {role === 'local' && '🏪 Acceso a realizar y ver pedidos'}
                        {role === 'worker' && '👷 Acceso al módulo de asistencia de personal'}
                        {role === 'admin' && '👑 Acceso completo al sistema'}
                        {role === 'production' && '🏭 Acceso al área de producción y gestión de pedidos'}
                        {role === 'dispatch' && '🚚 Acceso al módulo de despacho'}
                        {role === 'pastry' && '🍰 Acceso al KDS de pastelería'}
                      </p>
                    </motion.div>
                  )}

                  {/* Business Selection */}
                  <motion.div
                    className="space-y-2"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    transition={{ duration: 0.3, delay: 0.15 }}
                  >
                    <Label className="flex items-center gap-2 text-[#0047BA]" style={{ fontSize: '14px', fontWeight: 500 }}>
                      <Sparkles className="w-4 h-4" />
                      Negocio
                    </Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        onClick={() => setBusinessAction('create')}
                        className={`flex-1 h-12 transition-all ${businessAction === 'create'
                          ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg'
                          : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                          }`}
                        style={{ borderRadius: '10px' }}
                      >
                        <span className="relative z-10">Crear Nuevo</span>
                      </Button>
                      <Button
                        type="button"
                        onClick={() => setBusinessAction('join')}
                        className={`flex-1 h-12 transition-all ${businessAction === 'join'
                          ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg'
                          : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                          }`}
                        style={{ borderRadius: '10px' }}
                      >
                        <span className="relative z-10">Unirme a Uno</span>
                      </Button>
                    </div>
                  </motion.div>

                  {/* Business Name (if creating) */}
                  {businessAction === 'create' && (
                    <motion.div
                      className="space-y-2"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      transition={{ duration: 0.3 }}
                    >
                      <Label htmlFor="businessName" className="flex items-center gap-2 text-[#0047BA]" style={{ fontSize: '14px', fontWeight: 500 }}>
                        <Sparkles className="w-4 h-4" />
                        Nombre del Negocio
                      </Label>
                      <Input
                        id="businessName"
                        type="text"
                        placeholder="Ej: Panadería La Oca"
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        required
                        minLength={3}
                        className="h-12 bg-white border-[#CBD5E1] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 transition-all"
                        style={{ borderRadius: '10px' }}
                      />
                      <div className="mt-3 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200/50">
                        <p className="text-xs text-blue-900">
                          👑 <strong>Serás el Administrador:</strong> Al crear un negocio nuevo, automáticamente obtendrás acceso completo con rol de administrador.
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {/* Business Code (if joining) */}
                  {businessAction === 'join' && (
                    <motion.div
                      className="space-y-2"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      transition={{ duration: 0.3 }}
                    >
                      <Label htmlFor="businessCode" className="flex items-center gap-2 text-[#0047BA]" style={{ fontSize: '14px', fontWeight: 500 }}>
                        <KeyRound className="w-4 h-4" />
                        Código de Invitación
                      </Label>
                      <Input
                        id="businessCode"
                        type="text"
                        placeholder="Ej: ABC123XY"
                        value={businessCode}
                        onChange={(e) => setBusinessCode(e.target.value.toUpperCase())}
                        required
                        className="h-12 bg-white border-[#CBD5E1] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 transition-all uppercase"
                        style={{ borderRadius: '10px' }}
                      />
                      <p className="text-xs text-gray-500 mt-1.5">
                        🔑 Solicita el código al administrador de tu negocio
                      </p>
                    </motion.div>
                  )}
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2 text-[#0047BA]" style={{ fontSize: '14px', fontWeight: 500 }}>
                  <Mail className="w-4 h-4" />
                  Correo electrónico
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="pl-11 h-12 bg-white border-[#CBD5E1] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 transition-all"
                    style={{ borderRadius: '10px' }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="flex items-center gap-2 text-[#0047BA]" style={{ fontSize: '14px', fontWeight: 500 }}>
                  <Lock className="w-4 h-4" />
                  Contraseña
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="pl-11 h-12 bg-white border-[#CBD5E1] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 transition-all"
                    style={{ borderRadius: '10px' }}
                  />
                </div>
                {isCreatingAccount && (
                  <p className="text-xs text-gray-500 mt-1.5">Mínimo 6 caracteres</p>
                )}
                {!isCreatingAccount && (
                  <div className="flex justify-end pt-1">
                    <motion.button
                      type="button"
                      onClick={() => setShowPasswordRecovery(true)}
                      className="text-xs text-[#2563EB] hover:text-[#0047BA] flex items-center gap-1.5 group transition-colors"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      style={{ fontSize: '13px', fontWeight: 500 }}
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span className="relative">
                        ¿Olvidaste tu contraseña?
                        <span className="absolute bottom-0 left-0 w-0 h-px bg-[#2563EB] group-hover:w-full transition-all duration-300"></span>
                      </span>
                    </motion.button>
                  </div>
                )}
              </div>

              {/* Remember Me Checkbox - Only show when logging in */}
              {!isCreatingAccount && (
                <motion.div
                  className="flex items-center gap-2 p-3 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/50"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <Checkbox
                    id="remember-me"
                    checked={rememberMe}
                    onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                    className="border-blue-400 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                  />
                  <label
                    htmlFor="remember-me"
                    className="text-sm text-blue-900 cursor-pointer select-none flex-1"
                    style={{ fontWeight: 500 }}
                  >
                    🔒 Mantener mi sesión iniciada
                  </label>
                  <motion.div
                    className="text-xs text-blue-700 bg-white/60 px-2 py-1 rounded-full"
                    whileHover={{ scale: 1.05 }}
                    title="Tu sesión permanecerá activa incluso después de cerrar el navegador"
                  >
                    ⓘ
                  </motion.div>
                </motion.div>
              )}

              <motion.div
                whileTap={{ scale: 0.98 }}
                className="pt-2"
              >
                <Button
                  type="submit"
                  className="w-full h-12 text-white relative overflow-hidden group"
                  disabled={isLoading}
                  style={{
                    background: 'linear-gradient(90deg, #0059FF 0%, #004BCE 100%)',
                    borderRadius: '9999px',
                    boxShadow: '0 4px 14px rgba(0, 89, 255, 0.4)',
                    fontSize: '15px',
                    fontWeight: 600
                  }}
                >
                  <span className="relative z-10">
                    {isLoading ? 'Procesando...' : (isCreatingAccount ? 'Crear cuenta' : 'Iniciar sesión')}
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-[#006DFF] to-[#0059FF] opacity-0 group-hover:opacity-100 transition-opacity" />
                  {isLoading && (
                    <motion.div
                      className="absolute inset-0 bg-white/20"
                      animate={{ x: ['-100%', '100%'] }}
                      transition={{ duration: 1, repeat: Infinity }}
                    />
                  )}
                </Button>
              </motion.div>
            </form>

            <div className="mt-6 text-center">
              <motion.button
                onClick={handleToggleMode}
                className="text-[#2563EB] hover:text-[#0047BA] relative group transition-colors"
                disabled={isLoading}
                type="button"
                whileHover={{ scale: 1.02 }}
                style={{ fontSize: '14px', fontWeight: 500 }}
              >
                <span className="relative">
                  {isCreatingAccount ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Crear una'}
                  <span className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[#2563EB] to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></span>
                </span>
              </motion.button>
            </div>

            {/* Frase motivacional - Modo Crear Cuenta */}
            {isCreatingAccount && (
              <motion.div
                className="mt-6"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.3 }}
              >
                <div className="flex items-center justify-center px-4">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.3 }}
                    className="text-center"
                  >
                    <p
                      className="flex items-center justify-center gap-2"
                      style={{
                        fontSize: '15px',
                        fontWeight: 400,
                        color: '#4B5563',
                        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
                        lineHeight: '1.5'
                      }}
                    >
                      <span className="text-xl">{currentPhrase.emoji}</span>
                      <span>{currentPhrase.text}</span>
                    </p>
                  </motion.div>
                </div>
              </motion.div>
            )}

            {!isCreatingAccount && (
              <motion.div
                className="mt-6"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.3 }}
              >
                {/* Frase motivacional */}
                <div className="flex items-center justify-center px-4">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.3 }}
                    className="text-center"
                  >
                    <p
                      className="flex items-center justify-center gap-2"
                      style={{
                        fontSize: '15px',
                        fontWeight: 400,
                        color: '#4B5563',
                        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
                        lineHeight: '1.5'
                      }}
                    >
                      <span className="text-xl">{currentPhrase.emoji}</span>
                      <span>{currentPhrase.text}</span>
                    </p>
                  </motion.div>
                </div>
              </motion.div>
            )}
          </CardContent>
        </Card>

      </motion.div>
    </div>
  );
}