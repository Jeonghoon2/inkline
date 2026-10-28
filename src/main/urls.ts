// 바깥(기본 브라우저)으로 열어도 되는 주소: http · https 만
export function isExternalHttpUrl(url: string): boolean {
  try {
    const p = new URL(url).protocol
    return p === 'http:' || p === 'https:'
  } catch {
    return false
  }
}
