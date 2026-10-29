import { permanentRedirect } from "next/navigation";

/**
 * The draft queue moved into the Content Plan's approval tab, so its old address is kept as a
 * redirect rather than a 404: every bookmark and every link already in an admin's hands lands
 * on the page that now holds the queue. Permanent, because the queue is not coming back here.
 */
export default function SubmissionsPage() {
  permanentRedirect("/admin/content-plan?tab=action");
}
