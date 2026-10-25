# deskwire

모션데스크 셋업 플래너. 책상이 630~1280mm를 오르내릴 때 **케이블이 닿는지**와
**기기가 어디에 놓이는지**를 같이 본다.

이전 이름은 `patchmap` 이었다.

## 푸는 문제

1. **신호 경로** — 어떤 포트에서 어떤 포트로 가야 원하는 소리가 원하는 데서 나는가.
2. **물리 배치** — 상판과 함께 움직이는 기기와 바닥에 고정된 기기 사이에서,
   가장 짧은 케이블 하나가 책상 전체의 상승 한계를 결정한다.

## 실행

```bash
npm install
npm run dev      # 개발 서버
npm test         # 모델 계층 테스트
npm run build    # 프로덕션 빌드
```

## 배포

Vercel이 저장소를 그대로 읽어간다. `vercel.json` 에 빌드 설정이 들어 있어
Import 후 따로 만질 것이 없다.

1. [vercel.com/new](https://vercel.com/new) → Import Git Repository → 이 저장소 선택
2. Framework 가 **Vite** 로 잡히는지만 확인하고 Deploy
3. 이후 브랜치에 푸시할 때마다 자동으로 다시 배포된다

환경 변수는 필요 없다. 빌드는 `npm ci && npm run build`, 산출물은 `dist/`.

## 구조

```
data.json          기기 치수·포트·케이블·시나리오. 사용자의 실측/조사 결과다.
src/model/         React 비의존 순수 계산. 테스트 대상이자 2D·3D 공용.
  mount.ts         mount 사슬을 재귀로 풀어 절대 높이를 낸다
  route.ts         케이블이 실제로 지나는 경로 (상판 배선홈 → 배선트레이)
  obstacle.ts      선이 기기를 뚫지 않는지 검사한다
  geometry.ts      3뷰 투영, 여유 규칙, 규격 길이
  derive.ts        경계 판정·필요 길이·상승 한계·하중·포트 충돌
src/views/         SceneView(2D 3뷰), Scene3D(Three.js), deviceShapes
src/panels/        진단·하중·시나리오·기기·미확인 항목
```

`model/` 은 React에 의존하지 않는다. 덕분에 2D와 3D가 같은 좌표·같은 경로를
쓰고, 화면에 그려진 선과 표에 적힌 길이가 어긋나지 않는다.

## 데이터 규약

- 높이는 절대값이 아니라 **관계**로 적는다 (`mount: 'desktop' | 'floor' | { on: id }`).
  상판 높이 하나만 바꾸면 전부 따라 움직인다.
- `pos.yOff` 는 기준면에서 **기기 밑면까지의** 오프셋이다.
- `verified: false` 는 추정값이다. UI에 "추정" 배지로 반드시 드러낸다.
- `openQuestions` 는 아직 확인 못 한 항목이다. 답이 나오면 데이터를 고치고 지운다.

## 문서

- [`SPEC.md`](./SPEC.md) — 설계 결정과 기능 범위
- [`docs/PRE-WORK-CHECKLIST.md`](./docs/PRE-WORK-CHECKLIST.md) — 착수 전 점검 결과
- [`docs/QUESTIONS.md`](./docs/QUESTIONS.md) — 확인 요청 목록과 답변 상태
