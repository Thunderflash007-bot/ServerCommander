import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import DashboardClient from "@/components/layout/DashboardClient";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar user={user} permissions={user.permissions} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar user={user} />
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          <DashboardClient>{children}</DashboardClient>
        </main>
      </div>
    </div>
  );
}
