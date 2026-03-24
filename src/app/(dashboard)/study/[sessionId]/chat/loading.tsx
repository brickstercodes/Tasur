/**
 * WHY: Shown while the chat page resolves the concept, prerequisites, and source
 * document from Supabase. Replaces the blank wait when clicking a concept node
 * from the mindmap.
 */

import { TasurLoadingScreen } from '@/components/ui/TasurLoadingScreen';

export default function ChatLoading() {
  return <TasurLoadingScreen />;
}
