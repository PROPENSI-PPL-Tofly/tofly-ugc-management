import { AppShell } from "@/components/shell/app-shell";
import { ContentPlanClient } from "@/components/contents/content-plan-client";

export const metadata = {
  title: "Content Plan — Tofly",
};

export default async function ContentPlanPage({
                                                params,
                                              }: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
      <AppShell
          title="Content Plan"
          subtitle="Kelola jadwal konten creator"
      >
        <ContentPlanClient creatorId={id} />
      </AppShell>
  );
}