import type { ReactNode } from "react";
import { Typography } from "antd";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

export interface PageHeadingProps {
  title: string;
  subtitle?: string;
  extra?: ReactNode;
}

/**
 * Einheitlicher Seitenkopf: genau eine `h1` pro Seite und ein passender
 * Dokumenttitel.
 */
export function PageHeading({ title, subtitle, extra }: PageHeadingProps): React.JSX.Element {
  useDocumentTitle(title);

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 24,
      }}
    >
      <div>
        <Typography.Title level={1} style={{ fontSize: 24, marginBottom: subtitle ? 4 : 0 }}>
          {title}
        </Typography.Title>
        {subtitle ? <Typography.Text type="secondary">{subtitle}</Typography.Text> : null}
      </div>
      {extra}
    </div>
  );
}
