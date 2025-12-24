# Google Sheets Manager

Cocos Creator 확장 기능으로 Google Sheets에서 데이터를 자동으로 다운로드하고 게임 데이터 관리를 위한 TypeScript 클래스를 생성합니다.

## 기능

- 📊 Google Sheets에서 CSV로 데이터 다운로드
- 💾 JSON 파일로 데이터 저장
- 🔧 각 시트에 대한 TypeScript 클래스 자동 생성
- 🎮 중앙 집중식 데이터 관리를 위한 `GameDataManager` 클래스 생성
- 🔄 Google Sheets와 쉬운 데이터 동기화

## 설치

1. `gsheet` 폴더를 Cocos Creator 프로젝트의 `extensions` 디렉토리에 복사
2. Cocos Creator 재시작
3. 확장 기능이 자동으로 로드됩니다

## 사전 요구사항

- Cocos Creator 3.8.8 이상
- Node.js (확장 기능 빌드용)
- 공개 공유가 활성화된 Google Sheets (또는 CSV 내보내기 활성화)

## Google Sheets 설정

### 1. Google Sheet 준비

Google Sheet는 다음 형식을 따라야 합니다:

| Column1 | Column2 | Column3 | ... |
|---------|---------|---------|-----|
| **Name** | **Type** | **Value** | ... |
| id | int | 1 | ... |
| name | string | Goblin | ... |
| hp | int | 100 | ... |

- **1행**: 컬럼 이름 (프로퍼티 이름)
- **2행**: 데이터 타입 (`int`, `long`, `double`, `float`, `string`, `bool`)
- **3행**: 첫 번째 데이터 행 (예제 값)
- **4행+**: 실제 데이터 행

### 2. Google Sheets URL 가져오기

1. Google Sheet 열기
2. "공유" → "링크 가져오기" → "링크가 있는 모든 사용자"로 설정
3. URL 복사 (형식: `https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit?gid={GID}`)

## 사용 방법

### 패널 열기

1. Cocos Creator에서 `Extension` → `Google Sheets Manager` → `Open Sheets Manager` 클릭
2. Google Sheets Manager 패널이 열립니다

### 시트 추가

1. **Sheet Name** 입력 (예: `MobTable`)
2. **Google Sheets URL** 붙여넣기
3. **Add** 버튼 클릭
4. 시트가 목록에 추가됩니다

### 데이터 다운로드

#### 단일 시트 다운로드
- 목록에서 시트 옆의 **Download** 버튼 클릭
- 다음 작업이 수행됩니다:
  - Google Sheets에서 CSV 데이터 다운로드
  - `assets/resources/json/{SheetName}.json`에 JSON 파일로 저장
  - `assets/0_Scripts/GameData/{SheetName}.ts`에 TypeScript 클래스 생성

#### 모든 JSON 파일 다운로드
- **Download All JSON** 버튼 클릭
- 모든 시트를 JSON 파일로 다운로드

#### 모든 TypeScript 클래스 다운로드
- **Download All TypeScript** 버튼 클릭
- 다음 작업이 수행됩니다:
  - 모든 시트를 JSON 파일로 다운로드
  - 각 시트에 대한 TypeScript 클래스 생성
  - `assets/0_Scripts/GameDataManager.ts`에 `GameDataManager.ts` 생성

### 시트 제거

- 목록에서 시트 옆의 **X** 버튼 클릭

## 생성되는 파일

다운로드 후 다음 파일들이 생성됩니다:

```
assets/
├── resources/
│   └── json/
│       ├── MobTable.json
│       └── ...
└── 0_Scripts/
    ├── GameData/
    │   ├── MobTable.ts
    │   └── ...
    └── GameDataManager.ts
```

## 게임에서 사용하기

### 1. GameDataManager 초기화

```typescript
import { GameDataManager } from './GameDataManager';

// 게임 초기화 시
GameDataManager.getInstance();
GameDataManager.localAllLoad(() => {
    console.log('모든 게임 데이터 로드 완료!');
    // 게임 로직 작성
});
```

### 2. 데이터 접근

```typescript
import { GameDataManager, TABLE } from './GameDataManager';
import { MobTable } from './GameData/MobTable';

// 방법 1: 이름으로 테이블 가져오기
const mobTable = GameDataManager.getTable<MobTable>('MobTable');
if (mobTable) {
    // 인덱스로 데이터 가져오기
    const mobData = mobTable.getData(0);
    console.log(mobData.Name, mobData.MAX_HP);
    
    // 키(첫 번째 컬럼 값)로 데이터 가져오기
    const goblin = mobTable.getData('Goblin');
    
    // 특정 값 가져오기
    const hp = mobTable.get(0, 'MAX_HP');
    
    // 키 존재 여부 확인
    if (mobTable.containsKey('Goblin')) {
        // ...
    }
    
    // 전체 개수 가져오기
    console.log('총 몬스터 수:', mobTable.count);
}

// 방법 2: Enum으로 테이블 가져오기
const mobTable2 = GameDataManager.getTableByEnum(TABLE.MobTable);

// 방법 3: 테이블 존재 여부 확인
if (GameDataManager.containsTable('MobTable')) {
    // ...
}
```

