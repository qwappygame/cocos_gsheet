import { writeFileSync, existsSync, mkdirSync } from 'fs-extra';
import { join, dirname } from 'path';

interface CsvHeader {
    columnNames: string[];
    types: string[];
    rowKeys: string[];
    typeKeys: string[];
    firstProperty: string;
}

export function parseCsvHeader(csv: string): CsvHeader {
    const lines = csv.replace(/\r/g, '').split('\n');
    const columnNames = lines[0].split('\t').filter(name => name.trim());
    const types = lines[1].split('\t').filter(type => type.trim());
    
    const rowKeys = columnNames.slice(1);
    const typeKeys = types.slice(1);
    const firstProperty = rowKeys[0] || 'id';
    
    return { columnNames, types, rowKeys, typeKeys, firstProperty };
}

export function generateTypeScriptClass(sheetName: string, csvData: string, projectPath: string): string {
    const { rowKeys, typeKeys, firstProperty } = parseCsvHeader(csvData);
    
    // 같은 컬럼 이름이 여러 개 있는지 확인하고 인덱스 매핑
    const columnIndexMap = new Map<string, number[]>(); // 컬럼 이름 -> 인덱스 배열
    for (let i = 0; i < rowKeys.length; i++) {
        const colName = rowKeys[i].trim();
        if (colName) {
            if (!columnIndexMap.has(colName)) {
                columnIndexMap.set(colName, []);
            }
            columnIndexMap.get(colName)!.push(i);
        }
    }
    
    // Case 문 생성 (중복 제거)
    let case1Statements = '';
    let case2Statements = '';
    const processedColumns = new Set<string>();
    
    for (const [colName, indices] of columnIndexMap.entries()) {
        if (processedColumns.has(colName)) continue;
        processedColumns.add(colName);
        
        case1Statements += `                case "${colName}": return data.${colName};\n`;
        case2Statements += `                case "${colName}": return true;\n`;
    }
    
    // 프로퍼티 생성 (중복 제거, 배열 타입 처리)
    let properties = '';
    processedColumns.clear();
    
    for (const [colName, indices] of columnIndexMap.entries()) {
        if (processedColumns.has(colName)) continue;
        processedColumns.add(colName);
        
        // 같은 컬럼 이름이 여러 개 있으면 배열 타입
        if (indices.length > 1) {
            const baseType = convertTypeToTS(typeKeys[indices[0]]);
            const arrayType = `${baseType}[]`;
            properties += `    @property\n    public ${colName}: ${arrayType} = [];\n`;
        } else {
            const propType = convertTypeToTS(typeKeys[indices[0]]);
            properties += `    @property\n    public ${colName}: ${propType} = ${getDefaultValue(typeKeys[indices[0]])};\n`;
        }
    }
    
    const template = `import { _decorator, Component } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('${sheetName}Data')
export class ${sheetName}Data {
${properties}
}

@ccclass('${sheetName}')
export class ${sheetName} extends Component {
    private _datas: Map<string, ${sheetName}Data> = new Map();
    private _datasArray: ${sheetName}Data[] = [];

    public init(json: string) {
        const parsed = JSON.parse(json);
        this._datasArray = parsed.Datas || [];
        
        this._datas.clear();
        for (const data of this._datasArray) {
            this._datas.set(data.${firstProperty}.toString(), data);
        }
    }

    public get(row: string | number, col: string): any {
        const data = this.getData(row);
        if (!data) return null;
        
        switch (col) {
${case1Statements}            default: return null;
        }
    }

    public getData(row: string | number): ${sheetName}Data | null {
        if (typeof row === 'string') {
            return this._datas.get(row) || null;
        } else {
            return this._datasArray[row] || null;
        }
    }

    public containsColumnKey(name: string): boolean {
        switch (name) {
${case2Statements}            default: return false;
        }
    }

    public get count(): number {
        return this._datasArray.length;
    }

    public containsKey(key: string): boolean {
        return this._datas.has(key);
    }
}
`;
    
    const classPath = join(projectPath, 'assets/0_Scripts/GameData', `${sheetName}.ts`);
    const classDir = dirname(classPath);
    if (!existsSync(classDir)) {
        mkdirSync(classDir, { recursive: true });
    }
    
    writeFileSync(classPath, template, 'utf8');
    
    return classPath;
}

