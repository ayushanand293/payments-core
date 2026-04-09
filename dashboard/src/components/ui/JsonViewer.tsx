type Props = {
  value: unknown;
};

export function JsonViewer({ value }: Props) {
  return <pre className="ui-codeblock">{JSON.stringify(value, null, 2)}</pre>;
}

export function CodeBlock({ code }: { code: string }) {
  return <pre className="ui-codeblock">{code}</pre>;
}
