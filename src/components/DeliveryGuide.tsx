import { Order } from '../App';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import {
  Printer,
  X,
  FileText,
  ArrowLeft
} from 'lucide-react';
import { useState } from 'react';
import { StandardDeliveryGuideContent } from './StandardDeliveryGuide';
import { ThermalReceiptConfigContent } from './ThermalReceiptConfig';

interface DeliveryGuideProps {
  order: Order;
  open: boolean;
  onClose: () => void;
  businessName?: string;
  businessAddress?: string;
  businessPhone?: string;
}

type ViewType = 'selection' | 'thermal' | 'standard';

export function DeliveryGuide({
  order,
  open,
  onClose,
  businessName = "CONECTOCA",
  businessAddress = "Av. Pedro de Valdivia 4260",
  businessPhone = "+56 9 XXXX XXXX"
}: DeliveryGuideProps) {
  const [view, setView] = useState<ViewType>('selection');

  // Reset view when dialog opens/closes
  if (!open && view !== 'selection') {
    // We can reset state here or use useEffect.
    // Using simple approach: if invalid state detection? No, let's use useEffect or just reset on onClose wrapper.
  }

  const handleClose = () => {
    onClose();
    // Allow animation to finish before resetting view
    setTimeout(() => setView('selection'), 300);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className={view === 'thermal' ? "max-w-4xl max-h-[95vh] overflow-hidden" : view === 'standard' ? "max-w-3xl max-h-[90vh] overflow-y-auto" : "max-w-md"}>

        {/* VIEW: SELECTION */}
        {view === 'selection' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-[#0047BA]">
                <Printer className="w-5 h-5" />
                Seleccionar Formato de Impresión
              </DialogTitle>
              <DialogDescription>
                Elige el tipo de guía que deseas imprimir
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              {/* Thermal Receipt Option */}
              <button
                onClick={() => setView('thermal')}
                className="w-full p-4 border-2 border-blue-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-all text-left group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                    <Printer className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1">
                      Recibo Térmico
                    </h3>
                    <p className="text-sm text-gray-600">
                      Para impresoras térmicas de 58mm y 80mm
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                        Letras Gruesas
                      </span>
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                        Ajustable
                      </span>
                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                        Optimizado
                      </span>
                    </div>
                  </div>
                </div>
              </button>

              {/* A4 Standard Option */}
              <button
                onClick={() => setView('standard')}
                className="w-full p-4 border-2 border-green-200 rounded-lg hover:border-green-400 hover:bg-green-50 transition-all text-left group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center group-hover:bg-green-200 transition-colors">
                    <FileText className="w-6 h-6 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1">
                      Guía A4 Estándar
                    </h3>
                    <p className="text-sm text-gray-600">
                      Para impresoras de oficina (formato A4)
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                        Profesional
                      </span>
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                        Completo
                      </span>
                    </div>
                  </div>
                </div>
              </button>

              {/* Close Button */}
              <Button
                variant="outline"
                onClick={handleClose}
                className="w-full"
              >
                <X className="w-4 h-4 mr-2" />
                Cancelar
              </Button>
            </div>
          </>
        )}

        {/* VIEW: THERMAL CONFIG */}
        {view === 'thermal' && (
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              className="absolute -top-2 -left-2 z-10 text-gray-500 hover:text-gray-900"
              onClick={() => setView('selection')}
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Volver
            </Button>
            <div className="pt-6">
              <ThermalReceiptConfigContent
                order={order}
                onClose={handleClose}
                businessName={businessName}
                businessAddress={businessAddress}
                businessPhone={businessPhone}
              />
            </div>
          </div>
        )}

        {/* VIEW: STANDARD CONFIG */}
        {view === 'standard' && (
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              className="absolute -top-2 -left-2 z-10 text-gray-500 hover:text-gray-900"
              onClick={() => setView('selection')}
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Volver
            </Button>
            <div className="pt-6">
              <StandardDeliveryGuideContent
                order={order}
                onClose={handleClose}
                businessName={businessName}
                businessAddress={businessAddress}
                businessPhone={businessPhone}
              />
            </div>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}