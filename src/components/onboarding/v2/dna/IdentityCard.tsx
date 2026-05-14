import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { createSignedAssetUrl } from "@/lib/creative-assets/storageClient";
import { EditableHeading } from "./EditableHeading";

type Props = {
  name: string;
  host: string | null;
  heroStatement: string | null;
  logoPath: string | null;
  onRename: (next: string) => void;
};

export function IdentityCard({ name, host, heroStatement, logoPath, onRename }: Props) {
  const [resolvedLogo, setResolvedLogo] = useState<string | null>(null);

  useEffect(() => {
    if (!logoPath) {
      setResolvedLogo(null);
      return;
    }
    if (/^https?:\/\//i.test(logoPath)) {
      setResolvedLogo(logoPath);
      return;
    }
    let active = true;
    createSignedAssetUrl(logoPath, 3600)
      .then((url) => active && setResolvedLogo(url))
      .catch(() => active && setResolvedLogo(null));
    return () => {
      active = false;
    };
  }, [logoPath]);

  return (
    <Card className="border-[#e5e7eb] shadow-sm">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9 shrink-0 rounded-lg bg-[#0b1220]">
            {resolvedLogo ? <AvatarImage src={resolvedLogo} alt={`${name} logo`} className="object-cover" /> : null}
            <AvatarFallback className="rounded-lg bg-[#0b1220] text-[12px] font-bold text-white">
              {(name || "B").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <EditableHeading value={name} placeholder="Untitled brand" onCommit={onRename} />
        </div>
        {host ? (
          <div className="flex items-center gap-1.5 text-[12px] text-[#64748b]">
            <ExternalLink className="h-3 w-3" />
            {host}
          </div>
        ) : null}
        {heroStatement ? (
          <p className="text-[13px] italic leading-relaxed text-[#374151]">&ldquo;{heroStatement}&rdquo;</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
