import { NextResponse } from "next/server";

export async function GET() {
  const backend = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  const url = `${backend.replace(/\/$/, "")}/health`;

  try {
    const resp = await fetch(url, { cache: "no-store" });
    const body = await resp.json().catch(() => null);

    return NextResponse.json(
      { upstream: body ?? null, status: resp.ok ? "ok" : "unhealthy" },
      { status: resp.ok ? 200 : 503 },
    );
  } catch (err) {
    return NextResponse.json(
      { status: "error", error: String(err) },
      { status: 503 },
    );
  }
}
