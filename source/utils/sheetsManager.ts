import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs-extra';
import { join, dirname } from 'path';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

export interface SheetData {
    name: string;
    url: string;
}

const SHEETS_DATA_PATH = join(Editor.Project.path, 'extensions/gsheet/data/sheets.json');

export function loadSheetsData(): SheetData[] {
    if (existsSync(SHEETS_DATA_PATH)) {
        try {
            const data = readFileSync(SHEETS_DATA_PATH, 'utf8');
            return JSON.parse(data);
        } catch (err) {
            console.error('데이터 로드 실패:', err);
            return [];
        }
    }
    return [];
}

export function saveSheetsData(sheets: SheetData[]) {
    const dir = dirname(SHEETS_DATA_PATH);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    writeFileSync(SHEETS_DATA_PATH, JSON.stringify(sheets, null, 2), 'utf8');
}

export function convertToCsvUrl(url: string): string {
    try {
        const arr = url.split('/');
        const f = arr[6].split('gid=');
        
        const urlID = arr[5];
        const gid = f[1].replace(/\D/g, '');
        
        return `https://docs.google.com/spreadsheets/d/${urlID}/export?format=csv&gid=${gid}`;
    } catch (err: any) {
        throw new Error('URL 변환 실패: ' + err.message);
    }
}

export function downloadCsv(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const client = urlObj.protocol === 'https:' ? https : http;
        
        client.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk.toString();
            });
            res.on('end', () => {
                resolve(data);
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

export function parseCsvToJson(csv: string, sheetName: string): string {
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
    const columnIndexMap = new Map<string, number[]>(); // 컬럼 이름 -> 인덱스 배열
    for (let x = 0; x < rowKeys.length; x++) {
        const colName = rowKeys[x].trim();
        if (colName) {
            if (!columnIndexMap.has(colName)) {
                columnIndexMap.set(colName, []);
            }
            columnIndexMap.get(colName)!.push(x);
        }
    }
    
    // 같은 키 값을 가진 행들을 그룹화
    const dataMap = new Map<string, any>();
    
    for (let y = 3; y < lines.length; y++) {
        const row = lines[y].split(',');
        if (!row[0]) continue;
        
        const key = row[0].trim();
        
        if (!dataMap.has(key)) {
            // 새로운 키면 객체 생성
            const dataObj: any = {};
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
                    const values: any[] = [];
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
            const existingObj = dataMap.get(key)!;
            
            for (const [colName, indices] of columnIndexMap.entries()) {
                const values: any[] = [];
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

function convertValue(type: string, value: string): any {
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

