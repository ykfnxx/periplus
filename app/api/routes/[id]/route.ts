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

  // Check route exists first
  const existing = await prisma.route.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Route not found' }, { status: 404 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { name, description, points } = body;

  if (!name || !Array.isArray(points) || points.length === 0) {
    return NextResponse.json(
      { error: 'Invalid input: name and points required' },
      { status: 400 }
    );
  }

  // Validate point data
  for (const p of points) {
    if (!p.name || typeof p.lat !== 'number' || typeof p.lng !== 'number' || typeof p.order !== 'number') {
      return NextResponse.json(
        { error: 'Invalid point data: name, lat, lng, order required' },
        { status: 400 }
      );
    }
  }

  const route = await prisma.route.update({
    where: { id },
    data: {
      name,
      description,
      points: {
        deleteMany: {},
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

  const existing = await prisma.route.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Route not found' }, { status: 404 });
  }

  await prisma.route.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
