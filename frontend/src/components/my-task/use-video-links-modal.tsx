"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useToast } from "@/components/ui/toast";
import type { PanelActionFacts } from "@/lib/panel-actions";
import type { Role } from "@/lib/session";
import { SubmitVideoModal } from "./submit-video-modal";

/** Adding is the creator's route alone (POST is creator-only), so an admin only gets sent links. */
const ADMIN_PLATFORMS = [] as const;

/**
 * Hosts Kirim Link Video for a content whose links are already sent, so every board that opens
 * Content Detail offers adding and replacing the same way. A save confirms with a toast and
 * refreshes the page behind it, which re-reads the links.
 */
export function useVideoLinksModal(role: Role): {
  openLinks: (detail: PanelActionFacts) => void;
  linksModal: ReactNode;
} {
  const router = useRouter();
  const { show: confirm, toast } = useToast();
  const [opened, setOpened] = useState<PanelActionFacts | null>(null);

  const linksModal = (
    <>
      {opened ? (
        // Keyed by content so another content's links start from their own values.
        <SubmitVideoModal
          key={opened.id}
          content={opened}
          platforms={role === "admin" ? ADMIN_PLATFORMS : undefined}
          links={opened.links}
          onClose={() => setOpened(null)}
          onSubmitted={() => {
            confirm("Link video diperbarui.");
            router.refresh();
          }}
          onPartlySaved={() => router.refresh()}
        />
      ) : null}
      {toast}
    </>
  );

  return { openLinks: setOpened, linksModal };
}
