"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Container,
  FolderOpen,
  Terminal,
  Users,
  Shield,
  ScrollText,
  ChevronLeft,
  Menu,
  Layers3,
  Mail,
  UserCircle2,
} from "lucide-react";
import { useState } from "react";
import type { UserPermission } from "@prisma/client";

type SidebarUser = {
  username: string;
  role: string;
};

interface SidebarProps {
  user: SidebarUser;
  permissions: UserPermission | null;
}

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, always: true },
  { href: "/containers", label: "Containers", icon: Container, perm: "dockerAccess" as const },
  { href: "/stacks", label: "Stacks", icon: Layers3, perm: "dockerAccess" as const },
  { href: "/files", label: "Files", icon: FolderOpen, perm: "fsAccess" as const },
  { href: "/terminal", label: "Terminal", icon: Terminal, perm: "terminalAccess" as const },
  { href: "/profile", label: "Profile", icon: UserCircle2, always: true },
  { href: "/settings/smtp", label: "SMTP", icon: Mail, adminOnly: true },
  { href: "/settings/ssh-sftp", label: "SSH/SFTP", icon: Terminal, adminOnly: true },
  { href: "/users", label: "Users", icon: Users, adminOnly: true },
  { href: "/audit", label: "Audit Log", icon: ScrollText, adminOnly: true },
];

export function Sidebar({ user, permissions }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const visibleItems = navItems.filter((item) => {
    if (item.always) return true;
    if (item.adminOnly) return user.role === "ADMIN";
    if (item.perm && permissions) return !!permissions[item.perm];
    return false;
  });

  return (
    <>
      {/* Mobile overlay */}
      <div className={`fixed inset-0 z-40 bg-black/50 lg:hidden ${collapsed ? "hidden" : ""}`} onClick={() => setCollapsed(true)} />

      <aside
        className={`
          relative z-50 flex flex-col h-full border-r border-border bg-sidebar
          transition-all duration-200 overflow-hidden
          ${collapsed ? "w-16" : "w-60"}
        `}
      >
        {/* Header */}
        <div className="flex h-14 items-center justify-between px-4 border-b border-sidebar-border shrink-0">
          {!collapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <Shield className="w-5 h-5 text-primary shrink-0" />
              <span className="text-sm font-bold text-sidebar-foreground truncate">ServerCommander</span>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition ml-auto"
            aria-label="Toggle sidebar"
          >
            {collapsed ? <Menu className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {visibleItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={`
                  flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition
                  ${active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                  }
                `}
                title={collapsed ? label : undefined}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span>{label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        {!collapsed && (
          <div className="shrink-0 border-t border-sidebar-border px-4 py-3">
            <div className="text-xs text-sidebar-foreground/50">
              <span className="font-medium text-sidebar-foreground/70">{user.username}</span>
              <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                {user.role}
              </span>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
