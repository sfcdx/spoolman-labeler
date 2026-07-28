import {
  CheckCircleFilled,
  CloseCircleFilled,
  ExclamationCircleFilled,
  QuestionCircleOutlined,
  ReloadOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import { Button, Space, Typography, theme } from "antd";
import type { ReactNode } from "react";
import type { HealthState } from "../api";
import { useHealth } from "../hooks/useHealth";
import { texts } from "../texts/de";

/**
 * Zuordnung Zustand -> Icon und Text.
 *
 * Konzept Abschnitt 12.3 / Barrierefreiheit: Der Zustand wird **nie allein
 * ueber Farbe** transportiert. Jede Angabe traegt zusaetzlich ein
 * unterscheidbares Icon und ausgeschriebenen Text.
 */
function stateIcon(state: HealthState, color: string): ReactNode {
  switch (state) {
    case "ok":
      return <CheckCircleFilled aria-hidden="true" style={{ color }} />;
    case "degraded":
      return <ExclamationCircleFilled aria-hidden="true" style={{ color }} />;
    case "error":
      return <CloseCircleFilled aria-hidden="true" style={{ color }} />;
    case "unknown":
      return <QuestionCircleOutlined aria-hidden="true" style={{ color }} />;
  }
}

function stateLabel(state: HealthState): string {
  return texts.health.state[state];
}

interface StatusItemProps {
  label: string;
  state: HealthState;
  detail?: string | undefined;
}

function StatusItem({ label, state, detail }: StatusItemProps): React.JSX.Element {
  const { token } = theme.useToken();
  const color =
    state === "ok"
      ? token.colorSuccess
      : state === "degraded"
        ? token.colorWarning
        : state === "error"
          ? token.colorError
          : token.colorTextTertiary;

  const text = texts.health.describe(label, stateLabel(state));

  return (
    <span
      style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
      title={detail ?? text}
    >
      {stateIcon(state, color)}
      <Typography.Text style={{ fontSize: 13 }}>{text}</Typography.Text>
    </span>
  );
}

export interface SystemStatusProps {
  /** Abfrageintervall in Millisekunden; 0 deaktiviert die Wiederholung. */
  intervalMs?: number;
}

/**
 * Kompakter Indikator fuer die Erreichbarkeit von Spoolman und CUPS.
 */
export function SystemStatus({ intervalMs }: SystemStatusProps): React.JSX.Element {
  const { health, error, loading, refresh } = useHealth(intervalMs);

  const spoolmanState: HealthState = health ? health.spoolman.state : error ? "error" : "unknown";
  const cupsState: HealthState = health ? health.cups.state : error ? "error" : "unknown";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={texts.health.landmark}
      style={{ display: "flex", justifyContent: "center" }}
    >
      <Space size="middle" wrap align="center">
        {loading && !health && !error ? (
          <Typography.Text style={{ fontSize: 13 }}>
            <SyncOutlined spin aria-hidden="true" /> {texts.health.state.loading}
          </Typography.Text>
        ) : null}

        <StatusItem
          label={texts.health.spoolman}
          state={spoolmanState}
          detail={health?.spoolman.detail}
        />
        <StatusItem label={texts.health.cups} state={cupsState} detail={health?.cups.detail} />

        {health && health.version.length > 0 ? (
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {texts.health.version} {health.version}
          </Typography.Text>
        ) : null}

        {error ? (
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {texts.health.checkFailed}
          </Typography.Text>
        ) : null}

        <Button
          size="small"
          type="text"
          icon={<ReloadOutlined aria-hidden="true" />}
          onClick={refresh}
          aria-label={texts.common.reload}
        >
          {texts.common.reload}
        </Button>
      </Space>
    </div>
  );
}
