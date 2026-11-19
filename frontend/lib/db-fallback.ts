/**
 * Helper to identify database connection/network failures.
 * Under AGENTS.md Hard Rule 1, production paths must NEVER return invented or seeded
 * demo state on database failure; routes fail closed with HTTP 503 and explicit unavailable status.
 */
export function isDbConnectionError(err: any): boolean {
  if (!err) return false;
  const msg = typeof err === 'string' ? err : err.message || '';
  const code = err.code || '';
  return (
    code === 'P1001' ||
    code === 'P1002' ||
    code === 'P1003' ||
    code === 'P1017' ||
    err.name === 'PrismaClientInitializationError' ||
    err.name === 'PrismaClientKnownRequestError' && (code === 'P1001' || code === 'P1002' || code === 'P1003') ||
    msg.includes("Can't reach database server") ||
    msg.includes('connection refused') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('connection closed') ||
    msg.includes('database system is shutting down')
  );
}
