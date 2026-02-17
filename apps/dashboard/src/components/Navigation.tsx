"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/" as const, label: "Home", icon: "H" },
  { href: "/sessions" as const, label: "Sessions", icon: "S" },
  { href: "/knowledge" as const, label: "Knowledge", icon: "K" },
  { href: "/agents" as const, label: "Agents", icon: "A" },
  { href: "/files" as const, label: "Files", icon: "F" },
  { href: "/tiktok" as const, label: "TikTok", icon: "T" },
];

function NavItems({
  pathname,
  onItemClick,
}: {
  pathname: string;
  onItemClick?: () => void;
}) {
  return (
    <>
      {NAV_ITEMS.map((item) => {
        const isActive =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onItemClick}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none ${
              isActive
                ? "bg-blue-600 text-white"
                : "text-slate-300 hover:bg-slate-700 hover:text-white"
            }`}
          >
            <span
              className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold ${
                isActive
                  ? "bg-blue-500 text-white"
                  : "bg-slate-700 text-slate-400"
              }`}
            >
              {item.icon}
            </span>
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

export default function Navigation() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState<boolean>(false);

  return (
    <>
      {/* Hamburger button - mobile only */}
      <button
        type="button"
        aria-label="メニュー"
        className="fixed top-4 left-4 z-50 md:hidden p-2 rounded-lg bg-slate-800 text-white"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        {isOpen ? (
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        ) : (
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        )}
      </button>

      {/* Mobile menu overlay */}
      {isOpen && (
        <>
          <div
            data-testid="mobile-overlay"
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setIsOpen(false)}
          />
          <div className="fixed top-0 left-0 w-64 h-screen bg-slate-800 text-slate-300 z-50 flex flex-col md:hidden">
            <div className="px-5 py-6 border-b border-slate-700">
              <h1 className="text-lg font-bold text-white tracking-wide">
                Argus
              </h1>
              <p className="text-xs text-slate-500 mt-1">AI Agent Dashboard</p>
            </div>
            <div className="flex-1 py-4 space-y-1 px-3">
              <NavItems
                pathname={pathname}
                onItemClick={() => setIsOpen(false)}
              />
            </div>
            <div className="px-5 py-4 border-t border-slate-700 text-xs text-slate-500">
              v0.1.0
            </div>
          </div>
        </>
      )}

      {/* Desktop nav - hidden on mobile */}
      <nav
        aria-label="メインナビゲーション"
        className="hidden md:flex fixed top-0 left-0 w-56 h-screen bg-slate-800 text-slate-300 flex-col"
      >
        <div className="px-5 py-6 border-b border-slate-700">
          <h1 className="text-lg font-bold text-white tracking-wide">Argus</h1>
          <p className="text-xs text-slate-500 mt-1">AI Agent Dashboard</p>
        </div>
        <div className="flex-1 py-4 space-y-1 px-3">
          <NavItems pathname={pathname} />
        </div>
        <div className="px-5 py-4 border-t border-slate-700 text-xs text-slate-500">
          v0.1.0
        </div>
      </nav>
    </>
  );
}
