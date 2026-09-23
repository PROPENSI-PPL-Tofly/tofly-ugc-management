"use client";

import { Modal } from "@/components/ui/modal";

// Not implemented yet — fields and behavior arrive one at a time, each in its own
// RED/GREEN/REFACTOR cycle.
export function AddCreatorModal({ onClose }: { onClose: () => void }) {
  return <Modal title="Tambah Creator" onClose={onClose}>{null}</Modal>;
}
