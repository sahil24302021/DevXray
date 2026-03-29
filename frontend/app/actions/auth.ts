// app/actions/auth.ts
// These server actions are kept for compatibility but the real auth
// is handled by Supabase client-side in the signin/signup pages.

"use server";

import { redirect } from "next/navigation";

// These are no longer used — kept to avoid import errors
export async function loginUser(_formData: FormData) {
  redirect("/signin");
}

export async function signupUser(_formData: FormData) {
  redirect("/signup");
}

export async function logoutUser() {
  redirect("/");
}
