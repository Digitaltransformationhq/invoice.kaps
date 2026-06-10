// Diagnostic: confirms whether Vercel serves /api functions for this project.
// Hit https://<your-domain>/api/ping — should return "pong".
export const config = { runtime: 'edge' };

export default function handler(): Response {
  return new Response('pong', {
    status: 200,
    headers: { 'content-type': 'text/plain' },
  });
}
