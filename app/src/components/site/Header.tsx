import Link from "next/link";
import { site } from "@/config/site";
import { getSession } from "@/lib/auth/session";
import { logoutAction } from "@/lib/auth/actions";
import MobileNav from "./MobileNav";
import HeaderScroll from "./HeaderScroll";

export default async function Header() {
  const session = await getSession();
  const isAdmin = session && (session.role === "admin" || session.role === "super_admin");

  return (
    <>
      <HeaderScroll />
      <header className="site-header sticky top-0 z-40 backdrop-blur-md border-b">
        <div className="hdr-inner mx-auto max-w-6xl px-5 flex items-center justify-between gap-4">
          <Link href="/" className="group flex items-center min-w-0" aria-label="Pragati — home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/header-logo-full.png"
              alt="Pragati — The Bengali Association of Greater Philadelphia, since 1972"
              className="hdr-logo shrink-0 w-auto group-hover:scale-[1.02]"
            />
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {site.nav.map((n) => (
              <Link key={n.href} href={n.href} className="group text-center hover:opacity-75 transition-opacity">
                <span className="block font-[family-name:var(--font-bangla)] text-[11px] leading-none mb-0.5" style={{ color: "var(--terracotta)" }}>
                  {n.bn}
                </span>
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3 text-sm shrink-0">
            <MobileNav nav={site.nav} signedIn={!!session} isAdmin={!!isAdmin} />
            {session ? (
              <>
                {isAdmin ? (
                  <Link href="/admin" className="btn-secondary !py-2 !px-4 text-sm hidden sm:inline-flex">
                    Admin
                  </Link>
                ) : (
                  <Link href="/m" className="btn-secondary !py-2 !px-4 text-sm hidden sm:inline-flex">
                    My Pragati
                  </Link>
                )}
                <form action={logoutAction}>
                  <button className="hover:opacity-70 transition-opacity font-medium">Sign out</button>
                </form>
              </>
            ) : (
              <>
                <Link href="/login" className="font-medium hover:opacity-70 transition-opacity hidden sm:inline">
                  Sign in
                </Link>
                <Link href="/signup" className="btn-primary !py-2 !px-4 text-sm hidden sm:inline-flex">
                  Become a member
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
