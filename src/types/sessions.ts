/**
 * WHY: Domain types for study sessions.
 *
 * A session is the top-level container for a student's entire interaction with a
 * set of uploaded documents — it tracks learning mode, domain, and the last
 * orchestrator event so sessions can be resumed exactly where they left off.
 * LearningMode is defined here (not in database.ts) because it drives orchestrator
 * behaviour and should be importable by any layer without pulling in DB types.
 */

export type LearningMode = 'fast' | 'steady';

export type SessionStatus = 'active' | 'paused' | 'completed';

/**
 * A study session ties a user to a set of uploaded documents,
 * a knowledge graph, and an understanding model.
 */
export interface StudySession {
  // identity
  id: string;
  userId: string;
  title: string; // e.g. "DBMS Chapter 5"
  // state
  learningMode: LearningMode;
  subjectDomain: string; // e.g. "dbms"
  status: SessionStatus;
  lastEvent?: string; // last orchestrator trigger event (for resume)
  // timestamps
  createdAt: string; // ISO timestamp
  lastActiveAt: string; // ISO timestamp
}
