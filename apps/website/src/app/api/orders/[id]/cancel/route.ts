import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const orderId = params.id;

    // 1. Fetch current database status state record
    const statusCheck = await pool.query('SELECT status FROM orders WHERE id = $1', [orderId]);

    if (statusCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const currentStatus = statusCheck.rows[0].status;

    // 2. Restrict cancellations if preparation tracking has advanced past CREATED
    if (currentStatus !== 'CREATED') {
      return NextResponse.json(
        { error: 'Order cannot be cancelled because preparation has already started.' },
        { status: 400 }
      );
    }

    // 3. Complete structural table state modification update
    await pool.query('UPDATE orders SET status = $1 WHERE id = $2', ['CANCELLED', orderId]);

    return NextResponse.json({ success: true, message: 'Order successfully cancelled.' });
  } catch (error) {
    console.error('Error handling order cancellation:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
