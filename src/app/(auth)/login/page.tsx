'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuthStore } from '@/features/auth/hooks/use-auth-store';
import { LoginForm } from '@/features/auth/components/login-form';

export default function LoginPage() {
  const router = useRouter();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);

  useEffect(() => {
    if (isLoggedIn()) {
      router.replace('/menu');
    }
  }, [isLoggedIn, router]);

  return (
    <div className="min-h-dvh flex flex-col bg-gray-50">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-10">
            <div className="w-20 h-20 rounded-2xl overflow-hidden mb-4 shadow-md">
              <Image
                src="https://picsum.photos/seed/netra/80/80"
                alt="Netra 로고"
                width={80}
                height={80}
                className="object-cover"
              />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Netra</h1>
            <p className="text-sm text-gray-500 mt-1">회사 코드와 전화번호로 로그인하세요</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <LoginForm />
          </div>
        </div>
      </div>

      <footer className="py-4 text-center text-xs text-gray-400">
        © 2026 Netra. All rights reserved.
      </footer>
    </div>
  );
}
