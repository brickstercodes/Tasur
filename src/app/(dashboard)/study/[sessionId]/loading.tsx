/**
 * WHY: Shown by Next.js App Router (via React Suspense) while the study session
 * layout + page are being fetched/rendered on the server. This replaces the blank
 * white wait with a calm, branded holding screen so the user knows the click
 * registered and the app is working.
 */

import { TasurLoadingScreen } from '@/components/ui/TasurLoadingScreen';

export default function StudySessionLoading() {
  return <TasurLoadingScreen />;
}
