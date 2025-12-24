'use strict';

const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs-extra');
const { join, dirname } = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

// Sheets Manager 유틸리티
const SHEETS_DATA_PATH = join(Editor.Project.path, 'extensions/gsheet/data/sheets.json');

function loadSheetsData() {
    if (existsSync(SHEETS_DATA_PATH)) {
        try {
            const data = readFileSync(SHEETS_DATA_PATH, 'utf8');
            return JSON.parse(data);
        } catch (err) {
            console.error('[Google Sheets Manager] 데이터 로드 실패:', err);
            return [];
        }
    }
    return [];
}

function saveSheetsData(sheets) {
    const dir = dirname(SHEETS_DATA_PATH);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    writeFileSync(SHEETS_DATA_PATH, JSON.stringify(sheets, null, 2), 'utf8');
}

function convertToCsvUrl(url) {
    try {
        // URL에서 # 이후 제거
        const cleanUrl = url.split('#')[0];
        const arr = cleanUrl.split('/');
        
        // Unity 코드와 동일한 방식으로 파싱
        // URL 형식: https://docs.google.com/spreadsheets/d/{ID}/edit?gid={GID}
        let urlID = '';
        let gid = '0'; // 기본값
        
        // arr[5]에 ID가 있음
        for (let i = 0; i < arr.length; i++) {
            if (arr[i] === 'd' && i + 1 < arr.length) {
                urlID = arr[i + 1];
                break;
            }
        }
        
        if (!urlID) {
            throw new Error('URL에서 스프레드시트 ID를 찾을 수 없습니다.');
        }
        
        // arr[6]에서 gid 찾기 (Unity 코드와 동일)
        if (arr.length > 6) {
            const f = arr[6].split('gid=');
            if (f.length > 1) {
                // 숫자만 추출
                gid = f[1].replace(/\D/g, '');
            }
        }
        
        // URL 파라미터에서도 확인
        const urlObj = new URL(cleanUrl);
        if (urlObj.searchParams.has('gid')) {
            gid = urlObj.searchParams.get('gid').replace(/\D/g, '');
        }
        
        // #gid= 형식도 확인
        const hashMatch = url.match(/#gid=(\d+)/);
        if (hashMatch) {
            gid = hashMatch[1];
        }
        
        if (!gid || gid === '') {
            gid = '0';
        }
        
        const csvUrl = `https://docs.google.com/spreadsheets/d/${urlID}/export?format=csv&gid=${gid}`;
        console.log('[Google Sheets Manager] 변환된 CSV URL:', csvUrl);
        return csvUrl;
    } catch (err) {
        console.error('[Google Sheets Manager] URL 변환 실패:', err);
        throw new Error('URL 변환 실패: ' + err.message);
    }
}

function downloadCsv(url) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const client = urlObj.protocol === 'https:' ? https : http;
        
        const requestOptions = {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            maxRedirects: 5
        };
        
        const makeRequest = (currentUrl, redirectCount = 0) => {
            if (redirectCount > 5) {
                reject(new Error('너무 많은 리다이렉트'));
                return;
            }
            
            const currentUrlObj = new URL(currentUrl);
            const currentClient = currentUrlObj.protocol === 'https:' ? https : http;
            
            const options = {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            };
            
            const req = currentClient.request(currentUrl, options, (res) => {
                console.log(`[Google Sheets Manager] 응답 상태: ${res.statusCode} ${res.statusMessage}`);
                if (res.headers.location) {
                    console.log(`[Google Sheets Manager] Location 헤더: ${res.headers.location}`);
                }
                
                // 리다이렉트 처리 (301, 302, 307, 308)
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    let redirectUrl = res.headers.location;
                    // HTML 응답에서 리다이렉트 URL 추출 (Google Sheets의 경우)
                    if (redirectUrl.includes('&amp;')) {
                        redirectUrl = redirectUrl.replace(/&amp;/g, '&');
                    }
                    // 상대 경로인 경우 절대 경로로 변환
                    if (!redirectUrl.startsWith('http')) {
                        redirectUrl = new URL(redirectUrl, currentUrl).href;
                    }
                    console.log(`[Google Sheets Manager] 리다이렉트: ${currentUrl} -> ${redirectUrl}`);
                    makeRequest(redirectUrl, redirectCount + 1);
                    return;
                }
                
                // 에러 응답 처리
                if (res.statusCode >= 400) {
                    reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                    return;
                }
                
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk.toString();
                });
                res.on('end', () => {
                    // HTML 응답인지 확인 (에러 페이지 체크)
                    if (data.trim().startsWith('<') || data.includes('<!DOCTYPE') || data.includes('<HTML>')) {
                        console.error('[Google Sheets Manager] HTML 응답 받음:', data.substring(0, 500));
                        
                        // HTML에서 리다이렉트 URL 추출 시도
                        const hrefMatch = data.match(/HREF="([^"]+)"/i) || data.match(/href="([^"]+)"/i);
                        if (hrefMatch && hrefMatch[1]) {
                            let redirectUrl = hrefMatch[1];
                            // &amp;를 &로 변환
                            redirectUrl = redirectUrl.replace(/&amp;/g, '&');
                            console.log(`[Google Sheets Manager] HTML에서 리다이렉트 URL 추출: ${redirectUrl}`);
                            if (redirectCount < 5) {
                                makeRequest(redirectUrl, redirectCount + 1);
                                return;
                            }
                        }
                        
                        reject(new Error('CSV가 아닌 HTML 응답을 받았습니다. URL을 확인해주세요.'));
                        return;
                    }
                    console.log(`[Google Sheets Manager] CSV 다운로드 완료, 크기: ${data.length} bytes`);
                    resolve(data);
                });
            });
            
            req.on('error', (err) => {
                console.error('[Google Sheets Manager] 요청 에러:', err);
                reject(err);
            });
            
            req.end();
        };
        
        makeRequest(url);
    });
}

