import { PlusOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Empty, Space } from "antd";
import { PageHeading } from "./PageHeading";
import { texts } from "../texts/de";

const page = texts.pages.templates;

export function TemplatesPage(): React.JSX.Element {
  return (
    <>
      <PageHeading
        title={page.title}
        subtitle={page.subtitle}
        extra={
          <Button type="primary" icon={<PlusOutlined aria-hidden="true" />} disabled>
            {page.create}
          </Button>
        }
      />

      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <Alert type="info" showIcon message={page.qrNote} />

        <Card>
          <Empty description={page.empty} />
        </Card>

        <Alert
          type="warning"
          showIcon
          message={texts.common.notImplementedTitle}
          description={texts.common.notImplementedText}
        />
      </Space>
    </>
  );
}
