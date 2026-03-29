"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function loginUser(formData: FormData) {
  const email = formData.get("email") as string;
  const name = email ? email.split("@")[0] : "Developer";
  
  const cookieStore = await cookies();
  cookieStore.set("user_session", "true", { path: "/" });
  cookieStore.set("user_name", name, { path: "/" });

  redirect("/dashboard");
}

export async function signupUser(formData: FormData) {
  const name = formData.get("name") as string || "Developer";
  
  const cookieStore = await cookies();
  cookieStore.set("user_session", "true", { path: "/" });
  cookieStore.set("user_name", name, { path: "/" });

  redirect("/dashboard");
}

export async function logoutUser() {
  const cookieStore = await cookies();
  cookieStore.delete("user_session");
  cookieStore.delete("user_name");
  redirect("/");
}
