import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";

function getRazorpay() {
  return new Razorpay({
    key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
  });
}

export async function POST(req: NextRequest) {
  try {
    const { plan, userId } = await req.json();

    const amounts: Record<string, number> = {
      starter: 99900, // ₹999 in paise
      pro: 249900, // ₹2,499 in paise
    };

    const amount = amounts[plan];
    if (!amount) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const order = await getRazorpay().orders.create({
      amount,
      currency: "INR",
      receipt: `receipt_${userId}_${Date.now()}`,
      notes: { plan, userId },
    });

    return NextResponse.json({
      orderId: order.id,
      amount,
      currency: "INR",
    });
  } catch (e: any) {
    console.error("[Payment] Order creation failed:", e);
    return NextResponse.json(
      { error: "Payment init failed" },
      { status: 500 }
    );
  }
}
