/**
 * WHY: Shown while the mindmap page fetches mindmap_data and confidence scores
 * from Supabase. Covers the "Rendering…" blank that appears during sub-route
 * navigation (e.g., returning from chat → mindmap).
 */

import { TasurLoadingScreen } from '@/components/ui/TasurLoadingScreen';

export default function MindmapLoading() {
  return <TasurLoadingScreen />;
}
