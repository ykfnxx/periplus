import ts from "typescript"
import path from "node:path"
import { fileURLToPath } from "node:url"

export function checkFrontendBoundaries(root = process.cwd()) {
  const config = ts.readConfigFile(
    path.join(root, "tsconfig.json"),
    ts.sys.readFile
  )
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root)
  const files = parsed.fileNames.filter(
    (file) => !file.includes("/.next/") && !file.endsWith(".d.ts")
  )
  const relative = (file) => path.relative(root, file).split(path.sep).join("/")
  const ui = (file) =>
    /^(modules\/(travelogue|auth|agent)\/ui\/|components\/ui\/)/.test(
      relative(file)
    )
  const business = (file) =>
    /^modules\/(travelogue|auth|agent)\/(application|model)\//.test(
      relative(file)
    )
  const frontend = (file) => ui(file) || business(file)
  const forbiddenUI = (file) =>
    /^(app\/(?!ui-preview)|modules\/data\/|modules\/[^/]+\/(application|adapters|react|server)\/|modules\/providers\/|config\/.*server)/.test(
      relative(file)
    )
  const edges = new Map()
  const errors = []
  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      ts.sys.readFile(file),
      ts.ScriptTarget.Latest,
      true
    )
    const imports = []
    function visit(node) {
      let specifier
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
        specifier = node.moduleSpecifier
      if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference)
      )
        specifier = node.moduleReference.expression
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) &&
            node.expression.text === "require"))
      ) {
        specifier = node.arguments[0]
        if (frontend(file) && !ts.isStringLiteralLike(specifier))
          errors.push(
            `${relative(file)}: non-literal module loading bypasses the frontend boundary`
          )
      }
      if (specifier && ts.isStringLiteralLike(specifier)) {
        const name = specifier.text
        const target = ts.resolveModuleName(
          name,
          file,
          parsed.options,
          ts.sys
        ).resolvedModule
        if (business(file) && /^(react($|\/)|next($|\/)|zustand$)/.test(name))
          errors.push(`${relative(file)} imports UI runtime ${name}`)
        if (target && !target.isExternalLibraryImport) {
          imports.push(target.resolvedFileName)
          if (
            target.resolvedFileName.includes(".preview.") &&
            !file.includes(".preview.") &&
            !relative(file).startsWith("app/ui-preview/")
          )
            errors.push(`${relative(file)} imports a development-only preview`)
        }
      }
      if (ts.isIdentifier(node) && frontend(file)) {
        const banned = business(file)
          ? [
              "window",
              "document",
              "HTMLElement",
              "HTMLImageElement",
              "indexedDB",
              "fetch",
            ]
          : ["fetch", "indexedDB", "XMLHttpRequest"]
        if (banned.includes(node.text))
          errors.push(
            `${relative(file)}: ${node.text} crosses the ${business(file) ? "business" : "UI"} boundary`
          )
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    edges.set(file, imports)
  }
  // Resolve the complete local graph so a barrel or dynamic import cannot hide an adapter.
  for (const entry of files.filter(frontend)) {
    const seen = new Set([entry])
    function walk(file) {
      for (const target of edges.get(file) || []) {
        if (seen.has(target)) continue
        seen.add(target)
        const invalid = ui(entry)
          ? forbiddenUI(target)
          : ui(target) ||
            /^(app\/|modules\/data\/|modules\/providers\/|config\/.*server)|modules\/[^/]+\/(adapters|react|server)\//.test(
              relative(target)
            )
        if (invalid)
          errors.push(
            `${relative(entry)} reaches ${relative(target)} through ${relative(file)}`
          )
        else walk(target)
      }
    }
    walk(entry)
  }
  return [...new Set(errors)]
}
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  const errors = checkFrontendBoundaries()
  if (errors.length) {
    console.error(errors.join("\n"))
    process.exitCode = 1
  } else console.log("Frontend dependency boundaries passed")
}
