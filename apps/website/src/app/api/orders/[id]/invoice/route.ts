import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const orderId = params.id;

    const query = `
      SELECT 
        o.id,
        o.created_at as "createdAt",
        o.total_price as "total",
        COALESCE(
          json_agg(
            json_build_object(
              'name', mi.name,
              'quantity', oi.quantity,
              'price', oi.unit_price
            )
          ) FILTER (WHERE mi.id IS NOT NULL), '[]'
        ) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
      WHERE o.id = $1
      GROUP BY o.id;
    `;

    const result = await pool.query(query, [orderId]);

    if (result.rows.length === 0) {
      return new Response('Invoice dataset not found', { status: 404 });
    }

    const order = result.rows[0];
    const subtotal = Number(order.total) / 1.05; // 5% GST tax model breakdown calculation
    const gst = Number(order.total) - subtotal;

    // Clean, responsive semantic printable HTML document wrapper configuration
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt - #${order.id.slice(-6)}</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 30px; color: #333; max-w: 600px; margin: auto; }
            .header { border-bottom: 2px solid #f3f4f6; padding-bottom: 15px; margin-bottom: 20px; }
            .row { display: flex; justify-content: space-between; margin: 8px 0; font-size: 14px; }
            .bold { font-weight: bold; color: #111; }
            .table-head { border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; font-weight: bold; margin-bottom: 12px; }
            .btn { padding: 8px 16px; background: #ea580c; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 5px; }
            @media print { .no-print { display: none; } body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="no-print" style="margin-bottom: 25px; text-align: right;">
            <button class="btn" onclick="window.print()">Print Invoice</button>
          </div>
          <div class="header">
            <h2 style="margin: 0 0 5px 0; color: #ea580c;">AuraOS Restaurant Receipt</h2>
            <p style="margin: 0; font-size: 13px; color: #6b7280;">Order Ref: ${order.id}</p>
            <p style="margin: 4px 0 0 0; font-size: 13px; color: #6b7280;">Date: ${new Date(order.createdAt).toLocaleString()}</p>
          </div>
          <div class="table-head row">
            <span>Item Details</span>
            <span>Subtotal</span>
          </div>
          ${order.items.map((item: any) => `
            <div class="row">
              <span>\${item.name} <span style="color: #9ca3af;">x\${item.quantity}</span></span>
              <span>\$\${(item.price * item.quantity).toFixed(2)}</span>
            </div>
          `).join('')}
          <div style="border-top: 1px solid #f3f4f6; margin-top: 20px; padding-top: 10px;">
            <div class="row text-gray-500"><span>Subtotal Excl. Tax</span><span>\$${subtotal.toFixed(2)}</span></div>
            <div class="row text-gray-500"><span>CGST / SGST (5%)</span><span>\$${gst.toFixed(2)}</span></div>
            <div class="row bold" style="font-size: 16px; margin-top: 12px; padding-top: 12px; border-top: 2px solid #111;">
              <span>Total Paid Amount</span>
              <span>\$${Number(order.total).toFixed(2)}</span>
            </div>
          </div>
        </body>
      </html>
    `;

    return new Response(html, {
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (error) {
    console.error('Invoice system rendering break:', error);
    return new Response('Error loading invoice output screen', { status: 500 });
  }
}
