import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  try {
    const res = await fetch(`${apiUrl}/health`, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    return NextResponse.json({ status: 'ok', backend: res.status });
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }
}
