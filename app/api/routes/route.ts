import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const routes = await prisma.route.findMany({
    include: { points: { orderBy: { order: 'asc' } } },
    orderBy: { updatedAt: 'desc' },
  });
  return NextResponse.json(routes);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const { name, description, points } = body;

  if (!name || !Array.isArray(points) || points.length === 0) {
    return NextResponse.json(
      { error: 'Invalid input: name and points required' },
      { status: 400 }
    );
  }

  const route = await prisma.route.create({
    data: {
      name,
      description,
      points: {
        create: points.map((p: { name: string; lat: number; lng: number; order: number; stayDays?: number; notes?: string }) => ({
          name: p.name,
          lat: p.lat,
          lng: p.lng,
          order: p.order,
          stayDays: p.stayDays,
          notes: p.notes,
        })),
      },
    },
    include: { points: { orderBy: { order: 'asc' } } },
  });

  return NextResponse.json(route, { status: 201 });
}
