import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  Alert,
  Button,
  Card,
  Collapse,
  Descriptions,
  Divider,
  Input,
  Select,
  Segmented,
  Space,
  Spin,
  Table,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { PageHeading } from "./PageHeading";
import { LabeledNumber } from "../components/LabeledNumber";
import { useIsMobile } from "../hooks/useMediaQuery";
import { texts } from "../texts/de";
import {
  createAndPrint,
  createVendor,
  listPrinters,
  listTemplates,
  printExisting,
  searchFilaments,
  searchSpools,
  searchVendors,
  toApiError,
  type LabelTemplate,
  type NewFilamentInput,
  type PrintJob,
  type Printer,
  type SpoolFieldsInput,
  type SpoolmanFilament,
  type SpoolmanSpool,
  type SpoolmanVendor,
  type WorkflowRunResult,
} from "../api";

const page = texts.pages.newSpool;

/** Backend-Obergrenze (siehe Settings.max_spools_per_workflow); rein als UI-Leitplanke. */
const MAX_QUANTITY = 50;
const SEARCH_DEBOUNCE_MS = 300;

/** Sobald einmal weggeklickt, taucht der Hinweis nie wieder auf (dauerhaft, nicht nur pro Sitzung). */
const HINT_DISMISSED_STORAGE_KEY = "spoolman-labeler:new-spool-hint-dismissed";

