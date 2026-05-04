"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Square, RotateCcw, Trash2, Save, Plus } from "lucide-react";

type StackSummary = {
  name: string;
  composePath: string;
  updatedAt: string;
  existsOnDisk: boolean;
  containerCount: number;
  runningCount: number;
};

type StackManagerProps = {
  canManage: boolean;
  canDelete: boolean;
};

const starterCompose = `services:\n  nginx:\n    image: nginx:alpine\n    ports:\n      - \"8080:80\"\n`;

export function StackManager({ canManage, canDelete }: StackManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [stacks, setStacks] = useState<StackSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [composeContent, setComposeContent] = useState("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function parseApiResponse(res: Response) {
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { error: text.slice(0, 200) || "Invalid server response" };
    }
  }

  async function loadStacks() {
    const res = await fetch("/api/docker/stacks");
    const data = await parseApiResponse(res);
    if (!res.ok) {
      setError(String(data.error ?? "Failed to load stacks"));
      return;
    }
    const nextStacks = (data.stacks as StackSummary[] | undefined) ?? [];
    setStacks(nextStacks);
    if (!selected && nextStacks.length) {
      void selectStack(nextStacks[0].name);
    }
  }

  async function selectStack(name: string) {
    setSelected(name);
    const res = await fetch(`/api/docker/stacks/${name}`);
    const data = await parseApiResponse(res);
    if (!res.ok) {
      setError(String(data.error ?? "Failed to load stack file"));
      return;
    }
    setComposeContent(String(data.content ?? ""));
  }

  useEffect(() => {
    void loadStacks();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createStack() {
    if (!newName.trim()) return;
    const res = await fetch("/api/docker/stacks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), content: starterCompose, deploy: false }),
    });
    const data = await parseApiResponse(res);
    if (!res.ok) {
      setError(String(data.error ?? "Failed to create stack"));
      return;
    }
    setNewName("");
    await loadStacks();
    await selectStack(String(data.name ?? ""));
  }

  async function runAction(action: string) {
    if (!selected) return;
    setError(null);
    const res = await fetch(`/api/docker/stacks/${selected}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, content: composeContent }),
    });
    const data = await parseApiResponse(res);
    if (!res.ok) {
      setError(String(data.error ?? `${action} failed`));
      return;
    }
    startTransition(() => router.refresh());
    await loadStacks();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-4">
          <h2 className="text-sm font-semibold text-foreground">Stacks</h2>
          <p className="text-xs text-muted-foreground mt-1">Compose-based application groups</p>
          {canManage && (
            <div className="mt-4 flex gap-2">
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="new-stack"
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <button onClick={createStack} className="rounded-md bg-primary px-3 py-2 text-primary-foreground">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        <div className="max-h-[70vh] overflow-auto">
          {stacks.map((stack) => (
            <button
              key={stack.name}
              onClick={() => void selectStack(stack.name)}
              className={`w-full border-b border-border px-4 py-3 text-left transition ${selected === stack.name ? "bg-primary/10" : "hover:bg-muted/20"}`}
            >
              <div className="font-medium text-foreground">{stack.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {stack.runningCount}/{stack.containerCount} running
              </div>
            </button>
          ))}
          {stacks.length === 0 && <div className="p-4 text-sm text-muted-foreground">No stacks yet.</div>}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <div className="mr-auto">
            <h2 className="text-sm font-semibold text-foreground">{selected ?? "Select a stack"}</h2>
            <p className="text-xs text-muted-foreground mt-1">Absolute host paths are recommended in compose files.</p>
          </div>
          {canManage && selected && (
            <>
              <button onClick={() => void runAction("save")} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent transition"><span className="inline-flex items-center gap-1"><Save className="w-4 h-4" />Save</span></button>
              <button onClick={() => void runAction("deploy")} className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition">Deploy</button>
              <button onClick={() => void runAction("start")} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent transition"><span className="inline-flex items-center gap-1"><Play className="w-4 h-4" />Start</span></button>
              <button onClick={() => void runAction("stop")} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent transition"><span className="inline-flex items-center gap-1"><Square className="w-4 h-4" />Stop</span></button>
              <button onClick={() => void runAction("restart")} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent transition"><span className="inline-flex items-center gap-1"><RotateCcw className="w-4 h-4" />Restart</span></button>
              {canDelete && <button onClick={() => void runAction("remove")} className="rounded-md border border-destructive/30 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition"><span className="inline-flex items-center gap-1"><Trash2 className="w-4 h-4" />Remove</span></button>}
            </>
          )}
        </div>

        {error && <div className="border-b border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

        <textarea
          value={composeContent}
          onChange={(event) => setComposeContent(event.target.value)}
          disabled={!selected || !canManage || isPending}
          spellCheck={false}
          className="min-h-[70vh] w-full resize-none bg-background p-4 font-mono text-sm text-foreground outline-none disabled:opacity-60"
          placeholder="Select or create a stack to edit docker-compose.yml"
        />
      </div>
    </div>
  );
}