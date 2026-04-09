export function Spinner() {
  return <span className="ui-spinner" aria-label="Loading" />;
}

export function Skeleton({ height = 18 }: { height?: number }) {
  return <div className="ui-skeleton" style={{ height }} />;
}
