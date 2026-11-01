import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { ConsentForm } from "./consent-form";
import { SetupNotice } from "@/components/site/setup-notice";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Согласие на обработку данных", robots: { index: false } };

export default async function ConsentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!isSupabaseConfigured) {
    return <SetupNotice />;
  }

  const supabase = await createClient();
  const { data: texts } = await supabase
    .from("public_consent_text")
    .select("version, body_md")
    .limit(1);
  const text = texts?.[0];

  return (
    <div className="mx-auto max-w-xl space-y-4 py-2">
      {!text ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted">
            Текст согласия не настроен. Обратитесь к организатору.
          </CardContent>
        </Card>
      ) : (
        <ConsentForm token={token} version={text.version} bodyMd={text.body_md} />
      )}
    </div>
  );
}