function readHintDismissed(): boolean {
  try {
    return window.localStorage.getItem(HINT_DISMISSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `key-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Debounced Suche gegen eine `(query, signal) => Promise<T[]>`-Funktion. */
function useDebouncedSearch<T>(
  query: string,
  search: (query: string, signal: AbortSignal) => Promise<T[]>,
): { results: T[]; loading: boolean } {
  const [results, setResults] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      search(query, controller.signal)
        .then((items) => {
          if (!controller.signal.aborted) {
            setResults(items);
            setLoading(false);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `search` ist ein stabiler Modul-Import
  }, [query]);

  return { results, loading };
}

function spoolmanFilamentLabel(filament: SpoolmanFilament | null | undefined): string {
  if (!filament) {
    return "—";
  }
  const vendorName = filament.vendor?.name;
  const nameOrMaterial = filament.name ?? filament.material;
  const material = filament.name && filament.material ? ` (${filament.material})` : "";
  return [vendorName, nameOrMaterial ? `${nameOrMaterial}${material}` : undefined]
    .filter(Boolean)
    .join(" – ");
}

function searchSpoolsForDebounce(query: string, signal: AbortSignal): Promise<SpoolmanSpool[]> {
  return searchSpools(query, undefined, signal);
}

function spoolOptionLabel(spool: SpoolmanSpool): string {
  const filamentLabel = spoolmanFilamentLabel(spool.filament);
  return `#${spool.id} — ${filamentLabel}`;
}

interface ResultRow {
  key: number;
  spoolId: number;
}

type EntryMode = "existing" | "new";

interface AdvancedPrintOptionsProps {
  isMobile: boolean;
  templates: LabelTemplate[];
  printers: Printer[];
  templateId: number | undefined;
  onTemplateIdChange: (id: number | undefined) => void;
  printerId: number | undefined;
  onPrinterIdChange: (id: number | undefined) => void;
  copies: number | undefined;
  onCopiesChange: (copies: number | undefined) => void;
}

/** Optionales Panel zum Überschreiben der automatisch gewählten Standard-Vorlage/-Drucker. */
function AdvancedPrintOptions({
  isMobile,
  templates,
  printers,
  templateId,
  onTemplateIdChange,
  printerId,
  onPrinterIdChange,
  copies,
  onCopiesChange,
}: AdvancedPrintOptionsProps): React.JSX.Element {
  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Typography.Text type="secondary">{page.advanced.auto}</Typography.Text>

      {templates.length === 0 ? (
        <Alert
          type="warning"
          showIcon
          message={page.advanced.noTemplates}
          action={
            <Link to="/templates">
              <Button size="small">{page.advanced.goToTemplates}</Button>
            </Link>
          }
        />
      ) : (
        <Select
          size="large"
          allowClear
          style={{ width: "100%" }}
          placeholder={page.advanced.template}
          value={templateId}
          onChange={onTemplateIdChange}
          options={templates.map((template) => ({
            value: template.id,
            label: `${template.name} (${template.width_mm}×${template.height_mm} mm)`,
          }))}
        />
      )}

      {printers.length === 0 ? (
        <Alert
          type="warning"
          showIcon
          message={page.advanced.noPrinters}
          action={
            <Link to="/settings">
              <Button size="small">{page.advanced.goToSettings}</Button>
            </Link>
          }
        />
      ) : (
        <Select
          size="large"
          allowClear
          style={{ width: "100%" }}
          placeholder={page.advanced.printer}
          value={printerId}
          onChange={onPrinterIdChange}
          options={printers.map((printer) => ({
            value: printer.id,
            label: printer.name,
          }))}
        />
      )}

      <LabeledNumber
        label={page.advanced.copies}
        mobile={isMobile}
        min={1}
        max={100}
        value={copies}
        onChange={(value) => {
          onCopiesChange(value ?? undefined);
        }}
      />
    </Space>
  );
}

export function NewSpoolPage(): React.JSX.Element {
  const isMobile = useIsMobile();
  const [hintDismissed, setHintDismissed] = useState(readHintDismissed);
  const [mode, setMode] = useState<EntryMode>("existing");

  // Drucker/Vorlagen — gemeinsam fuer beide Einstiegspfade geladen, damit ein
  // Klick zum Drucken reicht: der Server loest ohne explizite Auswahl die
  // hinterlegten Standardwerte auf.
  const [templates, setTemplates] = useState<LabelTemplate[]>([]);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [templateId, setTemplateId] = useState<number | undefined>();
  const [printerId, setPrinterId] = useState<number | undefined>();
  const [copies, setCopies] = useState<number | undefined>();

  useEffect(() => {
    const controller = new AbortController();
    // Array.isArray schuetzt vor einer unerwarteten, nicht-listenfoermigen
    // Antwort (z. B. bei einem inkompatiblen Backend-Stand) — ohne die
    // Pruefung wuerde `.find`/`.map` weiter unten die ganze Seite abstuerzen
    // lassen statt nur leer zu bleiben.
    listTemplates(controller.signal)
      .then((loaded) => {
        setTemplates(Array.isArray(loaded) ? loaded : []);
      })
      .catch(() => undefined);
    listPrinters(controller.signal)
      .then((loaded) => {
        setPrinters(Array.isArray(loaded) ? loaded : []);
      })
      .catch(() => undefined);
    return () => {
      controller.abort();
    };
  }, []);

  // Vorhandene Spule: Suche + Direktdruck.
  const [spoolQuery, setSpoolQuery] = useState("");
  const [selectedSpool, setSelectedSpool] = useState<SpoolmanSpool | undefined>();
  const { results: spoolResults, loading: spoolSearchLoading } = useDebouncedSearch(
    spoolQuery,
    searchSpoolsForDebounce,
  );
  const [existingAdvancedOpen, setExistingAdvancedOpen] = useState(false);
  const [existingPrinting, setExistingPrinting] = useState(false);
  const [existingPrintJob, setExistingPrintJob] = useState<PrintJob | undefined>();
  const [existingPrintError, setExistingPrintError] = useState<string | undefined>();

  async function handlePrintExisting(): Promise<void> {
    if (!selectedSpool) {
      return;
    }
    setExistingPrinting(true);
    setExistingPrintError(undefined);
    try {
      const job = await printExisting({
        spool_id: selectedSpool.id,
        ...(templateId ? { template_id: templateId } : {}),
        ...(printerId ? { printer_id: printerId } : {}),
        ...(copies ? { copies } : {}),
      });
      setExistingPrintJob(job);
    } catch (cause) {
      setExistingPrintError(toApiError(cause).message);
    } finally {
      setExistingPrinting(false);
    }
  }

  function handleSearchAgain(): void {
    setSelectedSpool(undefined);
    setSpoolQuery("");
    setExistingPrintJob(undefined);
    setExistingPrintError(undefined);
  }

  // Neue Spule: Filament + Spulendaten.
  const [filamentMode, setFilamentMode] = useState<"existing" | "new">("existing");
  const [filamentQuery, setFilamentQuery] = useState("");
  const [selectedFilament, setSelectedFilament] = useState<SpoolmanFilament | undefined>();
  const { results: filamentResults, loading: filamentSearchLoading } = useDebouncedSearch(
    filamentQuery,
    searchFilaments,
  );
  const [newFilament, setNewFilament] = useState<NewFilamentInput>({
    density: 1.24,
    diameter: 1.75,
  });
  const [vendorQuery, setVendorQuery] = useState("");
  const [selectedVendor, setSelectedVendor] = useState<SpoolmanVendor | undefined>();
  const { results: vendorResults, loading: vendorSearchLoading } = useDebouncedSearch(
    vendorQuery,
    searchVendors,
  );

  const [quantity, setQuantity] = useState(1);
  const [spoolFields, setSpoolFields] = useState<SpoolFieldsInput>({});
  const [newAdvancedOpen, setNewAdvancedOpen] = useState(false);

  const [idempotencyKey, setIdempotencyKey] = useState(generateIdempotencyKey);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<WorkflowRunResult | undefined>();
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | undefined>();

  const filamentReady =
    filamentMode === "existing"
      ? selectedFilament !== undefined
      : newFilament.density > 0 && newFilament.diameter > 0;

  async function resolveVendorId(): Promise<number | undefined> {
    if (selectedVendor) {
      return selectedVendor.id;
    }
    if (vendorQuery.trim().length > 0) {
      const created = await createVendor(vendorQuery.trim());
      return created.id;
    }
    return undefined;
  }

  async function handleSubmit(): Promise<void> {
    if (!filamentReady) {
      return;
    }
    setSubmitting(true);
    setSubmitErrorMessage(undefined);
    try {
      const filamentInput =
        filamentMode === "existing"
          ? { filament_id: selectedFilament?.id }
          : { new_filament: { ...newFilament, vendor_id: await resolveVendorId() } };

      const response = await createAndPrint({
        idempotency_key: idempotencyKey,
        ...filamentInput,
        spool: spoolFields,
        quantity,
        ...(templateId ? { template_id: templateId } : {}),
        ...(printerId ? { printer_id: printerId } : {}),
        ...(copies ? { copies } : {}),
      });
      setResult(response);
    } catch (cause) {
      setSubmitErrorMessage(toApiError(cause).message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset(): void {
    setResult(undefined);
    setSubmitErrorMessage(undefined);
    setIdempotencyKey(generateIdempotencyKey());
    setSelectedFilament(undefined);
    setFilamentQuery("");
    setSelectedVendor(undefined);
    setVendorQuery("");
    setSpoolFields({});
    setQuantity(1);
  }

  const resultRows: ResultRow[] = useMemo(
    () => (result?.created_spool_ids ?? []).map((spoolId) => ({ key: spoolId, spoolId })),
    [result],
  );
  const columns: ColumnsType<ResultRow> = [
    { key: "spoolId", dataIndex: "spoolId", title: "Spoolman-ID" },
  ];

  const advancedProps: Omit<AdvancedPrintOptionsProps, "isMobile"> = {
    templates,
    printers,
    templateId,
    onTemplateIdChange: setTemplateId,
    printerId,
    onPrinterIdChange: setPrinterId,
    copies,
    onCopiesChange: setCopies,
  };

  return (
    <>
      <PageHeading title={page.title} subtitle={page.subtitle} />

      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        {!hintDismissed ? (
          <Alert
            type="info"
            showIcon
            closable
            message={page.hint}
            onClose={() => {
              setHintDismissed(true);
              try {
                window.localStorage.setItem(HINT_DISMISSED_STORAGE_KEY, "1");
              } catch {
                // Speicher nicht verfuegbar (z. B. privater Modus) — der
                // Hinweis erscheint dann beim naechsten Laden erneut, was
                // immer noch besser ist als ein Fehler beim Wegklicken.
              }
            }}
          />
        ) : null}

        <Segmented
          size="large"
          block={isMobile}
          value={mode}
          onChange={(value) => {
            setMode(value as EntryMode);
          }}
          options={[
            { label: page.entry.existing, value: "existing" },
            { label: page.entry.new, value: "new" },
          ]}
        />
        <Typography.Text type="secondary">
          {mode === "existing" ? page.entry.existingHint : page.entry.newHint}
        </Typography.Text>

        {mode === "existing" ? (
          <Card title={page.entry.existing}>
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              <Select
                showSearch
                allowClear
                size="large"
                style={{ width: "100%" }}
                placeholder={page.existing.searchPlaceholder}
                value={selectedSpool?.id}
                filterOption={false}
                notFoundContent={spoolSearchLoading ? <Spin size="small" /> : null}
                onSearch={setSpoolQuery}
                onChange={(value) => {
                  setSelectedSpool(spoolResults.find((spool) => spool.id === value));
                  setExistingPrintJob(undefined);
                  setExistingPrintError(undefined);
                }}
                options={spoolResults.map((spool) => ({
                  value: spool.id,
                  label: spoolOptionLabel(spool),
                }))}
              />

              {selectedSpool ? (
                <>
                  <Descriptions
                    size="small"
                    column={1}
                    bordered
                    title={page.existing.selectedTitle}
                  >
                    <Descriptions.Item label={page.existing.spoolId}>
                      {selectedSpool.id}
                    </Descriptions.Item>
                    <Descriptions.Item label={page.existing.material}>
                      <Space>
                        {selectedSpool.filament?.color_hex ? (
                          <span
                            aria-hidden="true"
                            style={{
                              display: "inline-block",
                              width: 12,
                              height: 12,
                              borderRadius: "50%",
                              background: `#${selectedSpool.filament.color_hex}`,
                              border: "1px solid rgba(0,0,0,0.15)",
                            }}
                          />
                        ) : null}
                        {spoolmanFilamentLabel(selectedSpool.filament)}
                      </Space>
                    </Descriptions.Item>
                    <Descriptions.Item label={page.existing.location}>
                      {selectedSpool.location ?? "—"}
                    </Descriptions.Item>
                  </Descriptions>

                  {existingPrintError ? (
                    <Alert type="error" showIcon message={existingPrintError} />
                  ) : null}

                  {existingPrintJob ? (
                    existingPrintJob.status === "failed" ? (
                      <Alert
                        type="error"
                        showIcon
                        message={page.existing.printFailed}
                        description={existingPrintJob.error_message}
                      />
                    ) : (
                      <Alert type="success" showIcon message={page.existing.printSuccess} />
                    )
                  ) : null}

                  <Collapse
                    ghost
                    activeKey={existingAdvancedOpen ? ["advanced"] : []}
                    onChange={(keys) => {
                      setExistingAdvancedOpen(
                        Array.isArray(keys) ? keys.includes("advanced") : keys === "advanced",
                      );
                    }}
                    items={[
                      {
                        key: "advanced",
                        label: page.advanced.toggle,
                        children: <AdvancedPrintOptions isMobile={isMobile} {...advancedProps} />,
                      },
                    ]}
                  />

                  <Divider style={{ margin: "4px 0" }} />
                  <Space wrap>
                    <Button onClick={handleSearchAgain}>{page.existing.searchAgain}</Button>
                    <Button
                      type="primary"
                      size="large"
                      loading={existingPrinting}
                      onClick={() => void handlePrintExisting()}
                    >
                      {existingPrinting
                        ? page.existing.printing
                        : existingPrintJob
                          ? page.existing.printAgain
                          : page.existing.printAction}
                    </Button>
                  </Space>
                </>
              ) : (
                <Typography.Text type="secondary">{page.existing.none}</Typography.Text>
              )}
            </Space>
          </Card>
        ) : (
          <Card title={page.entry.new}>
            <Space direction="vertical" size="large" style={{ width: "100%" }}>
              <Typography.Title level={5}>{page.filament.sectionTitle}</Typography.Title>
              <Segmented
                size="large"
                block={isMobile}
                value={filamentMode}
                onChange={(value) => {
                  setFilamentMode(value as "existing" | "new");
                }}
                options={[
                  { label: page.filament.modeExisting, value: "existing" },
                  { label: page.filament.modeNew, value: "new" },
                ]}
              />

              {filamentMode === "existing" ? (
                <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                  <Select
                    showSearch
                    allowClear
                    size="large"
                    style={{ width: "100%" }}
                    placeholder={page.filament.searchPlaceholder}
                    value={selectedFilament?.id}
                    filterOption={false}
                    notFoundContent={filamentSearchLoading ? <Spin size="small" /> : null}
                    onSearch={setFilamentQuery}
                    onChange={(value) => {
                      setSelectedFilament(
                        filamentResults.find((filament) => filament.id === value),
                      );
                    }}
                    options={filamentResults.map((filament) => ({
                      value: filament.id,
                      label: [filament.vendor?.name, filament.name ?? filament.material]
                        .filter(Boolean)
                        .join(" – "),
                    }))}
                  />
                  {selectedFilament ? (
                    <Descriptions size="small" column={1} bordered>
                      <Descriptions.Item label={page.filament.material}>
                        {selectedFilament.material ?? "—"}
                      </Descriptions.Item>
                      <Descriptions.Item label={page.filament.colorHex}>
                        {selectedFilament.color_hex ?? "—"}
                      </Descriptions.Item>
                    </Descriptions>
                  ) : (
                    <Typography.Text type="secondary">{page.filament.none}</Typography.Text>
                  )}
                </Space>
              ) : (
                <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                  <Select
                    showSearch
                    allowClear
                    size="large"
                    style={{ width: "100%" }}
                    placeholder={page.filament.vendorPlaceholder}
                    value={selectedVendor?.id}
                    filterOption={false}
                    notFoundContent={vendorSearchLoading ? <Spin size="small" /> : null}
                    onSearch={setVendorQuery}
                    onChange={(value) => {
                      setSelectedVendor(vendorResults.find((vendor) => vendor.id === value));
                    }}
                    options={vendorResults.map((vendor) => ({
                      value: vendor.id,
                      label: vendor.name,
                    }))}
                  />
                  {!selectedVendor && vendorQuery.trim().length > 0 ? (
                    <Typography.Text type="secondary">
                      {page.filament.vendorNew(vendorQuery.trim())}
                    </Typography.Text>
                  ) : null}
                  <Input
                    size="large"
                    placeholder={page.filament.name}
                    value={newFilament.name ?? ""}
                    onChange={(event) => {
                      setNewFilament({ ...newFilament, name: event.target.value });
                    }}
                  />
                  <Input
                    size="large"
                    placeholder={page.filament.material}
                    value={newFilament.material ?? ""}
                    onChange={(event) => {
                      setNewFilament({ ...newFilament, material: event.target.value });
                    }}
                  />
                  <Input
                    size="large"
                    placeholder={page.filament.colorHex}
                    maxLength={8}
                    value={newFilament.color_hex ?? ""}
                    onChange={(event) => {
                      setNewFilament({ ...newFilament, color_hex: event.target.value });
                    }}
                  />
                  <Space direction={isMobile ? "vertical" : "horizontal"} style={{ width: "100%" }}>
                    <LabeledNumber
                      label={page.filament.density}
                      mobile={isMobile}
                      min={0.1}
                      step={0.01}
                      value={newFilament.density}
                      onChange={(value) => {
                        setNewFilament({ ...newFilament, density: value ?? 0 });
                      }}
                    />
                    <LabeledNumber
                      label={page.filament.diameter}
                      mobile={isMobile}
                      min={0.1}
                      step={0.01}
                      value={newFilament.diameter}
                      onChange={(value) => {
                        setNewFilament({ ...newFilament, diameter: value ?? 0 });
                      }}
                    />
                  </Space>
                </Space>
              )}

              <Divider style={{ margin: "4px 0" }} />

              <Typography.Title level={5}>{page.spool.sectionTitle}</Typography.Title>
              <LabeledNumber
                label={page.spool.quantity}
                mobile={isMobile}
                min={1}
                max={MAX_QUANTITY}
                value={quantity}
                onChange={(value) => {
                  setQuantity(value ?? 1);
                }}
              />
              <Typography.Text type="secondary">{page.spool.quantityHint}</Typography.Text>
              <Input
                size="large"
                placeholder={page.spool.location}
                value={spoolFields.location ?? ""}
                onChange={(event) => {
                  setSpoolFields({ ...spoolFields, location: event.target.value || undefined });
                }}
              />
              <Input
                size="large"
                placeholder={page.spool.lotNr}
                value={spoolFields.lot_nr ?? ""}
                onChange={(event) => {
                  setSpoolFields({ ...spoolFields, lot_nr: event.target.value || undefined });
                }}
              />
              <Input.TextArea
                placeholder={page.spool.comment}
                value={spoolFields.comment ?? ""}
                onChange={(event) => {
                  setSpoolFields({ ...spoolFields, comment: event.target.value || undefined });
                }}
              />
              <Space direction={isMobile ? "vertical" : "horizontal"} style={{ width: "100%" }}>
                <LabeledNumber
                  label={page.spool.initialWeight}
                  mobile={isMobile}
                  min={0}
                  value={spoolFields.initial_weight ?? undefined}
                  onChange={(value) => {
                    setSpoolFields({ ...spoolFields, initial_weight: value ?? undefined });
                  }}
                />
                <LabeledNumber
                  label={page.spool.spoolWeight}
                  mobile={isMobile}
                  min={0}
                  value={spoolFields.spool_weight ?? undefined}
                  onChange={(value) => {
                    setSpoolFields({ ...spoolFields, spool_weight: value ?? undefined });
                  }}
                />
              </Space>

              <Divider style={{ margin: "4px 0" }} />

              {!result ? (
                <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                  <Collapse
                    ghost
                    activeKey={newAdvancedOpen ? ["advanced"] : []}
                    onChange={(keys) => {
                      setNewAdvancedOpen(
                        Array.isArray(keys) ? keys.includes("advanced") : keys === "advanced",
                      );
                    }}
                    items={[
                      {
                        key: "advanced",
                        label: page.advanced.toggle,
                        children: <AdvancedPrintOptions isMobile={isMobile} {...advancedProps} />,
                      },
                    ]}
                  />

                  {submitErrorMessage ? (
                    <Alert type="error" showIcon message={submitErrorMessage} />
                  ) : null}

                  <Button
                    type="primary"
                    size="large"
                    disabled={!filamentReady}
                    loading={submitting}
                    onClick={() => void handleSubmit()}
                  >
                    {submitting ? page.submit.submitting : page.submit.action}
                  </Button>
                </Space>
              ) : (
                <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                  {result.status === "completed" ? (
                    <Alert type="success" showIcon message={page.submit.statusLabel.completed} />
                  ) : null}
                  {result.status === "partial" ? (
                    <Alert
                      type="warning"
                      showIcon
                      message={page.submit.statusLabel.partial}
                      description={page.submit.partialHint}
                    />
                  ) : null}
                  {result.status === "failed" ? (
                    <Alert
                      type="error"
                      showIcon
                      message={page.submit.statusLabel.failed}
                      description={result.error?.message}
                    />
                  ) : null}

                  {resultRows.length > 0 ? (
                    <>
                      <Typography.Text strong>{page.submit.createdSpools}</Typography.Text>
                      <Table<ResultRow>
                        size="small"
                        rowKey="key"
                        columns={columns}
                        dataSource={resultRows}
                        pagination={false}
                      />
                    </>
                  ) : null}

                  <Space wrap>
                    {result.status === "partial" ? (
                      <Link to="/history">
                        <Button>{page.submit.goToHistory}</Button>
                      </Link>
                    ) : null}
                    <Button type="primary" onClick={handleReset}>
                      {page.submit.again}
                    </Button>
                  </Space>
                </Space>
              )}
            </Space>
          </Card>
        )}
      </Space>
    </>
  );
}
