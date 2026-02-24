# Release Plan

## Pre-release checklist

- [ ] **Replace `YOUR_USERNAME`** in `package.json` and `openclaw-plugin/package.json` with your GitHub username/org
- [ ] **Create GitHub repo** — `ai-permissions-layer` (or your chosen name)
- [ ] **Check npm name availability** — `ai-permissions-layer` and `ai-permissions-openclaw`
- [ ] **npm login** — `npm login` (create account at npmjs.com if needed)
- [ ] **Run full test suite** — `npm run test && npm run build:plugin`
- [ ] **Dry-run pack** — `npm pack --dry-run` and `cd openclaw-plugin && npm pack --dry-run`

---

## Version strategy

| Version | When to use |
|---------|-------------|
| **0.1.0** | First release (current) |
| **0.1.x** | Bug fixes, small tweaks |
| **0.x.0** | New features, non-breaking |
| **1.0.0** | API stable, production-ready |

---

## Release steps

### 1. Finalize code

```bash
git status
git add -A
git commit -m "chore: prepare v0.1.0 release"
```

### 2. Tag (optional but recommended)

```bash
git tag v0.1.0
git push origin main
git push origin v0.1.0
```

### 3. Publish core package

```bash
npm publish
```

### 4. Publish plugin

```bash
cd openclaw-plugin && npm publish
```

### 5. Create GitHub release (optional)

- Go to repo → Releases → Draft a new release
- Tag: `v0.1.0`
- Title: `v0.1.0`
- Copy changelog / release notes
- Publish

---

## Post-release

- [ ] Verify install: `npm install ai-permissions-layer`
- [ ] Verify plugin: `openclaw plugins install ai-permissions-openclaw`
- [ ] Update README if repo URL changed
- [ ] Announce (if desired)

---

## Future releases (0.1.1, etc.)

```bash
# Bump version
npm version patch   # 0.1.0 → 0.1.1

# Publish core
npm publish

# Bump plugin if needed
cd openclaw-plugin && npm version patch && npm publish

# Push tags
git push origin main --tags
```

---

## Rollback

If you need to unpublish (within 72 hours, npm policy):

```bash
npm unpublish ai-permissions-layer@0.1.0 --force
npm unpublish ai-permissions-openclaw@0.1.0 --force
```

**Warning:** Unpublishing is discouraged and can break dependents. Prefer publishing a patch (e.g. 0.1.1) to fix issues.
