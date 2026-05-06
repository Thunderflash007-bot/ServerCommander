"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, User } from "lucide-react";

type TopBarUser = {
  username: string;
  displayName: string | null;
};

interface TopBarProps {
  user: TopBarUser;
}

export function TopBar({ user }: TopBarProps) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card/50 px-4 shrink-0">
      <div />
      <div className="flex items-center gap-3">
        <Link href="/profile" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition">
          <User className="w-4 h-4" />
          <span className="hidden sm:inline">{user.displayName ?? user.username}</span>
        </Link>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
