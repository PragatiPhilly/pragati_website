import Link from "next/link";
import { peekResetToken } from "@/lib/auth/reset";
import ResetForm from "./ResetForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set your password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const valid = token ? await peekResetToken(token) : null;

  return (
    <div className="mx-auto max-w-md px-5 py-16">
      {!valid ? (
        <div className="festive-card p-8 text-center">
          <p className="text-4xl mb-3">⏳</p>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-black mb-2">This link has expired</h1>
          <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
            Reset links work once and expire for safety. Request a fresh one — it takes ten seconds.
          </p>
          <Link href="/forgot-password" className="btn-primary !py-2.5 !px-6 text-sm">
            Get a new link →
          </Link>
        </div>
      ) : (
        <>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-black mb-2 text-center">
            {valid.purpose === "invite" ? "Welcome to the team! 🪔" : "Set a new password"}
          </h1>
          <p className="text-center mb-8" style={{ color: "var(--ink-soft)" }}>
            {valid.purpose === "invite" ? "Choose a password to activate your account." : "Choose a fresh password for your account."}
          </p>
          <ResetForm token={token!} />
        </>
      )}
    </div>
  );
}
