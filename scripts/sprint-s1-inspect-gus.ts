import * as fs from 'node:fs'

const files = [
  { f: 'tmp/api-discovery/gus-03-osPrawna.json', name: 'OsPrawna' },
  { f: 'tmp/api-discovery/gus-04-osPrawnaPkd.json', name: 'OsPrawnaPkd' },
]
for (const { f, name } of files) {
  console.log(`\n===${name}===`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj: any = JSON.parse(fs.readFileSync(f, 'utf-8'))
  console.log(JSON.stringify(obj.inner?.root?.dane, null, 2).slice(0, 1800))
}
