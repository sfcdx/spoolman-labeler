import { InputNumber, Typography } from "antd";

export interface LabeledNumberProps {
  label: string;
  mobile: boolean;
  value: number | undefined;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
}

/**
 * Zahlenfeld mit Beschriftung.
 *
 * `addonBefore` ist auf schmalen Bildschirmen ungeeignet: Das Feld wächst
 * dadurch über die verfügbare Breite hinaus und erzwingt horizontales
 * Scrollen der ganzen Seite. Auf dem Handy steht die Beschriftung deshalb
 * über einem vollbreiten Feld statt daneben.
 */
export function LabeledNumber({
  label,
  mobile,
  value,
  onChange,
  min,
  max,
  step,
}: LabeledNumberProps): React.JSX.Element {
  if (mobile) {
    return (
      <div style={{ width: "100%" }}>
        <Typography.Text type="secondary" style={{ display: "block", marginBottom: 4 }}>
          {label}
        </Typography.Text>
        <InputNumber
          style={{ width: "100%" }}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={onChange}
        />
      </div>
    );
  }
  return (
    <InputNumber
      addonBefore={label}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={onChange}
    />
  );
}
