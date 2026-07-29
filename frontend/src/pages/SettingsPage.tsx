import { useEffect, useState } from "react";
import { PlusOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Input,
  List,
  Modal,
  Space,
  Switch,
  Tag,
  Typography,
} from "antd";
import { PageHeading } from "./PageHeading";
import { LabeledNumber } from "../components/LabeledNumber";
import { useIsMobile } from "../hooks/useMediaQuery";
import { texts } from "../texts/de";
import {
  createPrinter,
  deletePrinter,
  listPrinters,
  testPrinter,
  toApiError,
  updatePrinter,
  type Printer,
  type PrinterInput,
} from "../api";

const page = texts.pages.settings;

const EMPTY_FORM: PrinterInput = {
  name: "",
  queue_name: "",
  label_width_mm: 62,
  label_height_mm: 29,
  copies: 1,
};

export function SettingsPage(): React.JSX.Element {
  const isMobile = useIsMobile();
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [loadError, setLoadError] = useState<string | undefined>();

  const [editing, setEditing] = useState<Printer | undefined>();
  const [form, setForm] = useState<PrinterInput>(EMPTY_FORM);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const [testResult, setTestResult] = useState<Record<number, string>>({});
  const [testing, setTesting] = useState<number | undefined>();

  function load(): void {
    listPrinters()
      .then((loaded) => {
        setPrinters(Array.isArray(loaded) ? loaded : []);
        setLoadError(undefined);
      })
      .catch((cause: unknown) => {
        setLoadError(toApiError(cause).message);
      });
  }

  useEffect(load, []);

  function openCreate(): void {
    setEditing(undefined);
    setForm(EMPTY_FORM);
    setFormError(undefined);
    setFormOpen(true);
  }

  function openEdit(printer: Printer): void {
    setEditing(printer);
    setForm({
      name: printer.name,
      queue_name: printer.queue_name,
      cups_server: printer.cups_server ?? undefined,
      cups_port: printer.cups_port ?? undefined,
      location: printer.location ?? undefined,
      model: printer.model ?? undefined,
      label_width_mm: printer.label_width_mm,
      label_height_mm: printer.label_height_mm,
      copies: printer.copies,
      is_default: printer.is_default,
      is_enabled: printer.is_enabled,
    });
    setFormError(undefined);
    setFormOpen(true);
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    setFormError(undefined);
    try {
      if (editing) {
        await updatePrinter(editing.id, form);
      } else {
        await createPrinter(form);
      }
      setFormOpen(false);
      load();
    } catch (cause) {
      setFormError(toApiError(cause).message);
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(printer: Printer): void {
    Modal.confirm({
      title: page.printers.deleteConfirm,
      content: printer.name,
      okButtonProps: { danger: true },
      onOk: () =>
        deletePrinter(printer.id)
          .then(load)
          .catch((cause: unknown) => {
            setLoadError(toApiError(cause).message);
          }),
    });
  }

  async function handleTest(printer: Printer): Promise<void> {
    setTesting(printer.id);
    try {
      const result = await testPrinter(printer.id);
      setTestResult((current) => ({
        ...current,
        [printer.id]: result.detail ? `${result.status}: ${result.detail}` : result.status,
      }));
    } catch (cause) {
      setTestResult((current) => ({ ...current, [printer.id]: toApiError(cause).message }));
    } finally {
      setTesting(undefined);
    }
  }

  return (
    <>
      <PageHeading title={page.title} subtitle={page.subtitle} />

      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <Alert type="warning" showIcon message={page.securityNote} />

        <Card
          title={page.sections.printers}
          extra={
            <Button type="primary" icon={<PlusOutlined aria-hidden="true" />} onClick={openCreate}>
              {page.printers.add}
            </Button>
          }
        >
          {loadError ? <Alert type="error" showIcon message={loadError} /> : null}
          {printers.length === 0 ? (
            <Empty description={page.printers.empty} />
          ) : (
            <List
              dataSource={printers}
              itemLayout={isMobile ? "vertical" : "horizontal"}
              renderItem={(printer) => (
                <List.Item
                  actions={[
                    <Button
                      key="test"
                      size="small"
                      loading={testing === printer.id}
                      onClick={() => void handleTest(printer)}
                    >
                      {page.printers.test}
                    </Button>,
                    <Button
                      key="edit"
                      size="small"
                      onClick={() => {
                        openEdit(printer);
                      }}
                    >
                      {page.printers.edit}
                    </Button>,
                    <Button
                      key="delete"
                      size="small"
                      danger
                      onClick={() => {
                        handleDelete(printer);
                      }}
                    >
                      {page.printers.delete}
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Space>
                        {printer.name}
                        {printer.is_default ? <Tag color="blue">Standard</Tag> : null}
                        {!printer.is_enabled ? <Tag>Deaktiviert</Tag> : null}
                      </Space>
                    }
                    description={
                      <Space direction="vertical" size={0}>
                        <Typography.Text type="secondary">
                          {printer.queue_name} · {printer.label_width_mm}×{printer.label_height_mm}{" "}
                          mm
                        </Typography.Text>
                        {testResult[printer.id] ? (
                          <Typography.Text type="secondary">
                            {testResult[printer.id]}
                          </Typography.Text>
                        ) : null}
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          )}
        </Card>

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
          </Descriptions>
        </Card>
      </Space>

      <Modal
        title={editing ? page.printers.edit : page.printers.add}
        open={formOpen}
        onCancel={() => {
          setFormOpen(false);
        }}
        onOk={() => void handleSave()}
        okText={page.printers.save}
        cancelText={page.printers.cancel}
        confirmLoading={saving}
        width={isMobile ? "94%" : undefined}
      >
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          {formError ? <Alert type="error" showIcon message={formError} /> : null}
          <Input
            placeholder={page.fields.name}
            value={form.name}
            onChange={(event) => {
              setForm({ ...form, name: event.target.value });
            }}
          />
          <Input
            placeholder={page.fields.queueName}
            value={form.queue_name}
            onChange={(event) => {
              setForm({ ...form, queue_name: event.target.value });
            }}
          />
          <Input
            placeholder={page.fields.location}
            value={form.location ?? ""}
            onChange={(event) => {
              setForm({ ...form, location: event.target.value || undefined });
            }}
          />
          <Input
            placeholder={page.fields.model}
            value={form.model ?? ""}
            onChange={(event) => {
              setForm({ ...form, model: event.target.value || undefined });
            }}
          />
          <Space direction={isMobile ? "vertical" : "horizontal"} style={{ width: "100%" }}>
            <LabeledNumber
              label={page.fields.labelWidth}
              mobile={isMobile}
              min={1}
              value={form.label_width_mm}
              onChange={(value) => {
                setForm({ ...form, label_width_mm: value ?? form.label_width_mm });
              }}
            />
            <LabeledNumber
              label={page.fields.labelHeight}
              mobile={isMobile}
              min={1}
              value={form.label_height_mm}
              onChange={(value) => {
                setForm({ ...form, label_height_mm: value ?? form.label_height_mm });
              }}
            />
          </Space>
          <LabeledNumber
            label={page.fields.copies}
            mobile={isMobile}
            min={1}
            value={form.copies}
            onChange={(value) => {
              setForm({ ...form, copies: value ?? form.copies });
            }}
          />
          <Space>
            <Switch
              checked={form.is_default ?? false}
              onChange={(checked) => {
                setForm({ ...form, is_default: checked });
              }}
            />
            <Typography.Text>{page.fields.isDefault}</Typography.Text>
          </Space>
        </Space>
      </Modal>
    </>
  );
}
