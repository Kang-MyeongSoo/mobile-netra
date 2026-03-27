'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { User, Building2, Phone, LogOut, ChevronRight } from 'lucide-react';
import { useAuthStore } from '@/features/auth/hooks/use-auth-store';
import { Button } from '@/components/ui/button';

const PROFILE_MENU = [
  { id: 'notifications', label: '알림 설정', emoji: '🔔' },
  { id: 'password', label: '비밀번호 변경', emoji: '🔒' },
  { id: 'terms', label: '이용약관', emoji: '📄' },
  { id: 'privacy', label: '개인정보처리방침', emoji: '🛡️' },
  { id: 'version', label: '앱 버전', emoji: '📱', value: 'v1.0.0' },
] as const;

export default function ProfilePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  return (
    <div className="flex flex-col">
      <header className="bg-white border-b border-gray-100 px-5 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <User className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold text-gray-900">내 정보</h1>
        </div>
      </header>

      <div className="mx-4 mt-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
          <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-gray-100 flex-shrink-0">
            <Image
              src="https://picsum.photos/seed/profile/64/64"
              alt="프로필 이미지"
              width={64}
              height={64}
              className="object-cover"
            />
          </div>
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span className="text-xs text-gray-500 truncate">
                {user?.companyCode ?? '-'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span className="text-sm font-semibold text-gray-900 truncate">
                {user?.phoneNumber
                  ? user.phoneNumber.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3')
                  : '-'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-4 mt-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {PROFILE_MENU.map((item, idx) => (
            <button
              key={item.id}
              className={`w-full flex items-center gap-3 px-4 py-4 text-left active:bg-gray-50 transition-colors ${
                idx < PROFILE_MENU.length - 1 ? 'border-b border-gray-50' : ''
              }`}
            >
              <span className="text-lg w-6 text-center">{item.emoji}</span>
              <span className="flex-1 text-sm text-gray-700">{item.label}</span>
              {'value' in item && item.value ? (
                <span className="text-xs text-gray-400">{item.value}</span>
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-300" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-4 mt-4 mb-4">
        <Button
          variant="outline"
          className="w-full h-12 text-red-500 border-red-100 hover:bg-red-50 hover:text-red-600 gap-2"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4" />
          로그아웃
        </Button>
      </div>
    </div>
  );
}
