# Frontend Agents Instructions

This file instructs AI agents working on the React/Vite admin application in `apps/web/`.

## Stack
- React 19
- Vite 7
- React Router 7
- TanStack Query 5
- Axios

## Architecture & Layout
- **Page-per-route:** Defined in `src/pages/`.
- **Shared Layout:** Core layout components exist in `src/components/Layout.tsx`.
- **Auth Context:** Found in `src/contexts/AuthContext.tsx`. Note: JWT is explicitly stored in a module variable—**not** `localStorage`.
- **Protected Routes:** Use `ProtectedRoute` wrapper (in `src/router.tsx`) for all authenticated routes.
- **API Client:** Use the Axios instance set up in `src/lib/api.ts`.
  - It handles intercepting 401s, silently retrieving a new refresh token, and retrying the request.
  - Do NOT manually implement retry logic in individual fetch calls.

## Displaying Data
- **Time/Dates:** Although the backend database stores all timestamps in UTC, the frontend is responsible for displaying all dates/times in the configured **local app timezone**.
- **Monetary Values:** Ensure you format integer cents (returned by the API) appropriately as readable currency (e.g., dividing by 100 before rendering).

## Aesthetics & Design Philosophy

<frontend_aesthetics>
You tend to converge toward generic, "on distribution" outputs. In frontend design, this creates what users call the "AI slop" aesthetic. Avoid this: make creative, distinctive frontends that surprise and delight. Focus on:

Typography: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics.

Color & Theme: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes. Draw from IDE themes and cultural aesthetics for inspiration.

Motion: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions.

Backgrounds: Create atmosphere and depth rather than defaulting to solid colors. Layer CSS gradients, use geometric patterns, or add contextual effects that match the overall aesthetic.

Avoid generic AI-generated aesthetics:
- Overused font families (Inter, Roboto, Arial, system fonts)
- Clichéd color schemes (particularly purple gradients on white backgrounds)
- Predictable layouts and component patterns
- Cookie-cutter design that lacks context-specific character

Interpret creatively and make unexpected choices that feel genuinely designed for the context. Vary between light and dark themes, different fonts, different aesthetics. You still tend to converge on common choices (Space Grotesk, for example) across generations. Avoid this: it is critical that you think outside the box!
</frontend_aesthetics>
