import { NextResponse } from "next/server";

const DEFAULT_ALLOWED_IMAGE_HOSTS = new Set([
  "cdn.discordapp.com",
  "ui-avatars.com",
]);

function readAllowedImageHosts(): Set<string> {
  const allowedHosts = new Set(DEFAULT_ALLOWED_IMAGE_HOSTS);

  const envHosts = process.env.IMAGE_PROXY_ALLOWED_HOSTS;
  if (envHosts) {
    for (const host of envHosts.split(",").map((value) => value.trim().toLowerCase())) {
      if (host) {
        allowedHosts.add(host);
      }
    }
  }

  const r2PublicUrl = process.env.R2_PUBLIC_URL;
  if (r2PublicUrl) {
    try {
      const r2Host = new URL(r2PublicUrl).hostname.toLowerCase();
      if (r2Host) {
        allowedHosts.add(r2Host);
      }
    } catch {
      // Ignore invalid R2_PUBLIC_URL format and keep defaults/env list.
    }
  }

  return allowedHosts;
}

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

  if (parsedUrl.protocol !== "https:") {
    return NextResponse.json({ error: "Protocolo não suportado" }, { status: 400 });
  }

  const allowedHosts = readAllowedImageHosts();
  const targetHost = parsedUrl.hostname.toLowerCase();
  if (!allowedHosts.has(targetHost)) {
    return NextResponse.json({ error: "Host não permitido" }, { status: 403 });
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
