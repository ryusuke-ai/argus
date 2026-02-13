import type { Metadata } from "next";
import "./globals.css";
import Navigation from "@/components/Navigation";

export const metadata: Metadata = {
  title: "Argus Dashboard",
  description: "AI Agent Harness Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="flex min-h-screen">
        <Navigation />
        <div className="flex-1 ml-56">{children}</div>
      </body>
    </html>
  );
}
