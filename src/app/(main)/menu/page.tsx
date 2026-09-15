"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutGrid,
  CalendarDays,
  Wallet,
  HardHat,
  ChevronDown,
  ChevronUp,
  FilePen,
  Search,
  ClipboardCheck,
  type LucideIcon,
} from "lucide-react";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";
import { useMenuStore } from "@/features/menu/use-menu-store";
import type { MenuDBItem } from "@/app/api/menu-visibility/route";

const FILE_TYPE_ICON_MAP: Record<string, LucideIcon> = {
  "1": FilePen,       // 입력
  "2": Search,        // 조회
  "3": ClipboardCheck, // 처리
};

const GROUP_ICON_MAP: Record<string, LucideIcon> = {
  LEAVE:  CalendarDays,
  EXP:    Wallet,
  DAILY:  HardHat,
  SCH:    CalendarDays,
};

const PARENT_LABEL_MAP: Record<string, string> = {
  LEAVE:    "연차/휴가",
  EXP:      "지출결의",
  DAILY:    "일용직 인사정보",
  SCH:      "일정관리",
  MOBILE_A: "일정 관리",
  MOBILE_B: "연차/휴가",
  MOBILE_C: "지출결의",
  MOBILE_D: "승인관리",
};

function menuItemIcon(fileType?: string | null): LucideIcon {
  return FILE_TYPE_ICON_MAP[fileType ?? ""] ?? FilePen;
}
function groupIcon(menuId: string): LucideIcon {
  return GROUP_ICON_MAP[menuId] ?? LayoutGrid;
}

const MENU_COLLAPSE_KEY = "menu-collapsed-groups";

type Section = {
  key: string;
  label: string;
  groupIcon: LucideIcon;
  items: { key: string; title: string; icon: LucideIcon; href: string }[];
};

