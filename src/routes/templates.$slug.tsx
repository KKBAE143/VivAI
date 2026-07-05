import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Download, Check } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { useTemplate } from "@/lib/hooks";

export const Route = createFileRoute("/templates/$slug")({
  head: () => ({ meta: [{ title: "Guide — CollgePro Navigator" }] }),
  component: TemplateDetail,
});

/** Minimal, safe markdown renderer for the guide content (headings + bullet lists + paragraphs). */
function renderContent(content: string) {
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];

  const flushList = (key: string) => {
    if (list.length) {
      blocks.push(
        <ul key={key} className="ml-1 space-y-1.5">
          {list.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              {item}
            </li>
          ))}
        </ul>,
      );
      list = [];
    }
  };

  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) {
      flushList(`ul-${idx}`);
      return;
    }
    if (line.startsWith("- ")) {
      list.push(line.slice(2));
      return;
    }
    flushList(`ul-${idx}`);
    if (line.startsWith("### ")) {
      blocks.push(<h4 key={idx} className="text-base font-semibold">{line.slice(4)}</h4>);
    } else if (line.startsWith("## ")) {
      blocks.push(<h3 key={idx} className="mt-2 text-lg font-semibold">{line.slice(3)}</h3>);
    } else if (line.startsWith("# ")) {
      blocks.push(<h2 key={idx} className="text-xl font-bold">{line.slice(2)}</h2>);
    } else {
      blocks.push(<p key={idx} className="text-sm leading-relaxed text-muted-foreground">{line}</p>);
    }
  });
  flushList("ul-final");
  return blocks;
}

function TemplateDetail() {
  const { slug } = Route.useParams();
  const { data: template, isLoading, isError } = useTemplate(slug);
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  const checklist = useMemo(() => (template?.checklist as string[] | undefined) ?? [], [template]);
  const doneCount = Object.values(checked).filter(Boolean).length;

  const toggle = (i: number) => setChecked((prev) => ({ ...prev, [i]: !prev[i] }));

  const downloadChecklist = () => {
    const title = String(template?.title ?? "Checklist");
    const body = checklist.map((c, i) => `[${checked[i] ? "x" : " "}] ${c}`).join("\n");
    const blob = new Blob([`${title}\n\n${body}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}-checklist.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell>
      <div className="flex items-center gap-3">
        <Link to="/templates" className="grid h-9 w-9 place-items-center rounded-xl bg-card shadow-[var(--shadow-card)]">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          {template?.category ? <Badge tone="primary">{String(template.category)}</Badge> : null}
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            {isLoading ? "Loading…" : String(template?.title ?? "Guide")}
          </h1>
          {template?.summary ? (
            <p className="mt-1 text-sm text-muted-foreground">{String(template.summary)}</p>
          ) : null}
        </div>
        {checklist.length > 0 && (
          <button
            onClick={downloadChecklist}
            className="hidden items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background sm:flex"
          >
            <Download className="h-4 w-4" /> Checklist
          </button>
        )}
      </div>

      {isError && (
        <Card className="mt-6 text-sm text-destructive">This guide could not be found.</Card>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          <Card>
            {isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-4 animate-pulse rounded bg-secondary" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">{renderContent(String(template?.content ?? ""))}</div>
            )}
          </Card>
        </div>

        <aside className="space-y-5">
          {checklist.length > 0 && (
            <Card>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Checklist</h3>
                <span className="text-xs text-muted-foreground">
                  {doneCount}/{checklist.length}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {checklist.map((item, i) => (
                  <button
                    key={i}
                    onClick={() => toggle(i)}
                    className="flex w-full items-start gap-2.5 text-left text-sm"
                  >
                    <span
                      className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border ${
                        checked[i] ? "border-primary bg-primary text-primary-foreground" : "border-border"
                      }`}
                    >
                      {checked[i] && <Check className="h-3 w-3" />}
                    </span>
                    <span className={checked[i] ? "text-muted-foreground line-through" : ""}>{item}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}

          <Card className="bg-primary text-primary-foreground">
            <h3 className="text-base font-semibold">Ready to practice?</h3>
            <p className="mt-1 text-xs text-primary-foreground/85">Run an AI mock viva to test yourself on this guide.</p>
            <Link
              to="/ai-viva/new"
              className="mt-4 block rounded-xl bg-primary-foreground px-4 py-2.5 text-center text-sm font-semibold text-primary"
            >
              Start Mock Viva
            </Link>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}
