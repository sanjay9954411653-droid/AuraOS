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
  
  // Custom states tracking modules
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState<string>("");

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

  const handleCancel = async () => {
    if (!order || !window.confirm("Are you sure you want to cancel your order?")) return;
    
    try {
      const response = await fetch(`/api/orders/${order.id}/cancel`, { method: 'POST' });
      if (response.ok) {
        setOrder(prev => prev ? { ...prev, status: 'CANCELLED' } : null);
        alert("Order cancelled successfully.");
      } else {
        alert("Could not cancel order. It might already be in preparation.");
      }
    } catch (err) {
      alert("Error processing your cancellation request.");
    }
  };

  const handleDownloadInvoice = () => {
    if (!order) return;
    window.open(`/api/orders/${order.id}/invoice`, '_blank');
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;

    try {
      console.log(`Submitting Review for order ${order.id}: ${rating} stars - "${comment}"`);
      alert("Thank you for your valuable feedback!");
      setShowReviewForm(false);
      setComment("");
      setRating(5);
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500 font-medium">Loading live order track status...</div>;
  if (!order) return <div className="p-8 text-center text-red-500 font-medium">Order tracking code not found. Please verify your receipt link.</div>;

  return (
    <div className="max-w-md mx-auto p-6 bg-white shadow-xl rounded-2xl mt-12 border border-gray-100 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-800 mb-1">Track Order #{params.orderNumber.slice(-6)}</h2>
        <p className="text-xs text-gray-400">Live status updates automatically</p>
      </div>
      
      <div className="p-5 rounded-xl bg-orange-50 border border-orange-200 text-center">
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

      {/* Embedded Actions Interface */}
      <div className="flex flex-wrap gap-2 justify-end pt-4 border-t border-gray-100">
        {order.status === 'CREATED' && (
          <button type="button" onClick={handleCancel} className="bg-red-50 text-red-600 text-xs px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-100 transition duration-150">
            Cancel Order
          </button>
        )}

        <button type="button" onClick={handleDownloadInvoice} className="bg-gray-50 text-gray-700 text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 transition duration-150">
          Download Invoice
        </button>

        {order.status === 'DELIVERED' && (
          <button type="button" onClick={() => setShowReviewForm(true)} className="bg-blue-50 text-blue-600 text-xs px-3 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-100 transition duration-150">
            Rate Order / Feedback
          </button>
        )}
      </div>

      {/* Dynamic Slide Drawer Form Evaluation Module */}
      {showReviewForm && (
        <form onSubmit={handleSubmitReview} className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3 mt-4">
          <h4 className="text-sm font-bold text-gray-800">Reviewing Meal Quality</h4>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Select Rating Star Scale:</label>
            <select value={rating} onChange={(e) => setRating(Number(e.target.value))} className="w-full text-sm p-1.5 bg-white border rounded-lg focus:outline-orange-500">
              <option value={5}>⭐⭐⭐⭐⭐ 5 Stars - Excellent Delicious</option>
              <option value={4}>⭐⭐⭐⭐ 4 Stars - Very Good</option>
              <option value={3}>⭐⭐⭐ 3 Stars - Average Meal</option>
              <option value={2}>⭐⭐ 2 Stars - Needs Improvement</option>
              <option value={1}>⭐ 1 Star - Poor Experience</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Share Your Food Experience:</label>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} required placeholder="How did you like the taste, portion size and packaging?..." className="w-full text-sm p-2 bg-white border rounded-lg h-16 resize-none focus:outline-orange-500" />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowReviewForm(false)} className="text-xs bg-white border px-3 py-1.5 rounded-md text-gray-600">Cancel</button>
            <button type="submit" className="text-xs bg-orange-600 text-white px-3 py-1.5 rounded-md font-medium hover:bg-orange-700 transition">Submit Review</button>
          </div>
        </form>
      )}
    </div>
  );
}
