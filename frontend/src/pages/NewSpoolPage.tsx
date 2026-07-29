import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Divider,
  Input,
  Select,
  Segmented,
  Space,
  Spin,
  Steps,
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
  searchFilaments,
  searchVendors,
  toApiError,
  type LabelTemplate,
  type NewFilamentInput,
  type Printer,
  type SpoolFieldsInput,
  type SpoolmanFilament,
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

interface ResultRow {
  key: number;
  spoolId: number;
}

export function NewSpoolPage(): React.JSX.Element {
  const isMobile = useIsMobile();
  const [current, setCurrent] = useState(0);
  const [hintDismissed, setHintDismissed] = useState(readHintDismissed);

  // Schritt 1: Filament
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

  // Schritt 2: Spulendaten
  const [quantity, setQuantity] = useState(1);
  const [spoolFields, setSpoolFields] = useState<SpoolFieldsInput>({});

  // Schritt 3: Etikett
  const [templates, setTemplates] = useState<LabelTemplate[]>([]);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [templateId, setTemplateId] = useState<number | undefined>();
  const [printerId, setPrinterId] = useState<number | undefined>();
  const [copies, setCopies] = useState<number | undefined>();

  // Schritt 4: Absenden
  const [idempotencyKey, setIdempotencyKey] = useState(generateIdempotencyKey);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<WorkflowRunResult | undefined>();
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | undefined>();

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

  // Vorbelegung ohne Effekt: Solange die Nutzerin keine eigene Wahl trifft
  // (templateId/printerId bleiben `undefined`), gilt die erste Standard- bzw.
  // erste verfügbare Option als effektiv ausgewählt.
  const effectiveTemplateId =
    templateId ?? templates.find((template) => template.is_default)?.id ?? templates[0]?.id;
  const effectivePrinterId =
    printerId ?? printers.find((printer) => printer.is_default)?.id ?? printers[0]?.id;

  const filamentReady =
    filamentMode === "existing"
      ? selectedFilament !== undefined
      : newFilament.density > 0 && newFilament.diameter > 0;
  const labelReady = effectiveTemplateId !== undefined && effectivePrinterId !== undefined;

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
    if (!labelReady || effectiveTemplateId === undefined || effectivePrinterId === undefined) {
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
        template_id: effectiveTemplateId,
        printer_id: effectivePrinterId,
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
    setCurrent(0);
    setResult(undefined);
    setSubmitErrorMessage(undefined);
    setIdempotencyKey(generateIdempotencyKey());
    setSelectedFilament(undefined);
    setFilamentQuery("");
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

  return (
    <>
      <PageHeading title={page.title} subtitle={page.subtitle} />

      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <Steps
          current={current}
          responsive
          items={[
            { title: page.steps.filament },
            { title: page.steps.spool },
            { title: page.steps.label },
            { title: page.steps.print },
          ]}
        />

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

        {current === 0 ? (
          <Card title={page.steps.filament}>
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              <Segmented
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
                <>
                  <Select
                    showSearch
                    allowClear
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
                </>
              ) : (
                <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                  <Select
                    showSearch
                    allowClear
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
                    placeholder={page.filament.name}
                    value={newFilament.name ?? ""}
                    onChange={(event) => {
                      setNewFilament({ ...newFilament, name: event.target.value });
                    }}
                  />
                  <Input
                    placeholder={page.filament.material}
                    value={newFilament.material ?? ""}
                    onChange={(event) => {
                      setNewFilament({ ...newFilament, material: event.target.value });
                    }}
                  />
                  <Input
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
              <Button
                type="primary"
                disabled={!filamentReady}
                onClick={() => {
                  setCurrent(1);
                }}
              >
                {page.submit.next}
              </Button>
            </Space>
          </Card>
        ) : null}

        {current === 1 ? (
          <Card title={page.steps.spool}>
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
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
                placeholder={page.spool.location}
                value={spoolFields.location ?? ""}
                onChange={(event) => {
                  setSpoolFields({ ...spoolFields, location: event.target.value || undefined });
                }}
              />
              <Input
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
              <Space wrap>
                <Button
                  onClick={() => {
                    setCurrent(0);
                  }}
                >
                  {page.submit.back}
                </Button>
                <Button
                  type="primary"
                  onClick={() => {
                    setCurrent(2);
                  }}
                >
                  {page.submit.next}
                </Button>
              </Space>
            </Space>
          </Card>
        ) : null}

        {current === 2 ? (
          <Card title={page.steps.label}>
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              {templates.length === 0 ? (
                <Alert
                  type="warning"
                  showIcon
                  message={page.label.noTemplates}
                  action={
                    <Link to="/templates">
                      <Button size="small">{page.label.goToTemplates}</Button>
                    </Link>
                  }
                />
              ) : (
                <Select
                  style={{ width: "100%" }}
                  placeholder={page.label.template}
                  value={effectiveTemplateId}
                  onChange={setTemplateId}
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
                  message={page.label.noPrinters}
                  action={
                    <Link to="/settings">
                      <Button size="small">{page.label.goToSettings}</Button>
                    </Link>
                  }
                />
              ) : (
                <Select
                  style={{ width: "100%" }}
                  placeholder={page.label.printer}
                  value={effectivePrinterId}
                  onChange={setPrinterId}
                  options={printers.map((printer) => ({
                    value: printer.id,
                    label: printer.name,
                  }))}
                />
              )}

              <LabeledNumber
                label={page.label.copies}
                mobile={isMobile}
                min={1}
                max={100}
                value={copies}
                onChange={(value) => {
                  setCopies(value ?? undefined);
                }}
              />

              <Divider style={{ margin: "4px 0" }} />
              <Space wrap>
                <Button
                  onClick={() => {
                    setCurrent(1);
                  }}
                >
                  {page.submit.back}
                </Button>
                <Button
                  type="primary"
                  disabled={!labelReady}
                  onClick={() => {
                    setCurrent(3);
                  }}
                >
                  {page.submit.next}
                </Button>
              </Space>
            </Space>
          </Card>
        ) : null}

        {current === 3 ? (
          <Card title={page.steps.print}>
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              {!result ? (
                <>
                  {submitErrorMessage ? (
                    <Alert type="error" showIcon message={submitErrorMessage} />
                  ) : null}
                  <Space wrap>
                    <Button
                      disabled={submitting}
                      onClick={() => {
                        setCurrent(2);
                      }}
                    >
                      {page.submit.back}
                    </Button>
                    <Button
                      type="primary"
                      loading={submitting}
                      onClick={() => {
                        void handleSubmit();
                      }}
                    >
                      {submitting ? page.submit.submitting : page.submit.action}
                    </Button>
                  </Space>
                </>
              ) : (
                <>
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
                </>
              )}
            </Space>
          </Card>
        ) : null}
      </Space>
    </>
  );
}
