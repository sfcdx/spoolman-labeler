import { Alert, Card, Descriptions, Space, Typography } from "antd";
import { PageHeading } from "./PageHeading";
import { texts } from "../texts/de";

const page = texts.pages.settings;

/**
 * Platzhalter der Einstellungen. Die angezeigten Werte sind bewusst reine
 * Beispiel-Platzhalter (`example.local`) — hier stehen keine echten
 * Hostnamen oder Adressen im Code.
 */
export function SettingsPage(): React.JSX.Element {
  return (
    <>
      <PageHeading title={page.title} subtitle={page.subtitle} />

      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <Alert type="warning" showIcon message={page.securityNote} />

        <Card title={page.sections.spoolman}>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={page.fields.spoolmanUrl}>
              <Typography.Text type="secondary" code>
                {page.placeholders.spoolmanUrl}
              </Typography.Text>
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card title={page.sections.cups}>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={page.fields.cupsServer}>
              <Typography.Text type="secondary" code>
                {page.placeholders.cupsServer}
              </Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label={page.fields.defaultPrinter}>
              <Typography.Text type="secondary">{page.placeholders.notSet}</Typography.Text>
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card title={page.sections.labels}>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={page.fields.defaultTemplate}>
              <Typography.Text type="secondary">{page.placeholders.notSet}</Typography.Text>
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Alert
          type="info"
          showIcon
          message={texts.common.notImplementedTitle}
          description={texts.common.notImplementedText}
        />
      </Space>
    </>
  );
}
