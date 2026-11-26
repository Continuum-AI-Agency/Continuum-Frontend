import {
  Bell,
  Circle,
  type IconComponent,
  Pause,
  Play,
  Replace,
  TrendingUp,
  TriangleAlert,
} from '@/components/icons';

const ICON_MAP: Record<string, IconComponent> = {
  PAUSE_AD: Pause,
  PAUSE_ADSET: Pause,
  PAUSE_CAMPAIGN: Pause,
  ACTIVATE_AD: Play,
  ACTIVATE_ADSET: Play,
  ACTIVATE_CAMPAIGN: Play,
  SCALE_AD: TrendingUp,
  SCALE_ADSET: TrendingUp,
  SCALE_CAMPAIGN: TrendingUp,
  ALERT_ACCOUNT: Bell,
  ALERT_CAMPAIGN: Bell,
  SWAP_CREATIVE: Replace,
  NOOP: Circle,
};

export function getActionIcon(type: string): IconComponent {
  return ICON_MAP[type] ?? TriangleAlert;
}
