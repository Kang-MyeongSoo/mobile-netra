'use client';

import { useRouter } from 'next/navigation';
import { LayoutGrid, TicketsPlane, NotepadText } from 'lucide-react';

const MENU_ITEMS = [
  { id: 1, title: '연차 신청', description: '연차를 신청하세요', icon: TicketsPlane, href: '/leave/request' },
  { id: 2, title: '연차 조회', description: '신청한 연차 내역을 확인하세요', icon: NotepadText, href: '/leave/history' },
];

export default function MenuPage() {
  const router = useRouter();

  return (
    <div className="flex flex-col">
      <header className="bg-white border-b border-gray-100 px-5 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold text-gray-900">메뉴</h1>
        </div>
      </header>

      <div className="px-4 py-4 flex flex-col gap-3">
        {MENU_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => router.push(item.href)}
            className="w-full bg-white rounded-xl border border-gray-100 px-4 py-4 flex items-center gap-4 text-left active:bg-gray-50 transition-colors shadow-sm"
          >
            <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0">
              <item.icon className="w-6 h-6 text-gray-600" />
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <span className="font-semibold text-gray-900 text-sm">{item.title}</span>
              <span className="text-xs text-gray-400 mt-0.5 truncate">{item.description}</span>
            </div>
            <span className="text-gray-300 text-lg">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}
