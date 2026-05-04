"use client";

import { useEffect, useState } from "react";
import ChangePasswordModal from "@/components/auth/ChangePasswordModal";

interface User {
  id: string;
  username: string;
  mustChangePassword: boolean;
}

export default function DashboardClient({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check localStorage first for quick display
    const storedFlag = localStorage.getItem("mustChangePassword");
    if (storedFlag === "true") {
      setShowPasswordModal(true);
    }

    // Verify with server
    async function fetchUser() {
      try {
        const res = await fetch("/api/auth/me", {
          credentials: "same-origin",
        });

        if (res.ok) {
          const data = (await res.json()) as { user: User };
          setUser(data.user);
          setShowPasswordModal(data.user.mustChangePassword);

          // Update localStorage
          if (data.user.mustChangePassword) {
            localStorage.setItem("mustChangePassword", "true");
          } else {
            localStorage.removeItem("mustChangePassword");
          }
        }
      } catch (error) {
        console.error("Failed to fetch user:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchUser();
  }, []);

  function handlePasswordChanged() {
    setShowPasswordModal(false);
    localStorage.removeItem("mustChangePassword");

    // Refresh user data
    async function refreshUser() {
      try {
        const res = await fetch("/api/auth/me", {
          credentials: "same-origin",
        });

        if (res.ok) {
          const data = (await res.json()) as { user: User };
          setUser(data.user);
        }
      } catch (error) {
        console.error("Failed to refresh user:", error);
      }
    }

    refreshUser();
  }

  return (
    <>
      {children}
      <ChangePasswordModal
        isOpen={showPasswordModal}
        onClose={() => {}} // Prevent close without changing password
        onSuccess={handlePasswordChanged}
      />
    </>
  );
}
