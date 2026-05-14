import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  title: string;
  badge: string;
  children: React.ReactNode;
  chips?: React.ReactNode;
  findings?: React.ReactNode;
};

export function DnaSectionCard({ title, badge, children, chips, findings }: Props) {
  return (
    <Card className="border-[#e5e7eb] shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <CardTitle className="text-[14px]">{title}</CardTitle>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {chips}
          <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">
            {badge}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-[13px] leading-relaxed text-[#374151]">
        {children}
        {findings}
      </CardContent>
    </Card>
  );
}
