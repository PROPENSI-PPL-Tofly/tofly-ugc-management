import { AppShell } from "@/components/shell/app-shell";
import { ContentPlanClient } from "@/components/contents/content-plan-client";
import { parsePage } from "@/lib/creators";

export const metadata = {
  title: "Content Plan — Tofly",
};

export default async function ContentPlanPage({
                                                params,
                                                searchParams,
                                              }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { page } = parsePage(await searchParams);

  return (
      <AppShell
          title="Content Plan"
          subtitle="Kelola jadwal konten creator"
      >
        <ContentPlanClient creatorId={id} page={page} />
      </AppShell>
  );
}