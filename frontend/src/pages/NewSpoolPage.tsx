import { Alert, Card, Space, Steps } from "antd";
import { PageHeading } from "./PageHeading";
import { texts } from "../texts/de";

const page = texts.pages.newSpool;

/**
 * Startseite und Hauptpfad: Spule anlegen und im selben Vorgang etikettieren.
 * Platzhalter mit der spaeteren Schrittfolge (ADR-012: Anlegen und Drucken
 * sind getrennte Operationen).
 */
export function NewSpoolPage(): React.JSX.Element {
  return (
    <>
      <PageHeading title={page.title} subtitle={page.subtitle} />

      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <Steps
          current={0}
          responsive
          items={[
            { title: page.steps.filament },
            { title: page.steps.spool },
            { title: page.steps.label },
            { title: page.steps.print },
          ]}
        />

        <Alert type="info" showIcon message={page.hint} />

        <Card title={page.steps.filament}>
          <Alert
            type="warning"
            showIcon
            message={texts.common.notImplementedTitle}
            description={texts.common.notImplementedText}
          />
        </Card>
      </Space>
    </>
  );
}
