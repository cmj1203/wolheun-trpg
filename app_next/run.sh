#!/bin/zsh
set -euo pipefail

APP_DIR="${0:A:h}"
ROOT_DIR="${APP_DIR:h}"
MODELS_DIR="${WOLHEUN_MODELS_DIR:-$ROOT_DIR/models}"
SANDBOX_PROFILE="$APP_DIR/config/offline.sb"
APP_PORT="${WOLHEUN_PORT:-18081}"
LLM_PORT="${WOLHEUN_LLM_PORT:-18080}"
MODEL_KEY="${WOLHEUN_MODEL:-}"
OPEN_BROWSER=1
USE_LLM=1

usage() {
  cat <<'EOF'
월흔 TRPG 데모 실행 (인터넷 없이 동작)

  ./run.sh [--model <모델키>] [--port <앱 포트>] [--llm-port <LLM 포트>] [--no-open] [--no-llm]

  --model     config/models.json 의 모델키 (기본값: 그 파일의 default)
  --port      앱 포트 (기본 18081)
  --llm-port  로컬 LLM 서버 포트 (기본 18080)
  --no-open   브라우저를 자동으로 열지 않음
  --no-llm    로컬 GM 없이 작가가 쓴 대사로만 진행

LLM 서버(llama-server)와 앱 서버(bun)는 외부 네트워크를 막는 macOS 샌드박스
(config/offline.sb) 안에서 실행되고 127.0.0.1 에만 열린다. 끝내려면 Ctrl+C.
EOF
}

while (( $# > 0 )); do
  case "$1" in
    --model) MODEL_KEY="$2"; shift 2 ;;
    --port) APP_PORT="$2"; shift 2 ;;
    --llm-port) LLM_PORT="$2"; shift 2 ;;
    --no-open) OPEN_BROWSER=0; shift ;;
    --no-llm) USE_LLM=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) print -u2 "알 수 없는 옵션: $1"; usage >&2; exit 2 ;;
  esac
done

need() {
  command -v "$1" >/dev/null 2>&1 || { print -u2 "필요한 프로그램이 없습니다: $1 ($2)"; exit 1; }
}
need bun "https://bun.sh"
need sandbox-exec "macOS 기본 도구"
need curl "macOS 기본 도구"
(( USE_LLM == 1 )) && need llama-server "brew install llama.cpp"

port_free() {
  ! lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

wait_http() {
  local url="$1" limit="$2" label="$3" tries=0
  until curl -fsS -o /dev/null --max-time 1 "$url" 2>/dev/null; do
    tries=$(( tries + 1 ))
    if (( tries > limit * 4 )); then
      print -u2 "$label 이(가) ${limit}초 안에 준비되지 않았습니다. 로그: $APP_DIR/logs"
      exit 1
    fi
    sleep 0.25
  done
}

mkdir -p "$APP_DIR/logs"
PIDS_FILE="$APP_DIR/logs/run-$APP_PORT.pids"
typeset -a PIDS
cleanup() {
  for pid in $PIDS; do kill "$pid" 2>/dev/null || true; done
  for pid in $PIDS; do wait "$pid" 2>/dev/null || true; done
  rm -f "$PIDS_FILE"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

port_free "$APP_PORT" || { print -u2 "포트 $APP_PORT 를 이미 쓰는 프로그램이 있습니다. --port 로 바꾸세요."; exit 1; }

LLM_URL=""
MODEL_LABEL="작가 대사 전용"
if (( USE_LLM == 1 )); then
  IFS=$'\t' read -r MODEL_KEY MODEL_FILE MODEL_LABEL < <(bun "$APP_DIR/scripts/model_info.ts" "$MODEL_KEY")
  MODEL_PATH="$MODELS_DIR/$MODEL_FILE"
  if [[ ! -f "$MODEL_PATH" ]]; then
    print -u2 "모델 파일이 없습니다: $MODEL_PATH"
    print -u2 "설치 단계에서 한 번만(인터넷 필요): cd $APP_DIR && bun scripts/fetch_model.ts $MODEL_KEY"
    exit 1
  fi
  port_free "$LLM_PORT" || { print -u2 "포트 $LLM_PORT 를 이미 쓰는 프로그램이 있습니다. --llm-port 로 바꾸세요."; exit 1; }
  print "로컬 GM 모델을 불러오는 중: $MODEL_LABEL"
  sandbox-exec -f "$SANDBOX_PROFILE" llama-server -m "$MODEL_PATH" --host 127.0.0.1 --port "$LLM_PORT" \
    -c 8192 -np 1 -ngl 99 --alias "$MODEL_KEY" --no-webui --offline --reasoning off \
    --log-file "$APP_DIR/logs/llama-server-$LLM_PORT.log" >/dev/null 2>&1 &
  PIDS+=($!)
  wait_http "http://127.0.0.1:$LLM_PORT/health" 300 "LLM 서버"
  LLM_URL="http://127.0.0.1:$LLM_PORT"
fi

sandbox-exec -f "$SANDBOX_PROFILE" env \
  WOLHEUN_PORT="$APP_PORT" WOLHEUN_LLM_URL="$LLM_URL" WOLHEUN_MODEL="$MODEL_KEY" WOLHEUN_NO_LLM=$(( 1 - USE_LLM )) \
  bun "$APP_DIR/src/server/main.ts" >"$APP_DIR/logs/app-server-$APP_PORT.log" 2>&1 &
APP_PID=$!
PIDS+=($APP_PID)
wait_http "http://127.0.0.1:$APP_PORT/api/health" 60 "앱 서버"
print -l $PIDS > "$PIDS_FILE.tmp" && mv "$PIDS_FILE.tmp" "$PIDS_FILE"

URL="http://127.0.0.1:$APP_PORT/"
print "월흔 데모 준비 완료: $URL  (로컬 GM: $MODEL_LABEL)"
print "끝내려면 Ctrl+C"
(( OPEN_BROWSER == 1 )) && open "$URL"
wait "$APP_PID"
