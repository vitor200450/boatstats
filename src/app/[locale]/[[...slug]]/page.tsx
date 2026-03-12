import { notFound, redirect } from "next/navigation";

import { isSupportedLocale } from "@/i18n/config";

type LocaleFallbackPageProps = {
  params: Promise<{
    locale: string;
    slug?: string[];
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function toQueryString(
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") {
      query.set(key, value);
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        query.append(key, item);
      }
    }
  }

  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

export default async function LocaleFallbackPage({
  params,
  searchParams,
}: LocaleFallbackPageProps): Promise<never> {
  const resolvedParams = await params;

  if (!isSupportedLocale(resolvedParams.locale)) {
    notFound();
  }

  const slugPath = resolvedParams.slug?.join("/") ?? "";
  const basePath = slugPath ? `/${slugPath}` : "/";
  const queryString = toQueryString(await searchParams);

  redirect(`${basePath}${queryString}`);
}
