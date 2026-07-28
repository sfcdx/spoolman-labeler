import { Button, Result } from "antd";
import { Link } from "react-router";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { texts } from "../texts/de";

const page = texts.pages.notFound;

export function NotFoundPage(): React.JSX.Element {
  useDocumentTitle(page.title);

  return (
    <Result
      status="404"
      title={page.title}
      subTitle={page.subtitle}
      extra={
        <Link to="/">
          <Button type="primary">{page.backHome}</Button>
        </Link>
      }
    />
  );
}
