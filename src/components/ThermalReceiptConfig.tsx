import { Order } from '../App';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Label } from './ui/label';
import { Slider } from './ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { formatCLP } from '../utils/format';
import {
  Printer,
  Settings,
  X
} from 'lucide-react';
import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import logo from '../assets/logo.png'; // Assuming logo exists
import { ThermalReceiptTemplate } from './ThermalReceiptTemplate';

export interface ThermalReceiptConfigProps {
  order: Order;
  open: boolean;
  onClose: () => void;
  businessName?: string;
  businessAddress?: string;
  businessPhone?: string;
  businessRut?: string;
}

export function ThermalReceiptConfigContent({
  order,
  onClose,
  businessName = "PANIFICADORA ELORRIO LTDA.",
  businessAddress = "Av. Pedro de Valdivia 4260",
  businessPhone = "+569 1234 5678",
  businessRut = "76.020.756-K"
}: Omit<ThermalReceiptConfigProps, 'open'>) {
  // Configuration state - Defaults based on user request
  const [paperWidth, setPaperWidth] = useState<'58mm' | '80mm'>('80mm');
  const [fontSize, setFontSize] = useState(12); // Slightly smaller for table
  const [marginTop, setMarginTop] = useState(5); // 5mm top
  const [marginBottom, setMarginBottom] = useState(3); // 3mm bottom
  const [marginX, setMarginX] = useState(2); // 2mm side
  const [isPrinting, setIsPrinting] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    setIsPrinting(true);

    setTimeout(() => {
      window.print();

      setTimeout(() => {
        setIsPrinting(false);
        toast.success('Recibo enviado a impresora');
      }, 500);
    }, 100);
  };



  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-[#0047BA]">
          <Printer className="w-5 h-5" />
          Configuración de Recibo Térmico
        </DialogTitle>
        <DialogDescription>
          Ajusta el formato para tu impresora térmica (Optimizado)
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-h-[calc(95vh-200px)] overflow-y-auto">
        {/* Configuration Panel */}
        <div className="space-y-6 pr-4 border-r border-gray-200 col-span-1">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Ajustes de Impresión
            </h3>
          </div>

          {/* Paper Width */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Ancho de Papel</Label>
            <Select value={paperWidth} onValueChange={(v) => setPaperWidth(v as '58mm' | '80mm')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="58mm">58mm</SelectItem>
                <SelectItem value="80mm">80mm (Estándar)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Font Size */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex justify-between">
              <span>Tamaño Letra</span>
              <span className="text-blue-600">{fontSize}px</span>
            </Label>
            <Slider value={[fontSize]} onValueChange={([v]) => setFontSize(v)} min={10} max={16} step={1} />
          </div>

          {/* Margins */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium flex justify-between">
                <span>Margen Superior (Top)</span>
                <span className="text-blue-600">{marginTop}mm</span>
              </Label>
              <Slider value={[marginTop]} onValueChange={([v]) => setMarginTop(v)} min={0} max={20} step={1} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium flex justify-between">
                <span>Margen Inferior (Bottom)</span>
                <span className="text-blue-600">{marginBottom}mm</span>
              </Label>
              <Slider value={[marginBottom]} onValueChange={([v]) => setMarginBottom(v)} min={0} max={20} step={1} />
            </div>
          </div>

          <div className="bg-blue-50 p-3 rounded text-xs text-blue-800">
            Diseño optimizado según especificaciones: Logo a la izquierda, datos a la derecha, tabla compacta.
          </div>
        </div>

        {/* Preview Panel */}
        <div className="col-span-2 bg-gray-100 p-8 rounded-lg overflow-auto flex justify-center">
          <div
            id="thermal-receipt-preview"
            className="bg-white shadow-xl"
            style={{
              width: paperWidth,
              minHeight: '400px',
              padding: `${marginTop}mm ${marginX}mm ${marginBottom}mm ${marginX}mm`,
            }}
          >
            <ThermalReceiptTemplate
              order={order}
              businessName={businessName}
              businessRut={businessRut}
              businessAddress={businessAddress}
              fontSize={fontSize}
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t">
        <Button
          onClick={handlePrint}
          disabled={isPrinting}
          className="flex-1"
          style={{ background: 'linear-gradient(90deg, #0059FF 0%, #004BCE 100%)' }}
        >
          <Printer className="w-4 h-4 mr-2" />
          {isPrinting ? 'Imprimiendo...' : 'Imprimir Recibo'}
        </Button>
        <Button variant="outline" onClick={onClose} className="flex-1">
          <X className="w-4 h-4 mr-2" /> Cerrar
        </Button>
      </div>

      {/* Hidden Print Content (Rendered outside Dialog to avoid display:none) */}
      {createPortal(
        <div
          id="thermal-receipt-print" // Use distinct ID for printing
          className="thermal-print-content"
          style={{
            width: paperWidth,
            padding: `${marginTop}mm ${marginX}mm ${marginBottom}mm ${marginX}mm`
          }}
        >
          <ThermalReceiptTemplate
            order={order}
            businessName={businessName}
            businessRut={businessRut}
            businessAddress={businessAddress}
            fontSize={fontSize}
          />
        </div>,
        document.getElementById('print-root') || document.body
      )}
    </>
  );
}

export function ThermalReceiptConfig({
  order,
  open,
  onClose,
  businessName,
  businessAddress,
  businessPhone,
  businessRut
}: ThermalReceiptConfigProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-4xl max-h-[95vh] overflow-hidden">
        <ThermalReceiptConfigContent
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