import { useCallback, useMemo, useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { MenuFoldOutlined, MenuOutlined, MenuUnfoldOutlined } from "@ant-design/icons";
import { Button, Drawer, Layout, Menu, Typography, theme } from "antd";
import type { MenuProps } from "antd";
import { Logo } from "../components/Logo";
import { SystemStatus } from "../components/SystemStatus";
import { ThemeSwitcher } from "../components/ThemeSwitcher";
import { useIsMobile } from "../hooks/useMediaQuery";
import { texts } from "../texts/de";
import { navItems, selectedNavKey } from "./navigation";

const { Content, Footer, Header, Sider } = Layout;

const SIDER_WIDTH = 200;
const SIDER_COLLAPSED_WIDTH = 80;
const HEADER_HEIGHT = 64;

/** Kennung des Hauptinhalts — Ziel des Skip-Links. */
export const MAIN_CONTENT_ID = "hauptinhalt";

interface BrandProps {
  compact?: boolean;
}

function Brand({ compact = false }: BrandProps): React.JSX.Element {
  return (
    <Link
      to="/"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        height: HEADER_HEIGHT,
        padding: "0 16px",
        overflow: "hidden",
      }}
    >
      <Logo size={28} />
      {compact ? null : (
        <Typography.Text strong style={{ fontSize: 16, whiteSpace: "nowrap" }}>
          {texts.app.name}
        </Typography.Text>
      )}
    </Link>
  );
}

/**
 * Grundlayout: Seitenleiste + Inhaltsbereich.
 *
 * Masse nach docs/ui-analysis.md, Abschnitt 4.3 (Sider 200/80 px,
 * Header 64 px auf `colorBgElevated`, Inhalt mit `borderRadiusLG`).
 * Unterhalb von 768 px wandert die Navigation in einen `Drawer`.
 */
export function AppLayout(): React.JSX.Element {
  const { token } = theme.useToken();
  const isMobile = useIsMobile();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  const menuItems = useMemo<MenuProps["items"]>(
    () =>
      navItems.map(({ key, path, label, Icon }) => ({
        key,
        icon: <Icon aria-hidden="true" />,
        label: <Link to={path}>{label}</Link>,
      })),
    [],
  );

  const selectedKeys = selectedNavKey(location.pathname);

  const navigationMenu = (
    <Menu
      mode="inline"
      theme="light"
      selectedKeys={selectedKeys}
      items={menuItems}
      onClick={closeDrawer}
      style={{ borderInlineEnd: "none", fontSize: 15 }}
    />
  );

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <a className="sl-skip-link" href={`#${MAIN_CONTENT_ID}`}>
        {texts.nav.skipToContent}
      </a>

      {isMobile ? (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={closeDrawer}
          title={texts.nav.drawerTitle}
          width={280}
          closable={{ "aria-label": texts.nav.closeMenu }}
          styles={{ body: { padding: 0 } }}
          rootClassName="sl-drawer-nav"
        >
          <nav aria-label={texts.nav.landmark}>{navigationMenu}</nav>
        </Drawer>
      ) : (
        <Sider
          theme="light"
          collapsible
          collapsed={collapsed}
          trigger={null}
          width={SIDER_WIDTH}
          collapsedWidth={SIDER_COLLAPSED_WIDTH}
          style={{
            background: token.colorBgContainer,
            borderInlineEnd: `1px solid ${token.colorBgElevated}`,
          }}
        >
          <Brand compact={collapsed} />
          <nav aria-label={texts.nav.landmark}>{navigationMenu}</nav>
          <div style={{ padding: 8, marginTop: 8 }}>
            <Button
              type="text"
              block
              onClick={() => {
                setCollapsed((value) => !value);
              }}
              aria-expanded={!collapsed}
              aria-label={collapsed ? texts.nav.expand : texts.nav.collapse}
              icon={
                collapsed ? (
                  <MenuUnfoldOutlined aria-hidden="true" />
                ) : (
                  <MenuFoldOutlined aria-hidden="true" />
                )
              }
            />
          </div>
        </Sider>
      )}

      <Layout>
        <Header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            height: HEADER_HEIGHT,
            padding: "0 16px",
            background: token.colorBgElevated,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            {isMobile ? (
              <>
                <Button
                  type="text"
                  size="large"
                  onClick={() => {
                    setDrawerOpen(true);
                  }}
                  aria-label={texts.nav.openMenu}
                  aria-expanded={drawerOpen}
                  icon={<MenuOutlined aria-hidden="true" />}
                  style={{ width: 48, height: 48 }}
                />
                <Typography.Text strong style={{ fontSize: 16 }}>
                  {texts.app.name}
                </Typography.Text>
              </>
            ) : null}
          </div>

          <ThemeSwitcher />
        </Header>

        <Content style={{ padding: isMobile ? 12 : 24 }}>
          <main
            id={MAIN_CONTENT_ID}
            tabIndex={-1}
            style={{
              maxWidth: 900,
              margin: "0 auto",
              padding: isMobile ? "16px 12px" : "24px 20px",
              minHeight: 280,
              background: token.colorBgContainer,
              borderRadius: token.borderRadiusLG,
              color: token.colorText,
            }}
          >
            <Outlet />
          </main>
        </Content>

        <Footer style={{ padding: "12px 16px" }}>
          <SystemStatus />
        </Footer>
      </Layout>
    </Layout>
  );
}
