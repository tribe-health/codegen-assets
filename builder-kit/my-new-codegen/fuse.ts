import { fusebox, sparky } from 'fuse-box'
import * as browserify from 'browserify'
import * as fs from 'fs'

class Context {
  getConfig = (templatePath: string, entryName: string) =>
    fusebox({
      target: 'server',
      entry: `${templatePath}/${entryName}`,
      compilerOptions: {
        buildTarget: 'server',
        tsConfig: './src/tsconfig.json',
      },
      dependencies: {
        serverIgnoreExternals: false,
      },
    })
}

const { exec, rm, task, src } = sparky(Context)
// Path to codegen-assets root from current directory
const projectRoot = '../../'
// Path to codegen template files
const templatePath = './src/templates'
// List of codegen templates to generate
// prettier-ignore
const codegenTemplates = [
  { file: 'goServeMux.codegen.ts', folder: 'go-serve-mux', starterKit: false, },
  { file: 'http4kBasic.codegen.ts', folder: 'kotlin-http4k', starterKit: false },
  { file: 'javascriptExpress.codegen.ts', folder: 'node-express-jsdoc', starterKit: false },
  { file: 'kotlinKtor.codegen.ts', folder: 'kotlin-ktor', starterKit: false },
  { file: 'pythonFastAPI.codegen.ts', folder: 'python-fast-api', starterKit: true },
  { file: 'typescriptExpress.codegen.ts', folder: 'typescript-express',starterKit: false },
]

for (const { file, folder } of codegenTemplates) {
  task(`prebuild:${file}`, () => {
    rm(`${projectRoot}/${folder}`)
  })

  task(`postbuild-clean:${file}`, () => {
    rm(`${projectRoot}/${folder}/actions-codegen.js.map`)
    rm(`${projectRoot}/${folder}/manifest-server.json`)
  })

  task(`build:${file}`, async (ctx) => {
    await ctx.getConfig(templatePath, file).runDev({
      target: 'browser',
      bundles: {
        app: './actions-codegen.js',
        distRoot: `${projectRoot}/${folder}`,
      },
    })
  })

  task(`browserify:${file}`, () => {
    const path = `${projectRoot}/${folder}/actions-codegen.js`
    browserify(path).bundle((err, buffer) => {
      const data = buffer.toString()
      if (err) console.log('BROWSERIFY ERR:', err)
      else fs.writeFileSync(path, data)
    })
  })

  task(`update-framework:${folder}`, async () => {
    src(`${projectRoot}/**`)
      .contentsOf('frameworks.json', (current) => {
        const frameworks = JSON.parse(current)
        let entry = frameworks.find((x) => x.name == folder)
        const template = codegenTemplates.find((x) => x.folder == folder)
        const values = { name: folder, hasStarterKit: template.starterKit }
        if (!entry) frameworks.push(values)
        else Object.assign(entry, values)
        return JSON.stringify(frameworks, null, 2)
      })
      .write()
      .exec()
  })
}

task(`build`, async () => {
  for (const { file, folder } of codegenTemplates) {
    // Delete old version
    await exec(`prebuild:${file}`)
    // Generate new bundle
    await exec(`build:${file}`)
    // Browserify it so that it works in Browser + Node
    await exec(`browserify:${file}`)
    // Remove 'actions-codegen.js.map' and 'manifest-server.json' autogenerated files
    await exec(`postbuild-clean:${file}`)
    // Update 'frameworks.json'
    await exec(`update-framework:${folder}`)
  }
})
