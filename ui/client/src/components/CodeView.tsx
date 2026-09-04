// Syntax-highlighted code viewer (spec §10: highlight.js). Step code is `.py`
// only (spec §9), so we highlight as Python. Rendering is memoised on content.
import { useMemo } from "react";
import hljs from "highlight.js/lib/core";
import python from "highlight.js/lib/languages/python";
import "highlight.js/styles/github.css";

hljs.registerLanguage("python", python);

export function CodeView({
  content,
  language = "python",
}: {
  content: string;
  language?: string;
}): JSX.Element {
  const html = useMemo(() => {
    try {
      return hljs.highlight(content, { language }).value;
    } catch {
      return hljs.highlightAuto(content).value;
    }
  }, [content, language]);
  return (
    <pre className="code">
      <code
        className={`language-${language} hljs`}
        // highlight.js emits its own escaped, token-wrapped markup.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </pre>
  );
}
