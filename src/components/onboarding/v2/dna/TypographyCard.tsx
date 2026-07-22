import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FontSample } from './FontSample';

type Props = {
  primary: string | null;
  secondary: string | null;
  chip?: React.ReactNode;
};

export function TypographyCard({ primary, secondary, chip }: Props) {
  return (
    <Card className="border-[#e5e7eb] shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-[#64748b]">
          Typography
        </CardTitle>
        {chip}
      </CardHeader>
      <CardContent>
        {primary || secondary ? (
          <div className="flex gap-5">
            <FontSample family={primary} role="Primary" weight={700} />
            <FontSample family={secondary} role="Secondary" weight={400} />
          </div>
        ) : (
          <p className="text-sm italic text-[#94a3b8]">No fonts detected.</p>
        )}
      </CardContent>
    </Card>
  );
}
