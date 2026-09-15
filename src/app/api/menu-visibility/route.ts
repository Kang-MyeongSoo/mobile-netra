import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveCompanyErpBaseUrl } from "@/lib/erp/resolve-company-erp-base-url";

const querySchema = z.object({
  companyCode: z.string().min(1),
  userId: z.string().min(1),
  userType: z.string().optional(),
});

export interface MenuDBItem {
  menu_id: string;
  menu_pid: string | null;
  menu_name: string;
  menu_exec: string;
  menu_order: number;
  use_yn?: string;
  menu_input_type?: string | null;
}

interface MenuApiResponse {
  Flag: string;
  MSG: string;
  items: MenuDBItem[];
}

interface PermissionApiResponse {
  Flag: string;
  MSG: string;
  items: Record<string, unknown>[];
}

export interface MenuPerm {
  view: boolean;
  add: boolean;
  edit: boolean;
  del: boolean;
  approve: boolean;
}

function yn(v: unknown): boolean { return v === "Y" || v === "y"; }

function normRow(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) out[k.toLowerCase()] = v;
  return out;
}

function rowToPerm(raw: Record<string, unknown>): MenuPerm {
  const r = normRow(raw);
  const hasCrud = "per_ret" in r || "per_ins" in r || "per_mod" in r || "per_del" in r;
  if (!hasCrud) return { view: true, add: true, edit: true, del: true, approve: true };
  return {
    view: yn(r.per_ret),
    add: yn(r.per_ins),
    edit: yn(r.per_mod),
    del: yn(r.per_del),
    approve: yn(r.per_apv),
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const parsed = querySchema.safeParse({
    companyCode: searchParams.get("companyCode"),
    userId: searchParams.get("userId"),
    userType: searchParams.get("userType") ?? undefined,
  });

  if (!parsed.success) return NextResponse.json({ items: null });

  const { companyCode, userId, userType } = parsed.data;

  const resolved = await resolveCompanyErpBaseUrl(companyCode);
  if (resolved.status !== "ok") return NextResponse.json({ items: null });

  const { baseUrl } = resolved;

  const menuFetch = fetch(
    `${baseUrl}/R2JsonProc.asp?proc=usp_mobile_get_env_mobile_menu&param1=`,
    { cache: "no-store" },
  ).catch(() => null);

  const permFetch = userType !== "S"
    ? fetch(
        `${baseUrl}/R2JsonProc.asp?proc=usp_mobile_get_env_mobile_permission&param1=${encodeURIComponent(userId)}`,
        { cache: "no-store" },
      ).catch(() => null)
    : Promise.resolve(null);

  const [menuRes, permRes] = await Promise.all([menuFetch, permFetch]);

  if (!menuRes?.ok) return NextResponse.json({ items: null });

  const menuData: MenuApiResponse = await menuRes.json().catch(() => null);
  if (!menuData || menuData.Flag !== "0" || !menuData.items?.length) {
    return NextResponse.json({ items: null });
  }

  menuData.items = (menuData.items as unknown as Record<string, unknown>[]).map((raw) => {
    const r = normRow(raw);
    return {
      menu_id:         String(r.menu_id ?? ""),
      menu_pid:        r.menu_pid != null && r.menu_pid !== "NULL" ? String(r.menu_pid) : null,
      menu_name:       String(r.menu_name ?? ""),
      menu_exec:       String(r.menu_exec ?? ""),
      menu_order:      Number(r.menu_order ?? 99),
      use_yn:          r.use_yn != null ? String(r.use_yn) : undefined,
      menu_input_type: r.menu_input_type != null ? String(r.menu_input_type) : null,
    } as MenuDBItem;
  });

  menuData.items = menuData.items.filter(
    (m) => !m.use_yn || m.use_yn.toUpperCase() === "Y",
  );

  if (userType === "S") {
    const fullPerms: Record<string, MenuPerm> = {};
    for (const m of menuData.items) {
      fullPerms[m.menu_id] = { view: true, add: true, edit: true, del: true, approve: true };
    }
    return NextResponse.json({ items: menuData.items, perms: fullPerms });
  }

  if (!permRes?.ok) return NextResponse.json({ items: null });

  const permData: PermissionApiResponse = await permRes.json().catch(() => null);
  if (!permData) return NextResponse.json({ items: null });

  const permRows = (permData.items ?? []).map(normRow);

  // 권한 row가 하나도 없으면 접근 불가 → 빈 메뉴
  if (permRows.length === 0) {
    return NextResponse.json({ items: [], perms: {} });
  }

  const perms: Record<string, MenuPerm> = {};
  for (const row of permRows) {
    const menuId = row.menu_id as string;
    if (menuId) perms[menuId] = rowToPerm(row);
  }

  const menuItemById = new Map(menuData.items.map((m) => [m.menu_id, m]));
  const parentIdsWithChildren = new Set<string>();
  for (const row of permRows) {
    const menuId = row.menu_id as string;
    if (!menuId) continue;
    const item = menuItemById.get(menuId);
    const pid = item?.menu_pid && item.menu_pid !== "NULL" ? item.menu_pid : null;
    if (pid) parentIdsWithChildren.add(pid);
  }
  for (const pid of parentIdsWithChildren) {
    if (!perms[pid]) {
      perms[pid] = { view: false, add: false, edit: false, del: false, approve: false };
    }
  }

  const allMenuIds = new Set(menuData.items.map((m) => m.menu_id));
  const visibleIds = new Set(
    menuData.items
      .filter((m) => perms[m.menu_id]?.view === true)
      .map((m) => m.menu_id),
  );

  const filteredItems = menuData.items.filter((m) => {
    if (!visibleIds.has(m.menu_id)) return false;
    const pid = m.menu_pid && m.menu_pid !== "NULL" ? m.menu_pid : null;
    if (pid && allMenuIds.has(pid) && !visibleIds.has(pid)) return false;
    if (pid && perms[pid] && !perms[pid].view) return false;
    return true;
  });

  return NextResponse.json({ items: filteredItems, perms });
}
