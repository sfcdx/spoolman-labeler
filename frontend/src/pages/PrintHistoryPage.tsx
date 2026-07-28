import { Alert, Empty, Space, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { PageHeading } from "./PageHeading";
import { texts } from "../texts/de";

const page = texts.pages.history;

/** Zeile der Druckhistorie. Die Felder folgen der Tabelle `print_jobs`. */
export interface PrintJobRow {
  id: string;
  createdAt: string;
  spool: string;
  printer: string;
  template: string;
  status: string;
}

const columns: ColumnsType<PrintJobRow> = [
  { key: "createdAt", dataIndex: "createdAt", title: page.columns.createdAt },
  { key: "spool", dataIndex: "spool", title: page.columns.spool },
  { key: "printer", dataIndex: "printer", title: page.columns.printer },
  { key: "template", dataIndex: "template", title: page.columns.template },
  { key: "status", dataIndex: "status", title: page.columns.status },
];

export function PrintHistoryPage(): React.JSX.Element {
  return (
    <>
      <PageHeading title={page.title} subtitle={page.subtitle} />

      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <Alert type="info" showIcon message={page.statusNote} />

        <Table<PrintJobRow>
          rowKey="id"
          columns={columns}
          dataSource={[]}
          pagination={false}
          scroll={{ x: "max-content" }}
          locale={{ emptyText: <Empty description={page.empty} /> }}
        />

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
