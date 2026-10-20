import { getSiteTheme } from "@/lib/theme";
import KaliSky from "@/components/site/KaliSky";

/**
 * Wraps a public page in its festival "world". For Kali that is the animated
 * Amavasya sky plus the .kali-world scope every Kali style hangs off
 * (styles/kali.css). Durga and Saraswati render exactly as before.
 */
export default async function ThemeWorld({ children }: { children: React.ReactNode }) {
  const theme = await getSiteTheme();
  if (theme !== "kali") return <>{children}</>;
  return (
    <div className="kali-world">
      <KaliSky />
      {children}
    </div>
  );
}
