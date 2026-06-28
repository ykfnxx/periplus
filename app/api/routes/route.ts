import { NextRequest, NextResponse } from 'next/server';
import { createRoute, listRoutes, RouteInputError } from '@/lib/routes/service';

export async function GET() {
  const routes = await listRoutes();
  return NextResponse.json(routes);
}

export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const route = await createRoute(body);
    return NextResponse.json(route, { status: 201 });
  } catch (error) {
    if (error instanceof RouteInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
