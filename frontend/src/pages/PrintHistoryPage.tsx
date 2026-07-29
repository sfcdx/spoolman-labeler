import { useEffect, useState } from "react";
import { Alert, Button, Card, Empty, List, Select, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { PageHeading } from "./PageHeading";
import { useIsMobile } from "../hooks/useMediaQuery";
import { texts } from "../texts/de";
import {
  listPrintJobs,
  retryPrintJob,
  toApiError,
  type PrintJob,
  type PrintJobStatus,
} from "../api";

const page = texts.pages.history;

const STATUS_COLOR: Record<PrintJobStatus, string> = {
  queued: "default",
  submitted: "processing",
  processing: "processing",
  completed: "success",
  failed: "error",
  cancelled: "default",
  unknown: "default",
};

const RETRYABLE: ReadonlySet<PrintJobStatus> = new Set(["failed", "cancelled"]);

function JobCard({
  job,
  retrying,
  onRetry,
}: {
  job: PrintJob;
  retrying: number | undefined;
  onRetry: (job: PrintJob) => void;
}): React.JSX.Element {
  return (
    <List.Item>
      <Card size="small" style={{ width: "100%" }}>
        <Space direction="vertical" size={4} style={{ width: "100%" }}>
          <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
            <Typography.Text strong>{page.spoolLabel(job.spoolman_spool_id)}</Typography.Text>
            <Tag color={STATUS_COLOR[job.status]}>{page.status[job.status]}</Tag>
          </Space>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {new Date(job.created_at).toLocaleString("de-DE")}
          </Typography.Text>
          <Typography.Text type="secondary">
            {page.columns.printer}: {job.printer_id ?? page.noPrinter}
          </Typography.Text>
          <Typography.Text type="secondary">
            {page.columns.template}: {job.template_id ?? page.noTemplate}
          </Typography.Text>
          {job.error_message ? (
            <Typography.Text type="danger">{job.error_message}</Typography.Text>
          ) : null}
          {RETRYABLE.has(job.status) ? (
            <Button
              size="small"
              loading={retrying === job.id}
              onClick={() => {
                onRetry(job);
              }}
            >
              {page.retry}
            </Button>
          ) : null}
        </Space>
      </Card>
    </List.Item>
  );
}

export function PrintHistoryPage(): React.JSX.Element {
  const isMobile = useIsMobile();
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [statusFilter, setStatusFilter] = useState<PrintJobStatus | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();
  const [retrying, setRetrying] = useState<number | undefined>();

  function load(): void {
    listPrintJobs(statusFilter ? { status: statusFilter } : {})
      .then((loaded) => {
        setJobs(Array.isArray(loaded) ? loaded : []);
        setLoadError(undefined);
      })
      .catch((cause: unknown) => {
        setLoadError(toApiError(cause).message);
      });
  }

  useEffect(load, [statusFilter]);

  async function handleRetry(job: PrintJob): Promise<void> {
    setRetrying(job.id);
    try {
      await retryPrintJob(job.id);
      load();
    } catch (cause) {
      setLoadError(toApiError(cause).message);
    } finally {
      setRetrying(undefined);
    }
  }

  const columns: ColumnsType<PrintJob> = [
    {
      key: "createdAt",
      dataIndex: "created_at",
      title: page.columns.createdAt,
      render: (value: string) => new Date(value).toLocaleString("de-DE"),
    },
    {
      key: "spool",
      dataIndex: "spoolman_spool_id",
      title: page.columns.spool,
      render: (value: number) => page.spoolLabel(value),
    },
    {
      key: "printer",
      dataIndex: "printer_id",
      title: page.columns.printer,
      render: (value: number | null) => value ?? page.noPrinter,
    },
    {
      key: "template",
      dataIndex: "template_id",
      title: page.columns.template,
      render: (value: number | null) => value ?? page.noTemplate,
    },
    {
      key: "status",
      dataIndex: "status",
      title: page.columns.status,
      render: (value: PrintJobStatus, job) => (
        <Space direction="vertical" size={0}>
          <Tag color={STATUS_COLOR[value]}>{page.status[value]}</Tag>
          {job.error_message ? (
            <span style={{ fontSize: 12, color: "var(--ant-color-error)" }}>
              {job.error_message}
            </span>
          ) : null}
        </Space>
      ),
    },
    {
      key: "actions",
      title: page.columns.actions,
      render: (_, job) =>
        RETRYABLE.has(job.status) ? (
          <Button size="small" loading={retrying === job.id} onClick={() => void handleRetry(job)}>
            {page.retry}
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeading title={page.title} subtitle={page.subtitle} />

      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <Alert type="info" showIcon message={page.statusNote} />
        {loadError ? (
          <Alert type="error" showIcon message={page.loadFailed} description={loadError} />
        ) : null}

        <Select<PrintJobStatus | "all">
          style={{ width: isMobile ? "100%" : 220 }}
          value={statusFilter ?? "all"}
          onChange={(value) => {
            setStatusFilter(value === "all" ? undefined : value);
          }}
          options={[
            { value: "all", label: page.filterAll },
            ...(Object.keys(page.status) as PrintJobStatus[]).map((status) => ({
              value: status,
              label: page.status[status],
            })),
          ]}
        />

        {isMobile ? (
          <List<PrintJob>
            dataSource={jobs}
            locale={{ emptyText: <Empty description={page.empty} /> }}
            renderItem={(job) => (
              <JobCard job={job} retrying={retrying} onRetry={(item) => void handleRetry(item)} />
            )}
          />
        ) : (
          <Table<PrintJob>
            rowKey="id"
            columns={columns}
            dataSource={jobs}
            pagination={false}
            scroll={{ x: "max-content" }}
            locale={{ emptyText: <Empty description={page.empty} /> }}
          />
        )}
      </Space>
    </>
  );
}
