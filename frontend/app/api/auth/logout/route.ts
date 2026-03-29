import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  cookieStore.delete("user_session");
  cookieStore.delete("user_name");

  return NextResponse.redirect(new URL("/", request.url), 302);
}
