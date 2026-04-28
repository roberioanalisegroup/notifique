import { Sidebar } from "@/components/layout/sidebar";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex min-h-screen w-full max-w-full flex-col bg-[#f8fafc] text-slate-900 [color-scheme:light] md:min-h-0 md:h-screen md:flex-row"
      style={{ colorScheme: "light" }}
    >
      <Sidebar />
      <main className="relative z-0 min-h-0 w-full min-w-0 flex-1 overflow-y-auto border-l border-slate-200/80 bg-[#f8fafc] pt-16 md:pt-0">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
      </main>
    </div>
  );
}
