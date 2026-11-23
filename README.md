# Baduk Buddies (바둑 한 판)

웹 브라우저에서 바로 두는 캐주얼 **바둑**과 **장기** 게임이에요. 화면 위 탭에서 골라서 플레이해요. 설치 없이 휴대폰과 PC에서 모두 할 수 있어요.

**플레이하기:** https://kosj.github.io/baduk-buddies/ (바둑 `#baduk`, 장기 `#janggi`)

## 바둑 상대

| 캐릭터 | 난이도 | AI 방식 |
| --- | --- | --- |
| 콩이 | 하 · 입문 | 따내기·단수 위주의 간단한 휴리스틱 |
| 몽이 | 중 · 중급 | 몬테카를로 트리 탐색(MCTS + RAVE), 한 수에 수천 판 |
| 돌왕 | 상 · 고수 | MCTS + 3x3 패턴 + 축 읽기, 여러 코어로 병렬 탐색 |
| 청룡 | 프로 · 신경망 | KataGo 신경망(g170e-b10c128) + PUCT 탐색, WebAssembly로 기기에서 계산 |

## 장기 상대

| 캐릭터 | 난이도 | AI 방식 |
| --- | --- | --- |
| 콩이 | 하 · 입문 | 얕은 탐색에 실수를 섞음 |
| 몽이 | 중 · 중급 | 4수 앞까지 알파베타 탐색 |
| 돌왕 | 상 · 고수 | 반복 심화 알파베타 + 치환표 + 정지 탐색, 한 수 2.5초 |

장기 규칙: 궁성 대각선 행마, 포는 포를 넘거나 잡을 수 없음, 외통이면 승리, 궁끼리 마주 보면(빅장) 무승부, 200수가 넘거나 둘 다 한 수 쉬면 남은 기물 점수로 판정(차13 포7 마5 상3 사3 졸2, 한 +1.5).

## 기능

- 홈 화면: 캐릭터 소개, 게임별 이어하기와 전적, 탭하면 인사하는 캐릭터
- 게임 방법: 바둑 규칙과 장기 기물 행마를 그림으로 설명 (오른쪽 위 `?`)
- 연출: 따낸 돌·기물이 점수 그릇으로 날아가기, 장군·외통·빅장 도장, 승리 꽃가루, 캐릭터 표정 반응, 착수 물결, 진동(지원 기기)
- 홈 화면에 추가(설치) 아이콘, 공유 미리보기 이미지

- 바둑: 9×9, 13×13, 19×19 바둑판, 흑·백·무작위 선택
- 장기: 초·한 선택, 상차림 4가지, 한자/한글 기물, 갈 수 있는 곳 미리 보기
- 무르기, 힌트, 패스, 기권
- 둘 다 패스하면 자동 계가(중국식, 백 덤 6.5). 죽은 돌은 탭해서 고칠 수 있음
- 상대별 전적과 진행 중인 대국을 브라우저에 저장
- 라이트/다크 테마, 효과음, 키보드 조작(방향키 + Enter)

## 로컬에서 실행

신경망 파일을 `fetch`로 읽기 때문에 `file://`로 열면 프로 AI가 동작하지 않아요. 간단한 웹 서버로 여세요.

```bash
python3 -m http.server 8000
# http://localhost:8000 접속
```

## 구조

```
index.html              배포용 페이지 (build.py가 생성)
nn/kata-b10c128.wasm    신경망 가중치(float16)를 데이터 세그먼트로 담은 WebAssembly 모듈
nn/LICENSE-KataGo.txt   KataGo 라이선스
src/template.html       화면, 스타일, 바둑 게임 흐름, 게임 전환
src/engine.js           바둑 규칙, 계가, 하·중·상 AI
src/janggi.js           장기 규칙과 AI (웹 워커에서 실행)
src/janggi-ui.js        장기 화면과 게임 흐름
src/fx.js               공통 연출 (날아가기, 도장, 꽃가루, 캐릭터 반응)
src/home.js             홈 화면, 게임 방법 그림
manifest.webmanifest    홈 화면에 추가할 때 쓰는 앱 정보
icons/, og-image.png    앱 아이콘과 공유 미리보기 이미지
src/nn/nn.c             신경망 추론 (C → WebAssembly SIMD)
src/nn/nn.wasm          nn.c 컴파일 결과
src/nn/nnjs.js          추론 래퍼 (워커에서 실행)
src/nn/pro.js           신경망 입력 특징(축, 통과-삶 영역), PUCT 탐색
src/nn/kata.json        가중치 배치 정보
src/nn/convert.py       KataGo .bin.gz → float16 가중치 변환
src/nn/mkdatawasm.py    가중치를 WebAssembly 모듈로 포장
src/nn/ref.py           numpy 참조 구현 (검증용)
build.py                src/ 를 합쳐 index.html 생성
```

소스를 고친 뒤에는 `python3 build.py`로 `index.html`을 다시 만드세요.

## 신경망 다시 만들기

```bash
# 1. KataGo 저장소의 cpp/tests/models/g170e-b10c128-s1141046784-d204142634.bin.gz 를 받는다
python3 src/nn/convert.py g170e-b10c128-s1141046784-d204142634.bin.gz kata   # kata.bin, kata.json 생성
python3 src/nn/mkdatawasm.py kata.bin nn/kata-b10c128.wasm
cp kata.json src/nn/kata.json

# 2. 추론 코드를 고쳤다면 다시 컴파일
clang --target=wasm32 -O3 -msimd128 -nostdlib -fno-builtin -Wl,--no-entry \
  -Wl,--initial-memory=1048576 -o src/nn/nn.wasm src/nn/nn.c

python3 build.py
```

## 크레딧

- 프로 AI는 [KataGo](https://github.com/lightvector/KataGo)의 공개 신경망 `g170e-b10c128`을 사용합니다. © David J Wu, MIT 라이선스 ([nn/LICENSE-KataGo.txt](nn/LICENSE-KataGo.txt)).
- 신경망 입력 특징과 구조는 KataGo 소스를 참고해 다시 구현했습니다.
- 플레이아웃의 3x3 패턴은 MoGo 계열 패턴을 바탕으로 했습니다.
