// 이력서 사진 — 긴 변 800px 이하 JPEG 로 줄여 설정 DB 에 둔다(원본 파일은 건드리지 않는다)
export async function shrinkPhoto(f: File): Promise<string> {
  const img = await createImageBitmap(f)
  const k = Math.min(1, 800 / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * k)
  c.height = Math.round(img.height * k)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  img.close()
  return c.toDataURL('image/jpeg', 0.9)
}
