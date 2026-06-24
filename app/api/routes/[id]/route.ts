import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const route = await prisma.route.findUnique({
    where: { id },
    include: { points: { orderBy: { order: 'asc' } } },
  });

  if (!route) {
    return NextResponse.json({ error: 'Route not found' }, { status: 404 });
  }

  return NextResponse.json(route);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { name, description, points } = body;

  // Delete existing points and recreate
  await prisma.routePoint.deleteMany({ where: { routeId: id } });

  const route = await prisma.route.update({
    where: { id },
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

  return NextResponse.json(route);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.route.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
