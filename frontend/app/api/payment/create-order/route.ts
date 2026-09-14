import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";

function getRazorpay() {
  const key_id = (process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "").trim();
  const key_secret = (process.env.RAZORPAY_KEY_SECRET || "").trim();
  return new Razorpay({
    key_id,
    key_secret,
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

    const keyId = (process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "").trim();
    const keySecret = (process.env.RAZORPAY_KEY_SECRET || "").trim();

    if (!keyId || !keySecret) {
      console.error("[Payment] Missing Razorpay credentials in environment variables");
      return NextResponse.json(
        { error: "Razorpay environment variables are not configured in Vercel. Set NEXT_PUBLIC_RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET." },
        { status: 500 }
      );
    }

    // Razorpay receipt has a 40-char limit — use a short hash
    const shortId = userId ? userId.slice(0, 8) : "anon";
    const receipt = `dx_${plan}_${shortId}_${Date.now().toString(36)}`;

    console.log("[Payment] Creating order:", { plan, amount, receipt, userId: shortId });

    const order = await getRazorpay().orders.create({
      amount,
      currency: "INR",
      receipt,
      notes: { plan, userId: userId || "unknown" },
    });

    console.log("[Payment] Order created:", order.id);

    return NextResponse.json({
      orderId: order.id,
      amount,
      currency: "INR",
      keyId,
    });
  } catch (e: any) {
    // Log the full Razorpay error for debugging
    const errorDetail = e?.error?.description || e?.message || String(e);
    const statusCode = e?.statusCode || e?.error?.code || "unknown";
    console.error("[Payment] Order creation failed:", {
      statusCode,
      error: errorDetail,
      fullError: JSON.stringify(e?.error || e?.message || e),
    });
    return NextResponse.json(
      { error: `Payment init failed: ${errorDetail}` },
      { status: 500 }
    );
  }
}
