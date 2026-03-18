import React from 'react';
import { createPortal } from 'react-dom';
import { Order } from '../App';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { formatCLP } from '../utils/format';
import {
  Printer,
  Package,
  User,
  Calendar,
  CheckCircle2,
  X,
  Building2,
  Phone
} from 'lucide-react';
import { useState, useRef } from 'react';
import { toast } from 'sonner';

export interface StandardDeliveryGuideProps {
  order: Order;
  open: boolean;
  onClose: () => void;
  businessName?: string;
  businessAddress?: string;
  businessPhone?: string;
  businessRut?: string;
}

export function StandardDeliveryGuideContent({
  order,
  onClose,
  businessName = "CONECTOCA",
  businessAddress = "Av. Pedro de Valdivia 4260",
  businessPhone = "+56 9 XXXX XXXX",
  businessRut = "XX.XXX.XXX-X"
}: Omit<StandardDeliveryGuideProps, 'open'>) {
  const [isPrinting, setIsPrinting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    setIsPrinting(true);

    // Small delay to ensure the print styles are applied
    setTimeout(() => {
      window.print();

      // Reset after print dialog closes (approximate)
      setTimeout(() => {
        setIsPrinting(false);
        toast.success('Guía de despacho lista para imprimir');
      }, 500);
    }, 100);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-[#0047BA]">
          <Printer className="w-5 h-5" />
          Guía de Despacho Estándar
        </DialogTitle>
        <DialogDescription>
          Vista previa y opciones de impresión para guía de despacho en formato estándar (A4/Carta)
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {/* Preview of standard delivery guide */}
        <div
          ref={printRef}
          className="standard-delivery-guide-preview border-2 border-gray-300 rounded-lg p-8 bg-white"
        >
          {/* Header with Business Info */}
          <div className="flex items-start justify-between mb-6 pb-6 border-b-2 border-gray-300">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <Building2 className="w-8 h-8 text-[#0047BA]" />
                <h1 className="text-2xl font-bold text-[#0047BA]">{businessName}</h1>
              </div>
              <p className="text-sm text-gray-600">{businessAddress}</p>
              <p className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                <Phone className="w-3.5 h-3.5" />
                {businessPhone}
              </p>
              <p className="text-sm text-gray-600 mt-1">RUT: {businessRut}</p>
            </div>
            <div className="text-right">
              <div className="bg-[#0047BA] text-white px-4 py-2 rounded-lg mb-2">
                <h2 className="text-lg font-bold">GUÍA DE DESPACHO</h2>
              </div>
              <p className="text-sm text-gray-600">
                N° {order.id.slice(0, 8).toUpperCase()}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {formatDate(order.createdAt || order.date)}
              </p>
            </div>
          </div>

          {/* Customer and Order Info */}
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                <User className="w-4 h-4 text-[#0059FF]" />
                DATOS DEL CLIENTE
              </h3>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-gray-500">Nombre / Razón Social</p>
                  <p className="text-sm font-medium text-gray-900">{order.customerName}</p>
                </div>
                {order.deliveryAddress && (
                  <div>
                    <p className="text-xs text-gray-500">Dirección de Entrega</p>
                    <p className="text-sm font-medium text-gray-900">{order.deliveryAddress}</p>
                  </div>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#0059FF]" />
                INFORMACIÓN DEL PEDIDO
              </h3>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-gray-500">Fecha de Pedido</p>
                  <p className="text-sm font-medium text-gray-900">
                    {new Date(order.createdAt || order.date).toLocaleDateString('es-CL', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Hora</p>
                  <p className="text-sm font-medium text-gray-900">
                    {new Date(order.createdAt || order.date).toLocaleTimeString('es-CL', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Fecha de Despacho</p>
                  <p className="text-sm font-bold text-[#0047BA]">
                    {order.deadline
                      ? new Date(order.deadline + 'T12:00:00').toLocaleDateString('es-CL', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric'
                        })
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Estado</p>
                  <p className="text-sm font-medium text-gray-900">
                    {order.status === 'completed' ? 'LISTO PARA DESPACHO' :
                      order.status === 'cancelled' ? 'DESPACHADO' :
                        order.status === 'in_progress' ? 'EN PREPARACIÓN' : 'PENDIENTE'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Products Table */}
          <div className="mb-6">
            <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
              <Package className="w-4 h-4 text-[#0059FF]" />
              DETALLE DE PRODUCTOS
            </h3>
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100 border-b-2 border-gray-300">
                  <th className="text-left py-3 px-4 text-xs font-bold text-gray-700">CANT.</th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-gray-700">DESCRIPCIÓN</th>
                  <th className="text-right py-3 px-4 text-xs font-bold text-gray-700">PRECIO UNIT.</th>
                  <th className="text-right py-3 px-4 text-xs font-bold text-gray-700">SUBTOTAL</th>
                </tr>
              </thead>
              <tbody>
                {order.products && order.products.length > 0 ? (
                  order.products.map((product, index) => (
                    <tr key={index} className="border-b border-gray-200">
                      <td className="py-3 px-4 text-sm text-gray-900">{product.quantity}</td>
                      <td className="py-3 px-4 text-sm text-gray-900 font-medium">{product.name}</td>
                      <td className="py-3 px-4 text-sm text-gray-900 text-right">{formatCLP(product.price)}</td>
                      <td className="py-3 px-4 text-sm text-gray-900 text-right font-medium">
                        {formatCLP(product.price * product.quantity)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr className="border-b border-gray-200">
                    <td className="py-3 px-4 text-sm text-gray-900">{order.quantity}</td>
                    <td className="py-3 px-4 text-sm text-gray-900 font-medium">{order.productName}</td>
                    <td className="py-3 px-4 text-sm text-gray-900 text-right">-</td>
                    <td className="py-3 px-4 text-sm text-gray-900 text-right font-medium">-</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Notes Section */}
          {order.notes && order.notes.trim() && (
            <div className="mb-6 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded">
              <h3 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-yellow-600" />
                OBSERVACIONES
              </h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{order.notes}</p>
            </div>
          )}

          {/* Total */}
          <div className="flex justify-end mb-6">
            <div className="w-64">
              <div className="bg-[#0047BA] text-white px-4 py-3 rounded-lg flex justify-between items-center">
                <span className="font-bold">TOTAL:</span>
                <span className="text-xl font-bold">{formatCLP(order.total || 0)}</span>
              </div>
            </div>
          </div>

          {/* Signature Section */}
          <div className="grid grid-cols-2 gap-8 pt-6 border-t-2 border-gray-300">
            <div>
              <p className="text-xs text-gray-600 mb-12">FIRMA Y TIMBRE EMISOR</p>
              <div className="border-b-2 border-gray-400"></div>
              <p className="text-xs text-gray-500 text-center mt-2">{businessName}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600 mb-12">FIRMA Y TIMBRE RECEPTOR</p>
              <div className="border-b-2 border-gray-400"></div>
              <p className="text-xs text-gray-500 text-center mt-2">Recibí conforme</p>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-4 border-t border-gray-200 text-center">
            <p className="text-xs text-gray-500">
              Este documento es una guía de despacho no fiscal. Conservar para efectos tributarios.
            </p>
            <p className="text-xs text-gray-500 mt-1">www.conectoca.cl</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            onClick={handlePrint}
            disabled={isPrinting}
            className="flex-1"
            style={{
              background: 'linear-gradient(90deg, #0059FF 0%, #004BCE 100%)',
            }}
          >
            <Printer className="w-4 h-4 mr-2" />
            {isPrinting ? 'Imprimiendo...' : 'Imprimir'}
          </Button>
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1"
          >
            <X className="w-4 h-4 mr-2" />
            Cerrar
          </Button>
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs text-blue-800">
            <strong>Nota:</strong> Esta guía está optimizada para impresoras estándar en formato A4 o Carta.
            El diseño es profesional y adecuado para documentación formal.
          </p>
        </div>
      </div>

      {/* Hidden print-only version */}
      {isPrinting && createPortal(
        <div className="standard-print-content">
          <div className="standard-receipt">
            {/* Header with Business Info */}
            <div className="flex items-start justify-between mb-8 pb-6 border-b-2 border-gray-400">
              <div className="flex-1">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">{businessName}</h1>
                <p className="text-sm text-gray-700">{businessAddress}</p>
                <p className="text-sm text-gray-700 mt-1">{businessPhone}</p>
                <p className="text-sm text-gray-700 mt-1">RUT: {businessRut}</p>
              </div>
              <div className="text-right">
                <div className="bg-gray-900 text-white px-6 py-3 rounded mb-2" style={{ borderRadius: '4px' }}>
                  <h2 className="text-xl font-bold">GUÍA DE DESPACHO</h2>
                </div>
                <p className="text-sm text-gray-700 font-medium">
                  N° {order.id.slice(0, 8).toUpperCase()}
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  {formatDate(order.createdAt || order.date)}
                </p>
              </div>
            </div>

            {/* Customer and Order Info */}
            <div className="grid grid-cols-2 gap-8 mb-8">
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-4">Datos del Cliente</h3>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-gray-600">Nombre / Razón Social</p>
                    <p className="text-sm font-medium text-gray-900">{order.customerName}</p>
                  </div>
                  {order.deliveryAddress && (
                    <div className="mt-2">
                      <p className="text-xs text-gray-600">Dirección de Entrega</p>
                      <p className="text-sm font-medium text-gray-900">{order.deliveryAddress}</p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-4">Información del Pedido</h3>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-gray-600">Fecha de Pedido</p>
                    <p className="text-sm font-medium text-gray-900">
                      {new Date(order.createdAt || order.date).toLocaleDateString('es-CL', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric'
                      })}
                    </p>
                  </div>
                  <div className="mt-2">
                    <p className="text-xs text-gray-600">Hora</p>
                    <p className="text-sm font-medium text-gray-900">
                      {new Date(order.createdAt || order.date).toLocaleTimeString('es-CL', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                  <div className="mt-2">
                    <p className="text-xs text-gray-600">Fecha de Despacho</p>
                    <p className="text-sm font-bold text-gray-900">
                      {order.deadline
                        ? new Date(order.deadline + 'T12:00:00').toLocaleDateString('es-CL', {
                            day: '2-digit',
                            month: 'long',
                            year: 'numeric'
                          })
                        : '-'}
                    </p>
                  </div>
                  <div className="mt-2">
                    <p className="text-xs text-gray-600">Estado</p>
                    <p className="text-sm font-medium text-gray-900">
                      {order.status === 'completed' ? 'LISTO PARA DESPACHO' :
                        order.status === 'cancelled' ? 'DESPACHADO' :
                          order.status === 'in_progress' ? 'EN PREPARACIÓN' : 'PENDIENTE'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Products Table */}
            <div className="mb-8">
              <h3 className="text-sm font-bold text-gray-900 mb-4">Detalle de Productos</h3>
              <table className="w-full border-collapse" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr className="bg-gray-200 border-b-2 border-gray-500">
                    <th className="text-left py-3 px-4 text-xs font-bold text-gray-900" style={{ textAlign: 'left', padding: '10px 8px', border: '1px solid #333' }}>CANT.</th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-gray-900" style={{ textAlign: 'left', padding: '10px 8px', border: '1px solid #333' }}>DESCRIPCIÓN</th>
                    <th className="text-right py-3 px-4 text-xs font-bold text-gray-900" style={{ textAlign: 'right', padding: '10px 8px', border: '1px solid #333' }}>PRECIO UNIT.</th>
                    <th className="text-right py-3 px-4 text-xs font-bold text-gray-900" style={{ textAlign: 'right', padding: '10px 8px', border: '1px solid #333' }}>SUBTOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {order.products && order.products.length > 0 ? (
                    order.products.map((product, index) => (
                      <tr key={index} className="border-b border-gray-300">
                        <td className="py-3 px-4 text-sm text-gray-900" style={{ padding: '10px 8px', border: '1px solid #333' }}>{product.quantity}</td>
                        <td className="py-3 px-4 text-sm text-gray-900 font-medium" style={{ padding: '10px 8px', border: '1px solid #333' }}>{product.name}</td>
                        <td className="py-3 px-4 text-sm text-gray-900 text-right" style={{ textAlign: 'right', padding: '10px 8px', border: '1px solid #333' }}>{formatCLP(product.price)}</td>
                        <td className="py-3 px-4 text-sm text-gray-900 text-right font-medium" style={{ textAlign: 'right', padding: '10px 8px', border: '1px solid #333' }}>
                          {formatCLP(product.price * product.quantity)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr className="border-b border-gray-300">
                      <td className="py-3 px-4 text-sm text-gray-900" style={{ padding: '10px 8px', border: '1px solid #333' }}>{order.quantity}</td>
                      <td className="py-3 px-4 text-sm text-gray-900 font-medium" style={{ padding: '10px 8px', border: '1px solid #333' }}>{order.productName}</td>
                      <td className="py-3 px-4 text-sm text-gray-900 text-right" style={{ textAlign: 'right', padding: '10px 8px', border: '1px solid #333' }}>-</td>
                      <td className="py-3 px-4 text-sm text-gray-900 text-right font-medium" style={{ textAlign: 'right', padding: '10px 8px', border: '1px solid #333' }}>-</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Notes Section */}
            {order.notes && order.notes.trim() && (
              <div className="mb-8 p-4 bg-gray-100 border-l-4 border-gray-500" style={{ padding: '16px', marginBottom: '32px' }}>
                <h3 className="text-sm font-bold text-gray-900 mb-2">OBSERVACIONES</h3>
                <p className="text-sm text-gray-800 whitespace-pre-wrap" style={{ whiteSpace: 'pre-wrap' }}>{order.notes}</p>
              </div>
            )}

            {/* Total */}
            <div className="flex justify-end mb-8" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '32px' }}>
              <div className="w-80" style={{ width: '320px' }}>
                <div className="bg-gray-900 text-white px-6 py-4 flex justify-between items-center" style={{ backgroundColor: '#111827', color: 'white', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="font-bold text-lg">TOTAL:</span>
                  <span className="text-2xl font-bold">{formatCLP(order.total || 0)}</span>
                </div>
              </div>
            </div>

            {/* Signature Section */}
            <div className="grid grid-cols-2 gap-12 pt-8 border-t-2 border-gray-400" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px', paddingTop: '32px', borderTop: '2px solid #333', marginTop: '40px' }}>
              <div>
                <p className="text-xs text-gray-700 mb-16 font-medium" style={{ marginBottom: '64px' }}>FIRMA Y TIMBRE EMISOR</p>
                <div className="border-b-2 border-gray-700" style={{ borderBottom: '2px solid #374151' }}></div>
                <p className="text-xs text-gray-600 text-center mt-2" style={{ textAlign: 'center', marginTop: '8px' }}>{businessName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-700 mb-16 font-medium" style={{ marginBottom: '64px' }}>FIRMA Y TIMBRE RECEPTOR</p>
                <div className="border-b-2 border-gray-700" style={{ borderBottom: '2px solid #374151' }}></div>
                <p className="text-xs text-gray-600 text-center mt-2" style={{ textAlign: 'center', marginTop: '8px' }}>Recibí conforme</p>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-10 pt-4 border-t border-gray-300 text-center" style={{ marginTop: '40px', paddingTop: '16px', borderTop: '1px solid #d1d5db', textAlign: 'center' }}>
              <p className="text-xs text-gray-600">
                Este documento es una guía de despacho no fiscal. Conservar para efectos tributarios.
              </p>
              <p className="text-xs text-gray-600 mt-1" style={{ marginTop: '4px' }}>www.conectoca.cl</p>
            </div>
          </div>
        </div>,
        document.getElementById('print-root') || document.body
      )}
    </>
  );
}

export function StandardDeliveryGuide({
  order,
  open,
  onClose,
  businessName,
  businessAddress,
  businessPhone,
  businessRut
}: StandardDeliveryGuideProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <StandardDeliveryGuideContent
          order={order}
          onClose={onClose}
          businessName={businessName}
          businessAddress={businessAddress}
          businessPhone={businessPhone}
          businessRut={businessRut}
        />
      </DialogContent>
    </Dialog>
  );
}