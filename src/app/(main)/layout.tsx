'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/features/auth/hooks/use-auth-store';
import { BottomTabNav } from '@/features/main/components/bottom-tab-nav';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace('/login');
    }
  }, [isLoggedIn, router]);

  return (
    <div className="min-h-dvh flex flex-col bg-gray-50">
      <main className="flex-1 pb-16 overflow-y-auto">
        {children}
      </main>
      <BottomTabNav />
    </div>
  );
}
