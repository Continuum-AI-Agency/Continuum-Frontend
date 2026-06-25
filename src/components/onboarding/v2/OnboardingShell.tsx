import { OnboardingStepper, type StepperState } from "./OnboardingStepper";
import { StartOverButton } from "./StartOverButton";

export type ShellPillId = "website" | "documents" | "integrations" | "invites" | "dna";

type StepDef = { id: ShellPillId; label: string; description: string; state: StepperState };

type OnboardingShellProps = {
  steps: StepDef[];
  onStepClick?: (id: ShellPillId) => void;
  bottomHint: string;
  bottomActions: React.ReactNode;
  onStartOver?: () => void;
  startOverDisabled?: boolean;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
};

export function OnboardingShell({
  steps,
  onStepClick,
  bottomHint,
  bottomActions,
  onStartOver,
  startOverDisabled,
  headerRight,
  children,
}: OnboardingShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="border-b border-border bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:bg-card/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <ContinuumWordmark />
          <div className="flex items-center gap-3">
            <p className="hidden text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground md:block">
              Get set up
            </p>
            {headerRight}
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-6 pb-4">
          <OnboardingStepper steps={steps} onStepClick={onStepClick} />
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      <footer className="border-t border-border bg-white dark:bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {onStartOver ? <StartOverButton onConfirm={onStartOver} disabled={startOverDisabled} /> : null}
            <span className="truncate text-sm leading-snug text-muted-foreground">{bottomHint}</span>
          </div>
          <div className="flex items-center gap-2.5">{bottomActions}</div>
        </div>
      </footer>
    </div>
  );
}

function ContinuumWordmark() {
  return (
    <svg viewBox="0 0 297 70" height={28} aria-label="Continuum">
      <path
        fill="#1a0746"
        d="m 17.897616,20.192049 c -3.751171,0 -7.09318,1.185517 -10.0247111,3.555339 -3.7352142,3.03324 -5.6022424,6.992605 -5.6022429,11.877829 2e-7,4.871265 1.8670292,8.822293 5.6022429,11.85354 2.9315311,2.371815 6.2520071,3.557921 9.9606321,3.557921 1.682731,0 3.488803,-0.324014 5.407422,-0.945161 -0.966431,-2.228027 -1.720001,-4.568158 -2.231389,-6.997507 -0.905986,0.324216 -1.847071,0.505397 -2.832902,0.505397 -1.982274,0 -3.70601,-0.596337 -5.171777,-1.789557 -1.854647,-1.50831 -2.781226,-3.569523 -2.781226,-6.184633 0,-2.630403 0.926578,-4.69995 2.781226,-6.208924 1.465767,-1.192556 3.189504,-1.789557 5.171777,-1.789557 0.970426,0 1.89747,0.17676 2.790528,0.490929 0.498331,-2.429923 1.239313,-4.772586 2.192631,-7.003192 -1.906706,-0.60763 -3.664534,-0.922424 -5.262211,-0.922424 z m 72.87152,0.625285 v 0.227893 c 1.909892,4.443154 2.971911,9.333565 2.971911,14.468368 -3e-6,5.134853 -1.062022,10.025184 -2.971906,14.468369 l -3e-6,0.256834 h 7.652764 l -3e-6,-18.020094 14.076661,18.020091 7.64966,-3e-6 V 20.817333 l -7.64966,3e-6 V 38.815719 L 98.421899,20.817334 Z m 32.754594,-2e-6 v 6.400128 l 6.23011,-3e-6 v 23.021338 l 7.65276,-3e-6 V 27.21746 l 6.33605,-3e-6 v -6.400121 z m 23.57323,2e-6 v 29.421461 h 7.65277 v -29.42146 z m 13.81778,2e-6 -1e-5,29.421462 7.65224,-3e-6 V 32.218707 l 14.07666,18.020088 h 7.65018 V 20.817334 l -7.65018,1e-6 V 38.815719 L 168.56697,20.817335 Z m 35.5358,-3e-6 v 16.961759 c 0,2.185689 0.15818,3.924467 0.47594,5.216737 0.44471,1.826053 1.27122,3.34241 2.4784,4.54959 2.28474,2.299356 5.46015,3.448367 9.52707,3.448367 3.9938,0 7.183,-1.127987 9.56944,-3.384804 1.68182,-1.595387 2.74564,-3.362269 3.19102,-5.302004 0.28717,-1.249722 0.43047,-2.758329 0.43047,-4.527888 V 20.817333 l -7.65225,10e-7 v 15.92719 c 0,2.76003 -0.35244,4.621088 -1.05575,5.583642 -0.94859,1.308224 -2.35712,1.962671 -4.22506,1.962671 -0.83359,3e-6 -1.59476,-0.16542 -2.2841,-0.497125 -1.68248,-0.790388 -2.59527,-2.183871 -2.73885,-4.180113 -0.0425,-0.632835 -0.0636,-1.588767 -0.0636,-2.869073 V 20.817335 Z m 31.82752,3e-6 V 37.77909 c 0,2.185691 0.15819,3.924469 0.47594,5.216736 0.44471,1.826054 1.2707,3.342413 2.47788,4.549593 2.28475,2.299358 5.46066,3.448367 9.52758,3.448367 3.9938,-3e-6 7.18301,-1.12799 9.56945,-3.384804 1.68182,-1.59539 2.74563,-3.362272 3.19102,-5.302006 0.28717,-1.249723 0.43046,-2.758324 0.43046,-4.527889 V 20.817336 l -7.65225,-4e-6 v 15.927197 c 0,2.76003 -0.35244,4.621085 -1.05574,5.583637 -0.94858,1.308224 -2.35711,1.962669 -4.22507,1.962674 -0.83358,-3e-6 -1.59474,-0.165423 -2.2841,-0.497131 -1.68246,-0.790387 -2.59526,-2.183868 -2.73885,-4.180107 -0.0425,-0.632841 -0.0641,-1.588767 -0.0641,-2.869076 V 20.817335 Z m 35.51307,4e-6 -4.99866,29.421455 7.60728,-3e-6 2.50219,-16.943146 6.7882,16.943149 3.03962,-3e-6 7.11274,-16.943149 2.17765,16.943152 7.65223,5e-6 -4.44003,-29.421464 -7.61039,-5e-6 -6.31487,15.69052 -5.96966,-15.690521 z M 76.835619,27.569377 c -4.401865,0 -7.970054,3.568417 -7.970054,7.970057 0,4.401862 3.568189,7.970054 7.970054,7.970054 4.40164,0 7.970057,-3.568192 7.970057,-7.970054 0,-4.40164 -3.568417,-7.970057 -7.970057,-7.970057 z"
      />
    </svg>
  );
}
