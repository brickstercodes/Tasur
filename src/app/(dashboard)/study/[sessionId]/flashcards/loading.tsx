/**
 * WHY: Shown while the flashcards page loads the due cards and session metadata.
 * Covers the blank wait when navigating to Flashcards from the session nav strip.
 */

import { TasurLoadingScreen } from '@/components/ui/TasurLoadingScreen';

export default function FlashcardsLoading() {
  return <TasurLoadingScreen />;
}
