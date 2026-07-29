import { useEffect, useState } from "react";
import { PlusOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Empty, Input, List, Modal, Space, Tag, Typography } from "antd";
import { PageHeading } from "./PageHeading";
import { LabeledNumber } from "../components/LabeledNumber";
import { useIsMobile } from "../hooks/useMediaQuery";
import { texts } from "../texts/de";
import {
  createTemplate,
  deleteTemplate,
  duplicateTemplate,
  importSpoolmanTemplate,
  listTemplates,
  previewSavedTemplate,
  toApiError,
  updateTemplate,
  type LabelTemplate,
  type TemplateInput,
} from "../api";

const page = texts.pages.templates;

const EMPTY_FORM: TemplateInput = {
  name: "",
  html_content: "",
  css_content: "",
  width_mm: 62,
  height_mm: 29,
};

function openPreview(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}

export function TemplatesPage(): React.JSX.Element {
  const isMobile = useIsMobile();
  const [templates, setTemplates] = useState<LabelTemplate[]>([]);
  const [loadError, setLoadError] = useState<string | undefined>();

  const [editing, setEditing] = useState<LabelTemplate | undefined>();
  const [form, setForm] = useState<TemplateInput>(EMPTY_FORM);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | undefined>();
  const [importUnknownTags, setImportUnknownTags] = useState<string[]>([]);

  function load(): void {
    listTemplates()
      .then((loaded) => {
        setTemplates(Array.isArray(loaded) ? loaded : []);
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

  function openEdit(template: LabelTemplate): void {
    setEditing(template);
    setForm({
      name: template.name,
      description: template.description ?? undefined,
      html_content: template.html_content,
      css_content: template.css_content,
      width_mm: template.width_mm,
      height_mm: template.height_mm,
    });
    setFormError(undefined);
    setFormOpen(true);
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    setFormError(undefined);
    try {
      if (editing) {
        await updateTemplate(editing.id, form);
      } else {
        await createTemplate(form);
      }
      setFormOpen(false);
      load();
    } catch (cause) {
      setFormError(toApiError(cause).message);
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(template: LabelTemplate): void {
    Modal.confirm({
      title: page.deleteConfirm,
      content: template.name,
      okButtonProps: { danger: true },
      onOk: () =>
        deleteTemplate(template.id)
          .then(load)
          .catch((cause: unknown) => {
            setLoadError(toApiError(cause).message);
          }),
    });
  }

  function handleDuplicate(template: LabelTemplate): void {
    let name = `${template.name} (Kopie)`;
    Modal.confirm({
      title: page.duplicateNamePrompt,
      content: (
        <Input
          defaultValue={name}
          onChange={(event) => {
            name = event.target.value;
          }}
        />
      ),
      onOk: () =>
        duplicateTemplate(template.id, name)
          .then(load)
          .catch((cause: unknown) => {
            setLoadError(toApiError(cause).message);
          }),
    });
  }

  async function handlePreview(template: LabelTemplate): Promise<void> {
    try {
      openPreview(await previewSavedTemplate(template.id));
    } catch (cause) {
      setLoadError(toApiError(cause).message);
    }
  }

  async function handleImport(): Promise<void> {
    setImportError(undefined);
    setImportUnknownTags([]);
    try {
      const preset: unknown = JSON.parse(importText);
      if (typeof preset !== "object" || preset === null) {
        throw new Error("Kein gültiges JSON-Objekt");
      }
      const result = await importSpoolmanTemplate(preset as Record<string, unknown>);
      if (result.unknown_tags.length > 0) {
        setImportUnknownTags(result.unknown_tags);
      }
      setImportOpen(false);
      setImportText("");
      load();
    } catch (cause) {
      setImportError(cause instanceof SyntaxError ? "Ungültiges JSON" : toApiError(cause).message);
    }
  }

  return (
    <>
      <PageHeading
        title={page.title}
        subtitle={page.subtitle}
        extra={
          <Space wrap>
            <Button
              onClick={() => {
                setImportOpen(true);
              }}
            >
              {page.actions.importSpoolman}
            </Button>
            <Button type="primary" icon={<PlusOutlined aria-hidden="true" />} onClick={openCreate}>
              {page.create}
            </Button>
          </Space>
        }
      />

      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <Alert type="info" showIcon message={page.qrNote} />

        {loadError ? <Alert type="error" showIcon message={loadError} /> : null}
        {importUnknownTags.length > 0 ? (
          <Alert
            type="warning"
            showIcon
            closable
            message={page.importUnknownTags(importUnknownTags)}
            onClose={() => {
              setImportUnknownTags([]);
            }}
          />
        ) : null}

        <Card>
          {templates.length === 0 ? (
            <Empty description={page.empty} />
          ) : (
            <List
              dataSource={templates}
              itemLayout={isMobile ? "vertical" : "horizontal"}
              renderItem={(template) => (
                <List.Item
                  actions={[
                    <Button key="preview" size="small" onClick={() => void handlePreview(template)}>
                      {page.actions.preview}
                    </Button>,
                    <Button
                      key="duplicate"
                      size="small"
                      onClick={() => {
                        handleDuplicate(template);
                      }}
                    >
                      {page.actions.duplicate}
                    </Button>,
                    <Button
                      key="edit"
                      size="small"
                      disabled={template.is_builtin}
                      title={template.is_builtin ? page.builtinProtected : undefined}
                      onClick={() => {
                        openEdit(template);
                      }}
                    >
                      {page.actions.edit}
                    </Button>,
                    <Button
                      key="delete"
                      size="small"
                      danger
                      disabled={template.is_builtin}
                      title={template.is_builtin ? page.builtinProtected : undefined}
                      onClick={() => {
                        handleDelete(template);
                      }}
                    >
                      {page.actions.delete}
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Space>
                        {template.name}
                        {template.is_builtin ? <Tag>{page.builtin}</Tag> : null}
                        {template.is_default ? <Tag color="blue">Standard</Tag> : null}
                      </Space>
                    }
                    description={`${template.width_mm} × ${template.height_mm} mm${
                      template.description ? ` — ${template.description}` : ""
                    }`}
                  />
                </List.Item>
              )}
            />
          )}
        </Card>
      </Space>

      <Modal
        title={editing ? page.actions.edit : page.create}
        open={formOpen}
        onCancel={() => {
          setFormOpen(false);
        }}
        onOk={() => void handleSave()}
        okText={page.actions.save}
        cancelText={page.actions.cancel}
        confirmLoading={saving}
        width={isMobile ? "94%" : 720}
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
            placeholder={page.fields.description}
            value={form.description ?? ""}
            onChange={(event) => {
              setForm({ ...form, description: event.target.value || undefined });
            }}
          />
          <Space direction={isMobile ? "vertical" : "horizontal"} style={{ width: "100%" }}>
            <LabeledNumber
              label={page.fields.width}
              mobile={isMobile}
              min={1}
              value={form.width_mm}
              onChange={(value) => {
                setForm({ ...form, width_mm: value ?? form.width_mm });
              }}
            />
            <LabeledNumber
              label={page.fields.height}
              mobile={isMobile}
              min={1}
              value={form.height_mm}
              onChange={(value) => {
                setForm({ ...form, height_mm: value ?? form.height_mm });
              }}
            />
          </Space>
          <Typography.Text type="secondary">{page.fields.html}</Typography.Text>
          <Input.TextArea
            rows={6}
            placeholder={page.fields.html}
            value={form.html_content}
            onChange={(event) => {
              setForm({ ...form, html_content: event.target.value });
            }}
          />
          <Typography.Text type="secondary">{page.fields.css}</Typography.Text>
          <Input.TextArea
            rows={6}
            placeholder={page.fields.css}
            value={form.css_content}
            onChange={(event) => {
              setForm({ ...form, css_content: event.target.value });
            }}
          />
        </Space>
      </Modal>

      <Modal
        title={page.actions.importSpoolman}
        open={importOpen}
        onCancel={() => {
          setImportOpen(false);
        }}
        onOk={() => void handleImport()}
        okText={page.actions.importSpoolman}
        cancelText={page.actions.cancel}
        width={isMobile ? "94%" : undefined}
      >
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Typography.Text type="secondary">{page.importHint}</Typography.Text>
          {importError ? <Alert type="error" showIcon message={importError} /> : null}
          <Input.TextArea
            rows={10}
            value={importText}
            onChange={(event) => {
              setImportText(event.target.value);
            }}
          />
        </Space>
      </Modal>
    </>
  );
}
