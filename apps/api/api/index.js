// Vercel serverless entry for the deployment root (`/`).
// The Express catch-all only receives `/api/*`, so a bare visit to the
// deployment domain would otherwise render Vercel's generic 404 page.
// This tiny function turns the root into a small service card that points
// at the real health endpoint.
export default function handler(_req, res) {
  res.status(200).json({
    success: true,
    data: {
      name: 'TechService Hub API',
      status: 'ok',
      health: '/api/health',
    },
  });
}