### 3. 완전한 예제

```typescript
import { _decorator, Component } from 'cc';
import { GameDataManager, TABLE } from './GameDataManager';
import { MobTable } from './GameData/MobTable';

const { ccclass } = _decorator;

@ccclass('GameController')
export class GameController extends Component {
    start() {
        // 초기화 및 데이터 로드
        GameDataManager.getInstance();
        GameDataManager.localAllLoad(() => {
            console.log('게임 데이터 로드 완료!');
            
            // 데이터 사용
            const mobTable = GameDataManager.getTable<MobTable>('MobTable');
            if (mobTable) {
                // 모든 몬스터 순회
                for (let i = 0; i < mobTable.count; i++) {
                    const mob = mobTable.getData(i);
                    if (mob) {
                        console.log(`${mob.Name}: HP=${mob.MAX_HP}, Gold=${mob.Gold}`);
                    }
                }
            }
        });
    }
}
```

## 생성되는 클래스 구조

### 시트 클래스 (예: `MobTable.ts`)

```typescript
@ccclass('MobTableData')
export class MobTableData {
    @property
    public Name: string = '';
    @property
    public MAX_HP: number = 0;
    // ... 기타 프로퍼티
}

@ccclass('MobTable')
export class MobTable extends Component {
    // 인덱스 또는 키로 데이터 가져오기
    public getData(row: string | number): MobTableData | null;
    
    // 특정 값 가져오기
    public get(row: string | number, col: string): any;
    
    // 키 존재 여부 확인
    public containsKey(key: string): boolean;
    
    // 컬럼 존재 여부 확인
    public containsColumnKey(name: string): boolean;
    
    // 전체 개수 가져오기
    public get count(): number;
}
```

### GameDataManager 클래스

```typescript
@ccclass('GameDataManager')
export class GameDataManager extends Component {
    // 싱글톤 인스턴스 가져오기
    public static getInstance(): GameDataManager;
    public static get I(): GameDataManager;
    
    // 이름으로 테이블 가져오기
    public static getTable<T>(tableName: string): T | null;
    
    // Enum으로 테이블 가져오기
    public static getTableByEnum(table: TABLE): any;
    
    // 테이블 존재 여부 확인
    public static containsTable(tableName: string): boolean;
    
    // 모든 데이터 로드
    public static localAllLoad(complete?: () => void): void;
}
```

## 문제 해결

### "Panel is not defined" 오류

- 확장 기능이 `extensions` 폴더에 제대로 설치되어 있는지 확인
- Cocos Creator 재시작
- 콘솔에서 상세한 오류 메시지 확인

### CSV 다운로드 실패

- Google Sheets URL이 올바른지 확인
- 시트가 공개적으로 접근 가능한지 확인
- 시트 형식이 올바른지 확인 (헤더 행)

### TypeScript 클래스 생성 안 됨

- 확장 기능 폴더에서 `npm install` 및 `npm run build` 실행 확인
- 콘솔에서 컴파일 오류 확인
- CSV 데이터 형식이 올바른지 확인

### 게임에서 데이터 로드 안 됨

- JSON 파일이 `assets/resources/json/`에 있는지 확인
- `GameDataManager.localAllLoad()`의 리소스 경로 확인
- 콘솔에서 로딩 오류 확인

## 개발

### 확장 기능 빌드

```bash
cd extensions/gsheet
npm install
npm run build
```

### 프로젝트 구조

```
gsheet/
├── source/              # TypeScript 소스 파일
│   ├── main.ts         # 메인 진입점
│   ├── panels/         # 패널 구현
│   └── utils/          # 유틸리티 함수
├── dist/               # 컴파일된 JavaScript
├── static/             # 정적 자산 (HTML, CSS)
└── package.json        # 확장 기능 매니페스트
```

## 라이선스

이 확장 기능은 Cocos Creator와 함께 사용하기 위해 그대로 제공됩니다.

## 지원

문제나 질문이 있으면 다음을 확인하세요:
- Cocos Creator 문서
- 확장 기능 콘솔 로그
- Google Sheets 공유 설정
