import { Play, Square, Container, Cpu } from "lucide-react";

type Variant = "success" | "warning" | "default" | "destructive";
type IconName = "play" | "stop" | "container" | "docker";

interface StatusCardProps {
  title: string;
  value: string;
  variant?: Variant;
  icon?: IconName;
}

const IconMap: Record<IconName, React.ElementType> = {
  play: Play,
  stop: Square,
  container: Container,
  docker: Cpu,
};

const variantStyles: Record<Variant, string> = {
  success: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  warning: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  default: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  destructive: "text-red-400 bg-red-400/10 border-red-400/20",
};

export function StatusCard({ title, value, variant = "default", icon }: StatusCardProps) {
  const Icon = icon ? IconMap[icon] : null;
  const iconStyle = variantStyles[variant];

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
      {Icon && (
        <div className={`rounded-lg p-2.5 border ${iconStyle}`}>
          <Icon className="w-5 h-5" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground truncate">{title}</p>
        <p className="text-xl font-bold text-foreground tabular-nums">{value}</p>
      </div>
    </div>
  );
}
