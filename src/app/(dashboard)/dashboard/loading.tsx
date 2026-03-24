/**
 * WHY: Shown while the dashboard page fetches the user's session list from
 * Supabase. Covers the blank wait when exiting a study session back to dashboard.
 */

import { TasurLoadingScreen } from '@/components/ui/TasurLoadingScreen';

export default function DashboardLoading() {
  return <TasurLoadingScreen />;
}
