/** 이야기 시작 전에만 쓰는 안내. 저장한 장면에는 포함하지 않는다. */
export const INTRODUCTION = [
  { text: '난 이 판을 진행하는 사막여우야.', targets: [] },
  { text: '넌 아시나가 돼.', targets: [] },
  { text: '장면이 오면 아래 입력창에 아시나가 할 말이나 행동을 적어. 뜬 단추를 골라도 돼.', targets: ['.say-field'] },
  { text: '결과가 확실하지 않은 행동이면 주사위 두 개에 능력치를 더해 굴려. 주사위 둘이 다 6이면 대성공, 10 이상은 성공, 7~9는 대가 있는 성공, 6 이하는 실패야.', targets: ['#intro-roll', '#abilities'] },
  { text: '결과에 따라 오른쪽 판의 체력·정신력이 오르내리고, 바뀐 건 이야기 창에 적혀. 행운은 실패를 메울 때 써.', targets: ['#vitals', '[data-track="행운"]', '#changes'] },
  { text: '막히거나 궁금하면 입력창 오른쪽 내 얼굴 단추를 눌러 물어봐.', targets: ['#ask-gm'] },
] as const;

export class Introduction {
  private index: number;

  constructor(source: 'new' | 'load') {
    this.index = source === 'new' ? 0 : INTRODUCTION.length;
  }

  get current(): (typeof INTRODUCTION)[number] | null {
    return INTRODUCTION[this.index] ?? null;
  }

  get position(): number {
    return this.index + 1;
  }

  next(): void {
    if (this.current) this.index += 1;
  }

  skip(): void {
    this.index = INTRODUCTION.length;
  }
}
