import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url");

  if (!targetUrl) {
    return NextResponse.json({ error: "URL ausente" }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return NextResponse.json({ error: "URL inválida" }, { status: 400 });
  }

  if (!(parsedUrl.protocol === "https:" || parsedUrl.protocol === "http:")) {
    return NextResponse.json({ error: "Protocolo não suportado" }, { status: 400 });
  }

  try {
    const upstream = await fetch(parsedUrl.toString(), {
      cache: "force-cache",
      next: { revalidate: 3600 },
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: "Falha ao carregar imagem" }, { status: 502 });
    }

    const contentType = upstream.headers.get("content-type") || "image/*";
    const body = await upstream.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Erro ao buscar imagem" }, { status: 500 });
  }
}
