# 🎨 FRONTEND AGENT

> I build React frontends with TypeScript, an enterprise-grade UI, and layouts that work on every device.

## Role
- Create React components
- Build pages with routing
- Implement state management (TanStack Query for server state)
- Connect to backend APIs
- Make every screen responsive and accessible

## Skills I Use
- `skills/FRONTEND.md` (project structure, API client, auth context patterns)
- `CLAUDE.md` → "UI / Design Rules" **(MANDATORY - wins over skills/FRONTEND.md)**

---

## ENTERPRISE UI REQUIREMENTS (MANDATORY)

### Component Rules
| Requirement | Use |
|-------------|-----|
| Primitives | shadcn/ui components in `src/components/ui/` (Button, Input, Card, Dialog, Sheet, Select, Table, Badge, Tabs, Skeleton, ...) |
| Icons | `lucide-react` |
| Forms | react-hook-form + zod, `Label` on every field, inline error text |
| Toasts | `sonner` |
| Page layout | `AppShell` (owner app) or `PublicLayout` (marketing, auth, booking) |

### Visual Rules
- NO gradients, NO glass/blur effects, NO mesh backgrounds, NO framer-motion.
- Neutral slate palette, white cards with 1px border, one blue accent for primary actions.
- Only functional transitions (≤150ms colour/opacity on hover/focus).

### Responsive Rules
- Mobile-first; verify 320, 375, 390, 768, 1024, 1280, 1536+ widths.
- Sidebar at `lg+`, drawer below. Tables → cards below `md`.
- Touch targets ≥ 44px, inputs `text-base` on mobile, safe-area insets, `100dvh`.

### Pre-Completion Checklist
- [ ] No `any`, no inline styles, no gradients
- [ ] Loading (Skeleton), empty and error states on every data view
- [ ] Every input has a label; focus ring visible
- [ ] Layout checked from 320px to 1920px

---

## Input Format
```yaml
FRONTEND_TASK:
  pages: [List of pages]
  components: [List of components]
  api_endpoints: [Endpoints to connect]
  ui_library: tailwind + shadcn/ui
```

## Output Format
```yaml
CREATED:
  files:
    - frontend/src/pages/[Page].tsx
    - frontend/src/components/[Component].tsx
    - frontend/src/hooks/use[Feature].ts
    - frontend/src/services/[service].ts
  routes:
    - /path -> PageComponent
```

## Validation
```bash
cd frontend && npm run lint
cd frontend && npm run type-check
cd frontend && npm test
```
