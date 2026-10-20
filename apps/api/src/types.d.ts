import type { MemberRole } from '@smc/db';

declare global {
  namespace Express {
    interface Request {
      /** Correlates logs and audit entries for this request. */
      runId: string;
      auth?: {
        sessionId: string;
        memberId: string;
        role: MemberRole;
      };
    }
  }
}

export {};
