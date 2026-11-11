/**
 * REMOVED: Backend API routes
 * 
 * This app now runs as frontend-only with mock data.
 * All API calls have been replaced with local mock functions.
 * See src/lib/mock/ for mock implementations.
 */

export const runtime = 'nodejs';

// Return 404 for any API calls
export async function GET() {
  return Response.json(
    { error: 'API routes removed. Using mock data instead.' },
    { status: 404 },
  );
}

export async function POST() {
  return Response.json(
    { error: 'API routes removed. Using mock data instead.' },
    { status: 404 },
  );
}

export async function PATCH() {
  return Response.json(
    { error: 'API routes removed. Using mock data instead.' },
    { status: 404 },
  );
}

export async function DELETE() {
  return Response.json(
    { error: 'API routes removed. Using mock data instead.' },
    { status: 404 },
  );
}
