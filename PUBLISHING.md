# Publishing to npm

## Before first publish

1. **Create npm account** — [npmjs.com](https://www.npmjs.com/signup)

2. **Update repository URLs** — In `package.json` and `openclaw-plugin/package.json`, replace `YOUR_USERNAME` with your GitHub username or org:
   - `repository.url`
   - `bugs.url`
   - `homepage`

3. **Check package name availability:**
   ```bash
   npm search ai-permissions-layer
   npm search ai-permissions-openclaw
   ```
   If taken, change `name` in package.json (and consider a scoped package: `@yourorg/ai-permissions-layer`).

4. **Login:**
   ```bash
   npm login
   ```

## Publish order

Publish the **core** package first, then the **plugin** (the plugin depends on the core).

```bash
# 1. From repo root
npm publish

# 2. From openclaw-plugin
cd openclaw-plugin && npm publish
```

## Dry run

Test what will be published without actually publishing:

```bash
# Core
npm pack
# Inspect the .tgz, then: rm ai-permissions-layer-0.1.0.tgz

# Plugin (after core is published)
cd openclaw-plugin && npm pack
```

## Version bumps

```bash
# Core
npm version patch   # 0.1.0 → 0.1.1
npm version minor   # 0.1.0 → 0.2.0
npm publish

# Plugin (bump to match or as needed)
cd openclaw-plugin && npm version patch && npm publish
```

## Scoped packages (optional)

To publish under your org (e.g. `@myorg/ai-permissions-layer`):

1. Change `name` to `@myorg/ai-permissions-layer` in package.json
2. Publish with `npm publish --access public` (required for unscoped user accounts)
