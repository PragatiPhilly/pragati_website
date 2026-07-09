import { getAllConfig } from "@/lib/system-config";
import { getSession } from "@/lib/auth/session";
import SettingsForm from "./SettingsForm";
import { requireSectionAccess } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

const GROUPS: { title: string; note?: string; keys: { key: string; label: string; type?: "number" | "text" }[] }[] = [
  {
    title: "Payments — Zelle",
    note: "Currently pointed at the TEST email. Switch to the org's Zelle-registered email before launch — takes effect immediately, no redeploy.",
    keys: [
      { key: "zelle_recipient_email", label: "Zelle recipient email" },
      { key: "zelle_recipient_display_name", label: "Recipient display name (as buyers see it in their bank app)" },
      { key: "zelle_verification_sla_hours", label: "Verification promise (hours)", type: "number" },
      { key: "zelle_reservation_hours", label: "Seat hold after \"I've sent it\" (hours)", type: "number" },
    ],
  },
  {
    title: "Membership & pricing",
    keys: [
      { key: "membership_annual_price_cents", label: "Annual membership price (cents)", type: "number" },
      { key: "member_discount_mode", label: "Member discount mode (per_adult | whole_family)" },
    ],
  },
  {
    title: "Emails",
    note: "In test mode all outbound email is redirected to TEST_EMAIL_OVERRIDE from .env — these become live values in production.",
    keys: [
      { key: "system_email_from", label: "From address" },
      { key: "system_email_reply_to", label: "Reply-to address" },
      { key: "treasurer_notification_email", label: "Treasurer alerts go to" },
      { key: "admin_alert_email", label: "Deletion & security alerts go to" },
    ],
  },
  {
    title: "Organization",
    keys: [
      { key: "org_name", label: "Organization name" },
      { key: "org_address", label: "Address" },
      { key: "contact_email", label: "Public contact email" },
      { key: "active_event_slug", label: "Active event slug (drives homepage + theme)" },
    ],
  },
];

export default async function SettingsPage() {
  await requireSectionAccess("settings");
  const session = await getSession();
  const config = await getAllConfig();
  const isSuper = session?.role === "super_admin";

  return (
    <div className="max-w-3xl">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-1">Settings</h1>
      <p className="text-sm mb-8" style={{ color: "var(--ink-soft)" }}>
        Runtime configuration — changes apply instantly across the site. {!isSuper && "(Read-only: super-admin required to edit.)"}
      </p>
      <SettingsForm groups={GROUPS} values={config} readOnly={!isSuper} />
    </div>
  );
}
