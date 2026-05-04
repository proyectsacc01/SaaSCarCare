import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://saascarcare-production.up.railway.app';

export async function POST(req: NextRequest) {
    const token = req.headers.get('authorization') || '';
    const body = await req.json().catch(() => ({}));

    try {
        const res = await fetch(`${API_URL}/api/conductores/me/sos`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: token } : {}),
            },
            body: JSON.stringify(body),
        });

        const data = await res.json().catch(() => ({}));
        return NextResponse.json(data, { status: res.status });
    } catch {
        return NextResponse.json({ error: 'Sin conexión con el servidor' }, { status: 503 });
    }
}
