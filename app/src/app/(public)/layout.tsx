import Header from "@/components/site/Header";
import Footer from "@/components/site/Footer";
import ThemeWorld from "@/components/site/ThemeWorld";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeWorld>
      <Header />
      <main className="min-h-[70vh]">{children}</main>
      <Footer />
    </ThemeWorld>
  );
}
