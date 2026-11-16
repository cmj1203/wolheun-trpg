"""승인된 6화 후보를 실제 점유와 실행 영수증에 따라 한 번씩 제작한다."""

from __future__ import annotations

import datetime
import fcntl
import hashlib
import json
import os
import re
import shlex
import struct
import subprocess
import sys
import time
from dataclasses import asdict, dataclass
from enum import StrEnum
from pathlib import Path
from typing import Final, assert_never

ROOT: Final = Path("/Users/choeminju/월흔_trpg")
ART: Final = ROOT / "docs/continuation/build/ep06/art"
NATIVE: Final = ART / "native"
CAP: Final = 3


class ResultState(StrEnum):
    ACTUAL = "actualPNG"
    BLOCKED = "toolBlocked"
    HELD = "held"


@dataclass(frozen=True, slots=True)
class NativeProcess:
    pid: int
    ppid: int
    pgid: int
    state: str
    elapsed: str
    command: str


@dataclass(frozen=True, slots=True)
class ArtifactError(RuntimeError):
    path: Path
    reason: str

    def __str__(self) -> str:
        return f"{self.path}: {self.reason}"


def actual_native() -> list[NativeProcess]:
    """argv의 실행 파일로 실제 생존 Codex 이미지 작업만 센다."""
    listing = subprocess.check_output(
        ["ps", "-axo", "pid=,ppid=,pgid=,stat=,etime=,command="], text=True
    )
    found: list[NativeProcess] = []
    for row in listing.splitlines():
        parts = row.strip().split(None, 5)
        if len(parts) != 6:
            continue
        pid, ppid, pgid, state, elapsed, command = parts
        executable = Path(command.split(None, 1)[0]).name
        if (
            re.fullmatch(r"codex(?:-(?:aarch64|x86_64|arm64)[\w-]*)?", executable)
            and " exec " in command
            and re.search(r"(?:^|\s)(?:-i|--image)(?:\s|=)", command)
            and not state.startswith("Z")
        ):
            found.append(
                NativeProcess(int(pid), int(ppid), int(pgid), state, elapsed, command)
            )
    return found


def emit(event: str, candidate_id: str = "", reason: str = "") -> None:
    """감시 구독이 읽을 결정적 사건만 출력한다."""
    print(
        json.dumps(
            {"event": event, "candidate_id": candidate_id, "reason": reason},
            ensure_ascii=False,
        ),
        flush=True,
    )