function parseCsvToJson(csv, sheetName) {
    const lines = csv.replace(/\r/g, '').split('\n');
    if (lines.length < 4) {
        throw new Error('CSV 형식이 올바르지 않습니다.');
    }
    
    const columnNames = lines[0].split(',');
    const types = lines[1].split(',');
    
    const rowKeys = columnNames.slice(1);
    const typeKeys = types.slice(1);
    const keyColumn = columnNames[0]; // 첫 번째 컬럼이 키
    
    // 같은 컬럼 이름이 여러 개 있는지 확인하고 인덱스 매핑
    const columnIndexMap = new Map(); // 컬럼 이름 -> 인덱스 배열
    for (let x = 0; x < rowKeys.length; x++) {
        const colName = rowKeys[x].trim();
        if (colName) {
            if (!columnIndexMap.has(colName)) {
                columnIndexMap.set(colName, []);
            }
            columnIndexMap.get(colName).push(x);
        }
    }
    
    // 같은 키 값을 가진 행들을 그룹화
    const dataMap = new Map();
    
    for (let y = 3; y < lines.length; y++) {
        const row = lines[y].split(',');
        if (!row[0]) continue;
        
        const key = row[0].trim();
        
        if (!dataMap.has(key)) {
            // 새로운 키면 객체 생성
            const dataObj = {};
            dataObj[keyColumn] = key;
            
            // 같은 컬럼 이름이 여러 개 있으면 배열로 처리
            for (const [colName, indices] of columnIndexMap.entries()) {
                if (indices.length === 1) {
                    // 컬럼 이름이 하나면 단일 값
                    const x = indices[0];
                    const value = row[x + 1] || '';
                    dataObj[colName] = convertValue(typeKeys[x], value);
                } else {
                    // 컬럼 이름이 여러 개면 배열
                    const values = [];
                    for (const x of indices) {
                        const value = row[x + 1] || '';
                        values.push(convertValue(typeKeys[x], value));
                    }
                    dataObj[colName] = values;
                }
            }
            
            dataMap.set(key, dataObj);
        } else {
            // 같은 키가 있으면 배열에 추가
            const existingObj = dataMap.get(key);
            
            for (const [colName, indices] of columnIndexMap.entries()) {
                const values = [];
                for (const x of indices) {
                    const value = row[x + 1] || '';
                    values.push(convertValue(typeKeys[x], value));
                }
                
                if (indices.length === 1) {
                    // 단일 컬럼인 경우
                    const value = values[0];
                    if (!existingObj[colName]) {
                        existingObj[colName] = value;
                    } else {
                        if (!Array.isArray(existingObj[colName])) {
                            existingObj[colName] = [existingObj[colName]];
                        }
                        existingObj[colName].push(value);
                    }
                } else {
                    // 여러 컬럼인 경우 (배열)
                    if (!existingObj[colName]) {
                        existingObj[colName] = [];
                    }
                    // 기존 배열에 새 배열의 값들을 추가
                    if (Array.isArray(existingObj[colName])) {
                        existingObj[colName].push(...values);
                    } else {
                        existingObj[colName] = [existingObj[colName], ...values];
                    }
                }
            }
        }
    }
    
    // Map을 배열로 변환
    const datas = Array.from(dataMap.values());
    
    return JSON.stringify({ Datas: datas }, null, 2);
}

