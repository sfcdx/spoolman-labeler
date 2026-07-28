import { DesktopOutlined, MoonOutlined, SunOutlined } from "@ant-design/icons";
import { Segmented } from "antd";
import { texts } from "../texts/de";
import { useColorMode } from "../theme/useColorMode";
import { isColorModePreference } from "../theme/colorMode";

/**
 * Drei-Zustands-Umschalter fuer das Farbschema — dieselbe Semantik und
 * dasselbe Bedienelement wie in Spoolman (docs/ui-analysis.md, Abschnitt 3).
 *
 * Barrierefreiheit: Jede Option traegt einen sichtbaren Namen fuer
 * Screenreader (visuell ausgeblendet) sowie einen Tooltip-Titel; das
 * Segmented ist per Tastatur mit den Pfeiltasten bedienbar.
 */
export function ThemeSwitcher(): React.JSX.Element {
  const { preference, setPreference } = useColorMode();

  return (
    <Segmented
      value={preference}
      aria-label={texts.theme.label}
      onChange={(value) => {
        if (isColorModePreference(value)) {
          setPreference(value);
        }
      }}
      options={[
        {
          value: "system",
          title: texts.theme.system,
          icon: <DesktopOutlined aria-hidden="true" />,
          label: <span className="sl-visually-hidden">{texts.theme.system}</span>,
        },
        {
          value: "light",
          title: texts.theme.light,
          icon: <SunOutlined aria-hidden="true" />,
          label: <span className="sl-visually-hidden">{texts.theme.light}</span>,
        },
        {
          value: "dark",
          title: texts.theme.dark,
          icon: <MoonOutlined aria-hidden="true" />,
          label: <span className="sl-visually-hidden">{texts.theme.dark}</span>,
        },
      ]}
    />
  );
}
