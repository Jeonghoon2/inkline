// 임시 파일에 쓰고 이름을 바꾼다 — 쓰다 죽어도 원래 파일은 온전하고, 실패하면 .tmp 를 남기지 않는다
import { copyFile, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

async function put(file: string, fill: (tmp: string) => Promise<void>): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  try {
    await fill(`${file}.tmp`)
    await rename(`${file}.tmp`, file)
  } catch (e) {
    await rm(`${file}.tmp`, { force: true }).catch(() => {})
    throw e
  }
}
export const atomicWrite = (file: string, text: string): Promise<void> => put(file, tmp => writeFile(tmp, text, 'utf8'))
export const atomicCopy = (src: string, dst: string): Promise<void> => put(dst, tmp => copyFile(src, tmp))
