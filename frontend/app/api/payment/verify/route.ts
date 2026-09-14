import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      plan,
      userId,
    } = await req.json();

    if (!process.env.RAZORPAY_KEY_SECRET) {
      return NextResponse.json(
        { error: "RAZORPAY_KEY_SECRET is not configured in Vercel environment variables" },
        { status: 500 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: "User is not logged in. Please sign in before completing payment." },
        { status: 400 }
      );
    }

    // 1. Verify HMAC signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSig = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSig !== razorpay_signature) {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 400 }
      );
    }

    // 2. Update user plan in Supabase (using service role key for server-side writes)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Supabase credentials missing on server (SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL)" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1);

    // Update profile
    await supabase
      .from("profiles")
      .update({
        plan,
        subscription_status: "active",
        subscription_end_date: endDate.toISOString(),
        github_scans_used: 0,
        resume_scans_used: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    // Record payment
    await supabase.from("payments").insert({
      user_id: userId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      plan,
      amount: plan === "starter" ? 99900 : 249900,
      status: "success",
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[Payment] Verification failed:", e);
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 500 }
    );
  }
}
