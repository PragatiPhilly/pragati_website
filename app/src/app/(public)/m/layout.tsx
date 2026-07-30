import Link from "next/link";
import { redirect } from "next/navigation";
import { memberPortalEnabled } from "@/lib/member-mode";

export const dynamic = "force-dynamic";

const TABS = [
  { href: "/m", label: "Overview" },
  { href: "/m/family", label: "My family" },
  { href: "/m/tickets", label: "My tickets" },
  { href: "/m/profile", label: "Profile" },
];

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  // Honor mode: no member portal. Nobody should be here — send them home.
  if (!(await memberPortalEnabled())) redirect("/");

  return (
    <div className="mx-auto max-w-4xl px-5 py-12">
      <div className="flex gap-2 mb-10 flex-wrap">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className="choice-chip !py-2 !px-5 text-sm">
            {t.label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}
