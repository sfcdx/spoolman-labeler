import {
  FileTextOutlined,
  HistoryOutlined,
  PlusCircleOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import type { ComponentType } from "react";
import { texts } from "../texts/de";

type Booleanish = boolean | "true" | "false";

export interface NavItem {
  /** Stabiler Schluessel fuer das Menue — identisch zum Pfad. */
  key: string;
  path: string;
  label: string;
  Icon: ComponentType<{ "aria-hidden"?: Booleanish }>;
}

/** Reihenfolge der Bereiche in der Seitenleiste. */
export const navItems: readonly NavItem[] = [
  {
    key: "/",
    path: "/",
    label: texts.nav.newSpool,
    Icon: PlusCircleOutlined,
  },
  {
    key: "/history",
    path: "/history",
    label: texts.nav.history,
    Icon: HistoryOutlined,
  },
  {
    key: "/templates",
    path: "/templates",
    label: texts.nav.templates,
    Icon: FileTextOutlined,
  },
  {
    key: "/settings",
    path: "/settings",
    label: texts.nav.settings,
    Icon: SettingOutlined,
  },
];

/** Ermittelt den aktiven Menuepunkt zu einem Pfad. */
export function selectedNavKey(pathname: string): string[] {
  if (pathname === "/") {
    return ["/"];
  }
  const match = navItems.find((item) => item.path !== "/" && pathname.startsWith(item.path));
  return match ? [match.key] : [];
}
