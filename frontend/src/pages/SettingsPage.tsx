import { useEffect, useState } from "react";
import { PlusOutlined, SearchOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
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
  clearAppSetting,
  createPrinter,
  deletePrinter,
  discoverPrinters,
  getAppSettings,
  listPrinters,
  testPrinter,
  toApiError,
  updateAppSettings,
  updatePrinter,
  type AppSettings,
  type DiscoveredPrinter,
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

  const [appSettings, setAppSettings] = useState<AppSettings | undefined>();
  const [spoolmanUrlDraft, setSpoolmanUrlDraft] = useState("");
  const [spoolmanSaving, setSpoolmanSaving] = useState(false);
  const [spoolmanError, setSpoolmanError] = useState<string | undefined>();
  const [cupsServerDraft, setCupsServerDraft] = useState("");
  const [cupsPortDraft, setCupsPortDraft] = useState<number | undefined>();
  const [cupsSaving, setCupsSaving] = useState(false);
  const [cupsError, setCupsError] = useState<string | undefined>();

  const [discovered, setDiscovered] = useState<DiscoveredPrinter[] | undefined>();
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | undefined>();

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

  function loadAppSettings(): void {
    getAppSettings()
      .then((loaded) => {
        setAppSettings(loaded);
        setSpoolmanUrlDraft(loaded.spoolman_public_url);
        setCupsServerDraft(loaded.cups_server);
        setCupsPortDraft(loaded.cups_port);
      })
      .catch(() => undefined);
  }

  useEffect(load, []);
  useEffect(loadAppSettings, []);

  async function handleSaveSpoolmanUrl(): Promise<void> {
    setSpoolmanSaving(true);
    setSpoolmanError(undefined);
    try {
      setAppSettings(await updateAppSettings({ spoolman_public_url: spoolmanUrlDraft }));
    } catch (cause) {
      setSpoolmanError(toApiError(cause).message);
    } finally {
      setSpoolmanSaving(false);
    }
  }

  async function handleResetSpoolmanUrl(): Promise<void> {
    setSpoolmanSaving(true);
    setSpoolmanError(undefined);
    try {
      const reset = await clearAppSetting("spoolman_public_url");
      setAppSettings(reset);
      setSpoolmanUrlDraft(reset.spoolman_public_url);
    } catch (cause) {
      setSpoolmanError(toApiError(cause).message);
    } finally {
      setSpoolmanSaving(false);
    }
  }

  async function handleSaveCups(): Promise<void> {
    setCupsSaving(true);
    setCupsError(undefined);
    try {
      setAppSettings(
        await updateAppSettings({
          cups_server: cupsServerDraft,
          cups_port: cupsPortDraft ?? appSettings?.cups_port,
        }),
      );
    } catch (cause) {
      setCupsError(toApiError(cause).message);
    } finally {
      setCupsSaving(false);
    }
  }

  async function handleResetCups(): Promise<void> {
    setCupsSaving(true);
    setCupsError(undefined);
    try {
      await clearAppSetting("cups_server");
      const reset = await clearAppSetting("cups_port");
      setAppSettings(reset);
      setCupsServerDraft(reset.cups_server);
      setCupsPortDraft(reset.cups_port);
    } catch (cause) {
      setCupsError(toApiError(cause).message);
    } finally {
      setCupsSaving(false);
    }
  }

  async function handleDiscover(): Promise<void> {
    setDiscovering(true);
    setDiscoverError(undefined);
    try {
      setDiscovered(await discoverPrinters());
    } catch (cause) {
      setDiscoverError(toApiError(cause).message);
    } finally {
      setDiscovering(false);
    }
  }

  function openImport(queue: DiscoveredPrinter): void {
    setEditing(undefined);
    setForm({
      ...EMPTY_FORM,
      name: queue.model ?? queue.queue_name,
      queue_name: queue.queue_name,
      location: queue.location ?? undefined,
      model: queue.model ?? undefined,
    });
    setFormError(undefined);
    setFormOpen(true);
  }

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
            <Space wrap>
              <Button
                icon={<SearchOutlined aria-hidden="true" />}
                loading={discovering}
                onClick={() => void handleDiscover()}
              >
                {page.discover.button}
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined aria-hidden="true" />}
                onClick={openCreate}
              >
                {page.printers.add}
              </Button>
            </Space>
          }
        >
          {loadError ? <Alert type="error" showIcon message={loadError} /> : null}
          {discoverError ? <Alert type="error" showIcon message={discoverError} /> : null}
          {discovered ? (
            <Card
              size="small"
              type="inner"
              title={page.discover.title}
              style={{ marginBottom: 16 }}
            >
              {discovered.length === 0 ? (
                <Typography.Text type="secondary">{page.discover.empty}</Typography.Text>
              ) : (
                <List
                  size="small"
                  dataSource={discovered}
                  renderItem={(queue) => (
                    <List.Item
                      actions={[
                        <Button
                          key="use"
                          size="small"
                          disabled={!queue.supported}
                          onClick={() => {
                            openImport(queue);
                          }}
                        >
                          {page.discover.use}
                        </Button>,
                      ]}
                    >
                      <List.Item.Meta
                        title={
                          <Space>
                            {queue.queue_name}
                            {!queue.supported ? (
                              <Tag color="warning">{page.discover.unsupported}</Tag>
                            ) : null}
                          </Space>
                        }
                        description={[queue.model, queue.location].filter(Boolean).join(" · ")}
                      />
                    </List.Item>
                  )}
                />
              )}
            </Card>
          ) : null}
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
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            {spoolmanError ? <Alert type="error" showIcon message={spoolmanError} /> : null}
            <Space wrap>
              {appSettings?.spoolman_public_url_overridden ? (
                <Tag color="blue">{page.connection.overridden}</Tag>
              ) : (
                <Tag>{page.connection.default}</Tag>
              )}
              {appSettings?.spoolman_public_url ? (
                <a href={appSettings.spoolman_public_url} target="_blank" rel="noopener noreferrer">
                  {page.connection.openSpoolman}
                </a>
              ) : null}
            </Space>
            <Space direction={isMobile ? "vertical" : "horizontal"} style={{ width: "100%" }} wrap>
              <Input
                style={{ width: isMobile ? "100%" : 360 }}
                placeholder={page.fields.spoolmanUrl}
                value={spoolmanUrlDraft}
                onChange={(event) => {
                  setSpoolmanUrlDraft(event.target.value);
                }}
              />
              <Space>
                <Button
                  type="primary"
                  loading={spoolmanSaving}
                  onClick={() => void handleSaveSpoolmanUrl()}
                >
                  {page.connection.save}
                </Button>
                <Button
                  disabled={!appSettings?.spoolman_public_url_overridden}
                  loading={spoolmanSaving}
                  onClick={() => void handleResetSpoolmanUrl()}
                >
                  {page.connection.reset}
                </Button>
              </Space>
            </Space>
          </Space>
        </Card>

        <Card title={page.sections.cups}>
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Typography.Text type="secondary">{page.connection.cupsHint}</Typography.Text>
            {cupsError ? <Alert type="error" showIcon message={cupsError} /> : null}
            <Space wrap>
              {appSettings?.cups_server_overridden || appSettings?.cups_port_overridden ? (
                <Tag color="blue">{page.connection.overridden}</Tag>
              ) : (
                <Tag>{page.connection.default}</Tag>
              )}
            </Space>
            <Space direction={isMobile ? "vertical" : "horizontal"} style={{ width: "100%" }} wrap>
              <Input
                style={{ width: isMobile ? "100%" : 240 }}
                placeholder={page.fields.cupsServer}
                value={cupsServerDraft}
                onChange={(event) => {
                  setCupsServerDraft(event.target.value);
                }}
              />
              <LabeledNumber
                label={page.fields.cupsPort}
                mobile={isMobile}
                min={1}
                max={65535}
                value={cupsPortDraft}
                onChange={(value) => {
                  setCupsPortDraft(value ?? undefined);
                }}
              />
              <Space>
                <Button type="primary" loading={cupsSaving} onClick={() => void handleSaveCups()}>
                  {page.connection.save}
                </Button>
                <Button
                  disabled={
                    !appSettings?.cups_server_overridden && !appSettings?.cups_port_overridden
                  }
                  loading={cupsSaving}
                  onClick={() => void handleResetCups()}
                >
                  {page.connection.reset}
                </Button>
              </Space>
            </Space>
          </Space>
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
