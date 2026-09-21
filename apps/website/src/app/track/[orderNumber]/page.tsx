"use client";

import React, { useState, useEffect } from 'react';

interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

interface OrderData {
  id: string;
  status: 'CREATED' | 'PREPARING' | 'READY' | 'DELIVERED' | 'CANCELLED';
  total: number;
  items: OrderItem[];
}

export default function GuestTrackPage({ params }: { params: { orderNumber: string } }) {
  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/orders/track/${params.orderNumber}`)
      .then((res) => {
        if (!res.ok) throw new Error("Order tracking failed");
        return res.json();
      })
      .then((data) => {
        setOrder(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error tracking order:", err);
        setLoading(false);
      });
  }, [params.orderNumber]);

  if (loading) return <div className="p-8 text-center text-gray-500 font-medium">Loading live order track status...</div>;
  if (!order) return <div className="p-8 text-center text-red-500 font-medium">Order tracking code not found. Please verify your receipt link.</div>;

  return (
    <div className="max-w-md mx-auto p-6 bg-white shadow-xl rounded-2xl mt-12 border border-gray-100">
      <h2 className="text-xl font-bold text-gray-800 mb-1">Track Order #{params.orderNumber.slice(-6)}</h2>
      <p className="text-xs text-gray-400 mb-6">Live status updates automatically</p>
      
      <div className="p-5 rounded-xl bg-orange-50 border border-orange-200 text-center mb-6">
        <span className="text-xs uppercase font-bold text-orange-700 tracking-wider">Current Status</span>
        <div className="text-3xl font-black text-orange-600 mt-1">{order.status}</div>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <h3 className="font-semibold text-sm text-gray-700 mb-3">Items Summary:</h3>
        <div className="space-y-2 text-sm text-gray-600">
          {order.items?.map((item, idx) => (
            <div key={idx} className="flex justify-between">
              <span>{item.name} <span className="text-gray-400 font-medium">x{item.quantity}</span></span>
              <span className="font-medium">\${(item.price * item.quantity).toFixed(2)}</span>
            </div>
          ))}
          <div className="flex justify-between font-bold text-gray-900 pt-3 border-t border-dashed border-gray-200 mt-2 text-base">
            <span>Total Summary</span>
            <span>\${Number(order.total).toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
