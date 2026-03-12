import { notFound } from "next/navigation";

import { isSupportedLocale } from "@/i18n/config";

type LocaleFallbackPageProps = {
  params: Promise<{
    locale: string;
  }>;
};

export default async function LocaleFallbackPage({
  params,
}: LocaleFallbackPageProps): Promise<never> {
  const resolvedParams = await params;

  if (!isSupportedLocale(resolvedParams.locale)) {
    notFound();
  }

  notFound();
}
