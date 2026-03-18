import React from 'react';
import { Order } from '../App';
import { formatCLP } from '../utils/format';
import logo from '../assets/logo.png';

interface ThermalReceiptTemplateProps {
    order: Order;
    businessName: string;
    businessRut: string;
    businessAddress: string;
    fontSize: number;
}

export const ThermalReceiptTemplate = ({
    order,
    businessName,
    businessRut,
    businessAddress,
    fontSize
}: ThermalReceiptTemplateProps) => {

    const formatDate = (dateString: string) => {
        if (!dateString) return '-';
        // Handle both ISO strings and Date objects if necessary, though type says string
        return new Date(dateString).toLocaleDateString('es-CL', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    };

    const formatTime = (dateString: string) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleTimeString('es-CL', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div style={{
            fontFamily: 'Arial, sans-serif',
            fontSize: `${fontSize}px`,
            color: 'black',
            lineHeight: '1.2'
        }}>
            {/* 1. Header: Logo Left, Text Right */}
            <div style={{ display: 'flex', gap: '5px', marginBottom: '10px', alignItems: 'flex-start' }}>
                {/* Logo Area */}
                <div style={{ width: '35%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <img
                        src={logo}
                        alt="Logo"
                        style={{
                            width: '100%',
                            maxWidth: '60px',
                            filter: 'grayscale(100%) contrast(150%)', // High contrast for thermal
                            marginBottom: '2px'
                        }}
                    />
                    <div style={{ fontSize: '10px', fontWeight: 'bold', textAlign: 'center' }}>La Oca</div>
                </div>

                {/* Business Details */}
                <div style={{ width: '65%', paddingLeft: '5px' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '1.1em', lineHeight: '1.1', marginBottom: '2px' }}>
                        {businessName}
                    </div>
                    <div style={{ fontSize: '0.9em', marginBottom: '1px' }}>
                        RUT: {businessRut}
                    </div>
                    <div style={{ fontSize: '0.9em', marginBottom: '4px' }}>
                        Dirección: {businessAddress}
                    </div>

                    <div style={{ fontWeight: 'bold', fontSize: '1em', marginTop: '4px' }}>
                        GUÍA DE DESPACHO
                    </div>
                    <div style={{ fontSize: '0.9em' }}>
                        ID Despacho: D-{order.id ? order.id.slice(0, 4) : '???'}
                    </div>
                </div>
            </div>

            {/* 2. Customer Info */}
            <div style={{
                borderTop: '1px solid black',
                borderBottom: '1px solid black',
                padding: '5px 0',
                marginBottom: '10px',
                fontSize: '0.95em'
            }}>
                <div style={{ display: 'flex', marginBottom: '2px' }}>
                    <span style={{ fontWeight: 'bold', width: '70px' }}>Cliente:</span>
                    <span>{order.customerName}</span>
                </div>
                <div style={{ display: 'flex', marginBottom: '2px' }}>
                    <span style={{ fontWeight: 'bold', width: '70px' }}>Dirección:</span>
                    <span>{order.deliveryAddress || '-'}</span>
                </div>
                <div style={{ display: 'flex', marginBottom: '2px' }}>
                    <span style={{ fontWeight: 'bold', width: '70px' }}>Pedido:</span>
                    <span>{formatDate(order.createdAt || order.date)}</span>
                </div>
                <div style={{ display: 'flex', marginBottom: '2px' }}>
                    <span style={{ fontWeight: 'bold', width: '70px' }}>Hora:</span>
                    <span>{formatTime(order.createdAt || order.date)}</span>
                </div>
                <div style={{ display: 'flex', marginBottom: '2px' }}>
                    <span style={{ fontWeight: 'bold', width: '70px' }}>Despacho:</span>
                    <span style={{ fontWeight: 'bold' }}>
                        {order.deadline ? formatDate(order.deadline + 'T12:00:00') : '-'}
                    </span>
                </div>
                {order.notes && (
                    <div style={{ display: 'flex', marginTop: '2px' }}>
                        <span style={{ fontWeight: 'bold', width: '70px' }}>Obs:</span>
                        <span style={{ flex: 1, whiteSpace: 'pre-wrap' }}>{order.notes}</span>
                    </div>
                )}
            </div>

            {/* 3. Products Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px', fontSize: '0.9em' }}>
                <thead>
                    <tr style={{ borderBottom: '1px solid black' }}>
                        <th style={{ textAlign: 'left', padding: '2px' }}>Producto</th>
                        <th style={{ textAlign: 'center', padding: '2px', width: '40px' }}>Cant.</th>
                        <th style={{ textAlign: 'right', padding: '2px', width: '60px' }}>Subtotal</th>
                    </tr>
                </thead>
                <tbody>
                    {order.products && order.products.length > 0 ? (
                        order.products.map((p, i) => (
                            <tr key={i} style={{ borderBottom: '1px dotted #ccc' }}>
                                <td style={{ padding: '4px 2px', verticalAlign: 'top' }}>
                                    {p.name}
                                </td>
                                <td style={{ padding: '4px 2px', textAlign: 'center', verticalAlign: 'top' }}>
                                    {p.quantity}
                                </td>
                                <td style={{ padding: '4px 2px', textAlign: 'right', verticalAlign: 'top' }}>
                                    {formatCLP(p.price * p.quantity)}
                                </td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td style={{ padding: '4px 2px' }}>{order.productName}</td>
                            <td style={{ padding: '4px 2px', textAlign: 'center' }}>{order.quantity}</td>
                            <td style={{ padding: '4px 2px', textAlign: 'right' }}>{formatCLP(order.total || 0)}</td>
                        </tr>
                    )}
                </tbody>
            </table>

            {/* 4. Total */}
            <div style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '1.2em', marginBottom: '20px' }}>
                Total: {formatCLP(order.total || 0)}
            </div>

            {/* 5. Footer / Signature */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '30px' }}>
                <div style={{ textAlign: 'center', width: '120px' }}>
                    <div style={{ fontSize: '0.8em', color: '#666', marginBottom: '25px' }}>Firma Empresa:</div>
                    <div style={{ borderTop: '1px solid black', paddingTop: '2px', fontSize: '0.8em' }}>
                        Recibí Conforme
                    </div>
                </div>
            </div>
        </div>
    );
};
