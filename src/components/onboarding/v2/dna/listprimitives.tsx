import { Badge } from "@/components/ui/badge";

export function ChipRow({ label, values, variant }: { label: string; values: string[]; variant: "teal" | "violet" }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {values.map((value, idx) => (
          <Badge key={`${value}-${idx}`} variant={variant}>
            {value}
          </Badge>
        ))}
      </div>
    </div>
  );
}

export function BulletList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <ul className="space-y-1 text-[12px] text-muted-foreground">
        {items.map((item, idx) => (
          <li key={idx} className="leading-snug">
            • {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