function convertValue(type, value) {
    if (!value) {
        switch (type) {
            case 'int':
            case 'long':
            case 'double':
            case 'float':
                return 0;
            default:
                return '';
        }
    }
    
    switch (type) {
        case 'int':
            return parseInt(value) || 0;
        case 'long':
            return parseInt(value) || 0;
        case 'double':
        case 'float':
            return parseFloat(value) || 0;
        case 'string':
            return value;
        default:
            return value;
    }
}

// TypeScript 클래스 생성 유틸리티
function parseCsvHeader(csv) {
    const lines = csv.replace(/\r/g, '').split('\n');
    const columnNames = lines[0].split(',').filter(name => name.trim());
    const types = lines[1].split(',').filter(type => type.trim());
    
    const rowKeys = columnNames.slice(1);
    const typeKeys = types.slice(1);
    const firstProperty = rowKeys[0] || 'id';
    
    return { columnNames, types, rowKeys, typeKeys, firstProperty };
}

function convertTypeToTS(type) {
    const typeMap = {
        'int': 'number',
        'long': 'number',
        'double': 'number',
        'float': 'number',
        'string': 'string',
        'bool': 'boolean'
    };
    
    return typeMap[type.trim()] || 'any';
}

function getDefaultValue(type) {
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

function generateTypeScriptClass(sheetName, csvData, projectPath) {
    const { rowKeys, typeKeys, firstProperty } = parseCsvHeader(csvData);
    
    // 같은 컬럼 이름이 여러 개 있는지 확인하고 인덱스 매핑
    const columnIndexMap = new Map(); // 컬럼 이름 -> 인덱스 배열
    for (let i = 0; i < rowKeys.length; i++) {
        const colName = rowKeys[i].trim();
        if (colName) {
            if (!columnIndexMap.has(colName)) {
                columnIndexMap.set(colName, []);
            }
            columnIndexMap.get(colName).push(i);
        }
    }
    
    // Case 문 생성 (중복 제거)
    let case1Statements = '';
    let case2Statements = '';
    const processedColumns = new Set();
    
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
${properties}}

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
    
    const classPath = join(projectPath, 'assets/Scripts/GameData', `${sheetName}.ts`);
    const classDir = dirname(classPath);
    if (!existsSync(classDir)) {
        mkdirSync(classDir, { recursive: true });
    }
    
    writeFileSync(classPath, template, 'utf8');
    
    return classPath;
}

