"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Settings, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export function UserNav() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data: { user: u } }) => setUser(u));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!user) return null;

  const isAdmin = user.app_metadata?.role === "admin";
  const displayName =
    user.user_metadata?.display_name ?? user.email?.split("@")[0] ?? "User";

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1.5">
      {isAdmin && (
        <a
          href="/admin/subscriptions"
          className="rounded-xl p-2 text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary"
          title="Manage subscriptions"
        >
          <Users className="h-4 w-4" />
        </a>
      )}
      {isAdmin && (
        <a
          href="/admin"
          className="rounded-xl p-2 text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary"
          title="Admin panel"
        >
          <Settings className="h-4 w-4" />
        </a>
      )}
      <span className="font-body text-xs text-muted-foreground px-1 hidden sm:inline">
        {displayName}
      </span>
      <button
        onClick={handleLogout}
        className="rounded-xl p-2 text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive"
        title="Sign out"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