export default function MenuPage() {
  const router = useRouter();
  const companyCode = useAuthStore((s) => s.user?.companyCode ?? "");
  const empCode     = useAuthStore((s) => s.user?.emp_code ?? "");
  const userId      = useAuthStore((s) => s.user?.user_id || s.user?.emp_code || "");
  const companyName = useAuthStore((s) => s.user?.corp_name);

  const storeItems = useMenuStore((s) => s.items);
  const storePerms = useMenuStore((s) => s.perms);
  const setMenuStoreItems = useMenuStore((s) => s.setItems);
  const setMenuStorePerms = useMenuStore((s) => s.setPerms);
  const [dbLoaded, setDbLoaded] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const raw = sessionStorage.getItem(MENU_COLLAPSE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch { return {}; }
  });

  useEffect(() => {
    if (!companyCode || !userId) {
      setDbLoaded(true);
      return;
    }
    if (storeItems.length > 0) {
      setDbLoaded(true);
      return;
    }
    const params = new URLSearchParams({ companyCode, userId, userType: "U" });
    fetch(`/api/menu-visibility?${params.toString()}`)
      .then((r) => r.json())
      .then((data: { items: MenuDBItem[] | null; perms?: Record<string, { view: boolean; add: boolean; edit: boolean; del: boolean; approve: boolean }> }) => {
        const arr = Array.isArray(data.items) ? data.items : [];
        setMenuStoreItems(arr);
        if (data.perms) setMenuStorePerms(data.perms);
        setDbLoaded(true);
      })
      .catch(() => { setDbLoaded(true); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyCode, empCode]);

  const sections = useMemo((): Section[] => {
    if (!dbLoaded) return [];

    const canView = (menuId: string) => {
      const perm = storePerms[menuId];
      return !perm || perm.view;
    };
    const parentViewable = (menuId: string) => {
      const perm = storePerms[menuId];
      return !perm || perm.view;
    };

    const dbItems = storeItems;
    if (dbItems.length === 0) return [];

    // menu_id가 다른 항목의 menu_pid로 쓰이면 부모
    const allPids = new Set(dbItems.map((m) => m.menu_pid).filter(Boolean));
    const isParent = (m: MenuDBItem) => allPids.has(m.menu_id);
    const hasParents = dbItems.some(isParent);

    let dbSections: Section[];

    if (hasParents) {
      const parents = dbItems
        .filter(isParent)
        .filter((p) => parentViewable(p.menu_id))
        .sort((a, b) => Number(a.menu_order) - Number(b.menu_order));

      dbSections = parents
        .map((parent) => {
          const children = dbItems
            .filter((m) => !isParent(m) && m.menu_pid === parent.menu_id && canView(m.menu_id))
            .sort((a, b) => Number(a.menu_order) - Number(b.menu_order));
          return {
            key: parent.menu_id,
            label: parent.menu_name,
            groupIcon: groupIcon(parent.menu_id),
            items: children.map((c) => ({
              key: c.menu_id,
              title: c.menu_name,
              icon: menuItemIcon(c.menu_file_type),
              href: c.menu_exec ? `/${c.menu_exec}` : `/${parent.menu_id}/${c.menu_id}`,
            })),
          };
        })
        .filter((s) => s.items.length > 0);
    } else {
      const labelKeys = Object.keys(PARENT_LABEL_MAP);
      const pidOrder: string[] = [];
      const grouped = new Map<string, MenuDBItem[]>();
      for (const item of dbItems) {
        const pid = item.menu_pid && item.menu_pid !== "NULL" ? item.menu_pid : null;
        if (!pid || !canView(item.menu_id)) continue;
        if (!parentViewable(pid)) continue;
        if (!grouped.has(pid)) {
          pidOrder.push(pid);
          grouped.set(pid, []);
        }
        grouped.get(pid)!.push(item);
      }
      dbSections = pidOrder
        .sort((a, b) => {
          const ai = labelKeys.indexOf(a);
          const bi = labelKeys.indexOf(b);
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        })
        .map((pid) => ({
          key: pid,
          label: PARENT_LABEL_MAP[pid] ?? pid,
          groupIcon: groupIcon(pid),
          items: (grouped.get(pid) ?? [])
            .sort((a, b) => Number(a.menu_order) - Number(b.menu_order))
            .map((c) => ({
              key: c.menu_id,
              title: c.menu_name,
              icon: menuItemIcon(c.menu_file_type),
              href: c.menu_exec ? `/${c.menu_exec}` : `/${pid}/${c.menu_id}`,
            })),
        }))
        .filter((s) => s.items.length > 0);
    }

    return dbSections;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeItems, storePerms, dbLoaded]);

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { sessionStorage.setItem(MENU_COLLAPSE_KEY, JSON.stringify(next)); } catch { /* 무시 */ }
      return next;
    });
  }

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 z-10 border-b border-gray-100 bg-white px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold text-gray-900">메뉴</h1>
          </div>
          {companyName ? (
            <span className="max-w-[50%] truncate text-lg font-bold text-gray-400">
              {companyName}
            </span>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <div className="px-4 py-4 flex flex-col gap-3">
          {dbLoaded && sections.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-16">
              <LayoutGrid className="w-10 h-10 text-gray-200" />
              <p className="text-sm text-gray-400">접근 가능한 메뉴가 없습니다</p>
              <p className="text-xs text-gray-300">관리자에게 권한을 요청하세요</p>
            </div>
          )}
          {sections.map((section) => {
            const GroupIcon = section.groupIcon;
            const collapsed = collapsedGroups[section.key] ?? true;
            return (
              <section key={section.key} className="flex flex-col gap-3 first:mt-0 mt-3">
                <button
                  type="button"
                  onClick={() => toggleGroup(section.key)}
                  className="px-1 py-1 flex items-center justify-between text-left"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <GroupIcon className="w-4 h-4 text-gray-900" />
                    {section.label}
                  </span>
                  {collapsed
                    ? <ChevronDown className="w-4 h-4 text-gray-400" />
                    : <ChevronUp className="w-4 h-4 text-gray-400" />}
                </button>

                {!collapsed && section.items.map((item) => {
                  const ItemIcon = item.icon;
                  return (
                    <button
                      key={item.key}
                      onClick={() => router.push(item.href)}
                      className="w-full bg-white rounded-xl border border-gray-100 px-4 py-4 flex items-center gap-4 text-left active:bg-gray-50 transition-colors shadow-sm"
                    >
                      <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0">
                        <ItemIcon className="w-6 h-6 text-gray-600" />
                      </div>
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="font-semibold text-gray-900 text-sm">
                          {item.title}
                        </span>
                      </div>
                      <span className="text-gray-300 text-lg">›</span>
                    </button>
                  );
                })}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
