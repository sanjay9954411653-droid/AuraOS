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
        o.status,
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
      return NextResponse.json({ error: 'Order profile not found' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Database track fail handling:', error);
    return NextResponse.json({ error: 'Internal Server Sync Error' }, { status: 500 });
  }
}
