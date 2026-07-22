type FontSampleProps = {
  family: string | null;
  role: 'Primary' | 'Secondary';
  weight: number;
};

export function FontSample({ family, role, weight }: FontSampleProps) {
  return (
    <div>
      <div
        className="text-2xl leading-none text-[#0b1220]"
        style={{ fontFamily: family ?? 'inherit', fontWeight: weight }}
      >
        Aa
      </div>
      <div className="mt-1 text-2xs text-[#94a3b8]">
        {family ?? 'Not detected'}
        <br />
        <span className={role === 'Primary' ? 'text-[#5a39ff]' : 'text-[#94a3b8]'}>{role}</span>
      </div>
    </div>
  );
}
