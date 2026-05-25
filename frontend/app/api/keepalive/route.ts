import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const revalidate = 0;

export async function GET() {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/health`, {
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(10000),
    });
    return NextResponse.json({ status: 'ok', backend: res.status });
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }
}
