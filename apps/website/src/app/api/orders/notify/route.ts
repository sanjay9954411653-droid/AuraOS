import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function POST(request: Request) {
  try {
    const { orderId, currentStatus, customerPhone, customerName } = await request.json();

    if (!orderId || !currentStatus) {
      return NextResponse.json({ error: 'Missing target dispatch fields' }, { status: 400 });
    }

    // Define user-friendly messages for different status updates
    let statusMessage = '';
    switch (currentStatus) {
      case 'PREPARING':
        statusMessage = `Hi ${customerName || 'Customer'}, our kitchen has accepted your order #${orderId.slice(-6)} and is cooking it up fresh right now!`;
        break;
      case 'READY':
        statusMessage = `Great news ${customerName || 'Customer'}! Your meal #${orderId.slice(-6)} is ready for pickup or dispatch. Enjoy!`;
        break;
      case 'CANCELLED':
        statusMessage = `Hello ${customerName || 'Customer'}, your order #${orderId.slice(-6)} has been successfully cancelled.`;
        break;
      default:
        statusMessage = `Your order #${orderId.slice(-6)} status is now: ${currentStatus}.`;
    }

    console.log(`[Notification Hook Triggered] Routing to simulated external provider payload...`);
    console.log(`Target Phone: ${customerPhone || 'Guest Session'}`);
    console.log(`Body: "${statusMessage}"`);

    // NOTE: This logs instantly to your platform console output. 
    // To go live on production later, simply hook your Twilio/Meta API payload directly right here!

    return NextResponse.json({ success: true, loggedMessage: statusMessage });
  } catch (error) {
    console.error('Error handling dispatch execution:', error);
    return NextResponse.json({ error: 'Internal Notification Error' }, { status: 500 });
  }
}