function generateGameDataManager(sheetNames, projectPath) {
    // Import 문 생성
    let importStatements = '';
    for (const sheetName of sheetNames) {
        importStatements += `import { ${sheetName} } from './GameData/${sheetName}';\n`;
    }
    
    // Case 문 생성
    let caseStatements = '';
    for (const sheetName of sheetNames) {
        caseStatements += `        case '${sheetName}':\n`;
        caseStatements += `            const d_${sheetName} = new ${sheetName}();\n`;
        caseStatements += `            d_${sheetName}.init(data);\n`;
        caseStatements += `            return d_${sheetName};\n`;
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

module.exports = Editor.Panel.define({
    listeners: {
        show() {
            console.log('[Google Sheets Manager] 패널 표시');
        },
        hide() {
            console.log('[Google Sheets Manager] 패널 숨김');
        },
    },
    template: readFileSync(join(__dirname, '../../../static/template/default/index.html'), 'utf-8'),
    style: readFileSync(join(__dirname, '../../../static/style/default/index.css'), 'utf-8'),
    $: {
        sheetName: '#sheetName',
        sheetUrl: '#sheetUrl',
        addBtn: '#addBtn',
        listContainer: '#listContainer',
        downloadAllJson: '#downloadAllJson',
        downloadAllTS: '#downloadAllTS',
    },
    methods: {
        async addSheet() {
            console.log('[Google Sheets Manager] addSheet 메서드 호출');
            
            const sheetNameEl = Array.isArray(this.$.sheetName) ? this.$.sheetName[0] : this.$.sheetName;
            const sheetUrlEl = Array.isArray(this.$.sheetUrl) ? this.$.sheetUrl[0] : this.$.sheetUrl;
            
            const sheetName = sheetNameEl?.value || '';
            const sheetUrl = sheetUrlEl?.value || '';
            
            console.log('[Google Sheets Manager] Sheet Name:', sheetName);
            console.log('[Google Sheets Manager] Sheet URL:', sheetUrl);
            
            if (!sheetName || !sheetUrl) {
                Editor.Dialog.warn('Sheet Name과 URL을 입력해주세요.');
                return;
            }
            
            const sheets = loadSheetsData();
            sheets.push({ name: sheetName, url: sheetUrl });
            saveSheetsData(sheets);
            
            if (sheetNameEl) sheetNameEl.value = '';
            if (sheetUrlEl) sheetUrlEl.value = '';
            
            this.updateList();
        },
        
        removeSheet(index) {
            const sheets = loadSheetsData();
            sheets.splice(index, 1);
            saveSheetsData(sheets);
            this.updateList();
        },
        
        async downloadSheet(index, showDialog = true) {
            const sheets = loadSheetsData();
            const sheet = sheets[index];
            
            // 다운로드 중 다이얼로그는 표시하지 않고 콘솔에만 로그
            console.log(`[Google Sheets Manager] ${sheet.name} 다운로드 시작...`);
            
            try {
                const csvUrl = convertToCsvUrl(sheet.url);
                const csv = await downloadCsv(csvUrl);
                const json = parseCsvToJson(csv, sheet.name);
                
                // JSON 저장
                const jsonPath = join(Editor.Project.path, 'assets/resources/json', `${sheet.name}.json`);
                const jsonDir = join(Editor.Project.path, 'assets/resources/json');
                if (!existsSync(jsonDir)) {
                    mkdirSync(jsonDir, { recursive: true });
                }
                writeFileSync(jsonPath, json, 'utf8');
                
                if (showDialog) {
                    Editor.Dialog.info('다운로드 완료!', { title: 'Google Sheets Manager' });
                }
                Editor.Message.request('asset-db', 'refresh-asset', '');
                
                // 목록 새로고침
                this.updateList();
            } catch (err) {
                if (showDialog) {
                    Editor.Dialog.error('다운로드 실패: ' + err.message, { title: 'Google Sheets Manager' });
                } else {
                    throw err; // downloadAllJson에서 에러 처리하도록
                }
            }
        },
        
        async downloadAllJson() {
            const sheets = loadSheetsData();
            console.log(`[Google Sheets Manager] 모든 JSON 다운로드 시작 (${sheets.length}개)`);
            
            try {
                for (let i = 0; i < sheets.length; i++) {
                    await this.downloadSheet(i, false); // 다이얼로그 표시 안 함
                }
                
                Editor.Dialog.info('모든 다운로드 완료!', { title: 'Google Sheets Manager' });
                Editor.Message.request('asset-db', 'refresh-asset', '');
            } catch (err) {
                Editor.Dialog.error('다운로드 실패: ' + err.message, { title: 'Google Sheets Manager' });
            }
        },
        
        async downloadAllTypeScript() {
            console.log('[Google Sheets Manager] TypeScript 클래스 생성 시작...');
            
            try {
                const projectPath = Editor.Project.path;
                const sheets = loadSheetsData();
                const sheetNames = [];
                
                for (const sheet of sheets) {
                    const csvUrl = convertToCsvUrl(sheet.url);
                    const csv = await downloadCsv(csvUrl);
                    
                    // JSON 저장
                    const json = parseCsvToJson(csv, sheet.name);
                    const jsonPath = join(projectPath, 'assets/resources/json', `${sheet.name}.json`);
                    const jsonDir = join(projectPath, 'assets/resources/json');
                    if (!existsSync(jsonDir)) {
                        mkdirSync(jsonDir, { recursive: true });
                    }
                    writeFileSync(jsonPath, json, 'utf8');
                    
                    // TypeScript 클래스 생성
                    generateTypeScriptClass(sheet.name, csv, projectPath);
                    sheetNames.push(sheet.name);
                }
                
                // GameDataManager 생성
                if (sheetNames.length > 0) {
                    generateGameDataManager(sheetNames, projectPath);
                }
                
                Editor.Dialog.info('TypeScript 클래스 생성 완료!', { title: 'Google Sheets Manager' });
                Editor.Message.request('asset-db', 'refresh-asset', '');
            } catch (err) {
                Editor.Dialog.error('TypeScript 클래스 생성 실패: ' + err.message, { title: 'Google Sheets Manager' });
            }
        },
        
        updateList() {
            const listContainer = Array.isArray(this.$.listContainer) ? this.$.listContainer[0] : this.$.listContainer;
            if (!listContainer) {
                console.error('[Google Sheets Manager] listContainer를 찾을 수 없습니다!');
                return;
            }
            
            const sheets = loadSheetsData();
            listContainer.innerHTML = '';
            
            sheets.forEach((sheet, index) => {
                const div = document.createElement('div');
                div.style.cssText = 'display: flex; align-items: center; margin-bottom: 10px; padding: 10px; background: #252526; border-radius: 4px;';
                
                div.innerHTML = `
                    <span style="flex: 1; margin-right: 10px; font-weight: bold;">${sheet.name}</span>
                    <span style="flex: 2; margin-right: 10px; color: #888; font-size: 12px; overflow: hidden; text-overflow: ellipsis;">${sheet.url}</span>
                    <button class="download-btn" data-index="${index}" style="padding: 5px 10px; background: #0e639c; color: #fff; border: none; cursor: pointer; margin-right: 5px; border-radius: 3px;">Download</button>
                    <button class="remove-btn" data-index="${index}" style="padding: 5px 10px; background: #f00; color: #fff; border: none; cursor: pointer; border-radius: 3px;">X</button>
                `;
                
                listContainer.appendChild(div);
                
                const downloadBtn = div.querySelector('.download-btn');
                const removeBtn = div.querySelector('.remove-btn');
                
                if (downloadBtn) {
                    downloadBtn.addEventListener('click', () => {
                        this.downloadSheet(index);
                    });
                }
                
                if (removeBtn) {
                    removeBtn.addEventListener('click', () => {
                        this.removeSheet(index);
                    });
                }
            });
        },
    },
    ready() {
        console.log('[Google Sheets Manager] 패널 준비 완료');
        console.log('[Google Sheets Manager] this.$:', this.$);
        
        const addBtn = Array.isArray(this.$.addBtn) ? this.$.addBtn[0] : this.$.addBtn;
        const downloadAllJson = Array.isArray(this.$.downloadAllJson) ? this.$.downloadAllJson[0] : this.$.downloadAllJson;
        const downloadAllTS = Array.isArray(this.$.downloadAllTS) ? this.$.downloadAllTS[0] : this.$.downloadAllTS;
        
        console.log('[Google Sheets Manager] addBtn:', addBtn);
        console.log('[Google Sheets Manager] downloadAllJson:', downloadAllJson);
        console.log('[Google Sheets Manager] downloadAllTS:', downloadAllTS);
        
        if (addBtn) {
            console.log('[Google Sheets Manager] addBtn 이벤트 리스너 등록');
            addBtn.addEventListener('click', () => {
                console.log('[Google Sheets Manager] Add 버튼 클릭됨');
                this.addSheet();
            });
        } else {
            console.error('[Google Sheets Manager] addBtn을 찾을 수 없습니다!');
        }
        
        if (downloadAllJson) {
            downloadAllJson.addEventListener('click', () => {
                this.downloadAllJson();
            });
        }
        
        if (downloadAllTS) {
            downloadAllTS.addEventListener('click', () => {
                this.downloadAllTypeScript();
            });
        }
        
        this.updateList();
    },
    beforeClose() {},
    close() {},
});
