"use client";

/** Smooth-scrolls to an anchor every time it's clicked (a plain #hash link
 *  only works the first time), and keeps the URL clean. */
export default function ScrollLink({
  to,
  className,
  children,
}: {
  to: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={`#${to}`}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        document.getElementById(to)?.scrollIntoView({ behavior: "smooth", block: "start" });
        history.replaceState(null, "", window.location.pathname);
      }}
    >
      {children}
    </a>
  );
}
