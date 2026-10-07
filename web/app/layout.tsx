import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { cookies } from "next/headers";
import { Sidebar } from "@/components/shell/Sidebar";
import { ToastHost } from "@/components/shell/Toast";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Lecture Copilot",
  description: "Ask questions about lecture videos and jump to the exact moment that answers them.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // A message left by a server action (lib/flash.ts); ToastHost shows it once.
  const flash = (await cookies()).get("flash")?.value ?? null;
  return (
    <html lang="en" className={`${jakarta.variable} h-full antialiased`}>
      <body className="min-h-full font-sans lg:flex">
        <ToastHost flash={flash} />
        <Sidebar />
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:px-10 lg:py-10">{children}</main>
      </body>
    </html>
  );
}
