/**
 * 다른 사이트 화면도 이 컴퓨터에서 보내면 주소가 127.0.0.1 이라 주소 검사를 지난다. 브라우저가 붙이는 출처 헤더로 막는다.
 * 브라우저 밖의 요청은 이 헤더가 없어 그대로 지난다. JSON 만 받으면 다른 출처의 요청은 사전 확인에서 먼저 걸린다.
 * 다른 도메인을 127.0.0.1 로 돌린 화면(DNS 리바인딩)은 출처가 스스로와 같아 보이니, 받는 쪽 이름이 이 컴퓨터인지 먼저 본다.
 */
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function rejectForeignPost(req: Request): { status: 400 | 403; error: string } | null {
  const site = req.headers.get('sec-fetch-site');
  const origin = req.headers.get('origin');
  const url = new URL(req.url);
  if (!LOCAL_HOSTS.has(url.hostname) || (site !== null && site !== 'same-origin') || (origin !== null && origin !== url.origin)) {
    return { status: 403, error: '게임 화면에서만 보낼 수 있습니다' };
  }
  if (!(req.headers.get('content-type') ?? '').startsWith('application/json')) return { status: 400, error: '요청 본문이 올바른 JSON 이 아닙니다' };
  return null;
}