export function generateGameDataManager(sheetNames: string[], projectPath: string): string {
    // Case 문 생성
    let caseStatements = '';
    for (const sheetName of sheetNames) {
        caseStatements += `        case '${sheetName}':\n`;
        caseStatements += `            const d_${sheetName} = new ${sheetName}();\n`;
        caseStatements += `            d_${sheetName}.init(data);\n`;
        caseStatements += `            return d_${sheetName};\n`;
    }
    
    // Import 문 생성
    let importStatements = '';
    for (const sheetName of sheetNames) {
        importStatements += `import { ${sheetName} } from './GameData/${sheetName}';\n`;
    }
    
    
    // LocalData 로드 생성 (비동기 로드 - 병렬 처리)
    let loadStatements = '';

    if (sheetNames.length === 0) {
        loadStatements = `        if (complete) complete();\n`;
    } else {
        loadStatements += `        let loadedCount = 0;\n`;
        loadStatements += `        const totalCount = ${sheetNames.length};\n`;
        loadStatements += `        \n`;
        loadStatements += `        const checkComplete = () => {\n`;
        loadStatements += `            loadedCount++;\n`;
        loadStatements += `            if (loadedCount >= totalCount) {\n`;
        loadStatements += `                if (complete) complete();\n`;
        loadStatements += `            }\n`;
        loadStatements += `        };\n`;
        loadStatements += `        \n`;

        for (const sheetName of sheetNames) {
            loadStatements += `        resources.load('json/${sheetName}', JsonAsset, (err, asset) => {\n`;
            loadStatements += `            if (err) {\n`;
            loadStatements += `                console.error('${sheetName} 리소스 로드 실패:', err);\n`;
            loadStatements += `                checkComplete();\n`;
            loadStatements += `                return;\n`;
            loadStatements += `            }\n`;
            loadStatements += `            \n`;
            loadStatements += `            if (asset) {\n`;
            loadStatements += `                console.log('${sheetName} 리소스 로드 성공:', asset);\n`;
            loadStatements += `                const ${sheetName}Table = new ${sheetName}();\n`;
            loadStatements += `                ${sheetName}Table.init(JSON.stringify(asset.json));\n`;
            loadStatements += `                manager._tables.set('${sheetName}', ${sheetName}Table);\n`;
            loadStatements += `                console.log('${sheetName} 테이블 생성 완료, 데이터 개수:', ${sheetName}Table.count);\n`;
            loadStatements += `            } else {\n`;
            loadStatements += `                console.warn('${sheetName} 리소스를 찾을 수 없습니다.');\n`;
            loadStatements += `            }\n`;
            loadStatements += `            \n`;
            loadStatements += `            checkComplete();\n`;
            loadStatements += `        });\n`;
            loadStatements += `        \n`;
        }
    }
    
    const template = `import { _decorator, Component, resources, JsonAsset, Node, director } from 'cc';
${importStatements}const { ccclass, property } = _decorator;

@ccclass('GameDataManager')
export class GameDataManager extends Component {
    private static _instance: GameDataManager | null = null;
    private _tables: Map<string, any> = new Map();

    public static get I(): GameDataManager {
        return GameDataManager.getInstance();
    }

    public static getInstance(): GameDataManager {
        if (!GameDataManager._instance) {
            const node = new Node('GameDataManager');
            GameDataManager._instance = node.addComponent(GameDataManager);
            director.addPersistRootNode(node);
        }
        return GameDataManager._instance;
    }

    // 제네릭 타입 T만으로 테이블 가져오기
    // 사용법: getTable<MobTable>(MobTable) 또는 getTable(MobTable)
    public static getTable<T>(ctor: new () => T): T | null {
        const tableName = (ctor as new () => T).name;
        return GameDataManager.I._tables.get(tableName) || null;
    }

    public static containsTable(tableName: string): boolean {
        return GameDataManager.I._tables.has(tableName);
    }

    public static localAllLoad(complete?: () => void) {
        const manager = GameDataManager.getInstance();
        
${loadStatements}    }

    private getJsonData(tableName: string, data: string): any {
        switch (tableName) {
${caseStatements}            default: return null;
        }
    }
}
`;
    
    const managerPath = join(projectPath, 'assets/Scripts/GameDataManager.ts');
    const managerDir = dirname(managerPath);
    if (!existsSync(managerDir)) {
        mkdirSync(managerDir, { recursive: true });
    }
    
    writeFileSync(managerPath, template, 'utf8');
    
    return managerPath;
}

function convertTypeToTS(type: string): string {
    const typeMap: { [key: string]: string } = {
        'int': 'number',
        'long': 'number',
        'double': 'number',
        'float': 'number',
        'string': 'string',
        'bool': 'boolean'
    };
    
    return typeMap[type.trim()] || 'any';
}

function getDefaultValue(type: string): string {
    switch (type.trim()) {
        case 'int':
        case 'long':
        case 'double':
        case 'float':
            return '0';
        case 'bool':
            return 'false';
        case 'string':
            return "''";
        default:
            return 'null';
    }
}

