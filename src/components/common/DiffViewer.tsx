"use client";

type DiffLine = {
  type: "same" | "add" | "remove";
  left?: string;
  right?: string;
};

type Props = {
  original: string;
  current: string;
  title?: string;
};

function buildDiffLines(original: string, current: string): DiffLine[] {
  const left = original.split("\n");
  const right = current.split("\n");
  const rows: DiffLine[] = [];
  const max = Math.max(left.length, right.length);

  for (let index = 0; index < max; index += 1) {
    const before = left[index];
    const after = right[index];

    if (before === after) {
      rows.push({ type: "same", left: before ?? "", right: after ?? "" });
      continue;
    }

    if (before !== undefined) {
      rows.push({ type: "remove", left: before });
    }

    if (after !== undefined) {
      rows.push({ type: "add", right: after });
    }
  }

  return rows;
}

export function DiffViewer({ original, current, title = "Unsaved Changes" }: Props) {
  const rows = buildDiffLines(original, current);
  const hasChanges = original !== current;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {hasChanges ? "Compare original and current content before saving." : "No changes detected."}
        </p>
      </div>
      <div className="max-h-[40vh] overflow-auto font-mono text-xs">
        {rows.map((row, index) => (
          <div key={`${index}-${row.type}`} className="grid grid-cols-2 border-b border-border/60 last:border-b-0">
            <div className={`border-r border-border/60 px-3 py-1.5 whitespace-pre-wrap ${row.type === "remove" ? "bg-destructive/10 text-destructive" : "text-muted-foreground"}`}>
              {row.left ?? ""}
            </div>
            <div className={`px-3 py-1.5 whitespace-pre-wrap ${row.type === "add" ? "bg-emerald-500/10 text-emerald-300" : "text-muted-foreground"}`}>
              {row.right ?? ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}