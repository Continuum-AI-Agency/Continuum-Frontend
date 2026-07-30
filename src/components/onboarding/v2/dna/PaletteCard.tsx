import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ColorSwatch } from './ColorSwatch';

type Props = {
  colors: string[];
  chip?: React.ReactNode;
};

export function PaletteCard({ colors, chip }: Props) {
  return (
    <Card className="border-[#e5e7eb] shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-[#64748b]">
          Palette
        </CardTitle>
        {chip}
      </CardHeader>
      <CardContent>
        {colors.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {colors.map((hex, index) => (
              <ColorSwatch key={`${hex}-${index}`} hex={hex} />
            ))}
          </div>
        ) : (
          <p className="text-sm italic text-[#94a3b8]">No palette detected.</p>
        )}
      </CardContent>
    </Card>
  );
}
