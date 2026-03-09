import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { ScrollArea } from './ui/scroll-area';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from './ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from './ui/table';
import {
    Plus,
    Minus,
    Trash2,
    Save,
    X,
    Search,
    AlertCircle,
    Edit,
    Calendar
} from 'lucide-react';
import { toast } from 'sonner';
import { Order } from '../App';
import { productsAPI, ordersAPI, type Product as APIProduct } from '../utils/api';
import { formatCLP } from '../utils/format';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';


interface EditOrderDialogProps {
    isOpen: boolean;
    onClose: () => void;
    order: Order;
    accessToken: string;
    onOrderUpdated: () => void;
}

interface OrderItem {
    productId: string;
    name: string;
    quantity: number;
    price: number;
    originalQuantity: number; // To track changes
}

export function EditOrderDialog({
    isOpen,
    onClose,
    order,
    accessToken,
    onOrderUpdated
}: EditOrderDialogProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [products, setProducts] = useState<APIProduct[]>([]);
    const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
    const [notes, setNotes] = useState('');
    const [deadline, setDeadline] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProductToAdd, setSelectedProductToAdd] = useState<string>('');

    // Initialize form when order changes or dialog opens
    useEffect(() => {
        if (isOpen && order) {
            initializeForm();
            loadProducts();
        }
    }, [isOpen, order]);

    const loadProducts = async () => {
        try {
            setIsLoading(true);
            const allProducts = await productsAPI.getAll(accessToken);
            setProducts(allProducts);
        } catch (error) {
            console.error('Error loading products:', error);
            toast.error('Error al cargar productos');
        } finally {
            setIsLoading(false);
        }
    };

    const initializeForm = () => {
        // Map existing products to editable items
        const items = order.products?.map(p => ({
            productId: p.productId,
            name: p.name,
            quantity: p.quantity,
            price: p.price,
            originalQuantity: p.quantity
        })) || [];

        setOrderItems(items);
        setNotes(order.notes || '');
        // Normalize deadline to YYYY-MM-DD for the date input
        const dl = order.deadline ? order.deadline.split('T')[0] : '';
        setDeadline(dl);
    };

    const handleQuantityChange = (productId: string, delta: number) => {
        setOrderItems(prev => prev.map(item => {
            if (item.productId === productId) {
                const newQuantity = Math.max(1, item.quantity + delta);
                return { ...item, quantity: newQuantity };
            }
            return item;
        }));
    };

    const handleRemoveItem = (productId: string) => {
        setOrderItems(prev => prev.filter(item => item.productId !== productId));
    };

    const handleAddProduct = () => {
        if (!selectedProductToAdd) return;

        const product = products.find(p => p.id === selectedProductToAdd);
        if (!product) return;

        // Check if already in order
        if (orderItems.some(item => item.productId === product.id)) {
            toast.warning('El producto ya está en el pedido');
            return;
        }

        setOrderItems(prev => [...prev, {
            productId: product.id,
            name: product.name,
            quantity: 1,
            price: product.price,
            originalQuantity: 0 // New item, so original quantity is 0
        }]);

        setSelectedProductToAdd('');
        toast.success('Producto agregado');
    };

    const calculateTotal = () => {
        return orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    };

    const handleSave = async () => {
        if (orderItems.length === 0) {
            toast.error('El pedido debe tener al menos un producto');
            return;
        }

        try {
            setIsSaving(true);

            // 1. Calculate and Apply Stock Changes
            const freshProducts = await productsAPI.getAll(accessToken);
            const stockUpdates = [];

            // Process all items in the NEW order
            for (const item of orderItems) {
                const product = freshProducts.find(p => p.id === item.productId);
                if (!product) continue;

                // Skip unlimited stock items (-1 or trackStock false)
                if (product.stock === -1 || product.unlimitedStock || product.trackStock === false) continue;

                const quantityDiff = item.quantity - item.originalQuantity;

                // If quantity changed
                if (quantityDiff !== 0) {
                    const newStock = Math.max(0, product.stock - quantityDiff);

                    if (newStock < 0 && product.stock !== -1 && !product.unlimitedStock && product.trackStock !== false) {
                        toast.error(`No hay suficiente stock para ${product.name}`);
                        setIsSaving(false);
                        return;
                    }

                    stockUpdates.push(productsAPI.update(accessToken, product.id, { stock: newStock }));
                }
            }

            // Process removed items
            const originalProductIds = order.products?.map(p => p.productId) || [];
            const currentProductIds = new Set(orderItems.map(i => i.productId));
            const removedProductIds = originalProductIds.filter(id => !currentProductIds.has(id));

            for (const removedId of removedProductIds) {
                const originalItem = order.products?.find(p => p.productId === removedId);
                if (!originalItem) continue;

                const product = freshProducts.find(p => p.id === removedId);
                if (!product) continue;

                if (product.stock === -1 || product.unlimitedStock || product.trackStock === false) continue;

                const newStock = product.stock + originalItem.quantity;
                stockUpdates.push(productsAPI.update(accessToken, product.id, { stock: newStock }));
            }

            // Run stock updates
            await Promise.all(stockUpdates);

            // 2. Update the Order using RPC to bypass RLS
            const enrichedProducts = orderItems.map(item => {
                // Try to find product definition in fresh list, or fallback to local products list
                const productDef = freshProducts.find(p => p.id === item.productId) ||
                    products.find(p => p.id === item.productId);

                const existingItem = order.products?.find(p => p.productId === item.productId);

                // Log if product definition is missing (critical for debugging)
                if (!productDef && !existingItem) {
                    console.warn(`Producto ${item.name} (${item.productId}) no encontrado ni en freshProducts ni en existingItems`);
                }

                return {
                    productId: item.productId,
                    name: item.name,
                    quantity: item.quantity,
                    price: item.price,
                    // Preserve or Assign production area info
                    productionAreaId: productDef?.productionAreaId || (existingItem as any)?.productionAreaId || null,
                    areaStatus: (existingItem as any)?.areaStatus || 'pending'
                };
            });
            console.log('Enriched Products to Save:', enrichedProducts);

            if (enrichedProducts.length === 0) {
                console.error('Error Crítico: Intentando guardar pedido sin productos. Abortando.');
                toast.error('Error interno: Lista de productos vacía. No se guardaron cambios.');
                setIsSaving(false);
                return;
            }

            await ordersAPI.update(accessToken, order.id, {
                products: enrichedProducts,
                total: calculateTotal(),
                notes,
                deadline: deadline || order.deadline,
                customerName: order.customerName,
                deliveryAddress: order.deliveryAddress
            } as any);

            toast.success('Pedido actualizado correctamente');
            onOrderUpdated();
            onClose();

        } catch (error: any) {
            console.error('Error updating order:', error);
            toast.error(`Error al actualizar: ${error.message || 'Verifica la conexión'}`);
        } finally {
            setIsSaving(false);
        }
    };

    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !orderItems.some(item => item.productId === p.id)
    );

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !isSaving && !open && onClose()}>
            <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
                <DialogHeader className="p-6 pb-2 border-b">
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <Edit className="w-5 h-5 text-blue-600" />
                        Editar Pedido #{order.id.slice(0, 8)}
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Add Product Section */}
                    <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100 space-y-3">
                        <Label className="text-blue-900 font-semibold">Agregar Producto</Label>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                                <Select
                                    value={selectedProductToAdd}
                                    onValueChange={setSelectedProductToAdd}
                                >
                                    <SelectTrigger className="w-full pl-9 bg-white">
                                        <SelectValue placeholder="Seleccionar producto..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <div className="p-2 border-b">
                                            <Input
                                                placeholder="Buscar..."
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                onKeyDown={(e) => e.stopPropagation()}
                                                className="h-8"
                                                autoFocus
                                            />
                                        </div>
                                        <ScrollArea className="h-60">
                                            {filteredProducts.map((product) => (
                                                <SelectItem key={product.id} value={product.id}>
                                                    <div className="flex justify-between w-full gap-4">
                                                        <span>{product.name}</span>
                                                        <span className="text-gray-500">{formatCLP(product.price)}</span>
                                                    </div>
                                                </SelectItem>
                                            ))}
                                            {filteredProducts.length === 0 && (
                                                <div className="p-2 text-sm text-gray-500 text-center">No encontrado</div>
                                            )}
                                        </ScrollArea>
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button onClick={handleAddProduct} disabled={!selectedProductToAdd}>
                                <Plus className="w-4 h-4 mr-1" />
                                Agregar
                            </Button>
                        </div>
                    </div>

                    {/* Order Items Table */}
                    <div className="border rounded-lg overflow-hidden">
                        <Table>
                            <TableHeader className="bg-gray-50">
                                <TableRow>
                                    <TableHead className="w-[40%]">Producto</TableHead>
                                    <TableHead className="text-right">Precio</TableHead>
                                    <TableHead className="text-center w-[120px]">Cantidad</TableHead>
                                    <TableHead className="text-right">Subtotal</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {orderItems.map((item) => (
                                    <TableRow key={item.productId}>
                                        <TableCell className="font-medium">
                                            {item.name}
                                            {item.originalQuantity === 0 && (
                                                <Badge variant="outline" className="ml-2 bg-green-50 text-green-700 border-green-200 text-[10px]">
                                                    Nuevo
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">{formatCLP(item.price)}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center justify-center gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-7 w-7"
                                                    onClick={() => handleQuantityChange(item.productId, -1)}
                                                >
                                                    <Minus className="w-3 h-3" />
                                                </Button>
                                                <span className="w-6 text-center text-sm">{item.quantity}</span>
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-7 w-7"
                                                    onClick={() => handleQuantityChange(item.productId, 1)}
                                                >
                                                    <Plus className="w-3 h-3" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right font-medium">
                                            {formatCLP(item.price * item.quantity)}
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                                                onClick={() => handleRemoveItem(item.productId)}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Totals & Notes */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="deadline" className="flex items-center gap-1.5">
                                    <Calendar className="w-4 h-4 text-gray-500" />
                                    Fecha de entrega
                                </Label>
                                <Input
                                    id="deadline"
                                    type="date"
                                    value={deadline}
                                    onChange={(e) => setDeadline(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="notes">Notas del Pedido</Label>
                                <Textarea
                                    id="notes"
                                    placeholder="Instrucciones especiales..."
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    className="h-20 resize-none"
                                />
                            </div>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg space-y-3 h-fit">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Items ({orderItems.length})</span>
                                <span>{orderItems.reduce((acc, item) => acc + item.quantity, 0)} unidades</span>
                            </div>
                            <Separator />
                            <div className="flex justify-between items-center">
                                <span className="font-semibold text-lg">Total</span>
                                <span className="font-bold text-xl text-blue-600">{formatCLP(calculateTotal())}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter className="p-6 border-t bg-gray-50">
                    <Button variant="outline" onClick={onClose} disabled={isSaving}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={isSaving || orderItems.length === 0}
                        className="bg-blue-600 hover:bg-blue-700 min-w-[140px]"
                    >
                        {isSaving ? (
                            <>Guardando...</>
                        ) : (
                            <>
                                <Save className="w-4 h-4 mr-2" />
                                Guardar Cambios
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