def publish() -> None:
    """실제 시작·결과 영수증만으로 명세와 수량을 갱신한다."""
    plan = json.loads((ART / "native-production-plan.json").read_text())
    counts = {
        "planned": len(plan["candidates"]),
        "actualPNG": 0,
        "toolBlocked": 0,
        "held": 0,
        "running": 0,
        "independentApproved": 0,
        "installed": 0,
    }
    rows = []
    blocker = None
    for candidate in plan["candidates"]:
        ident = candidate["candidate_id"]
        start = NATIVE / f"{ident}-start.json"
        result = NATIVE / f"{ident}-result.json"
        state = "held"
        receipt = None
        if result.exists():
            receipt = json.loads(result.read_text())
            parsed_state = ResultState(receipt["state"])
            match parsed_state:
                case ResultState.ACTUAL:
                    artifact = receipt["output"]
                    if Path(artifact["path"]).is_file() and artifact["sha256"]:
                        state = "actualPNG"
                    else:
                        blocker = "완료 영수증의 실제 PNG가 없어 보존 확인이 필요함"
                case ResultState.BLOCKED:
                    state = "toolBlocked"
                    blocker = receipt["reason"]
                case ResultState.HELD:
                    blocker = receipt["reason"]
                case unreachable:
                    assert_never(unreachable)
        elif start.exists():
            started = json.loads(start.read_text())
            live = subprocess.run(
                ["ps", "-o", "stat=", "-p", str(started["pid"])],
                capture_output=True,
                text=True,
                check=False,
            ).stdout.strip()
            if live and not live.startswith("Z"):
                state = "running"
            else:
                blocker = "시작 영수증은 있으나 종료 결과가 아직 수거되지 않음"
        counts[state] += 1
        rows.append(
            {
                "candidate_id": ident,
                "target_output": candidate["output"],
                "source_cut_ids": candidate["source_cut_ids"],
                "earliest_reveal_anchor": candidate["earliest_reveal_anchor"],
                "anchor_ids": candidate["anchor_ids"],
                "state": state,
                "start_receipt": str(start) if start.exists() else None,
                "result_receipt": str(result) if result.exists() else None,
                "output": receipt.get("output") if receipt else None,
                "independentApproved": False,
                "installed": False,
            }
        )
    manifest = {
        "episode": 6,
        "stage": "실제 native 순차 제작",
        "generation_authorized": True,
        "global_actual_cap": CAP,
        "local_max": 1,
        "art_ready": False,
        "counts": counts,
        "candidates": rows,
        "blocker": blocker,
        "independent_qa": "독립 Claude 원작 대조 미실시. GPT 독립 PASS 없음.",
        "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    temporary = ART / "native-production-manifest.json.tmp"
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(ART / "native-production-manifest.json")
    counts_temporary = ART / "native-production-counts.json.tmp"
    counts_temporary.write_text(json.dumps(counts, ensure_ascii=False, indent=2) + "\n")
    counts_temporary.replace(ART / "native-production-counts.json")


def main() -> int:
    """기존 작업을 재실행하지 않고 실제 결과가 필요한 후보만 시작한다."""
    NATIVE.mkdir(exist_ok=True)
    plan = json.loads((ART / "native-production-plan.json").read_text())
    with (ART / "native-production.lock").open("a+b") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        publish()
        for candidate in plan["candidates"]:
            ident = candidate["candidate_id"]
            start_path = NATIVE / f"{ident}-start.json"
            result_path = NATIVE / f"{ident}-result.json"
            if result_path.exists():
                previous = json.loads(result_path.read_text())
                match ResultState(previous["state"]):
                    case ResultState.ACTUAL:
                        continue
                    case ResultState.BLOCKED | ResultState.HELD:
                        emit("BATCH_STOP", ident, "기존 차단·보류 영수증을 재시도하지 않음")
                        return 86
                    case unreachable:
                        assert_never(unreachable)
            if start_path.exists() or Path(candidate["output"]).exists():
                emit("BATCH_STOP", ident, "기존 시작 영수증·미보고 결과를 보존하고 중복 실행하지 않음")
                return 87
            snapshot = actual_native()
            if len(snapshot) >= CAP:
                (ART / "native-capacity-held.json").write_text(
                    json.dumps(
                        {
                            "candidate_id": ident,
                            "actual_native": [asdict(item) for item in snapshot],
                            "reason": "전역 실제 native 점유 상한으로 새 호출을 시작하지 않음",
                        },
                        ensure_ascii=False,
                        indent=2,
                    )
                    + "\n"
                )
                publish()
                emit("CAPACITY_HOLD", ident, "감시 중인 실행기에서 실제 여유를 기다리며 호출하지 않음")
                while len(snapshot) >= CAP:
                    time.sleep(1)
                    snapshot = actual_native()
            started_at = datetime.datetime.now(datetime.timezone.utc)
            with Path(candidate["log"]).open("xb") as log:
                process = subprocess.Popen(
                    candidate["argv"],
                    cwd=ROOT / "assets/ep06/gen",
                    stdin=subprocess.DEVNULL,
                    stdout=log,
                    stderr=subprocess.STDOUT,
                    env=os.environ.copy(),
                    start_new_session=True,
                )
            started = {
                "candidate_id": ident,
                "pid": process.pid,
                "pgid": os.getpgid(process.pid),
                "supervisor_pid": os.getpid(),
                "supervisor_pgid": os.getpgrp(),
                "started_at": started_at.isoformat(),
                "input": candidate["inputs"][0],
                "input_sha256": candidate["primary_input_sha256"],
                "auxiliary_inputs": candidate["inputs"][1:],
                "output": candidate["output"],
                "log": candidate["log"],
                "argv": candidate["argv"],
                "command": shlex.join(candidate["argv"]),
                "actual_native_before": len(snapshot),
                "actual_native_after_launch": len(snapshot) + 1,
                "native_processes_before": [asdict(item) for item in snapshot],
                "independentApproved": 0,
                "installed": 0,
            }
            with start_path.open("x") as stream:
                stream.write(json.dumps(started, ensure_ascii=False, indent=2) + "\n")
            publish()
            exit_code = process.wait()
            log_text = Path(candidate["log"]).read_text(errors="replace")
            messages: list[str] = []
            completed_commands: list[str] = []
            for line in log_text.splitlines():
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue
                item = event.get("item", {})
                if item.get("type") == "agent_message":
                    messages.append(item.get("text", ""))
                if item.get("type") == "command_execution" and item.get("status") == "completed":
                    completed_commands.append(item.get("command", ""))
                if event.get("type") == "error":
                    messages.append(str(event.get("message", "")))
            final_text = "\n".join(messages)
            refusal = re.search(
                r"content policy|safety (?:policy|filter)|"
                r"(?:violate|violat).{0,50}polic|"
                r"(?:image_gen|imagegen).{0,100}(?:not available|unavailable|refus|reject)|"
                r"(?:cannot|can't|unable to).{0,100}(?:generat|edit).{0,80}(?:image|request)|"
                r"콘텐츠 정책|안전 정책|정책.{0,60}(?:거절|거부|차단|불가)|"
                r"이미지.{0,60}(?:거절|거부|차단)|provider_native_bypass",
                final_text,
                re.IGNORECASE | re.DOTALL,
            )
            artifact = None
            native_source = None
            native_source_sha = None
            provenance_ok = False
            output = Path(candidate["output"])
            width: int = 0
            height: int = 0
            if output.is_file():
                payload = output.read_bytes()
                if not payload.startswith(b"\x89PNG\r\n\x1a\n"):
                    raise ArtifactError(output, "PNG 시그니처 불일치")
                width, height = struct.unpack(">II", payload[16:24])
                decoded = subprocess.check_output(
                    ["/usr/bin/sips", "-g", "pixelWidth", "-g", "pixelHeight", str(output)],
                    text=True,
                    stderr=subprocess.STDOUT,
                )
                if (
                    f"pixelWidth: {width}" not in decoded
                    or f"pixelHeight: {height}" not in decoded
                ):
                    raise ArtifactError(output, "네이티브 PNG 판독 크기 불일치")
                artifact = {
                    "path": str(output),
                    "sha256": hashlib.sha256(payload).hexdigest(),
                    "width": width,
                    "height": height,
                    "format": "PNG",
                    "bytes": output.stat().st_size,
                }
                for command in completed_commands:
                    found = re.search(
                        r"(/Users/choeminju/\.codex/generated_images/[^\s\"'\\]+\.png)",
                        command,
                    )
                    if found:
                        native_source = Path(found.group(1))
                        native_source_sha = hashlib.sha256(native_source.read_bytes()).hexdigest()
                        provenance_ok = (
                            native_source_sha == artifact["sha256"]
                            and native_source.stat().st_mtime >= started_at.timestamp() - 1
                        )
                        break
            state = ResultState.HELD
            reason = "종료 코드만으로 성공을 인정하지 않음: 실제 native PNG 또는 출처 확인이 없음"
            if refusal:
                state = ResultState.BLOCKED
                reason = final_text[-8000:]
            elif artifact and artifact["format"] == "PNG" and provenance_ok:
                state = ResultState.ACTUAL
                reason = "실제 PNG·해시·크기·같은 실행의 native 원본 복사 확인"
            result = {
                **started,
                "state": state,
                "reason": reason,
                "exit_code": exit_code,
                "exit_observed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "output": artifact,
                "native_generated_source": str(native_source) if native_source else None,
                "native_source_sha256": native_source_sha,
                "native_copy_matches": provenance_ok,
                "agent_messages": messages,
                "cli_zero_used_as_success_criterion": False,
                "qa_status": "독립 원작 나란히 대조 미실시",
                "independentApproved": False,
                "installed": False,
                "dimension_note": (
                    f"16:9 교차곱 차이 {abs(width * 9 - height * 16)}. "
                    "임의 크롭·재생성 없이 독립 검수 대기."
                    if artifact
                    else None
                ),
            }
            with result_path.open("x") as stream:
                stream.write(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
            publish()
            match state:
                case ResultState.ACTUAL:
                    if exit_code != 0:
                        emit("BATCH_STOP", ident, "실제 PNG는 보존했으나 CLI 비정상 종료로 다음 호출 보류")
                        return 88
                case ResultState.BLOCKED:
                    emit("REFUSAL", ident, reason[-1000:])
                    return 86
                case ResultState.HELD:
                    emit("BATCH_STOP", ident, reason)
                    return 87
                case unreachable:
                    assert_never(unreachable)
        publish()
        emit("BATCH_COMPLETE", reason="실제 native PNG 75개 제작. 독립 검수·설치는 모두 미실시.")
        return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, ValueError, KeyError, subprocess.SubprocessError) as failure:
        emit("RUNNER_ERROR", reason=f"{type(failure).__name__}: {failure}")
        raise
